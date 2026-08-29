<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The card opens beside the list

- [x] 1.1 `ProjectOptionCard` takes the listbox's rect as well as the option's and places the card at `list.right` on the option's `top` — test: `project-page.test.tsx` `the open card leaves every option visible`, asserting the card's `left` is `>= list.right`; negative: the anchor put back to the option's own rect, watched failing on the overlap.
- [x] 1.2 The side flip: `list.right + cardWidth > viewport.width` places the card at `list.left - cardWidth`; neither side fitting suppresses the card — test: `project-page.test.tsx` `a narrow window flips the card to the left of the list`, `a window with room on neither side shows no card`; negative: the flip replaced by a clamp to the viewport, watched failing on the card's `right` exceeding `list.left`.
- [x] 1.3 Moving between options moves the card vertically only — test: `project-page.test.tsx` `moving down the list does not move the card sideways`; negative: the horizontal anchor recomputed per option from the option's own rect, watched failing on two different `left` values.

## 2. A pick leaves the picker at rest

- [x] 2.1 `choose` blurs the combobox after clearing the search; the box carries `readOnly` while closed and drops it on focus — test: `project-page.test.tsx` `choosing a project takes the focus off the picker`, `the picker still searches after a pick`, `choosing a project arms no rename`; negative: the `blur()` removed, watched failing on `document.activeElement` still being the combobox.
- [ ] 2.2 (written, NOT RUN — the ports were held; see `verify.md`) Chromium: a click on the closed picker places no caret — test: `e2e/project-picker.spec.ts` `clicking the closed picker does not put a caret in the project name`, asserting `selectionStart` is unreachable on a `readOnly` box and the box is not focused after the click; negative: `readOnly` removed, watched failing. **jsdom cannot see this** — a click's default action (focus and caret placement) is the browser's, R5 #14/#15's fault class.

## 3. Create arms the rename

- [x] 3.1 `create` re-arms the rename on the created project's id after `load()` resolves, with `draft` the placeholder name; the name field selects its whole value on mount — test: `project-page.test.tsx` `creating a project puts the caret in its name`, `the whole placeholder name is selected`; negative: the re-arm moved to before `await load()`, watched failing on a rename target the list cannot name.
- [x] 3.2 The pre-create `setRename(null)` is kept and proven: a draft armed on another project does not reach the new one — test: `project-page.test.tsx` `a draft armed for another project does not follow the create`; negative: the `setRename(null)` deleted, watched failing on the old draft appearing in the new project's field.
- [x] 3.3 Abandoning the new project's rename leaves it created — test: `project-page.test.tsx` `abandoning the new project's rename keeps the project`.

## 4. Gate

- [ ] 4.1 (partial: `fe-01:test`, `fe-01:lint`, `fe-01:typecheck`, `openspec validate` and `prettier --check` run and quoted in `verify.md`; the gate script and the browser run are NOT done) `bin/h2puni-gate.sh`, `openspec validate --all --json`, and `bun run e2e` on shifted ports with `CI=1` — never the shared dev server (`LLM_README.md` landmine).
