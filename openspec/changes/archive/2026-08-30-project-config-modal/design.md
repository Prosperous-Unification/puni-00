# design — `project-config-modal`

## D1 — the dialogs lose their shell, not their body

Each of the three today is a `<Modal>` with its own `ModalTrigger`,
`ModalContent`, `ModalHeader`, `ModalTitle` and footer. The refactor splits each
into:

- a **panel** — everything inside the content, exported as e.g. `TeamsPanel`,
  taking the same props it takes now plus an `onDirtyChange` (D3);
- nothing else. The shell is deleted, not parameterised.

`ProjectSettingsModal` owns one `Modal`, one `ModalTitle` reading
`Project settings`, the tab list, and the three panels.

**Why not keep the `Modal`s and nest them.** A modal inside a modal is two focus
traps, and Radix restores focus to the inner trigger on close — which is inside
the outer modal, which is the thing the reader was trying to leave. `P
phases-ui` already cost 49 unrelated tests when a `ModalContent` merely being
_declared_ suspended the page's keyboard (`AGENTS.md`, R5). Two live shells is
that fault with a second copy.

## D2 — the tab list is a `tablist`, and the panels stay mounted

`role="tablist"` / `role="tab"` / `role="tabpanel"`, arrow keys between tabs,
which is what a screen reader expects of a section list inside a dialog.

The inactive panels stay **mounted and hidden** (`hidden`, per the artifact
reset's `[hidden]{display:none!important}` convention — here it is `wbs-table`'s
own convention of toggling `el.hidden`). Unmounting them would discard a
half-typed team capacity when the reader glanced at the ladder, which is exactly
the "does not take the focus or the half-typed value" fault class
`AGENTS.md` records from 2026-08-06.

The cost is three panels' worth of queries live at once. Each already reads from
the plan's existing data (`teamsOnThePlan`, `priorityBands`, `steps`) rather
than fetching its own, so the cost is render, not network.

## D3 — closing with an edit in flight refuses, and the container asks

Each panel today refuses its own close while a write is in flight. Hoisted:
each panel reports `onDirtyChange(sectionId, isDirty)` and the modal holds the
set. Escape, the ✕ and a click outside all go through one handler that, if the
set is non-empty, refuses and **switches to the first dirty section** so the
reader can see what is holding it.

Switching rather than only announcing: a refusal that names a section the reader
cannot see is a refusal they have to go looking for.

The negative that makes this non-vacuous: a panel wired to report `false` while
holding an in-flight write, watched letting Escape close over it. A test that
only asserted "Escape closes when clean" could not see it.

## D4 — the remembered section is a claim, read as one

`wbs.projectSettingsSection.<projectId>` in `localStorage`, read the way
`rememberedHiddenColumns` reads its key: an unknown or non-string value is
**dropped** and the first tab shown, not defaulted through. A stored section id
for a tab that no longer exists is the same case.

Per project rather than global, matching every other remembered plan preference
in this file (`rememberedGanttHeight`, the width overrides, the hidden columns).

## D5 — the toolbar gains one control and loses three

The button reads `Project settings` with a gear glyph on the wide bar and its
label in the phone sheet. It carries no `data-takes-the-focus`: it opens a
dialog that focuses its own panel and Radix's restore to this trigger is the
right answer, which is the distinction `wbs-table.tsx` already draws for `⌨`
versus `Add work item`.

The measurable claim is width: the folded toolbar at 1280 must be no wider than
before. `e2e/layout.spec.ts` measures it.
