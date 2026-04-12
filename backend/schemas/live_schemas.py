from pydantic import BaseModel


class PlayerOddsSchema(BaseModel):
    normalized_name: str
    datagolf_name: str | None
    dk_name: str | None
    current_pos: int | None
    current_score: int | None
    thru: str | None
    win_pct: float | None
    top5_pct: float | None
    top10_pct: float | None
    top20_pct: float | None
    dk_win_odds: int | None
    fetched_at: str


class LiveOddsResponse(BaseModel):
    event_id: int
    players: list[PlayerOddsSchema]
    fetched_at: str | None


class RefreshSummary(BaseModel):
    event_id: int
    players_matched: int
    players_unmatched: int
    unmatched_names: list[str]
    datagolf_ok: bool
    draftkings_ok: bool
    fetched_at: str
