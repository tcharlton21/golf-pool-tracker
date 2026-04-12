# Architecture

## System Overview

```
browser (localhost:3000)
    │  SWR polling every 60s
    ▼
Next.js 15 (App Router)
    │  fetch
    ▼
FastAPI (localhost:8000/api/v1)
    ├── routers/events.py      — event + purse management
    ├── routers/pools.py       — Excel upload + pick storage + leaderboard
    └── routers/live.py        — live odds refresh + cache read
         │
         ├── services/excel_parser.py    — openpyxl, two formats
         ├── services/player_matcher.py  — name normalization + rapidfuzz
         ├── services/datagolf.py        — Playwright scraper
         ├── services/draftkings.py      — Playwright scraper
         ├── services/calculator.py      — pure math (no DB)
         └── services/purse.py           — purse lookup table
              │
              └── SQLite (golf.db)
                   ├── events
                   ├── purse_positions
                   ├── entrants
                   ├── picks
                   ├── player_cache
                   └── live_odds_cache
```

## Layer Dependencies

```
routers → services → models (read-only via Session)
routers → schemas (Pydantic I/O)
services/calculator.py — no DB access, pure functions
services/purse.py      — reads data/purses.json, no DB
```

## Domain Map

| Domain | Files | Responsibility |
|--------|-------|---------------|
| Events | routers/events.py, models/database.py | Create/manage tournament events with purse data |
| Picks | routers/pools.py, services/excel_parser.py | Parse Excel, store entrant picks |
| Live Data | routers/live.py, services/datagolf.py, services/draftkings.py | Scrape + cache live odds |
| Metrics | services/calculator.py | Compute projected earnings, winner odds, edge score |
| Name Matching | services/player_matcher.py | Normalize names across sources |

## Data Flow: Leaderboard Request

1. Frontend polls `GET /pools/{event_id}/leaderboard`
2. Router queries `entrants` + `picks` for the event
3. Router queries `live_odds_cache` for all players in those picks
4. Router calls `calculator.py` functions for each entrant
5. Router sorts entrants by `projected_earnings` desc
6. Returns `LeaderboardResponse` — frontend renders without further computation

## Data Flow: Live Refresh

1. Background task (or manual POST) triggers refresh
2. `datagolf.py` — Playwright scrapes live model page → `list[PlayerProbDTO]`
3. `draftkings.py` — Playwright scrapes sportsbook → `list[DKOddsDTO]`
4. `player_matcher.py` — matches each player name to `player_cache` row
5. Upserts `live_odds_cache` rows for the event
6. Returns match summary (matched count / unmatched names)
