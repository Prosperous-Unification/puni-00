# verify — unestimated-steps-take-no-schedule-time

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 121 passed, 0 failed. This change was valid; the CLI emitted informational archive warnings because main wbs-domain and scheduler-optimization specs are absent. File-scoped bunx prettier --check exited 0 for every new file.

## Implementation — WBS 010.4.4 (2026-09-27)

`durationOf` returns zero for `days === null`; `ASSUMED_SLICE_WORKDAYS` is read only by the Gantt. `SCHEDULER_CONTRACT_VERSION` 10 → 11 (every request fixture, `services.db.test.ts` and `test_model.py` now carry `11+0.1.3`) and `SCHEDULE_ALGORITHM_ID` `slice-leveling-v2` → `v3` (digest `18b55455829f4eb1` → `f0145c81759486b5`). Both golden corpora were regenerated with `tools/dev/write-*-golden-corpus.ts`. The Python solver needed no change: it already gives a zero-duration slice no interval while keeping its start, end, floor and edges, so its package version stays `0.1.3`.

Observed, all under `env -u CLAUDECODE` on the workstation:

- Fast: `bun test libs/wbs/domain` 1050 pass / 0 fail after the change. The Fast golden corpus gained `unknown-beside-explicit-zero` and `unknown-assigned-capacity` (ten cases). `schedule-unestimated.test.ts` (renamed from `schedule-assumed-duration.test.ts`) first failed 7 of 9 against the old rule, then passed 9 / 9: unknown predecessor adds no delay, a floor still passes through the unknown node, explicit zero stays estimated, two unknown slices on one person or a one-slot pool share an instant and push no estimated work, and a parent's bounds ignore the placeholder. The leveled benchmark returned to its pre-assumption figures, 159 (whole-item) and 175 (anchor-slice).
- Captured oracles: `live-plan-identity.test.ts`, `capacity-migration-identity.db.test.ts` and `priority-band-identity.db.test.ts` compare the live-server captures whole again; the placement-narrowing helpers were deleted and `withSnappedRollUps` moved to `testing/snapped-roll-ups.ts`.
- Solver boundary: `durationUnits` and `buildSolverRequest` give a null estimate zero units at every width. `canonical-schedule-input.test.ts` asserts that null and explicit zero place alike, report apart and hash apart. `test_model.py` gained `test_an_unknown_predecessor_is_a_node_and_adds_no_delay`; the solver-py suite ran 214 tests OK with `/home/df/wd/puni/puni-plan/venv-solver-py`.
- Gantt: `gantt-geometry.test.ts` and `gantt-panel.test.tsx` ran 382 pass in Vitest (UTC). The unknown bar is drawn two workdays wide from a `3 → 3` payload, two unknown slices at one instant remain two bars with their own step names, the parent bracket ends at the scheduled finish while the horizon reaches the placeholder, and the accessible name says `Not estimated — drawn as 2 days, excluded from the schedule`.

## R5 proofs, watched 2026-09-27

- `durationOf` answering `ASSUMED_SLICE_WORKDAYS` for null days: `reproduces every stored schedule value for value` and the deadline-empty byte check failed (`unestimated-middle` `b` 2 → 4, `c` from 4, and both new unknown cases). `buildSolverRequest > computes durations as Fast does` failed on the unknown slice's units. Both live-plan capture tests and 7 of the 9 `schedule-unestimated.test.ts` cases also failed. Restored.
- `days: slice.days ?? 0` in `canonicalScheduleInput`: `days null against days zero, which place alike and report apart` failed on equal canonical strings. Restored.
- `drawnSpan` computed as `slice.earliestFinish - slice.earliestStart`: `the drawing is not the schedule` failed on `expected +0 to be 2`, with three sibling geometry tests and the horizon test (`expected 3 to be 5`). Restored.
- `, excluded from the schedule` removed from `barFacts`: `the bar still says it is a guess` and `draws a slice nobody estimated, with the detail off and with it on` failed. Restored.

## Not run here

Browser (Playwright `pixels`) and the full host gate are left to CI and `remote-gate.sh`, and their results are in the PR. The archive-time constraints in `proposal.md` (restore the archived assumed-duration requirements, archive `dual-optimized-scheduler` first) are archive work and were not done in this change.
