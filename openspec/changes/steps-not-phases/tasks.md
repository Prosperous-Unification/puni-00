<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.

A rename has no new behaviour to test. Its gate is that the existing suite
passes unchanged in intent, and its R5 obligation is the one check it does add:
that ARIA `role` was excluded. See design D1.
-->

## 1. The identifier list, before any edit

- [x] 1.1 Write `identifiers.txt` beside this file: every distinct identifier matching `[A-Za-z]*[Rr]ole[A-Za-z]*` in `libs/`, `apps/be-01/src`, `apps/fe-01/src`, `apps/mcp-01/src`, each marked `rename` or `aria`. The ARIA set (`role=`, `getByRole`, `ByRole`, `aria-*`) is enumerated explicitly, not matched by rule. Reviewed as a list before slice 2 starts.
- [x] 1.2 Record the pre-rename test-case count per project (`bun nx test <app> -- --reporter`) in `verify.md`. Slice 5 asserts it is unchanged.

## 2. `libs/domain` and `CONTEXT.md`

- [ ] 2.1 `libs/domain` identifiers renamed from the list; `CONTEXT.md`'s six entries edited per design D4 — **Role**→**Step**, **Role order**→**Step order**, **Role usage**→**Step usage**, **Assumed assignee** reworded, **Slice** and **Step order** `_Avoid_` lines gaining `role`. Entries stay in their existing grouped position.
- [ ] 2.2 `openspec/changes/*/` are **not** rewritten: an archived change records what was decided in the words of its day. `CONTEXT.md` is the live vocabulary and is the only doc renamed.

## 3. be-01: identifiers, routes, payloads, openapi

- [ ] 3.1 Schema: `role` → `step` in TS, physical `sqliteTable('role', …)` and `text('role_id')` kept, with the boundary JSDoc from design D2 — test: `repository/schema.test.ts` (or the nearest existing) `the step table's physical name is still role`; this is a documentation assertion and is marked as such.
- [ ] 3.2 Every be-01 identifier from the list renamed; `role.controller.ts` → `step.controller.ts`; routes `/:id/roles` → `/:id/steps`, `/:id/roles/:roleId` → `/:id/steps/:stepId` — test: `step.controller.test.ts` `serves a project's steps`, `refuses the old roles route as unknown`; negative: the old route left mounted alongside, watched failing on the 404 assertion.
- [ ] 3.3 Payload fields `roleId` → `stepId`, `roles` → `steps` across plan reads, commands, undo/redo and the event log — test: existing payload-shape tests renamed; one new `no payload field is named roleId` walking the plan response's keys; negative: one `roleId` left in the estimate shape, watched failing.
- [ ] 3.4 `bun apps/be-01/src/openapi/emit-openapi-cli.ts` regenerated; `openapi.json` committed in the same commit as the routes.

## 4. mcp-01 and fe-01

- [ ] 4.1 mcp-01's tools re-derived from the new `openapi.json`; `apps/mcp-01/README.md`'s tool list regenerated — test: mcp-01's existing tool-count/name test updated to the `steps` spellings; negative: the README left at the old list, watched failing on the name comparison.
- [ ] 4.2 fe-01 identifiers renamed from the list; `phases-dialog.tsx` → `steps-dialog.tsx`, `PhasesDialog` → `StepsDialog`, `facetPhases` → `facetSteps`, `doesEveryPhase` → `doesEveryStep`, `usageSentence`'s wording — test: `steps-dialog.test.tsx` `the dialog is called Steps`, `the removal sentence says step`.
- [ ] 4.3 Every user-visible string carrying `Phase`/`Role` swept: dialog, cheat sheet, hover cards, column headers, export headers, toasts, refusals — test: `wbs-table.test.tsx` `no rendered string says Phase or Role`, walking the mounted plan's text; negative: one label left as `Phases`, watched failing.

## 5. The rename changed nothing

- [ ] 5.1 The test-case count from 1.2 is equal after the rename; any case whose body changed beyond identifier substitution is listed in `verify.md` with why — this is the "no behaviour change" claim and it is evidence or it is nothing.
- [ ] 5.2 **The ARIA exclusion's negative**: `role="combobox"` on the project picker renamed to `step="combobox"` in a scratch commit, watched taking `project-page.test.tsx`'s `getByRole('combobox')` cases red; reverted. Proof the exclusion in 1.1 is doing work. (R5: a rename that silently ate the attribute would pass a suite that never looked.)
- [ ] 5.3 A schedule identity check: a captured plan fixture scheduled before and after, dates compared field by field — test: `schedule-identity.test.ts`'s existing oracle, unchanged in intent.

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, `CI=1` Playwright on shifted ports. `nx typecheck` runs `tsc --build --force` and is the rename's real compiler — a missed identifier is a type error, not a runtime surprise.
