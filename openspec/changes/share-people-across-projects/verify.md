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

## Slice 5 — wire 3, solver 0.2.0

On `batch-9/010-4-16-capacity-wire3`, stacked on the elsewhere branch. `solver-wire.v3.json` adds a
required `elsewhere` (person → sorted, disjoint whole-unit intervals); `SOLVER_WIRE_VERSION` 3,
solver-py `0.2.0`, the supervisor admits wires 1, 2 and 3. v1 and v2 schemas stay in the tree.
`SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4`. Bookings convert conservatively to units: floor
the start, ceil the end (drift-snapped), clamp at 0, and merge what the rounding made overlap.

Fable's #250 obligations: `materialiseOptimized` and `quantisedFastBaseline` take the plan's
bookings (`solver-exit-outcome.ts`, `solver-request-pair.ts`). The wire 2 refusal and the pinned
refusal are gone; a pinned start on a booking throws `ScheduleInvalidOptimizedStartError`. The
question whether the builder's refusal `throw` is caught became moot with the refusal: the only
caller is `solver-request-pair.ts`, the builder's remaining throws are invariant violations, and
a booking that pushes the horizon is a preflight input (the serial bound starts after the last
booking), not a throw.

| Check (file)                                        | Fault injected                            | Test that observed the failure                                                                          | Result                                                            |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| unit conversion merge (`solver-units.ts`)           | merge only when contained (`end <= last`) | `merges bookings the rounding made overlap, and keeps touching ones apart`                              | two overlapping intervals emitted                                 |
| horizon seed (`solver-preflight.ts`)                | the booking end never seeds the floor     | `extends the horizon past the last booking elsewhere`                                                   | horizon 480 where 3216 is due, short of the booking's end at 2880 |
| builder (`build-solver-request.ts`)                 | `{}` in place of `elsewhereUnitsOf`       | `carries each person's bookings elsewhere in units…`; the horizon case                                  | no bookings sent; horizon short                                   |
| baseline (`quantised-baseline.ts`)                  | `undefined` in place of the unit bookings | `places the baseline around the bookings the request carries`                                           | Ann's slice on her booking                                        |
| materialise (`materialise-optimized.ts`)            | `undefined` in place of the bookings      | `refuses offsets that put a person on a booking elsewhere`                                              | offset 24 materialised                                            |
| pinned start on a booking (`schedule.ts`)           | the check removed                         | `refuses a pinned start inside a booking elsewhere`                                                     | a schedule returned                                               |
| re-validation (`revalidate-solver-result.ts`)       | the bookings loop iterates `{}`           | `refuses a person placed on a booking elsewhere`; `refuses a request whose bookings are out of order`   | published; malformed request accepted                             |
| bookings shape on every status (same file)          | the status dispatch copied above the loop | `refuses malformed bookings elsewhere on EVERY response status`                                         | `ok: true` on `infeasible`/`unknown`, 52/1                        |
| model clause 5 (`model.py`)                         | the fixed-interval loop removed           | `ElsewhereClause.test_a_slice_is_placed_around_a_booking_elsewhere` (and one more)                      | slice at unit 0                                                   |
| same, across the seam                               | same                                      | real `-m wbs_solver` on a one-slice request booked on `[0, 40)`, answer fed to `revalidateSolverResult` | `assignee-double-booked`; intact model answers 40, published      |
| request cross-field (`validate.py`)                 | the order check removed                   | `ElsewhereValidation` (3 subtests)                                                                      | unordered/overlapping/empty-length bookings admitted              |
| supervisor wire list (`solver-supervisor-protocol`) | 3 dropped from the list                   | `accepts every solver wire version a rolling deploy can send and refuses any other`                     | v3 frame refused                                                  |
| old solver fed v3 (`test_validate.py`)              | none (a generation check)                 | `WireGenerations`: the v2 schema refuses a v3 request; this solver refuses wire 2                       | typed `RequestRejected`                                           |

