Ordered TDD slices; every oracle is `bash bin/h2puni-gate.test.sh` against the production library.

## 1. Readable checkout

- [x] 1.1 Case 37: a gate launched under umask 077 leaves a rewritten file readable by others — red before `umask 022`.
- [x] 1.2 Case 38: a 0600 tracked file and a 0700 tracked directory are refused with exit 66 and named — red before the scans.
- [x] 1.3 Case 39: a failing file scan fails the gate and restores the branch — red with both scans folded into one substitution.
- [x] 1.4 Case 40: `H2PUNI_GATE_REPAIR_MODES=1` widens the file and directory, runs the steps and leaves a symlink target alone — red before the repair branch.
- [x] 1.5 Document exit 66 in the Gate section of `AGENTS.md`.
