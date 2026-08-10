# `instant-hovers` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14), from `/Users/danylofedorov/wd/puni/wbs-hovers-wt` — a git worktree on
branch `change/instant-hovers`. The main checkout serves the live dev stack on
3100/3200/4200 and was not written to.

## What landed

| file                                                 | what                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/fe-01/src/components/wbs/hover-card.tsx`       | new — the placement, and `pointer-events: none` by default         |
| `apps/fe-01/src/components/wbs/hover-card.test.tsx`  | new — 2                                                            |
| `apps/fe-01/src/components/wbs/hover-preview.tsx`    | renders through `HoverCard`, opting back into the pointer          |
| `apps/fe-01/src/components/wbs/folded-role-card.tsx` | new — role, trio, final, assignee, assumed                         |
| `apps/fe-01/src/components/wbs/depends-card.tsx`     | new — number and full name per dependency                          |
| `apps/fe-01/src/components/wbs/wbs-table.tsx`        | one `hoveredCell`; the notes marker; both cells' cards             |
| `apps/fe-01/src/components/wbs/wbs-table.test.tsx`   | 5 re-aimed at the marker, 9 added                                  |
| `apps/fe-01/e2e/hover-cards.spec.ts`                 | new — 5                                                            |
| `apps/fe-01/e2e/layout.spec.ts`                      | the notes-preview overhang test hovers the marker; no other change |
| `CONTEXT.md`                                         | Hover preview reworded; Notes marker added                         |

fe-01 counted 859 unit tests before this change's code and **866** after; the
browser suite 69 before and **74** after. Round 3 (below) took those to **875**
and **76**; round 4 to **878** with the browser suite unchanged.

## The gate

| command                                                      | result                        |
| ------------------------------------------------------------ | ----------------------------- |
| `bunx nx format:check --all`                                 | pass                          |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects             |
| `bunx nx test fe-01`                                         | **878 passed**, 42 files      |
| `openspec validate --all --json`                             | 50 items, 50 passed, 0 failed |
| the browser suite (below)                                    | **76 passed**, 0 failed       |

Re-run in full after round 3 and again after round 4, on the same machine and
the same ports.

Nx labelled `gw-01:test` flaky on one run; it passed, and nothing here touches
gw-01.

## The browser suite, on ports nobody else was using

A stack was already listening on 3100/3200/4200 — Dany's live dev session — so
this run used **be 3113, gw 3213, fe 4213**:

- `playwright.config.ts`, temporarily: `PORT`/`GW_URL` on be-01, `PORT`/`BE_URL`
  on gw-01, `bunx vite --mode e2e --port 4213 --strictPort` for fe-01, and the
  `baseURL`.
- `apps/fe-01/.env.e2e`, temporarily: the two `VITE_` proxy targets on the new
  ports, which is what `vite --mode e2e` reads through `loadEnv`.

Both were reverted before committing — `git diff` on `playwright.config.ts` is
empty and the `.env.e2e` is deleted.

```
$ bunx playwright test --config apps/fe-01/playwright.config.ts
  76 passed (1.7m)
```

Round 4 changed no browser check: what it fixed is keyboard routing, a second
piece of React state and a comparison inside `refresh`, none of which a
screenshot can see. The suite was re-run to prove it broke none of them.

## Round 3: two independent reviews

`codex` raised five findings and `agy` two more, one of which (its own #1) is
codex's #1 by another route. What landed:

| finding                                          | verdict                        | what changed                                                                                                       |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| codex #1 — the preview cannot be reached         | real, high                     | the leave moves from the notes marker to the Name cell, which contains the marker and the card both                |
| codex #2 — no card reachable without a pointer   | real, high                     | the folded cell opens its card on focus and is described by it; the depends box gets an off-screen list; Name none |
| codex #3 — the hover is never settled            | real                           | every tree read closes a card whose row moved, and leaves one whose row did not                                    |
| codex #4 — draft versus server                   | real, and worse than described | the card read the draft trio **and** printed the raw shorthand where days belong; both now read the row            |
| codex #5 — a render per boundary                 | partly real                    | pointless writes removed; the residual render is in `design.md` Risks, unfixed and named                           |
| agy #6 — the row lift is only on the Name column | **refuted, with a browser**    | nothing changed; the measurement that says so is a new e2e check                                                   |
| agy #7 — a mention that offers nobody            | real, by a route agy missed    | reachable through an empty directory rather than `@zzz`; the guard now reads the mention                           |

`agy #6` is the one worth reading twice. The lift exists because a pinned cell
is `position: sticky` **with a z-index**, so it is a stacking context that traps
a popover inside it; `depends` and `<roleId>-final` are not pinned, so nothing on
the way from those cards to the frame makes one. Extending the lift would have
_created_ stacking contexts on those `<td>`s and capped their cards at layer 2.
Rather than argue it, `paints over the pinned cell of the row below it` scrolls
the frame until the depends column is half under the pinned block and compares
the overlapping strip with the card open and closed — and it was watched failing
with the card's `z-index` removed.

