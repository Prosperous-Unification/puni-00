from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from test_cli import run_cli
from test_model import a_request, a_slice
from wbs_solver.solve import solve_request
from wbs_solver.validate import RequestRejected, validate_request


def booking_request(person: str | None = "person-a", duration: int = 3) -> dict:
    request = a_request([a_slice("s", duration=duration, person=person,
                                  work_item_is_milestone=duration == 0)], horizon=12)
    request.update(wireVersion=3, solverVersion="0.2.0", contractVersion="15+0.2.0",
                   elsewhere={"person-a": [[0, 5]]})
    return request


class ElsewhereReceiver(unittest.TestCase):
    def test_wire_three_with_fixed_bookings_is_accepted(self) -> None:
        request = booking_request()
        self.assertEqual(validate_request(json.dumps(request).encode()), request)

    def test_wire_two_is_refused_without_an_answer(self) -> None:
        request = booking_request()
        request["wireVersion"] = 2
        del request["elsewhere"]
        with self.assertRaises(RequestRejected):
            validate_request(json.dumps(request).encode())

    def test_wire_two_with_elsewhere_is_still_refused(self) -> None:
        request = booking_request()
        request["wireVersion"] = 2
        with self.assertRaisesRegex(RequestRejected, "wireVersion"):
            validate_request(json.dumps(request).encode())

    def test_wire_two_cli_exits_64_with_no_stdout(self) -> None:
        request = booking_request()
        request["wireVersion"] = 2
        del request["elsewhere"]
        completed = run_cli(json.dumps(request).encode())
        self.assertEqual(completed.returncode, 64)
        self.assertEqual(completed.stdout, b"")
        self.assertIn(b"wireVersion", completed.stderr)

    def test_historical_bundled_wire_two_schema_refuses_wire_three(self) -> None:
        from jsonschema import Draft202012Validator

        schema = json.loads((PACKAGE_ROOT / "src" / "wbs_solver" / "solver-wire.v2.json").read_text())
        validator = Draft202012Validator({"$ref": "#/$defs/request", "$defs": schema["$defs"]})
        self.assertFalse(validator.is_valid(booking_request()))

    def test_missing_elsewhere_is_refused(self) -> None:
        request = booking_request()
        del request["elsewhere"]
        with self.assertRaisesRegex(RequestRejected, "elsewhere"):
            validate_request(json.dumps(request).encode())

    def test_malformed_bookings_are_refused_at_the_production_boundary(self) -> None:
        for elsewhere in ({"": [[0, 1]]}, {"person-a": [[-1, 2]]},
                          {"person-a": [[0, True]]}, {"person-a": [[0, 1.5]]},
                          {"person-a": [[0, 2**53]]}, {"person-a": [[0]]},
                          {"person-a": [[0, 0]]}, {"person-a": [[2, 1]]},
                          {"person-a": [[0, 13]]},
                          {"person-a": [[4, 5], [0, 2]]},
                          {"person-a": [[0, 3], [2, 4]]}):
            with self.subTest(elsewhere=elsewhere):
                request = booking_request()
                request["elsewhere"] = elsewhere
                with self.assertRaises(RequestRejected):
                    validate_request(json.dumps(request).encode())

    def test_touching_bookings_and_empty_calendar_are_accepted(self) -> None:
        for elsewhere in ({}, {"person-a": []}, {"person-a": [[0, 2], [2, 5]]}):
            request = booking_request()
            request["elsewhere"] = elsewhere
            validate_request(json.dumps(request).encode())

    def test_duplicate_person_keys_are_refused_before_json_loses_them(self) -> None:
        raw = json.dumps(booking_request()).replace(
            '"elsewhere": {"person-a": [[0, 5]]}',
            '"elsewhere": {"person-a": [[0, 1]], "person-a": [[1, 2]]}')
        with self.assertRaisesRegex(RequestRejected, "duplicate JSON member"):
            validate_request(raw.encode())


class FixedBookings(unittest.TestCase):
    def solve(self, request: dict) -> dict:
        validated = validate_request(json.dumps(request).encode())
        return solve_request(validated)

    def test_fixed_booking_forces_the_selected_person_to_wait(self) -> None:
        response = self.solve(booking_request())
        self.assertEqual(response["wireVersion"], 3)
        self.assertEqual(response["offsets"]["s"], 5)

    def test_integer_valued_json_numbers_share_the_schema_integer_contract(self) -> None:
        request = booking_request()
        request["elsewhere"] = {"person-a": [[0.0, 5.0]]}
        self.assertEqual(self.solve(request)["offsets"]["s"], 5)

    def test_booking_end_is_a_legal_handoff(self) -> None:
        request = booking_request()
        request["slices"][0]["notBeforeUnits"] = 5
        self.assertEqual(self.solve(request)["offsets"]["s"], 5)

    def test_unassigned_and_other_people_keep_their_start(self) -> None:
        for person in (None, "person-b"):
            with self.subTest(person=person):
                self.assertEqual(self.solve(booking_request(person))["offsets"]["s"], 0)

    def test_zero_duration_milestone_has_no_booking_occupancy(self) -> None:
        self.assertEqual(self.solve(booking_request(duration=0))["offsets"]["s"], 0)

    def test_fixed_calendar_can_make_a_deadline_infeasible(self) -> None:
        request = booking_request(duration=48)
        request["horizonUnits"] = 96
        request["elsewhere"] = {"person-a": [[0, 48]]}
        request["slices"][0]["deadlineUnits"] = 48
        self.assertEqual(self.solve(request), {"wireVersion": 3, "status": "infeasible"})

    def test_person_calendar_does_not_spend_pool_capacity(self) -> None:
        request = booking_request(person="person-b")
        request["pools"] = {"team": 1}
        request["slices"][0]["poolIds"] = ["team"]
        self.assertEqual(self.solve(request)["offsets"]["s"], 0)
