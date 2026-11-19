## Why

Today's `Project` is one WBS. Engagements contain several work packages and need shared settings and budgets. Rename the existing level to work package, introduce projects
above it, and migrate dev content through maintenance windows.

## What Changes

- **Work packages:** rename the existing tables, API/MCP operations, subscriptions, audit
  subjects and UI terms. Current plan documents are ordinary 13/connected 14; saved-plan
  input is 11. Preserve stable ids and strictly validated historical bytes, hashes and
  receipts through versioned readers and explicit projections. The solver's Python 0.4.0
  and wire 5 remain frozen behind host mappings.
- **Projects:** require one engagement project on package create/import
  (`422 project_required`), add project commands and package moves, and replace package
  ownership with creator metadata and access grants. Documents advance to 15/16 and
  saved-plan input 12; update Navigator, Burokrat and Dash consumers together.
- **Settings and spaces:** resolve organization → space → project → work package with
  provenance; each project belongs to one space or none. Budget factor belongs to the
  project. Documents advance to 17/18 and saved-plan input 13.
- **Step catalogue:** implement the settled [wbs-step-catalogue](../wbs-step-catalogue/proposal.md)
  scope, preserving historical identities after integrity validation and using its
  guarded rollback and snapshot window.
- **Dev cleanup and regrouping:** use runbook selection and count guards
  between rename and project windows.

## Non-Goals

Nested spaces, space-scope grants, calendar date ranges (`wbs-calendar-ranges`), new budget
algorithms, and compatibility routes under the old package names. Historical document,
canonical-request, receipt and backup readers remain required; old evidence is never
retagged or rehashed. Permissions behavior belongs to the dependent `wbs-permissions` change.

## Constraints

- Non-additive window migrations require exact waivers, stopped writers/readers, a backup
  report binding source, snapshot and ledger, and snapshot rollback. Retained backup
  artifacts remain operator-owned.
- Keep ids and immutable evidence stable. Never edit historical migrations or released
  solver schemas. Separate the reproducible mechanical rename from reviewed semantic repairs.
- Respect permissions landing and activation order; rehearsal and health evidence precede completion. Production activation requires its own defined window.

## Capabilities

### New Capabilities

- `work-packages`: rename, projects, moves, settings and spaces.

### Modified Capabilities

Current synced specs are edited in place in slice 1, preserving scenario ids (E29).

## Domain Terms

Work package, Project, Space, Space membership, Project settings, Setting provenance.

## Decisions Recorded

Recorded E1–E49 amendments govern this change; ADR 0063 supersedes ADR 0033.

## Impact

Every `@wbs/*` library, be-01, gw-01, mcp-01, fe-01, Navigator, Burokrat, Dash, docs and dev data.
