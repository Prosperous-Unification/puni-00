<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **"make sure that all places where we show hint — this is not
slow system hint, but custom instant pretty hint"**, with the Start cell's
tooltip named as the example of what one should look like.

That cell was fixed on its own the day before (`start-date-hover-card`). The
argument it was fixed on applies to every other hint in the app and was never
carried to them: a `title` is the **browser's** tooltip, not this app's.
Chromium waits about a second before showing one, draws it in the platform's
chrome rather than the page's, and puts it where the pointer is rather than
under the control. Nothing in a stylesheet reaches any of that, and where a card
and a `title` describe the same pixels the browser's races the app's — which the
folded step cell's own comment had said a fortnight earlier.

Counted before anything was written: **94 native `title` attributes across 15
files**, against six kinds of hand-written card. The plan toolbar alone had 27.

## What Changes

- A control's hint moves from `title` to **`data-hint`**, and one `HintLayer`
  mounted once per document draws every one of them in the page's own card,
  instantly, placed under the control.
- One listener and one piece of state for all of them. Every `pointerover`
  replaces the reading outright, so there is no departure to miss — the failure
  mode a per-control enter/leave pair has.
- The keyboard opens the same card from `focusin`, and the control points
  `aria-describedby` at it while it is open, so the description a `title` used to
  give a screen reader is not lost.
- **No control in this app carries a `title` any more**, and a browser test
  sweeps the whole plan to say so.

## Non-goals

- The six hand-written cards stay as they are. They hold rendered markdown, a
  scrolling document, a dependency list — content, not a sentence — and folding
  them into this layer would make one component do two jobs.
- No wording is changed. This is where the words are drawn, not what they say.

## Constraints

- The words stay in the DOM, in `data-hint`, because several oracles read a
  control's hint back out and none of them can hover (`data-start-said`'s reason).
- A **disabled** `Button` is out of reach: `disabled:pointer-events-none` makes
  it untargetable, so no `pointerover` names it. Measured, and written down.
