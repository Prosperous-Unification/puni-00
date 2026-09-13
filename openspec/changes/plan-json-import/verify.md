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

## Environment notes

The first contracts owning run could not execute its compiler-spawn proof because
the isolated worktree had no local `node_modules/.bin/tsc`; an ignored worktree
symlink to the repository dependency installation restored the 380/0 result.

The combined owning test run also exercised all of `be-01` inside the restricted
sandbox. It reported 1040 passes, 1 skip and 17 failures. The failures were in
tests that open listener/process boundaries and included `Bun.serve` `EPERM:
operation not permitted, listen`; the Section 1 mounted suites above remained
green. The host-wide and browser gates remain assigned to task 5.2.

Sections 2–5 are unimplemented and remain unchecked.
