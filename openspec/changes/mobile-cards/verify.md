# M `mobile-cards` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14, chromium from the Playwright cache), from the worktree at
`.claude/worktrees/agent-a77a41f3591af976c` on branch `change/mobile-cards`,
cut from `change/live-editing-extraction` (head `2862945`). No merge: that
branch is the integrated stack, and `X`'s module is what this one mounts.

## What landed

| file                                       | what                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `src/components/wbs/plan-renderer.ts`      | new — `rendererForWidth`, `CARDS_BELOW`, and the hook that feeds it a width |
| `src/components/wbs/plan-renderer.test.ts` | new — 3                                                                     |
| `src/components/wbs/plan-cards.tsx`        | new — `PlanCards`, the renderer below 768px                                 |
| `src/components/wbs/plan-cards.test.tsx`   | new — 16, and its own small `ProjectApi` fake                               |
| `src/components/wbs/wbs-table.tsx`         | the switch, the toolbar sheet, `spanOf`/`assigneeOn`/`waitsFor`/`teamName`  |
| `src/components/chrome/app-header.tsx`     | wraps below `md`, may not above it                                          |
| `e2e/mobile.spec.ts`                       | new — 5 at 390×844                                                          |
| `AGENTS.md`, `LLM_README.md`, `CONTEXT.md` | the fifteenth check that could not fail; two terms                          |

`wbs-table.tsx`'s columns are untouched as markup. Three of them now read a
figure through a callback (`spanOf`, `assigneeOn`) instead of computing it
inline, because the cards read the same rule and a second copy of it in a second
renderer is one edit from disagreeing. Nothing inside the desktop `[data-grid]`
gained a class.

## The gate

| command                                                              | result                   |
| -------------------------------------------------------------------- | ------------------------ |
| `bunx nx format:check --all`                                         | pass                     |
| `bunx nx run-many -t test lint typecheck build --parallel=2`         | pass, 21 projects        |
| `bunx nx test fe-01`                                                 | **715 passed**, 35 files |
| `bunx openspec validate --all --json`                                | pass, 47 items           |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | **54 passed**, 1.1m      |

fe-01 counted 696 on the base branch and 715 after: 3 in `plan-renderer.test.ts`
and 16 in `plan-cards.test.tsx`. No existing test was edited.

The browser counted 49 on the base branch and 54 after — the 49 are byte
identical and all green; the 5 are `e2e/mobile.spec.ts`. It ran on **3111 /
3211 / 4211**, this agent's own ports, through a temporary edit to
`playwright.config.ts` and the three gitignored `.env` files. Both reverted
before the commit; `git status` was clean of them and `git diff` of the config
is empty.

## The fault only a browser could see

**The toolbar sheet closed the plan's controls before they ran.** As an
`onClickCapture`, `setToolbarSheetOpen(false)` flushed between React's capture
dispatch and its bubble dispatch — React registers one native listener per
phase per container, and a discrete update flushes between them — so the button
was unmounted before the bubble pass walked the fiber tree looking for handlers.
Its own `onClick` never ran. Every toolbar control on the sheet did nothing at
all: no request, no work item, no toast, no sign.

All sixteen of `plan-cards.test.tsx`'s tests passed through it, including
`closes when a control on it acts on the plan`, because jsdom had already
collected `Add work item`'s `onClick` by the time the close ran. It was found in
Chrome at 390×844 by `POST …/work-items` simply being absent from the network
log after a click that visibly closed the sheet, and confirmed by putting the
close back and watching the request appear. The close is on the bubble phase
now. This is the **fifteenth** check that could not fail and it is in
`AGENTS.md` under R5.

**The header could not hold one line at 390 either.** Brand, picker, rename,
`+`, presence roster and account menu were laid on top of each other, with the
`+` that starts a project underneath the picker's box where nothing could click
it — `element intercepts pointer events`, in `seedPlan`. It wraps below `md`
and is `md:flex-nowrap` above, which is the same 768 the renderer swaps at, so
`e2e/header.spec.ts`'s one-row claim (measured from 900 up) is untouched.

## Failure proof

Every check this change adds was watched failing with the thing it guards
broken. All watched 2026-08-09.

