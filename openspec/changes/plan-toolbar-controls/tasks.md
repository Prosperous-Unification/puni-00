<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Drawn icons

- [x] 1.1 `toolbar-icons.tsx` exporting `KeyboardIcon`, `ExpandIcon`, `CollapseIcon`: inline SVG, `stroke="currentColor"`, `width="1em"`, `aria-hidden="true"`, `focusable="false"` — test: `toolbar-icons.test.tsx` `every icon is hidden from the accessibility tree`, `every icon inherits its colour`; negative: `aria-hidden` removed from one, watched failing on the control then having two accessible names. **Done, with one correction recorded in `verify.md`:** the `aria-hidden` negative was watched **passing** — an SVG with no `<title>` names nothing, so there is no second name to find, in jsdom or in a browser. The attribute is kept and its assertion labelled as an attribute assertion; the reachable half (`says nothing of its own`) has a real negative — a `<title>` added, `expected 'Keyboard' to be ''`.

## 2. Expand and collapse become icon buttons

- [x] 2.1 Both buttons become `size="square"` with their icon, `aria-label` and `title` carrying the words they showed — test: `wbs-table.test.tsx` `the controls are found by the names they always had`, and every existing `Expand all`/`Collapse all` case green **unchanged**; negative: `aria-label` dropped from `Collapse all`, watched taking the existing collapse cases red. That the old suite still passes is the proof the accessible name held.

## 3. `Freeze #`

- [x] 3.1 The two buttons replaced by one `Freeze #` menu control reusing `actions-menu.tsx`'s item-key handling; items `Freeze numbering` and `Unfreeze all`, both enabled while not `busy` — test: `wbs-table.test.tsx` `one control offers both writes`, plus the existing freeze/unfreeze write cases re-pointed through the menu; negative: one of the two old buttons left on the bar, watched failing on `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`. The reuse is a real extraction: `MenuControl` in `actions-menu.tsx` now holds the trigger, the popover and the item keyboard, and `ActionsMenu` is a thin wrapper over it.
- [x] 3.2 The menu joins `commandChordIn`'s inert-while-open set — test: `wbs-table.test.tsx` `⌘+Z is inert while the freeze menu is open, and works again once it closes`. For a **toolbar** menu that set is the page's own chords and nothing else: `onCommandKey` is wired to cells, a menu item is not one, and a test firing Ctrl+N at an item could not fail. Written down on `MenuControl` and in `verify.md`.
- [ ] 3.3 **The browser negative.** `e2e/keyboard.spec.ts`: freeze menu open on `Unfreeze all` with frozen rows, Shift+Enter, assert no unfreeze request and no row changed — negative: the item guard's `preventDefault` removed, watched failing in Chromium. jsdom performs no default action and **cannot** be this test's oracle (`AGENTS.md`, R5 #14/#15). **Written, not executed** — no browser here; ports 3100/3200/4200 were held. See `verify.md`, "Skipped".

## 4. The phone sheet

- [x] 4.1 The sheet lists `Freeze #` as one entry opening the same menu, and the icon buttons by their words — test: `plan-cards.test.tsx` `offers freezing once, as a menu that opens on the sheet`; negative: both old entries left, watched failing on `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`.

## 5. Width, measured

- [ ] 5.1 Record the folded toolbar's `scrollWidth` at 1280 **before** the change and pin it as a number in `e2e/layout.spec.ts` — test: `the folded toolbar fits its budget`; negative: `Expand all`'s and `Collapse all`'s text labels restored, watched failing on the pinned figure. **Not done: no browser.** The test is written, the figure is `null`, and the case is `test.fixme` with that reason in its skip message so every run says it is pending. Two corrections are recorded in `verify.md`: `scrollWidth` on a `flex-wrap` bar cannot fail and is demoted to a precondition; the measurement is the sum of the controls and their gaps, plus the number of rows the bar wraps onto.

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the **whole** `CI=1` Playwright gate on shifted ports. `fe-01`'s `test`, `lint` and `typecheck` were run and are quoted in `verify.md`; the other three were not.
