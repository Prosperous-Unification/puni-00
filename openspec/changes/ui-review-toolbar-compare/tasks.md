## 1. Comparison staleness (F-100)

- [x] 1.1 Failing Vitest cases in `saved-plans-panel.test.tsx`: a save, a delete and a collaborator rename leave no banner; a plan event or an unnamed frame raises it; two saved sides never go stale; a collaborator's delete of a side says so
- [x] 1.2 Failing Vitest case in `saved-plans.feature.test.ts`: `livePlanRevision` ignores `saved_plans_changed`
- [x] 1.3 Thread the event type through the shelf's subscription, add `livePlanRevision`, compare sides instead of row identity
- [x] 1.4 e2e in `toolbar-panels.spec.ts` over the real stream: save, delete, then an edit

## 2. Saved plan meta line (F-103)

- [x] 2.1 Failing Vitest case in `saved-plan-list.test.tsx` and e2e check at 1440
- [x] 2.2 Clause-wise wrapping with the whole sentence as `data-fact`

## 3. One Save rule (F-104)

- [x] 3.1 Failing Vitest cases in `plan-filter.test.tsx`: an empty name saves a view under its filter words; Enter saves
- [x] 3.2 Views' Save enabled whenever something is filtered; a form around the field

## 4. One-shot items close the Export / Import menu (F-106, F-127)

- [x] 4.1 Failing Vitest case in `plan-toolbar.test.tsx` and e2e in `import-with-ai.spec.ts`
- [x] 4.2 Failing Vitest case: every one-shot item, and a chosen file, closes the menu; Mermaid lanes does not (F-127)
- [x] 4.3 Close the `<details>` from the panel on a button click or a chosen file, focus its summary; hand the focus to the summary when the dialog closes; drop the owned-dialog exemption in `useClosedOnDismiss`

## 5. End group at 960 (F-099)

- [x] 5.1 Probe 880–1100 px with the menu open and closed (did not reproduce)
- [x] 5.2 Extend the end-group e2e with 960 × 600 and the menu open at 960 and 1024, with a watched fault

## 6. Review round 1 (PR #523)

- [x] 6.1 Failing composition test: a shelf stream that drops and resettles moves `livePlanRevision` and rereads the shelf
- [x] 6.2 `browserSavedPlanRoutes.subscribe` reports a resettle after a drop as a change of unknown type
- [x] 6.3 Failing Vitest case (F-140): Save twice under one derived name lists one view; a save under an existing name replaces it
