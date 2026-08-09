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
browser suite 69 before and **74** after.

## The gate

| command                                                      | result                        |
| ------------------------------------------------------------ | ----------------------------- |
| `bunx nx format:check --all`                                 | pass                          |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects             |
| `bunx nx test fe-01`                                         | **866 passed**, 42 files      |
| `openspec validate --all --json`                             | 50 items, 50 passed, 0 failed |
| the browser suite (below)                                    | **74 passed**, 0 failed       |

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
  74 passed (1.4m)
```

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
