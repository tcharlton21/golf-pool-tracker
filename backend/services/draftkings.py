"""
DraftKings odds — currently returns empty (their sportsbook blocks scraping).
Win probabilities and all pool metrics come from DataGolf; DK odds are a
supplemental display-only column. When/if odds become available (e.g. a paid
API), wire it here and return DKOddsDTO objects.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class DKOddsDTO:
    player_name: str
    american_odds: int


async def scrape_winner_odds(event_slug: str) -> list[DKOddsDTO]:
    """
    Stub: DraftKings sportsbook blocks automated scraping.
    Returns empty list so the refresh pipeline degrades gracefully.
    """
    logger.info(f"DraftKings odds not available for '{event_slug}' (scraping blocked)")
    return []
