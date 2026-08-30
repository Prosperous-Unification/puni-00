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
- [x] 3.3 **The browser negative.** `e2e/keyboard.spec.ts`: freeze menu open on `Unfreeze all` with frozen rows, Shift+Enter, assert no unfreeze request and no row changed — negative: the item guard's `preventDefault` moved back below the modifier guard, watched failing in Chromium on `after Shift+Enter · Expected: 2 · Received: 0`, both locks gone. jsdom performs no default action and **cannot** be this test's oracle (`AGENTS.md`, R5 #14/#15). **Executed 2026-08-30** on `E2E_PORT_SHIFT=800` under the heavy-work lock, and re-watched after each of the five merges of `main` this branch took. The `ControlOrMeta+Enter` ahead of it in the same loop passed with the fault in — Chromium fires a button's own click from Shift+Enter and not from Cmd+Enter — which is why the loop tries all three.

## 4. The phone sheet

- [x] 4.1 The sheet lists `Freeze #` as one entry opening the same menu, and the icon buttons by their words — test: `plan-cards.test.tsx` `offers freezing once, as a menu that opens on the sheet`; negative: both old entries left, watched failing on `expected [ 'Freeze #', 'Unfreeze all' ] to deeply equal [ 'Freeze #' ]`.

## 5. Width, measured

- [x] 5.1 Pin the folded toolbar's width at 1280 as a number in `e2e/layout.spec.ts` — test: `the folded toolbar fits its budget`, no longer `fixme`; negative: `Expand all`'s and `Collapse all`'s text labels restored, watched failing on `the toolbar asks for more room than its budget · Expected: <= 1600 · Received: 1658.828125`. **Three corrections, all recorded in `verify.md`.** The first two were already there: `scrollWidth` on a `flex-wrap` bar cannot fail and is demoted to a stated precondition, and the measurement is `asked` — the sum of the controls and their gaps — plus `lines`, the rows the bar wraps onto. The third was found doing the work: **pinning the pre-change figure would have been the vacuous check it was written to avoid**, because the fault restores two labels while the pre-change bar also carried two freeze buttons, so the fault lands _under_ that figure and passes. The pin is the shipped bar's own budget instead — 1552.734375 measured, 1600 pinned, the fault 106.09px above it. Two consecutive quiet readings gave that figure to the last digit, so it is pinnable on this machine rather than a number that held once.

## 6. Gate

- [x] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, and the **whole** `CI=1` Playwright gate on shifted ports were all run on 2026-08-30 and are quoted in `verify.md` with their real output. `openspec` is 91/91. The browser gate is 233 passed / 3 failed / 1 skipped of 237 planned — reconciled, so a whole suite rather than a fragment. None of the three is reachable from this branch's diff: two are the documented date-segment pair, and `plan-surface.spec.ts:253` is a stale test the Gantt dock left on `main`, which another session owns. The repo gate's `format:check`, and every `test`, `lint`, `typecheck` and `build` target for the three apps and the libs, pass; three `tools/*` test targets fail on macOS host tooling and are untouched by this change's diff.