| check                                        | fault injected                                                    | what failed                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `rendererForWidth`'s boundary                | `<` widened to `<=`                                               | 1 — `is cards below 768 and the table at it`, on `expected 'cards' to be 'table'`                                          |
| the hook follows the window                  | `subscribeToResize` registers nothing                             | 1 — `follows the window across the breakpoint, both ways`, on `expected 'table' to be 'cards'`                             |
| a card's cells are the table's cells         | the card's `cellKey` prefixed `card-`                             | **2** — the parity test, and `keeps a draft be-01 refused when the window crosses the breakpoint` on `expected '' to be …` |
| the cards are a walkable grid                | `gridRef` dropped from `PlanCards`                                | 1 — `carries the caret to an unestimated card…`, focus left on `<body>`                                                    |
| the marker is on the list                    | `data-grid` renamed                                               | 1 — `marks the card list as the grid, and it is no table`                                                                  |
| `X`'s restore, across the breakpoint         | `LiveField.takeNode`'s restore deleted                            | **2** — both directions of the refused draft, on `expected '' to be 'Strip the wiring'`                                    |
| the sheet closes on a control that acts      | `closesTheSheet` pinned to false                                  | **5** — the close test on `expected <button …(2)> to be null`, four more unable to reach an `aria-hidden` plan             |
| Radix's restore is refused for that close    | `onCloseAutoFocus` removed                                        | 1 — `lands the focus in the card…`, on `expected <button …(5)> to be <textarea …(5)>`                                      |
| a trigger that opens a surface is exempt     | the `aria-haspopup` test removed                                  | **2** — both phases-dialog tests, `Unable to find role="dialog" and name "Phases"`                                         |
| another surface's clicks are not the sheet's | the `[data-modal-surface]` test removed                           | 1 — `adds a phase from inside the sheet`, on the dialog gone after its own Add                                             |
| the card's `@` list owns Enter               | the `Enter` branch removed                                        | 1 — `takes Enter for the list rather than the box under it`, `expected [] to deeply equal [ 'w1 role-dev p1' ]`            |
| the card's `@` list owns Escape              | the `Escape` branch removed                                       | 1 — `closes on Escape and leaves what was typed`                                                                           |
| the sheet holds the page's keyboard back     | its body moved out of `ModalContent` into a plain `role="dialog"` | **3** — including `holds the page’s own shortcuts back while it is open`, on `expected <h2 …(2)> to be null`               |
| the sheet's controls actually run            | the close moved back to `onClickCapture`                          | **5** in the browser (all of `e2e/mobile.spec.ts`), **0** in jsdom — see above                                             |

## Three things named rather than claimed

### 1. `data-grid` on the cards is the CSS scope, not what the focus reads

The plan asked for the marker so that "editable-grid's re-anchor finds them",
and the first version of the focus test claimed it as its proof. It is not:
`FocusIntent.landOnAttached` takes the node it is attaching and needs no grid at
all, and `cellIn` is handed `gridElement.current` directly rather than finding
it by attribute. Taking `data-grid` off the card list failed exactly **one**
test — the structural one — and the create still landed the caret.

So the behavioural claim is made by the readiness badge instead
(`carries the caret to an unestimated card when the badge is taken`), which does
go through `cellIn` on the card DOM and does fail when the list is not the grid.
The marker's own job — scoping `styles.css`'s reset away from the boxes, and
answering `gridOf` — is asserted structurally and said to be structural.

### 2. jsdom performs none of a focus trap

`closesTheSheet` pinned to false still let the caret reach the new card in
jsdom; five other tests failed, but on `aria-hidden` queries rather than on the
focus. A modal that stays open over the plan is the browser's to catch, and
`closes the sheet on a control that acts, and lands the caret in the new card`
in `e2e/mobile.spec.ts` is where it is caught.

### 3. The peer edit in the browser borrows this page's own token

`e2e/mobile.spec.ts`'s peer is a `fetch` from the page with the session token
out of `localStorage`, not a second browser context. It is a real request to
be-01 and a real event back over gw-01, which is the half that matters — but it
is not a second account, and a spec that wanted to prove authorization would
need one. Named because the fixture reads as more than it is.

## What a card deliberately cannot do

Dependencies, the service team, the not-before date and the three separate
points are printed and not editable, and there is no drag, no keyboard grid and
no ⋯ menu. Structural editing is the sheet's `Add work item` and nothing else.
That is `M`'s scope from the roadmap, not an omission — and `offers nothing to
drag a card by` is the test that says the handle is really absent rather than
merely untested.
