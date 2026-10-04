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

## Slice 4 — elsewhere in Fast, hash, contract 15, DTO 3

On `batch-9/010-4-16-capacity-elsewhere`, stacked on the rank branch. `SCHEDULER_CONTRACT_VERSION`
14 → 15 and `CACHE_DTO_VERSION` 2 → 3. `SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4` (through slice 6, Fable's decision): every
input without bookings places byte for byte as before, and saved plans capture none.

**Fast digests.** Regenerating the Fast golden corpus after the bump changed exactly one line,
`"contractVersion": 14` → `15`; every case's serialized schedule is unchanged (FS-only and weighted
cases alike). The solver-quantum corpus likewise changed only its version. `schedule-elsewhere.test.ts`
also asserts every corpus case byte for byte with the map supplied empty, and slices/work items
byte for byte when the only bookings are another person's.

**Properties** (`schedule-elsewhere.test.ts`, fast-check, random plans of up to six leaves with FS
edges, an optional SS/FF/FS typed dependency, two people, a one- or two-slot pool and up to four
bookings): an empty map places exactly as no map (1000 runs); no slice of a person overlaps one
of their bookings (drift-tolerant), `boundBy === 'elsewhere'` ⟺ `elsewhereHolder` present and the
holder's booking ends where the slice starts, and `waitingElsewhere` counts them (2000 runs; the
run asserts it reached > 100 elsewhere-bound slices, > 20 capacity-bound slices beside bookings
and > 100 weighted plans with bookings).

| Check (file)                                                         | Fault injected                    | Test that observed the failure                                                               | Result                                                     |
| -------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FS interval search (`schedule.ts`, `placeSlices`)                    | the booking lookup forced to miss | `waits for a booking elsewhere before it starts` and 3 more, the overlap property among them | slice placed across the booking                            |
| weighted seeding (`schedule.ts`, `placeWeightedSlices`)              | bookings not seeded               | `waits for a booking elsewhere across a typed dependency`; the overlap property              | slice placed across the booking                            |
| weighted replay kind (`schedule.ts`)                                 | every person wait named `person`  | `waits for a booking elsewhere across a typed dependency`; the property                      | `boundBy: 'person'`                                        |
| half-open bookings (`schedule.ts`, `elsewhereWindow`)                | comparisons made inclusive        | `fits in a gap between bookings, and a touching booking holds nothing`                       | pushed off a touching booking                              |
| pool evidence (`schedule.ts`, `annotateCapacity` call)               | final window for a capacity floor | `names the pool when a pool pushes past the booking…`; the property                          | throws `waited for capacity with nothing holding the pool` |
| final window (same call)                                             | pool evidence for every floor     | `names the booking when it pushes past the pool`; the property                               | throws `names t with no pool binding it`                   |
| malformed map (`checkElsewhere`)                                     | the call removed                  | `refuses a malformed map`                                                                    | all four maps scheduled (five since the empty list)        |
| one "non-empty" (`checkElsewhere`, Fable review)                     | the empty-list refusal removed    | `refuses a malformed map`; `refuses a person listed with no booking, as the engine does`     | `{ ana: [] }` scheduled and hashed                         |
| hash refuses what the engine refuses (`canonical-schedule-input.ts`) | the `checkElsewhere` call removed | `refuses a person listed with no booking…`; the unordered-bookings case                      | refused maps hashed                                        |
| pinned refusal (`schedule()`)                                        | refusal removed                   | `refuses to materialise pinned starts around bookings elsewhere`                             | a schedule returned                                        |
| `waitingElsewhere` presence                                          | always present                    | `keeps every golden corpus case byte for byte, the map supplied empty`                       | extra key                                                  |
| hash (`canonical-schedule-input.ts`)                                 | the `elsewhere` entry left out    | `hashes a booking elsewhere…`, `moves a placement when a booking…moves`                      | one hash for five plans                                    |
| Fast adapter (`runtime-portable/scheduler.ts`)                       | `NOWHERE` passed                  | `hands the bookings elsewhere to Fast`                                                       | empty map seen                                             |
| wire 2 refusal (`build-solver-request.ts`)                           | condition made false              | `refuses a plan whose people are booked elsewhere, which wire 2 cannot carry`                | request built                                              |
| DTO encode (`schedule-cache-dto.ts`)                                 | `waitingElsewhere` dropped        | `round-trips a schedule placed around bookings elsewhere`                                    | count lost                                                 |
| DTO decode                                                           | value taken unchecked             | `refuses a waitingElsewhere that is not a count`                                             | text decoded                                               |
| DTO fence                                                            | left at 2                         | `refuses the version-2 row written before the elsewhere floor existed`                       | v2 row read                                                |

