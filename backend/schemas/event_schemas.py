from pydantic import BaseModel


class PursePositionSchema(BaseModel):
    position: int
    pct: float
    amount_usd: float


class EventCreateRequest(BaseModel):
    name: str
    slug: str
    pool_type: str                 # "marshalek" | "piper" | "both"
    tour_event: str                # "masters" | "players" | "pga" | "us_open" | "open"
    purse_usd: int
    start_date: str                # ISO date string "2026-04-09"
    dk_event_slug: str | None = None


class EventResponse(BaseModel):
    id: int
    name: str
    slug: str
    pool_type: str
    tour_event: str
    purse_usd: int
    start_date: str
    is_active: bool
    dk_event_slug: str | None
    purse_positions: list[PursePositionSchema]


class EventListItem(BaseModel):
    id: int
    name: str
    slug: str
    pool_type: str
    tour_event: str
    purse_usd: int
    start_date: str
    is_active: bool
