"""The entrypoint's two contracts: what it does before it reads, and what it
refuses.

Split deliberately into in-process tests and subprocess tests. The in-process
ones can watch call order, which is the whole subject of `PDEATHSIG`; the
subprocess ones are the only ones that prove the real `sys.stdin.buffer` path
and that a refusal leaves stdout empty, which no monkeypatched stream can show.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SRC = PACKAGE_ROOT / "src"
FIXTURES = PACKAGE_ROOT.parents[1] / "libs" / "contracts" / "solver" / "fixtures" / "request"
sys.path.insert(0, str(SRC))

from wbs_solver import __version__, cli  # noqa: E402


def run_cli(stdin: bytes, args: list[str] | None = None) -> subprocess.CompletedProcess[bytes]:
    """The real console script path, as a child process.

    `-m wbs_solver` rather than the installed `wbs-solver` script on purpose:
    the suite runs in CI from a checkout, and `__main__.py` calls the same
    `main`. The installed script is proved from the built image by 5.11's
    smoke test, which is a different claim and belongs there.
    """
    env = dict(os.environ, PYTHONPATH=str(SRC))
    return subprocess.run(
        [sys.executable, "-m", "wbs_solver", *(args or [])],
        input=stdin,
        capture_output=True,
        env=env,
        timeout=30,
        check=False,
    )


class ParentDeathSignalOrdering(unittest.TestCase):
    """`prctl(PR_SET_PDEATHSIG, SIGKILL)` is installed before stdin is read.

    Watched red: move `set_parent_death_signal()` in `cli.main` to after the
    `read_request` call and this fails on the recorded order, naming both
    calls. Delete it entirely and `installs_it_at_all` fails too.
    """

    def _record(self) -> list[str]:
        return []

    def test_pdeathsig_is_installed_before_the_first_read(self) -> None:
        calls = self._record()
        with (
            mock.patch.object(cli, "set_parent_death_signal", lambda: calls.append("pdeathsig") or True),
            mock.patch.object(cli, "read_request", lambda stream: calls.append("read") or b""),
        ):
            code = cli.main([])
        self.assertEqual(calls, ["pdeathsig", "read"])
        # The empty read is a refusal, which is the next test's subject; it is
        # asserted here only so a silently-changed exit code cannot make the
        # order above vacuous.
        self.assertEqual(code, cli.EXIT_BAD_REQUEST)

    def test_pdeathsig_is_installed_before_version_is_printed(self) -> None:
        calls = self._record()
        with (
            mock.patch.object(cli, "set_parent_death_signal", lambda: calls.append("pdeathsig") or True),
            mock.patch("sys.stdout", io.StringIO()),
        ):
            code = cli.main(["--version"])
        self.assertEqual(calls, ["pdeathsig"])
        self.assertEqual(code, cli.EXIT_OK)

    @unittest.skipUnless(sys.platform == "linux", "PR_SET_PDEATHSIG is Linux-only")
    def test_installs_it_at_all(self) -> None:
        """The real call, against the real libc. Returns True or raises.

        This is the non-vacuous half: the ordering tests above would pass with
        a `set_parent_death_signal` that did nothing.
        """
        self.assertTrue(cli.set_parent_death_signal())


class VersionFlag(unittest.TestCase):
    def test_prints_the_bare_version_and_nothing_else(self) -> None:
        done = run_cli(b"", ["--version"])
        self.assertEqual(done.returncode, cli.EXIT_OK)
        self.assertEqual(done.stdout.decode(), f"{__version__}\n")

    def test_does_not_read_stdin(self) -> None:
        """A coordinator probing the version writes nothing and closes nothing.

        With stdin held open and empty, a `--version` that read it would block
        until the timeout rather than answering. `input=b""` closes stdin, so
        the blocking case is built explicitly with a pipe nobody writes to.
        """
        env = dict(os.environ, PYTHONPATH=str(SRC))
        with subprocess.Popen(
            [sys.executable, "-m", "wbs_solver", "--version"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        ) as proc:
            out, _ = proc.communicate(timeout=30)
        self.assertEqual(proc.returncode, cli.EXIT_OK)
        self.assertEqual(out.decode(), f"{__version__}\n")


class RefusedRequests(unittest.TestCase):
    """Every refusal exits 64 and writes nothing at all to stdout.

    The stdout assertion is the one that matters. The response schema has no
    status for "refused", so a solver that emitted a partial message here would
    be handing the coordinator something it cannot tell from a solved answer.
    """

    def assert_refused(self, stdin: bytes, because: str) -> None:
        done = run_cli(stdin)
        self.assertEqual(done.returncode, cli.EXIT_BAD_REQUEST, done.stderr)
        self.assertEqual(done.stdout, b"")
        self.assertIn(because, done.stderr.decode())

    def test_empty_stdin(self) -> None:
        self.assert_refused(b"", "empty request")

    def test_whitespace_only(self) -> None:
        self.assert_refused(b"  \n\t ", "empty request")

    def test_not_json(self) -> None:
        self.assert_refused(b"{not json", "not valid JSON")

    def test_not_utf8(self) -> None:
        self.assert_refused(b'{"wireVersion": "\xff\xfe"}', "not valid UTF-8")

    def test_json_array(self) -> None:
        self.assert_refused(b"[1, 2]", "must be a JSON object")

    def test_json_scalar(self) -> None:
        self.assert_refused(b"7", "must be a JSON object")

    def test_unexpected_argument(self) -> None:
        done = run_cli(b"", ["--daemon"])
        self.assertEqual(done.returncode, cli.EXIT_BAD_REQUEST)
        self.assertEqual(done.stdout, b"")
        self.assertIn("unexpected arguments", done.stderr.decode())


class UnansweredRequests(unittest.TestCase):
    def test_a_valid_request_the_solver_cannot_place_exits_70_silently(self) -> None:
        """The rule, not the stub.

        Task 5.2 replaces `solve_request`, and this case will then be about a
        solved response instead. What it is testing is durable either way: an
        outcome the response schema cannot encode exits non-zero **without**
        emitting a response. Today the unencodable outcome is "no model yet";
        after 5.2 it is a later-stage INFEASIBLE, which the schema's own
        `$comment` requires to exit non-zero silently for the same reason.

        The input is a real corpus fixture, not a hand-built stub: it has to
        clear the schema and every cross-field check to reach `solve_request`
        at all, so this case doubles as the proof that a **valid** request
        gets all the way through the front door.
        """
        request = (FIXTURES / "valid-two-slices.json").read_bytes()
        done = run_cli(request)
        self.assertEqual(done.returncode, cli.EXIT_INTERNAL, done.stderr)
        self.assertEqual(done.stdout, b"")
        self.assertIn("5.2", done.stderr.decode())


if __name__ == "__main__":
    unittest.main()
