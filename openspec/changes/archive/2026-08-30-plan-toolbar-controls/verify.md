# verify — `plan-toolbar-controls`

Implemented on 2026-08-29 in a worktree at `b3acb7b`. Slices 1–4 were done then.
Slices 3.3, 5.1 and 6.1 were written but **not executed** — there was no browser
on that machine — and were finished on **2026-08-30** on branch
`feat/plan-toolbar-controls-gate`, merged up to `origin/main` **five times** —
main moved 28 commits, then 10, 4, 4 and 16 more while this ran — so that every
figure below describes the bar as `work-item-types`, the reference-cell rework,
`estimate-triple-visible`, `assumed-duration-schedules` and the Gantt dock left
it. The figures did not move across any of the five merges; that is stated under
"Measurements" rather than assumed.

**Every browser run below is reconciled before it is believed.** A killed
Playwright run exits 0 with a summary describing only the fragment it reached,
and a fragment that happens to contain the case being measured reads exactly
like a pass — so each run's `Running N tests` is checked against its own
passed + failed + skipped. The whole gate: `Running 237 tests`, and
`233 passed + 3 failed + 1 skipped = 237`.

**The browser is real now, and the ports are its own.** `E2E_PORT_SHIFT=800`
(landed on main as `10ccc41`/`3ea2ade`) moves be-01/gw-01/fe-01 to
3900/4000/5000, so the gate runs beside the dev server holding 3100/3200/4200
instead of reusing it. Reusing it is `LLM_README.md`'s landmine and `AGENTS.md`'s
R5 entry for `gantt-calendar-axis`: 66 tests green against a checkout that never
built them. Every measurement and every negative below was taken while this
process **held the canonical heavy-work lock**, because an overnight run on this
host at load average 555 timed out for 60 seconds merely clicking `Freeze #`.

## Measurements

Read in Chromium at 1280×900 on 2026-08-30, on a host holding the heavy-work
lock, off `the folded toolbar fits its budget` with its budget temporarily
forced to 1 so that the assertion prints what it measured.

**Is this figure pinnable on this machine at all?** Asked before it was
believed, because a number that holds once is not a pin. The bar was read
**twice in a row under the same lock**, nothing else running either time:

```
== E1: this bar, first quiet reading ==   Received: 1552.734375
== E2: this bar, second quiet reading ==  Received: 1552.734375
```

Identical to the last digit — and identical again to the readings taken hours
earlier on a **loaded** host, and across all five merges of `main` this branch
took. It is pinnable on this machine; had it moved between two quiet runs, this
section would say so instead of naming a number that held once.

| Figure                                                       | Value           |
| ------------------------------------------------------------ | --------------- |
| folded toolbar controls at 1280, this bar (`asked`, px)      | **1552.734375** |
| the same bar with the two text labels restored (`asked`, px) | **1658.828125** |
| what the words cost                                          | **106.09px**    |
| rows the bar wraps onto at 1280 (`lines`)                    | **2**, asserted |
| pinned budget (`FOLDED_TOOLBAR_BUDGET_PX`)                   | **1600**        |

Both figures reproduce to the last digit across runs, across a loaded host and
an idle one, and across five merges of `main` — sixty-two commits, including
`work-item-types`, `estimate-triple-visible`, `assumed-duration-schedules` and
the Gantt dock. A width is a layout, not a race, and every one of those changes
is in the table or the chart rather than on the bar above them.

**The figure `tasks.md` 5.1 asked for would have been a check that cannot
fail, and that is the third correction to this slice.** 5.1 said to pin the
folded toolbar's width **before** the change and assert the bar got narrower.
But the negative written for it restores two text labels, while the bar before
this change carried those labels _and_ `Freeze numbering` and `Unfreeze all` as
two separate buttons where there is now one `Freeze #` menu. The fault therefore
rebuilds a bar strictly narrower than the pre-change one: `asked <= before`
holds with the fault in, and the assertion is decoration. Pinned that way this
test would have joined `AGENTS.md`'s tally rather than guarded against it.

