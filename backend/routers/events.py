import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import Event, PursePosition, get_db
from schemas.event_schemas import EventCreateRequest, EventListItem, EventResponse, PursePositionSchema
from services.purse_scraper import fetch_purse_breakdown

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventListItem])
def list_events(db: Session = Depends(get_db)):
    events = db.query(Event).order_by(Event.start_date.desc()).all()
    return [
        EventListItem(
            id=e.id,
            name=e.name,
            slug=e.slug,
            pool_type=e.pool_type,
            tour_event=e.tour_event,
            purse_usd=e.purse_usd,
            start_date=e.start_date,
            is_active=e.is_active,
        )
        for e in events
    ]


@router.post("", response_model=EventResponse, status_code=201)
async def create_event(body: EventCreateRequest, db: Session = Depends(get_db)):
    existing = db.query(Event).filter_by(slug=body.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Event with slug '{body.slug}' already exists")

    event = Event(
        name=body.name,
        slug=body.slug,
        pool_type=body.pool_type,
        tour_event=body.tour_event,
        purse_usd=body.purse_usd,
        start_date=body.start_date,
        is_active=False,
        dk_event_slug=body.dk_event_slug,
    )
    db.add(event)
    db.flush()  # get event.id

    # Fetch per-event purse breakdown (scraped, not standard %)
    purse_rows = await fetch_purse_breakdown(
        purse_usd=body.purse_usd,
        tour_event=body.tour_event,
        start_date=body.start_date,
    )

    for row in purse_rows:
        db.add(PursePosition(
            event_id=event.id,
            position=row.position,
            pct=row.pct,
            amount_usd=row.amount_usd,
        ))

    db.commit()
    db.refresh(event)
    logger.info(f"Created event '{event.name}' with {len(purse_rows)} purse positions")

    return _to_response(event)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return _to_response(event)


@router.patch("/{event_id}/activate", response_model=EventResponse)
async def activate_event(event_id: int, db: Session = Depends(get_db)):
    """
    Set this event as active (is_active=True), deactivate others,
    and immediately start the background 15-min refresh loop.
    """
    from routers import live as live_router

    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    # Deactivate all others and cancel their loops
    other_events = db.query(Event).filter(Event.id != event_id).all()
    for other in other_events:
        other.is_active = False
        task = live_router._refresh_tasks.get(other.id)
        if task and not task.done():
            task.cancel()

    event.is_active = True
    db.commit()
    db.refresh(event)

    # Cancel existing loop for this event if any, then start fresh
    existing = live_router._refresh_tasks.get(event_id)
    if existing and not existing.done():
        existing.cancel()

    task = asyncio.create_task(live_router._refresh_loop(event_id, event.dk_event_slug))
    live_router._refresh_tasks[event_id] = task

    logger.info(f"Activated event '{event.name}' and started refresh loop")
    return _to_response(event)


@router.get("/{event_id}/purse", response_model=list[PursePositionSchema])
def get_purse(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return [
        PursePositionSchema(position=p.position, pct=p.pct, amount_usd=p.amount_usd)
        for p in sorted(event.purse_positions, key=lambda x: x.position)
    ]


def _to_response(event: Event) -> EventResponse:
    return EventResponse(
        id=event.id,
        name=event.name,
        slug=event.slug,
        pool_type=event.pool_type,
        tour_event=event.tour_event,
        purse_usd=event.purse_usd,
        start_date=event.start_date,
        is_active=event.is_active,
        dk_event_slug=event.dk_event_slug,
        purse_positions=[
            PursePositionSchema(position=p.position, pct=p.pct, amount_usd=p.amount_usd)
            for p in sorted(event.purse_positions, key=lambda x: x.position)
        ],
    )
