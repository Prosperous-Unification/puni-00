# verify — gantt-bar-hover

Implemented on `change/gantt-bar-hover`, off `main` at `7f0d059` (carries
`gantt-calendar-axis`, `name-title-body` and `instant-hovers`). 17 of 18 slices
done; 6.2 is a human's look at dev and is not this agent's to tick.

## 1.1 — what the merged contract actually is

The artifacts were written against a pre-merge snapshot. Every difference found,
and what was done about it.

| The change assumed                                       | What is on `main`                                                                                                                                                   | Resolution                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HoverPreview` is the surface to generalize              | `HoverPreview` is **content** — a name heading plus `react-markdown` notes. The surface is `HoverCard` (`hover-card.tsx`), and it already takes an arbitrary body   | The generalization is `HoverCard`'s, not `HoverPreview`'s. `HoverPreview` is untouched and its 4 tests are unedited                                                                         |
| `HoverPreview` takes an anchor / positions itself        | `HoverCard` is `position: absolute; top: 100%; left: 0` inside the **cell's** `position: relative` wrapper. No portal, no flip, no clamp, no delay                  | An optional `anchor` prop was added: with it the card portals to `document.body`, goes `position: fixed`, and is placed by the new pure `surfacePlacement`. Without it, nothing changes     |
| `HoverPreview` is the Name cell's only caller            | `HoverCard` already has **three** callers: `hover-preview.tsx`, `folded-role-card.tsx`, `depends-card.tsx`                                                          | The bar is the fourth. Adding a prop rather than a component is what keeps it one surface                                                                                                   |
| the open delay belongs to the shared surface             | `instant-hovers` requires the table's cards open with **no delay** ("in the same breath as the mouse arrives", asserted in `e2e/hover-cards.spec.ts` with no retry) | The 220 ms delay lives in `GanttPanel`, not in `HoverCard`. `HoverCard`'s JSDoc says so                                                                                                     |
| `barFacts` goes in `gantt-geometry.ts` beside `barWords` | `barWords`, `rowWords`, `spanWords`, `dayWords`, `lastWorkdayOf` are all in **`gantt-panel.tsx`**. `gantt-geometry.ts` has no words in it but `floorWordsOf`        | "beside `barWords`" won over the filename: `barFacts` is in `gantt-panel.tsx`. `gantt-geometry.ts` importing `lastWorkdayOf` back would be an import cycle                                  |
| 2.1/2.1a's tests go in `gantt-geometry.test.ts`          | ditto — the code they are about is the panel's                                                                                                                      | They are in `gantt-panel.test.tsx`, next to what they test                                                                                                                                  |
| `barWords` stays and `barFacts` joins it                 | `barWords` was one string, `\n`-joined, for the `<title>`                                                                                                           | `barWords` is **replaced** by `barFacts`, which answers `string[]`. Two names for one derivation is what lets a surface and a label drift apart. The panel joins with `. ` for `aria-label` |
| the panel already knows which read it drew               | it did not — `chartRead.generation` existed in `wbs-table.tsx` and reached `GanttFaultBoundary` only                                                                | `GanttPanel` takes `generation` as a prop and `wbs-table.tsx` passes the same number the boundary gets                                                                                      |
| a `<title>`-less bar can be labelled where it stands     | `GanttPanel` had an early `return` for the cycle state **before** its one hook                                                                                      | Split into `GanttPanel` (no hooks, the cycle answer) and `GanttChart` (every hook, the drawing), so no hook sits under a conditional return                                                 |
| the `<title>` assertions are eight                       | eight assertions in **six** tests, plus two on the not-before caret that stay                                                                                       | All eight rewritten (table below); both caret assertions untouched and still green                                                                                                          |

**The merge base's own tests, green before a line was written** —
`bunx vitest run src/components/wbs/hover-preview.test.tsx src/components/wbs/hover-card.test.tsx`:
`Test Files 2 passed (2) / Tests 6 passed (6)` — `hover-preview.test.tsx` 4,
`hover-card.test.tsx` 2. Both files still pass; `hover-preview.test.tsx` is
byte-for-byte unedited, `hover-card.test.tsx` gained 6 tests and edited none.

One thing the fixtures said that no artifact did: **a seeded project has two
phases**, so every leaf draws two bars. `[data-gantt-bar].nth(1)` in
`e2e/gantt.spec.ts` is the _first_ row's QA slice, not the second row's Dev one
— R5 #16's exact fault, met again and caught by a date that did not match. Bars
are found by `barOf(page, number, role)`, off the `aria-label` this change adds.

## 3.2 — the eight `<title>` assertions, and what replaced each

| was                                                                   | is                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `says everything it knows in a title…` — whole `title` split on `\n`  | `says everything it knows in a surface…` — the surface's `<p>`s, heading asserted against `rowWords`' output |
| `says on the ghost bar…` — whole `title` split on `\n`                | same test, the surface's lines                                                                               |
| `says a fraction in prose…` — `title` contains `3.67 days`            | the bar's `aria-label` contains it                                                                           |
| `says a fraction in prose…` — `title` contains `On the critical path` | the bar's `aria-label` contains it                                                                           |
| `reads the same dates…` — `title` contains `2026-08-13 → 2026-08-14`  | `aria-label` contains `13 Aug → 14 Aug` (`shortIsoDate`'s form)                                              |
| `reads the same dates…` — `title` not `2026-08-17`                    | `aria-label` not `17 Aug`                                                                                    |
| `reads the same dates…` — `title` not `2026-08-15`                    | `aria-label` not `15 Aug`                                                                                    |
| `draws under the roles the payload carried…` — `title` contains `Dev` | `aria-label` contains `Dev`                                                                                  |
| `names the people the payload carried…` — `title` contains `Kat`      | `aria-label` contains `Kat`                                                                                  |

(Nine rows: the fraction test held two.) The caret's two —
`[data-gantt-not-before="2"] title` and `="3"` — are untouched.

## Commands

| command                                                                      | result                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                                 | clean, no output                                                                                                                   |
| `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache` | `Successfully ran targets test, lint, typecheck, build for 21 projects`                                                            |
| `bunx vitest run` (fe-01)                                                    | `Test Files 43 passed (43) / Tests 955 passed (955)`                                                                               |
| `bunx openspec validate --all --json`                                        | `items 57, passed 57, failed 0`                                                                                                    |
| `bunx playwright test --config=tmp/pw-shifted.config.ts e2e/gantt.spec.ts`   | `14 passed` — the 8 that were there plus this change's 6                                                                           |
| `bunx playwright test --config=tmp/pw-shifted.config.ts` (all)               | see "The browser gate" below                                                                                                       |
| `bunx tsc --build --force` (fe-01)                                           | 15 errors, **all** in the test/config projects the gate does not compile, and the same 15 on the merge base (measured by stashing) |

**Ports.** `bun run e2e`'s committed config would have reused whatever holds
3100/3200/4200 — `LLM_README.md`'s landmine, and a green about another
checkout. Every browser run above is `tmp/pw-shifted.config.ts` with
`repoRoot` pointed at this worktree and ports **3151/3251/4251**, all three
servers this worktree's own (`reuseExistingServer: false`). `bun run dev:setup`
was run first; `apps/be-01/.env` carries `JWT_SIGNING_KEY_CURRENT`.

## The failure-proof table

Every check this change adds, the fault injected for it, and the run that
watched it fail. All watched 2026-08-09, one fault at a time, each reverted.

### jsdom — `gantt-panel.test.tsx` (63 tests) and `hover-card.test.tsx` (8)

| #   | fault injected                                                                                                                    | run that saw it                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `teamWords`' `unresolved` arm → `return ''`                                                                                       | `1 failed \| 62 passed`, `names a team the directory read does not hold`: `expected [ '010 - Strip', …(6) ] to include 'Team not in this directory read'`                                 |
| 2   | a bar's `start`/`finish` taken from `row.schedule` — the row's whole span                                                         | `1 failed`, `gives each role's bar its own dates and its own trio`: `expected [ '010 - Deck', …(6) ] to include '10 Aug → 12 Aug · 3 days'`                                               |
| 3   | the finish read as `addWorkdays(origin, ceil(finish))` — the workday **after**                                                    | `3 failed \| 60 passed`, incl. `reads the same dates under a bar…`: `expected '012 - Sealing. Dev · Unassigned. No t…' to contain '13 Aug → 14 Aug'` (it named 17 Aug)                    |
| 4   | the finish added to the origin as **calendar** days                                                                               | `3 failed \| 60 passed`, same three (it named 15 Aug, the Saturday the right edge stands on)                                                                                              |
| 5   | `shortIsoDate` → `new Date(iso).toLocaleDateString()`                                                                             | `3 failed \| 60 passed`, incl. `prints a day in another year with that year on it`                                                                                                        |
| 5b  | the same, under `TZ=America/Los_Angeles`, spelled `getDate()`/`toLocaleString('en',{month:'short'})` so only the **day** can move | `reads the same dates…` failed, naming 12 Aug for 2026-08-13. Under `TZ=Pacific/Auckland` the same fault **passed** — measured, and why a negative run in a zone ahead of UTC cannot fail |
| 6   | `namedInTheTree` built from `shownRows` instead of `flat`                                                                         | `2 failed \| 61 passed`: `names a predecessor inside a collapsed branch` and `names a predecessor a search narrowed away`, both `to include 'after 011 Sanding'`                          |
| 7   | the `aria-label` deleted from the rect                                                                                            | `6 failed \| 57 passed`, incl. `carries its facts as an accessible name, and no <title> at all`: `expected 'object' to be 'string'`                                                       |
| 8   | a `<title>` restored as a child of every bar                                                                                      | `1 failed`, same test: `expected SVGTitleElement{…} to be null`                                                                                                                           |
| 9   | the assumed-span line dropped from `barFacts`                                                                                     | `1 failed`, `says on the ghost bar…`: `expected [ '020 - Sand the deck', …(6) ] to deeply equal [ …(7) ]`                                                                                 |
| 10  | the `Enter`/`Space` key guard removed, so every keydown picked the row                                                            | `1 failed`, `leaves every other key to the page`: `expected [ 'sand' ] to deeply equal []`                                                                                                |
| 11  | `clearTimeout` struck from `cancelOpening`                                                                                        | `1 failed`, `opens nothing for a pointer that crosses the chart`                                                                                                                          |
| 12  | the `pointerType !== 'mouse'` guard removed                                                                                       | `1 failed`, `opens nothing at all for a pointer that is not a mouse`                                                                                                                      |
| 13  | the anchor-gone `useEffect` deleted                                                                                               | `1 failed`, `closes when the bar it was opened on is no longer drawn` — **see the note below**                                                                                            |
| 14  | the generation `useEffect` deleted                                                                                                | `1 failed`, `closes on a new chart read even where React reuses the very same node`, while #13's test stayed green — which is the whole reason both exist                                 |
| 15  | `dismiss()` dropped from the panel's `onScroll`                                                                                   | `1 failed`, `closes when the panel is scrolled`                                                                                                                                           |
| 16  | `surfacePlacement`'s flip removed                                                                                                 | `2 failed \| 6 passed`: `expected { left: 100, top: 780 } to deeply equal { left: 100, top: 624 }`                                                                                        |
| 17  | `surfacePlacement`'s left clamp removed                                                                                           | `2 failed \| 6 passed`: `expected { left: 950, top: 234 } to deeply equal { left: 700, top: 234 }`                                                                                        |