So the pin is the **shipped** bar's own budget: 1600, which is the measured
1552.73 plus about 47px of headroom for font-metric drift between this Mac's
Chromium and CI's Linux one — a little over half of the 106.09px the fault adds,
so the fault clears it either way. A toolbar change worth catching moves this by
a control's width; ten pixels is a font, not a control.

**`scrollWidth` alone is not the measurement, and `design.md` D5 asking for it
was the vacuity it warns about.** The toolbar is `flex-wrap`: it never
overflows, so its `scrollWidth` equals its `clientWidth` whatever it holds, and
an assertion on it could not fail. What shrinks when a label shrinks is the sum
of the controls plus the gaps between them (`asked`), and what that buys is
`lines`, the number of rows the bar wraps onto. `scrollWidth <= clientWidth`
stays in the test as a **precondition** on those two, labelled as such.

## Tests that had to change, and why

`Freeze numbering` and `Unfreeze all` were buttons and are now menu items, so
every case that clicked them must open the menu first. Each is listed
individually — a test that changed shape is a place the "same behaviour" claim
is asserted rather than observed.

Eight of them changed by exactly one helper (`click('Freeze numbering')` →
`takeFreezeAction('Freeze numbering')`, which clicks `Freeze #` and then the
item). Three changed by more than that, and those three are the ones to read.

| Test                                                                                                    | Change                                                    | Still asserts                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `wbs-table` `locks a frozen row and offers to unfreeze it`                                              | helper                                                    | a frozen row shows the lock and offers `Unfreeze` on its ⋯           |
| `wbs-table` `offers Duplicate on a frozen row, which cannot be moved`                                   | helper                                                    | freezing stops a move, not a copy                                    |
| `wbs-table` `gives the focus back to the ⋯ button after unfreezing`                                     | helper                                                    | the row menu returns the focus to its own button                     |
| `wbs-table` `keeps Delete on a frozen row, refused and saying why`                                      | helper                                                    | Delete present, `aria-disabled`, carrying its reason, and inert      |
| `wbs-table` `refuses to drag a frozen row and says why`                                                 | helper                                                    | the handle refuses and `move` is never called                        |
| `wbs-table` `says on itself why a frozen row will not move`                                             | helper                                                    | the handle's own `aria-disabled` and `title`                         |
| `wbs-table` `refuses to move a frozen row and says why`                                                 | helper                                                    | Alt+↓ on a frozen row moves nothing and says `frozen`                |
| `wbs-table` `a frozen row refuses to arm and says how to unfreeze it`                                   | helper                                                    | Ctrl+D on a frozen row arms nothing and toasts the reason            |
| **`wbs-table` `says the toolbar is busy, …holds back`**                                                 | the `disabled` assertion re-pointed to `Freeze #`         | the freeze write is refused while busy; `Add work item` is not       |
| **`wbs-table` `rebuilds nothing when the phases came back the same`**                                   | the write moved **out** of `act`, and `box.focus()` added | a reread that changed no phase leaves the focused cell mounted       |
| **`page-shortcuts` ×2 (`holds nothing back…`, `holds them back…`)**                                     | the stand-in toolbar button renamed to `Freeze #`         | a declared-but-closed modal holds nothing back; the cheat sheet does |
| `layout.spec` ×6 (Number-column envelope, clipping, depths 4/5/6/7, `holds a number still when…frozen`) | `freezeNumbering(page)` helper                            | every one of the six number-column geometries, on a frozen plan      |
| `plan-cards` `holds the toolbar, which is nowhere on the page…`                                         | comment only — `Collapse all` is still found by that name | the sheet carries the toolbar, and only once opened                  |

The three in bold, in full:

- **`says the toolbar is busy`** asserted `Freeze numbering`'s `disabled`. There
  is no such button; the assertion is on the `Freeze #` trigger, which carries
  `disabled={busy}` and the busy affordance exactly as the two buttons did. The
  claim is the same one; the element carrying it is the menu's trigger.