Not observed here: the ADR 0025 binding rebuild, and whether the host's installed supervisor
admits v3. The code on this branch admits wires 1-3; the running supervisor is whatever the host last
installed, and the dev deploy after merge is where that is observed. The Python suite runs in a venv
with the locked dependencies; the host's system `python3` has no `ortools`, so
`nx run wbs-solver-py:test` fails there on imports.

Fable's review of slice 5 (approved, no Critical or Important findings) added:

- **Bookings shape before the status dispatch.** `revalidateSolverResult` checked `elsewhere` only on
  a `feasible` response, so CP-SAT's honest `infeasible` about a malformed request could be stored as
  a `plan-infeasible` certificate. The shape check now runs with the other request checks, before
  the dispatch (row above); the placement check stays after it.
- **Fast bias on fractional bookings.** The optimizer sees bookings widened to whole units and Fast
  sees them exact, so on a booking off unit boundaries Fast can win the floor row where the optimizer
  would otherwise tie or win. It only withholds an optimized plan, never publishes a worse one.
  Whole-day bookings are exact. Stated on `guardRealPublication`.
- **Horizon inflation.** The preflight's serial bound starts after the last booking of any person,
  so one far-future booking widens `horizonUnits` and the priority bound. Sound, not tight. Stated
  on `preflightSolverRequest`; tightening it is a follow-up.
- **Drift wording.** `unitOf`'s snap is `withinDrift` on the scaled value: `DRIFT` units, which is
  `DRIFT / SOLVER_QUANTUM` workdays, not `quantise`'s workday-space window. JSDoc reworded.
- **Follow-up, not done here:** `libs/wbs/adapters/solver-supervisor-protocol` is not in
  `SOLVER_COMPATIBILITY_PATHS` (`tools/tool-devsync/src/solver-preparation.ts`). That list keys the
  solver image identity, while the supervisor is installed on the host, so whether a protocol path
  belongs there is a deploy-safety decision. This slice changes the protocol and the solver together,
  so the solver path already forces the rebuild. A future protocol-only bump would not reinstall the
  supervisor.

## Slice 6 — chain, mode, guard, fan-out

On `batch-9/010-4-16-capacity-chain`, stacked on slice 5 (`103135be`). Migration
`20260929200000_add_shared_people` adds `organization.shared_people` (0 = isolated, the default). A
plan read, the restarted solve's input, a command batch and a saved plan's capture all schedule a
project around the same bookings: `WorkItemService.elsewhereOf` computes the influencers (the
closure of higher-ranked projects sharing a person, from assignments), schedules each in rank order
around the ones before it, and takes its displayed schedule's bookings. Influencers are read in
`capture` mode, so reading one project never queues another's solve. A batch's working plan sees one
project, so a batch asks the public graph (`elsewhereAbove`). An influencer's `engine_unavailable`
is the read's 409, naming it in `projectId`. `SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4`.

`elsewhere_changed {projectId, causeProjectId}` comes from `ElsewhereFanOut`, the outermost
announcements layer. After a schedule-input event on a shared project, it compares the project's
displayed bookings with the ones it last fanned out for. On a change, it tells every project the
cause influences. A stored optimized result calls it from `services.ts`, and a rank move tells every
other project of a shared organization (`announcingRankMoves`). `changesScheduleInput` includes the
event, so the project below re-solves. fe-01 treats it as an unknown type and refetches everything
until slice 7.

