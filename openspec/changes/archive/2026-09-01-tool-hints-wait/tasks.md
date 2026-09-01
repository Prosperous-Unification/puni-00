<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Two kinds, one layer

- [x] 1.1 `HINT_ATTRIBUTE` gains a sibling, `FACT_ATTRIBUTE = 'data-fact'`, and
      `HintLayer`'s `closest` takes both so the **nearest** answers. A fact chip
      inside a hinted toolbar is the case that decides it.
      Test: `hint.test.tsx` — `a fact inside a hinted element answers first`.
      Negative: the selector narrowed back to `[data-hint]` alone; watched
      failing because the outer control's words are the ones drawn.
- [x] 1.2 A fact opens as it does today; a hint waits `TOOL_HINT_WAIT_MS`
      (3000). One pending timer, cleared by every `pointerover` that names a
      different mark, by `pointerleave`, by scroll and by resize.
      Test: `hint.test.tsx` — `a tool hint shows nothing until the wait is out`
      and `a pointer that moves on before the wait opens nothing`, both on fake
      timers.
      Negative: the wait removed (`setOpen` called straight from `pointed`);
      watched failing on the card being present at 0ms.
- [x] 1.3 `focusin` opens both kinds with no wait, because there is no cursor to
      put a ring beside and a delay there withholds a description.
      Test: `hint.test.tsx` — `the keyboard opens a tool hint at once`.
      Negative: the focus path routed through the same timer; watched failing
      before any timer is advanced.

## 2. The wait ring

- [x] 2.1 `WaitRing` — a fixed, `pointer-events: none` mark drawn beside the
      cursor, `role="presentation"`, marked `data-wait-ring` so an oracle can
      find it without hovering. Its fill is a CSS animation over the remaining
      wait rather than a per-frame state update: a ring re-rendering the layer
      sixty times a second while the pointer rests is a cost paid on every
      control in the app.
- [x] 2.2 It is drawn only after `RING_QUIET_MS` (400) of the wait has passed,
      which is the whole of what makes a sweep across the toolbar leave nothing
      behind.
      Test: `hint.test.tsx` — `a sweep across three controls draws no ring`.
      Negative: `RING_QUIET_MS` set to 0; watched failing on a ring found after
      the first crossing.
- [x] 2.3 It follows the cursor: a `pointermove` listener added **only** while a
      wait is pending, removed when it resolves either way.
      Test: `hint.test.tsx` — `the ring follows the cursor while it waits` and
      `no pointermove listener survives the wait`.
- [x] 2.4 No ring for a fact, for a focus, or for a touch pointer.
      Test: `hint.test.tsx` — `a fact draws no ring`.

## 3. Pass-through props

- [x] 3.1 `Hintable` gains `Factable`, and every wrapper that declares
      `'data-hint'?: string` declares the sibling: `Button`, `Input`,
      `CellInput`, `DateField`, `CreatablePicker`, `ReferenceSetStrip`,
      `MenuControl`. A props interface is not an intrinsic element, so React's
      blanket `data-*` permission does not reach it.
- [x] 3.2 A caller passing **both** is a fault, and the check for it is the
      browser sweep in 5.1 rather than a type. Two optional strings cannot say
      "one or the other" in TypeScript without a discriminated union at every
      wrapper, which would rewrite ninety call sites to guard against a mistake
      no call site has made; the sweep can fail, and was watched failing.

## 4. The sweep

- [x] 4.1 Roughly 30 sites become `data-fact`: inherited team / tag / service
      and the row each came from, a row's number, its finish, its slack, the
      critical-path note, capacity gaps, a link's `href`, an assumed assignee, a
      step's problem message, a team's concurrency limit, a priority band's name
      and range, a menu action's `refusedBecause`, the unsaved-edit mark, and
      every `plan-cards` card title, span and slack.
- [x] 4.2 Six conditional sites spread the attribute across their branches
      rather than picking one — the reorder grip, the facet boxes,
      Collapse/Expand all, the priority cell, the not-before cell, the saved-view
      button. The attribute written is the one the words being shown belong to.
- [x] 4.3 The oracles that read a hint back out follow the words: every
      `getAttribute('data-hint')`, `[data-hint=…]` selector and
      `toHaveAttribute('data-hint', …)` in jsdom and e2e that now names a fact.

## 4b. A wait is fragile in a way an instant card was not

- [x] 4b.1 A `focusin` on a mark with **nothing to say** no longer clears
      anything. Departure belongs to `blurred`, which is already narrowed to the
      mark being attended. Without this, adding a work item killed every toolbar
      hint for the rest of the visit — the write hands the keyboard to the new
      row's Name box, and the pointer never moves again.
      Test: `hint.test.tsx` — `keeps a pointer's wait when the keyboard lands on
something with nothing to say`.
      Negative: the `clear(); return;` put back; watched failing on `expected
null not to be null`.
- [x] 4b.2 A scroll or resize closes an **open** card, whose anchor it makes
      stale, and leaves a **pending wait** running. Reasoning rather than a
      sighting; asserted either way.
      Tests: `hint.test.tsx` — `leaves a waiting tool hint running when the page
settles under the pointer` and `still closes a card that is already open`.
      Negatives: both watched.
- [x] 4b.3 The card is placed from the control's rectangle read **when it
      opens**, not when the pointer arrived. Three seconds is long enough for
      the page to have moved.
      Test: `hint.test.tsx` — `places the card from where the control is when it
opens, not where it was`, on a stubbed rect because jsdom measures zero.
      Negative: watched failing on `expected 'position: fixed; top: 36px; left:
10p…' to contain 'left: 400px'`.

## 5. The sweep stays swept

- [x] 5.1 `e2e/hints.spec.ts` sweeps the whole plan for a mark carrying **both**
      attributes and expects none. This is what makes 4.1 hold next month, and
      a browser is the only place the whole plan is drawn at once.
      Negative: `data-fact` added beside an existing `data-hint` on the Undo
      button; watched failing with the offending node in the diff.
- [x] 5.2 `e2e/hints.spec.ts` — a toolbar control is silent at one second and
      carded at three, and the ring is absent at 200ms and present at one
      second within 40px of the cursor. The ring's box is asserted to have area
      before anything is claimed about where it is: `G gantt-calendar-axis`'s
      sixteenth fault is a box with no area being inside every box there is.
      Negative: `TOOL_HINT_WAIT_MS` set to 0; watched failing on a card found at
      one second.
- [x] 5.3 `e2e/hints.spec.ts` — a fact is carded within 400ms and never rings.
      Negative: the fact routed through the tool path; watched failing on the
      400ms budget.
- [x] 5.4 The existing `no native tooltip anywhere` sweep is untouched and still
      passes.

## 6. Gate

- [x] 6.1 fe-01's jsdom suite, the whole browser gate on shifted ports, lint,
      typecheck, format, `openspec validate --all`. Results and the
      failure-proof table in `verify.md`.
