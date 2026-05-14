"""
Scrape per-event purse payout breakdowns from ESPN Golf (reliable, no JS-render needed).
Falls back to standard PGA percentages from purses.json if scraping fails.

ESPN purse pages use a consistent table format:
  https://www.espn.com/golf/leaderboard/_/tournamentId/{id}
but for purse specifically we use:
  https://www.espn.com/golf/leaderboard
with event param, or scrape PGA Tour's own purse API.

PGA Tour has an undocumented stats API that returns purse breakdown:
  https://www.pgatour.com/tournaments/{year}/{tournament-slug}/purse
We try this first, fall back to ESPN, then fall back to hardcoded percentages.
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

_PURSES_JSON = Path(__file__).parent.parent / "data" / "purses.json"


@dataclass
class PursePosition:
    position: int
    pct: float
    amount_usd: float


def load_fallback_pcts() -> list[dict]:
    data = json.loads(_PURSES_JSON.read_text())
    return data["fallback_payout_pcts"]


async def fetch_purse_breakdown(
    purse_usd: int,
    tour_event: str,
    start_date: str,
) -> list[PursePosition]:
    """
    Fetch actual per-position payout for this event.
    Tries PGA Tour stats API first, then ESPN, then falls back to standard %.

    Returns positions 1..N with pct and dollar amount.
    The dollar amounts are authoritative from the source when available,
    otherwise computed as purse_usd * pct.
    """
    year = start_date[:4]

    # Try PGA Tour stats endpoint (JSON, most reliable)
    result = await _try_pga_tour_purse(tour_event, year, purse_usd)
    if result and _is_valid_purse(result, purse_usd):
        logger.info(f"Fetched purse from PGA Tour for {tour_event} {year}: {len(result)} positions")
        return result

    # Try ESPN leaderboard (HTML table)
    result = await _try_espn_purse(tour_event, year, purse_usd)
    if result and _is_valid_purse(result, purse_usd):
        logger.info(f"Fetched purse from ESPN for {tour_event} {year}: {len(result)} positions")
        return result

    # Fall back to standard PGA percentages
    logger.warning(
        f"Could not scrape purse for {tour_event} {year} — using fallback payout percentages"
    )
    return _build_from_fallback_pcts(purse_usd)


async def _try_pga_tour_purse(
    tour_event: str, year: str, purse_usd: int
) -> list[PursePosition] | None:
    """
    PGA Tour has a GraphQL / REST endpoint for purse data.
    The /tournaments/{year}/{slug}/purse page renders a table we can parse.
    """
    slug_map = {
        "masters": "masters-tournament",
        "players": "the-players-championship",
        "pga": "pga-championship",
        "us_open": "us-open",
        "open": "the-open-championship",
    }
    slug = slug_map.get(tour_event)
    if not slug:
        return None

    url = f"https://www.pgatour.com/tournaments/{year}/{slug}/purse"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            return None
        return _parse_pga_tour_purse_html(resp.text, purse_usd, slug)
    except httpx.HTTPError as exc:
        logger.warning(f"PGA Tour purse fetch failed: {exc}")
        return None


def _parse_pga_tour_purse_html(
    html: str, purse_usd: int, expected_slug: str
) -> list[PursePosition] | None:
    """
    Parse purse data from the embedded Next.js __NEXT_DATA__ JSON blob on
    pgatour.com/tournaments/{year}/{slug}/purse. The page renders whatever
    tournament PGA Tour considers "current" when the requested one isn't
    populated yet, so we verify the tournament identity before trusting the
    payouts.
    """
    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None

    tournament = data.get("props", {}).get("pageProps", {}).get("tournament", {})
    actual_name = (tournament.get("tournamentName") or "").lower().replace(" ", "-")
    if expected_slug not in actual_name and actual_name not in expected_slug:
        logger.info(
            f"PGA Tour returned different tournament: expected '{expected_slug}', "
            f"got '{tournament.get('tournamentName')}' — skipping"
        )
        return None

    pairs = re.findall(
        r'"position":"?(\d{1,3})"?[^{}]{0,200}?"purse":"\$([\d,]+)"',
        m.group(1),
    )
    if not pairs:
        return None

    pos_amounts: dict[int, float] = {}
    for pos_str, amount_str in pairs:
        pos = int(pos_str)
        amount = float(amount_str.replace(",", ""))
        if pos not in pos_amounts or amount > pos_amounts[pos]:
            pos_amounts[pos] = amount

    if len(pos_amounts) < 10:
        return None

    return [
        PursePosition(
            position=pos,
            pct=amount / purse_usd if purse_usd > 0 else 0.0,
            amount_usd=amount,
        )
        for pos, amount in sorted(pos_amounts.items())
    ]


async def _try_espn_purse(
    tour_event: str, year: str, purse_usd: int
) -> list[PursePosition] | None:
    """
    ESPN leaderboard page includes a purse/earnings column in its HTML that
    we can parse for position → dollar amount.
    """
    espn_id_map = {
        ("masters", "2026"): "401580358",
        ("players", "2026"): "401580350",
        ("pga", "2026"): "401811947",
        ("us_open", "2026"): "401580370",
        ("open", "2026"): "401580375",
    }
    espn_id = espn_id_map.get((tour_event, year))
    if not espn_id:
        logger.warning(f"No ESPN ID mapping for {tour_event} {year}")
        return None

    url = f"https://www.espn.com/golf/leaderboard/_/tournamentId/{espn_id}"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            return None
        return _parse_espn_purse_html(resp.text, purse_usd)
    except httpx.HTTPError as exc:
        logger.warning(f"ESPN purse fetch failed: {exc}")
        return None


def _parse_espn_purse_html(html: str, purse_usd: int) -> list[PursePosition] | None:
    """
    ESPN leaderboard table includes earnings per player.
    Extract position → earnings, deduplicate tied positions by taking max amount.
    """
    # Match rows with position and dollar amount
    matches = re.findall(
        r'<td[^>]*>\s*(\d+)\s*</td>.*?\$([\d,]+)',
        html,
        re.DOTALL,
    )
    if not matches:
        return None

    pos_amounts: dict[int, float] = {}
    for pos_str, amount_str in matches:
        pos = int(pos_str)
        amount = float(amount_str.replace(",", ""))
        if pos not in pos_amounts or amount > pos_amounts[pos]:
            pos_amounts[pos] = amount

    if len(pos_amounts) < 10:
        return None

    positions = [
        PursePosition(
            position=pos,
            pct=amount / purse_usd if purse_usd > 0 else 0.0,
            amount_usd=amount,
        )
        for pos, amount in sorted(pos_amounts.items())
    ]
    return positions


def _is_valid_purse(positions: list[PursePosition], purse_usd: int) -> bool:
    """
    Sanity-check scraped purse data before accepting it.
    Rejects if: positions out of order, position 0 exists, 1st-place < 10% of purse,
    or total pct sum is implausible.
    """
    if not positions or len(positions) < 20:
        return False
    sorted_pos = sorted(positions, key=lambda p: p.position)
    # Position 1 must exist and have the largest payout
    if sorted_pos[0].position != 1:
        return False
    # 1st place should be at least 10% of purse
    if sorted_pos[0].pct < 0.10:
        return False
    # 1st place must be greater than 2nd place
    if len(sorted_pos) > 1 and sorted_pos[0].amount_usd <= sorted_pos[1].amount_usd:
        return False
    # Total pct should be between 70% and 110%
    total_pct = sum(p.pct for p in positions)
    if not (0.70 <= total_pct <= 1.10):
        return False
    return True


def _build_from_fallback_pcts(purse_usd: int) -> list[PursePosition]:
    fallback = load_fallback_pcts()
    return [
        PursePosition(
            position=entry["position"],
            pct=entry["pct"],
            amount_usd=round(purse_usd * entry["pct"]),
        )
        for entry in fallback
    ]
