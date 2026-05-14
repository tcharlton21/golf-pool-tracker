"""
DataGolf live model data via JSONP API endpoints (no Playwright needed).

Endpoints (letzig.datagolf.com):
  GET /live-model/get-main-data/pga
      Full live model payload for the active PGA event:
        - main: list of per-player live probabilities and live score
            {dg_id, player_num, name ("Last, First"), flag, current_pos, current_score,
             today, thru, teetime, cut, top5, top10, top20, win, course, round}
        - player_scores: dict {player_num: {round_num: {1..18: stroke|null, course_code, morning, s, t}, info: {...}}}
        - course: list per (course, hole) of {course, hole, par, yardage, played_*, avg_*}
        - cut_info, hole_totals, tournament_status, weather, etc.

  Why this endpoint vs the older `mini` endpoint:
    `mini` only returns basic leaderboard rows. The full `pga` payload contains live
    make-cut, today's score, hole-by-hole scores, and per-hole pars — everything we need.
"""

import json
import logging
import math
import time
from dataclasses import dataclass, field

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
class HoleScores:
    round_num: int                       # 1–4
    course_code: str | None              # e.g. "AR"
    morning: bool | None                 # True for morning wave
    tee_time: str | None                 # e.g. "8:24 AM"
    scores: dict[int, int | None]        # {1..18: stroke_count or None}


@dataclass
class PlayerProbDTO:
    player_name: str                     # "First Last" normalized for matching
    player_num: int | None               # DataGolf player_num (joins to player_scores)
    flag: str | None                     # "USA", "GER", ...
    current_score: int | None            # cumulative tournament strokes-to-par
    today_score: int | None              # today's strokes-to-par
    thru: str | None                     # "F", "7", "--"
    win_pct: float | None                # 0.0–1.0 live
    top5_pct: float | None
    top10_pct: float | None
    top20_pct: float | None
    make_cut_pct: float | None
    current_pos: int | None
    missed_cut: bool = False             # True for MC/WD/DQ/CUT
    rounds: list[HoleScores] = field(default_factory=list)


@dataclass
class LiveModelData:
    players: list[PlayerProbDTO]
    course_pars: dict[str, dict[int, int]]  # {course_code: {hole_num: par}}


def _strip_jsonp(text: str) -> str:
    start = text.index("(")
    end = text.rindex(")")
    return text[start + 1 : end]


def _parse_pct(val: str | float | None) -> float | None:
    """Accepts '59.0%' string or already-decimal float. Returns 0.0–1.0 or None."""
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        if s.endswith("%"):
            try:
                return float(s[:-1]) / 100.0
            except ValueError:
                return None
        try:
            v = float(s)
            return v / 100.0 if v > 1.0 else v
        except ValueError:
            return None
    try:
        v = float(val)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    return v / 100.0 if v > 1.0 else v


def _parse_int_score(val) -> int | None:
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    s = str(val).strip().upper()
    if s in ("E", "EVEN", "-", "--", ""):
        return 0 if s in ("E", "EVEN") else None
    try:
        return int(round(float(s.replace("+", ""))))
    except ValueError:
        return None


_MISSED_CUT_STRINGS = {"MC", "CUT", "WD", "DQ"}


def _parse_pos(val) -> tuple[int | None, bool]:
    if val is None:
        return None, False
    s = str(val).strip().upper().lstrip("T")
    if s in _MISSED_CUT_STRINGS:
        return None, True
    if s in ("", "--"):
        return None, False
    try:
        return int(s), False
    except ValueError:
        return None, False


def _format_thru(thru_holes: int | None) -> str | None:
    if thru_holes is None:
        return None
    if thru_holes >= 18:
        return "F"
    if thru_holes <= 0:
        return None
    return str(thru_holes)


def _last_first_to_first_last(name: str) -> str:
    if "," in name:
        last, first = name.split(",", 1)
        return f"{first.strip()} {last.strip()}"
    return name.strip()


# Allow malformed JSON from DataGolf (uses bare `NaN` for today's score before
# play starts, which json.loads accepts in Python only when parse_constant is set).
def _parse_jsonp_payload(text: str) -> dict:
    inner = _strip_jsonp(text)
    return json.loads(inner, parse_constant=lambda c: None)


