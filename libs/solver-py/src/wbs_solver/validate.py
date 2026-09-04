"""Request validation: the schema, then the four things the schema cannot say.

THE SCHEMA IS NOT A COPY OF THE RULES, IT IS THE RULES
------------------------------------------------------
`solver-wire.v1.json` is the single normative definition of both messages
(design.md "Solver wire contract — one versioned schema, four consumers"). This
module is the third of that file's four consumers. It validates against the copy
installed **beside** the package, because a wheel deployed into the be-01 image
carries no `libs/contracts/` tree — and `tests/test_schema_copy.py` asserts that
copy is byte-identical to the checked-in original, so the two cannot drift
without a red test.

WHAT THE SCHEMA CANNOT ENFORCE
------------------------------
Its own `$comment` on `offsetMap` names three, and assigns them to "both
consumers" rather than to the schema. This is the Python half:

1. **Duplicate JSON member names.** `json.loads` and `JSON.parse` both silently
   keep the last one, so *no* schema anywhere can reject a duplicate — by the
   time a validator sees the document, the duplicate is gone. Caught here at
   parse time with an `object_pairs_hook`, over the whole document rather than
   only the offset maps: a duplicated `horizonUnits` is the same class of defect
   and costs nothing extra to catch.
2. **Key-set equality** between `slices[].key`, `baselineOffsets` and
   `fastHint`. `negative-printable-key.json` exists precisely to prove this is
   not the schema's job: a sanitised `wi-1::step-a` is a well-formed string, so
   the schema accepts it and only this check sees that the offset maps still key
   on the real U+0000.
3. **Every offset within the horizon.** `safeInteger` bounds each value by
   `Number.MAX_SAFE_INTEGER`, which is not the same as bounding it by this
   request's own `horizonUnits`.

And a fourth, of the same class and not in that list: **every edge endpoint is a
slice key.** An edge naming a slice that was never sent is not solvable, and the
schema has no way to say so — `sliceKey` is "a non-empty string" by
construction, so a typo'd endpoint is schema-legal. No corpus fixture covers it
yet; `tests/test_validate.py` builds one by mutating a valid request, and a
fixture belongs in the shared corpus when 2.1's cross-suite contract test is
extended.

Every failure raises `RequestRejected`, which `cli.main` turns into exit 64 with
the message on stderr and nothing on stdout.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

SCHEMA_FILENAME = "solver-wire.v1.json"
SCHEMA_PATH = Path(__file__).resolve().parent / SCHEMA_FILENAME


class RequestRejected(ValueError):
    """The request will not be solved, and the reason is in the message."""


def _no_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    seen: set[str] = set()
    for key, _ in pairs:
        if key in seen:
            raise RequestRejected(
                f"duplicate JSON member {key!r}: json.loads would keep only the last, "
                "so the request does not mean what it looks like"
            )
        seen.add(key)
    return dict(pairs)


def parse_request(raw: bytes) -> dict[str, Any]:
    """Bytes to object, refusing anything that is not one JSON object.

    Duplicate member names are refused here rather than downstream, because
    this is the last point at which they still exist.
    """
    if not raw.strip():
        raise RequestRejected("empty request: expected one JSON object on stdin")
    try:
        parsed = json.loads(raw, object_pairs_hook=_no_duplicate_members)
    except UnicodeDecodeError as exc:
        raise RequestRejected(f"request is not valid UTF-8: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RequestRejected(f"request is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise RequestRejected(f"request must be a JSON object, got {type(parsed).__name__}")
    return parsed


@lru_cache(maxsize=1)
def _validator(branch: str) -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    # The root asserts `not: {}` on purpose, so a consumer that forgets to
    # $ref a branch fails loudly. Reach the branch through a $ref document
    # rather than by lifting the subschema out, so every internal $ref in it
    # still resolves against the whole file.
    return Draft202012Validator(
        {"$schema": schema["$schema"], "$ref": f"#/$defs/{branch}", "$defs": schema["$defs"]}
    )


def validate_against_schema(message: dict[str, Any], branch: str = "request") -> None:
    """Raise `RequestRejected` naming every schema error, not just the first.

    All of them, sorted, because a request with three faults reported one at a
    time is three round trips through a deploy.
    """
    errors = sorted(_validator(branch).iter_errors(message), key=lambda e: list(e.absolute_path))
    if errors:
        detail = "; ".join(
            f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}" for e in errors
        )
        raise RequestRejected(f"request does not satisfy #/$defs/{branch}: {detail}")


def check_cross_field(request: dict[str, Any]) -> None:
    """The four invariants the schema cannot express. See the module docstring."""
    slice_keys = [s["key"] for s in request["slices"]]
    key_set = set(slice_keys)
    if len(key_set) != len(slice_keys):
        raise RequestRejected("slices[].key repeats: a slice key identifies one slice")

    for field in ("baselineOffsets", "fastHint"):
        offsets = request[field]
        if set(offsets) != key_set:
            missing = sorted(key_set - set(offsets))
            extra = sorted(set(offsets) - key_set)
            raise RequestRejected(
                f"{field} does not key on slices[].key "
                f"(missing {missing!r}, unexpected {extra!r})"
            )

    horizon = request["horizonUnits"]
    for field in ("baselineOffsets", "fastHint"):
        for key, value in request[field].items():
            if value > horizon:
                raise RequestRejected(
                    f"{field}[{key!r}] is {value}, past horizonUnits {horizon}"
                )

    for index, edge in enumerate(request["edges"]):
        for endpoint in ("predecessorKey", "successorKey"):
            if edge[endpoint] not in key_set:
                raise RequestRejected(
                    f"edges[{index}].{endpoint} {edge[endpoint]!r} is not a slice key"
                )


def validate_request(raw: bytes) -> dict[str, Any]:
    """Parse, validate, cross-check. The entrypoint's whole front door."""
    request = parse_request(raw)
    validate_against_schema(request, "request")
    check_cross_field(request)
    return request
