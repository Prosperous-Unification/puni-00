"""The solve entrypoint: read one request from stdin, write one response to
stdout, exit.

ORDER MATTERS, AND IT IS THE FIRST THING THIS MODULE DOES
---------------------------------------------------------
`prctl(PR_SET_PDEATHSIG, SIGKILL)` is installed **before** stdin is read
(tasks.md 5.1). A solver child that is reparented while it is blocked on a
read would otherwise sit in the process table until someone went looking for
it, and the whole concurrency ceiling in design.md rests on the OS count of
live `wbs-solver` processes not exceeding the count of `running` slot rows.
Blocking on stdin is exactly where a child waits longest, so the window that
matters is the one between spawn and the first read.

In production this is a **re-assertion**: 6.2b's launcher sets the same flag
before the bind and it survives the `exec` onto this pid. It is kept here for
the direct-spawn smoke test, where no launcher ran, and because a defence that
only exists one layer up is a defence that disappears the first time someone
spawns the solve entrypoint directly.

EXIT CODES
----------
The coordinator distinguishes zero from non-zero and nothing finer: every
non-zero exit is `internal-error` to it. The distinct values below exist for
whoever is reading a log.

  0   a response was written to stdout
  64  the request was refused before solving (framing, encoding, shape)
  70  the solve could not answer

**A non-zero exit writes nothing to stdout.** That is not tidiness: the
response schema admits no "I failed" status, so a partial or invented message
would be a lie the coordinator cannot detect (solver-wire.v1.json, the
response `$comment`). Diagnostics go to stderr.
"""

from __future__ import annotations

import ctypes
import json
import os
import signal
import sys
from typing import Any, BinaryIO, Sequence, TextIO

from . import __version__
from .solve import solve_request

EXIT_OK = 0
EXIT_BAD_REQUEST = 64
EXIT_INTERNAL = 70

# linux/prctl.h. Not importable from anywhere in the stdlib, so it is written
# out with its provenance rather than looked up.
PR_SET_PDEATHSIG = 1


def set_parent_death_signal() -> bool:
    """Ask the kernel to SIGKILL this process when its parent dies.

    Returns True when the flag was installed, False when the platform has no
    such call. On Linux a failure is raised rather than reported: the ceiling
    described in this module's docstring is only sound if this worked, and a
    silent no-op there would be the ceiling quietly ceasing to exist.

    Off Linux it is a no-op with a note on stderr. macOS has no equivalent and
    developer machines are not where the ceiling is enforced; a hard failure
    would make the package unrunnable on the only machines that read its
    tracebacks.
    """
    if sys.platform != "linux":
        print(
            f"wbs-solver: PR_SET_PDEATHSIG unavailable on {sys.platform}; "
            "this process will not die with its parent",
            file=sys.stderr,
        )
        return False

    libc = ctypes.CDLL(None, use_errno=True)
    prctl = libc.prctl
    prctl.restype = ctypes.c_int
    prctl.argtypes = [
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
    ]
    ctypes.set_errno(0)
    if prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0) != 0:
        err = ctypes.get_errno()
        raise OSError(err, f"prctl(PR_SET_PDEATHSIG, SIGKILL) failed: {os.strerror(err)}")
    return True


def read_request(stream: BinaryIO) -> bytes:
    """Read the whole request. Named so the ordering test can watch it."""
    return stream.read()


def _parse(raw: bytes) -> dict[str, Any]:
    if not raw.strip():
        raise ValueError("empty request: expected one JSON object on stdin")
    try:
        parsed = json.loads(raw)
    except UnicodeDecodeError as exc:
        raise ValueError(f"request is not valid UTF-8: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"request is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"request must be a JSON object, got {type(parsed).__name__}")
    return parsed


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    stdout: TextIO = sys.stdout
    stderr: TextIO = sys.stderr

    # Before stdin. See the module docstring: this is the whole point of the
    # ordering, and `--version` gets it too because a coordinator probing the
    # version has the same reason to want the child gone with it.
    set_parent_death_signal()

    if argv == ["--version"]:
        # Bare, newline-terminated, nothing else on stdout. The coordinator
        # reads this to build `contractVersion`; anything decorative here is a
        # parser somewhere else.
        print(__version__, file=stdout)
        return EXIT_OK
    if argv:
        print(f"wbs-solver: unexpected arguments {argv!r}; usage: wbs-solver [--version]", file=stderr)
        return EXIT_BAD_REQUEST

    try:
        request = _parse(read_request(sys.stdin.buffer))
    except ValueError as exc:
        print(f"wbs-solver: {exc}", file=stderr)
        return EXIT_BAD_REQUEST

    try:
        response = solve_request(request)
    except NotImplementedError as exc:
        print(f"wbs-solver: {exc}", file=stderr)
        return EXIT_INTERNAL

    json.dump(response, stdout, separators=(",", ":"), sort_keys=True)
    stdout.write("\n")
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover - exercised via __main__.py
    raise SystemExit(main())
