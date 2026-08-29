<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`steps-not-phases` renamed the domain everywhere except the physical schema,
because a table rename is not an additive migration and blue and green share one
SQLite file mid-swap. What it left behind is a documented lie:
`sqliteTable('role', …)` exported as `step`, and `text('role_id')` read as
`stepId`, in seven tables. R2 says the name carries the domain; a boundary
comment is the cost of leaving one that does not, and this change pays it off.

## What Changes

**The tables and columns take the domain's name.** `role` becomes `step`;
`role_id` becomes `step_id` on `estimate`, `actual`, `role_progress` (which
becomes `step_progress`), `assignment`, `token_estimate` and the event-log
projection that carries it. The drizzle schema drops its boundary JSDoc because
there is no longer a boundary.

**It ships as a plain rename, and only while prod does not exist.** No release
is currently deployed to prod (`LLM_README.md`, open findings 1 and 2: work
stops at dev). With no outgoing colour reading the old names there is no
compatibility window to hold open, so the migration is a direct
`ALTER TABLE … RENAME` per table and column with a `down.sql` that reverses it
exactly.

**The precondition is checked, not assumed.** The change refuses to be applied
if any prod release is recorded. `bin/` gains a check that reads the recorded
deploy state and fails loudly when it names a colour — an unreadable state file
fails the same way, never as "nothing deployed" (R5, and the exact fault
`readRecordedColor` shipped on 2026-08-05).

## Non-Goals

- Compatibility views, `INSTEAD OF` triggers, or a dual-write overlap. Those are
  what this change would need **after** the first prod deploy, and the design
  records the shape so a future reader is not left to invent it.
- Any domain, API, wire, MCP or UI change — `steps-not-phases` did all of it.
- Any data change. Row counts and values are identical before and after.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the physical storage names of a project's steps.

## Domain Terms

Step; Step order; Step usage.

## Impact

`apps/be-01/src/repository/schema.ts`, one forward migration with its
`down.sql`, `migrate-down.test.ts`, and the deploy precondition check. No
application code changes beyond deleting the boundary comment.
