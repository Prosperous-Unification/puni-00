# design — `add-spaces`

Why membership is a positioned pair that owns nothing lives in
[ADR 0033](../../../docs/adr/0033-a-space-is-a-lens.md). This file is the shape.

## Allocated numbers (checked 2026-09-29)

| What            | Value                       | Checked against                                                                                                                        |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Migration stamp | `20260929100000_add_spaces` | newest on main `802432df` is `20260928040000`; newest on any remote branch is `20260928200000` (statuses storage); the queue adds none |
| ADR             | 0033                        | main ends at 0032; `adr-index.test.ts` requires contiguous numbers                                                                     |
| Contract bumps  | none in slices 0–1          | slices 2–4 add routes additively; `SCHEDULER_CONTRACT_VERSION` unchanged                                                               |

## D1 — Storage

`space(id PK, organization_id NOT NULL → organization, name CHECK length > 0, revision,
created_at, updated_at, created_by)` with `UNIQUE (organization_id, name)` and `UNIQUE (id,
organization_id)`. `space_project(space_id, project_id, organization_id NOT NULL, position,
created_at, updated_at, created_by)`, primary key `(space_id, project_id)`, references
`(space_id, organization_id) → space` and `(project_id, organization_id) →
project_organization(resource_id, organization_id)`, both `ON DELETE CASCADE`, and indexes on
`(space_id, position)` and `(project_id, organization_id)` (the child side of the project
cascade). The composite references are `project_solution`'s device. No bridge trigger: a space
is born organization-aware.

The audit columns are the repository's `auditOnCreate` and `auditOnUpdate` (enforced by
`audit.test.ts`), and on new tables `created_at` and `created_by` are `NOT NULL`. So the
memo's `created_by_id` is `created_by`, and its membership `added_at` is `created_at`: one
column per fact. `revision` counts every write to the space or its membership.

## D2 — Port and adapters

`SpaceStore` in `@wbs/core` is organization-scoped in every signature: each method takes the
owning organization id and filters by it in the query, so a foreign space answers `not_found`
as a property of the read. It knows nothing of access, roles or readable projects; those are
the resource's (slice 2). Answers are typed outcomes (`not_found`, `name_taken`,
`already_in_space`), never thrown SQLite errors. Placement uses `placeAfter` from
`@wbs/domain`; a respace writes the whole group in the same transaction. `SpaceRepository`
(SQLite) and `inMemorySpaces` pass one shared `spaceStoreConformance` suite in
`@wbs/conformance`, the `unitOfWorkConformance` pattern.

## D3 — Rollback

`down.sql` uses `project_solution`'s temporary CHECK table: refuse while any `space` row
exists, then drop. `spaces-rollback-cli.ts save|remove|restore <file>` over
`space-rollback.ts` in `@wbs/store-sqlite`, the `typed-dependency-rollback` shape: a versioned
file validated at the CLI boundary, `remove` refusing a save that no longer matches, `restore`
all or none. The runbook section is `docs/runbook-prod-deploy.md#space-rollback`. Code
rollback needs no swap guard: an older image has no spaces routes and the tables are inert.

## D4 — Resource, roll-ups, in progress now, fe

As the specs state. Roll-ups: `rollUpProject(tree)` over `WorkItemResource.tree()`; a
per-process LRU of 2,000 entries keyed `(projectId, seq, SCHEDULER_CONTRACT_VERSION,
ROLLUP_DTO_VERSION)` with a 60 s TTL; chunks of at most 20 from fe, 50 at the route. Rejected
there: a shared cache table, roll-ups inside the space read, keying on `project.revision`.
