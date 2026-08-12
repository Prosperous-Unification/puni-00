# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5).

## 1. The room a card has, as arithmetic

- [x] `roomForCard(anchor, viewportHeight)` in `hover-card.tsx`: returns the
      side the card opens on and the height ceiling for that side, from the
      cell's own rectangle and the window's height. Pure — jsdom answers
      `getBoundingClientRect` with zeroes, so this is the only layer the
      numbers can be asserted in.
- [x] Unit tests in `hover-card.test.tsx`: room below when the cell is high,
      room above when it is low, the 90%-of-window ceiling biting when both
      sides are large, and the floor when neither side has room.
- [x] Watch each fail with the branch it names removed.

## 2. The preview measures its cell and takes that room

- [x] `HoverCard` with `scrolls`: read the offset parent's rectangle in
      `useLayoutEffect`, apply `roomForCard`'s side (`top: 100%` or
      `bottom: 100%`) and its ceiling as `maxHeight`.
- [x] ~~Throw when the wrapper is absent rather than defaulting to a side.~~
      **Not written, deliberately.** A layout effect runs on a mounted node and
      a mounted node has a parent, so no injected fault can make that throw
      fire — a check whose failure can never be observed is the fault R5's
      tally counts. It is an early return with the reasoning on it; what is
      proven instead is that the measurement happens at all. See `verify.md`.
- [x] Update `lets the one card that scrolls take the wheel back` — it asserts
      the 320px that this change removes.

## 3. The preview is wider

- [x] 640px for the scrolling preview, still under `100vw`; every other card
      stays at 420px.
- [x] Unit test: the preview's own max width, and a folded-role card's
      unchanged.

## 4. The browser facts

In `apps/fe-01/e2e/hover-cards.spec.ts` — jsdom lays nothing out, so none of
these can be seen anywhere else (R5 #14–16).

- [x] A long note's card is taller than 320px and no taller than 90% of the
      window.
- [x] A row low in the table opens its card **above** the cell, with the card's
      bottom edge above the cell's top edge and its top edge on screen.
- [x] The pointer still reaches an upward-opened card without it closing.
- [x] The existing `scrolls a note taller than the preview` still holds.
- [x] Watch each fail with the measurement removed (the side forced to
      `below`, the ceiling forced to 320).

## 5. Gate

- [x] `bunx nx format:check --all`
- [x] `bunx nx run-many -t test lint typecheck build --parallel=2`
- [x] `bun run e2e` (this checkout's dev server only — see the landmine)
- [x] `openspec validate --all --json`
- [x] `verify.md` with the commands, their output, and the failure-proof table.
