# H `header-fits-a-row` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14, chromium from the Playwright cache), from the worktree at
`.claude/worktrees/agent-a9bc1cbc4c954e3f8` on branch
`change/header-fits-a-row`, based on `change/shadcn-foundation` at `6baedbe`.

## What landed

| file                                              | what                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/components/chrome/app-header.tsx`            | new — the bar: brand, project slot, presence, account                               |
| `src/components/chrome/account-menu.tsx`          | new — the menu button that replaces "Signed in as … / Log out"                      |
| `src/components/chrome/account-menu.test.tsx`     | new — 8 assertions                                                                  |
| `src/components/presence/presence-panel.tsx`      | restyled into a header row; the no-reconnect caveat written down                    |
| `src/components/presence/presence-panel.test.tsx` | new — 5 assertions; the panel had none                                              |
| `src/components/wbs/project-page.tsx`             | renders the bar and a `<main>`; the picker moves in; rename/new become icon buttons |
| `src/components/wbs/project-page.test.tsx`        | 3 added, 1 reworked                                                                 |
| `src/app.tsx`                                     | signed-out and signed-in split; the signed-in page is a `h-full` column flex        |
| `src/styles.css`                                  | `body` margin off; `html`, `body`, `#root` at `height: 100%`                        |
| `src/components/wbs/table-frame.ts`               | `maxHeight: calc(100vh - 16rem)` → `flex: 1 1 0%`                                   |
| `src/components/wbs/table-frame.test.ts`          | 1 reworked                                                                          |
| `src/components/wbs/wbs-table.tsx`                | the section joins the flex chain; the toolbar tightened and marked `data-toolbar`   |
| `src/components/wbs/wbs-table.test.tsx`           | 1 reworked                                                                          |
| `e2e/header.spec.ts`                              | new — 5 browser tests                                                               |

`e2e/layout.spec.ts`, `e2e/keyboard.spec.ts` and `e2e/tailwind.spec.ts` are
**untouched**, and all 36 of them pass.

## The numbers, at 1280×800, with a plan taller than the window

Measured through the same `[data-table-frame]` element, first on
`change/shadcn-foundation` before a line was written and then on this branch.

| measurement                      | `F` (before) | `H` (after) | note                                                      |
| -------------------------------- | ------------ | ----------- | --------------------------------------------------------- |
| frame `clientHeight`             | **544**      | **669**     | +125, against the plan's ≥120                             |
| frame bottom to bottom of window | 112          | 8           | the 8 is `<main>`'s own `pb-2`                            |
| document vertical overflow       | 196          | 0           | the page scrolled behind a frame meant to be the scroller |
| header bar height                | n/a          | 41          | one row at 1280, 1024 and 900                             |
| chrome above the frame           | 340          | 123         | five stacked things → one bar and a tightened toolbar     |

The `F` row is a real run, not arithmetic:

```
PROBE {"clientHeight":544,"scrollHeight":995,"top":144,"bottom":688,"rowHeight":38,
       "docScrollHeight":996,"docClientHeight":800,"innerHeight":800}
```

`544` is exactly `800 - 16rem`, which is what says the cap was deciding the
height rather than the layout. The `top: 144` in that probe is the frame **after
the page had scrolled to the bottom** — each new row focuses its own name cell,
which scrolls it into view — so the chrome above it was 340px and 196 of the
frame was only reachable by scrolling the toolbar off the top of the window.
That is the honest version of the before/after: 544px of frame existed, but
never at the same time as the controls above it.

## The assertions that changed, and the justification for each

Four, and no others. Nothing in `layout.spec.ts` changed.

| assertion                                                              | was                                 | is                                                      | why the new one is right                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table-frame.test.ts` › scrolls on both axes and is bounded            | `TABLE_FRAME.maxHeight` is defined  | `.flex` is `'1 1 0%'` **and** `.maxHeight` is undefined | The assertion's job is "this box is bounded, so it is the scrollport the sticky heading sticks to". The bound moved from a `max-height` to a zero flex basis inside a column that is one window tall. Both halves are asserted, so a `max-height` creeping back beside the basis — two opinions about one height — fails too. |
| `wbs-table.test.tsx` › scrolls the table rather than the page          | `frame.style.maxHeight` is not `''` | `.flex` is `'1 1 0%'` and `.maxHeight` is `''`          | Same claim, same element, read off the property that now carries it. jsdom lays nothing out, so this was always a declaration check; what a browser makes of it is `e2e/header.spec.ts`'s, which is new.                                                                                                                      |
| `project-page.test.tsx` › shows be-01's refusal and keeps the old name | `getByText('Paint the fence')`      | Escape, then `picker().value` is `'Paint the fence'`    | The text it read was the "Working in **Paint the fence**" line, which this change removed with the rest of the stacked chrome. The picker is where a project's name is shown now, and it shows it the moment the rename mode ends. Same claim — the refusal did not rename the project — one keystroke later.                 |
| `styles.test.ts` (unchanged, but newly load-bearing)                   | —                                   | —                                                       | Not changed. Recorded because two rules were **added** to the layer it reads, and both carry the grid guard for its sake — `body` and the `html/body/#root` height chain, where the guard is meaningless and consistent.                                                                                                      |