| Check (file)                                                | Fault injected                                 | Test that observed the failure                                                                                                     | Result                                        |
| ----------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| closure (`elsewhere-chain.ts`)                              | one step: an influencer's people not added     | `reaches a project above through a shared person of another influencer`; `schedules C around B's bookings as they stand after A's` | A left out; C at 4, not 6                     |
| mode (`project.ts` `sharingOf`)                             | every owned project read as shared             | `keeps an isolated organization's dates, and the load view reports the overlap`                                                    | Billing's slice at 2, not 0                   |
| influencer refusal (`work-item.resource.ts`)                | the refusal read as booking nothing            | `refuses to read below an influencer whose engine is missing`                                                                      | 200 with Fast dates, not 409                  |
| refusal names the influencer (`engine-unavailable-body.ts`) | `projectId` spread removed                     | same                                                                                                                               | body without `projectId`                      |
| batch source (`work-item.resource.ts`)                      | `elsewhereAbove` delegation removed            | `applies a command to a project below once shared`                                                                                 | 500: working plan cannot read another project |
| saved plan (`saved-plans.feature.ts`)                       | the source's bookings ignored                  | `saves a shared organization's plan around the bookings above it`                                                                  | Ana's saved slice at 0, not 2                 |
| `schedulePlanInput` (`saved-plan-schedule.ts`)              | `input.elsewhere` not passed to `schedule()`   | `schedules a captured plan around its bookings elsewhere`                                                                          | start 0 bound by `projectStart`, not 3        |
| fan-out signature (`elsewhere-fan-out.ts`)                  | the comparison removed                         | `publishes nothing below for a rename, and tells it of a longer booking`                                                           | one `elsewhere_changed` for the rename        |
| rank move (`elsewhere-fan-out.ts`)                          | the announcement dropped                       | `tells the projects of a shared organization that the rank moved`                                                                  | no `elsewhere_changed`                        |
| re-solve trigger (`optimizer-trigger-broadcaster.ts`)       | `elsewhere_changed` not a schedule-input event | `re-solves a project below when the one above moves`                                                                               | no trigger                                    |
| swap vocabulary (`swap.ts`)                                 | `CAPACITY_MODES_VOCABULARY` left out           | `refuses a pre-feature image while an organization is shared, and stops green`                                                     | the swap migrated                             |
| stored modes (`docker.ts`)                                  | `HAVING count(*) > 0` removed                  | `reads shared organizations, none before the column or while every one is isolated`                                                | `[{ kind: 'shared', count: 0 }]`              |
| `down.sql` guard                                            | the guard's INSERT removed                     | `refuses while an organization is shared, keeping the column and the ledger`                                                       | the column dropped                            |
| reset (`shared-people-rollback.ts`)                         | reduced to comparing counts                    | `refuses to reset a save that no longer matches, changing nothing`                                                                 | both organizations reset                      |
| rollback CLI usage guard                                    | cut to the empty-file check                    | `saves, resets and restores shared organizations through the rollback CLI`                                                         | `erase` exited 0 as a restore                 |

Commands, run one at a time with `CLAUDECODE` unset where Bun's diff output matters:

- `bun test src` in core: 793 pass.
- `bun test` in store-sqlite: 1,211 pass with `CLAUDECODE` unset. An earlier run under
  `CLAUDECODE=1` failed 7: the audit check (the rollback's updates now stamp `auditOnUpdate`) and six
  conformance cases that fail only on Bun's diff formatting under that variable.
- store-memory: 145 pass. contracts: 445 pass. mcp-01: 323 pass.
- `tool-remote-scripts` swap and docker tests: 184 pass.
- be-01: 1,614 pass, 1 skipped.
- Typecheck: wbs-core, wbs-store-sqlite, wbs-store-memory, wbs-be-01, wbs-fe-01, wbs-mcp-01 and
  tool-remote-scripts.

Deviations and what is not observed:

- The chain's reads are not one transaction (spec amended): no read seam offers one, and a plan read
  is not one today. A commit mid-chain is followed by `elsewhere_changed`.
- `down.sql` guards shared organizations only (spec amended); the rank migration's own `down.sql`
  guards ranks.
- `PersonLoad`'s memo keeps its `revision` and `seq` key and gains no `basisHash`: every change to a
  project's bookings above now advances its `seq` through `elsewhere_changed`, a rank move included.
- The optimized-result hook in `services.ts` is typechecked but not proved by a failing test: a
  stored outcome needs the solver lifecycle, which no mounted test drives. It is a notification;
  reads compute the chain fresh.
- The memo's cost budget (30 projects sharing ten people, cold ≤ 2 s, warm ≤ 150 ms) is not
  measured. The chain schedules every influencer on each read of a shared project; nothing is shared
  until the slice 8 route ships.
- A rank move tells every other project of a shared organization, not only those whose influencers
  changed.
