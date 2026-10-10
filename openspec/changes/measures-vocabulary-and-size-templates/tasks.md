## 0. Spec

- [x] 0.1 Intent, delta specs, design and ADR 0044; OpenSpec validation green (020.11,
      2026-10-11). Glossary entries are task 0.2. Depends on `estimate-units` slices 1–4 (the
      unit on the step and on a template row).
- [ ] 0.2 Apply glossary entries (Metric, Token estimate, Token fact, Hours fact rewritten;
      Points estimate, Size template, Measure coverage) to `CONTEXT.md` verbatim from
      `puni-plan/batch-10/interviews/glossary-delta.md`, in the first green commit of slice 1.

## 1. Vocabulary and coverage fold in `@wbs/domain` and `@wbs/core`

- [ ] 1.1 Red: `stored-vocabularies.test.ts` "admits four metrics and refuses a fifth";
      `roll-up.test.ts` "sums points like tokens", "coverage counts recorded leaves per metric"
      (3 of 5; a leaf is 1 of 1; a metric nobody recorded is absent), "coverage never mixes
      metrics". Files: `libs/wbs/domain/domain/src/stored-vocabularies.ts`,
      `libs/wbs/application/core/src/service/roll-up.ts`.
- [ ] 1.2 Green: `MEASURE_METRICS` widened, JSDoc with the token definition, `measureCoverage`.
- [ ] 1.3 Negatives: `isMeasureMetric` reduced to `typeof === 'string'` → "refuses a fifth";
      the metric filter dropped in `measureCoverage` → "never mixes metrics".

## 2. Storage

- [ ] 2.1 Red: `libs/wbs/adapters/store-sqlite/src/points-and-templates-migration.db.test.ts`
      (apply; `step_points` refuses `-1` and `2.5` through its CHECK; `size_template` refuses a
      duplicate name in one project; rollback drops the three tables; re-apply);
      `step-measure.db.test.ts` "routes points_estimate to step_points and tokens to
      step_measure", "clears each in its own table"; `size-template.db.test.ts` CRUD, cascade
      on step delete; every migration-enumerating db test lists the new folder.
- [ ] 2.2 Green: stamp allocated now, written into `design.md`;
      `drizzle/<stamp>_add_step_points_and_size_templates/{migration,down}.sql`; `schema.ts`
      tables; `MeasureRepository` routing; `SizeTemplateRepository`; migration lint exit 0.
- [ ] 2.3 Negatives: the routing branch removed (points written to `step_measure`) → the
      sqlite `CHECK` throws in "routes points_estimate…"; the `points >= 0` CHECK dropped →
      "refuses -1".

## 3. Commands

- [ ] 3.1 Red: `work-item.resource.test.ts` mounted: `setMeasure points_estimate 5` stored and
      rolled up; `2.5` and `-1` → `422 points_not_integer` at the index with earlier commands
      rolled back; `applySizeTemplate` writes estimate and token estimate as one entry; one
      undo restores both prior rows; the three refusals `unknown_template`,
      `template_step_unset` and `template_unit_mismatch`; the history sentence;
      `plan-command-shapes.test.ts` kind count moves by one; `document-from-shapes.test.ts` the derived tool.
- [ ] 3.2 Green: `definitions.ts` `applySizeTemplate`; `command-normalizers.ts` expansion
      inside the transaction; `compensating.ts` inverses; `refusal.ts` codes; MCP document.
- [ ] 3.3 Negatives: the unit comparison removed → the mismatch case answers `200`; the
      integer check removed → `2.5` answers `200`; the expansion journalled as one forward
      command without the measure inverse → the one-undo case leaves the token estimate.

## 4. Template routes and seeding

- [ ] 4.1 Red: `apps/wbs/be-01/src/controller/size-template.controller.db.test.ts` (list, create,
      patch, delete; `409 name_taken`; a row for an unknown step `404 unknown_step`; viewer
      refused; the four MCP tools derive); `project.controller.db.test.ts` "a new project holds
      S, M, L, XL with no rows"; an existing project holds none.
- [ ] 4.2 Green: `size-template-shapes.ts`, module, routes, project create seeding.
- [ ] 4.3 Negatives: the unique index dropped → `name_taken` answers `201`; seeding removed →
      the create test.

## 5. Reads, documents and saved plans

- [ ] 5.1 Red: `work-item.resource.test.ts` "reads measureCoverage per metric on parents";
      `plan-document.resource.test.ts` (round trip of points and templates; version 6 imports
      without them; non-integer point, unknown step code and wrong-unit row each
      `invalid_body`); `normalise-plan-input.test.ts` (previous schema upgrades with no points);
      `diff-plans.test.ts` (points under `measures`); spreadsheet export points column.
- [ ] 5.2 Green: versions allocated now, written into `design.md`; `measureCoverage` on the
      wire; export and import converters; `PLAN_INPUT_UPGRADES` entry.
- [ ] 5.3 Negatives: each import check disabled → its case answers `200`; coverage omitted from
      the read → the read test.

## 6. fe-01

- [ ] 6.1 Red: `hover-card.test.tsx` (`tokens <sum> · 3 of 5 leaves`; no `of` at full
      coverage; Days column unchanged); `folded-step-card.test.tsx` (Points box writes
      `setMeasure`; Size picker lists templates, disables `not set for Dev`, applies one);
      `project-settings-modal.test.tsx` Sizes section (add, edit a row in the step's unit,
      remove); `e2e/hover-cards.spec.ts` the coverage line in a browser.
- [ ] 6.2 Green: the card, the picker, the section; `wbs-api.ts` template client.
- [ ] 6.3 Negatives: the disabled filter removed → `M` offered for `Dev`; the `of` clause
      shown at full coverage → the hover-card test.

## 7. Data task — batch-1 token facts (wbs-dev)

- [ ] 7.1 Read the eight current `token_actual` values on wbs-dev and record them in
      `verify.md`; run one `postApiProjectsByIdCommands` batch of `setMeasure token_actual`
      from `puni-plan/wbs-agentic/batch-1-token-actuals.json`; record the batch's journal id
      and the eight new values; prove one undo restores the old values on a dev copy first.

## 8. Verify

- [ ] 8.1 Affected tests, migration lint, apply and rollback, `prettier --check`, `lint:fast`,
      `typecheck`, `openspec validate --all --json`, the host gate on the final sha; outputs
      and every proof row in `verify.md`.
