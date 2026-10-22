# C3 bounded frontend comparison summaries (2026-10-22)

Owned clone `/tmp/puni-c3-ui`, base `3757ad13c`. This slice consumes C2's
required side summaries; it does not activate connected save/current or complete
task 8.3.

The comparison ready state retains the shape-derived summaries. Shelf metadata
supplies picker titles only; schedule presence, absence and provenance come from
the frozen response even when the diff is empty. Each side has a distinct named
region. Native disclosures preserve component labels, idle members, stage
engine/objective/observation/selection, both captured objective outcomes, exact
canonical boundary bytes, origin ordinal and foreign interval offsets. Pending
and retrying are historical statements without live retry controls. Captured
whole-plan infeasibility and boundary infeasibility remain separate; neither
hides a valid captured schedule.

The browser adapter binds decoded source identities to each requested side and
connected target identities to the requested project. Shape-valid wrong-side or
wrong-project evidence returns the existing `invalid_response` failure. Render
switches throw impossible source/provenance/placement/objective unions into the
Error Boundary independently of the HTTP schema.

## Commands and results

Run from the clone root unless stated otherwise. `NX_DAEMON=false` and
`NX_ISOLATE_PLUGINS=false` avoid sandbox-denied Unix sockets.

- From `apps/wbs/fe-01`: `TZ=UTC bunx vitest run src/components/wbs/saved-plan-history.test.tsx src/components/wbs/saved-plan-compare.test.tsx src/components/wbs/saved-plans-panel.test.tsx src/lib/saved-plan-api.test.ts src/lib/saved-plan-compare.test.ts src/modules/saved-plans/saved-plans.feature.test.ts src/test-tiers.test.ts --no-file-parallelism --maxWorkers=1`: PASS, 7 files / 117 tests.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck`:
  PASS, module and application targets. A test Error Boundary initially lacked
  required `override` modifiers; these were fixed before the passing rerun.
- `bunx openspec validate --all --json`: PASS, 269 items (251 changes, 18 specs).
- `bunx openspec validate cross-project-dependencies --strict --json`: FAIL
  solely on the ten existing long-requirement warnings. The requirement text
  was not changed by C3; the added scenarios introduce no validation errors.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:install`:
  PASS; normal hooks installed in the isolated clone.

The first full frontend lint target exited nonzero after 1m40s with only the Nx
wrapper failure and no source diagnostic. A retry capped at 768 MiB failed with
`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`.
Scoped lint separately caught import sorting, unsafe RequestInfo stringification
in the test and a redundant source ternary; those were fixed. The full target
was retried at 2048 MiB. Final lint/format/hook outcomes are recorded below.

## Production-path negative proofs

The initial five tests failed before implementation: missing frozen provenance
regions and four wrongly admitted identity mismatches. Restoring production
behavior made them pass. Further independent mutations were applied and restored
one at a time; each command ran the configured Vitest runtime file with `-t`
selecting the named assertion. These faults occur after successful decoding,
not through a fake schema interceptor.

| Injected production fault                          | Observed failure                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bypass source binding in `matchesSide`             | 2 failures: left/right schema-valid wrong sources returned success instead of failure  |
| Bypass connected target binding in `matchesSide`   | 2 failures: left/right schema-valid wrong projects returned success instead of failure |
| Return `unknown` for an impossible objective state | 1 failure: expected Error Boundary message absent                                      |
| Return `unknown` for an impossible placement kind  | 1 failure: expected Error Boundary message absent                                      |
| Drop an impossible provenance kind                 | 1 failure: expected Error Boundary message absent                                      |
| Return `unknown` for an impossible source kind     | 1 failure: expected Error Boundary message absent                                      |

The runtime suite also verifies contradictory shelf metadata loses to the side
summary, empty diffs retain context, final schedule-diff offsets do not replace
a stage's earlier fixed interval, all modeled placement and objective outcomes,
Fast stages with no observation/outcomes, and no foreign HTTP lookup or live retry.
Existing panel and feature suites retain loading/error, pinned comparison,
staleness and project-runtime invalidation coverage. No live upstream labels,
qualified addresses, relationships or final composite positions are invented
from C2's narrower summary contract.

No full frontend/browser suite, canonical host gate, build, deployment or active
connected writer lifecycle is claimed. Those remain outside this bounded slice;
task 8.3 stays unchecked.

## Final bounded validation

All eight changed TypeScript files pass scoped ESLint. Final Nx frontend
typecheck passes after the complete source/test changes. `git diff --check`
passes. Final format and normal commit hooks are checked as part of delivery.
