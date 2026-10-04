# verify — share-people-across-projects

## Slice 0 — spec

Written on `batch-9/010-4-16-capacity-spec` from main `4bb71e5f`. The change name, the four
capabilities and the ADR follow the design memo's §8 slice 0. The ADR number is 0034 because
the spaces lane holds 0033. No migration ships in slices 0–1.

| Command                                                  | Result                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json` | exit 0; 143 passed, 0 failed; `share-people-across-projects` valid, no issues |

## Slice 1 — load backend

On `batch-9/010-4-16-capacity-load-view`, stacked on the spec branch. Backend only: the memo puts
the load page in slice 2. `SCHEDULER_CONTRACT_VERSION` is unchanged at 14. There is no
migration.

| Command                                                                             | Result                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `bun test libs/wbs/domain/domain/src/person-load.test.ts`                           | 13 pass, 0 fail                          |
| `bun test src/service/person-load.feature.test.ts` (in `libs/wbs/application/core`) | 6 pass, 0 fail                           |
| `bun test src/controller/person-load.controller.db.test.ts` (in be-01)              | 13 pass, 0 fail (after the revision fix) |
| `bunx nx run-many -t typecheck lint:fast` over the five touched projects            | succeeded                                |
| `bunx nx affected -t typecheck test lint --base=origin/main`                        | recorded in the PR body                  |

Every Bun run used `unset CLAUDECODE`.

## Failure proofs

Each fault was injected into the production file, the named test was watched failing, and the
fault was reverted (2026-09-29).

| Check (file)                                                                  | Fault injected                             | Test that observed the failure                                                                                                             | Result                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| memo sequence key (`core/src/service/person-load.feature.ts`, `reading`)      | `held?.seq === seq` → `held !== undefined` | `shows a lengthened booking after a command`                                                                                               | expected `2026-10-12`, got `2026-10-07`                                    |
| memo revision key (`core/src/service/person-load.feature.ts`, `reading`)      | `&& held.revision === revision` removed    | `follows a start date moved after a warm read`, `… cleared …`, `follows an estimate rule changed after a warm read` (Fable review of #233) | pre-PATCH booking served; `endsOn` expected `2026-10-19`, got `2026-10-08` |
| overlap strictness (`domain/src/person-load.ts`, `overlapsOf`)                | starts sorted before ends at one instant   | `reports nothing for touching bookings`; mounted `does not report touching bookings as an overlap`                                         | one overlap reported in each                                               |
| zero-length spans (`domain/src/person-load.ts`, `overlapsOf`)                 | the `end > start` filter removed           | `lets a span that holds no time join no overlap`                                                                                           | one overlap reported                                                       |
| readable projects (`core/src/service/person-load.feature.ts`, `readProjects`) | list and trees read under legacy access    | `omits a foreign project that assigns the same person id`, plus four more mounted cases                                                    | organization B's project named and counted                                 |
| person scope (`core/src/service/person-load.feature.ts`, `readPerson`)        | person looked up in the legacy directory   | `answers a foreign person as an absent one`                                                                                                | 200 instead of 404                                                         |
| window cap (`core/src/service/person-load.feature.ts`, `loadWindowOf`)        | `days > LOAD_WINDOW_DAYS` removed          | `refuses a year-long window, an inverted one and an impossible date`                                                                       | 200 instead of 400                                                         |

The memo proof runs on the production composition (`OrganizationHarness.openComposed`), where
commands advance the real event sequence.

## Slice 2 — load page

On `batch-9/010-4-16-capacity-load-page`, stacked on the load-view branch.

| Command                                                                                                    | Result                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `TZ=UTC bunx vitest run src/components/people src/app-router.test.tsx src/components/directory` (in fe-01) | 68 pass, 0 fail (after Fable's review of #240; 65 before it) |
| `bunx nx run wbs-fe-01:typecheck`                                                                          | succeeded                                                    |

| Check (file)                                                            | Fault injected                                                     | Test that observed the failure                                                      | Result                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| overlap hatching (`fe-01/.../person-load-page.tsx`, `Lane`)             | hatch by whole-day date intersection instead of overlap membership | `does not hatch a hand-off inside one day`                                          | `['true', 'true']` for `['false', 'false']`    |
| closed reason list (`contracts/.../person-load-shapes.ts`)              | `reason` widened to `'string'`                                     | `shows the query failure for a reason the contract does not name, not a blank lane` | no alert found                                 |
| unknown load (`fe-01/.../people-load-summary.tsx`, `loadLineOf`)        | the `unavailable` caveat dropped                                   | `says the load is partly unknown when a project could not be read`                  | `0 d booked, 0 d overlapping` read as complete |
| refresh with the directory (`people-load-summary.tsx`, `usePeopleLoad`) | the directory snapshot left out of the effect's dependencies       | `reads the load again when the directory reads again, and not mid-write`            | one read instead of two                        |
| link name (`people-load-summary.tsx`, `PersonLoadSummary`)              | `aria-label` cut to `Load of <name>`                               | `sums each person’s weeks into a link whose name carries the figures`, and two more | no link with the figures in its name           |

## Slice 3 — rank

On `batch-9/010-4-16-capacity-rank`, stacked on the load-page branch. Migration
`20260929180000_add_project_rank`, stamped after `20260929100000_add_spaces` (main) and every open
branch's migrations at the time of writing (none after it).

| Command                                                                                                                                               | Result          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `bun test src/project-rank.db.test.ts` (in store-sqlite)                                                                                              | 13 pass, 0 fail |
| `bun test src/migration-cli.db.test.ts` (in be-01)                                                                                                    | 9 pass, 0 fail  |
| `bun test src/controller/project-rank.controller.db.test.ts src/controller/person-load.controller.db.test.ts` plus core `person-load.feature.test.ts` | 25 pass, 0 fail |

| Check (file)                                          | Fault injected                                          | Test that observed the failure                                       | Result                                              |
| ----------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| composite reference (`migration.sql`)                 | the `FOREIGN KEY (project_id, organization_id)` dropped | `refuses a rank naming another organization’s project`               | the row was stored                                  |
| rollback guard (`down.sql`)                           | the guard's `INSERT` removed                            | `refuses while a rank exists, keeping the table and the ledger`      | the rollback dropped the table                      |
| tie rule (`project-rank.ts`, `heldIn`)                | the project-id comparison removed                       | `orders equal positions by project id on every read`                 | creation order `a3, a1`                             |
| save match (`project-rank-rollback.ts`)               | comparison reduced to counts                            | `refuses to remove a save that no longer matches, deleting nothing`  | no throw; ranks deleted                             |
| restore ownership (`project-rank-rollback.ts`)        | the ownership read skipped                              | `refuses the whole restore when a saved project is gone`             | drizzle `Failed query` instead of the named refusal |
| CLI usage (`project-rank-rollback-cli.ts`)            | the usage guard bypassed                                | `saves, removes and restores project ranks through the rollback CLI` | no `usage:` for `erase`                             |
| admin policy (`project-rank.resource.ts`, `move`)     | the role check removed                                  | `refuses a member and a viewer the move, changing nothing`           | 200 instead of 403                                  |
| load order (`person-load.feature.ts`, `readProjects`) | the sort by rank removed                                | `orders the load reads by the rank, naming each rank`                | `Platform, Billing` instead of `Billing, Platform`  |
