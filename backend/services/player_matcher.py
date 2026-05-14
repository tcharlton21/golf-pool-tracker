"""
Player name normalization and cross-source matching.

Three name formats must map to one canonical name:
  Excel:      "Scheffler, Scottie"  →  "Scottie Scheffler"
  DataGolf:   "Scottie Scheffler"   →  canonical (no change)
  DraftKings: "S. Scheffler"        →  initial + last name match

The player_cache table is the anchor. It is seeded from Excel uploads,
then DataGolf and DraftKings ingestion link to existing rows via fuzzy matching.
"""

import logging
import re
import unicodedata
from datetime import datetime, timezone

from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from models.database import PlayerCache

logger = logging.getLogger(__name__)

# Known aliases that fuzzy matching might miss
KNOWN_ALIASES: dict[str, list[str]] = {
    "Si Woo Kim": ["Si-Woo Kim", "S.W. Kim"],
    "Min Woo Lee": ["Min-Woo Lee", "M.W. Lee"],
    "Tom Kim": ["Joohyung Kim"],
    "Byeong Hun An": ["Byeong-Hun An"],
    "Sungjae Im": ["Sung-Jae Im"],
    "Hideki Matsuyama": ["H. Matsuyama"],
    "Rory McIlroy": ["Rory Mcilroy"],
    "Cameron Davis": ["Cam Davis"],
    "Bryson DeChambeau": ["Bryson Dechambeau"],
    "Matt Fitzpatrick": ["Matthew Fitzpatrick"],
    "Nicolai Hojgaard": ["Nicolai Hojgaard", "Nicolai Højgaard"],
    "J.J. Spaun": ["JJ Spaun"],
    "Tyrrell Hatton": ["Tyrell Hatton"],
}

# Inverted: alias → canonical
_ALIAS_TO_CANONICAL: dict[str, str] = {}
for canonical, aliases in KNOWN_ALIASES.items():
    for alias in aliases:
        _ALIAS_TO_CANONICAL[alias.lower()] = canonical


FUZZY_THRESHOLD = 85


def _strip_accents(text: str) -> str:
    """'Åberg' → 'Aberg', 'Hojgaard' stays 'Hojgaard' (no accent to strip)."""
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def _clean_name(text: str) -> str:
    """Strip accents and parenthetical suffixes like '(A)' for amateur."""
    text = _strip_accents(text)
    text = re.sub(r"\s*\([^)]*\)\s*$", "", text).strip()
    return text


def normalize_excel_name(raw: str) -> str:
    """
    Convert Excel "Last, First" format to "First Last".
    Handles:
      "Scheffler, Scottie"  →  "Scottie Scheffler"
      "McIlroy, Rory"       →  "Rory McIlroy"
      "Scottie Scheffler"   →  "Scottie Scheffler"  (already normalized)
    """
    raw = _clean_name(raw.strip())
    if "," in raw:
        parts = raw.split(",", 1)
        last = parts[0].strip()
        first = parts[1].strip()
        return f"{first} {last}"
    return raw


def _apply_alias(name: str) -> str:
    return _ALIAS_TO_CANONICAL.get(name.lower(), name)


