## 1. The plan document

- [ ] 1.1 The JSON export answers `document`, `settings`, `priorityBands`, `capacity`, `directory` beside everything it answered — test: `project.controller.db.test.ts` `the JSON export is a plan document`, asserting the new keys and that `project`, `workItems`, `steps`, `slices`, `assignedPeople` are deep-equal to the pre-change answer on the same fixture
- [ ] 1.2 `directory` holds only referenced entries, people with kind — test: same file, `a tag no row wears is not in the document`; negative: filter removed, watched failing on the unreferenced tag's name
- [ ] 1.3 `settings` and `project` agree on method, reach, weights, rounding, start date — test: `settings says what project says`
- [ ] 1.4 fe-01 `Download JSON` saves `planFileName(plan, 'json')` holding the fetched document — test: `wbs-table.test.tsx` `Download JSON saves the plan document`

## 2. The import, be-01

- [ ] 2.1 Document schema (TypeBox) and `parseDocument` refuse by path — tests: `import.controller.db.test.ts` `a malformed row is refused by path` (`rows[3].priority`), `an unknown version is refused` (`unsupported_version`); negative for each: the constraint deleted from the schema, watched accepting the document
- [ ] 2.2 `ImportService` resolves refs before the transaction: `dependsOn`, `parentId`, `stepId`, every directory id — tests: `import.service.test.ts` `a dangling dependency is unknown_ref at rows[12].dependsOn[0]`, `an estimate on an undeclared step is unknown_ref`; negative: resolution removed, watched failing on a FK error surfacing as 500 instead
- [ ] 2.3 Directory matching by trimmed name, creation of the absent inside the transaction — tests: `an existing tag is reused`, `a missing person is created with their kind`, `a refusal after a creation leaves no creation` (dangling dep + absent team); negative for the last: `transactions.begin()` removed, watched failing on the team existing after the refusal
- [ ] 2.4 Project, steps in order, bands, capacity created from `settings` — test: `a restored plan is the plan` on steps, bands, capacity
- [ ] 2.5 Rows through `SubtreeCopy` + `insertSubtree` with minted ids, labels and external refs after — test: `a restored plan is the plan` on rows, frozen number, not-before, dependency, actual, measure, assignee; `fresh ids`
- [ ] 2.6 Round trip: export → import → export equal modulo ids, stamps, `exportedAt`, solution ref — test: `import.service.db.test.ts` `round trip`; negative: one row field dropped from the copy (notes), watched failing on that field
- [ ] 2.7 Solution ref kept when free, left off when taken, answer says which — tests: `free slug`, `taken slug`; negative: the slug check removed, watched failing on `UNIQUE constraint failed: project_solution_slug` surfacing as 500
- [ ] 2.8 Route `POST /api/projects/import`, signed-in, `statusForRefusal` mapping; `openapi.json` regenerated; mcp-01's tool count test updated — test: `openapi-tools.test.ts` counts 23 and names `postApiProjectsImport`
- [ ] 2.9 Measure a 500-row import's lock hold and record it in `verify.md`

## 3. The import, fe-01

- [ ] 3.1 `ProjectApi.importPlan(document)` and the `Export / Import` summary text — test: `wbs-table.test.tsx` `the menu is Export / Import`
- [ ] 3.2 `Import JSON…` reads the picked file, posts it, opens the new project, pushes one info toast with the summary — test: `import lands` with a fake api that answers `{ projectId, rows: 40, created: { tags: ['urgent'] } }`, asserting the open call and the toast text
- [ ] 3.3 A refusal is an error toast naming row and reason; the page stays — test: `import refused`; negative: the open call left in the refusal path, watched failing on the fake's open count
- [ ] 3.4 Browser: `e2e/plan-import.spec.ts` exports a seeded plan, imports the file through the real file chooser, lands on the new plan, reads the toast; and a document with a dangling dependency shows the error toast and the project count is unchanged — negative: the `unknown_ref` refusal in be-01 bypassed, watched failing in the browser on the toast text

## 4. Words

- [ ] 4.1 `CONTEXT.md` terms landed (Plan document, Import, Plan export widened) and ADR 0013 linked from `ImportService`'s JSDoc — check: `openspec validate --all --json` green
- [ ] 4.2 `verify.md` with the failure-proof table and the gate's output
