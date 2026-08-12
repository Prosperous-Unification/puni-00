# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5). The fault letters and numbers are `verify.md`'s.

## 1. The arithmetic, before any DOM

- [x] `plan-scroll-link.ts`: `firstShownIndex` and `alignmentMove` over a
      `PlanFace` of `contentTop` / `count` / `at(index)`. Pairing by id,
      positioned by index; the carry is a fraction of a row.
- [x] The unit cases that pin each decision: the half-covered row is the row on
      show; the search measures five rows of twenty; a wrapped 46px row carries
      40/46 of a 28px one; a different id at the index moves nothing; a
      difference under a pixel is not a move. Faults 1, 2 and the search's
      bound, watched.

## 2. Reading a face off the page

- [x] `rendererFace` and `panelFace`, each throwing where its heading is not
      there to measure from — the heading **cell**, not the `<thead>`, which is
      the browser's own correction to this design. Faults 5, 6, 7, watched.
- [x] `linkPlanScroll`: both faces listen, the follower is written and read
      back, and nothing sideways is ever written. Faults 3, 4, 8, watched in
      jsdom against stubbed rects.

## 3. The frame that stops growing

- [x] `TABLE_FRAME.flex` is `0 1 auto`, with the arithmetic of what it costs and
      what the shrink still guarantees written where it is declared.
- [x] The two unit assertions that quote the declaration — `table-frame.test.ts`
      and `wbs-table.test.tsx` — say the new one and why the shrink is the half
      that matters.

## 4. The browser, which is the only thing that can see any of it

- [x] `e2e/plan-surface.spec.ts`: the chart docked under a short plan against
      the audit's own 508px; a tall plan still ending at the window's bottom
      with the frame and chart adjacent; the chart following the table; the
      table following the chart; a keyboard walk that scrolls, with the focus
      asserted after it; and neither face moving the other sideways with a role
      unfolded. Faults A, B, C, D, watched.
- [x] Every case asserts the row-for-row pairing first, so a chart one row short
      cannot pass by pairing off by one.

## 5. What the frame stopped guaranteeing

- [x] `roomForCard` takes the box that clips the card — the window **and** the
      frame — rather than the window's height. Fault E, watched in the browser.
- [x] `e2e/gantt.spec.ts`'s height-drag assertion is replaced by what it was
      about: the section does not grow and the page does not scroll.
- [x] `e2e/hover-cards.spec.ts`'s room case fills its frame first, and says why.

## 6. The words

- [x] `CONTEXT.md` gains **Linked scroll**.
- [x] The spec delta adds both requirements with their scenarios.

## 7. The gate

- [x] fe-01's unit suite under a real node on h2puni.
- [x] The browser suite in the Playwright image on h2puni.
- [x] `format:check`, `lint` and `typecheck` on h2puni.
- [x] CI green: the whole gate plus the pixels job.
