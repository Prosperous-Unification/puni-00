<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The plan's screens say **Phase**. The code, the wire, the API routes, the MCP
tools and `CONTEXT.md` all say **Role**. One thing has two names, and neither is
the word Dany wants: it is a **Step** (2026-08-29).

The gap is not cosmetic. `phases-dialog.tsx` edits `RoleView`s and calls its
own confirmation `usageSentence(roleName, …)`; `facetPhases` filters
`estimatedRoleIds`. A reader tracing "why did the Phases dialog refuse that?"
crosses the word boundary three times before reaching `RoleRepository`. R2 says
the name carries the domain; here two names carry it and disagree.

## What Changes

**One word, everywhere above the storage layer.** `Role` becomes `Step` in
`CONTEXT.md`, in every identifier in `libs/domain`, `be-01` and `fe-01`, on the
wire, in `openapi.json`, and in the MCP tools derived from it. `Role order`
becomes `Step order`, `Role usage` becomes `Step usage`, `Assumed assignee`'s
wording follows. The UI's `Phases` dialog becomes `Steps`.

**Routes and payload fields move.** `/api/projects/:id/roles` and
`/:id/roles/:roleId` become `/steps` and `/steps/:stepId`; `roleId` becomes
`stepId` and `roles` becomes `steps` in every payload. The MCP tool names
derived from those routes change with them, and `apps/mcp-01/README.md`'s tool
list is regenerated.

**The database is deliberately left alone by this change.** The `role` table and
every `role_id` column keep their physical names; drizzle maps `step`
identifiers onto them, with a JSDoc on the schema naming the boundary and
pointing at the follow-on change. Blue and green share one SQLite file mid-swap
(`AGENTS.md`, Migrations), so a physical rename cannot be one additive
migration — it is an expand/contract across two releases and is its own change,
`steps-schema-rename`.

## Non-Goals

- The physical table and column rename. See `steps-schema-rename`.
- Any behaviour change. Nothing this change touches may move a date, alter a
  refusal, or change what a screen can do.
- ARIA `role` attributes, `role="combobox"` and friends — a different word that
  happens to be spelled the same.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the vocabulary of the unit a project estimates separately, and
  the routes and payload fields naming it.

## Domain Terms

Step (was Role); Step order; Step usage; Slice; Anchor slice.

## Impact

`CONTEXT.md`, `libs/domain`, all of `be-01`'s role paths, `openapi.json`,
`mcp-01`'s generated tools and README, `fe-01`'s table, dialogs, cards, chart,
export and tests. No migration. No behaviour change.
