# verify — `plan-toolbar-controls`

Implemented on 2026-08-29 in a worktree at `b3acb7b`. Slices 1–4 are done; slice
5 is written and **pending a browser**; slice 6 is not run here.

**No browser was available for this change.** Ports 3100/3200/4200 were held by
a dev server, and `bun run e2e` sets `reuseExistingServer: !isCi` — a run here
would have measured another checkout, which is `LLM_README.md`'s landmine and
`AGENTS.md`'s R5 entry for `gantt-calendar-axis`. Every Playwright assertion
below is **written and unexecuted**, and said so again under "Skipped".

## Measurements

The folded toolbar's width was to be pinned as a number before the change. It
could not be measured here, so it is pinned as `null` and the test that reads it
is `test.fixme` with that reason in its message — a placeholder that says so
every run, rather than a relative assertion that would pass on a regression.

| Figure                                        | Before                | After   |
| --------------------------------------------- | --------------------- | ------- |
| folded toolbar controls at 1280 (`asked`, px) | **pending a browser** | pending |
| folded toolbar rows at 1280 (`lines`)         | **pending a browser** | pending |

**What would be pinned, and how.** `foldedToolbarControlsBeforePx()` in
`apps/fe-01/e2e/layout.spec.ts` returns `null` today. To fill it in:

```sh
git stash                                    # the toolbar as it stood at b3acb7b
CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts \
  -g 'the folded toolbar fits its budget'    # throws on the null, printing `asked`
git stash pop                                # then paste that figure into the function
```

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
| `a modified Enter or Space on a freeze menu item takes nothing`                | `e2e/keyboard.spec`  | **browser only** — see Skipped                  |
| `the folded toolbar fits its budget`                                           | `e2e/layout.spec`    | **browser only, and `fixme`** — see Skipped     |

## Commands

| Command                                                                           | Result                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `bunx nx run fe-01:test`                                                          | see below — 1814 tests, 2 pre-existing failures |
| `bunx nx run fe-01:lint`                                                          | pass (0 errors, 1 pre-existing warning)         |
| `bunx nx run fe-01:typecheck`                                                     | pass                                            |
| `bin/h2puni-gate.sh`                                                              | **not run** — out of scope for this worktree    |
| `openspec validate --all --json`                                                  | see below                                       |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | **not run** — no browser; ports held            |

### `bunx nx run fe-01:test`

```
 Test Files  1 failed | 57 passed (58)
      Tests  2 failed | 1812 passed (1814)
   Duration  160.04s

 FAIL  src/components/wbs/plan-mermaid.test.ts > a real Mermaid parse (M5) > the excludes-weekends trap, watched rather than argued > leaves a bar crossing a weekend exactly where it was told, manualEndTime true
AssertionError: expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'

 FAIL  src/components/wbs/plan-mermaid.test.ts > … > still parses a point (unestimated/zero) as a real milestone with equal dates
AssertionError: expected '2026-09-02T21:00:00.000Z' to be '2026-09-03T00:00:00.000Z'
```

**Both are pre-existing and unrelated** — a three-hour timezone offset in
`plan-mermaid.test.ts`, a file this change does not touch. Watched failing the
same way on the tree with this change stashed:

```
$ git stash push -- src e2e ../../openspec
$ bunx vitest run --root . src/components/wbs/plan-mermaid.test.ts --silent
     → expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'
     → expected '2026-09-02T21:00:00.000Z' to be '2026-09-03T00:00:00.000Z'
      Tests  2 failed | 47 passed (49)
```

`src/components/wbs/wbs-table.test.tsx (544 tests)` passed in that same run, and
so did `plan-cards.test.tsx (110)`, `actions-menu.test.tsx (15)`,
`page-shortcuts.test.tsx (7)` and the new `toolbar-icons.test.tsx (2)`.

### `bunx nx run fe-01:lint`

```
/…/apps/fe-01/src/components/wbs/wbs-table.tsx
  4061:5  warning  React Hook useMemo has unnecessary dependencies: 'ownedServicesByTeam' and 'teamsByPerson'…

✖ 1 problem (0 errors, 1 warning)

 NX   Successfully ran target lint for project fe-01
```

The warning is pre-existing and is on a `useMemo` this change does not touch.
Two **errors** were introduced and fixed on the way, both in the new e2e file:
`@typescript-eslint/no-unnecessary-condition` on `pinned === null`, because
TypeScript narrows a `const` initialised to `null` to exactly `null` and the
guard then read as dead code. The pinned figure comes from a function with a
declared `number | null` return now, so the guard is real again — and the lint
that would have called it dead is believable.

### `bunx nx run fe-01:typecheck`

```
> bunx tsc --build --force apps/fe-01/tsconfig.app.json
> bunx tsc --build --force apps/fe-01/tsconfig.e2e.json

 NX   Successfully ran target typecheck for project fe-01
```

## Failure proofs (R5)

Every fault below was injected into the production file, the named test run, and
the message copied out of that run. Dates are 2026-08-29.

