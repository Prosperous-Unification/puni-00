# verify — list-search-and-paging

## Slice 0 — spec

Written on `batch-9/170-list-paging-spec` from main `72ec365d`, after Fable's design
decisions of 2026-09-29 (lane record `puni-plan/batch-9/lanes/170-list-paging.md`).

## Slice 1 — projects

On `batch-9/170-list-paging-projects`, stacked on the spec branch. The parameterless list
keeps its order and adds `updatedAt` and `nextCursor: null`; the one existing assertion of
the whole body (`project.controller.test.ts`, list metadata) gained `nextCursor: null`.
The in-memory project fixture answers `updatedAt: null` (it keeps no instants); the
instant's rules are proved on SQLite. Space rows now carry `updatedAt` too, undeclared by
the space shapes and ignored by their reply schema.

Negatives, each watched failing on 2026-09-29 and recorded as a `Proof:` comment:

| Fault injected                             | Test                                                                | Observed                      |
| ------------------------------------------ | ------------------------------------------------------------------- | ----------------------------- |
| repeated-key check removed                 | `refuses every value outside the grammar` (list-query)              | `limit=5&limit=6` parsed      |
| `limit` maximum removed                    | same                                                                | `limit=201` parsed            |
| cursor spelling check removed              | same                                                                | padded `eyJ2IjoxfQ==` decoded |
| project key type checks removed            | `refuses a cursor that is not a project cursor`                     | `k: ["x","p"]` accepted       |
| id tie-break removed                       | `a tie is broken by id and a null instant sorts last`               | wrong order                   |
| `null`-last branch inverted                | same                                                                | `c` first                     |
| `>=` made `>` in `isUpdatedSince`          | `updatedSince is inclusive and never matches null`                  | bound project lost            |
| resume after the cursor's id, not its key  | `a project edited mid-walk is not answered again`                   | edited project answered twice |
| work-item term removed from the instant    | `answers the update instant as the newest …` (`project.db.test.ts`) | 10 instead of 20              |
| plan-event term removed                    | same                                                                | 20 instead of 30              |
| legacy access instead of `resolved.access` | `pages only the caller’s organization …` (mounted)                  | org-b's projects answered     |
| route answers 200 for a refused query      | `refuses every value outside the grammar with 400` (mounted)        | 200 for `limit=0`             |
| foreign-shaped cursor walked from the top  | same                                                                | 200 for `{ v: 1, after }`     |

## Commands

| Slice | Command                                                                                                                                                                                                                                    | Result             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate list-search-and-paging --json`                                                                                                                                                                  | passed 1, failed 0 |
| 1     | `bun test` list-query, project-page, `project-list-paging.controller.db.test.ts`                                                                                                                                                           | 17 pass, 0 fail    |
| 1     | `bun test libs/wbs/adapters/store-sqlite/src/project.db.test.ts`                                                                                                                                                                           | 35 pass, 0 fail    |
| 1     | `bun test` project-shapes, mcp-01 generated-document and openapi-tools, be-01 app.routes, openapi-document, project-organization, space-organization, core project.routes, space.resource, app.test, project.controller, module-boundaries | all pass, 0 fail   |
| 1     | `tsc --noEmit` core spec, store-sqlite spec, store-memory spec, contracts lib, be-01 spec, fe-01 app and spec                                                                                                                              | exit 0             |
| 1     | `nx run-many -t lint:fast` (core, store-sqlite, store-memory, contracts, be-01)                                                                                                                                                            | success            |

Every `bun test` ran as `env -u CLAUDECODE bun test …` (see the CLAUDECODE finding). Not
run here: the full `lint` target, the e2e pixels job and the h2puni gate, which is owed.