### The browser — `e2e/gantt.spec.ts`, real Chromium on 3151/3251/4251

| #   | fault injected                                      | run that saw it                                                                                                                                 |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `key.preventDefault()` struck from the Space branch | `picks the row on Space…` failed: `the Space reached the row's name box and typed itself into it — Expected: "" Received: " "`                  |
| B2  | `surfacePlacement`'s flip forced off                | `flips a surface above a bar that has no room below it`: `the surface was not drawn above its bar — Expected <= 869.54, Received 1034.95`       |
| B3  | `surfacePlacement`'s left clamp removed             | `clamps the right-most bar's surface inside the window`: `the surface hangs off the right edge of the window — Expected <= 1401, Received 1520` |
| B4  | `dismiss()` dropped from the panel's `onScroll`     | `takes the surface away when the panel is scrolled under it`: `Expected: 0 Received: 1`                                                         |
| B5  | the `pointerType` guard removed                     | `opens nothing under a finger that stays on the bar`: `Expected: 0 Received: 1` — **see the note below**                                        |

### Two checks that could not fail, found and fixed before they shipped

**The anchor-gone close (#13).** As first written the test rerendered the chart
without the bar and asserted no surface — and with the effect deleted **all 63
tests passed**. A surface whose bar is gone renders nothing whether or not the
state behind it was cleared: `openBar` is `null` and the JSX is guarded on it,
so the effect was invisible to the DOM. What the close actually buys is the
_next_ render: expanding the branch again brings the same `<rect>` back and a
surface nobody asked for reopens at the rectangle the bar used to be at. The
test now rerenders the row back in, and the fault was then watched failing.

**The touch guard (B5).** The tap test — `tap()`, row picked, no surface — was
written first, and with the `pointerType` guard struck out it **passed**.
Chromium's tap lifts the finger at once and the `pointerout` that comes with it
cancels the opening, so the guard is not what that test is holding. The case
where the timer runs to the end is a finger that stays down, which Playwright's
touchscreen cannot do; it is dispatched through CDP `Input.dispatchTouchEvent`
(`touchStart`, 800 ms, `touchEnd`) in `opens nothing under a finger that stays
on the bar`, and the fault was watched failing there. The tap test stays — it
is the spec's own scenario — but it is not the guard's proof.

### One measurement, taken before a comment was believed

5.5 says the clamp must be asserted by the surface's own rectangle and **not**
`document.scrollWidth`. With the clamp deleted and the surface measurably
hanging to x = 1520 on a 1400px window, the page reported
`scrollWidth 1400, clientWidth 1400` — no horizontal overflow at all, because
the layer is `position: fixed`. A `scrollWidth > clientWidth` check would have
passed with the bug on screen. Measured in Chromium, 2026-08-09.

## The browser gate

`bunx playwright test --config=tmp/pw-shifted.config.ts` over all nine specs,
**92 tests in 9 files**, `--list`'s own count. The last full run: `92 passed`.
An earlier full run was `91 passed | 1 failed`, and the one was a pre-existing
flake. `e2e/gantt.spec.ts`'s 14 pass every run, on their own and in the suite.

`e2e/hover-cards.spec.ts` has two tests that fail intermittently, and both fail
in its own `seedPlan`: the Dev estimate is typed, blurred, and is still not
there when the assertion reads it (`expect(locator).not.toHaveValue — Expected:
not ""`), or is missing from the card a moment later (`Dev for 010No estimate
yet`). **Measured on both sides**, `-g "same breath" --repeat-each=8`, back to
back on the same machine:

| tree                                | result                 |
| ----------------------------------- | ---------------------- |
| this branch                         | `3 failed \| 5 passed` |
| the merge base, this change stashed | `2 failed \| 6 passed` |

Indistinguishable, so it is not this change's. The other one,
`paints the card past the bottom of a 96px cell`, failed on the merge base with
this change stashed (`1 failed | 6 passed`) and passes on other runs.
`e2e/gantt.spec.ts`'s `draws the arrow head, the caret and the bracket` and
`e2e/name-cell.spec.ts`'s `a peer's longer name arriving…` each failed once in
one full-suite run and passed on re-run, alone and in their own file.

