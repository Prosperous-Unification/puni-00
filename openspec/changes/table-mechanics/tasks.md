# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5).

## 1. The eight keys, as one question asked in one place

- [x] `altMoveIn` and `AltMove` move out of `wbs-table.tsx` into
      `keyboard-bindings.ts`, unchanged, so that file can answer "does this
      keystroke leave the cell" about both families without a component
      importing a component.
- [x] `escapesAnOpenList(event)` beside them: true for the four motion chords
      and the four Alt+arrows, false for everything else — which is what splits
      the routing matrix's inert row in two.
- [x] `CreatablePicker` gains `gridCell.onAltMove` and consults
      `escapesAnOpenList` before its own open-list branch.
- [x] `wbs-table.tsx`: the same branch in the Depends on cell, `onAltMove`
      wired to the Service/team and assignee pickers, and `onAltMove` added to
      both earliest-start handlers (the cell at rest and the open editor).

## 2. The chords, asserted per direction per cell class

In `wbs-table.test.tsx`, `the chords reach the picker cells and the date cell`
— fourteen cases, every direction in every class that answered none of them.

- [x] Depends on, list open: Ctrl+H, Ctrl+L, Ctrl+J, Ctrl+K, Alt+↑, Alt+↓,
      Alt+←, Alt+→.
- [x] Service/team, list open: the same eight.
- [x] An assignee cell: Alt+← and Alt+→.
- [x] Earliest start, at rest and in its open editor: the same eight.
- [x] Watch each fail with the branch it names removed — three injections,
      twelve of the fourteen cases red, in `verify.md`. The two that stayed
      green are the Ctrl chords in the earliest-start cell, which were never
      broken; they are pins.
- [x] Narrow the two existing inert-list pins by name rather than delete them:
      the chords that make or destroy a row are still swallowed.
- [x] Reverse `leaves the dependency picker's own alt arrows alone`, which said
      the opposite, and keep its true half — the bare arrows are the list's.
- [x] The cheat sheet's `PROVEN_BY` map names every new case, and its own test
      is what refuses a promise nothing proves.

## 3. The Name cell's grip

- [x] `[data-grid] textarea { resize: none }` in `styles.css`.
- [x] `e2e/name-cell.spec.ts`: a drag of the bottom-right corner leaves the box
      and the row the height they were, and the box still grows with its text.
- [x] Watch both fail with the rule removed. A browser only (R5 #14–16): jsdom
      performs no drag and reports no `resize`.

## 4. The hovered row on both phases of the stripe

- [x] `--grid-band-hover` beside `--grid-hover`, at the band's dose plus the
      hover's, and `tbody tr:nth-child(even):hover` before `[data-dep-lit]`.
- [x] `e2e/hover-cards.spec.ts`: the step in rasterised luminance is the same
      on both phases, and a hovered banded row is nobody else's colour.
- [x] Watch both fail with the new rule removed.

## 5. The shortcuts sheet as a modal

- [x] One effect on `document`, capture phase: Escape closes wherever the focus
      is, Tab is held at both ends of the sheet's focusable stops and brought
      back from outside.
- [x] The backdrop's `onKeyDown` goes; its `onClick` stays.
- [x] `keyboard-cheat-sheet.test.tsx`: Escape from outside, Tab at both ends,
      and a Tab pressed outside coming back.
- [x] `e2e/keyboard.spec.ts`: twelve Tabs and twelve Shift+Tabs never leave the
      sheet, Escape then closes it, and the table behind is the reader's again;
      a click at a **coordinate** on the backdrop closes it and one on the
      sheet does not. jsdom performs no default Tab, so a sheet with no trap
      passes every unit test about one (R5 #14–16).
- [x] Watch each fail: the Tab branch dead (red, `Tab 2 of 12`) and the
      backdrop's own `event.target` test inverted (red). The listener put back
      on the backdrop is **green** in a browser while the trap holds — the two
      faults are a chain, and the unit test is what holds that half. Written
      up in `verify.md` and at the test.

## 6. A deep row's number

- [x] `DEEPEST_INDENT` 4 → 2 and `font-size: 11px` on `[data-number]`, with the
      reasoning at both.
- [x] Rewrite the three inherited indent pins against `DEEPEST_INDENT` rather
      than against the pixel literals of a cap of 4 — a test stating the old
      arithmetic cannot see the cap move.
- [x] `e2e/layout.spec.ts`: the four-segment number is drawn **whole** and the
      five-segment one shows strictly more of its own than that, measured as
      the visible prefix through a `Range` rather than by `scrollWidth`.
      Asserting only that the two prefixes _differ_ passed on the audit's own
      geometry (`030.1` against `030`) — the first version of this pin did
      that, and watching it not fail is what found it.
- [x] Watch it fail with the cap back at 4 and the type size off: red,
      `Expected: "030.1.1.1" Received: "030.1"`.

## 7. Gate

- [x] `bunx nx format:check --all` (CI)
- [x] `bunx nx run-many -t test lint typecheck build --parallel=2` (CI; and the
      fe-01 suite under node on h2puni, 1148 passed — `nx run fe-01:test` on
      that host is vacuous under bun, see `verify.md`)
- [x] `bun run e2e` (CI `pixels`; each new spec also run on h2puni in the
      Playwright image)
- [x] `openspec validate --all --json` (CI)
- [x] `verify.md` with the commands, their output, and the failure-proof table.
