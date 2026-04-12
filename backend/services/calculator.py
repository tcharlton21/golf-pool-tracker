"""
Pure pool metric calculations. No DB access — takes typed data in, returns metrics out.
All functions are deterministic and testable without mocks.
"""

import math


def american_to_prob(odds: int) -> float:
    """
    Convert American odds to implied win probability.
    +150 → 0.400, -200 → 0.667
    """
    if odds > 0:
        return 100.0 / (odds + 100.0)
    return abs(odds) / (abs(odds) + 100.0)


def prob_of_having_winner(win_probs: list[float]) -> float:
    """
    Probability that at least one pick wins the tournament.
    P(at least one wins) = 1 - P(none win) = 1 - Π(1 - p_i)

    More accurate than summing probabilities, which double-counts
    scenarios where multiple picks could win.
    """
    if not win_probs:
        return 0.0
    return 1.0 - math.prod(1.0 - max(0.0, min(1.0, p)) for p in win_probs)


def projected_earnings(
    picks: list[str],
    position_probs: dict[str, dict[int, float]],
    position_amounts: dict[int, float],
) -> float:
    """
    Compute total expected tournament earnings across all of an entrant's picks.
    E[earnings] = Σ_pick Σ_pos P(pick finishes pos) * amount(pos)

    Args:
        picks: list of normalized golfer names
        position_probs: {golfer_name: {position: probability}} — from purse.make_position_probs()
        position_amounts: {position: dollar_amount} — from purse.build_position_amounts()

    Returns total expected earnings in USD.
    Players with no probability data contribute $0.
    """
    total = 0.0
    for golfer in picks:
        probs = position_probs.get(golfer)
        if not probs:
            continue
        for pos, prob in probs.items():
            amount = position_amounts.get(pos, 0.0)
            total += prob * amount
    return total


def exclusive_edge_score(
    picks: list[str],
    win_probs: dict[str, float],
    all_entrant_picks: list[list[str]],
) -> float:
    """
    Measure of unique upside: picks that could pay off that others don't have.
    Score = Σ_pick win_prob(pick) * (1 - coverage_pct(pick))

    coverage_pct = fraction of OTHER entrants who also have this pick.
    A pick held by only this entrant has coverage_pct = 0.0, full edge value.
    A pick held by everyone has coverage_pct = 1.0, zero edge value.

    Args:
        picks: this entrant's normalized golfer names
        win_probs: {golfer_name: win_probability} for all relevant players
        all_entrant_picks: list of pick lists for ALL entrants in the pool
                           (including this entrant — we subtract 1 from denom)
    """
    if not picks or len(all_entrant_picks) <= 1:
        return 0.0

    total_others = len(all_entrant_picks) - 1
    score = 0.0

    for golfer in picks:
        win_prob = win_probs.get(golfer, 0.0)
        if win_prob <= 0.0:
            continue
        # Count total entrants (including this one) who have this pick
        total_with_pick = sum(1 for ep in all_entrant_picks if golfer in ep)
        # Subtract 1 for this entrant, giving only "others" who share it
        others_with_pick = max(0, total_with_pick - 1)
        coverage_pct = others_with_pick / total_others
        score += win_prob * (1.0 - coverage_pct)

    return score


def current_earnings_from_position(
    current_pos: int | None,
    position_amounts: dict[int, float],
) -> float:
    """
    Actual earnings if the player finished at their current live position.
    Used for the 'live earnings' display (non-probability-weighted).
    Returns 0 if position is None or beyond the money.
    """
    if current_pos is None:
        return 0.0
    return position_amounts.get(current_pos, 0.0)
