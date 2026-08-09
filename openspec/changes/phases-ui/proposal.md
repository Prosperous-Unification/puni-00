# The phases are a project's to choose

## Why

`R1 role-crud` gave be-01 a write path for a project's roles — add, rename, and
a removal that refuses the first time with what it would take — and nothing on
screen can reach it. A project still shows `Dev` and `QA` because that is what
it was seeded with, and Dany's **P1** ask is that the phases follow the work
rather than the other way round.

This is `P phases-ui` in
`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`. It is also the first
production caller of `F shadcn-foundation`'s `Modal`: its focus trap, its
Escape, its click-away and the keyboard rule that lets a chord reach a field on
the surface have had jsdom and a harness behind them and no browser.

## What Changes

**A Phases dialog, from the toolbar.** Lists the project's roles, adds one,
renames one, removes one. Keyboard-complete: Tab cycles inside the surface,
Escape leaves, Enter submits the field it is pressed in, and Cmd/Ctrl+Enter
submits from anywhere on the surface — the chord `F` deliberately stopped
swallowing.

**A removal says what it would take, then asks again.** be-01's `in_use`
refusal carries estimates, explicit assignments and every work item whose
**assumed assignee** would change; the dialog prints all three, with the work
items by number, and the cascade box is off until somebody ticks it.

**The client's own blast radius.** A role that goes takes an accordion entry and
a set of half-typed estimates with it, and neither is be-01's to clean up. On
every read the table sanitizes `unfoldedRoles` against the roles that came back
and drops every estimate draft keyed to a role that did not. A cell being typed
in when the columns rebuild loses the focus **by design** — a role change is the
one sanctioned remount — but a draft be-01 refused is unsaved text that exists
nowhere else, and it now survives that remount instead of being replaced by the
server's value.

**The arithmetic, in the dialog rather than in a comment.** "5 phases need
≥1432px before the table scrolls sideways", computed from `table-frame.ts`'s own
widths, so the number moves when a column does.

## Non-Goals

- **No reordering.** `role.position` exists for `S1`; dragging phases about is
  that change's, not this one's.
- **No live role list.** The dialog reads the roles the table already holds and
  re-reads through the same refetch every other change uses.
- **Nothing inside `[data-grid]`.** The dialog is chrome and styles as chrome;
  the table gains no utility class.
- **No undo for a phase.** `R1` says role changes are not journalled; a dialog
  offering to reverse one would be offering something that does not exist.

## Constraints

- `layout.spec.ts` (22), `keyboard.spec.ts` (8), `tailwind.spec.ts` (6) and
  `header.spec.ts` (5) pass untouched.
- The refusal codes are be-01's: `taken`, `name_required`, `in_use`,
  `unknown_role`, `not_found`, `forbidden`. Each gets a sentence; none reaches a
  toast as itself.
- `columns` may still depend on `roles` and `unfoldedRoles` and nothing else.

## Capabilities

### Modified Capabilities

- `wbs-domain`: a project's phases can be changed from the table, and the table
  survives the change.

## Domain Terms

- phase
- assumed assignee
- sanctioned remount
- refused draft

## Decisions Recorded

`design.md` — where a refused draft lives once the cell holding it can be
unmounted by somebody else's phase change, and why the hold is keyed on the
cell rather than kept in the component.

## Impact

fe-01 only. `lib/wbs-api.ts` (three calls and the modeled `in_use` answer), a
new `components/wbs/phases-dialog.tsx`, `components/wbs/cell-input.tsx` (the
hold), `components/wbs/table-frame.ts` (the fit function), and
`components/wbs/wbs-table.tsx` (the button and the sanitizing read). One new
browser spec. No be-01 change, no migration, no new dependency.
