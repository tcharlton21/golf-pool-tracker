import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.calculator import (
    american_to_prob,
    current_earnings_from_position,
    exclusive_edge_score,
    prob_of_having_winner,
    projected_earnings,
)


class TestAmericanToProb:
    def test_positive_odds(self):
        result = american_to_prob(150)
        assert abs(result - 0.4) < 0.001

    def test_negative_odds(self):
        result = american_to_prob(-200)
        assert abs(result - 0.6667) < 0.001

    def test_even_odds(self):
        result = american_to_prob(100)
        assert abs(result - 0.5) < 0.001

    def test_long_shot(self):
        result = american_to_prob(5000)
        assert abs(result - 0.0196) < 0.001


class TestProbOfHavingWinner:
    def test_empty_picks(self):
        assert prob_of_having_winner([]) == 0.0

    def test_single_pick(self):
        result = prob_of_having_winner([0.3])
        assert abs(result - 0.3) < 0.001

    def test_multiple_picks(self):
        # 1 - (1-0.1)(1-0.2)(1-0.05) = 1 - 0.9*0.8*0.95 = 1 - 0.684 = 0.316
        result = prob_of_having_winner([0.1, 0.2, 0.05])
        expected = 1 - (0.9 * 0.8 * 0.95)
        assert abs(result - expected) < 0.001

    def test_clamps_over_one(self):
        # Should not exceed 1.0 even with bad input
        result = prob_of_having_winner([0.9, 0.9, 0.9])
        assert result <= 1.0

    def test_all_zeros(self):
        assert prob_of_having_winner([0.0, 0.0, 0.0]) == 0.0


class TestProjectedEarnings:
    def test_no_picks(self):
        assert projected_earnings([], {}, {1: 1_000_000}) == 0.0

    def test_player_not_in_odds(self):
        result = projected_earnings(["Unknown Player"], {}, {1: 1_000_000})
        assert result == 0.0

    def test_single_player_certain_win(self):
        picks = ["Tiger Woods"]
        position_probs = {"Tiger Woods": {1: 1.0}}
        position_amounts = {1: 1_800_000}
        result = projected_earnings(picks, position_probs, position_amounts)
        assert abs(result - 1_800_000) < 0.01

    def test_multiple_players(self):
        picks = ["Player A", "Player B"]
        position_probs = {
            "Player A": {1: 0.2, 2: 0.3},
            "Player B": {1: 0.1, 3: 0.4},
        }
        position_amounts = {1: 1_000_000, 2: 500_000, 3: 300_000}
        result = projected_earnings(picks, position_probs, position_amounts)
        # A: 0.2*1M + 0.3*500k = 200k + 150k = 350k
        # B: 0.1*1M + 0.4*300k = 100k + 120k = 220k
        expected = 350_000 + 220_000
        assert abs(result - expected) < 0.01

    def test_position_not_in_purse(self):
        # Positions beyond the money contribute $0
        picks = ["Player A"]
        position_probs = {"Player A": {100: 0.5}}
        position_amounts = {1: 1_000_000}
        result = projected_earnings(picks, position_probs, position_amounts)
        assert result == 0.0


class TestExclusiveEdgeScore:
    def test_empty_picks(self):
        result = exclusive_edge_score([], {}, [[]])
        assert result == 0.0

    def test_single_entrant(self):
        # No other entrants means no coverage context
        result = exclusive_edge_score(
            ["Player A"],
            {"Player A": 0.3},
            [["Player A"]],
        )
        assert result == 0.0

    def test_unique_pick(self):
        # Pick not held by anyone else → full edge value
        result = exclusive_edge_score(
            picks=["Player A"],
            win_probs={"Player A": 0.2},
            all_entrant_picks=[["Player A"], ["Player B"], ["Player C"]],
        )
        # coverage = 0/2 = 0 → edge = 0.2 * (1 - 0) = 0.2
        assert abs(result - 0.2) < 0.001

    def test_shared_pick(self):
        # Pick held by all others → zero edge
        result = exclusive_edge_score(
            picks=["Player A"],
            win_probs={"Player A": 0.2},
            all_entrant_picks=[["Player A"], ["Player A"], ["Player A"]],
        )
        # coverage = 2/2 = 1.0 → edge = 0.2 * (1 - 1.0) = 0
        assert abs(result - 0.0) < 0.001

    def test_partial_coverage(self):
        # Pick held by 1 of 3 others → coverage = 1/3
        result = exclusive_edge_score(
            picks=["Player A"],
            win_probs={"Player A": 0.3},
            all_entrant_picks=[["Player A"], ["Player A"], ["Player B"], ["Player C"]],
        )
        # coverage = 1/3 → edge = 0.3 * (2/3) ≈ 0.2
        expected = 0.3 * (2 / 3)
        assert abs(result - expected) < 0.001


class TestCurrentEarningsFromPosition:
    def test_none_position(self):
        assert current_earnings_from_position(None, {1: 1_000_000}) == 0.0

    def test_first_place(self):
        result = current_earnings_from_position(1, {1: 1_800_000, 2: 1_080_000})
        assert result == 1_800_000

    def test_outside_money(self):
        result = current_earnings_from_position(80, {1: 1_000_000})
        assert result == 0.0
