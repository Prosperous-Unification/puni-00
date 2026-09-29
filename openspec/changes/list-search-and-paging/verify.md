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

## Slice 2 — work-item rows and one work item

On `batch-9/170-list-paging-work-items`, stacked on the projects branch. New shapes
`getWorkItemRows` and `getWorkItem`; `getWorkItems`' reply is untouched and only its document
text changed. `numberedWorkItem` and the slice schema (renamed `workItemSlice`) are now
exported from `@wbs/contracts`; two refusal codes joined the registry (`stale_cursor`,
`unknown_parent`), declared as two 404 arms because one union arm made the shape type
widen to `never`. The new binds sit at the end of `workItemRoutes` so the positional
indices `work-item.routes.test.ts` uses are unchanged. Three pinned inventories gained the
two operations: mcp-01's README count (67 → 69, watched failing first: `Expected: 69,
Received: 67`), `generated-document.test.ts` and both lists in `app.routes.test.ts`.
`WorkItemStore.listUpdateInstants` is implemented by SQLite and forwarded by the two
wrappers; the in-memory fixture rejects it (it keeps no instants).

| Fault injected                         | Test                                                         | Observed                   |
| -------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| a field dropped from `constraints`     | `the outline and the field groups partition …`               | tree field missing         |
| `name` added to `notes`                | same                                                         | 39 names, 38 distinct      |
| status names unchecked                 | `refuses every value outside the grammar` (work-item-page)   | `finished` admitted        |
| group names unchecked                  | same                                                         | `cost` admitted            |
| depth bound removed                    | same                                                         | `depth=65` admitted        |
| stale cursor resumed from the top      | `refuses a stale cursor and an unknown parent`               | a page answered            |
| unknown parent answered as empty       | same                                                         | ok answered                |
| depth filter removed                   | `parentId answers the rows below it to the depth asked`      | `010.1.1` at depth 1       |
| ancestry check removed                 | same, and `named groups add exactly their fields`            | rows outside the parent    |
| instant check removed                  | `leaves out a work item deleted after the tree was read`     | `020` answered             |
| route answers 200 for a refused query  | `refuses every value outside the grammar with 400` (mounted) | 200                        |
| rows read with legacy access           | `answers a foreign project as not found` (mounted)           | foreign rows answered      |
| single item read with legacy access    | `answers an absent and a foreign work item alike`            | foreign work item answered |
| every tree slice answered for one item | `answers one work item as the whole-tree read does …`        | another item's slice       |

## Commands

| Slice | Command                                                                                                                                                                                                                                    | Result             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate list-search-and-paging --json`                                                                                                                                                                  | passed 1, failed 0 |
| 1     | `bun test` list-query, project-page, `project-list-paging.controller.db.test.ts`                                                                                                                                                           | 17 pass, 0 fail    |
| 1     | `bun test libs/wbs/adapters/store-sqlite/src/project.db.test.ts`                                                                                                                                                                           | 35 pass, 0 fail    |
| 1     | `bun test` project-shapes, mcp-01 generated-document and openapi-tools, be-01 app.routes, openapi-document, project-organization, space-organization, core project.routes, space.resource, app.test, project.controller, module-boundaries | all pass, 0 fail   |
| 1     | `tsc --noEmit` core spec, store-sqlite spec, store-memory spec, contracts lib, be-01 spec, fe-01 app and spec                                                                                                                              | exit 0             |
| 1     | `nx run-many -t lint:fast` (core, store-sqlite, store-memory, contracts, be-01)                                                                                                                                                            | success            |

| 2 | `bun test` work-item-page, work-item-fields, `work-item-rows.controller.db.test.ts` | 8, 1, 7 pass, 0 fail |
| 2 | `bun test` mcp-01 openapi-tools and generated-document | 33 pass, 0 fail |
| 2 | `bun test` core work-item.routes, be-01 app.routes, openapi-document, openapi-build, module-boundaries, store-memory source-conformance, store-boundaries, document-from-shapes | all pass, 0 fail |
| 2 | `tsc --noEmit` contracts spec, core spec, store-sqlite spec, store-memory spec, be-01 spec, mcp-01 spec, fe-01 app, spec and e2e | exit 0 |
| 2 | `eslint` on every changed `.ts` file | no problems |

Every `bun test` ran as `env -u CLAUDECODE bun test …` (see the CLAUDECODE finding). Not
run here: the full `lint` target, the e2e pixels job and the h2puni gate, which is owed.
