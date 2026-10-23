"""Clause 4 for resources (wire 4, `wbs-resources` R5): one cumulative each.

Every case pairs a binding instance with its slack twin, as `PoolClause` does
in `test_model.py`: a resource at capacity 1 serialises and the same resource
at a larger capacity does not. Without the twin a case proves only that the
model is over-constrained somewhere, not that the resource clause is what
constrained it. Every instance is also run through the schema and the
cross-field checks, so none is a request no builder can send.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Mapping

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from test_model import a_request, a_slice, minimise  # noqa: E402
from wbs_solver.model import MAKESPAN  # noqa: E402
from wbs_solver.solve import SolverConfig, solve_request  # noqa: E402
from wbs_solver.validate import RequestRejected, validate_request  # noqa: E402

REPO_ROOT = PACKAGE_ROOT.parents[3]
FIXTURES = REPO_ROOT / "libs" / "wbs" / "domain" / "contracts" / "solver" / "fixtures" / "request"
PINNED = SolverConfig(num_search_workers=1, random_seed=0)


def overlaps(starts: Mapping[str, int], request: Mapping[str, Any], left: str, right: str) -> bool:
    durations = {str(s["key"]): int(s["durationUnits"]) for s in request["slices"]}
    return (
        starts[left] < starts[right] + durations[right]
        and starts[right] < starts[left] + durations[left]
    )


def staging(capacity: int) -> dict[str, Any]:
    """Two equal leaves each demanding the exclusive `staging` (the spec's scenario)."""
    return a_request(
        [a_slice("a", duration=10, demands=[("staging", 1)]),
         a_slice("b", duration=10, demands=[("staging", 1)])],
        resources={"staging": capacity},
    )


class ResourceClause(unittest.TestCase):
    def test_every_instance_here_is_a_valid_request(self) -> None:
        for request in (staging(1), staging(2), ram(32), ram(48), vector(), zero_length()):
            with self.subTest(keys=[s["key"] for s in request["slices"]]):
                self.assertEqual(validate_request(json.dumps(request).encode()), request)

    def test_two_staging_demanders_do_not_overlap(self) -> None:
        request = staging(1)
        value, starts = minimise(request, MAKESPAN)
        self.assertEqual(value, 20)
        self.assertFalse(overlaps(starts, request, "a", "b"))

    def test_the_same_pair_runs_together_when_two_are_free(self) -> None:
        value, starts = minimise(staging(2), MAKESPAN)
        self.assertEqual(value, 10)
        self.assertEqual(starts, {"a": 0, "b": 0})

    def test_divisible_units_admit_two_of_three_at_once(self) -> None:
        """32 GB and three leaves of 16: two run in parallel, the third waits."""
        value, starts = minimise(ram(32), MAKESPAN)
        self.assertEqual(value, 20)
        self.assertEqual(sorted(starts.values()), [0, 0, 10])

    def test_divisible_units_admit_all_three_when_they_fit(self) -> None:
        self.assertEqual(minimise(ram(48), MAKESPAN)[0], 10)

    def test_a_vector_is_held_over_one_span(self) -> None:
        """`z` demands both resources; `x` holds one and `y` the other over
        different spans. `z` overlaps neither: its units of both are held from
        one start to one finish, so no placement holds one while waiting."""
        request = vector()
        _, starts = minimise(request, MAKESPAN)
        self.assertFalse(overlaps(starts, request, "z", "x"))
        self.assertFalse(overlaps(starts, request, "z", "y"))

    def test_a_zero_length_demander_holds_nothing(self) -> None:
        self.assertEqual(minimise(zero_length(), MAKESPAN)[1]["m"], 0)


class ResourceInvariant(unittest.TestCase):
    """Invariant (10), refused by `check_cross_field` before any model is built."""

    def refused(self, request: dict[str, Any], match: str) -> None:
        with self.assertRaisesRegex(RequestRejected, match):
            validate_request(json.dumps(request).encode())

    def test_demand_on_an_unstated_resource_is_refused(self) -> None:
        request = staging(1)
        request["resources"] = {}
        self.refused(request, "has no capacity")

    def test_an_unsorted_vector_is_refused(self) -> None:
        request = vector()
        request["slices"][2]["demands"].reverse()
        self.refused(request, "sorted by resourceId")

    def test_a_resource_named_twice_is_refused(self) -> None:
        request = staging(1)
        request["slices"][0]["demands"].append({"resourceId": "staging", "units": 1})
        self.refused(request, "sorted by resourceId")

    def test_a_demand_above_its_capacity_is_refused(self) -> None:
        request = ram(32)
        request["resources"]["ram"] = 8
        self.refused(request, "which holds 8")

    def test_a_zero_unit_demand_is_refused_by_the_schema(self) -> None:
        request = staging(1)
        request["slices"][0]["demands"][0]["units"] = 0
        self.refused(request, "demands")

    def test_a_missing_demand_list_is_refused_by_the_schema(self) -> None:
        request = staging(1)
        del request["slices"][0]["demands"]
        self.refused(request, "demands")


def peak_loads(request: Mapping[str, Any], offsets: Mapping[str, int]) -> dict[str, int]:
    """The most units of each resource held at any one unit, by an independent sweep."""
    peaks: dict[str, int] = {}
    for resource_id in request["resources"]:
        events: list[tuple[int, int]] = []
        for slice_ in request["slices"]:
            for demand in slice_["demands"]:
                if demand["resourceId"] != resource_id or slice_["durationUnits"] == 0:
                    continue
                start = offsets[slice_["key"]]
                events.append((start, demand["units"]))
                events.append((start + slice_["durationUnits"], -demand["units"]))
        load = peak = 0
        for _, delta in sorted(events, key=lambda event: (event[0], event[1])):
            load += delta
            peak = max(peak, load)
        peaks[resource_id] = peak
    return peaks


class FixtureParity(unittest.TestCase):
    """Fast and CP-SAT agree on the shared resource fixtures.

    The fixtures are the Bun builder's own output (`resource-wire.test.ts` pins
    them byte for byte), so their `baselineOffsets` are Fast's answer. Both
    engines must find the plan feasible and neither may hold more units than a
    resource has: the staging pair never overlaps, and the 32 GB trio never
    runs three at once.
    """

    def test_both_engines_level_the_shared_fixtures(self) -> None:
        for name, expected_peaks in (
            ("valid-staging-resource.json", {"staging": 1}),
            ("valid-divisible-resource.json", {"ram": 32}),
        ):
            with self.subTest(fixture=name):
                request = validate_request((FIXTURES / name).read_bytes())
                fast = request["baselineOffsets"]
                response = solve_request(request, PINNED)
                self.assertEqual(response["status"], "feasible")
                self.assertEqual(peak_loads(request, fast), expected_peaks)
                self.assertEqual(peak_loads(request, response["offsets"]), expected_peaks)

    def test_the_staging_pair_does_not_overlap_in_either_engine(self) -> None:
        request = validate_request((FIXTURES / "valid-staging-resource.json").read_bytes())
        response = solve_request(request, PINNED)
        for offsets in (request["baselineOffsets"], response["offsets"]):
            self.assertEqual(sorted(offsets.values()), [0, 48])


def ram(capacity: int) -> dict[str, Any]:
    return a_request(
        [a_slice(key, duration=10, demands=[("ram", 16)]) for key in ("a", "b", "c")],
        resources={"ram": capacity},
    )


def vector() -> dict[str, Any]:
    return a_request(
        [a_slice("x", duration=10, demands=[("disk", 1)]),
         a_slice("y", duration=10, not_before=5, demands=[("ram", 1)]),
         a_slice("z", duration=10, demands=[("disk", 1), ("ram", 1)])],
        resources={"disk": 1, "ram": 1},
    )


def zero_length() -> dict[str, Any]:
    return a_request(
        [a_slice("a", duration=10, demands=[("staging", 1)]),
         a_slice("m", duration=0, work_item_is_milestone=True, demands=[("staging", 1)])],
        resources={"staging": 1},
    )


if __name__ == "__main__":
    unittest.main()
