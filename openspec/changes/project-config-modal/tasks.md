<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [ ] 0.1 **After `steps-not-phases`**, so the section is called `Steps` once rather than renamed twice. Runnable before it at the cost of a follow-up rename.

## 1. The three dialogs become three panels

- [ ] 1.1 `TeamsPanel` extracted from `teams-dialog.tsx`: the `Modal` shell and its trigger deleted, the body exported with its existing props plus `onDirtyChange` — test: `teams-panel.test.tsx`, the existing suite re-pointed at the panel, green unchanged in intent.
- [ ] 1.2 `PrioritiesPanel` extracted the same way — test: `priorities-panel.test.tsx`, existing suite green.
- [ ] 1.3 `StepsPanel` extracted the same way, its removal confirmation and refusals intact — test: `steps-panel.test.tsx`, existing suite green.

## 2. The container

- [ ] 2.1 `ProjectSettingsModal`: one `Modal`, `Project settings` title, a `tablist` with arrow-key movement, three `tabpanel`s of which the inactive ones are `hidden` and **mounted** — test: `project-settings-modal.test.tsx` `every section is reachable from the tab list`, `a half-typed value survives a look at another section`; negative: inactive panels unmounted instead of hidden, watched failing on the surviving-value case.
- [ ] 2.2 The dirty set: panels report `onDirtyChange`; Escape/✕/outside-click refuse while it is non-empty and switch to the first dirty section — test: `an in-flight write holds the modal open and is shown`, `a clean modal closes from any section`; negative: a panel wired to report `false` while holding an in-flight write, watched letting Escape close over it.
- [ ] 2.3 `wbs.projectSettingsSection.<projectId>` read as a claim: unknown or non-string dropped, first section shown — test: `the modal reopens where it was left`, `an unrecognised remembered section is dropped`; negative: the shape check deleted, watched failing on a stored `7` selecting nothing.

## 3. The toolbar

- [ ] 3.1 The three triggers removed and one `Project settings` control added, wide bar and phone sheet — test: `wbs-table.test.tsx` `one control opens every project setting`; negative: one old trigger left mounted, watched failing on the "no separate control" assertion.
- [ ] 3.2 The control carries no `data-takes-the-focus`, and the sheet's close restores focus to it — test: `plan-cards.test.tsx` (or the sheet's suite) `closing project settings puts the focus back on its trigger`.

## 4. Width, in a browser

- [ ] 4.1 `e2e/layout.spec.ts`: the folded toolbar at 1280 is no wider than before, with the pre-change figure pinned as a number — test: `the toolbar keeps its 1280 budget with one settings control`; negative: two of the old triggers restored beside the new control, watched failing on the pinned figure. Run `CI=1` on shifted ports, never the shared dev server.

## 5. Gate

- [ ] 5.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, `CI=1` Playwright. A change that edits a shared modal path runs the **whole** browser gate, not a filtered run (`AGENTS.md`, `linked-row-hover`).
