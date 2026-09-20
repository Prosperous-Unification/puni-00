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

Slice C observations, 2026-09-21:

- C0: `c0-harness-baseline.log` recorded exit 0, `all cases passed`, and 95 `ok:` lines.
- C0: `c0-focused-devsync-baseline.log` ran 45 tests across the two focused files; 43
  passed and only the two `durable dev poller` cases named in sandbox rule 21 failed with
  `fatal: failed to create link ... Invalid cross-device link`, so the focused files remain
  pending planner verification outside the sandbox.
- F1: `f1-delete-install.log` recorded exit 1, 85 `ok:` lines, ten failures, and
  `FAIL: the gate does not install against the frozen lockfile` after deleting the install.
- F2: `f2-drop-frozen.log` recorded exit 1, 94 `ok:` lines, one failure, and
  `FAIL: the gate does not install against the frozen lockfile` after dropping
  `--frozen-lockfile`.
- F3: `f3-move-after-openspec.log` recorded exit 1, 91 `ok:` lines, four failures, and
  `FAIL: the install does not precede OpenSpec validation (install line '2', validate line
'1')` after moving the install below the OpenSpec block.
- F4: `f4-mask-install-failure.log` recorded exit 1, 89 `ok:` lines, six failures, and
  `FAIL: a refused frozen install refuses the gate steps: want exit 1, got 0` after appending
  `|| true`.
- F5: `f5-optional-installer.log` recorded exit 1, 92 `ok:` lines, three failures, and
  `FAIL: a missing installer refuses the gate steps: want exit 127, got 0` after making the
  install conditional on `command -v bun`.
- F6: `f6-validate-before-missing-installer-exit.log` recorded exit 1, 94 `ok:` lines, one
  failure, and `FAIL: the missing installer allowed OpenSpec validation` after validating
  before exiting 127 when `bun` was absent.
- Each `f1-restored-green.log` through `f6-restored-green.log` recorded exit 0,
  `all cases passed`, and 95 `ok:` lines after byte-for-byte restoration and `cmp`.
- C8: `c8-harness-final.log` recorded exit 0, `all cases passed`, and 95 `ok:` lines;
  `c8-shellcheck.log` recorded exit 0 with no diagnostics; and `c8-prerequisite.txt` recorded
  `installs=1 proofs=4 proofs-before-install=1`.
- C9: `final-focused-devsync.log` reproduced the C0 sandbox baseline after the edits: 43
  passed, and only the same two named `durable dev poller` cases failed with
  `Invalid cross-device link`; planner verification remains pending.