| Check                                       | Fault injected                                                            | Test that saw it fail                                                                                                                                                                                                                                | Watched                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| an icon takes the control's colour          | `ICON.stroke` → `'#111827'`                                               | `every icon inherits the colour and the size…`                                                                                                                                                                                                       | `KeyboardIcon: expected '#111827' to be 'currentColor'`                               |
| an icon takes the control's size            | `ICON.width`/`height` → `16`                                              | `every icon inherits the colour and the size…`                                                                                                                                                                                                       | `KeyboardIcon: expected '16' to be '1em'`                                             |
| an icon names nothing of its own            | `<title>Keyboard</title>` added to `KeyboardIcon`                         | `every icon is hidden…and says nothing of its own`                                                                                                                                                                                                   | `KeyboardIcon: expected 'Keyboard' to be ''`                                          |
| **an icon is out of the a11y tree**         | `aria-hidden` removed from `ICON`                                         | the accessible-name oracle `tasks.md` asked for                                                                                                                                                                                                      | **PASSED — see "Vacuous negatives" below**                                            |
| the old freeze buttons are gone (table)     | `Unfreeze all` restored as a second `<Button>` on the bar                 | `one control offers both writes`                                                                                                                                                                                                                     | `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`              |
| the old freeze buttons are gone (phone)     | the same                                                                  | `offers freezing once, as a menu that opens on the sheet`                                                                                                                                                                                            | `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`              |
| the accessible names held                   | `aria-label="Collapse all"` dropped from the icon button                  | `the controls are found by the names they always had`                                                                                                                                                                                                | `Unable to find role="button" and name "Collapse all"`                                |
| …and the old suite is the real proof        | the same                                                                  | `the expansion controls stand down while a search is on`, `collapses every branch and opens them all again`, `remembers each project separately`, `stands the expansion controls down while a facet is on with nothing typed`, and 2 in `plan-cards` | `Unable to find an accessible element with the role "button" and name "Collapse all"` |
| the cheat sheet glyph is gone               | `⌨` put back beside `<KeyboardIcon />`                                    | `the cheat sheet control carries a drawn icon`                                                                                                                                                                                                       | `expected '⌨' to be ''`                                                               |
| the menu joins the inert-while-open set     | `usePageShortcutsSuspended(open)` → `(false)` in `MenuControl`            | `⌘+Z is inert while the freeze menu is open…`                                                                                                                                                                                                        | `expected [ 'undo' ] to deeply equal []`                                              |
| the re-shaped phase test still sees its bug | `sameRoles(…)` → `false` at its call site                                 | `rebuilds nothing when the phases came back the same`                                                                                                                                                                                                | `expected <body><div>…(1)</div></body> to be <input …(6)></input>`                    |
| **a modified Enter takes nothing**          | `MenuControl`'s item `preventDefault` moved back below the modifier guard | `e2e/keyboard.spec.ts`, in Chromium                                                                                                                                                                                                                  | **NOT WATCHED — no browser. See "Skipped"**                                           |
| **the bar got narrower**                    | the words restored on the face of the two icon buttons                    | `the folded toolbar fits its budget`                                                                                                                                                                                                                 | **NOT WATCHED — no browser, and no before-figure to fail against**                    |

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

## Skipped or unavailable checks

1. **The whole Playwright gate.** Not run. Ports 3100/3200/4200 were held by a
   dev server and `reuseExistingServer: !isCi` would have measured that server's
   checkout rather than this one — `LLM_README.md`'s landmine and `AGENTS.md`'s
   R5 entry for `gantt-calendar-axis`. Two specs were **written and never
   executed**: `a modified Enter or Space on a freeze menu item takes nothing`
   (`e2e/keyboard.spec.ts`) and `the folded toolbar fits its budget`
   (`e2e/layout.spec.ts`). Six existing `layout.spec.ts` cases were re-pointed
   through `freezeNumbering(page)` and are likewise unexecuted.
2. **The browser negative for the item guard is the one this change most needs.**
   jsdom performs no default action, so it can see the modifier guard deleted
   and can never see it left half-done — which is exactly how R5 #14 shipped.
   The guard itself is **not new code**: the freeze menu reuses
   `MenuControl`'s single item handler rather than a second copy, so the
   existing browser test `a modified Enter or Space on a menu item takes
nothing` already covers the code path through the row's ⋯. What the new spec
   adds is the second **caller**, and it has not been run.
3. **`bin/h2puni-gate.sh`** — not run; out of scope for this worktree, and it
   takes the host-wide lock.
4. **The width figure** — see "Measurements". The test is `test.fixme` with the
   reason in its skip message, so every run says it is pending rather than
   reporting a pass.
5. **`bunx nx run fe-01:test` is red on two pre-existing timezone cases** in
   `plan-mermaid.test.ts`, shown failing identically with this change stashed.

## Domain terms

No term resolved or moved. `Freeze`, `Frozen number` and `Expansion` are already
in `CONTEXT.md` and this change alters none of them — only where a reader
reaches the two writes. `Actions menu` still describes a row's ⋯; the shared
mechanism is documented on `MenuControl` in `actions-menu.tsx`, where R3 puts
it.
