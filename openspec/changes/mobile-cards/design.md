# The shape of the switch

Three decisions, and the second is the one the reviews asked for by name.

## 1. One component owns the plan; only its last third swaps

`WbsTable` keeps everything: the tree, the roles, the estimate drafts, the
expansion, the open `@` mention, the toasts, the `FocusIntent`, every commit
callback and the one `[data-grid]` ref. What swaps at the breakpoint is the
element it renders at the end — the `<table>`, or `<PlanCards>` over the same
`shownRows` the table model already produced.

**The alternative, rejected:** two sibling components under `ProjectPage`,
chosen by the breakpoint. `X live-editing-extraction` moved the _cell's_ state
out of the component, so a refused draft would survive that too — but nothing
else would. The estimate drafts are `WbsTable` state keyed
`rowId::roleId::point` (`X`'s `verify.md` says why they stayed there), the open
mention is state, the remembered expansion is state, and the pending Ctrl+D is
state. Rotating a phone would empty all of them. The switch has to be below the
state, and this is the lowest place it can be.

That the table's `columns` are still built at 390px is deliberate rather than
overlooked: they are a `useMemo` over `roles` and the fold, they render nothing
while the cards are on screen, and building them keeps one row model — so a
card and a `<tr>` are the same row, in the same order, with the same expansion.

## 2. The width is read from `window.innerWidth`, not `matchMedia`

`matchMedia` is the idiomatic answer and it is not available here: **jsdom 24
ships no `window.matchMedia` at all** — `typeof window.matchMedia` is
`'undefined'`, probed on 2026-08-09 rather than assumed. A hook built on it
would throw in all 696 fe-01 tests, and the usual repair — a stub in
`vitest.setup.ts` — is a stub that always answers `false`, which is a
breakpoint test asserting the stub.

So: `rendererForWidth(width)`, a pure function with its own unit test, and a
hook that feeds it `window.innerWidth` through `useSyncExternalStore` with a
`resize` subscription. `useSyncExternalStore` rather than
`useState` + `useEffect` because the first paint then reads the real width
instead of rendering the table and swapping it a frame later — on a phone that
frame is the whole table laid out at 1106px and thrown away.

The boundary between the two is where the fault would live, so the hook is the
thin half: it holds no arithmetic, and everything about where 768 falls is in
the function the test can call.

## 3. The cards are the grid, and their cells are the table's cells

The card list carries `data-grid` and takes the same `gridElement` ref the
`<table>` had. Everything in `editable-grid.ts` reads the container through
that attribute since `X`, so `FocusIntent.land`, `cellIn` and the readiness
walk find a card's box without knowing what drew it. `gridElement` becomes
`HTMLElement` rather than `HTMLTableElement`, which is the whole of the type
change.

Each editable box carries `cellKey(rowId, columnId)` for the **same** column
the table uses — `name`, and `${roleId}-final` for the folded figure — so the
`LiveField` a card mounts is the one the table mounted. That is not a
convention to remember: it is what makes the refused draft cross the
breakpoint at all, and `renders no cell the table has not got one for` is the
test that holds it.

**What the cards deliberately do not wire up:** `onTabKey`, `onArrowKey`,
`onCommandKey` and `onAltMove`. The grid is still walkable — the boxes are
`[data-cell]` inside `[data-grid]` — but nothing on a card claims a key for
walking it. A phone has no Tab and no Ctrl, and a chord handler that could
never fire is a check that cannot fail.

## The toolbar sheet

The toolbar's controls are built once, as a node, and rendered either in the
row above the table or inside `ModalContent side="bottom"`. One list, so a
control added later cannot reach only one of the two — and `ModalContent` is
what holds `?`, Cmd+Z and the chords back while the sheet is open, which is
`F shadcn-foundation`'s rule and not a second copy of it.

`PhasesDialog` goes into the sheet with the rest of the toolbar, which nests a
Radix dialog inside a Radix dialog. That is supported and it is also the kind
of claim this repo does not make without watching it, so `the phases dialog
opens from inside the sheet` is a test rather than a sentence.
