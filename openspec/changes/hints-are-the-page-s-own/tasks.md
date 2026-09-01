<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. One card for all of them

- [x] 1.1 `HintLayer` — one listener, one piece of state, mounted once in
      `app.tsx`. `hint.test.tsx` drives its seven cases in jsdom. Every negative
      watched; the outputs are in `verify.md` and the `Proof:` comments were
      written **from** them, not from what they were expected to be.
- [x] 1.2 `HoverCard` grows `compact`, which is the difference between a card
      explaining a cell and a hint on a 24px toolbar button: the first has a
      260px floor so a sentence does not come out one word per line, the second
      is the width of its own words.
- [x] 1.3 `Hintable` — the one optional string a wrapper component extends to
      accept a hint. React's blanket permission for `data-*` reaches intrinsic
      elements and not a props interface, so `Button`, `Input`, `CellInput` and
      `DateField` each say they take one.

## 2. The sweep

- [x] 2.1 94 `title` attributes across 15 files become `data-hint`. 51 were on
      DOM elements and moved mechanically; the other 43 were on wrapper
      components, and `MenuControl`, `ReferenceSetStrip` and `CreatablePicker`
      had a declared `title` prop renamed with them.
- [x] 2.2 The oracles that read a control's hint follow it: 5 jsdom files
      (`getAttribute('title')`, the `.title` property, `getByTitle`, a
      `span[title=]` selector and an attribute loop) and 5 e2e files. `columnDay`
      in `gantt-panel.test.tsx` kept a `[title]` **selector** while reading
      `data-hint` and was the last two failures of the run.
- [x] 2.3 `hinted()` replaces `getByTitle` in `wbs-table.test.tsx`, and throws
      on both none and more than one rather than taking the first.

## 3. The sweep stays swept

- [x] 3.1 `e2e/hints.spec.ts` sweeps the whole plan page for `[title]` and
      expects none. This is the check that makes 2.1 hold next month, and it is
      one only a browser can make: jsdom draws no tooltip of any kind, so a
      `title` left on a control is invisible to every test upstairs.
- [x] 3.2 And the card is measured where it lands — its own area first, then
      below the control and overlapping it horizontally. `G
gantt-calendar-axis`'s sixteenth fault is why the area is asserted before
      anything is claimed about the position: a box with no area is inside every
      box there is.
- [x] 3.3 The 400ms budget is the claim rather than a convenience. Playwright's
      5s default would be satisfied by exactly the native tooltip this change
      removes.

## 4. A cell that owns a card carries no hint

- [x] 4.1 The Depends on cell draws its own card listing every row it waits for,
      and three of its controls carried hints as well — the count chip, each
      chip's `✕`, and the search box. All three opened a **second** surface over
      the same pixels, which is the race `start-date-hover-card` removed
      arriving from the other side. Found by the whole browser gate: three of
      `e2e/hover-cards.spec.ts`'s cases failed, on a count of two cards where
      one was expected. The hints are gone; the card is the cell's one hint.
- [x] 4.2 A general guard — hover every `<td>` of a row and expect at most one
      surface — was written and **deleted rather than shipped**. With the box's
      hint put back it was watched **passing**: a freshly added row has no
      dependencies, so that cell's own card never opens and there is nothing for
      a hint to collide with. The window the fault lives in is a _populated_
      Depends on cell, which `hover-cards.spec.ts` already seeds and already
      asserts — and that assertion was watched failing on this exact fault,
      twice. R5's "assert in the window the fault lives in".

## 5. Gate

- [x] 5.1 fe-01's jsdom suite, the whole browser gate, lint, typecheck, format,
      `openspec validate`. Results in `verify.md`.
