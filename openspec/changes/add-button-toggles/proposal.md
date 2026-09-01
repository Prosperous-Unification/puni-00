<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-01: **"can you make it so that clicking second time on plus sign
for tags/deps on/teams/services hides the add UI"**.

The `+` on a reference cell opens the picker and has no other state. Pressing it
again does what pressing it the first time did — the list is already open, so
the second press is a no-op the reader cannot tell from a dead control. The way
out is a click somewhere else or Escape, neither of which is where the reader's
hand is: it is on the `+` they just pressed.

A control that opens something and cannot close it is half a control, and the
`+` is the only affordance these cells have.

## What Changes

- The `+` **toggles**. Pressed while its picker's list is open, it closes the
  list and leaves the cell at rest; pressed at any other time it opens the
  picker exactly as it does today.
- Four cells, two implementations, one rule. Tags, Teams and Services (and
  Types) go through the reference strip's `+`; Depends on has its own beside
  its own box. Both get the same behaviour and both say so in the same words.
- The predicate is **the list**, not the focus. A box that holds the focus with
  no list under it is the state a reader is in the moment after adding a value,
  and `picker-reopens-on-click` exists because the `+` has to open the list
  again from exactly there. Reading the focus instead would close the cell in
  the one state that change was written to fix.

## Non-goals

- No change to Escape, to the click-outside path, or to what closing discards.
  Closing from the `+` is the same close those already make.
- No change to the keyboard. The `+` is not a tab stop on either cell and does
  not become one — the box is the keyboard's path in and out.
- No toggle on any other `+` in the app. The estimating panel's and the
  toolbar's add controls do not open a list to close.

## Constraints

- The press must not move the focus, which is why both buttons already
  `preventDefault` their `mousedown`. The toggle runs from the click.