fe-01 learns the member (`ScheduleFloorView`, `BindingFloor`) because the wire carries it; its
words are slice 7's, so a bar held elsewhere still reaches the error boundary
(`sends a bar held elsewhere to the error boundary until it has words`). No production path
produces the floor before slice 6 builds the chain and slice 8 lets an organization share.

Fable's review of #250 unified "non-empty elsewhere": a listed person holds at least one booking
(`checkElsewhere` refuses `[]`), so `elsewhere.size > 0` means the same thing in the engine, the hash
(which now calls `checkElsewhere` and no longer sorts bookings it has validated) and the wire 2
builder. The FS pass's drift between the searched length and `tileFinish`'s finish is documented
beside the search, not re-searched; the overlap property already applies the same tolerance.

## Slice 4 — backward booking bounds (PR #250 review)

The backward FS and weighted passes now fit latest intervals around the same fixed bookings
as the forward pass. A cap propagates to plan predecessors and around a feasible augmented
resource cycle; float and criticality therefore cannot describe an interval inside a booking.
The cyclic relaxation repeats after caps until all bounds settle, with a budget of one pass
per relevant booking plus the final settled pass.

Verified 2026-10-05 in `/tmp/puni-pr250-integration` on `pop-os`, using `env -u CLAUDECODE`
for Bun tests and Nx commands. Nx ran with `NX_DAEMON=false` and `--skip-nx-cache`.

| Command                                                                                                               | Result                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `bun test libs/wbs/domain/domain/src/schedule-elsewhere.test.ts libs/wbs/domain/domain/src/schedule-weighted.test.ts` | 39 pass, 0 fail                                                  |
| `bun test --timeout=10000` (cwd `libs/wbs/domain/domain`)                                                             | 872 pass, 1 skip, 0 fail; 58,615 assertions across 69 files      |
| `bunx nx run-many -t typecheck lint -p wbs-domain --skip-nx-cache`                                                    | both targets succeeded                                           |
| `bunx nx run-many -t build -p wbs-be-01,wbs-gw-01,wbs-fe-01 --skip-nx-cache`                                          | three application builds and their protocol dependency succeeded |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                              | 145 passed, 0 failed                                             |

The initial domain invocation from the workspace root included nested boundary checks with
project-relative fixtures: 1,678 pass, 2 skip, 9 fail and 5 errors. The corrected project-cwd
command above is the domain test target's contract and passed. The remaining skipped check is
`certifies 600 slices in under 20ms elapsed`, which the suite marks skipped. The canonical
h2puni SHA gate was not run on this `pop-os` workspace; these are scoped checks, not a host-wide
gate result.

Each mutation below changed production `schedule.ts`, was watched failing, and was restored.
The four-test command was `bun test libs/wbs/domain/domain/src/schedule-elsewhere.test.ts -t
'false float|booking-capped|caps latest|propagates booking caps'`; the cycle-only command used
`-t 'propagates booking caps'`.

| Fault                                                                       | Observed production regression                                                | Result                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `latestStartAroundElsewhere` returns its ceiling without searching bookings | `does not give a slice false float across its next booking`                   | latestStart 9, latestFinish 10, float 9, critical false; expected 0, 1, 0, true            |
| same bypass                                                                 | `passes a booking-capped latest start backward to a plan predecessor`         | A latestStart 9, float 8, critical false; expected 1, 0, true                              |
| same bypass                                                                 | `caps latest starts in the weighted pass and passes the cap to a predecessor` | A latestStart 9, float 8, critical false; expected 1, 0, true                              |
| same bypass                                                                 | `propagates booking caps around a feasible weighted resource cycle`           | latest starts [24,14,23]; expected [10,9,9]; complete run: 0 pass, 4 fail, 12 filtered out |
| stop cyclic relaxation immediately after its first cap                      | cycle regression                                                              | latest starts [10,14,10]; expected [10,9,9]; 0 pass, 1 fail                                |
| break the interval budget to zero                                           | cycle regression                                                              | throws `backward booking bounds did not converge`; 0 pass, 1 fail                          |
| zero budget with the convergence refusal removed                            | cycle regression                                                              | returns [10,14,10], violating propagated bounds; 0 pass, 1 fail                            |
