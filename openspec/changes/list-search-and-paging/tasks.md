## 0. Spec

- [x] 0.1 Intent, delta spec `list-reads`, design, CONTEXT terms (Page, Cursor, Update
      instant, Field group). `openspec validate list-search-and-paging` green.

## 1. Shared grammar and projects (branch `batch-9/170-list-paging-projects`)

- [x] 1.1 Red: unit tests for the grammar (`limit`, `cursor` encode and every malformed
      decode, `q`, `updatedSince`, repeated keys) and for the project page (order, tie by
      id, `null` last, keyset resumption, filters).
- [x] 1.2 Red: store test for the update instant (own stamp, a work item's stamp, a plan
      event, all `NULL`); mounted db tests: parameterless list unchanged but for
      `updatedAt` and `nextCursor: null`, a walk with a foreign organization's newer
      projects, `updatedSince` inclusive, every 400.
- [x] 1.3 Green: contracts (`listProjects` query and additive reply fields, summary),
      grammar module, project page, store column, memory fixture `null`.
- [x] 1.4 Negatives, each watched failing and recorded as a `Proof:` comment: cap removed;
      cursor shape check loosened; access scope skipped before paging; tie-break removed;
      `null`-last removed; `>=` made `>`; the work-item and plan-event terms removed from
      the instant.

## 2. Work-item rows and one work item (branch `batch-9/170-list-paging-work-items`)

- [x] 2.1 Red: unit tests for the row page (tree order before filters, each filter,
      `depth` with and without `parentId`, the field-group partition against the tree
      schema, `stale_cursor`, `unknown_parent`).
- [x] 2.2 Red: mounted db tests: default outline, a walk across a re-derived tree partitions
      once, `fields`, foreign project 404, one work item equals its tree entry plus slices,
      foreign and absent work item 404, every 400.
- [x] 2.3 Green: shapes `getWorkItemRows` and `getWorkItem`, `getWorkItems` summary, routes,
      `listUpdateInstants` in both adapters, mcp-01 README count +2.
- [x] 2.4 Negatives: unknown status admitted; unknown group admitted; depth bound removed;
      filter applied before ordering; stale cursor resumed from the top; parent check
      removed; README count left unchanged.

## 3. Verify

- [x] 3.1 `verify.md`: every command, its result and every proof.
- [ ] 3.2 `bin/h2puni-gate.sh <head>` on h2puni, its output recorded in `verify.md` (owed).
