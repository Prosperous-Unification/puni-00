<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, on `change/picker-reopens-on-click` at `57cca919` plus
the working tree. The browser gate was run **once over a tree carrying both this
change and `work-items-named-by-number-and-name`**, because the two were written
in one session and share a working tree; the two commits are stacked, and this
figure is the tip's.

| Command                                                                             | Result                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `bunx nx test fe-01`                                                                | **2010 passed / 65 files**               |
| `E2E_PORT_SHIFT=1900 bunx playwright test --config apps/fe-01/playwright.config.ts` | **273 passed / 1 skipped**, 7.4m, exit 0 |
| `bunx nx lint fe-01`                                                                | **0 errors**, 1 warning (below)          |
| `bunx nx typecheck fe-01`                                                           | **exit 0**                               |
| `bunx nx format:check --all`                                                        | **clean**                                |
| `bunx openspec validate --all --json`                                               | **35 passed, 0 failed**                  |

The one lint warning is `wbs-table.tsx`'s `columns` memo, pre-existing and
deliberate — `LLM_README.md`'s landmine #1.

### Not run, and why

- `bin/h2puni-gate.sh` — exits **127** on this macOS host, as it has all
  session. The commands above were run directly and one at a time.
- `tool-bootstrap:test` — times out on this host, pre-existing and unrelated.

## Failure proof (R5)

Every check below was watched failing with the named fault injected, and every
`Proof:` comment in the code was **corrected from the output** afterwards. Two
of the seven jsdom comments had guessed wrong and are now what was seen.

| Check                                                          | Where                     | Fault injected                                                          | Observed failure                                                                                                                   |
| -------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| opens the page's own card on a pointer                         | `hint.test.tsx`           | the `pointerover` listener and handler deleted                          | `Unable to find an accessible element with the role "tooltip"`                                                                     |
| closes when the pointer moves to something with nothing to say | `hint.test.tsx`           | `setOpen(hintAt(…))` replaced by an early return where `hintAt` is null | `expected <div role="tooltip" …(2)></div> to be null`                                                                              |
| says nothing at all to a tap                                   | `hint.test.tsx`           | the `pointerType !== 'mouse'` guard deleted                             | `expected <div role="tooltip" …(2)></div> to be null`                                                                              |
| opens from the keyboard, and points the control at it          | `hint.test.tsx`           | the `focusin` listener and handler deleted                              | `Unable to find an accessible element with the role "tooltip"`                                                                     |
| takes the description back off the control                     | `hint.test.tsx`           | the cleanup's `removeAttribute` dropped                                 | `expected 'hint-card' to be null`                                                                                                  |
| closes on Escape                                               | `hint.test.tsx`           | the `keydown` listener and handler deleted                              | `expected <div role="tooltip" …(2)></div> to be null`                                                                              |
| an empty hint opens nothing                                    | `hint.test.tsx`           | the `words === ''` half of the guard deleted                            | `expected <div role="tooltip" …(2)></div> to be null`                                                                              |
| no control on the plan carries a native tooltip                | `e2e/hints.spec.ts`       | `title="Undo your last change…"` put back on the Undo button            | `Error: the plan draws 1 native tooltips`                                                                                          |
| a toolbar control explains itself in this page's card          | `e2e/hints.spec.ts`       | `<HintLayer />` taken out of `app.tsx`                                  | `expect(locator).toBeVisible() failed · Expected: visible · Error: element(s) not found · Expect "toBeVisible" with timeout 400ms` |
| a cell that owns a card shows one surface, not two             | `e2e/hover-cards.spec.ts` | the Depends on box's hint put back                                      | `no card opened on the depends cell · Expected: 1 · Received: 2`                                                                   |

## A check that could not fail, written and deleted rather than shipped

A general guard was written in `hints.spec.ts` — hover every `<td>` of a row and
expect at most one `[role="tooltip"]` — as the systematic version of the last
row above. With the Depends on box's hint put **back**, it was watched
**passing**.

It had to. `aPlan` adds one work item and nothing else, so that row's Depends on
cell has no dependencies, its own card never opens, and there is nothing for a
hint to collide with: the assertion was true about a cell with one surface
because it only ever had one. The window the fault lives in is a _populated_
Depends on cell — which `hover-cards.spec.ts` already seeds and already counts,
and which was watched failing on this exact fault twice. The vacuous test is
deleted; `tasks.md` §4.2 records it. R5's "assert in the window the fault lives
in", fourth outing.

## What the sweep found

94 native `title` attributes across 15 files; 51 sat on DOM elements and moved
mechanically, 43 on wrapper components. Three components had a declared `title`
prop (`MenuControl`, `ReferenceSetStrip`, `CreatablePicker`) and four take one
now through `Hintable` (`Button`, `Input`, `CellInput`, `DateField`).

Ten test files read a control's hint back out and follow it. The one that took
two attempts was `gantt-panel.test.tsx`'s `columnDay`, which kept a `[title]`
**selector** while reading `data-hint` off what it found — a selector scoped to a
place the fact is not, which is `svg-export-and-gutter`'s landmine wearing a
smaller hat.

## A limit, measured rather than assumed

A **disabled** `Button` gets no hint: `buttonVariants`' base carries
`disabled:pointer-events-none`, so no `pointerover` ever names it. Measured in
Chromium — `elementFromPoint` at a disabled Undo's own centre answers the toolbar
`<div>`, `isSelf: false`. The controls that affects are Undo, Redo and Reset
layout, whose hints restate their labels. Where the hint is the _reason_ a
control is off, it is on the live `<label>` around the disabled `<input>`
(`wbs-table.tsx`'s facet boxes), so that sentence still reaches a reader. Written
down in `hint.tsx` and in `e2e/hints.spec.ts`, which picks `Keyboard shortcuts`
for that reason.
