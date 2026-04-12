# Golf Pool Tracker

Live standings dashboard for Marshalek and Piper golf major pools.

## Quick Start

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:3000

---

## First-Time Setup

### 1. Create an event

```bash
curl -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "name": "2026 Masters Tournament",
    "slug": "masters-2026",
    "pool_type": "both",
    "tour_event": "masters",
    "purse_usd": 20000000,
    "start_date": "2026-04-09",
    "dk_event_slug": "us-masters"
  }'
```

This scrapes the actual purse payout breakdown from PGA Tour / ESPN automatically.

### 2. Activate the event (starts live refresh loop)

```bash
curl -X PATCH http://localhost:8000/api/v1/events/1/activate
```

### 3. Upload picks

In the UI: click "Upload Picks" in either pool tab, select the Excel file, confirm.

Or via curl:
```bash
# Marshalek
curl -X POST http://localhost:8000/api/v1/pools/1/upload \
  -F "pool_type=marshalek" \
  -F "file=@/path/to/MP\ 2026\ Masters\ Pre-Event.xlsx"

# Then confirm with the returned upload_token
curl -X POST http://localhost:8000/api/v1/pools/1/confirm \
  -H "Content-Type: application/json" \
  -d '{"upload_token": "TOKEN_HERE"}'
```

### 4. Refresh live odds

```bash
curl -X POST http://localhost:8000/api/v1/live/1/refresh
```

Background auto-refresh runs every 15 minutes once the event is active.

---

## Pool Rules

| Pool | Picks per entrant | Payout positions | Events |
|------|-------------------|------------------|--------|
| Marshalek | 5 golfers | Top 4 | Masters + Players Championship |
| Piper | 10 golfers (5 groups A-E) | Top 3 | All 4 majors |

## Metrics

- **Proj. $** — Expected tournament earnings summed across all picks, weighted by finish-position probabilities
- **Live $** — Actual earnings at current live standings (no probability weighting)
- **Win Odds** — Probability at least one of this entrant's picks wins: `1 - Π(1 - win%ᵢ)`
- **Edge** — Unique upside: `Σ win%ᵢ × (1 - coverage%)` — picks that could pay off that others don't hold

## Data Sources

- **DataGolf** `datagolf.com/live-model/pga-tour` — win%, top5%, top10%, top20% probabilities
- **DraftKings** `sportsbook.draftkings.com/leagues/golf/{event}` — Vegas win odds
- **PGA Tour / ESPN** — Per-event purse payout breakdown (scraped at event creation)