async def fetch_live_model() -> LiveModelData:
    """Fetch DataGolf live model and return per-player live data + course pars.

    Raises RuntimeError if no active PGA event or empty payload.
    """
    async with httpx.AsyncClient(timeout=20, headers=_HEADERS, follow_redirects=True) as client:
        # First check which tour is active so we can request the right endpoint
        ts = int(time.time() * 1000)
        mini_resp = await client.get(
            f"{_BASE}/get-main-data/mini",
            params={"callback": "dg", "_": ts},
        )
        mini_resp.raise_for_status()
        mini_data = _parse_jsonp_payload(mini_resp.text)
        active_tours: list[str] = mini_data.get("active", [])
        tour = "pga" if "pga" in active_tours else (active_tours[0] if active_tours else None)
        if not tour:
            raise RuntimeError(f"DataGolf: no active tour (active={active_tours})")

        ts = int(time.time() * 1000)
        full_resp = await client.get(
            f"{_BASE}/get-main-data/{tour}",
            params={"callback": "dg", "_": ts},
        )
        full_resp.raise_for_status()
        data = _parse_jsonp_payload(full_resp.text)

    main: list[dict] = data.get("main", [])
    if not main:
        raise RuntimeError(f"DataGolf: empty 'main' for tour '{tour}'")

    course_rows: list[dict] = data.get("course", [])
    course_pars: dict[str, dict[int, int]] = {}
    for row in course_rows:
        c = row.get("course")
        h = row.get("hole")
        p = row.get("par")
        if c is None or h is None or p is None:
            continue
        course_pars.setdefault(c, {})[int(h)] = int(p)

    player_scores_raw: dict = data.get("player_scores", {}) or {}

    players: list[PlayerProbDTO] = []
    for entry in main:
        name = entry.get("name")
        if not name:
            continue
        pos, missed_cut = _parse_pos(entry.get("current_pos"))
        thru_raw = entry.get("thru")
        thru = _format_thru(int(thru_raw)) if isinstance(thru_raw, (int, float)) and not (
            isinstance(thru_raw, float) and math.isnan(thru_raw)
        ) else None

        player_num = entry.get("player_num")
        rounds = _build_rounds(player_scores_raw.get(str(player_num), {}))

        players.append(PlayerProbDTO(
            player_name=_last_first_to_first_last(name),
            player_num=int(player_num) if player_num is not None else None,
            flag=entry.get("flag"),
            current_score=_parse_int_score(entry.get("current_score")),
            today_score=_parse_int_score(entry.get("today")),
            thru=thru,
            win_pct=_parse_pct(entry.get("win")),
            top5_pct=_parse_pct(entry.get("top5")),
            top10_pct=_parse_pct(entry.get("top10")),
            top20_pct=_parse_pct(entry.get("top20")),
            make_cut_pct=_parse_pct(entry.get("cut")),
            current_pos=pos,
            missed_cut=missed_cut,
            rounds=rounds,
        ))

    players.sort(key=lambda r: r.win_pct or 0, reverse=True)
    logger.info(f"DataGolf: {len(players)} players, {sum(1 for c in course_pars.values() for _ in c)} course holes loaded")
    return LiveModelData(players=players, course_pars=course_pars)


def _build_rounds(rounds_raw: dict) -> list[HoleScores]:
    """Convert player_scores[player_num] → list[HoleScores] sorted by round."""
    out: list[HoleScores] = []
    for key, val in rounds_raw.items():
        if key == "info" or not isinstance(val, dict):
            continue
        try:
            round_num = int(key)
        except ValueError:
            continue
        scores: dict[int, int | None] = {}
        for hole in range(1, 19):
            raw = val.get(str(hole))
            scores[hole] = int(raw) if isinstance(raw, (int, float)) and not (
                isinstance(raw, float) and math.isnan(raw)
            ) else None
        morning_val = val.get("morning")
        morning = (morning_val == "yes") if isinstance(morning_val, str) else None
        out.append(HoleScores(
            round_num=round_num,
            course_code=val.get("course_code"),
            morning=morning,
            tee_time=val.get("t"),
            scores=scores,
        ))
    out.sort(key=lambda r: r.round_num)
    return out


# ── Backward-compat shim ────────────────────────────────────────────────────────
# Keep the old name working so any callers (and tests) don't break during the
# transition. Will remove once routers are migrated.
async def scrape_live_model() -> list[PlayerProbDTO]:
    data = await fetch_live_model()
    return data.players
