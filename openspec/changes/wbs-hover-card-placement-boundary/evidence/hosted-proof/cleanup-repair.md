# Hosted cleanup repair

Candidate source remains frozen at
`3624eadc3799448dbb217c3c8f6aae0818328af7`, tree
`0a98ab3cd44dee9019da3528b84eeb596f678341`. This follow-up changes only the proof
branch and its cleanup regression; it does not certify or close WBS100.

[Hosted run 38868232284](https://github.com/Prosperous-Unification/puni-00/actions/runs/38868232284)
used proof commit `09e008176ffa24c7f622199ea5fa3a8f17986719` and finished with
**overall failure**. Fresh `gh run view --json status,conclusion,jobs,url` output
confirmed successful source/package identity checks, selected F7 and full
fourteen-rule comparisons, committed oversized-file and comparator negatives,
frozen install, all four serial Chromium groups, diagnostics and artifact upload.
The final swap cleanup alone failed. Successful core steps are retained evidence;
they do not turn the overall job green.

The retained [artifact 12031654944](https://github.com/Prosperous-Unification/puni-00/actions/runs/38868232284/artifacts/12031654944)
is `wbs-hover-card-3624ead-proof-38868232284-1`, 32,653,813 bytes. Fresh API
metadata reports digest
`sha256:593c95a6f554fac77674a22d00e5ef9fcf922cc9f1284ba51c51eb2bbad4e04d`
and `expired: false`. This repair did not download or independently rehash it.

`gh run view 38868232284 --log-failed` showed `rg: command not found` inside the
cleanup membership condition. Because that pipeline was an `if` condition, the
failure skipped `swapoff`; the following `sudo rm` tried to remove an active swap
file and failed with `Operation not permitted`.

The production cleanup now reads `/proc/swaps` with `awk` in a required command
assignment before branching. Missing state or tools fail that assignment under
`set -e`. An active file is passed to `sudo swapoff` before removal, and a failed
`swapoff` stops the shell before `rm`.

## Local shell proof

`bun test openspec/changes/wbs-hover-card-placement-boundary/evidence/hosted-proof/cleanup.test.mjs`
executes the actual workflow cleanup block with scratch paths, fake `sudo`, and a
restricted PATH containing no `rg`. No real swap or privileged operation runs.
The unchanged workflow failed four cases and passed one; the repaired workflow
passed all five cases with 16 assertions.

| Injected condition           | Observed production-block outcome after repair                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active swap with `rg` absent | Calls `swapoff`, then `rm`; exits 0 and removes the scratch file. The old block emitted `rg: command not found` and attempted active-file removal. |
| Inactive swap                | Calls only `rm`; exits 0.                                                                                                                          |
| `swapoff` exits 42           | Exits 42, never calls `rm`, preserves the file.                                                                                                    |
| Required swap state absent   | Exits nonzero, makes no `sudo` calls, preserves the file.                                                                                          |
| Required `awk` absent        | Exits 127, makes no `sudo` calls, preserves the file.                                                                                              |

The workflow runs the same small regression before creating its hosted swap.
An adjacent `Proof:` comment names the observed failure. Scoped ESLint on the new
test exited 0. Prettier, YAML parse and shell syntax are checked before the
normal-hook commit. The replacement hosted run must supply its own result;
no local survey or browser rerun was performed for this repair.
