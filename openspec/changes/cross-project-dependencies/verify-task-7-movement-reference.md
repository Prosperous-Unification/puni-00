# Bounded task 7.3/7.4 movement-reference parity — 2026-10-23

Base: `95051c235`. Production scope: core connected observation revalidation;
no wire, identity, durable codec, placement selection or activation changes.

The durable request already uses `round(localStart * quantum)` for its movement
reference. Core instead supplied raw local stage starts to the same publication
guard. Core now reconstructs the integer question's real movement origin from
local starts and the matched candidate question's quantum. Canonical stage bytes
and the existing identity comparison run first. The real baseline, foreign pins
and primary-objective comparison remain inputs to the existing domain guard.

## Evidence

The adjacent core regression uses a real fractional pinned baseline and checks
baseline movement `1/120`, candidate movement zero, both primary scores and
retained baseline placement. The backend regression uses migrated SQLite, actual
Fast scheduling and the production captured cache reader: Fast A duration 0.2
precedes optimized B duration 1 by FS, with equal project anchors and Q48. The
actual estimated Fast boundary is `0.19999999999999998`; the integer reference
and candidate offset are both 10. The durable success, core decision and saved
history have exactly equal comparison objects. Literal assertions independently
require movement near `1/120`, candidate movement zero, quantisation-floor,
chosen baseline and retained A/B placements.

| Check                                                                                    | Observed result                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Initial core regression against raw starts                                               | Failed: baseline movement 0 instead of 1/120                                                             |
| Initial migrated saved regression, after allowing ordinary estimate float representation | Failed at saved baseline movement: 0 instead of 1/120; durable assertions had passed                     |
| Focused four-file suite after fix                                                        | 120 passed, 0 failed, 391 assertions                                                                     |
| Watched production fault: replace `Math.round(start * quantum) / quantum` with `start`   | Failed at saved history baseline movement assertion: 0 instead of 1/120; 0 passed, 1 failed, 26 filtered |
| Restore production expression; repeat four-file suite                                    | 120 passed, 0 failed, 391 assertions                                                                     |

Commands (repository root):

```sh
BUN_TMPDIR=/tmp bun install --frozen-lockfile
bun test libs/wbs/application/core/src/service/connected-optimization.test.ts apps/wbs/be-01/src/service/saved-plan-connected.test.ts libs/wbs/domain/contracts/solver/src/connected-solver-outcome.test.ts libs/wbs/domain/domain/src/connected-publication.test.ts --timeout=10000
bun test apps/wbs/be-01/src/service/saved-plan-connected.test.ts --test-name-pattern 'saved fractional FS' --timeout=10000
NX_DAEMON=false bunx nx run-many -t lint typecheck -p wbs-core wbs-be-01 --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache --output-style=static --verbose
bunx prettier --check libs/wbs/application/core/src/service/connected-optimization.ts libs/wbs/application/core/src/service/connected-optimization.test.ts apps/wbs/be-01/src/service/saved-plan-connected.test.ts openspec/changes/cross-project-dependencies/verify-task-7-movement-reference.md
bunx openspec validate --all --json
```

Frozen install checked 1801 installs across 1648 packages. Initial install needed
`BUN_TMPDIR=/tmp` because the default temporary directory was read-only. Nx fell
back to in-process plugins after the sandbox denied its worker socket. The first
backend typecheck found optional expected-value typing in the new test; an
explicit required comparison narrowing corrects that test issue.

Configured core lint, module typecheck and typecheck passed. Backend module
typecheck and typecheck passed on rerun after required comparison narrowing.
A direct diagnostic lint run identified the new test's import ordering; the
configured sorter corrected it. The standalone configured backend lint rerun
passed (exit 0).
Changed-file Prettier and `git diff --check` passed. OpenSpec validation passed
all 273 items (255 changes, 18 specs). The final four-file suite again passed
120 tests with 391 assertions after the test corrections.

Diagnostic logs remain under `/tmp/connected-reference-*.log` in the isolated
execution workspace; they are local receipts, not host acceptance evidence.

## Limits

This packet restores agreement with the existing durable question. It does not
complete parent tasks 7.3/7.4, installed Python/image acceptance, the complete
calendar/capacity matrices or a final-composite placement defect. No host gate,
full repository test/build, secrets scan, migration lint, live deployment,
activation, push or merge is claimed. Astra High independently approved this
bounded correction with no findings. After integration as `c1f4c3411`, the
four-file suite passed 120 tests/391 assertions; configured core/backend lint
and typecheck, including module checks, passed uncached. The exact-SHA host
gate remains required.
