import secrets
import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from models.database import (
    Entrant, Event, LiveOddsCache, Pick, PlayerCache, PursePosition, get_db
)
from schemas.pool_schemas import (
    ConfirmUploadRequest,
    EntrantLeaderboardRow,
    EntrantPreviewSchema,
    LeaderboardResponse,
    PickDetailSchema,
    PickPreviewSchema,
    UploadPreviewResponse,
)
from services import calculator, excel_parser, player_matcher
from services.purse import build_position_amounts, expected_earnings, make_position_probs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pools", tags=["pools"])

# In-process upload staging: token → ParseResult
# Cleared on confirm or expiry (server restart)
_upload_staging: dict[str, tuple[int, str, excel_parser.ParseResult]] = {}


@router.post("/{event_id}/upload", response_model=UploadPreviewResponse)
async def upload_picks(
    event_id: int,
    pool_type: str = Form(...),   # "marshalek" | "piper"
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Parse an Excel picks file and return a preview for confirmation.
    Does NOT write to DB yet — returns an upload_token to confirm with.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        if pool_type == "marshalek":
            result = excel_parser.parse_marshalek(file_bytes)
        elif pool_type == "piper":
            result = excel_parser.parse_piper(file_bytes)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown pool_type '{pool_type}'")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    upload_token = secrets.token_urlsafe(16)
    _upload_staging[upload_token] = (event_id, pool_type, result)

    return UploadPreviewResponse(
        upload_token=upload_token,
        event_id=event_id,
        pool_type=pool_type,
        entrant_count=len(result.entrants),
        entrants=[
            EntrantPreviewSchema(
                name=e.name,
                picks=[
                    PickPreviewSchema(
                        golfer_name=p.golfer_name,
                        golfer_name_raw=p.golfer_name_raw,
                        group_label=p.group_label,
                        pick_order=p.pick_order,
                    )
                    for p in e.picks
                ],
            )
            for e in result.entrants
        ],
        warnings=result.warnings,
    )


@router.post("/{event_id}/confirm", status_code=201)
def confirm_upload(
    event_id: int,
    body: ConfirmUploadRequest,
    db: Session = Depends(get_db),
):
    """
    Commit a previously uploaded and previewed picks file to the database.
    Clears existing entrants for this event+pool_type before inserting.
    """
    staged = _upload_staging.pop(body.upload_token, None)
    if not staged:
        raise HTTPException(status_code=404, detail="Upload token not found or already used")

    staged_event_id, pool_type, result = staged
    if staged_event_id != event_id:
        raise HTTPException(status_code=400, detail="Upload token does not match event_id")

    # Clear existing entrants for this event + pool_type
    existing = db.query(Entrant).filter_by(event_id=event_id, pool_type=pool_type).all()
    for e in existing:
        db.delete(e)
    db.flush()

    for entrant_data in result.entrants:
        entrant = Entrant(
            event_id=event_id,
            name=entrant_data.name,
            pool_type=pool_type,
        )
        db.add(entrant)
        db.flush()

        for pick_data in entrant_data.picks:
            # Upsert player_cache for name matching
            player = player_matcher.upsert_player(pick_data.golfer_name, db)
            db.add(Pick(
                entrant_id=entrant.id,
                golfer_name=pick_data.golfer_name,
                golfer_name_raw=pick_data.golfer_name_raw,
                group_label=pick_data.group_label,
                pick_order=pick_data.pick_order,
            ))

    db.commit()
    logger.info(f"Committed {len(result.entrants)} entrants for event {event_id} ({pool_type})")
    return {"committed": len(result.entrants), "pool_type": pool_type}


@router.get("/{event_id}/leaderboard", response_model=LeaderboardResponse)
def get_leaderboard(
    event_id: int,
    pool_type: str | None = None,   # filter to specific pool type
    db: Session = Depends(get_db),
):
    """
    Return the full pool leaderboard with all metrics computed.
    Sorted by projected_earnings descending.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    # Build purse position lookup
    purse_rows = [(p.position, p.amount_usd) for p in event.purse_positions]
    position_amounts = build_position_amounts(purse_rows)

    # Load all entrants (optionally filtered by pool_type)
    query = db.query(Entrant).filter_by(event_id=event_id)
    if pool_type:
        query = query.filter_by(pool_type=pool_type)
    entrants = query.all()

    if not entrants:
        return LeaderboardResponse(
            event_id=event_id,
            event_name=event.name,
            pool_type=pool_type or event.pool_type,
            last_refreshed=None,
            entrants=[],
        )

    # Collect all golfer names across all picks
    all_golfer_names: set[str] = set()
    for e in entrants:
        for p in e.picks:
            all_golfer_names.add(p.golfer_name)

    # Load live odds for all relevant players in one query
    odds_map: dict[str, LiveOddsCache] = {}
    last_refreshed: str | None = None
    if all_golfer_names:
        cache_rows = (
            db.query(LiveOddsCache, PlayerCache)
            .join(PlayerCache, LiveOddsCache.player_cache_id == PlayerCache.id)
            .filter(
                LiveOddsCache.event_id == event_id,
                PlayerCache.normalized_name.in_(all_golfer_names),
            )
            .all()
        )
        for odds, player in cache_rows:
            odds_map[player.normalized_name] = odds
            if last_refreshed is None or (odds.fetched_at and odds.fetched_at > last_refreshed):
                last_refreshed = odds.fetched_at

    # Build tie-aware current position amounts.
    # When N players share position P, each earns avg(purse[P..P+N-1]).
    # Query ALL live positions for this event (not just picks) to get true tie counts.
    all_event_positions: list[int] = [
        row.current_pos
        for row in db.query(LiveOddsCache.current_pos)
        .filter(LiveOddsCache.event_id == event_id)
        .all()
        if row.current_pos is not None
    ]
    pos_tie_counts = Counter(all_event_positions)
    tie_position_amounts: dict[int, float] = {}
    for pos, count in pos_tie_counts.items():
        if count <= 1:
            tie_position_amounts[pos] = position_amounts.get(pos, 0.0)
        else:
            total = sum(position_amounts.get(pos + i, 0.0) for i in range(count))
            tie_position_amounts[pos] = total / count

    # Build position_probs for each player
    position_probs: dict[str, dict[int, float]] = {}
    win_probs: dict[str, float] = {}
    for name in all_golfer_names:
        odds = odds_map.get(name)
        if odds:
            probs = make_position_probs(odds.win_pct, odds.top5_pct, odds.top10_pct, odds.top20_pct)
            position_probs[name] = probs
            win_probs[name] = odds.win_pct or 0.0
        else:
            position_probs[name] = {}
            win_probs[name] = 0.0

    # Coverage: count how many entrants have each golfer
    golfer_entrant_count: dict[str, int] = defaultdict(int)
    all_pick_lists: list[list[str]] = []
    for e in entrants:
        picks_list = [p.golfer_name for p in e.picks]
        all_pick_lists.append(picks_list)
        for golfer in picks_list:
            golfer_entrant_count[golfer] += 1

    total_entrants = len(entrants)

    # Build leaderboard rows
    rows: list[EntrantLeaderboardRow] = []
    for idx, entrant in enumerate(entrants):
        picks_list = [p.golfer_name for p in entrant.picks]

        proj_earn = calculator.projected_earnings(picks_list, position_probs, position_amounts)
        winner_odds = calculator.prob_of_having_winner([win_probs[g] for g in picks_list])
        edge = calculator.exclusive_edge_score(picks_list, win_probs, all_pick_lists)

        # Current earnings (non-probability-weighted, just live pos, tie-split)
        curr_earn = sum(
            calculator.current_earnings_from_position(
                odds_map[p.golfer_name].current_pos if p.golfer_name in odds_map else None,
                tie_position_amounts,
            )
            for p in entrant.picks
        )

        pick_details: list[PickDetailSchema] = []
        for pick in sorted(entrant.picks, key=lambda p: p.pick_order):
            odds = odds_map.get(pick.golfer_name)
            pick_probs = position_probs.get(pick.golfer_name, {})
            pick_proj = calculator.projected_earnings([pick.golfer_name], {pick.golfer_name: pick_probs}, position_amounts)
            pick_curr = calculator.current_earnings_from_position(
                odds.current_pos if odds else None,
                tie_position_amounts,
            )
            coverage = (golfer_entrant_count[pick.golfer_name] - 1) / max(1, total_entrants - 1)

            pick_details.append(PickDetailSchema(
                golfer_name=pick.golfer_name,
                golfer_name_raw=pick.golfer_name_raw,
                group_label=pick.group_label,
                pick_order=pick.pick_order,
                current_pos=odds.current_pos if odds else None,
                current_score=odds.current_score if odds else None,
                thru=odds.thru if odds else None,
                win_pct=odds.win_pct if odds else None,
                top5_pct=odds.top5_pct if odds else None,
                projected_earnings_contribution=pick_proj,
                current_earnings_contribution=pick_curr,
                coverage_pct=coverage,
                dk_win_odds=odds.dk_win_odds if odds else None,
            ))

        rows.append(EntrantLeaderboardRow(
            entrant_id=entrant.id,
            name=entrant.name,
            pool_type=entrant.pool_type,
            projected_earnings=proj_earn,
            current_earnings=curr_earn,
            odds_of_having_winner=winner_odds,
            exclusive_edge_score=edge,
            picks=pick_details,
        ))

    rows.sort(key=lambda r: r.projected_earnings, reverse=True)

    return LeaderboardResponse(
        event_id=event_id,
        event_name=event.name,
        pool_type=pool_type or event.pool_type,
        last_refreshed=last_refreshed,
        entrants=rows,
    )
