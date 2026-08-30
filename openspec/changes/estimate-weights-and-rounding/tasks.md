<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The arithmetic, in `@wbs/domain`

- [ ] 1.1 `PertWeights` (an arktype triple of non-negative finite numbers that
      sum above zero), `DEFAULT_PERT_WEIGHTS` = 1/4/1, `ESTIMATE_ROUNDINGS` /
      `isEstimateRounding`, and `EstimateRule` — test: `estimate.test.ts`
      `weighs the three points by the project's own coefficients`, `divides by
the sum of the weights rather than by six`, and the refusals of a
      negative, an infinite and an all-zero triple.
- [ ] 1.2 `expectedDays(estimate, weights)` divides by the weights' sum;
      `finalDays(estimate, rule)` combines by the method and **then** rounds —
      test: `rounds one step's figure by the project's rounding`, one case per
      rounding, plus `rounds whatever the method picked` for `realistic`.
- [ ] 1.3 The drift snap runs before the rounding — test: `does not mint a day
out of a division's leftover bits` with `0.4/1.1/1.2` under `ceil`;
      **negative**: the `snapWorkdays` call deleted, watched failing.

## 2. The columns

- [ ] 2.1 `20260830130000_add_estimate_weights_and_rounding/migration.sql` adds
      the three REAL weights (1/4/1) and `estimate_rounding` TEXT (`ceil`), with
      a `down.sql` beside it; `schema.ts` grows the same four with their JSDoc —
      test: `migrate.test.ts`'s existing forward/rollback pair, and
      `project.test.ts` `a project the migration reached plans 1/4/1 and ceil`.

## 3. The boundary

- [ ] 3.1 `toProject` reads the four columns as a `PertWeights` and an
      `EstimateRounding` and **throws** on either being unreadable — test:
      `project.test.ts` `refuses a stored rounding it does not know` and
      `refuses stored weights that cannot average a triple`; **negative**: the
      two guards replaced by casts, watched failing.
- [ ] 3.2 `ProjectPatch` carries both; `ProjectRepository.update` writes the
      three weight columns from one object as `solutionRef` does, and the empty
      patch still reads instead of emitting `SET` with nothing — test:
      `project.test.ts` `sets the weights and the rounding, and moves the
revision`.
- [ ] 3.3 `ProjectService.update` refuses `bad_pert_weights`; the controller
      answers 422 and its body schema takes the two new fields — test:
      `project.controller.test.ts` `refuses weights that cannot average` for
      three zeroes and for `1e999`, asserting the stored triple is untouched;
      **negative**: the service check deleted, watched failing.

## 4. The plan read

- [ ] 4.1 `rollUpFinals` in `roll-up.ts` folds each leaf's per-step **rounded**
      figure through `foldByStep` — test: `roll-up.test.ts` `a parent totals
what its children were charged, not what they said`.
- [ ] 4.2 `tree` builds one `EstimateRule` and hands it to both `slicesOf` and
      the finals; `finalDays`/`finalTotal` come from `rollUpFinals`, and the
      payload carries `pertWeights` and `estimateRounding` — test:
      `work-item.service.test.ts` `rounds each step before summing them`,
      `a parent's total is the sum of its descendants' charged days`, and
      `plans by the weights the project set`; **negative**: the per-step round
      moved to the total, watched failing.
- [ ] 4.3 The schedule gives a slice the same rounded number — test:
      `work-item.service.test.ts` `the days the chart draws are the days the
table shows`.

## 5. The document and the client

- [ ] 5.1 `bun apps/be-01/src/openapi/emit-openapi-cli.ts` regenerates
      `openapi.json` — test: `openapi-document.test.ts`.
- [ ] 5.2 `wbs-api.ts` carries `PertWeightsView`, `EstimateRoundingView`, both
      fields on the tree read, and `setEstimateArithmetic` — test:
      `wbs-api.test.ts` `patches the weights and the rounding in one request`.

## 6. Documentation

- [ ] 6.1 `CONTEXT.md` gains **PERT weights** and **Estimate rounding**, and
      **Final days** is rewritten to say rounded-then-summed;
      `docs/adr/0011-final-days-are-whole-days-rounded-per-step.md` records the
      decision; `LLM_README.md`'s landmine list is left alone (nothing here is
      one).

## 7. Gate

- [ ] 7.1 `bunx nx run-many -t test lint typecheck build` for be-01, fe-01 and
      the libs, plus `bunx openspec validate --all --json`.

## 8. The surface — BLOCKED, not implemented here

- [ ] 8.1 An `Estimating` section in `ProjectSettingsModal`: the three weight
      boxes (shown under `pert` alone) and the three roundings as radios,
      written through `setEstimateArithmetic` and re-read like every other
      section. It needs one block of props passed from `wbs-table.tsx`, which
      this change was forbidden to edit (another session held it open all
      evening). `verify.md` carries the exact wiring.
