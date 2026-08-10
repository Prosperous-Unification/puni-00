## Why

The table has thirteen editable cells per row once two roles are seeded, and the
only way between them is Tab — which this table does not use for that. Tab and
Shift+Tab indent and outdent, deliberately, because restructuring while typing is
what a breakdown needs most.

So there is no keyboard way to move from a name to its estimates, or down a
column of optimistic days filling them in. A planner entering figures for forty
rows reaches for the mouse on every cell, and reaching for the mouse is what the
keyboard-first entry path was built to avoid. It is the last thing in the table
that a spreadsheet does and this does not.

## What Changes

**The arrow keys move between cells**

- From: nothing. Arrow keys move the caret inside an input and no further.
- To: Up and Down move to the same column of the row above or below, in the order
  the rows are on screen. Left and Right move to the previous or next editable
  column of the same row — but only once the caret has nowhere left to go.
- Impact: fe-01 only. No request, no contract, no server change.

**Typing still wins**

- From: n/a.
- To: Left with the caret mid-word moves the caret, as it always has. Only a
  caret already at position 0, with nothing selected, hands the key to the grid.
  Right is the same at the end of the value.
- Impact: a rule that has to be right, because getting it wrong makes the table
  unusable for the thing it is mainly used for.

## Non-Goals

- **Wrapping at the ends.** Left in the first column stays put rather than
  jumping to the end of the row above. A caret that has run out of room is not
  asking to leave the row.
- **Selecting a range, or copy and paste across cells.** One cell has focus at a
  time; this moves that focus and nothing else.
- **Home, End, Page Up, Page Down.** The browser's own meanings inside an input
  are useful and are left alone.
- **Making the number column focusable.** It is derived, not editable, and
  stopping on it would be one keypress of nothing on every row.
