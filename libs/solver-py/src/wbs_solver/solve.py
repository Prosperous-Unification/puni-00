"""The placement seam.

The CP-SAT model, the three cost terms and the two stagings are tasks.md 5.2,
and this module is deliberately empty until that task lands. It raises rather
than returning a plausible-looking response: a stub that answered would make
5.2's own tests green against nothing, and the coordinator has no way to tell a
made-up schedule from a solved one.

`cli.main` turns this into exit 70 with the message on stderr and **no** bytes
on stdout, which is the rule the response schema states for every outcome it
cannot encode.
"""

from __future__ import annotations

from typing import Any


def solve_request(request: dict[str, Any]) -> dict[str, Any]:
    raise NotImplementedError(
        "the CP-SAT model is tasks.md 5.2; this build validates and frames the "
        "request but cannot place it"
    )
