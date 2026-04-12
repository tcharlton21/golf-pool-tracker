# Quality Grades

Last updated: 2026-04-11

| Domain | Grade | Notes |
|--------|-------|-------|
| Events / Purse | B | Purse payout % scraped per event from PGA Tour site; amounts derived correctly |
| Excel Parsing | B | Both formats handled; Piper matrix detection is heuristic-based |
| Name Matching | B | rapidfuzz threshold 85 + KNOWN_ALIASES; edge cases logged, not crashing |
| Live Scrapers | C | Playwright scraping fragile to selector changes; no retry logic yet |
| Metrics / Calculator | A | Pure functions, well-tested, math is straightforward |
| Frontend | B | SWR polling, Zod validation, no global state needed |
| Tests | C | Unit tests for calculator + parser; no integration tests yet |
