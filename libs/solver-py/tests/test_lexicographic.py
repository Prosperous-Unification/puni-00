"""5.10's replacement for 5.7's weighted-sum mutation.

WHY 5.7's MUTATION HAD TO BE REPLACED
--------------------------------------
5.7 asked for "the staged loop collapsed to a weighted sum" and run 18 measured
what that actually proves. On its four-slice PRI/Time-disagreement oracle,
`1000·T₁ + 100·T₂ + T₃` leaves `BothStagings` **green** — every term on that
instance is far below 100, so a dominating sum simply *is* the lexicographic
order and reorders nothing. Only the naive `T₁ + T₂ + T₃` reds. So the mutation
was green exactly where a real implementation would most plausibly go wrong, and
5.10 replaced it: "sufficiently large coefficients encode the same lexicographic
order exactly, so PRI/Time disagreement proves nothing about staged versus
weighted."

WHAT THIS FIXTURE DOES INSTEAD
-------------------------------
5.10's rule: build the instance so "the second term's swing exceeds the first
term's coefficient gap — an answer that necessarily changes". Under `pri` the
order is (PRIORITY, MAKESPAN, MOVEMENT) and the coefficients under test are
`1000 / 100 / 1`, so one unit of PRIORITY is worth ten units of MAKESPAN. The
instance therefore has to make **one** unit of PRIORITY cost **more than ten**
units of MAKESPAN.

`W` and `S` share a person, so they serialise; `S` heads a twenty-link chain, so
whatever delays `S` delays the whole tail; and `W` is fifteen units long, so
putting `W` first delays that tail by fifteen. `W` is the only weighted slice,
so PRIORITY is just `W`'s own finish:

| placement | PRIORITY | MAKESPAN | MOVEMENT vs the baseline |
|---|---|---|---|
| `W` first (`W`@0, `S`@15) | **15** | **36** | 0 |
| `S` first (`S`@0, `W`@1) | **16** | **21** | 316 |

One unit of PRIORITY buys fifteen units of MAKESPAN, and fifteen is greater than
ten. Measured on the gate host, ortools 9.15.6755, one worker, seed 0, every
solve proved OPTIMAL:

| objective minimised | answer | PRIORITY | MAKESPAN |
|---|---|---|---|
| the shipped staged loop | `W`@0 | 15 | 36 |
| `1000·T₁ + 100·T₂ + T₃` | **`S`@0** | **16** | **21** |
| `1·T₁ + 1·T₂ + 1·T₃` | `W`@0 | 15 | 36 |
| `10⁶·T₁ + 10³·T₂ + T₃` | `W`@0 | 15 | 36 |

**The last two rows are the point of 5.10 and are asserted, not decoration.**
This fixture is the exact complement of 5.7's: there the dominating sum was green
and the equal-weight sum red, here the dominating sum is red and *both* the
equal-weight and the larger sum are green. So neither "the coefficients are big"
nor "the coefficients are equal" decides whether a weighted form is faithful —
only whether the gap exceeds the swing does. A mutation whose coefficients are
not named, and whose fixture is not built against them, is a coin flip either
way.

WHY THE WEIGHTED COMPARISON RUNS ON `build_model` AND NOT THROUGH `solve_request`
---------------------------------------------------------------------------------
`solve_request` installs 5.9's bound, `PRIORITY ≤ 15` for this baseline, and that
bound **excludes the S-first placement outright** (PRIORITY 16). The bound is
correct to do so — S-first is worse than the quantised baseline on stage 1's term
and that is precisely what it exists to exclude — but a mutation compared under
it would be green for the wrong reason. The two objectives are therefore compared
on the same unbounded model, which is the thing 5.10 is asking about.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Mapping, Sequence

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from ortools.sat.python import cp_model  # noqa: E402
from test_model import a_request, a_slice, an_edge  # noqa: E402

from wbs_solver.model import MAKESPAN, MOVEMENT, PRIORITY, build_model  # noqa: E402
from wbs_solver.solve import SolverConfig, evaluate_terms, solve_request  # noqa: E402

CHAIN = 20
W_DURATION = 15

# The four measured outcomes above, as the two placements they choose between.
W_FIRST_PRIORITY = 15
W_FIRST_MAKESPAN = 36
S_FIRST_PRIORITY = 16
S_FIRST_MAKESPAN = 21

# The implementation's own dominating coefficients — 5.7's, the ones that stayed
# green there — and the two contrasts that make the swing rule visible.
DOMINATING = (1000, 100, 1)
EQUAL = (1, 1, 1)
LARGER = (10**6, 10**3, 1)

# Enough to prove this instance: every probe returned OPTIMAL well inside it.
PROOF_LIMIT = 20.0


def _slices() -> list[dict[str, Any]]:
    out = [
        a_slice("W", duration=W_DURATION, weight=1, person="p"),
        a_slice("S", duration=1, weight=0, person="p"),
    ]
    out.extend(a_slice(f"T{i}", duration=1, weight=0) for i in range(CHAIN))
    return out


def _edges() -> list[dict[str, str]]:
    out = [an_edge("S", "T0")]
    out.extend(an_edge(f"T{i}", f"T{i + 1}") for i in range(CHAIN - 1))
    return out


def w_first() -> dict[str, int]:
    """`W` at 0, the whole chain pushed behind it. The lexicographic answer."""
    offsets = {"W": 0, "S": W_DURATION}
    cursor = W_DURATION + 1
    for index in range(CHAIN):
        offsets[f"T{index}"] = cursor
        cursor += 1
    return offsets


def s_first() -> dict[str, int]:
    """`S` at 0 so the chain runs early; `W` takes the person straight after."""
    offsets = {"S": 0, "W": 1}
    for index in range(CHAIN):
        offsets[f"T{index}"] = index + 1
    return offsets


def instance(baseline: Mapping[str, int] | None = None) -> dict[str, Any]:
    """A fresh request per call, baselined on the lexicographic answer.

    The baseline has to be a placement the model admits — 5.9's bound is
    installed only on a proved-feasible one — and `w_first` is the natural
    choice, since it is what the shipped loop returns.
    """
    return a_request(
        _slices(),
        edges=_edges(),
        baseline=dict(baseline if baseline is not None else w_first()),
        objective="pri",
    )


def _proved(model: cp_model.CpModel) -> tuple[int, cp_model.CpSolver]:
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_deterministic_time = PROOF_LIMIT
    return solver.solve(model), solver


def admits(request: Mapping[str, Any], placement: Mapping[str, int]) -> bool:
    built = build_model(request)
    for key, var in built.starts.items():
        built.model.add(var == int(placement[key]))
    status, _ = _proved(built.model)
    return status in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def under_weighted_sum(
    request: Mapping[str, Any], coefficients: Sequence[int]
) -> dict[str, int]:
    """The mutation: one weighted minimise in place of the staged loop.

    Raises rather than returning a partial answer if the solve does not prove an
    optimum — a mutation compared at an unproved incumbent would be comparing
    search order, which is the flake 5.6 and 5.5 both refuse.
    """
    built = build_model(request)
    first, second, third = coefficients
    built.model.minimize(
        first * built.terms[PRIORITY]
        + second * built.terms[MAKESPAN]
        + third * built.terms[MOVEMENT]
    )
    status, solver = _proved(built.model)
    if status != cp_model.OPTIMAL:
        raise AssertionError(
            f"the weighted form did not prove an optimum at {coefficients}: "
            f"{solver.status_name(status)}"
        )
    return {key: int(solver.value(var)) for key, var in built.starts.items()}


class TheTwoPlacementsAreBothRealAndAreHandComputed(unittest.TestCase):
    """Neither row of the table is a search outcome."""

    def setUp(self) -> None:
        self.request = instance()

    def test_both_placements_are_admitted_by_the_model(self) -> None:
        # Without this the mutation case would pass on a model that refuses
        # `S`-first for some entirely different reason.
        self.assertTrue(admits(self.request, w_first()))
        self.assertTrue(admits(self.request, s_first()))

    def test_the_w_first_terms(self) -> None:
        terms = evaluate_terms(self.request, w_first())
        self.assertEqual(terms[PRIORITY], W_FIRST_PRIORITY)
        self.assertEqual(terms[MAKESPAN], W_FIRST_MAKESPAN)

    def test_the_s_first_terms(self) -> None:
        terms = evaluate_terms(self.request, s_first())
        self.assertEqual(terms[PRIORITY], S_FIRST_PRIORITY)
        self.assertEqual(terms[MAKESPAN], S_FIRST_MAKESPAN)

    def test_one_unit_of_priority_buys_more_makespan_than_the_gap(self) -> None:
        # 5.10's construction rule, checked as arithmetic rather than trusted:
        # the second term's swing must exceed the first term's coefficient gap.
        first, second, _ = DOMINATING
        priority_gap = S_FIRST_PRIORITY - W_FIRST_PRIORITY
        makespan_swing = W_FIRST_MAKESPAN - S_FIRST_MAKESPAN
        self.assertGreater(second * makespan_swing, first * priority_gap)


class TheStagedLoopIsLexicographic(unittest.TestCase):
    """The shipped answer, which is the one the mutation must move."""

    def setUp(self) -> None:
        self.response = solve_request(
            instance(),
            SolverConfig(
                num_search_workers=1,
                random_seed=0,
                deterministic_time_per_stage=PROOF_LIMIT,
            ),
        )

    def test_it_takes_the_better_priority_and_pays_the_makespan(self) -> None:
        values = self.response["objectiveValues"]
        self.assertEqual(values[PRIORITY]["value"], W_FIRST_PRIORITY)
        self.assertEqual(values[MAKESPAN]["value"], W_FIRST_MAKESPAN)

    def test_it_proves_both_terms_at_this_limit(self) -> None:
        # An unproved staged answer would make the comparison below a race
        # between two truncations rather than between two objectives.
        values = self.response["objectiveValues"]
        self.assertEqual(values[PRIORITY]["status"], "optimal")
        self.assertEqual(values[MAKESPAN]["status"], "optimal")


class TheWeightedFormAnswersDifferently(unittest.TestCase):
    """5.10's mutation, at the coefficients 5.7's version stayed green on."""

    def test_the_dominating_sum_moves_the_answer(self) -> None:
        offsets = under_weighted_sum(instance(), DOMINATING)
        self.assertEqual(offsets["S"], 0)
        self.assertEqual(offsets["W"], 1)
        terms = evaluate_terms(instance(), offsets)
        self.assertEqual(terms[PRIORITY], S_FIRST_PRIORITY)
        self.assertEqual(terms[MAKESPAN], S_FIRST_MAKESPAN)

    def test_the_equal_weight_sum_does_not(self) -> None:
        # 5.7's red is green here. Stated as an assertion because a reader who
        # carried 5.7's conclusion over would expect the opposite.
        offsets = under_weighted_sum(instance(), EQUAL)
        self.assertEqual(offsets["W"], 0)

    def test_a_larger_dominating_sum_does_not_either(self) -> None:
        # And this is why "use big coefficients" is not the rule: 10⁶/10³ is a
        # thousand times 1000/100 and recovers the lexicographic answer exactly,
        # because now the gap does exceed the swing.
        offsets = under_weighted_sum(instance(), LARGER)
        self.assertEqual(offsets["W"], 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
