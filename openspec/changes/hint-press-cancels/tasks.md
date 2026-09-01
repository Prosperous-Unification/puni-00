<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. A press ends the wait

- [x] 1.1 `HintLayer` gains a document `pointerdown` listener: a press landing
      inside the mark being attended calls `stopWaiting()`. `pointerdown` and
      not `click`, because the cancel has to beat the `focusin` Chromium fires
      on mousedown. **No new state**: `attending` stays set, which is what
      makes every path that could restart the wait already refuse to.
      Test: `hint.test.tsx` — `a press ends the wait it interrupted`.
      Negative: the `pointerdown` listener removed; watched failing on the card
      being present a whole wait after the press.
- [x] 1.2 A press on a **project fact** leaves its open card alone. The press
      path ends a _wait_, and a fact has none — so it calls `stopWaiting()` and
      never `clear()`.
      Test: `hint.test.tsx` — `a press leaves a fact's card alone`.
      Negative: `stopWaiting()` in the press path replaced by `clear()`;
      watched failing on the fact's card gone after the press.
- [x] 1.3 The quiet lasts until the **cursor moves**, which is not the same as
      until the mark under it changes. `pressedAt` holds the press's own
      coordinates and `pointed` returns early for any `pointerover` reporting
      them, because a dialog opening and closing under a still cursor fires two
      of those and read as a departure they restart the whole wait.
      Test: `hint.test.tsx` — `is not restarted by the page redrawing under a
cursor that has not moved`, and in a browser, the tail of `a press ends
the wait, and the ring with it`.
      Negative: the coordinate comparison removed; watched failing in both.
- [x] 1.4 A real move ends the quiet, so a pressed control explains itself again
      on the next rest. Nothing remembers which control was pressed.
      Test: `hint.test.tsx` — `waits again once the pointer has left and come
back`; `e2e/hints.spec.ts` — `a pressed control explains itself again once
the pointer has left`.
      Negative: `pointed`'s `pressedAt = null` removed; watched failing on the
      control silent for the rest of the visit.

### Two checks not written, and why

The plan's first draft had `pointed` and `focused` each consulting a `pressed`
marker. Both would have been checks that cannot fail:

- `focused` already returns early on `at.node === attending`, so the press's own
  `focusin` opens nothing today. Its negative — the marker's check removed —
  passes, because the identity guard beside it refuses first.
- `pointed` already returns early on the same identity, so a `pointerover`
  bubbling from a child of the pressed control restarts nothing today.

Both behaviours are asserted in 1.1's test as part of the press's own sequence
rather than claimed as new guards. `AGENTS.md`: write the negative before you
believe the line.

## 2. The number cell speaks only when clipped

- [x] 2.1 The `#` cell's `data-fact` becomes conditional on
      `number.length > NUMBER_ENVELOPE.length`, spread rather than written as
      `undefined`, so an ordinary row carries no attribute at all.
      Test: `wbs-table.test.tsx` — `an ordinary row's number cell carries no
words` and `a number past the envelope carries the whole of it`.
      Negative: the length guard removed; watched failing on `010` carrying a
      fact.
- [x] 2.2 `e2e/hints.spec.ts`'s 400ms fact budget moves off
      `td span[data-fact="010"]`, which no longer exists, onto another **named**
      mark — the finish cell — and stays pinned to that one rather than
      `[data-fact]` unqualified. `AGENTS.md`'s landmine: a locator that says
      "the first mark of this kind" is not about any particular mark.

## 3. The browser says so

- [x] 3.1 `e2e/hints.spec.ts` — a toolbar control pressed and rested on shows no
      card at the end of the wait and no ring at any point after the press. The ring
      is read while the button is **held down**, before the dialog it opens
      exists: read after a full click, the assertion cannot fail, because the
      dialog's own redraw clears the ring through a path the press has nothing
      to do with. A browser
      and not jsdom, because the focus a press causes is a **default action**
      and jsdom performs none: `AGENTS.md`'s R5 #14 and #17 are this exact seam.
      Negative: the `pointerdown` listener removed; watched failing.
- [x] 3.2 `e2e/hints.spec.ts` — the same control, left and returned to, cards at
      two seconds. This is what says the quiet is a cancelled timer and not a
      control marked silent for the visit.
      Negative: `pointed`'s `pressedAt = null` removed; watched failing.
- [x] 3.3 Every silence in the new cases is read once, with
      `expect(await locator.count()).toBe(0)`, never `toHaveCount(0)` —
      `LLM_README.md`'s landmine: an auto-waiting matcher cannot assert an
      absence that is only temporary.

## 4. Words

- [x] 4.1 `CONTEXT.md` gains **Press quiet**. `hint.tsx`'s JSDoc carries why the
      cancel is on `pointerdown`, and why it is `stopWaiting()` rather than
      `clear()`.

## 5. The wait comes down to two seconds

- [x] 5.1 `TOOL_HINT_WAIT_MS` becomes `2000`. Dany, 2026-09-01, having watched
      the shipped ring: _"change 3000 to 2000, leave 400ms quiet"_.
      `RING_QUIET_MS` stays `400` — the quiet is about a cursor **crossing** a
      control, which is as fast as it ever was, so the whole second comes off
      the ring's own sweep, which is computed from the pair.
      Every jsdom case already advances by the constant rather than by a
      literal, so the suite follows it; the two literals that do not are in
      `e2e/hints.spec.ts` and come down with it.
      Test: `e2e/hints.spec.ts` — `a toolbar control waits two seconds, and
rings while it does`, whose card budget is now the rest of the wait plus
      600ms of slack rather than a generous default.
      Negative: `TOOL_HINT_WAIT_MS` put back to `3000`; watched failing on the
      card missing inside that budget.

## 6. Gate

- [x] 6.1 fe-01's jsdom suite, the whole browser gate on shifted ports, lint,
      typecheck, format, `openspec validate --all`. Results and the
      failure-proof table in `verify.md`.
