<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The manual suite's Group D was run against dev on 2026-08-11 and passed 15/15.
Two product faults fell out of it anyway, both in the Prio cell, both about the
gesture rather than the number.

**Enter sent nothing.** A `1` typed into Prio and confirmed with Enter fired no
PATCH: the plan sat unchanged for as long as the reader looked at it, and the
dates moved only when they happened to click somewhere else. Blur and Tab
committed fine, so the number was never lost — it was the feedback that was.

**A second refusal showed the first one's text.** `urgent` typed over a
previously-refused `1e999` blurred back to `1e999`. The stored priority stayed
correctly blank and the toast said why, but the row displayed a draft nobody
had typed for several seconds.

## What Changes

**Enter saves the Prio cell and stays on the row.** Bare Enter only — a modified
Enter is still `Ctrl/⌘ + Enter`, which saves _and_ moves to the next row. It
commits through `flushCell`, the same "leave this cell now" the chords use, so
`LiveField`'s rule 5 answers the blur that follows and one Enter is one request
and one undo. The Name cell is untouched: Enter there is a newline by design
(`command-keys`), which is why this rule is the column's and not `CellInput`'s.

**A new submission drops the refusal it supersedes.** `LiveField.submit` clears
this cell's entry in `heldRefusals` synchronously, before sending. The toast a
client-side refusal raises re-renders the row inside the same blur, `takeNode`
runs against the rebuilt ref, and it was restoring the _previous_ held draft
over the newer one. The cell now shows the text just refused, which is what
rule 4 always said. This is `LiveField`'s, so every cell that holds a refusal
gets it — the estimate cells included.

## Non-Goals

- No change to what a priority may be, to the leveller, or to the wire.
- Enter is not wired into the estimate cells. They have the same gap and it is
  a separate call about their trio syntax.
- No focus move on Enter. Moving on is the chord's.

## Constraints

- The cheat-sheet registry is the only prose description of this keyboard, and
  the cards renderer has no Prio cell — the entry must be table-only.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Prio cell commits on Enter, and holds the newest refusal.

## Domain Terms

None new.

## Decisions Recorded

none

## Impact

fe-01 (`wbs-table.tsx`, `live-editing.ts`, `keyboard-bindings.ts`), the tests
beside them, and `keyboard-cheat-sheet.test.tsx`'s `PROVEN_BY` mapping.
