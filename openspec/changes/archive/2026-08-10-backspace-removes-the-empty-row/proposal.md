# Backspace removes the empty row

## Why

Dany, 2026-08-06: editing should feel like a bulleted list — Enter starts a new
item, Tab indents, Backspace outdents, and Backspace _again_, on an item that is
wholly empty, removes it. The first three exist. The fourth does not: an
abandoned empty row today needs the mouse and the Delete button, which breaks
the typing flow the other three keys built.

This deliberately supersedes the "No deleting empty rows" non-goal recorded in
`backspace-outdents` — that line kept Backspace away from row removal while the
key's structural meaning was still settling. Dany has now asked for exactly
this behaviour, in these words.

## What Changes

**Backspace at the start of an empty root row removes it**

- From: Backspace with the caret at position 0 of a root row's Name cell does
  nothing.
- To: when that row's item is wholly empty — nothing typed in the Name cell,
  no notes, no estimates of its own, no children, no dependencies — Backspace
  removes the row and the focus lands at the end of the Name above it. A row
  holding any of those keeps the key exactly as it is today.
- A nested row still outdents first (unchanged): Dany's sequence is "backspace
  = unindent, backspace again = remove", so removal happens where outdenting
  has nowhere left to go — at root level.
- Emptiness of the name is judged by what is in the input, not what was last
  committed: someone who deletes every character and presses Backspace once
  more is finishing the same gesture, and blur has not happened yet.
- Impact: fe-01 only, the Name cell's keydown. `api.remove` already exists; the
  row can have no children, so no cascade strategy is involved.

## Non-Goals

- **No merging with the previous row.** Same reasoning as `backspace-outdents`:
  a work item is not a line of text.
- **No removal of non-empty rows, from anywhere.** Notes, estimates, children
  or dependencies each veto the removal — content is only ever deleted by the
  Delete button, which is a click and not a keystroke reflex.
- **No Enter changes.** Enter already creates the sibling; splitting text at
  the caret is a different feature nobody asked for.