`agy #7`'s example does not reproduce: `@zzz` offers `Add “zzz”`, so the entry
count is 1 and the old guard held. The mechanism is real anyway by a different
route — a deployment with nobody in the directory answers a bare `@` with no
entries at all — and that is what the negative test uses.

## Round 4: codex on the round 3 diff

Six of the round 3 fixes were approved unchanged. Three follow-ons landed.

| finding                                             | verdict                      | what changed                                                                                   |
| --------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| #8 — the keyboard still counts the picker's entries | real, high, and pre-existing | the cell's `onKeyDown` reads the mention, the same boolean the card reads                      |
| #9 — the focus and the pointer share one state      | real                         | two states, and the open card derived from them with the pointer winning                       |
| #10 — the placement is a sibling index              | real                         | the placement is the line a row is drawn on, walked from the tree the table is about to render |

**#8 predates this change.** The merge-base at `75d01a8` has the same
`if (options.length > 0)` on that `onKeyDown`, so a bare `@` on a deployment with
nobody in it handed the keyboard back there too. What round 3 did was correct the
_card's_ guard and leave this one, which is how the two came to disagree — and
which makes the fix this change's to make. Both guards now read `mentioning`.

**#9's tie-break is the pointer.** `openCard` is `hoveredCell ?? focusedCell`:
moving a mouse onto a cell is the deliberate act of the moment, and the focus is
still where it was left when the mouse moves away again. Every surface reads the
one derived value, which is what keeps "one card at a time" true now that two
gestures can open one.

**#10's rule is strictly stronger than the one it replaces**, not different: the
parent is still half of the pair, for the outdent that changes no line, and the
sibling index is replaced by the line itself, which no ancestor can move without
changing.

## Failure proof

Every check below was watched failing with the named fault injected, then
watched green again with the fault removed. All on 2026-08-09.

| fault injected                                                              | test that observed it                                               | observed                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `HoverCard`'s default flipped to `pointerEvents: 'auto'`                    | `does not take the pointer` (unit)                                  | `expected 'auto' to be 'none'`                                                                                                         |
| the same default, in a browser                                              | `lets a click through to the row underneath it` (e2e)               | `locator.click: Test timeout of 60000ms exceeded` — `<div role="tooltip" aria-label="Dev for 010">…</div> … intercepts pointer events` |
| `scrolls` dropped from `HoverPreview`'s card                                | `lets the one card that scrolls take the wheel back` (unit)         | `expected 'none' to be 'auto'`                                                                                                         |
| the notes marker rendered unconditionally                                   | `marks a row that has notes, and only one that has` (unit)          | `expected <span aria-label="Notes on 020" …/> to be null`                                                                              |
| the hover handlers put back on the Name cell's wrapper                      | `opens nothing from the cell the notes are typed in` (unit)         | `expected <div role="tooltip" …/> to be null`                                                                                          |
| the marker's same-cell guard replaced by `setHoveredCell(null)`             | `leaves one card open when the pointer walks from row to row`       | `Unable to find an accessible element with the role "tooltip"`                                                                         |
| the folded card's points read from the cell's own value, not the row's trio | `opens the folded figure into its parts, without asking the server` | `expected 'Devoptimistic 3.7 · realistic — · pes…' to contain 'optimistic 2'`                                                          |
| the assignee's `title` put back on the truncated span                       | `leaves the assignee no title of its own to say it twice`           | `expected 'Ada' to be null`                                                                                                            |
| the folded card's `options.length === 0` condition dropped                  | `keeps the cell to the @ list while that list is open`              | `expected [ <div role="tooltip" …/> ] to have a length of +0 but got 1`                                                                |
| the depends card's `waitingFor.length > 0` condition dropped                | `opens no card over a row that waits for nothing`                   | `expected <div role="tooltip" …/> to be null`                                                                                          |
| the depends card's `picker === null` condition dropped                      | `keeps the cell to the dependency picker while it is open`          | `expected [ <div role="tooltip" …/> ] to have a length of +0 but got 1`                                                                |
| `opensAPopover`'s `-final` suffix branch removed                            | `paints the card past the bottom of a 96px cell` (e2e)              | `the strip below the cell looks the same with the card open` — `Expected: false Received: true`                                        |

### Round 3, all watched on 2026-08-09

