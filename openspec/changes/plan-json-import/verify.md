# Verify

## Section 1 — current export and document boundary

Implementation began from `0451b8214b907948d920cd6249525a2b14728a32` on
2026-09-13. Before implementation, these focused baselines passed:

- `cd libs/core && bun test src/http/project.routes.test.ts` — 2 passed.
- `cd apps/be-01 && bun test src/controller/project.controller.test.ts` — 54 passed.

The completed Section 1 slice passed:

- `cd libs/contracts && bun test $(find src solver/src -name '*.test.ts' -o -name '*.test.tsx' | sort)` — 380 passed.
- `cd libs/core && bun test src` — 431 passed.
- `cd libs/store-memory && bun test src` — 29 passed, 1 skipped by the source's declared capability allowlist.
- `cd libs/core && bun test src/service/plan-document.test.ts src/http/project.routes.test.ts` — 10 passed.
- `cd apps/be-01 && bun test src/controller/project.controller.test.ts src/http/elysia/plan-document-boundary.test.ts` — 57 passed.
- `NX_DAEMON=false bunx nx run-many -t lint typecheck -p contracts core store-memory be-01 --skip-nx-cache` — all eight targets passed (observed as part of the owning run).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate plan-json-import --strict --json` — 1 change passed, 0 failed.

## Failure-proof table

| Check                     | Fault injected                                                        | Test that observed it                                                                       | Observed failure                                                                                          |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Complete settings export  | Removed `settings.estimateRounding` from `PlanDocumentService.export` | mounted `projects > exports the project WBS and Gantt payload as JSON`                      | expected HTTP 200, received response-boundary 500 before unchanged project/row controls                   |
| Capacity closure          | Started referenced team ids empty                                     | mounted `projects > exports the referenced directory closure and authored calendar markers` | exact `Capacity only` team id/name missing while its capacity row remained                                |
| Membership closure        | Skipped assigned-person memberships                                   | same mounted closure test                                                                   | exact `Billing` team and owned-service id missing while assigned `Kat` remained                           |
| Team-service closure      | Skipped selected-team service ids                                     | same mounted closure test                                                                   | `services: []` instead of exact `Billing API` id/name                                                     |
| Minimal directory closure | Returned every tag                                                    | same mounted closure test                                                                   | exact unrelated tag id/name appeared beside `Release`                                                     |
| Missing reference refusal | Removed the missing-id guard                                          | same mounted closure test with the directory tag read faulted                               | expected HTTP 500, received 200 while the work item still referenced the absent tag                       |
| Structural path           | Changed the priority declaration to `unknown`                         | mounted `malformed priority names workItems[3].priority`                                    | expected 400 `invalid_body` at `workItems[3].priority`, received 204                                      |
| Version precedence        | Validated the version-1 body before checking its version              | mounted `unknown version precedes version-specific validation`                              | received `invalid_body` at `workItems[3].priority` instead of `unsupported_version` at `document.version` |

Each fault was watched, restored, and recorded beside the production check with a
`Proof:` comment.

## Section 2 — pure preparation

The first focused run was deliberately red: `bun test
libs/core/src/service/prepare-import.test.ts` could not resolve the absent
`./prepare-import` module. The first implementation run then exposed a validator
ordering defect of its own: `.at(-1)` treated the final priority band as the
first band's predecessor, so 18 of 19 cases refused the valid fixture at
`priorityBands[0].startsAt`. Changing the first predecessor to `undefined`
restored the intended ladder order.

The completed pure-preparation slice passed:

- `cd libs/core && bun test src` — 476 passed, 0 failed across 47 files.
- `cd apps/be-01 && bun test src/http/elysia/plan-document-boundary.test.ts` — 16 passed, 0 failed, including every requested malformed-document family with `countingUnitOfWork().calls` exactly `[]`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p contracts core be-01 --skip-nx-cache` — all six targets passed.
- `bunx prettier --check apps/be-01/src/http/elysia/plan-document-boundary.test.ts libs/core/src/index.ts libs/core/src/service/prepare-import.ts libs/core/src/service/prepare-import.test.ts libs/core/src/testing/plan-document-fixture.ts openspec/changes/plan-json-import/tasks.md openspec/changes/plan-json-import/verify.md` — all named files matched.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate plan-json-import --strict --json` — 1 change passed, 0 failed.

The watched faults were applied to the production preparation function from
temporary `/tmp` scripts, run one at a time, and restored before the green runs.

| Check                     | Fault injected                                                                                                           | Test that observed it                                              | Observed failure                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| File identity and names   | Removed duplicate file-id and normalized-name lookups                                                                    | mounted duplicate row/tag cases                                    | exact refusal path was lost for the row; duplicate tag returned 204                           |
| Structural project values | Bypassed project-name, start-date, PERT, capacity, band and row-value guards individually                                | named focused core cases plus mounted capacity/band/priority cases | each named test failed; the mounted guards admitted the request                               |
| Zero admission            | Bypassed the priority guard with the counting unit of work assertion first                                               | mounted `invalid priority without opening a unit of work`          | expected `[]`, observed `['begin', 'commit']`                                                 |
| File-local references     | Bypassed step, system, person, capacity-team, membership, ownership and row-label lookups individually                   | named core/mounted unknown-reference cases                         | each named test failed; mounted step/system/person bypasses returned 204 and admitted         |
| Leaf values               | Bypassed estimate, actual, progress, metric, measure-map and measure-value checks individually                           | five named leaf-value cases and mounted invalid-leaf case          | every invalid value was accepted; mounted negative actual admitted                            |
| Complete hierarchy        | Skipped `firstHierarchyRefusal`                                                                                          | mounted `hierarchy cycle without opening a unit of work`           | expected 400 with zero admissions; received 204 through admission                             |
| Complete dependencies     | Skipped `firstDependencyRefusal`                                                                                         | mounted dangling dependency and focused ancestry/cycle cases       | dangling reference returned 204; complete ancestor/cycle graphs were accepted                 |
| Leaf authority            | Forced every row to be a leaf                                                                                            | `parent aggregate maps never become prepared facts`                | the deliberately invalid parent aggregate was interpreted and preparation returned `ok:false` |
| Deadline                  | Skipped date/deadline validation                                                                                         | mounted deadline-before-start case                                 | expected 400 with zero admissions; received 204 through admission                             |
| Scheduler capability      | Skipped the enabled-engine capability refusal                                                                            | mounted `enabled unavailable optimizer creates nothing`            | expected 400 with zero admissions; received 204 through admission                             |
| Marker/reason/ref bounds  | Bypassed each marker predicate, reason pair/length, external-ref id/url/name, step-position and dependency planner check | respective focused cases                                           | each named case failed while its invalid value was accepted                                   |

The global refusal vocabulary still treats `unknown_ref`, `cycle`, `ancestor`
and `deadline_before_project_start` as command-context envelopes. Section 4 owns
the dedicated public import refusal shapes. Until then, the staged mounted
harness keeps its declared `invalid_body` transport and exposes the exact pure
preparation discriminant as test-only `importError`; `ImportPreparation` itself
already carries exact code, path and detail.

## Environment notes

The first contracts owning run could not execute its compiler-spawn proof because
the isolated worktree had no local `node_modules/.bin/tsc`; an ignored worktree
symlink to the repository dependency installation restored the 380/0 result.

The combined owning test run also exercised all of `be-01` inside the restricted
sandbox. It reported 1040 passes, 1 skip and 17 failures. The failures were in
tests that open listener/process boundaries and included `Bun.serve` `EPERM:
operation not permitted, listen`; the Section 1 mounted suites above remained
green. The host-wide and browser gates remain assigned to task 5.2.

Sections 3–5 are unimplemented and remain unchecked.
