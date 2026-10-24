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
  plan document 12 with `workPackage`, saved-plan input schema 10.
- Impact: breaking everywhere, MCP tool names included; dev data migrates in place.

**A project is the engagement** (slice 2)

- To: `project(organization_id, name)`; every work package has exactly one project; each
  organization has one default project, the target when none is named; `createProject`,
  `patchProject`, `deleteProject`, `moveWorkPackage` with typed refusals; plan document 13.

**Settings inherit; spaces group projects, persons and teams** (slice 3a)

- To: a setting catalogue resolving organization → space → project → work package with
  provenance; timezone, calendar markers and PERT weights overridable at the work package;
  budget factor and a work item type allow-list fixed at the project.

**Steps are project entities** (slice 3b), re-keyed by code in their own window.

**Dev cleanup and regrouping** (before slice 2's window) are a runbook, not a migration.

## Non-Goals

Per-project access (`wbs-permissions`); any space-level override; budgets
(`wbs-measure-budgets`, merged); cross-work-package dependencies themselves
(`feat/cross-project-dependencies` rebases onto these names); keeping any old name, route
or document version alive.

## Constraints

- Slice 1 renames under a migration-lint waiver; later slices rebuild tables. Each ships in
  a stop-the-world window with a verified backup as the rollback.
- Ids stay stable; one project per work package, one organization per project; no
  per-project access invented.
- The rename is a rerunnable script under `tools/`; residuals are listed. Old
  `migration.sql` files are never edited.

## Capabilities

### New Capabilities

- `work-packages`: rename, projects, default project, moves, settings, steps, spaces.

### Modified Capabilities

None by delta; ten synced specs are edited in place in the slice 1 PR (E29).

## Domain Terms

Work package, Project, Default project, Space, Space membership, Project settings, Setting
provenance.

## Decisions Recorded

No ADR. E1 to E9 are the owner's; E10 onward are assumed, overrulable by id; E30 awaits
Dany.

## Impact

Every `@wbs/*` library, be-01, gw-01, mcp-01, fe-01, twilight-navigator, docs, the dev
database.
