<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The arithmetic, in `@wbs/domain`

- [x] 1.1 `PertWeights` (an arktype triple of non-negative finite numbers that
      sum above zero), `DEFAULT_PERT_WEIGHTS` = 1/4/1, `ESTIMATE_ROUNDINGS` /
      `isEstimateRounding`, and `EstimateRule` — test: `estimate.test.ts`
      (`ESTIMATE_ROUNDINGS` grew a fourth value, `exact`, while slice 4 was
      being tested; `design.md` D7 and the ADR say why)
      `weighs the three points by the project's own coefficients`, `divides by
the sum of the weights rather than by six`, and the refusals of a
      negative, an infinite and an all-zero triple.
- [x] 1.2 `expectedDays(estimate, weights)` divides by the weights' sum;
      `finalDays(estimate, rule)` combines by the method and **then** rounds —
      test: `rounds one step's figure by the project's rounding`, one case per
      rounding, plus `rounds whatever the method picked` for `realistic`.
- [x] 1.3 The drift snap runs before the rounding — test: `does not mint a day
out of a division's leftover bits` with `0.4/1.1/1.2` under `ceil`;
      **negative**: the `snapWorkdays` call deleted, watched failing.

## 2. The columns

- [x] 2.1 `20260830130000_add_estimate_weights_and_rounding/migration.sql` adds
      the three REAL weights (1/4/1) and `estimate_rounding` TEXT (`ceil`), with
      a `down.sql` beside it; `schema.ts` grows the same four with their JSDoc —
      test: `migrate.test.ts`'s existing forward/rollback pair, and
      `project.test.ts` `a project the migration reached plans 1/4/1 and ceil`.

## 3. The boundary

- [x] 3.1 `toProject` reads the four columns as a `PertWeights` and an
      `EstimateRounding` and **throws** on either being unreadable — test:
      `project.test.ts` `refuses a stored rounding it does not know` and
      `refuses stored weights that cannot average a triple`; **negative**: the
      two guards replaced by casts, watched failing.
- [x] 3.2 `ProjectPatch` carries both; `ProjectRepository.update` writes the
      three weight columns from one object as `solutionRef` does, and the empty
      patch still reads instead of emitting `SET` with nothing — test:
      `project.test.ts` `sets the weights and the rounding, and moves the
revision`.
- [x] 3.3 `ProjectService.update` refuses `bad_pert_weights`; the controller
      answers 422 and its body schema takes the two new fields — test:
      `project.controller.test.ts` `refuses weights that cannot average` for
      three zeroes and for `1e999`, asserting the stored triple is untouched;
      **negative**: the service check deleted, watched failing.

## 4. The plan read

- [x] 4.1 `rollUpFinals` in `roll-up.ts` folds each leaf's per-step **rounded**
      figure through `foldByStep` — test: `roll-up.test.ts` `a parent totals
what its children were charged, not what they said`.
- [x] 4.2 `tree` builds one `EstimateRule` and hands it to both `slicesOf` and
      the finals; `finalDays`/`finalTotal` come from `rollUpFinals`, and the
      payload carries `pertWeights` and `estimateRounding` — test:
      `work-item.service.test.ts` `rounds each step before summing them`,
      `a parent's total is the sum of its descendants' charged days`, and
      `plans by the weights the project set`; **negative**: the per-step round
      moved to the total, watched failing.
- [x] 4.3 The schedule gives a slice the same rounded number — test:
      `work-item.service.test.ts` `the days the chart draws are the days the
table shows`.

## 5. The document and the client

- [x] 5.1 `bun apps/be-01/src/openapi/emit-openapi-cli.ts` regenerates
      `openapi.json` — test: `openapi-document.test.ts`.
- [x] 5.2 `wbs-api.ts` carries `PertWeightsView`, `EstimateRoundingView`, both
      fields on the tree read, and `setEstimateArithmetic` — test:
      `wbs-api.test.ts` `patches the weights and the rounding in one request`.

## 6. Documentation

- [x] 6.1 `CONTEXT.md` gains **PERT weights** and **Estimate rounding**, and
      **Final days** is rewritten to say rounded-then-summed;
      `docs/adr/0011-final-days-are-whole-days-rounded-per-step.md` records the
      decision; `LLM_README.md`'s landmine list is left alone (nothing here is
      one).

## 7. Gate

- [x] 7.1 `bunx nx run-many -t test lint typecheck build` for be-01, fe-01 and
      the libs, plus `bunx openspec validate --all --json`. **Run 2026-08-31**
      over the tree this landed in: `run-many` exit 0 across the twelve app and
      lib projects, be-01 1248 pass, fe-01 1992 pass, `openspec validate --all`
      33/33, and the whole browser gate 260 passed / 0 failed on
      `E2E_PORT_SHIFT=2600`. `bin/h2puni-gate.sh` was **not** run — it exits 127
      on this macOS host.

## 8. The surface

- [x] 8.1 `EstimatingPanel` — the three weight boxes (saved as one triple, and
      only in force under `pert`), the four roundings as radios that land on the
      click, dirty reporting and a refusal on the surface — test:
      `estimating-panel.test.tsx`, eleven cases; **negative**: the
      `Number.isFinite` arm of `weightsOfDraft` replaced by a bare `>= 0`,
      watched failing on `1e999`.
- [x] 8.2 **Unblocked and wired, 2026-08-31.** The block was that this change
      could not edit `wbs-table.tsx` — another session held it open all evening
      — so the panel was written, tested and unreachable. The main session made
      both edits once that file was free: `ProjectSettingsModal` has an
      `Estimating` section (fourth, after Steps) and `wbs-table.tsx` passes it
      one `estimating={{…}}` block, with `pertWeights` and `estimateRounding`
      riding `chartRead` the way `depReach` already did — so the panel is seeded
      from the same read that produced the figures on the table, and cannot
      offer to "change" a value the table is not showing.
      Tests: `project-settings-modal.test.tsx` names `Estimating` in the tab
      list and its arrow-key order; `e2e/project-settings.spec.ts` asserts four
      sections in Chromium. Both were red before the wiring and green after.
