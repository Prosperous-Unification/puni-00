"""Connected stage tests enter through the installed schema, model and solve path."""

from __future__ import annotations

import json
import sys
import unittest
from unittest import mock

from ortools.sat.python import cp_model
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from test_model import a_request, a_slice  # noqa: E402
from wbs_solver.solve import SolverConfig, baseline_bound, solve_request  # noqa: E402
from wbs_solver.validate import RequestRejected, validate_request  # noqa: E402


def connected_request() -> dict:
    request = a_request([a_slice("b", duration=48)], horizon=96)
    request.pop("baselineOffsets")
    request.pop("fastHint")
    request["scope"] = {
        "kind": "connected-stage", "projectId": "B", "inputHash": "input", "questionHash": "question",
        "originOrdinal": 0,
        "projects": [
            {"projectId": "A", "rank": 0, "anchorOrdinal": 0},
            {"projectId": "B", "rank": 1, "anchorOrdinal": 0},
            {"projectId": "C", "rank": 2, "anchorOrdinal": 0},
        ],
        "fixed": [
            {"projectId": "A", "key": "a", "start": 0, "finish": 0.2},
            {"projectId": "C", "key": "c", "start": 1.2, "finish": 2.2},
        ],
        "boundaries": [
            {"localKey": "b", "foreignProjectId": "A", "foreignKey": "a", "relationshipId": "ab", "type": "FS", "direction": "incoming", "minimumStartUnits": 10},
            {"localKey": "b", "foreignProjectId": "C", "foreignKey": "c", "relationshipId": "bc", "type": "FS", "direction": "outgoing", "maximumStartUnits": 9},
        ],
        "occupancy": [],
    }
    request["movementReferenceOffsets"] = {"b": 10}
    request["feasibleBaselineOffsets"] = None
    request["seedOffsets"] = {"b": 10}
    return request


def enter(request: dict) -> dict:
    return validate_request(json.dumps(request).encode())