- **`rebuilds nothing when the phases came back the same`** took the write
  inside `await act(async () => …)`. An async `act` batches its callback's
  updates to the end, so the menu the first click opens is not on the page for
  the click that takes the item — the write is taken before the `act` now, and
  only the settle is wrapped. And every menu here returns the focus to its own
  trigger on the way out, so the caret this test is about is put back by hand
  before the reread lands. **Re-watched against its own original fault**:
  `sameRoles` pinned to `false`, it failed on `expected <body><div>…(1)</div>
  </body> to be <input …(6)></input>`. The re-shaped test still sees the fault
  it was written for.
- **`page-shortcuts` ×2** used `Freeze numbering` only as "a toolbar button, not
  a cell" — one of the two adds "Tab out of the untrapped sheet reaches exactly
  this button", and `Freeze #` is still the first control on the bar.

## New tests

| Test                                                                           | File                 | Says                                            |
| ------------------------------------------------------------------------------ | -------------------- | ----------------------------------------------- |
| `every icon inherits the colour and the size of the control it sits in`        | `toolbar-icons.test` | `currentColor`, `1em`, `fill="none"`            |
| `every icon is hidden from the accessibility tree and says nothing of its own` | `toolbar-icons.test` | `aria-hidden`, `focusable`, no text of its own  |
| `one control offers both writes`                                               | `wbs-table.test`     | exactly one freezing control; two items         |
| `takes each of the two writes when its item is taken`                          | `wbs-table.test`     | the menu is wired to `freeze`/`unfreezeProject` |
| `⌘+Z is inert while the freeze menu is open, and works again once it closes`   | `wbs-table.test`     | the inert-while-open set                        |
| `the controls are found by the names they always had`                          | `wbs-table.test`     | icon buttons, words gone from the face          |
| `the cheat sheet control carries a drawn icon`                                 | `wbs-table.test`     | no `⌨`, an `aria-hidden` SVG instead            |
| `offers freezing once, as a menu that opens on the sheet`                      | `plan-cards.test`    | one entry on the phone sheet; the menu opens    |
| `a modified Enter or Space on a freeze menu item takes nothing`                | `e2e/keyboard.spec`  | Chromium: a modified Enter takes no item        |
| `the folded toolbar fits its budget`                                           | `e2e/layout.spec`    | Chromium: `asked` under its pinned budget       |

## Commands

Every row was run on 2026-08-30 from this worktree, on `feat/plan-toolbar-controls-gate`
merged up to `origin/main`. The three heavy rows each held the canonical
heavy-work lock for their whole run.