## Failure-proof table (R5)

Every check has been watched failing with the thing it guards broken, one fault
at a time, each reverted before the next.

| check                                                                | fault injected                                                          | observed                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `account-menu` › names its trigger with the account it belongs to    | `aria-haspopup="menu"` struck from the trigger                          | 1 failed — `expected null to be 'menu'`                                                                        |
| `account-menu` › moves the focus onto the item it opens              | the focus effect's body emptied                                         | 1 failed — `expected <body><div>…</div></body> to be <button type="button" …></button>`                        |
| `account-menu` › opens a menu that says who is signed in             | the menu's `aria-label` struck                                          | 3 failed — `Unable to find an accessible element with the role "menu" and name "Signed in as kat"`             |
| `account-menu` › closes on Escape and gives the focus back           | the Escape branch struck from the item's `onKeyDown`                    | 1 failed — `expected <div role="menu" …>…</div> to be null`                                                    |
| `account-menu` › closes on a press anywhere else                     | the `mousedown` listener never registered                               | 1 failed — same message                                                                                        |
| `account-menu` › leaves a press on its own trigger to the toggle     | the `wrapper.contains` guard struck                                     | 1 failed — `Unable to find … role "menu" and name "Signed in as kat"`, `aria-expanded="false"`                 |
| `presence-panel` › names itself with a heading                       | the `<h2>` turned into a `<p>`                                          | 2 failed — `Unable to find an accessible element with the role "heading" and name "Online (connecting)"`       |
| `presence-panel` › lists who is online                               | the `<ul>` turned into a `<div>`                                        | 1 failed — `Unable to find an accessible element with the role "list"`                                         |
| `presence-panel` › asks who is there as soon as the socket opens     | the `who` frame not sent on open                                        | 1 failed — `expected [] to deeply equal [ '{"type":"who"}' ]`                                                  |
| `presence-panel` › lists who is online, and marks which one is you   | the `(you)` marker struck                                               | 1 failed — `expected [ 'kat', 'sam' ] to deeply equal [ 'kat (you)', 'sam' ]`                                  |
| `project-page` › the header bar (all three)                          | **FAULT H1** — `<header>` turned into a `<div>`                         | 3 failed — `Unable to find an accessible element with the role "banner"`                                       |
| `project-page` › puts the project controls in a banner               | **FAULT H2** — the rename button's `aria-label` struck                  | **9 failed** — `Unable to find an accessible element with the role "button" and name "Rename"`                 |
| `project-page` › gives the header the slots the app fills            | **FAULT H3** — `{presence}` dropped from the bar                        | 1 failed — `Unable to find an element with the text: who is here`                                              |
| `header.spec` › gives the table the height the chrome stopped taking | **FAULT F** — `flex: '1 1 0%'` back to `maxHeight: calc(100vh - 16rem)` | 2 failed — `the frame is 544px where the branch this is based on gave 544px`, `Expected: >= 664 Received: 544` |
| `header.spec` › ends the frame at the bottom of the window           | **FAULT F**                                                             | same run — `the frame stops short of the bottom of the window`, `Expected: <= 16 Received: 133`                |
| `header.spec` › ends the frame at the bottom of the window           | **FAULT B** — the `body { margin: 0 }` rule commented out               | 2 failed — `the page scrolls vertically behind the frame`, `Expected: 0 Received: 8`                           |
| `header.spec` › keeps the page from scrolling at all at 125% zoom    | **FAULT B**                                                             | same run — `Expected: 0 Received: 10`                                                                          |
| `header.spec` › keeps the page from scrolling at all at 125% zoom    | **FAULT V** — `h-full` back to `h-screen` on the app's wrapper          | 1 failed — `the page scrolls vertically at 125% zoom`, `Expected: 0 Received: 200`                             |
| `header.spec` › keeps the header to one row at every laptop width    | **FAULT W** — three `shrink-0` controls of ~200px added to the bar      | 1 failed — `"past": 50` against `"past": 0` at 900                                                             |

