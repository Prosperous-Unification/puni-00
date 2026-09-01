<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **"after adding `tag1` the UI invites another tag, but
clicking the small add field shows no dropdown of existing tags"** — and he
added that it likely applies to Types, Services and Teams too. It does: all
four are one `CreatablePicker` inside one `ReferenceSetStrip`.

Three facts meet to produce it, and each is right on its own:

- the list opens from the box's `focus`;
- a take closes it — `setTyped(null)`, at once or once `closeWhen` is satisfied;
- and a take deliberately does **not** move the focus. The list's own
  `mousedown` calls `preventDefault` precisely so the box keeps the keyboard.

So after adding a value the box holds the focus with no list under it, and a
click on a node that already has the focus fires no focus event. There was no
gesture left that could reopen it: the reader had to leave the cell and come
back. The `+` beside the box is the same dead press, because all it does is
`focus()` a box that is already focused.

Measured in Chromium before the fix: `clicking the focused add field offered
nothing · Expected: 2 · Received: 0`.

## What Changes

- The picker's box opens its list on a **click** as well as on focus, when the
  list is closed.
- The `+` on the reference strip and the `+` inside the picker both focus the
  box **and** click it, so either state — focused or not — opens the list.
- Fixed once, in what the four cells share, so Teams, Tags, Services and Types
  all gain it, as do both card faces on a phone.

## Non-goals

- **The list is not kept open after a successful add.** That would arguably be
  better for a multi-value strip, but `closeWhen` is a contract this component
  shares with the single-value pickers and Dany described the gesture, not the
  policy. Worth revisiting on its own.
- No change to the ranking, the filter, `Add "…"`, or what a take sends.
- No change to the keyboard: focus already opens the list, and Escape already
  closes it.

## Constraints

- A click must never overwrite a half-typed search. `typed` is null only while
  the list is closed, so the reopen is guarded on it.
- A click and not a `mousedown`: a discrete update inside a `mousedown` dispatch
  loses the focus the browser is about to move (`e2e/keyboard.spec.ts`, R5 #18).
