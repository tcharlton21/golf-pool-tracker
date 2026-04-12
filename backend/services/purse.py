"""
In-memory purse cache and expected-earnings computation.
Purse position amounts are loaded from the DB (seeded at event creation).
"""

import math
from functools import lru_cache


def build_position_amounts(
    purse_rows: list[tuple[int, float]],
) -> dict[int, float]:
    """
    Convert list of (position, amount_usd) DB rows to a lookup dict.
    purse_rows: [(1, 3600000.0), (2, 2160000.0), ...]
    """
    return {pos: amount for pos, amount in purse_rows}


def make_position_probs(
    win_pct: float | None,
    top5_pct: float | None,
    top10_pct: float | None,
    top20_pct: float | None,
) -> dict[int, float]:
    """
    Approximate per-position finish probabilities from DataGolf top-N band data.
    DataGolf provides cumulative probabilities; we distribute evenly within each band.

    Bands:
      pos 1       = win_pct
      pos 2-5     = (top5 - win) / 4
      pos 6-10    = (top10 - top5) / 5
      pos 11-20   = (top20 - top10) / 10
      pos 21-65   = remainder with exponential decay

    If a value is None we treat it as 0 (no data available).
    """
    w = win_pct or 0.0
    t5 = top5_pct or 0.0
    t10 = top10_pct or 0.0
    t20 = top20_pct or 0.0

    # No probability signal → missed cut or no data; don't fabricate earnings
    if w == 0.0 and t5 == 0.0 and t10 == 0.0 and t20 == 0.0:
        return {}

    # Clamp to avoid negative bands from data inconsistencies
    t5 = max(t5, w)
    t10 = max(t10, t5)
    t20 = max(t20, t10)

    probs: dict[int, float] = {}
    probs[1] = w

    band_2_5 = (t5 - w) / 4 if t5 > w else 0.0
    for pos in range(2, 6):
        probs[pos] = band_2_5

    band_6_10 = (t10 - t5) / 5 if t10 > t5 else 0.0
    for pos in range(6, 11):
        probs[pos] = band_6_10

    band_11_20 = (t20 - t10) / 10 if t20 > t10 else 0.0
    for pos in range(11, 21):
        probs[pos] = band_11_20

    # Remaining probability distributed across positions 21-65 with exponential decay
    assigned = w + (t5 - w) + (t10 - t5) + (t20 - t10)
    remainder = max(0.0, 1.0 - assigned)
    if remainder > 0:
        decay_positions = list(range(21, 66))
        weights = [math.exp(-0.05 * (i - 21)) for i in decay_positions]
        total_weight = sum(weights)
        for pos, weight in zip(decay_positions, weights):
            probs[pos] = remainder * (weight / total_weight)

    return probs


def expected_earnings(
    position_probs: dict[int, float],
    position_amounts: dict[int, float],
) -> float:
    """
    Compute expected dollar earnings for one player.
    E[earnings] = Σ P(finish at pos) * amount(pos)
    """
    total = 0.0
    for pos, prob in position_probs.items():
        amount = position_amounts.get(pos, 0.0)
        total += prob * amount
    return total