Neither hover-card test touches anything this change alters: the non-anchored
`HoverCard` branch is behaviourally byte-identical, and the content is
`folded-role-card.tsx`'s. Recorded rather than fixed — a seeding race in
another change's spec is its own change.

## Not done, and why

- **6.2** — deploy to dev and Dany looks. Not an agent's tick.
- **2.2's second negative** — "no cell remounts (the focus survives a hover)
  with the enrichment moved inside the `columns` memo". Not written. The
  enrichment reads `flat`, `teams` and `shownRows`, none of which the `columns`
  memo depends on; moving it inside would mean adding all three to that memo's
  dependency list, which is landmine #1 stated rather than tested, and the
  fault it would inject is one `wbs-table.test.tsx` already holds against
  (`keep-focus-while-others-edit`). The enrichment is built beside `ganttPlan`,
  outside the memo, and `columns`' dependency list is untouched — verified by
  reading, not by a test of its own.
- **`tsc --build --force` on fe-01's test projects** — 15 errors, all
  pre-existing (measured by stashing this change: the same 15, same files).
  They are the ones `teams-and-assignees/verify.md` names, and they are not in
  the gate.
- **A `data-` hook on the surface** — deliberately none. It is found by
  `role="tooltip"`, which is what says it is the same surface the Name cell
  opens rather than one that looks like it.
