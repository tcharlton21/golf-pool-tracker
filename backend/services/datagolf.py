"""
DataGolf live model data via JSONP API endpoints (no Playwright needed).

Endpoints (letzig.datagolf.com):
  GET /live-model/get-main-data/mini
      Response: {"active": ["pga"], "pga": {"lb": [{"d":..,"f":"Rory","l":"McIlroy","p":"1","s":"-12","t":7,"w":"59.0%"}, ...]}}
      - lb = live leaderboard, w = live win probability, s = score, t = thru, p = position

  GET /live-model/get-player-data?players=["Last, First",...]
      Response: {"lastfirst": [{"win": 0.061, "top5": 0.254, "top10": 0.406, "top20": 0.605, ...}], ...}
      - win/top5/top10/top20 = pre-tournament probabilities (used to estimate live top-N via scaling)

Strategy: use live win% from pga.lb; scale pre-tournament top-N by (live_win / pre_win) to approximate
live top-N. This correctly models players who have surged or collapsed during the tournament.
"""

import json
import logging
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://letzig.datagolf.com/live-model"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://datagolf.com/",
    "Origin": "https://datagolf.com",
}


@dataclass
class PlayerProbDTO:
    player_name: str        # "First Last" normalized
    current_score: int | None
    thru: str | None        # "F", "7", "--"
    win_pct: float | None   # 0.0–1.0 (live)
    top5_pct: float | None  # 0.0–1.0 (live-scaled from pre-tournament)
    top10_pct: float | None
    top20_pct: float | None
    current_pos: int | None


def _strip_jsonp(text: str) -> str:
    start = text.index("(")
    end = text.rindex(")")
    return text[start + 1 : end]


def _parse_win_pct(val: str | float | None) -> float | None:
    """Parse win% string '59.0%' or '0.9%' → decimal probability.
    Always divides % strings by 100 unconditionally (avoids the >1.0 heuristic
    failing on values like '1.0%' or '0.9%' which are valid sub-1% probabilities).
    """
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        if s.endswith("%"):
            try:
                return float(s[:-1]) / 100.0
            except ValueError:
                return None
        # No % suffix — treat as decimal already
        try:
            v = float(s)
            return v / 100.0 if v > 1.0 else v
        except ValueError:
            return None
    v = float(val)
    return v / 100.0 if v > 1.0 else v


def _parse_score(val) -> int | None:
    if val is None:
        return None
    s = str(val).strip().upper()
    if s in ("E", "EVEN", "-", "--"):
        return 0
    try:
        return int(s.replace("+", ""))
    except ValueError:
        return None


