## Why

Dany, 2026-08-06: with the caret at the beginning of an item, Backspace should
move the child up to its parent's level.

The typing flow already treats structure as keystrokes — Enter makes a sibling,
Tab indents, Shift+Tab outdents. But Backspace at the start of a line is the
outliner reflex for "this doesn't belong under here", and today it deletes
nothing and does nothing: the caret is already at position zero, so the key is
free.

## What Changes

**Backspace at the very start of a name outdents the row**

- From: Backspace with the caret at position 0 of the Name cell is a no-op.
- To: with the caret at the start, nothing selected, and the row not already at
  root level, Backspace does exactly what Shift+Tab does — the row becomes the
  next sibling of its own parent. Anywhere else in the text, or with a
  selection, Backspace stays a backspace.
- Impact: fe-01 only, the Name cell's keydown. Same `move` request Shift+Tab
  sends; nothing new for be-01.

## Non-Goals

- **No merging with the previous row.** Text editors join lines on this key;
  a work item is not a line of text, and silently gluing two items' names
  together destroys structure nobody asked to lose.
- **No deleting empty rows.** The Delete button and its cascade/promote rules
  own removal; Backspace never removes a row.
- **Other cells stay untouched.** Notes and estimates have no Tab family
  either; structure keys live where structure is typed — the Name cell.