def upsert_player(normalized_name: str, db: Session) -> PlayerCache:
    """
    Get or create a PlayerCache row for the given normalized name.
    Applies the alias map first so picks like "Matthew Fitzpatrick" collapse
    onto the canonical "Matt Fitzpatrick" row that DataGolf will populate.
    """
    canonical = _apply_alias(_clean_name(normalized_name))
    existing = db.query(PlayerCache).filter_by(normalized_name=canonical).first()
    if existing:
        return existing
    player = PlayerCache(
        normalized_name=canonical,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(player)
    db.flush()
    return player


def _all_normalized_names(db: Session) -> list[tuple[int, str]]:
    """Return (id, cleaned_normalized_name) for all PlayerCache rows."""
    rows = db.query(PlayerCache.id, PlayerCache.normalized_name).all()
    return [(r.id, _clean_name(r.normalized_name)) for r in rows]


def get_or_create_from_datagolf(dg_name: str, db: Session) -> PlayerCache:
    """
    Match an existing PlayerCache row for a DataGolf name, creating one if
    nothing matches. Use this from the live-odds refresh path so every player
    in the field gets cached (and shows up on the live leaderboard) — not
    only those someone in the pool happened to pick.
    """
    matched = match_datagolf_name(dg_name, db)
    if matched:
        return matched
    canonical = _apply_alias(_clean_name(dg_name))
    player = PlayerCache(
        normalized_name=canonical,
        datagolf_name=canonical,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(player)
    db.flush()
    return player


def match_datagolf_name(dg_name: str, db: Session) -> PlayerCache | None:
    """
    Match a DataGolf player name to an existing PlayerCache row.
    Tries exact match, alias lookup, then fuzzy match.
    Returns None if no match above threshold — caller should log warning.
    """
    canonical = _apply_alias(_clean_name(dg_name))

    # Exact match on normalized_name
    exact = db.query(PlayerCache).filter_by(normalized_name=canonical).first()
    if exact:
        if exact.datagolf_name != canonical:
            exact.datagolf_name = canonical
            db.flush()
        return exact

    # Fuzzy match
    all_names = _all_normalized_names(db)
    if not all_names:
        return None

    ids, names = zip(*all_names)
    result = process.extractOne(canonical, names, scorer=fuzz.token_sort_ratio)
    if result and result[1] >= FUZZY_THRESHOLD:
        matched_id = ids[result[2]]
        player = db.get(PlayerCache, matched_id)
        if player and player.datagolf_name != canonical:
            player.datagolf_name = canonical
            db.flush()
        return player

    logger.warning(f"Unmatched DataGolf name: '{dg_name}' (best score: {result[1] if result else 'N/A'})")
    return None


def match_dk_name(dk_name: str, db: Session) -> PlayerCache | None:
    """
    Match a DraftKings player name to an existing PlayerCache row.
    DraftKings often uses "F. Last" abbreviated format.
    Tries alias, abbreviated expansion, then fuzzy match.
    """
    canonical = _apply_alias(dk_name)

    # Exact match first
    exact = db.query(PlayerCache).filter_by(normalized_name=canonical).first()
    if exact:
        if exact.dk_name != dk_name:
            exact.dk_name = dk_name
            db.flush()
        return exact

    # Expand abbreviated "F. Last" → match by last name + initial
    abbreviated_match = _match_abbreviated_name(canonical, db)
    if abbreviated_match:
        if abbreviated_match.dk_name != dk_name:
            abbreviated_match.dk_name = dk_name
            db.flush()
        return abbreviated_match

    # Fuzzy match fallback
    all_names = _all_normalized_names(db)
    if not all_names:
        return None

    ids, names = zip(*all_names)
    result = process.extractOne(canonical, names, scorer=fuzz.token_sort_ratio)
    if result and result[1] >= FUZZY_THRESHOLD:
        matched_id = ids[result[2]]
        player = db.get(PlayerCache, matched_id)
        if player and player.dk_name != dk_name:
            player.dk_name = dk_name
            db.flush()
        return player

    logger.warning(f"Unmatched DraftKings name: '{dk_name}' (best score: {result[1] if result else 'N/A'})")
    return None


def _match_abbreviated_name(name: str, db: Session) -> PlayerCache | None:
    """
    Match "S. Scheffler" style name by last name and first initial.
    """
    # Pattern: single letter followed by period and last name
    match = re.match(r'^([A-Z])\.\s+(.+)$', name)
    if not match:
        return None

    first_initial = match.group(1).upper()
    last_name = match.group(2).strip()

    candidates = (
        db.query(PlayerCache)
        .filter(PlayerCache.normalized_name.like(f"% {last_name}"))
        .all()
    )
    for candidate in candidates:
        parts = candidate.normalized_name.split()
        if parts and parts[0][0].upper() == first_initial:
            return candidate

    return None
