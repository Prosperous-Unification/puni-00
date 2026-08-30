<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [ ] 0.1 **After `steps-not-phases`**, so the section is called `Steps` once rather than renamed twice. Runnable before it at the cost of a follow-up rename. **Not honoured, by agreement with that change's owner (2026-08-30):** `steps-not-phases` had seven conflicts against `main` and no honest ETA, so this was built against `phases-dialog.tsx` on `main` and the section is called `Phases`; the mechanical rename lands inside that change's own sweep, which already covers every `Phases`→`Steps` string. Its `no rendered string says Phase or Role` test will catch the tab label. See `verify.md`, Ordering.

## 1. The three dialogs become three panels

- [x] 1.1 `TeamsPanel` extracted from `teams-dialog.tsx`: the `Modal` shell and its trigger deleted, the body exported with its existing props plus `onDirtyChange` — test: `teams-panel.test.tsx`, the existing suite re-pointed at the panel, green unchanged in intent.
- [x] 1.2 `PrioritiesPanel` extracted the same way — test: `priorities-panel.test.tsx`, existing suite green.
- [x] 1.3 `PhasesPanel` (the `StepsPanel` of the plan, named for what `main` calls it — see 0.1) extracted the same way, its removal confirmation and refusals intact — test: `steps-panel.test.tsx`, existing suite green.

## 2. The container

- [x] 2.1 `ProjectSettingsModal`: one `Modal`, `Project settings` title, a `tablist` with arrow-key movement, three `tabpanel`s of which the inactive ones are `hidden` and **mounted** — test: `project-settings-modal.test.tsx` `every section is reachable from the tab list`, `a half-typed value survives a look at another section`; negative: inactive panels unmounted instead of hidden, watched failing on the surviving-value case.
- [x] 2.2 The dirty set: panels report `onDirtyChange`; Escape/✕/outside-click refuse while it is non-empty and switch to the first dirty section — test: `an in-flight write holds the modal open and is shown`, `a clean modal closes from any section`; negative: a panel wired to report `false` while holding an in-flight write, watched letting Escape close over it.
- [x] 2.3 `wbs.projectSettingsSection.<projectId>` read as a claim: unknown or non-string dropped, first section shown — test: `the modal reopens where it was left`, `an unrecognised remembered section is dropped`; negative: the shape check deleted, watched failing on a stored `7` selecting nothing.

## 3. The toolbar

- [x] 3.1 The three triggers removed and one `Project settings` control added, wide bar and phone sheet — test: `wbs-table.test.tsx` `one control opens every project setting`; negative: one old trigger left mounted, watched failing on the "no separate control" assertion.
- [x] 3.2 The control carries no `data-takes-the-focus`, and the sheet's close restores focus to it — test: `plan-cards.test.tsx` `closing project settings puts the focus back on its trigger`. **The attribute is a description, not a guard**: injecting it was watched **passing**, because the sheet reads it only off a control that closes the sheet and a trigger with `aria-haspopup` never does. The negative that is real is the `ModalTrigger` swapped for a plain `Button`, watched failing on `expected <body …> to be <button …>`. `verify.md` has both.

## 4. Width, in a browser

- [ ] 4.1 `e2e/layout.spec.ts`: the folded toolbar at 1280 is no wider than before, with the pre-change figure pinned as a number — test: `the toolbar keeps its 1280 budget with one settings control`; negative: two of the old triggers restored beside the new control, watched failing on the pinned figure. Run `CI=1` on shifted ports, never the shared dev server.

## 5. Gate

- [ ] 5.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, `CI=1` Playwright. A change that edits a shared modal path runs the **whole** browser gate, not a filtered run (`AGENTS.md`, `linked-row-hover`).