def _parse_pos(val) -> int | None:
    if val is None:
        return None
    s = str(val).strip().lstrip("T").lstrip("t")
    if s in ("", "--", "CUT", "WD", "DQ", "MC"):
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _parse_thru(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s not in ("null", "None") else None


def _make_dg_key(name: str) -> str:
    """'McIlroy, Rory' → 'mcilroyrory' (matches DataGolf response keys)."""
    return (
        name.lower()
        .replace(",", "")
        .replace(" ", "")
        .replace(".", "")
        .replace("-", "")
        .replace("'", "")
    )


def _last_first_to_first_last(name: str) -> str:
    if "," in name:
        parts = name.split(",", 1)
        return f"{parts[1].strip()} {parts[0].strip()}"
    return name.strip()


async def scrape_live_model() -> list[PlayerProbDTO]:
    """
    Fetch DataGolf live model data and return player probabilities.
    Raises RuntimeError if no live PGA Tour event.
    """
    async with httpx.AsyncClient(timeout=20, headers=_HEADERS, follow_redirects=True) as client:
        # ── Step 1: get live leaderboard from mini endpoint ───────────────────
        ts = int(time.time() * 1000)
        mini_resp = await client.get(
            f"{_BASE}/get-main-data/mini",
            params={"callback": "dg", "_": ts},
        )
        mini_resp.raise_for_status()
        mini_data = json.loads(_strip_jsonp(mini_resp.text))

        active_tours: list[str] = mini_data.get("active", [])
        tour = "pga" if "pga" in active_tours else (active_tours[0] if active_tours else None)
        if not tour:
            raise RuntimeError(f"DataGolf: no active tour (active={active_tours})")

        pga_section = mini_data.get(tour, {})
        lb: list[dict] = pga_section.get("lb", [])
        if not lb:
            raise RuntimeError(f"DataGolf: empty leaderboard for tour '{tour}'")

        logger.info(
            f"DataGolf: tour={tour}, event={pga_section.get('info', {}).get('event_name', '?')}, "
            f"{len(lb)} players in leaderboard"
        )

        # Build per-player live data: last_first_name → lb_row
        live_by_key: dict[str, dict] = {}
        # Also build "Last, First" names to query player-data
        player_names: list[str] = []
        for row in lb:
            first = row.get("f", "")
            last = row.get("l", "")
            if not first or not last:
                continue
            last_first = f"{last}, {first}"
            key = _make_dg_key(last_first)
            live_by_key[key] = row
            player_names.append(last_first)

        # ── Step 2: fetch pre-tournament top-N for scaling ────────────────────
        pretourney: dict[str, dict] = {}
        batch_size = 80
        for i in range(0, len(player_names), batch_size):
            batch = player_names[i : i + batch_size]
            ts = int(time.time() * 1000)
            pd_resp = await client.get(
                f"{_BASE}/get-player-data",
                params={"callback": "dg", "players": json.dumps(batch), "_": ts},
            )
            pd_resp.raise_for_status()
            batch_data: dict = json.loads(_strip_jsonp(pd_resp.text))
            # Each value is a list of round entries; take the one with highest win (most informative)
            for key, rounds in batch_data.items():
                if rounds:
                    # Use first entry (consistent snapshot)
                    pretourney[key] = rounds[0] if isinstance(rounds, list) else rounds

        logger.info(f"DataGolf: pre-tournament data for {len(pretourney)} players")

        # ── Step 3: build DTOs ────────────────────────────────────────────────
        results: list[PlayerProbDTO] = []
        for last_first in player_names:
            key = _make_dg_key(last_first)
            lb_row = live_by_key.get(key, {})
            pt = pretourney.get(key, {})

            live_win = _parse_win_pct(lb_row.get("w"))
            pre_win_raw = pt.get("win")
            pre_win = float(pre_win_raw) if pre_win_raw is not None else None
            # pre-tournament values are already 0-1 decimals
            pre_top5 = _safe_float(pt.get("top5"))
            pre_top10 = _safe_float(pt.get("top10"))
            pre_top20 = _safe_float(pt.get("top20"))

            # Scale pre-tournament top-N by (live_win / pre_win) to approximate live top-N
            top5_pct = _scale_topn(pre_top5, pre_win, live_win)
            top10_pct = _scale_topn(pre_top10, pre_win, live_win)
            top20_pct = _scale_topn(pre_top20, pre_win, live_win)

            score = _parse_score(lb_row.get("s"))
            thru_raw = lb_row.get("t")
            # thru is integer holes played (0 = not started, 18 = finished)
            if isinstance(thru_raw, int):
                thru = "F" if thru_raw == 18 else (str(thru_raw) if thru_raw > 0 else "--")
            else:
                thru = _parse_thru(thru_raw)
            pos = _parse_pos(lb_row.get("p"))

            display_name = _last_first_to_first_last(last_first)
            results.append(PlayerProbDTO(
                player_name=display_name,
                current_score=score,
                thru=thru,
                win_pct=live_win,
                top5_pct=top5_pct,
                top10_pct=top10_pct,
                top20_pct=top20_pct,
                current_pos=pos,
            ))

        results.sort(key=lambda r: r.win_pct or 0, reverse=True)
        return results


def _scale_topn(pre_topn: float | None, pre_win: float | None, live_win: float | None) -> float | None:
    """
    Scale a pre-tournament top-N probability to approximate the live value.
    If pre_win is available: live_topN = min(1.0, pre_topN * (live_win / pre_win))
    If pre_win unavailable: return pre_topN as-is (no scaling possible).
    """
    if pre_topn is None:
        return None
    if live_win is None:
        return pre_topn
    if pre_win and pre_win > 0.001:
        ratio = live_win / pre_win
        return min(1.0, pre_topn * ratio)
    return pre_topn


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
