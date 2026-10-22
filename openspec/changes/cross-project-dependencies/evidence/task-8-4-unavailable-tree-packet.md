# Task 8.4 bounded unavailable tree packet

2026-10-22. Isolated shared clone `/tmp/puni-unavailable-tree`, base `6ca21df77`.
This implements only the domain/transport tree reason and connected presenter plus
mounted read/publication regression evidence. It does not complete tasks 8.4 or 9.2.

## Behavior

`ScheduleError` now lives in the framework-free domain and retains the historical
null/cycle/calendar_range arms. Connected missing-calendar and optimized-engine
refusals retain their exact captured evidence as structured arms. Core re-exports
its existing import location. The shared HTTP response requires nonempty project
lists and the complete known evidence; generated OpenAPI exposes the same union.

The connected presenter continues using captured component readiness and incident
relationships for every placement. Unavailable trees return HTTP 200, null row
forecast schedules/dates, no slices, no optimization, and no displayed holder or
resource labels. Accounting and factual fields continue through the ordinary row
projection. Local reads keep their existing placeholder and engine refusal paths.

Connected calendar-range display preflight occurs before timing, counts or slices
are assigned, and connected inputs currently carry no optimization variants.
Consequently the initial empty display state already survives preflight refusal;
no duplicate reset branch is needed. The mounted range regression checks that state.

## Watched red/green and R5 proofs

- Initial mounted calendar and real optimized-selected reads failed with expected
  HTTP 500 from the existing `connected tree placement ... is unsupported` throw.
  Log: `/tmp/puni-unavailable-red.log` (2 failed tests).
- Initial shared response contract test rejected the new modeled structured values.
  Log: `/tmp/puni-unavailable-wire-red.log` (1 failed test).
- Restoring the old nonscheduled presenter refusal after implementation caused
  calendar GET, optimized GET and the postcommit edit/claim test to fail on 500.
  Log: `/tmp/puni-unavailable-refusal-proof.log` (3 failed tests).
- Removing the connected-unavailable row forecast guard exposed UNSCHEDULED's
  zero-offset placeholder and failed both unavailable mounted read assertions.
  Log: `/tmp/puni-unavailable-forecast-proof.log` (2 failed tests).
- Replacing the actual response scheduleError union with `unknown` made the shared
  boundary test accept malformed required evidence and fail its rejection assertion.
  Log: `/tmp/puni-unavailable-wire-proof.log` (1 failed test).
- Every injected fault was restored. Adjacent production `Proof:` comments name
  these observed faults. Existing corrupt captured identity/blocker tests still
  exercise the mounted 500 boundary; modeled unavailability does not catch them.

## Verification

Commands run in the isolated clone:

```sh
bun test libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts
```

96 tests passed, 345 assertions; `/tmp/puni-unavailable-tests-final.log`.
After removing an unnecessary display-reset block and correcting one test-only
index-signature access, the affected mounted/contract suites were rerun: 18 tests
passed, 172 assertions; `/tmp/puni-unavailable-last-tests.log`.
The mounted cases cover both actual optimized refusal reasons using the composed
fixture with/without optimizer support, prerequisite and target incident reads,
paged/detail null forecast subsets, remote blockage roots, calendar range, and
successful edit plus remote-progress-permitted claim with durable tree_replaced.
The event is verified in event_log, and the committed claim is verified in SQLite.
The publication regression uses createWorkItem, not first-child handdown.

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-unavailable-graph.json
bunx eslint libs/wbs/domain/domain/src/schedule-error.ts libs/wbs/domain/domain/src/index.ts libs/wbs/application/core/src/ports/plan-tree.ts libs/wbs/application/core/src/service/connected-plan-projection.ts libs/wbs/application/core/src/module/work-item/work-item.resource.ts libs/wbs/domain/contracts/src/http/work-item-response.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts
bunx tsc --build libs/wbs/domain/domain/tsconfig.json libs/wbs/domain/contracts/tsconfig.json --pretty false
bunx openspec validate cross-project-dependencies --strict
```

Scoped eslint passed after generating the Nx graph (the first direct lint attempt
reported the absent cached graph and skipped module-boundary enforcement; the
final graph-backed run is the relevant result). Domain/contracts typecheck passed.
OpenSpec strict validation passed. Scoped Prettier and git diff --check passed.

The combined domain/contracts/core/backend TypeScript command was also run:

```sh
bunx tsc --build libs/wbs/domain/domain/tsconfig.json libs/wbs/domain/contracts/tsconfig.json libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.json --pretty false
```

It fails at the two deliberately excluded integration boundaries:
`person-load.feature.ts:432` still accepts only cycle/calendar_range reasons;
`space.resource.ts:405` still accepts only string|null roll-up errors.
Log: `/tmp/puni-unavailable-tsc-final.log`. These consumers must be repaired before
feature integration can typecheck; this packet does not weaken their types.

## Remaining boundaries

No frontend client/Gantt/banner/export work, retained connected aggregate work,
load/roll-up compatibility, arrangement admission, first-child incident integration,
explicit unavailable premature-claim regression, transitive fanout-specific proof,
full host gate, build, push or deployment was performed. Local and scheduled
connected regressions are included in the focused suites, but this packet alone
is not a release or whole-feature completion claim.

## Astra review correction: final availability owns holder attachment

Astra High review of `2869218bf` found a missing combination: a scheduled shared
person component can retain captured foreign holders while the presenter later
refuses calendar display. The initial range fixture had no shared person, so it
could not expose the outer presenter's reattachment of that abandoned catalog.

The mounted range regression now uses the real `shareAna(remote, target)` fixture.
Before the fix it failed `not.toHaveProperty('elsewhereHolders')` with the captured
Remote row catalog, despite null forecasts and empty slices. Log:
`/tmp/puni-unavailable-holder-red.log` (1 failed test, 8 assertions).

`presentConnectedTree` now returns the unavailable tree plus incident relationships
before transferring foreign holder references or attaching holder catalogs. The
final `tree.scheduleError` decides availability; the earlier captured placement
cannot override display refusal. Scheduled-holder behavior uses its existing path.

After the fix the mounted suite passed 14 tests, 119 assertions. Removing only
that final-availability guard then reproduced the same catalog assertion failure:
`/tmp/puni-unavailable-holder-proof.log` (1 failed test, 8 assertions). The guard was
restored, with an adjacent `Proof:` comment. Final focused regression passed
96 tests, 345 assertions; output is in
`/tmp/puni-unavailable-holder-final-tests.log`; scoped lint output is in
`/tmp/puni-unavailable-holder-lint.log`. The combined core/backend TypeScript
command still reports the two excluded load/roll-up errors described above;
`/tmp/puni-unavailable-holder-tsc.log`. No new integration boundary was widened.
