## Why

Today's `Project` is one WBS. A client engagement is several of those, and nothing above
them owns the shared settings, their dependencies or a shared budget; the
word "project" is spent on the wrong level. With no users, renaming costs one stop-the-world
deploy; after the first tenant, a compatibility layer forever.

## What Changes

**The old level is a work package** (slice 1)

- From: `project` as table, `/api/projects/...`, `postApiProjects…` tools,
  `project:<id>` subscriptions, plan document, audit subject, fe-01 words.
- To: `work_package`, `/api/work-packages/...`, `postApiWorkPackages…`, `work-package:<id>`,
  plan document 11 with `workPackage`, saved-plan input schema 9.
- Impact: breaking everywhere; Navigator and the wbs-dev MCP tool names change; dev data
  migrates in place.

**A project is the engagement** (slice 2)

- To: `project(organization_id, name)`; every work package has exactly one project; a
  "Default project" per organization is back-filled; `createProject`, `patchProject`,
  `deleteProject`, `moveWorkPackage` with typed refusals; plan document 12.

**Settings inherit; spaces group projects, persons and teams** (slice 3)

- To: a setting catalogue and `resolveSetting`, organization, space, project, work package, every read naming its provenance; timezone, calendar markers and PERT weights
  overridable at the work package; step codes and work item types fixed at the project. A
  space still owns nothing.

**Dev cleanup and regrouping** (slice 4) are a runbook, not a migration.

## Non-Goals

Per-project access (`wbs-permissions`); any space-level override; budgets (`wbs-budgets`);
cross-work-package dependencies themselves (`feat/cross-project-dependencies` rebases onto
these names); merging step rows across work packages; keeping any old name, route or document
version alive.

## Constraints

- Slice 1 renames tables and columns; slice 2 rebuilds `work_package` with `project_id NOT
NULL`. Each ships under a migration-lint waiver, a stop-the-world window and a verified
  backup as the rollback.
- Ids stay stable; one project per work package, one organization per project; no
  per-project access invented.
- The rename is a rerunnable script under `tools/`; residuals are listed, never hidden. Old
  `migration.sql` files are never edited.

## Capabilities

### New Capabilities

- `work-packages`: rename invariants, project entity, default project, moves, settings
  inheritance with provenance, space links.

### Modified Capabilities

none; synced specs are renamed at archive time (E29).

## Domain Terms

Work package, Project, Default project, Space, Space membership, Project settings, Setting
provenance.

## Decisions Recorded

No ADR. E1 to E9 are the owner's; E10 onward in design.md are assumed, overrulable by id.

## Impact

Every `@wbs/*` library, both stores, be-01, gw-01, mcp-01, fe-01, twilight-navigator,
`CONTEXT.md`, docs, the dev database.