class ConnectedStage(unittest.TestCase):
    def test_quantized_empty_window_is_boundary_infeasible_without_a_deadline(self) -> None:
        request = enter(connected_request())
        answer = solve_request(request, SolverConfig(num_search_workers=1))
        self.assertEqual(answer, {"wireVersion": 5, "scope": {
            "kind": "connected-stage", "projectId": "B", "inputHash": "input", "questionHash": "question",
        }, "status": "boundary-infeasible"})

    def test_deadline_alone_does_not_create_a_boundary_certificate(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"] = []
        request["slices"][0]["deadlineUnits"] = 0
        self.assertEqual(solve_request(enter(request))["status"], "infeasible")

    def test_a_nonbinding_deadline_does_not_change_boundary_classification(self) -> None:
        request = connected_request()
        request["slices"][0]["deadlineUnits"] = 144
        self.assertEqual(solve_request(enter(request))["status"], "boundary-infeasible")

    def test_removing_each_inequality_allows_a_different_feasible_placement(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"].pop(1)
        answer = solve_request(enter(request))
        self.assertEqual(answer["status"], "feasible")
        self.assertGreaterEqual(answer["offsets"]["b"], 10)
        request = connected_request()
        request["scope"]["boundaries"].pop(0)
        answer = solve_request(enter(request))
        self.assertEqual(answer["status"], "feasible")
        self.assertLessEqual(answer["offsets"]["b"], 9)

    def test_shared_person_occupancy_blocks_local_start_and_requires_exact_booking(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"] = []
        request["slices"][0]["personId"] = "ana"
        request["scope"]["occupancy"] = [
            {"personId": "ana", "projectId": "A", "key": "a", "start": 0, "finish": 0.2},
        ]
        request["elsewhere"] = {"ana": [[0, 10]]}
        answer = solve_request(enter(request))
        self.assertEqual(answer["status"], "feasible")
        self.assertGreaterEqual(answer["offsets"]["b"], 10)
        request["elsewhere"] = {}
        with self.assertRaisesRegex(RequestRejected, "occupancy"):
            enter(request)

    def test_external_fs_ss_ff_incoming_bounds_reach_the_model(self) -> None:
        for relationship_type in ("FS", "SS", "FF"):
            with self.subTest(relationship_type=relationship_type):
                request = connected_request()
                request["scope"]["boundaries"] = [{
                    "localKey": "b", "foreignProjectId": "A", "foreignKey": "a",
                    "relationshipId": "ab", "type": relationship_type,
                    "direction": "incoming", "minimumStartUnits": 10,
                }]
                answer = solve_request(enter(request))
                self.assertEqual(answer["status"], "feasible")
                self.assertGreaterEqual(answer["offsets"]["b"], 10)

    def test_external_fs_ss_ff_outgoing_upper_bounds_reach_the_model(self) -> None:
        for relationship_type in ("FS", "SS", "FF"):
            with self.subTest(relationship_type=relationship_type):
                request = connected_request()
                request["scope"]["boundaries"] = [{
                    "localKey": "b", "foreignProjectId": "C", "foreignKey": "c",
                    "relationshipId": "bc", "type": relationship_type,
                    "direction": "outgoing", "maximumStartUnits": 9,
                }]
                request["slices"][0]["notBeforeUnits"] = 10
                self.assertEqual(solve_request(enter(request))["status"], "boundary-infeasible")
                request["scope"]["boundaries"] = []
                self.assertEqual(solve_request(enter(request))["status"], "feasible")

    def test_second_expanded_pair_is_not_omitted(self) -> None:
        request = connected_request()
        request["scope"]["fixed"].append({
            "projectId": "A", "key": "a2", "start": 0, "finish": 0.5,
        })
        request["scope"]["boundaries"] = [
            {"localKey": "b", "foreignProjectId": "A", "foreignKey": "a",
             "relationshipId": "ab", "type": "FS", "direction": "incoming", "minimumStartUnits": 10},
            {"localKey": "b", "foreignProjectId": "A", "foreignKey": "a2",
             "relationshipId": "ab", "type": "FS", "direction": "incoming", "minimumStartUnits": 25},
        ]
        answer = solve_request(enter(request))
        self.assertEqual(answer["status"], "feasible")
        self.assertGreaterEqual(answer["offsets"]["b"], 25)

    def test_nontrivial_foreign_occupancy_infeasibility_is_a_boundary_state(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"] = []
        request["slices"][0]["personId"] = "ana"
        request["slices"][0]["deadlineUnits"] = 96
        request["scope"]["fixed"][0]["finish"] = 2
        request["scope"]["occupancy"] = [
            {"personId": "ana", "projectId": "A", "key": "a", "start": 0, "finish": 2},
        ]
        request["elsewhere"] = {"ana": [[0, 96]]}
        self.assertEqual(solve_request(enter(request))["status"], "boundary-infeasible")
        request["scope"]["occupancy"] = []
        request["elsewhere"] = {}
        self.assertEqual(solve_request(enter(request))["status"], "feasible")

    def test_schema_rejects_unknown_connected_members_and_old_wire(self) -> None:
        # Proof: opening scope-connected.additionalProperties admitted the
        # unexpected scope member (Nx 271 tests: 3 failures, including this
        # assertion and both byte-identical-copy checks).
        for location in ("request", "scope", "boundary"):
            with self.subTest(location=location):
                request = connected_request()
                target = (request if location == "request" else request["scope"]
                          if location == "scope" else request["scope"]["boundaries"][0])
                target["unexpectedMember"] = 1
                with self.assertRaises(RequestRejected):
                    enter(request)
        request = connected_request()
        request["wireVersion"] = 4
        with self.assertRaises(RequestRejected):
            enter(request)

    def test_unknown_search_is_not_relabelled_boundary_infeasible(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"] = []
        with mock.patch("wbs_solver.solve._configure") as configure:
            configure.return_value.solve.return_value = cp_model.UNKNOWN
            configure.return_value.wall_time = 0.0
            answer = solve_request(enter(request))
        self.assertEqual(answer["status"], "unknown")
        self.assertNotIn("offsets", answer)

    def test_invalid_fixed_owner_is_rejected_before_solve(self) -> None:
        request = connected_request()
        request["scope"]["fixed"][0]["projectId"] = "B"
        with self.assertRaisesRegex(RequestRejected, "foreign fixed"):
            enter(request)

    def test_seed_is_not_promoted_to_a_feasible_baseline_witness(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"] = []
        request["seedOffsets"] = {"b": 0}
        self.assertIsNone(baseline_bound(enter(request)))
        request["feasibleBaselineOffsets"] = {"b": 0}
        self.assertIsNotNone(baseline_bound(enter(request)))

    def test_infeasible_declared_witness_is_rejected_but_seed_is_allowed(self) -> None:
        request = connected_request()
        request["scope"]["boundaries"].pop(1)
        self.assertEqual(solve_request(enter(request))["status"], "feasible")
        request["feasibleBaselineOffsets"] = {"b": 0}
        with self.assertRaisesRegex(RequestRejected, "feasibleBaselineOffsets"):
            solve_request(enter(request))


if __name__ == "__main__":
    unittest.main()
