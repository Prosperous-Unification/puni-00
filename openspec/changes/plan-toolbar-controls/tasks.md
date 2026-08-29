<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Drawn icons

- [ ] 1.1 `toolbar-icons.tsx` exporting `KeyboardIcon`, `ExpandIcon`, `CollapseIcon`: inline SVG, `stroke="currentColor"`, `width="1em"`, `aria-hidden="true"`, `focusable="false"` — test: `toolbar-icons.test.tsx` `every icon is hidden from the accessibility tree`, `every icon inherits its colour`; negative: `aria-hidden` removed from one, watched failing on the control then having two accessible names.

## 2. Expand and collapse become icon buttons

- [ ] 2.1 Both buttons become `size="square"` with their icon, `aria-label` and `title` carrying the words they showed — test: `wbs-table.test.tsx` `the controls are found by the names they always had`, and every existing `Expand all`/`Collapse all` case green **unchanged**; negative: `aria-label` dropped from `Collapse all`, watched taking the existing collapse cases red. That the old suite still passes is the proof the accessible name held.

## 3. `Freeze #`

- [ ] 3.1 The two buttons replaced by one `Freeze #` menu control reusing `actions-menu.tsx`'s item-key handling; items `Freeze numbering` and `Unfreeze all`, both enabled while not `busy` — test: `wbs-table.test.tsx` `one control offers both writes`, plus the existing freeze/unfreeze write cases re-pointed through the menu; negative: one of the two old buttons left on the bar, watched failing on `exactly one control SHALL concern freezing`.
- [ ] 3.2 The menu joins `commandChordIn`'s inert-while-open set — test: `wbs-table.test.tsx` `a chord is inert while the freeze menu is open`.
- [ ] 3.3 **The browser negative.** `e2e/keyboard.spec.ts`: freeze menu open on `Unfreeze all` with frozen rows, Shift+Enter, assert no unfreeze request and no row changed — negative: the item guard's `preventDefault` removed, watched failing in Chromium. jsdom performs no default action and **cannot** be this test's oracle (`AGENTS.md`, R5 #14/#15).

## 4. The phone sheet

- [ ] 4.1 The sheet lists `Freeze #` as one entry opening the same menu, and the icon buttons by their words — test: `plan-cards.test.tsx` `the sheet offers freezing once`; negative: both old entries left, watched failing.

## 5. Width, measured

- [ ] 5.1 Record the folded toolbar's `scrollWidth` at 1280 **before** the change and pin it as a number in `e2e/layout.spec.ts` — test: `the folded toolbar fits its budget`; negative: `Expand all`'s and `Collapse all`'s text labels restored, watched failing on the pinned figure. A "less than before" assertion without the pinned number is not this check (`AGENTS.md`, the gantt-calendar-axis vacuity).

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the **whole** `CI=1` Playwright gate on shifted ports.
