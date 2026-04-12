# Golf Pool Tracker

## Problem

No live way to track standings across entrants during a golf major tournament pool. Picks come in via Excel spreadsheets, but there's no dashboard to see projected earnings, winner odds, or edge metrics while the tournament is live.

## Approach

- FastAPI backend: parse Excel picks, scrape DataGolf + DraftKings for live odds, compute pool metrics
- Next.js 15 frontend: two-tab dashboard (Marshalek / Piper), sortable entrant leaderboard, expandable pick rows, live data refresh
- SQLite for persistence (personal use, no migration overhead)
- Playwright for scraping (no API keys required)

## Key Decisions

- SQLite over PostgreSQL: single-user personal tool, zero infra overhead
- Playwright scraping over API keys: DataGolf live model page + DraftKings scraped directly
- Metrics computed server-side in leaderboard endpoint, frontend stays dumb
- Position probability approximation: DataGolf gives top-N bands, distribute evenly within each band
- Sort default: projected earnings (sum of expected tournament earnings across all picks)

## Definition of Done

- **Correctness**: Upload both Excel files → entrants parsed correctly → projected earnings update on live refresh
- **Tests**: pytest for calculator.py and excel_parser.py; tsc --noEmit passes
- **Security**: No secrets in code; .env for future API keys; ORM-only DB access
- **Observability**: Unmatched names surfaced in upload UI; scraper errors return 503; refresh logs to stdout
- **Rollback**: SQLite file deletable and re-seeded from Excel; no external state

## Out of Scope (v1)

- Auth (personal use only)
- Historical / season-long tracking
- Push notifications
- Automated Excel ingestion
- Mobile app

## Amendment: Per-Event Purse Scraping

Not all PGA Tour events use the same payout % structure (Masters, The Open, etc. have their own structures). Add `services/purse_scraper.py` that scrapes the actual purse breakdown per event from the PGA Tour site (`pgatour.com/tournaments/.../purse`). `purses.json` stores only the known event purse totals as fallback reference; the actual position-by-position payouts are fetched and stored in `purse_positions` table at event creation time.

## Progress Log

- 2026-04-11: Initial build started. Excel file structure confirmed from openpyxl inspection.
  - Marshalek: "Picks" sheet, col A = entrant, cols B-F = picks (Last, First format), ~81 entrants
  - Piper: "Player Selection Sheet" = matrix with "x" marks, also "Sheet1" = raw form responses (A-1..E-2 labels)
