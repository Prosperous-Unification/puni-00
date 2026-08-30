# verify — `linked-row-hover`

Branch `change/linked-row-hover`, off `main` @ `203a85b` (PR #61's merge).
fe-01 only: `wbs-table.tsx`'s state and its `<tr>`, `gantt-panel.tsx`'s props,
row label and one new `<rect>`, and two rules in `styles.css`. No be-01 read, no
migration, no contract change.

## The gate

Run from the repo root on this branch, 2026-08-14.

| Command                                                              | Result                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                         | green, exit 0                                                              |
| `bunx nx run-many -t test lint typecheck build --parallel=2`         | green — 21 projects; fe-01 **1321 tests** in 50 files; be-01 **715** tests |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | green — **175 passed**, 4.8m, chromium                                     |
| `openspec validate --all --json`                                     | green — 46 items, 46 passed, 0 failed                                      |

`CI=1` on the browser run is load-bearing and not decoration. The committed
config sets `reuseExistingServer: !isCi`, and a `bun run dev` was holding
3100/3200/4200 in this very checkout — a plain `bun run e2e` would have reused
it, which bypasses the `DB_PATH` override and signs seven throwaway accounts
into `apps/be-01/local.db`. With `CI=1` Playwright starts its own three servers
against `tmp/e2e-*.db`. The dev server was stopped for the run (Dany's call) and
restarted after. This is `LLM_README`'s own landmine, met live.

## What the change does

One **pointed row** — one work item id — and the rule that **each face lights
the other face's answer**:

- The pointer or a bar's focus on the **chart** lights that work item's `<tr>` in
  the plan renderer, its **row label**, and a band across its Gantt row.
- The pointer on a **table row** lights its row label and its Gantt row band,
  and **not** the `<tr>` itself.

All three lights are the shipped `--grid-dep-lit`, the **row light**. One ink for
every cause is safe because there is one pointer: a hovered Depends on cell and a
hovered bar can never be on screen at once.

The asymmetry in the second bullet is a **correction made under a failing test**,
not a simplification — see the second entry in the table below.

## Failure-proof table

Every check below was watched failing with the named fault injected, and watched
green with it removed.

| Check                                                                       | Fault injected                                                               | Observed                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `points a row without remounting the cells under a half-typed name` (jsdom) | `pointedRow` added to the `columns` memo's dependency list                   | **failed** — `expected <textarea …(5)></textarea> to be <textarea …(5)></textarea>`; the same-labelled box a different node |
| `e2e/hover-cards.spec.ts`, 4 banded-hover assertions                        | none — this was the change's own regression, caught by the full browser gate | **failed** — `data-row-lit` on every hovered row made `tr:not([data-row-lit])…:nth-child(even):hover` unmatchable           |
| `is not pointed by a tap` (jsdom, table row)                                | the `pointerType !== 'mouse'` guard deleted from `onPointerEnter`            | **failed** — `expected [ '020' ] to deeply equal []`                                                                        |
| `lights the table row, the row label and a band from a bar` (browser)       | `[data-grid] tbody tr[data-row-lit]` withheld, attributes still written      | **failed** — `expect(received).not.toBe(expected)`; jsdom stayed **13/13 green** through it                                 |
| `lights the same colour on an even row as on an odd one` (browser)          | `data-row-lit` removed from the banded-hover rule's `:not()` chain           | **failed** — `Expected "oklab(0.96448 …)" Received "oklab(0.917255 …)"`                                                     |

## Two checks that could not fail, caught before shipping

Both are recorded here rather than quietly fixed, because the second one is a new
shape and `AGENTS.md` R5's tally is the point of writing them down.

**1. The stripe negative, written from a bar — watched passing with the guard
removed.** The `:not()` chain was justified in a comment on the reasoning that a
pointed row written from a bar is as likely to be even as odd. That reasoning is
**wrong**: `nth-child(even):hover` requires the pointer to be on the `<tr>`, and
pointing from the chart leaves `:hover` unmatched, so the banded rule never
competes and there was nothing for the `:not()` to hold up. Removing
`data-row-lit` from the chain left all six browser tests green.

The collision needs both conditions on one row. After the correction below, the
only arrangement that reaches it is a **bar holding the keyboard focus** while the
**pointer rests on that same row in the table** — which is exactly where `depFocus`
gets, and is why the rule above it was already written for that case. Rewritten
that way, the negative failed on the colours in the table above. The comment in
`styles.css` now states the real mechanism and records that the first version of
it was wrong.

**2. `data-row-lit` on the hovered row itself — a regression the unit suites could
not see.** The first implementation wrote `data-row-lit` from `pointedAt`, so
every row the pointer rested on carried it. That made the banded-hover rule
unmatchable and stopped the stripe moving under the pointer at all. All **1319**
jsdom tests passed through it; the full browser gate failed four assertions in
`e2e/hover-cards.spec.ts` — `a banded row moves as far under the pointer as a
plain one` and `a hovered banded row is nobody else's colour`, in **both**
palettes.

The fix is the design correction now in the spec: a row the pointer is already on
is a row `tr:hover` is already tinting, so the `<tr>` lights from the **chart's**
answer alone (`pointedFromChart`), and the panel lights from either face
(`pointedAt`). The jsdom suite gained `lights the chart from a table row, and not
the row itself` and the browser suite an explicit `expect(page.locator(
'[data-row-lit]')).toHaveCount(0)`, so the regression cannot return unseen.

**The lesson for the next reader**: this was found only by running the **whole**
browser gate rather than the new tests in it. A change that edits a shared CSS
rule has no business believing a filtered run.

## One test bug worth recording

`rowOf` in `e2e/gantt.spec.ts` finds a row by `Name of <number>`, and
`getByLabel` matches on **substring** — so `Name of 010` resolves three elements
on this fixture (the parent, `010.1`, `010.2`) and every assertion made through it
on a parent number is a strict-mode error rather than a reading. The stripe test
hit it and now names its rows explicitly. A first draft of the same test also
picked `010` as a bar-bearing row; `010` is a parent, which draws a summary
bracket and no bar, so the hover waited out the full 60s timeout on a mark that
was never going to exist.

## Not verified

- **Touch.** The `pointerType !== 'mouse'` guard is proved in jsdom on a
  hand-built event, and the browser gate drives a mouse only. No real tap on a
  real touch device has been tried; the guard's reason is the bar's own shipped
  comment about Chromium synthesizing a mouse sequence from a tap.
- **Dark mode**, for the new lights specifically. `--grid-dep-lit` carries no
  `.dark` twin by design — it is a mix into `--background`, which `.dark`
  re-points — and `hover-cards.spec.ts` measures that token in both palettes
  already. The new label and band read the same token, and that inheritance is
  argued rather than measured.
- **A plan large enough to matter for render cost.** The writers bail out when the
  value is unchanged, so a pointer crossing the chart costs one render per row
  crossed. That is `dep-hover-highlights`' own accepted cost and no profile was
  taken here.

## After merging main (2026-08-20)

`main` moved 159 commits under this change, several of them in the same files:
`not-before-cell`, two Gantt changes (today's marker, the SVG download), the
Depends on hover moving from a `<span>` to its `<td>`, and `chart-clamp-words`.
Merged at `9639a39` → `d8c1534`; three files conflicted and the commit message
records each resolution.

Two things the merge broke and the gate caught:

- Main added **twelve** `GanttPanel` render sites with no `onPointRow`, so
  `onFocus` threw before `showSurface` and two of `chart-clamp-words`' tests
  could not find their tooltip. All 63 sites now pass both new props.
- The conflict resolution ate two closing braces in `gantt-panel.test.tsx`,
  which vitest reported as `Unexpected end of file` at 4916 rather than as a
  failing assertion — 9 of this change's 15 jsdom tests silently did not run.
  **A collected-test count is part of reading a green suite.**

| Gate at `d8c1534`                                       | Result                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green                                                                      |
| `bunx nx run-many -t lint typecheck build --parallel=2` | green — 21 projects                                                        |
| `bunx nx test fe-01 -- --run`                           | **1518 passed, 2 failed** — both `plan-mermaid.test.ts`, red on `main` too |
| `CI=1 bunx playwright test …` (whole suite)             | **174 passed, 6 failed** — all six red on `main` too                       |
| `CI=1 bunx playwright test … -g 'the pointed row'`      | green — 6/6                                                                |

**The failures are `main`'s, measured rather than assumed.** A worktree at
`9639a39` was built and run: fe-01 there is **2 failed / 1503 passed**, the same
two `plan-mermaid` cases. For the browser suite the two specs holding every
failure were run on both trees — `main` **9 failed / 12 passed**, this head
**8 failed / 13 passed**, and the sets differ between runs of the _same_ tree,
so `dark-mode.spec.ts` is flaky on this machine (`prefers-color-scheme`
emulation). The two that read what this change touches —
`the Gantt's row labels stand off the column they are in` and `picks the add
button up off the row it is hovered on` — fail on **both** trees.

Not fixed here: those pre-existing failures are `main`'s to fix, and this change
does not make them worse. Nothing was papered over and no retry was used.

## CI at `0150eda` (PR #86)

`gate` **passed** — run 32358146091. So the two `plan-mermaid.test.ts` failures
above are local to this machine and do not reproduce on CI's runner.

`pixels` **failed, 2 of 180**: `dark-mode.spec.ts:239 is dark at the first paint,
before the app has mounted` and `header.spec.ts:413 the entry is clipped and its
full text is still readable`. All six of this change's browser tests are among
the 178 that passed.

**The ws-proxy flake, sixth sighting.** `main`'s own run at this branch's merge
base (`9639a39`, run 32281560107) failed `pixels` the same way: 2 failed / 172
passed, one `dark-mode.spec.ts` case and one `header.spec.ts` project-picker
case. The _files_ match and the individual cases do not — `dark-mode:263` and
`header:440` there against `:239` and `:413` here — which is what a flake looks
like and what a regression does not. Both logs are full of `[WebServer] Error:
write EPIPE` / `ECONNRESET`.

Not re-run to get green, deliberately: `playwright.config.ts` sets `retries: 0`
and says why — "a layout check people re-run until it is green is a check that
cannot fail wearing a different hat". Recorded and merged over, which is what
the four previous sightings did (`#80`, `#82`, `#83`'s tails).

Owed, and not this change's to pay: `dark-mode.spec.ts` and `header.spec.ts`
need the flake fixed at its cause, or the ws-proxy noise silenced so the real
signal is readable.