### One check that was watched being vacuous, and fixed

`keeps the header to one row at every laptop width` first read **only** how many
rows deep the bar's children were laid out — the ratio of the flex container's
content height to its tallest child. That is the natural oracle and it is one
this bar can never fail.

The bar is `flex-nowrap`. A `flex-nowrap` row with too much in it does not become
two rows; it runs past its own right edge. Two faults were injected and **both
passed**: `flex-wrap` added to the header together with the picker's
`max-w-72 min-w-0` struck off, and then, on top of that, the brand raised from
`text-sm` to `text-2xl`. Neither wrapped, because the picker and the roster give
way first — about 460px of slack at 900px wide, which is the design working.

The check now reads `scrollWidth - clientWidth` as well, and it took **three**
added controls to move it (`past: 50` at 900). Both halves are kept: the overflow
half sees the bar this change actually built, and the wrap half sees the
`flex-wrap` somebody would add to "fix" an overfull bar — which would push the
toolbar and the table down instead.

## What `F` handed to `H` and what happened to it

`F`'s verify names one thing as `H`'s: `--font-sans` is `sans-serif` because
shipping shadcn's stack moved the face the cells inherit and turned three of
`layout.spec.ts`'s width tests red, and "the change that moves the face" must
re-measure `not-before`.

**This change does not move the face**, and the token still says `sans-serif`.
That is deliberate rather than forgotten. `H`'s scope is the chrome's height and
the frame's; the type scale is a geometry change to the grid, and shipping it
here would have meant re-measuring `not-before`, re-deriving `tableMinWidth` and
re-justifying the width assertions in the same change that moved the header —
three of `layout.spec.ts`'s tests changing for a reason that has nothing to do
with a header. The handoff note stands, unclaimed, for whichever change moves
the type. `styles.css` still carries it on the token.

## Gate

```
$ bunx nx format:check --all
(no output, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
 NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx openspec validate --all --json
41 items, 41 passed, 0 failed   (header-fits-a-row: valid)
```

`fe-01:test` is **644 tests across 30 files** — 628 across 28 before this change,
plus 8 in `account-menu.test.tsx`, 5 in `presence-panel.test.tsx` and 3 in
`project-page.test.tsx`.

Browser gate — **41 passed**, twice, cleanly:

```
  41 passed (44.9s)
  41 passed (49.6s)
```

22 `layout.spec.ts` (untouched), 8 `keyboard.spec.ts` (untouched), 6
`tailwind.spec.ts` (untouched), 5 `header.spec.ts` (new).

One flake was seen once, on the **first** run of the suite, before any of this
change existed — `keyboard.spec.ts › types a note under a name with Enter, and
the box grows to hold it`, on a reloaded page's value. Re-run alone immediately
after: 8 passed. It is the same pre-existing seed/reload flake `F` and the
tailwind spike both recorded, and it has not reappeared in the five full runs
since.

## How the browser gate was run, and why it is not the plain command

`playwright.config.ts` hard-codes 3100/3200/4200 and reuses a running stack when
`CI` is unset, so a `bun run e2e` from this worktree would measure whatever tree
the canonical checkout's `bun run dev` is serving. Every run above was made with
`CI=1` against a locally patched copy of the config on **3105/3205/4205** — this
agent's own ports, with matching gitignored `.env` files — because two earlier
agents collided on 3101 and a truncated Playwright run reads exactly like a
crash. The patch is reverted with `git checkout --` before each commit;
`playwright.config.ts` is byte-identical to `main`.

## Checks NOT run

- **The container build.** Unchanged from `F`: this change adds no dependency
  and no native module. The Docker daemon was not started.
- **The h2puni fit matrix.** These runs are Dany's Mac — the same chromium and
  the same specs, a different machine.
- **Dev deploy.** No lockfile change here, so `bin/dev-deploy.sh` would carry
  this by watcher alone; not exercised.
- **Dark mode.** Still configured and never rendered. The header uses the same
  tokens as everything else, so it inherits that gap rather than widening it.
- **A window shorter than the frame's minimum.** The fallback — the page scrolls
  rather than the rows being clipped — is what `overflow: visible` gives and is
  written down, but no test sets a 400px-tall viewport to watch it.
- **More than one person online.** The roster's clip is a `max-w` and an
  `overflow-hidden`; the browser test signs in one account, so the bar has never
  been laid out with four names in it. That is the one place the one-row claim
  rests on the CSS rather than on a measurement.
