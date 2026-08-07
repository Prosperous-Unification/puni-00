## 1. One width table

- [x] 1.1 `table-frame.ts`: `COLUMN_WIDTHS` (a `Map`, not a `Record` — a
      `Record` types every miss as a `number` and the miss check as dead code,
      which lint refuses and which is the one check here that must not be
      dead), the three role-column widths by suffix, `UnknownColumnError`,
      `widthFor`, `tableWidth`, and `PINNED_COLUMNS` **derived** from
      `widthFor` rather than written out a second time.
      **Tests** (`table-frame.test.ts`, five, written first and watched failing
      on the missing exports): a width for every column the table renders; the
      pinned offsets are prefix sums of the same numbers; the total adds up;
      `CELL` carries `border-box` and `overflow: hidden`.
      **Negative test:** `widthFor('serviec')` and `widthFor('role-dev-realsitic')`
      throw — a typo carrying a dash must not fall through the suffix branch.
- [x] 1.2 `wbs-table.tsx`: `leafColumnIds` read from the table model, a
      `<colgroup>` rendered from it, `tableLayout: 'fixed'` and
      `width: tableWidth(leafColumnIds)`, and `CELL` spread into every `th` and
      `td` before the sticky and pinned styles.
      **Tests** (`wbs-table.test.tsx`, watched failing first): the colgroup
      declares every rendered column once **in order**; the table's width is
      its columns' total; every cell carries the chrome its declared width is
      measured with.

## 2. Every control the width of its cell

- [x] 2.1 The name and notes textareas, the folded estimate, the three point
      boxes, the dependency input, the earliest-start date and both
      `CreatablePicker` inputs: `width: 100%` and `box-sizing: border-box` in
      place of every `em` width and `size` attribute. The dependency cell's
      wrapper wraps its chips onto a second line rather than clipping them.
      **Test:** `lets no control in a cell assert a width of its own`, watched
      failing on the name textarea's `22em`.
- [x] 2.2 `overflow: hidden` on every cell as the backstop, with the columns
      holding a popover exempted from it — the clipper is the `<td>`, not the
      wrapper span inside it (`opensAPopover`).
      **Test:** `does not clip the cells whose popovers open over the rows`.
      **Negative test:** the `opensAPopover` spread removed from the `<td>`
      style — it failed on `expected 'hidden' to be 'visible'`. Watched.

## 3. Tab from every cell

- [x] 3.1 `onTabKey` beside `onArrowKey`, `focusCellAt` so all three arrival
      paths agree about where the caret lands, and `editableGrid` narrowed to
      `[data-cell]:not([readonly]):not([disabled])`.
      **Tests** (`wbs-table.test.tsx`, eight, seven watched failing first).
      **Negative tests, each watched:** `focusCellAt`'s element check removed
      (`InvalidStateError` out of a date cell); `:not([disabled])` dropped;
      `onTabKey` dropped from the notes chain; `focusAdjacentCell`'s
      `at + delta < 0` guard removed.
- [x] 3.2 `data-cell` on the dependency input, the earliest-start date, and
      both pickers through a new `gridCell` prop carrying the attribute and the
      handler together.
      **Negative tests, each watched:** `gridCell?.onTabKey(e)` dropped from
      `CreatablePicker`; the dependency input's Tab branch dropped.
- [x] 3.3 The Name cell untouched: caret-zero still indents and outdents.
      Existing Enter→Tab outlining tests pass unchanged.
- [x] 3.4 `keyboard-bindings.ts` says what Tab and Shift+Tab now do, and
      `PROVEN_BY` names the tests that prove it. The 1:1 cross-check is not
      weakened.
- [x] 3.5 **Fix, after review:** the arrow-key reroute could not fail on the
      `:not([readonly])` guard being removed — the whole suite passed with it
      stripped, so the claim that it proved the skip was wrong. Replaced by two
      assertions that do cross the read-only boxes, one with the arrows and one
      with Shift+Tab, both watched failing on the reviewer's fault.

## 4. A browser that watches the pixels

- [x] 4.1 `box-geometry.ts`: `EDGE_TOLERANCE`, `findOverlap` and `findOverrun`
      — the arithmetic the layout gate asserts with, extracted so it can be
      unit-tested without a browser.
      **Tests** (`box-geometry.test.ts`, thirteen, written first and watched
      failing on the missing module).
      **Negative tests, each watched:** the tolerance dropped from each
      function; the overlap walk changed to compare against the first box
      rather than the previous one; the right-edge branch of `findOverrun`
      replaced by `undefined`.
- [x] 4.2 `data-column` on every `th` and `td`, so a measured rectangle can
      name the column it belongs to.
      **Test:**
      `names every cell with the column it belongs to, in both halves of the table`.
      **Negative test:** the attribute dropped from the `td` — it failed on a
      row of `null`s. Watched.
- [x] 4.3 `playwright.config.ts`: chromium, a 1400x900 viewport, and a
      `webServer` per app — be-01 on `:3100/health`, gw-01 on `:3200/health`,
      Vite on `:4200` — each started from its own directory so it reads its own
      `.env`, be-01 pointed at a per-run `tmp/e2e-<ms>.db`, and
      `reuseExistingServer` off in CI. No retries.
- [x] 4.4 `e2e/layout.spec.ts`: seeds an account and a plan through the UI,
      then eight tests — the screenshot, heading-row adjacency, body-row
      adjacency, containment, the pinned offsets unscrolled and scrolled, the
      `elementFromPoint` probe either side of the pinned edge, and the Tab
      walk. **Not run: there is no browser on the machine this was written on.**
- [x] 4.5 The wiring: `bun add -d @playwright/test`; `tsconfig.e2e.json` and
      the reference to it; `fe-01:e2e`; `fe-01:lint` and `fe-01:typecheck`
      widened to cover the new files; the root `e2e` script; `test-results/`
      and `playwright-report/` gitignored.
- [ ] 4.6 **Prove the gate non-vacuous.** Three one-line faults are written out
      at the foot of `e2e/layout.spec.ts` with the test each must break. They
      cannot be run here. **Open until CI has watched all three**, and
      `verify.md` records them as PENDING.

## 5. Gate

- [x] 5.1 `.github/workflows/ci.yml`: a new `pixels` job, additive, bun pinned
      to `gate`'s exact version, `bunx playwright install --with-deps chromium`,
      `bun run e2e`, artifacts uploaded `if: always()`. `gate` untouched.
- [x] 5.2 `format:check --all`, the run-many gate, and `openspec validate`,
      recorded in `verify.md` with the fault table and with what could not be
      run here.
