## 0. Spec

- [x] 0.1 Intent, delta specs, design and ADR 0042; OpenSpec validation green (020.11,
      2026-10-11). Glossary entries are task 0.2, not applied by the packet-writing lane.
- [ ] 0.2 Apply glossary entries (Estimate, Charged estimate, Estimate rounding rewritten;
      Estimate unit, Workday minutes) to `CONTEXT.md` verbatim from
      `puni-plan/batch-10/interviews/glossary-delta.md`, in the first green commit of slice 1.

## 1. Vocabulary and charge in `@wbs/domain` (nothing stores a unit yet)

- [ ] 1.1 Red: `stored-vocabularies.test.ts` "admits exactly the two estimate units";
      `estimate.test.ts` "charges a minute step to the whole minute after its allowance"
      (`30/40/90`, `+10 %` → `52`), "never consults the project rounding for a minute step"
      (`floor`, `exact`, `ceil` give `52`), "places 240 minutes as half a workday exactly",
      "refuses a fractional minute point", "refuses a minute point above
      MAX_ESTIMATE_MINUTES", "renaming the unit-free arithmetic moves no workday figure".
      Files: `libs/wbs/domain/domain/src/{stored-vocabularies,estimate}.ts` and tests.
- [ ] 1.2 Green: `ESTIMATE_UNITS`, `isEstimateUnit`, `WORKDAY_MINUTES`, `MAX_ESTIMATE_MINUTES`,
      `minuteTrioProblem`, `combinedFigure`/`beforeRoundingFigure` (renamed), `chargedMinutes`,
      `chargedWorkdaysOf`; JSDoc on each naming ADR 0042.
- [ ] 1.3 Negatives, each watched red then restored with an adjacent `Proof:`: `Math.ceil`
      replaced by `Math.round` in `chargedMinutes` → "charges a minute step to the whole
      minute…"; `rule.rounding` consulted in `chargedMinutes` → "never consults…";
      `Number.isInteger` dropped from `minuteTrioProblem` → "refuses a fractional minute point";
      the maximum check dropped → "refuses a minute point above…".

## 2. Swap vocabulary and rollback CLI (before storage can hold minutes)

- [ ] 2.1 Red: `tools/tool-remote-scripts/src/swap.test.ts` "refuses an image that reads no
      minutes while minute steps are stored, and stops green", "passes an image without the
      units CLI over workday steps", "refuses a minute unit written after the first check once
      blue stops"; `lib/docker.test.ts` estimate-unit commands (present, absent, missing `src`,
      stored units before and after the column exists); `apps/wbs/be-01/src/migration-cli.db.test.ts` the rollback
      CLI's usage guard and its refusal on an unmigrated file (the round trip needs the column:
      slice 3).
- [ ] 2.2 Green: `ESTIMATE_UNITS_VOCABULARY` in `swap.ts`; `estimate-units-cli.ts` printing
      `ESTIMATE_UNITS`; `libs/wbs/adapters/store-sqlite/src/estimate-unit-rollback.ts`
      (`save`, `remove`, `restore`) and `apps/wbs/be-01/src/estimate-unit-rollback-cli.ts`;
      runbook anchor `#estimate-unit-rollback` in `docs/runbook-prod-deploy.md`.
- [ ] 2.3 Negatives: `ESTIMATE_UNITS_VOCABULARY` left out of `STORED_VOCABULARIES` → the three
      swap cases; the CLI's directory check replaced by an unconditional `['workdays']` → the
      missing-`src` docker case; the rollback CLI's usage guard bypassed → the usage case;
      `remove` leaving the estimate rows → the round-trip case reads minute trios as days.

## 3. Storage and migration

- [ ] 3.1 Red: `libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts`
      (apply; an old-writer three-column insert reads `workdays`; a `CHECK` refusal of
      `hours`; rollback refused over a `minutes` step naming the CLI; rollback and re-apply
      over workday steps); `step.db.test.ts` reads and writes the unit;
      `migration-cli.db.test.ts` "saves, removes and restores minute-unit steps through the
      rollback CLI" (two steps, four rows, verbatim); every migration-enumerating db test lists
      the new folder.
- [ ] 3.2 Green: stamp allocated now against `origin/main` and the integration queue, written
      into `design.md`; `apps/wbs/be-01/drizzle/<stamp>_add_step_estimate_unit/{migration,down}.sql`;
      `schema.ts` column; `StepRepository` reads and patches `estimateUnit`; migration lint
      (`bun run tools/tool-git-hooks/src/hooks/migration-lint.ts`) exit 0.
- [ ] 3.3 Negatives: the `down.sql` guard removed → "rollback refused over a minutes step";
      the `CHECK` dropped → "refuses hours".

## 4. Route and command boundary

