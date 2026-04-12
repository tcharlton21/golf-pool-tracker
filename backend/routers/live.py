import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from models.database import Event, LiveOddsCache, PlayerCache, get_db, SessionLocal
from schemas.live_schemas import LiveOddsResponse, PlayerOddsSchema, RefreshSummary
from services import datagolf, draftkings, player_matcher
from services.calculator import american_to_prob

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/live", tags=["live"])
limiter = Limiter(key_func=get_remote_address)

# Track running background refresh tasks per event
_refresh_tasks: dict[int, asyncio.Task] = {}


@router.get("/{event_id}/odds", response_model=LiveOddsResponse)
def get_live_odds(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    rows = (
        db.query(LiveOddsCache, PlayerCache)
        .join(PlayerCache, LiveOddsCache.player_cache_id == PlayerCache.id)
        .filter(LiveOddsCache.event_id == event_id)
        .all()
    )

    players = [
        PlayerOddsSchema(
            normalized_name=player.normalized_name,
            datagolf_name=player.datagolf_name,
            dk_name=player.dk_name,
            current_pos=odds.current_pos,
            current_score=odds.current_score,
            thru=odds.thru,
            win_pct=odds.win_pct,
            top5_pct=odds.top5_pct,
            top10_pct=odds.top10_pct,
            top20_pct=odds.top20_pct,
            dk_win_odds=odds.dk_win_odds,
            fetched_at=odds.fetched_at,
        )
        for odds, player in rows
    ]

    latest_fetch = max((p.fetched_at for p in players), default=None)
    return LiveOddsResponse(event_id=event_id, players=players, fetched_at=latest_fetch)


@router.post("/{event_id}/refresh", response_model=RefreshSummary)
@limiter.limit("2/minute")
async def refresh_live_odds(request: Request, event_id: int, db: Session = Depends(get_db)):
    """
    Trigger a manual live odds refresh. Scrapes DataGolf and DraftKings.
    Rate limited to 2 requests per minute per IP.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    return await _do_refresh(event_id, event.dk_event_slug, db)


@router.post("/{event_id}/start-refresh-loop")
async def start_refresh_loop(
    event_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Start background 15-minute refresh loop for this event.
    Cancels any existing loop first.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    if event_id in _refresh_tasks and not _refresh_tasks[event_id].done():
        _refresh_tasks[event_id].cancel()

    task = asyncio.create_task(_refresh_loop(event_id, event.dk_event_slug))
    _refresh_tasks[event_id] = task
    logger.info(f"Started refresh loop for event {event_id}")
    return {"status": "refresh loop started", "event_id": event_id}


@router.post("/{event_id}/stop-refresh-loop")
def stop_refresh_loop(event_id: int):
    task = _refresh_tasks.get(event_id)
    if task and not task.done():
        task.cancel()
        logger.info(f"Stopped refresh loop for event {event_id}")
        return {"status": "stopped", "event_id": event_id}
    return {"status": "no active loop", "event_id": event_id}


async def _refresh_loop(event_id: int, dk_event_slug: str | None) -> None:
    """Background task: refresh every 15 minutes while running."""
    while True:
        db = SessionLocal()
        try:
            await _do_refresh(event_id, dk_event_slug, db)
        except Exception as exc:
            logger.error(f"Refresh loop error for event {event_id}: {exc}")
        finally:
            db.close()
        await asyncio.sleep(900)  # 15 minutes


async def _do_refresh(
    event_id: int,
    dk_event_slug: str | None,
    db: Session,
) -> RefreshSummary:
    """
    Scrape DataGolf and DraftKings concurrently, match player names,
    upsert live_odds_cache rows.
    """
    fetched_at = datetime.now(timezone.utc).isoformat()
    unmatched_names: list[str] = []
    datagolf_ok = False
    draftkings_ok = False
    players_matched = 0

    # Run both scrapers concurrently
    dg_result, dk_result = await asyncio.gather(
        _safe_scrape_datagolf(),
        _safe_scrape_draftkings(dk_event_slug),
        return_exceptions=False,
    )

    dg_players, dg_error = dg_result
    dk_players, dk_error = dk_result

    if dg_error:
        logger.error(f"DataGolf scrape failed: {dg_error}")
    else:
        datagolf_ok = True

    if dk_error:
        logger.error(f"DraftKings scrape failed: {dk_error}")
    else:
        draftkings_ok = True

    # Build DK odds lookup: normalized_name → american_odds
    dk_odds_by_name: dict[str, int] = {}
    if dk_players:
        for dk_player in dk_players:
            matched = player_matcher.match_dk_name(dk_player.player_name, db)
            if matched:
                dk_odds_by_name[matched.normalized_name] = dk_player.american_odds
            else:
                unmatched_names.append(f"DK:{dk_player.player_name}")

    # Upsert live_odds_cache from DataGolf data
    if dg_players:
        for dg_player in dg_players:
            if not dg_player.player_name:
                continue

            matched = player_matcher.match_datagolf_name(dg_player.player_name, db)
            if not matched:
                unmatched_names.append(f"DG:{dg_player.player_name}")
                continue

            players_matched += 1
            dk_odds = dk_odds_by_name.get(matched.normalized_name)

            existing = (
                db.query(LiveOddsCache)
                .filter_by(event_id=event_id, player_cache_id=matched.id)
                .first()
            )
            if existing:
                existing.win_pct = dg_player.win_pct
                existing.top5_pct = dg_player.top5_pct
                existing.top10_pct = dg_player.top10_pct
                existing.top20_pct = dg_player.top20_pct
                existing.current_pos = dg_player.current_pos
                existing.current_score = dg_player.current_score
                existing.thru = dg_player.thru
                existing.missed_cut = dg_player.missed_cut
                existing.dk_win_odds = dk_odds
                existing.fetched_at = fetched_at
            else:
                db.add(LiveOddsCache(
                    event_id=event_id,
                    player_cache_id=matched.id,
                    win_pct=dg_player.win_pct,
                    top5_pct=dg_player.top5_pct,
                    top10_pct=dg_player.top10_pct,
                    top20_pct=dg_player.top20_pct,
                    current_pos=dg_player.current_pos,
                    current_score=dg_player.current_score,
                    thru=dg_player.thru,
                    missed_cut=dg_player.missed_cut,
                    dk_win_odds=dk_odds,
                    fetched_at=fetched_at,
                ))

    # If DataGolf failed but DK succeeded, still upsert DK odds for already-cached players
    elif dk_players:
        for normalized_name, american_odds in dk_odds_by_name.items():
            player = db.query(PlayerCache).filter_by(normalized_name=normalized_name).first()
            if not player:
                continue
            existing = (
                db.query(LiveOddsCache)
                .filter_by(event_id=event_id, player_cache_id=player.id)
                .first()
            )
            if existing:
                existing.dk_win_odds = american_odds
                existing.fetched_at = fetched_at
                players_matched += 1

    db.commit()
    logger.info(
        f"Refresh complete for event {event_id}: "
        f"{players_matched} matched, {len(unmatched_names)} unmatched"
    )

    return RefreshSummary(
        event_id=event_id,
        players_matched=players_matched,
        players_unmatched=len(unmatched_names),
        unmatched_names=unmatched_names,
        datagolf_ok=datagolf_ok,
        draftkings_ok=draftkings_ok,
        fetched_at=fetched_at,
    )


async def _safe_scrape_datagolf() -> tuple[list | None, str | None]:
    try:
        players = await datagolf.scrape_live_model()
        return players, None
    except Exception as exc:
        return None, str(exc)


async def _safe_scrape_draftkings(
    event_slug: str | None,
) -> tuple[list | None, str | None]:
    if not event_slug:
        return None, "No DraftKings event slug configured for this event"
    try:
        players = await draftkings.scrape_winner_odds(event_slug)
        return players, None
    except Exception as exc:
        return None, str(exc)