| fault injected                                                | test that observed it                                                    | observed                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| the `onMouseLeave` put back on the notes marker               | `keeps the preview open while the pointer crosses the cell` (unit)       | `expected null not to be null`                                                  |
| the same fault, in a browser                                  | `scrolls a note taller than the preview once the pointer is on it`       | `the card closed on the way to it: expected 1, received 0`                      |
| the `onFocus` hover line dropped from the folded cell's box   | `opens the card on the focus too, and points the box at it`              | `Unable to find an accessible element with the role "tooltip"`                  |
| an `aria-label` put back on the card that box is described by | the same test                                                            | `expected 'Dev for 010' to be null`                                             |
| the `aria-describedby` dropped from the depends box           | `describes the box with what the row waits for, pointer or no pointer`   | `expected null not to be null`                                                  |
| the settle deleted from `refresh`                             | `closes the card when a peer moves the row it is anchored to`            | `expected <div role="tooltip" …/> to be null`                                   |
| the card's points read back through `estimateValue`           | `reads the trio off the row, not out of the boxes it was typed into`     | `expected 'Devoptimistic 2 · realistic — · pessi…' to contain 'realistic 3'`    |
| the card's figure read back through `combinedValue`           | `says Final in days, whatever half-typed shorthand the cell is holding`  | `expected 'Devoptimistic 2 · realistic 3 · pessi…' to contain 'Final 3.7 days'` |
| the `cardable` guard dropped from the depends cell's enter    | `writes no hovered cell from a cell that has no card to show`            | `Unable to find an accessible element with the role "tooltip"`                  |
| `cellKey` made to return `{ rowId, columnId }`                | `keys the hover by value, so a second enter on one cell renders nothing` | `expected { rowId: 'w1', … } to be { rowId: 'w1', … } // Object.is equality`    |
| the folded cell's guard put back to `options.length === 0`    | `keeps the cell to a mention that has nobody to offer`                   | `expected 'Devoptimistic…' to contain 'QA'`                                     |
| `zIndex: 20` removed from `HoverCard`                         | `paints over the pinned cell of the row below it` (e2e)                  | `the pinned cell below hides the card` — `Expected: false Received: true`       |

### Round 4, all watched on 2026-08-09

| fault injected                                                 | test that observed it                                                      | observed                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| the folded cell's `onKeyDown` put back to `options.length > 0` | `every chord is inert on a mention that has nobody to offer`               | `expected [ 'Strip', 'Paint', 'Sand', '' ] to deeply equal [ 'Strip', 'Sand', 'Paint' ]` |
| `focusedCell` folded back into `hoveredCell`                   | `keeps the focused cell's card when the pointer visits another and leaves` | `Unable to find an accessible element with the role "tooltip"`                           |
| the placement put back to counting siblings under a parent     | `closes the card when a peer moves the branch the row sits inside`         | `expected <div role="tooltip" …/> to be null`                                            |

The first of those shows both halves of the fault in one line: `Paint` and
`Sand` swapped by the ⌥+arrow, and a fourth, nameless row created by the ⌘+Enter
that followed it.

Two of the round 3 checks deserve their reason written down.

**The unit test for finding 1 fires `mouseOut` with a `relatedTarget`, not
`mouseLeave`.** React synthesises leave from `mouseout`: given where the pointer
went, it walks up to the common ancestor of the two elements and fires leave on
that stretch alone — which is what a browser does. A bare
`fireEvent.mouseLeave(marker)` carries no `relatedTarget`, which means "the
pointer left the document", and React then fires leave on the marker **and every
ancestor of it** — so it reports this fixed and broken identically. Measured in a
scratch component before the test was believed. The existing tests that use
`fireEvent.mouseLeave` are unaffected: each fires on the element that owns the
handler, and "left the document" is a true thing to say there.

**The bailout check is a property, not a render count.** jsdom counts no
renders, so `keys the hover by value` asserts the predicate React's bailout
actually uses — `Object.is` over the key — rather than the render it produces. A
change that made these cells re-render on a stationary pointer some other way
would not be caught by it. Said here rather than implied.

The last one is the reason that test compares two screenshots of the strip
below the cell rather than hit-testing it: a card takes no pointer events, so
`document.elementFromPoint` answers with whatever is under the card whether the
card is clipped or not. `layout.spec.ts`'s `popoverEscape` cannot be used on a
hover card for that reason, and using it would have been a check that could not
fail.

## Not verified here

- **The intent is 491 words**, over the 400-word cap. It was 494 before this
  change's scope grew by a fourth surface; the rewrite bought back three words
  and no more without dropping a From/To the template asks for. Called out
  rather than quietly left.
- **The marker's visual placement** — top-right of the Name cell, over the
  textarea — is asserted only as "there or not there". Nothing measures whether
  it collides with the last character of a name that fills the first line.
- **Touch.** A marker is a hover target and a phone has no hover; the card face
  (`plan-cards.tsx`) is untouched, and notes are read there at rest as before.
- **A rolled-up parent's folded cell has no keyboard route to its card.** Its
  figure is a sum rather than a box, so there is nothing in that cell to focus.
  Every row underneath it has one; nothing here measures whether that is enough
  in practice.
- **A focus-opened card outliving its row is not settled.** `focusedCell` is
  deliberately left out of the refresh reconciliation, so a row deleted while its
  box had the focus leaves a key behind. Nothing can render a card for a row that
  is not there, and the next focus replaces it — but no test says so, because
  there is no behaviour to observe.
- **The residual render cost is not measured.** One render of the table per
  hover boundary is stated in `design.md` and left as it was found; no profile
  was taken, and no test bounds it.
