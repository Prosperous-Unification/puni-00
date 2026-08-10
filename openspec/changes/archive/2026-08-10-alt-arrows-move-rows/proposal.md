# Alt and an arrow move the row

## Why

Restructuring is the one thing this table still asks for the mouse, or for the
caret to be somewhere particular. Tab indents and Backspace outdents **only at
position zero of the Name cell** — that rule exists so those two keys keep
their text meaning everywhere else, and it is right. Its cost is that moving a
row while you are mid-sentence in a name, or standing in an estimate box, means
leaving the keyboard: reach for the drag handle, or walk the caret to the start
of a cell you were not in.

Both UX reviews ranked this in their top six. Alt is the modifier no cell's text
editing needs here, so it can carry structure from **any** cell and **any** caret
position without taking a keystroke away from typing.

## What Changes

**Alt+arrow restructures from wherever the focus is**

- **Alt+Up / Alt+Down** swap the row with its sibling above or below. Siblings
  only: no wrap at the ends, and no reparenting — crossing into another parent
  is what Alt+Left/Right and the drag are for. The request is
  `move(id, parentId, afterId)` with ids read from the tree on screen, never a
  computed position, so a stale read asks for a move be-01 can still judge
  rather than one nobody meant.
- **Alt+Left** outdents and **Alt+Right** indents under the sibling above — the
  same two operations Tab and Shift+Tab already perform, reached from any cell
  and any caret position. The same edges stay no-ops: a root row cannot outdent,
  a first sibling has nothing to indent under.
- **The focus keeps its column.** Alt+Down from an estimate box lands in that
  same box of the moved row after the refetch. Creating and removing rows still
  land in the Name cell, because that is where typing continues.
- **A frozen row says why it did not move**, in the sentence the drag already
  uses. be-01 refuses it anyway; a keystroke that does nothing and says nothing
  is indistinguishable from a broken key.
- **Alt+arrows are dropped while a move is in flight.** A held arrow repeats,
  and each repeat is a request and a refetch; dropping the ones that arrive
  mid-flight keeps a leaned-on key from queueing moves against a tree nobody has
  seen yet.

## Why lifting the caret-zero rule is safe now

Tab and Backspace are keys that type. They earn their restriction: Backspace
anywhere but position zero deletes a character, and taking it would be
unusable. Alt+arrow types nothing in this table — the grid navigation already
ignores every modified arrow (`nextCell`), so nothing is being taken from a key
that had a job here.

## The macOS trade-off, stated

On macOS, Alt+Left/Right is word-jump in a text field and Alt+Up/Down moves by
paragraph. The grid takes all four, and `preventDefault`s them, because a key
handled halfway is the worst outcome: on that platform an un-prevented Alt+arrow
also inserts characters into the field. What word-jump loses is recoverable —
plain arrows still walk the caret, and Cmd+Left/Right still jump to the ends of
a line — and these cells hold a name or three numbers, not paragraphs. This is
the same trade Tab already makes at caret zero.

## Non-Goals

- **No global key capture.** The handler lives on the cells that already route
  their keys (name, estimate boxes, the folded trio cell, notes). The dependency
  picker, the assignee picker and the date inputs are not `data-cell` grid
  inputs and keep their own keys — the picker's Alt+Down still moves its
  highlight.
- **No reparenting by Alt+Up/Down.** Moving between parents stays with
  Alt+Left/Right and the drag.
- **No debounce.** Every repeat is a valid move; the busy rule is the only limit.
- **No multi-row selection.** One row, the focused one.
