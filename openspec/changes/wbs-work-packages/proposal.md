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

- To: `project(organization_id, name)`; every work package has one project, named on create
  and import (`422 project_required`); project commands and `moveWorkPackage` with typed
  refusals; no owner; plan document 13.

**Settings inherit; spaces are the organization's structure** (slice 3a)

- To: a project in one space or none; a setting catalogue resolving organization → space →
  project → work package with provenance; timezone, calendar markers and the work item type
  allow-list settable at space; budget factor fixed at the project.

**Steps** (slice 3b) wait for the separate `wbs-step-catalogue` design.

**Dev cleanup and regrouping** (before slice 2) are a runbook, not a migration.

## Non-Goals

Per-project access (`wbs-permissions`); space-scope grants; nested spaces; calendar date
ranges (`wbs-calendar-ranges`); budgets
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

- `work-packages`: rename, projects, moves, settings, steps, spaces.

### Modified Capabilities

None by delta; ten synced specs are edited in place in the slice 1 PR (E29).

## Domain Terms

Work package, Project, Space, Space membership, Project settings, Setting provenance.

## Decisions Recorded

E1 to E9 are Dany's; E10 onward assumed, overrulable by id; Dany revised several and
withdrew E34 on 2026-10-25. ADR 0061 supersedes ADR 0033.

## Impact

Every `@wbs/*` library, be-01, gw-01, mcp-01, fe-01, twilight-navigator, docs, the dev
database.
