<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-01: **"interaction with the element must stop the spinner from
appearing; if user clicks and interacts with the element, no need to show the
tooltip; only show tooltip after prolonged hover without clicks"**.

`tool-hints-wait` made a tool hint wait three seconds behind a wait ring. It
reads the pointer resting as _"this reader does not know what this control
does"_ — but a reader who has just **pressed** the control has answered that
question themselves, in the strongest way available. The ring then fills beside
a cursor that is busy, and three seconds after a click the card arrives over
whatever the click just did.

And the `#` cell draws a card that repeats the screen. Dany, same message:
**"also remove tooltips from # cells; why it needed?"** Its fact is the row's
own number, and for `010` the card says `010`.

## What Changes

- A **press** on the mark a tool hint is waiting for ends that wait: no card,
  no ring. The mark stays **press-quiet** while the pointer remains on it, so
  neither the press's own `focusin` nor a `pointerover` from a child restarts
  the wait. Moving the pointer to a different mark, or off it, drops the quiet
  and the next rest waits its full wait again.
- A **project fact** is untouched. It never waited and never rings, and its
  words are about the plan rather than the control — pressing a slack cell does
  not make its slack less worth reading.
- The wait itself comes down from three seconds to **two**, with the 400ms
  quiet left where it is. Dany, same day, having watched the shipped ring:
  _"change 3000 to 2000, leave 400ms quiet"_.
- The `#` cell carries its fact **only when the number does not fit**. The
  column is sized to `NUMBER_ENVELOPE`, so a number past that width is clipped
  and the card is the only way to read it whole; every ordinary row now says
  nothing at all.

## Non-goals

- No memory of which controls have been pressed. The quiet lasts while the
  pointer stays, not for the visit — a control that stays silent for a reason
  the reader cannot see is worse than one that repeats itself.
- No new suppression for the keyboard. A focus that is not a press still opens
  both kinds at once.

## Constraints

- The press must beat the focus. Chromium focuses a `<button>` on mousedown, so
  a cancel that ran after `focusin` would be a card the click had already
  opened.
