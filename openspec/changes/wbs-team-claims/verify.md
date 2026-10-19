## Verification record

Nothing implemented yet. This change was drafted on 2026-10-19 without Dany's interview
(task 0.1), under the standing "assume and document" rule.

Measured for the design, read-only on the dev store (`/home/puni1/wbs-dev/data/wbs.db`,
`bun:sqlite` readonly over SSH to h2puni, 2026-10-19): project `PUNI platform plan`
(`558ec5c7-f561-4181-9d9b-055b06bc9796`): 211 work items; assignments 0; team labels 0;
external refs 2; readiness `ready` 6, `draft` 1; hold `blocked` 6; step progress `done` 495,
`in_progress` 42; `project_team_capacity` rows 0; steps `plan`, `impl`, `review`.

Not verified: that an Auth0 machine-to-machine token carries `wbs_groups` (task 0.2); that
plan document v6 carries a person's teams (task 0.3); `openspec validate` on this change
(run before the PR, result below).