| Command                                                                         | Result                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bunx openspec validate --all --json`                                           | **pass** — 91/91 changes valid, 0 failed                                                                   |
| `CI=1 E2E_PORT_SHIFT=800 bunx nx run fe-01:e2e` (whole gate, no grep)           | 233 passed, 3 failed, 1 skipped of 237 planned — none of the 3 reachable from this diff                    |
| `bin/h2puni-gate.sh` (`format:check --all`, then test/lint/typecheck/build ×23) | `fe-01`, `be-01`, `gw-01`, `mcp-01` and the libs pass; 3 `tools/*` test targets fail on macOS host tooling |
| `bunx nx run fe-01:test` (inside the gate)                                      | **pass** — 1899 tests, 60 files, 0 failed                                                                  |
| `bunx nx run fe-01:lint` (inside the gate)                                      | **pass** — 0 errors, 1 pre-existing warning                                                                |
| `bunx nx run fe-01:typecheck`, `fe-01:build` (inside the gate)                  | **pass**                                                                                                   |

### `bunx openspec validate --all --json`

```json
{ "totals": { "items": 91, "passed": 91, "failed": 0 } }
```

### The whole browser gate

```
Running 237 tests using 1 worker
  3 failed
    [chromium] › apps/fe-01/e2e/keyboard.spec.ts:525:3 › the command chords, in a browser › Escape leaves the stored day alone, blur and all
    [chromium] › apps/fe-01/e2e/keyboard.spec.ts:669:3 › the command chords, in a browser › saves only the year that was typed, digit by digit, in a real Chrome
    [chromium] › apps/fe-01/e2e/plan-surface.spec.ts:253:3 › the plan and its chart as one surface › docks the chart under the last row rather than at the bottom of the window
  1 skipped
  233 passed (6.3m)
```

`233 + 3 + 1 = 237`, the count it planned — so this is the whole suite and not
a fragment of one.

**None of the three is this change's, and each was identified rather than
assumed.** `git diff origin/main --stat` for this branch touches
`apps/fe-01/e2e/layout.spec.ts` and `apps/fe-01/e2e/keyboard.spec.ts` —
comments in both — and three markdown files. **No production source at all**, so
nothing here can reach a spec about a chart or a date field.

- The two `keyboard.spec.ts` cases are the documented locale pair: they type
  digits into a native `<input type="date">` and this host renders `dd.mm.yyyy`,
  so they fail on `Expected: "2026-07-01" / Received: "2026-01-07"` and
  `Expected: "2026-05-20" / Received: "2026-02-05"` — the month-and-day swap
  `playwright.config.ts` and `AGENTS.md` both describe.
- `plan-surface.spec.ts:253` is a **stale test** rather than a regression:
  `527px between the last row and the chart, against 215px anything asked for ·
Expected: <= 217.4375 · Received: 527.4375`. The Gantt dock changed where the
  chart sits and its spec has not caught up; another session owns the
  correction, so it is left alone here.

Two failures this file recorded earlier in the day are **gone**, and neither was
touched here: `deps-cell.spec.ts:432`'s animation poll was a fault in its own
theme drain, fixed on `main` (`26d6166`), and `phases.spec.ts:204` was
`estimate-triple-visible` leaving a spec behind, fixed on `main` (`a4648e4`)
after this file reported it.

The 1 skipped is `gantt.spec.ts`'s pre-existing `test.fixme` — **no longer**
this change's own. `the folded toolbar fits its budget` is `fixme` no more, and
both new browser cases pass:

```
  ✓  110 [chromium] › apps/fe-01/e2e/keyboard.spec.ts:429:3 › a modified Enter or Space on a freeze menu item takes nothing (1.5s)
  ✓  170 [chromium] › apps/fe-01/e2e/layout.spec.ts:3314:3 › the folded toolbar fits its budget (910ms)
```

### `bin/h2puni-gate.sh`

`bunx nx format:check --all` passed, and so did every `test`, `lint`,
`typecheck` and `build` target for the four apps and the libs, `--parallel=2
--skip-nx-cache`:

```
> nx run fe-01:lint
  4193:5  warning  React Hook useMemo has unnecessary dependencies: 'ownedServicesByTeam' and 'teamsByPerson'…
✖ 1 problem (0 errors, 1 warning)

> nx run fe-01:test
 Test Files  60 passed (60)
      Tests  1899 passed (1899)
```

The warning is pre-existing, on a `useMemo` this change does not touch. The two
timezone failures in `plan-mermaid.test.ts` that this file recorded on
2026-08-29 are gone: `fe-01:test` is fully green.

Three targets failed:

```
 NX   Running targets test, lint, typecheck, build for 23 projects failed

Failed tasks:
- tool-dagger:test
- tool-devsync:test
- tool-bootstrap:test
```

**All three are host tooling, and none is reachable from this change.**
`git diff origin/main --stat` for this branch is two files, both of them
`apps/fe-01/e2e/*.spec.ts`; nothing under `tools/` is touched. They were then
re-run **outside** the lock, in case the gate holding the canonical lock was
itself the cause, and they fail identically without it:

```
$ bunx nx run-many -t test --projects=tool-dagger,tool-devsync --skip-nx-cache
✗ with-heavy-lock > uses one canonical production lock even when callers set different overrides
  error: ENOENT: no such file or directory, open '/var/folders/…/wbs-heavy-lock-PWvyC3/flock-argv'
✗ with-heavy-lock > refuses immediately with exit 75 while another heavy operation owns the lock
✗ dev MCP preflight > refuses a missing or incomplete MCP environment before deployment
✗ dev MCP preflight > prints persistent exposure state and refuses malformed state
```

`tool-bootstrap`'s seven are the `configure.sh Caddyfile merge, executed` cases,
which shell out to a real `caddy` unit and a pinned `bun` on the host; four of
them time out at 60s. These are the macOS-host gap `AGENTS.md`'s gate section is
about, and they are **not** cleared by this change — see "Skipped".

## Failure proofs (R5)

Every fault below was injected into the production file, the named test run, and
the message copied out of that run. Dates are 2026-08-29.

| Check                                       | Fault injected                                                            | Test that saw it fail                                                                                                                                                                                                                                | Watched                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| an icon takes the control's colour          | `ICON.stroke` → `'#111827'`                                               | `every icon inherits the colour and the size…`                                                                                                                                                                                                       | `KeyboardIcon: expected '#111827' to be 'currentColor'`                                                   |
| an icon takes the control's size            | `ICON.width`/`height` → `16`                                              | `every icon inherits the colour and the size…`                                                                                                                                                                                                       | `KeyboardIcon: expected '16' to be '1em'`                                                                 |
| an icon names nothing of its own            | `<title>Keyboard</title>` added to `KeyboardIcon`                         | `every icon is hidden…and says nothing of its own`                                                                                                                                                                                                   | `KeyboardIcon: expected 'Keyboard' to be ''`                                                              |
| **an icon is out of the a11y tree**         | `aria-hidden` removed from `ICON`                                         | the accessible-name oracle `tasks.md` asked for                                                                                                                                                                                                      | **PASSED — see "Vacuous negatives" below**                                                                |
| the old freeze buttons are gone (table)     | `Unfreeze all` restored as a second `<Button>` on the bar                 | `one control offers both writes`                                                                                                                                                                                                                     | `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`                                  |
| the old freeze buttons are gone (phone)     | the same                                                                  | `offers freezing once, as a menu that opens on the sheet`                                                                                                                                                                                            | `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`                                  |
| the accessible names held                   | `aria-label="Collapse all"` dropped from the icon button                  | `the controls are found by the names they always had`                                                                                                                                                                                                | `Unable to find role="button" and name "Collapse all"`                                                    |
| …and the old suite is the real proof        | the same                                                                  | `the expansion controls stand down while a search is on`, `collapses every branch and opens them all again`, `remembers each project separately`, `stands the expansion controls down while a facet is on with nothing typed`, and 2 in `plan-cards` | `Unable to find an accessible element with the role "button" and name "Collapse all"`                     |
| the cheat sheet glyph is gone               | `⌨` put back beside `<KeyboardIcon />`                                    | `the cheat sheet control carries a drawn icon`                                                                                                                                                                                                       | `expected '⌨' to be ''`                                                                                   |
| the menu joins the inert-while-open set     | `usePageShortcutsSuspended(open)` → `(false)` in `MenuControl`            | `⌘+Z is inert while the freeze menu is open…`                                                                                                                                                                                                        | `expected [ 'undo' ] to deeply equal []`                                                                  |
| the re-shaped phase test still sees its bug | `sameRoles(…)` → `false` at its call site                                 | `rebuilds nothing when the phases came back the same`                                                                                                                                                                                                | `expected <body><div>…(1)</div></body> to be <input …(6)></input>`                                        |
| **a modified Enter takes nothing**          | `MenuControl`'s item `preventDefault` moved back below the modifier guard | `a modified Enter or Space on a freeze menu item takes nothing`, in Chromium                                                                                                                                                                         | `after Shift+Enter · Expected: 2 · Received: 0` — both locks gone (2026-08-30)                            |
| **the bar keeps to its budget**             | the words restored on the face of the two icon buttons                    | `the folded toolbar fits its budget`, in Chromium                                                                                                                                                                                                    | `the toolbar asks for more room than its budget · Expected: <= 1600 · Received: 1658.828125` (2026-08-30) |

### Vacuous negatives, recorded rather than claimed

`tasks.md` 1.1 asked for `aria-hidden` removed from one icon, "watched failing
on the control then having two accessible names". It was injected and the test
**passed**: an `<svg>` with no `<title>` contributes no accessible name at all,
so a button labelled by `aria-label` keeps exactly one name whether its icon is
hidden or not. Probed further in jsdom — a bare `<svg>` answers zero for `img`,
`graphics-document`, `graphics-object`, `graphics-symbol` and `presentation`,
hidden or not — so there is no role oracle either, and a real browser's tree
would say the same for the same reason.

```
✓ src/components/wbs/probe2.test.tsx  (1 test) 39ms
  tasks.md negative: aria-hidden removed — does the control gain a second name?
    expect(svg.hasAttribute('aria-hidden')).toBe(false)      ← the fault is in
    expect(button).toHaveAccessibleName('Keyboard shortcuts') ← and this passes
```

The attribute is **kept** — it is what keeps the two claims independent, so the
day one of these icons grows a `<title>` it is not read out — but the assertion
on it is an attribute assertion and is labelled as one in the test's own
comment. The reachable half of that requirement, "says nothing of its own", has
a real negative (the `<title>`, above) and is what actually guards it.

`design.md` D5's `scrollWidth` is the second: it cannot fail on a `flex-wrap`
bar. Replaced by `asked` and `lines`, with `scrollWidth` demoted to a stated
precondition. See "Measurements".

**`tasks.md` 5.1's own pin is the third, and it was caught before it was
written rather than after.** Pinning the _pre-change_ width and asserting
`asked <= before` cannot fail on the negative it exists for: the fault restores
two text labels, and the pre-change bar carried those labels **and** two
separate freeze buttons where there is now one menu, so the faulted bar lands
under the pre-change figure and passes. The pin is the shipped bar's own budget
instead, and the fault was then watched failing against it —
`Expected: <= 1600 · Received: 1658.828125`. This one did **not** ship, so it is
described in `AGENTS.md` rather than counted there.

## Skipped or unavailable checks

Everything `tasks.md` asked for has now been run. What follows is what this
host could **not** answer, stated rather than glossed.

1. **Three `tools/*` test targets are red on this Mac and were not made green.**
   `tool-dagger:test` (2), `tool-devsync:test` (2) and `tool-bootstrap:test` (7)
   fail on host tooling: no BSD `flock` for the lock shim's argv capture, no MCP
   deployment environment, and no host `caddy` unit or pinned `bun` for
   `configure.sh`'s merge cases, four of which time out at 60s. They fail
   identically with the heavy lock free, and `git diff origin/main --stat` for
   this branch touches only two `apps/fe-01/e2e/*.spec.ts` files — so they are
   neither caused by this change nor fixable inside it. **They were not run
   against a pristine `origin/main` checkout**, because the diff proves the
   change cannot reach them; that is an argument from the diff, not an
   observation, and it is the weakest claim in this document.
2. **The pinned width is a figure from _this_ machine's Chromium.** It is
   asserted with about 47px of headroom against a fault worth 106.09px, which is
   the margin the drift would have to exceed to matter. CI's Linux Chromium has
   not yet run it. If it disagrees it fails loudly, printing both numbers, and
   the figure is re-measured there.
3. **Three browser cases stay red and none was "fixed"** — see "Commands". Two
   are the documented `keyboard.spec.ts` date-segment pair, which fail for this
   host's locale rather than for the code. `plan-surface.spec.ts:253` is a stale
   test the Gantt dock left on `main`, **reported and left alone** because
   another session owns its correction. Two earlier red cases —
   `deps-cell.spec.ts:432` and `phases.spec.ts:204` — were fixed on `main` while
   this ran and now pass here.
4. **`nx format:check --all` and the gate ran before this file's own last
   edits.** `verify.md` and `tasks.md` are formatted and staged through
   lefthook's pre-commit `format` and `lint` hooks, which is what actually
   checks them.

## Domain terms

No term resolved or moved. `Freeze`, `Frozen number` and `Expansion` are already
in `CONTEXT.md` and this change alters none of them — only where a reader
reaches the two writes. `Actions menu` still describes a row's ⋯; the shared
mechanism is documented on `MenuControl` in `actions-menu.tsx`, where R3 puts
it.
