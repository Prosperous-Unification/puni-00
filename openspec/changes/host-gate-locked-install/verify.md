# Verification

A0 baseline: OpenSpec validation reported 108 passed and 0 failed.

Slice B observations, 2026-09-21:

- B0: `prerequisite-b0.txt` recorded `installs=0 proofs=3 proofs-before-install=3`.
- B0: `harness-b0.log` recorded exit 0, `all cases passed`, and 85 `ok:` lines.
- B0: `devsync-b0.log` ran 45 tests across the two focused files; 43 passed and the two
  `durable dev poller` cases named in sandbox rule 21 failed with
  `fatal: failed to create link ... Invalid cross-device link`, so the focused files remain
  pending planner verification outside the sandbox.
- B5: `harness-b5-red.log` recorded exit 1, 10 failing cases, and 85 `ok:` lines before
  the install existed. The failures included
  `the gate does not install against the frozen lockfile`,
  `a refused frozen install refuses the gate steps: want exit 1, got 0`, and
  `a missing installer refuses the gate steps: want exit 127, got 0`.
- B7: `harness-b7-green.log` recorded exit 0, `all cases passed`, and 95 `ok:` lines after
  the frozen install was added before OpenSpec validation.
- B8: `shellcheck-b8.log` recorded exit 0 with no diagnostics for both gate scripts.
