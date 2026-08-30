<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Five findings from the UI audit of 2026-08-12, every one of them reproduced on
dev in a browser. They share a shape rather than a subsystem: each is the table
promising something in writing and not doing it, and each is small enough that
none of them would carry a change of its own.

The worst is a reader stuck. Ctrl+L into a Depends on cell, and the way out the
cheat sheet documents does not exist there — that cell, Service/team and the
assignee boxes answer none of the eight keys promised "between cells" and "from
any cell". The shortcuts sheet is the same shape one layer up: Tab walks out of
a dialog marked `aria-modal="true"`, and Escape then stops closing it.

## What Changes

**The chords in the picker cells and the date cell**

- From: Ctrl+H/J/K/L and Alt+←/↑/↓/→ do nothing in Depends on, Service/team or
  the assignee boxes; the earliest-start cell takes the four motion chords and
  none of the four row moves
- To: all eight answered from every cell, an open picker list included
- Impact: non-breaking. The chords that make or destroy a row (Ctrl+N, Ctrl+D,
  Ctrl/⌘+Enter) are still the open list's to swallow

**The Name cell's resize grip**

- From: `resize: vertical` from Tailwind's preflight — a drag takes a 28px row
  to any height, the chart row beside it stays 28px, no undo
- To: `resize: none`; the auto-grow that sizes the box to its text is untouched

**The hovered row**

- From: `--grid-hover` is one absolute shade and the body is banded, so the
  pointer barely moves a striped row and does not move it as far as a plain one
- To: a second token for the banded phase, the same step of ink on both

**The shortcuts sheet**

- From: no focus trap, Escape on the backdrop, dead once Tab has left
- To: Tab held at both ends, Escape on `document`, backdrop click unchanged

**A deep row's number**

- From: `030.1.1.1` and `030.1.1.1.1` draw as `030.1` and `030` in a 93px
  column — neither of them a number
- To: `DEEPEST_INDENT` 4 → 2 and 11px type on the number, which draws the
  four-segment number whole and the five-segment one all but its last glyph;
  the levels the cap gives up are already carried by the Name cell, so the
  outline is unchanged

## Non-Goals

- No redesign of the Number column. `spreadsheet-geometry` may rework it later;
  this is the minimal fix that makes two rows read as two rows.
- Not Radix for the sheet. `shadcn-foundation`'s routing matrix keeps it
  hand-rolled; what changes is the behaviour, not the vendor.
- No dark-palette values, no gantt panel, no gantt height handle.

## Constraints

- `--grid-hover` is this change's; the dark palette is another agent's. Both
  new tokens are mixes of properties `.dark` re-points, so the pair inverts by
  itself and no `.dark` twin is added here.
- Four of the five are browser facts jsdom cannot see (R5 #14–16): a drag, a
  computed `color-mix`, a default Tab, and where a clip falls.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the chords reach every cell; the Name box has no grip; the
  pointer reads on both phases of the stripe; the shortcuts sheet is modal; a
  deep row's number reads as its own

## Domain Terms

none

## Decisions Recorded

none — every one is reversible, and the one judgement call (which half of the
Number column's budget to reclaim) is argued at `DEEPEST_INDENT` where it lives.

## Impact

`apps/fe-01` only: `keyboard-bindings.ts`, `creatable-picker.tsx`,
`wbs-table.tsx`, `keyboard-cheat-sheet.tsx`, `table-frame.ts`, `styles.css`,
their unit tests, and `e2e/{keyboard,layout,name-cell,hover-cards}.spec.ts`. No
be-01, no gw-01, no migration, no deploy step.