- [ ] 4.1 Red: `apps/wbs/be-01/src/controller/step.controller.db.test.ts` (create with
      `minutes`; absent unit reads `workdays`; patch `hours` → `422 invalid_estimate_unit`;
      patch over three estimates → `409 estimates_present` `{ count: 3 }`; after clearing,
      the patch succeeds; the generated OpenAPI document carries the field);
      `work-item.resource.test.ts` mounted `setEstimate` on a `minutes` node (whole minutes
      stored; `1.5` → `422 minutes_not_integer` at its index, earlier commands rolled back;
      above-max → `422 minutes_above_max`); `plan-command-shapes.test.ts` kind count unchanged;
      `document-from-shapes.test.ts` tool descriptions name the unit.
- [ ] 4.2 Green: `step-shapes.ts` `estimateUnit?` on create and patch, `estimateUnit` on
      reads; `StepService.addWithin`/`patchUnitWithin` with the count in the same transaction;
      `command-normalizers.ts` `setEstimate` reading the step's unit; refusals in `refusal.ts`.
- [ ] 4.3 Negatives: the count check removed → the `409` case answers `200`; the unit read
      skipped in the normalizer (always `workdays`) → the `422 minutes_not_integer` case
      answers `200`; `isEstimateUnit` reduced to `typeof === 'string'` → `hours` answers `200`.

## 5. Read shape, roll-up and placement

- [ ] 5.1 Red: `roll-up.test.ts` "folds a minute step as its charged minutes over 480";
      `work-item.resource.test.ts` "reads charged minutes beside the workday figure";
      `schedule.test.ts` "a 240-minute slice lasts half a workday and its successor starts at
      0.5"; `build-solver-request.test.ts` "a 480-minute slice and a one-day slice send equal
      durationUnits"; `live-plan-identity.test.ts`, `fast-golden-corpus.test.ts`,
      `solver-quantum-golden-corpus.test.ts` and the request-hash tests unchanged and green.
- [ ] 5.2 Green: `rollUpFinals` over `chargedWorkdaysOf`; `charged` on the work-item read
      (`work-item-response.ts`); the schedule input adapter in `work-item.resource.ts`. Add
      one minute-step case to each golden corpus through the corpus writer; the corpus lint
      decides at this slice whether `SCHEDULER_CONTRACT_VERSION` moves, and `design.md`
      records the answer.
- [ ] 5.3 Negatives: `WORKDAY_MINUTES` read as `60` in the adapter → the half-day case;
      `charged` omitted from the read → the read test; a golden case edited by hand → the
      corpus test reddens (watched, then the writer rerun).

## 6. Plan document and saved plans

- [ ] 6.1 Red: `plan-document.resource.test.ts` (round trip keeps unit and minutes; version 6
      imports as `workdays`; missing unit, unknown unit and fractional minute each
      `invalid_body` at the field); `saved-plan/normalise-plan-input.test.ts` (previous-schema
      body upgrades with `workdays` and schedules identically; malformed body refused);
      `diff-plans.test.ts` (a unit change is reported under `steps`); spreadsheet export header.
- [ ] 6.2 Green: `PLAN_DOCUMENT_VERSION` and `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` allocated
      now, written into `design.md`; `[<previous>, withWorkdayUnits]` in `PLAN_INPUT_UPGRADES`;
      `CanonicalStep.estimateUnit`; export and import converters.
- [ ] 6.3 Negatives: the upgrade returning the body unchanged → the upgrade case; each import
      check disabled → its `invalid_body` case answers `200`.

## 7. fe-01

- [ ] 7.1 Red: `duration-words.test.ts` (`40 min`, `2 h 15 min`, `1 d`, `1.5 d`; a workday
      figure prints as the table and the chart printed it); `steps-panel.test.tsx` (unit control; disabled over
      estimates with `2 estimates` in its tool hint; an empty step changes unit; the create
      form sends an explicit unit); `plan-cells.test.tsx` (a minute cell refuses `1.5` with a
      worded problem before sending; the final figure prints through `showDuration`);
      `folded-step-card.test.tsx` and `gantt-detail.test.tsx` (same string; "placed on the
      working calendar" on a minute slice); `e2e/gantt.spec.ts` workday pixel assertions
      unchanged.
- [ ] 7.2 Green: `duration-words.ts` `showDuration`; steps section control; `estimate-draft.ts`
      `trioProblem` in minutes; `folded-step-card.tsx`, `gantt-detail.ts`, the spreadsheet
      export reading `charged`.
- [ ] 7.3 Negatives: the chart card formatting its own minutes → the agreement test; the
      disabled control removed → the steps-panel test; the integer check removed from the
      draft → the cell test.

## 8. Verify

- [ ] 8.1 Affected tests, migration lint, apply and rollback, `prettier --check`, `lint:fast`,
      `typecheck`, `openspec validate --all --json`, the host gate on the final sha; outputs
      and every proof row in `verify.md`.
