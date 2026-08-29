<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Three of the plan toolbar's controls configure the **project**, not the plan:
`Teams` (capacity per team), `Priorities` (the band ladder), and `Steps` (what
the project estimates separately). Each is its own trigger opening its own
`Modal`, and each is a thing somebody sets once and then does not touch for
weeks — sitting permanently beside `Add work item`, `Undo` and `Columns`, which
are used every minute.

The toolbar's width is the scarce resource: `min-w-0` and a flex bar that gives
way, three exports, a search, a views control, a columns picker and a readiness
badge already compete for it, and the phone sheet lists all of them.

## What Changes

**One `Project settings` control.** A single toolbar button opens one modal.
The three existing dialogs become three sections of it, reached by a tab list
down its left on a wide window and stacked on a narrow one. The three separate
toolbar triggers are removed.

**Each section keeps its own behaviour whole.** The teams grid, the priority
ladder's five rungs, and the steps list with its removal confirmation are moved,
not rewritten: same components, same writes, same refusals, same accessible
names. What changes is who mounts them.

**The modal remembers which section was last open, per browser.** A reader who
came back to adjust capacity twice lands on capacity, not on the first tab.

**Escape and the ✕ close the whole modal, from any section.** A section with an
edit in flight refuses the close and says which, rather than discarding it —
the rule each dialog already holds for itself, hoisted to the container.

## Non-Goals

- No change to what any section does, writes, or refuses.
- No new settings, no settings moved in from elsewhere, no directory redesign.
- The phone sheet gains the one control in place of three; the sections are not
  re-laid-out for 390×844 beyond what they already do.
- Deep-linking a section by URL.

## Capabilities

### Modified Capabilities

- `wbs-domain`: where a project's configuration is edited.

## Domain Terms

Capacity; Priority ladder; Step; Project entry.

## Impact

`wbs-table.tsx` (three triggers removed, one added), a new
`project-settings-modal.tsx`, and `teams-dialog.tsx`,
`priorities-dialog.tsx`, `steps-dialog.tsx` losing their own `Modal` shells.
Their test files move with them. One Chromium spec for the toolbar's width.
