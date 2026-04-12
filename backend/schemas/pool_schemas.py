from pydantic import BaseModel


class PickPreviewSchema(BaseModel):
    golfer_name: str
    golfer_name_raw: str
    group_label: str | None
    pick_order: int


class EntrantPreviewSchema(BaseModel):
    name: str
    picks: list[PickPreviewSchema]


class UploadPreviewResponse(BaseModel):
    upload_token: str
    event_id: int
    pool_type: str
    entrant_count: int
    entrants: list[EntrantPreviewSchema]
    warnings: list[str]


class ConfirmUploadRequest(BaseModel):
    upload_token: str


class PickDetailSchema(BaseModel):
    golfer_name: str
    golfer_name_raw: str
    group_label: str | None
    pick_order: int
    current_pos: int | None
    current_score: int | None      # strokes to par
    thru: str | None
    win_pct: float | None
    top5_pct: float | None
    projected_earnings_contribution: float
    current_earnings_contribution: float
    coverage_pct: float            # fraction of other entrants with this pick
    dk_win_odds: int | None        # American odds


class EntrantLeaderboardRow(BaseModel):
    entrant_id: int
    name: str
    pool_type: str
    projected_earnings: float
    current_earnings: float        # non-probability-weighted, live position only
    odds_of_having_winner: float   # 0.0 - 1.0
    exclusive_edge_score: float
    picks: list[PickDetailSchema]


class LeaderboardResponse(BaseModel):
    event_id: int
    event_name: str
    pool_type: str
    last_refreshed: str | None     # ISO timestamp of last live odds fetch
    entrants: list[EntrantLeaderboardRow]
