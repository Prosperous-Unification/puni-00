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

## Slice 5 — wire 3 and Solver 0.2.0

Implemented on `feat/shared-people-slice5-wire3`, isolated from exact merged main
`18d36d71b30ad8bd3c0da55ab78e8e2c5f14151e`. Tasks 5.0–5.2 only; shared mode and slices 6–8
remain deferred. `SCHEDULE_ALGORITHM_ID` remains `slice-leveling-v4`; contract 15 and DTO 3
remain unchanged. Historical wire 1/2 schemas remain unchanged.

**Ruling:** Round booking starts down and ends up on the solver-unit axis, clip at zero,
omit bookings ending at/before zero, and union rounded overlaps per person. Keep adjacency
as a hand-off and keep the original holder-bearing workday bookings for Fast/publication
annotations. This conservatively protects feasibility; the cost is up to one extra quantum
at each endpoint, so a fractional feasible plan can be infeasible at solver resolution.
`design.md` D7 and the delta spec record the policy.

The old unsupported-wire and pinned-start refusals are removed after coverage of bookings-aware
quantised Fast (including serial FF fallback), FS/SS materialisation, independent Bun shape,
canonical-input and no-overlap checks, and SQLite initial/queued/manual Retry cleanup. Current
schema paths, corpus versions and the two existing tagged request-field enumerations in
`dual-optimized-scheduler` change together because its vocabulary guard checks the current wire.
The obsolete pinned-start refusal test is replaced by acceptance and overlap-refusal tests;
the golden-corpus tests and their fixture declaration are preserved.

Local commands use `BUN_TMPDIR=/tmp`, `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false` where Nx
is invoked. The Python target uses `PATH=/tmp/slice5-python/bin:$PATH`, a test-only venv with
the pinned solver dependencies; production image/binding preparation remains host-owned.

| Command                                                                                                                                                               | Observed outcome                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun test libs/wbs/domain/contracts/solver/src/elsewhere-wire.test.ts`                                                                                                | initial RED: 0 pass / 8 fail; final 12 pass / 0 fail                     |
| `bun test apps/wbs/be-01/src/service/solver-request-pair.test.ts apps/wbs/be-01/src/service/solver-exit-outcome.test.ts`                                              | 10 pass / 0 fail                                                         |
| `bun test apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts --test-name-pattern 'preflight admission cleanup'`                                           | 9 pass / 0 fail; no spawned processes, no slots or queue rows left       |
| `bunx nx run wbs-contracts:test`                                                                                                                                      | 445 pass / 0 fail, 44 files, exit 0                                      |
| `bunx nx run wbs-domain:test`                                                                                                                                         | 871 pass / 1 existing performance skip / 0 fail, 69 files, exit 0        |
| `bunx nx run wbs-be-01:test --output-style=static` (approved socket/process execution)                                                                                | 1,634 pass / 1 existing skip / 0 fail, 137 files, 239.87 seconds, exit 0 |
| `bunx nx run wbs-solver-py:test`                                                                                                                                      | 243 tests, OK, 33.974 seconds, exit 0                                    |
| `bun test tools/tool-devsync/src/solver-preparation.test.ts tools/tool-devsync/src/solver-binding-host.test.ts tools/tool-devsync/src/solver-binding-runtime.test.ts` | 31 pass / 0 fail, exit 0                                                 |
| `bunx nx run-many -t lint typecheck -p wbs-domain wbs-contracts wbs-be-01 --output-style=static`                                                                      | all seven tasks successful, exit 0                                       |
| `bunx nx run wbs-be-01:build --output-style=static`                                                                                                                   | application build and OpenAPI dependency successful, exit 0              |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                              | 145 passed / 0 failed, exit 0                                            |
| `cmp` canonical/bundled `solver-wire.v3.json`                                                                                                                         | byte-identical                                                           |

The first full backend target under the local sandbox ran 1,597 pass / 1 skip / 37 fail;
the failures were socket/listener and subprocess restrictions, including a named Unix-listener
`EPERM`. It was rerun with approved socket/process access and passed. A first domain run also exposed an
accidentally removed golden-fixture declaration when replacing the obsolete refusal test; the
fixture and describe boundary were restored and the project target rerun successfully. Lint
and typecheck initially identified import ordering, a tuple guard requiring an explicit array
boundary, and a widened test status literal; all were corrected and their targets rerun.

### R5 failure proofs

Each fault was injected into production, the named production-path negative was watched
failing, and the original bytes restored. Adjacent `Proof:` comments name the observations.
The TS wire command is `bun test libs/wbs/domain/contracts/solver/src/elsewhere-wire.test.ts
--test-name-pattern '<case>'`; service and coordinator cases run their named files above.

| Fault                                                                                                         | Observed case/outcome                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop fixed intervals in Python `model.py`                                                                     | model negatives start at 0 instead of 5 and call a booked deadline feasible: 2 failures                                                        |
| Drop that loop and run the real Python CLI over Bun's bookings-aware Time request                             | Python exits 0, reports feasible `A` at unit 0 with makespan 48; Bun `evaluateSolverOutcome` returns `{kind:'failed',reason:'invalid-output'}` |
| Feed new wire 3 bytes to original 0.1.4 archived from the exact base                                          | original `--version` prints 0.1.4; CLI exits 64, zero stdout bytes, `RequestRejected` schema refusal                                           |
| Remove Python booking ordering/length/horizon checks                                                          | 5 malformed-booking negatives accepted                                                                                                         |
| Replace Python schema booking shape with `{}`                                                                 | empty person, boolean/fractional endpoints accepted; malformed tuple raises wrong exception: 3 failures / 1 error                              |
| Remove required `elsewhere` or wire version const                                                             | missing field reaches `KeyError`, or wire 2 with bookings is accepted; both tests fail                                                         |
| Remove booking-end arithmetic bound in `quantiseElsewhere`                                                    | pair and SQLite arithmetic negatives: 4 pass / 3 fail                                                                                          |
| Round starts up, round ends down, remove clipping, retain expired intervals, or disable rounded overlap union | outward-rounding regression: each 0 pass / 1 fail                                                                                              |
| Omit booking ends from horizon                                                                                | horizon 48 instead of 4849: 0 pass / 1 fail                                                                                                    |
| Drop Bun fixed-overlap guard                                                                                  | solver answer across booking accepted: 0 pass / 1 fail                                                                                         |
| Drop Bun interval shape or empty-person checks                                                                | malformed fixed intervals or empty person admitted: each 0 pass / 1 fail                                                                       |
| Drop canonical-booking equality                                                                               | publication path records invalid-output instead of internal-error for a request that dropped authored bookings: 0 pass / 1 fail                |
| Drop compatibility preflight                                                                                  | all three SQLite initial/queued/Retry negatives fail: 0 pass / 3 fail                                                                          |
| Bypass early request-pair arithmetic preflight                                                                | oversized baseline throws instead of typed refusal: 0 pass / 1 fail                                                                            |
| Drop baseline bookings                                                                                        | pair hints at unit 0 instead of 49: 0 pass / 1 fail                                                                                            |
| Drop original materialiser bookings                                                                           | production publication loses original holder: 0 pass / 1 fail                                                                                  |
| Drop serial FF fallback booking search                                                                        | successor starts inside booking at unit 2 instead of 4: 0 pass / 1 fail                                                                        |
| Omit preflight slot release                                                                                   | all nine initial/queued/Retry refusal cases retain slots: 0 pass / 9 fail                                                                      |
| Ask pools alone for an FS pin                                                                                 | later pin inside a booking accepted: FS/SS pair 1 pass / 1 fail                                                                                |
| Index plain booking record through prototype person name                                                      | unbooked `constructor` raises TypeError: 0 pass / 1 fail; restored Map lookup passes                                                           |

### Deferred operational evidence

By explicit coordinator instruction, live Solver image publication, binding installation and
the shared prod/dev supervisor restart are deferred until merged integration. ADR 0025's
non-disruptive preparation/binding tests passed; no live host installation or activation
workflow was called. A normal integrated preparation must still prove the new target's
immutable image and installed binding before deployment resets the checkout.

Canonical h2puni SHA-gate evidence follows after the reviewable branch is committed and pushed.
SSH access was verified; its gate must use `TMPDIR=/home/puni1/.cache/puni00-gate-tmp` so the
hardlink-sensitive devsync tests stay on the ext4 device.

### Review correction: empty person calendars

Astra identified a receiver parity mismatch: schema and Python accepted `{"ana": []}`
while Bun rejected it. **Ruling:** An empty list under a non-empty person key is legal
and occupies nothing, consistent with the existing schema/Python boundary. Builders may
omit these entries during canonicalization. Wire validation accepts an empty calendar;
publication with `canonicalInput` additionally requires the exact canonical projection.
Thus a superfluous empty entry against canonical `{}` is refused by the existing
canonical-booking equality check, whose dropped-authored-bookings injected-fault proof
already establishes that this check can fail. Bun now follows this rule, both schema
copies state it explicitly, and the shared valid-two-slices fixture carries an empty
calendar for its selected person.

The new production Bun boundary regression was watched RED against the old list-length
refusal: 0 pass / 1 fail, returning `malformed-request` instead of accepting the empty
calendar. The restored non-empty-person check remains covered by its previous injected-fault
negative. Focused Bun wire suite: 13 pass / 0 fail (126ms). Python `test_elsewhere.py`: 16 tests, OK (0.387s). Both production receivers now accept the empty-calendar case. The contracts target rerun passed 446 tests across 44 files (2.51s).

### CI correction: supervisor wire boundary

Workspace CI on `ac84a180` failed its Solver image smoke because the host supervisor's
start-frame parser still admitted only wire 1/2, rejecting the new wire 3 before the
Python image could validate it. The supervisor now admits 1/2/3 for rolling backend
compatibility and delegates exact wire-schema/version refusal to the selected solver image.
The production-boundary fixed-calendar test was watched RED under the old allow-list:
0 pass / 1 fail, `request wireVersion 3 is not supported`, matching CI's failure.
Injecting wire 4 into the production allow-list also failed the unknown-version negative:
0 pass / 1 fail. Both faults restored, protocol suite: 11 pass / 0 fail (14ms).
Its four Nx targets test/lint/typecheck/build passed (2.2s). Supervisor service and
fake-Docker image-smoke tests passed: 11 pass / 0 fail, two files (8.60s).

The canonical gate on the original implementation head passed all 121 main-workspace tasks
(35 projects plus dependencies, 18m48s) and is continuing through the isolated Twilight
suite. Its successor was queued and refused with exit 75 after 30 minutes, then queued
again; that is a lock-budget refusal rather than a validation verdict. Latest-head gate
and CI evidence must still pass before integration. No live binding or activation occurred.

## Slice 6 — coherent chain reader (bounded)

Implemented on `feat/shared-people-slice6-chain` in the isolated worktree
`.worktrees/shared-people-slice6`, from exact merged main
`711a0d51687f3153580190989981ca20b6ee5790`. Task 6.0 is complete; only chain-reader
portions of 6.1/6.2 are implemented, so those umbrella tasks remain unchecked.
No mode migration, activation route/environment switch, rollback vocabulary, fan-out,
notification or UI change ships. `SCHEDULE_ALGORITHM_ID` remains `slice-leveling-v4`.

**Rulings.** The influencer closure follows shared-person edges only toward higher ranks.
A lower-ranked neighbor of an influencer cannot displace it and is excluded; this is
not undirected component reachability. Undated projects stop traversal and neither
consume nor supply bookings. Cyclic/calendar-range influencers supply no bookings and
remain explicit unavailable load evidence; required `engine_unavailable` carries the
influencer identity, and unexpected failures throw. Pending/failed influencers supply
Fast display bookings; selected ready variants supply their published bookings.

The SQLite adapter opens a dedicated read-only connection, binds organization/session
reads and the existing optimized-cache reader to it, and holds one deferred transaction
through application scheduling. Only required influencers and the target are fully captured.
Returned values are detached, and the port's callback can return only chain evidence, not
borrowed scheduling/database capabilities. The application owns closure, booking projection
and display selection. No live scheduling admission is used.

Shared saved capture/current comparison consume the same detached chain evidence through
the existing S4 policy: a pending optimized target remains absent `pending`, and an
unrepresentable calendar target remains absent `infeasible`. Historical target schedule
bytes survive upstream edits/deletion. Captured target inputs alone are not replayable
provenance; no upstream history or booking ledger is persisted. The isolated capture path
still releases its snapshot before scheduling. The exception is recorded in D8 and
`saved-plans/design.md`.

### Verification

Commands ran locally with Bun 1.4.2, `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false` for Nx,
and uncached scoped targets. The six-file focused command below is one command; paths are
listed on separate lines here for readability:

```sh
bun test \
  libs/wbs/application/core/src/service/shared-people.test.ts \
  libs/wbs/application/core/src/service/saved-plan-input.test.ts \
  libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/captured-optimization-reader.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan.service.db.test.ts
```

| Command                                                                                                 | Observed outcome                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Focused command above                                                                                   | 87 pass / 0 fail; 309 assertions across six files (6.54s)          |
| `bunx nx run-many -t lint -p wbs-core,wbs-store-sqlite --skip-nx-cache --output-style=static`           | Both targets passed, exit 0 (23.3s)                                |
| `bunx nx run-many -t lint typecheck -p wbs-core,wbs-store-sqlite --skip-nx-cache --output-style=static` | All five tasks passed, exit 0 (33.2s)                              |
| `bunx nx run wbs-be-01:build --skip-nx-cache --output-style=static`                                     | Backend and solver-protocol dependency passed again, exit 0 (1.6s) |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                | 146 passed / 0 failed, exit 0                                      |
| `git diff --check`                                                                                      | Exit 0                                                             |

The first new fixture runs exposed schema assumptions (`created_at`, rounding `exact`,
and required rank `created_by`), corrected from the production schema. Cache-test initial
expectations overlooked a legal half-open gap: C fit before a later booking. The fixture's
manual floors were adjusted to intersect the published booking; production required no
fix. A calendar fixture at year 9999 plus ten days stayed inside JavaScript Date's supported
extended-year range; the negative now uses the existing workday suite's 80-million-workday
TimeClip boundary. Lint/typecheck first exposed test-only adapter dependency cycling,
opaque JSON comparison typing, Bun matcher return typing and import/export ordering;
these were corrected before rerunning the scoped targets. Shared calendar S4 was watched
RED (`unavailable` instead of `infeasible`) and aligned with the existing isolated policy.

### R5 failure proofs

Every fault below was injected in production, the named test watched failing, and the
original bytes restored before the next run. Each named test runs with `bun test <file>
-t '<case>'`; adjacent production `Proof:` comments identify these observations.
The captured-input regression was first watched RED with `undefined` instead of the
booking map, then GREEN with the authored assigned slice at day 5. The optimized null-state
negative was watched RED returning Fast dates before its guard was added.

| Production fault                                | Production-path negative / observed failure                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stop person expansion after a direct influencer | `shared-people.test.ts`: transitive Ana→Ben chain excludes A / C starts 2 instead of 3         |
| Admit an undated bridge                         | Same file: undated bridge returns influencers instead of none                                  |
| Use `mode: live`                                | `chain-snapshot.db.test.ts`: real cache publication hits the forbidden live-admission callback |
| Swallow required engine refusal                 | Unit influencer identity negative fails instead of receiving typed `engine_unavailable`        |
| Swallow unexpected scheduler fault              | Unit unexpected-fault negative returns dates instead of throwing                               |
| Remove booking date conversion                  | Unit calendar-range influencer becomes bookable instead of explicitly unavailable              |
| Remove deferred snapshot                        | SQLite concurrent rank/assignment/date negative starts C at 2 instead of 3                     |
| Omit connection close                           | SQLite capture-throw negative observes 0 closes instead of 1                                   |
| Omit cross-reference check                      | SQLite crossing-assignee negative accepts a foreign person's assignment                        |
| Read global people instead of scoped directory  | SQLite directory evidence names `foreign`                                                      |
| Ignore shared saved capture                     | SQLite saved bytes contain target start 2 instead of 3                                         |
| Omit captured `elsewhere` projection            | `saved-plan-input.test.ts`: booking map is undefined                                           |
| Omit booking argument from saved scheduling     | Same test: assigned slice starts 0 instead of 5                                                |
| Open writable connection in production factory  | SQLite factory negative commits injected unsafe rename instead of refusing                     |
| Omit capture readable-list guard                | SQLite borrowed foreign-project negative loses its named refusal                               |
| Omit missing captured-project guard             | SQLite broken capture dependency loses its trusted-state refusal                               |
| Omit ready optimized schedule null guard        | Unit ready-variant negative receives a null dereference instead of the trusted-state refusal   |
| Admit zero-time assigned bookings               | Unit zero-duration negative throws on a booking holding no time                                |
| Omit missing rank-slot guard                    | Unit broken rank-array dependency throws a property dereference instead of its named refusal   |
| Omit rank/readable-list agreement guard         | SQLite broken readable-list dependency is accepted instead of throwing                         |

The cache concurrency scenario publishes ready optimized A on a separate connection after
the chain snapshot begins: that read retains displayed Fast and C starts 3; the next read
uses optimized A and C starts 4. A failed cache outcome returns to displayed Fast and C starts 3. Rank ties precede the unranked tail. Fractional bookings retain the offset across different
anchors, touching intervals stay free, and foreign targets/current membership refusal never
name foreign projects. State-table assertions prove no generation, solver-slot, solver-queue
or event-log writes from normal/pending chain reads. Capture throw preserves a stranger's
concurrent committed edit and closes the reader.

### Unverified and deferred checks

The canonical h2puni exact-hash gate, substantive GitHub CI and independent Astra review
remain required before merge. The gate must use ext4
`TMPDIR=/home/puni1/.cache/puni00-gate-tmp`. No full workspace gate, browser/portable suite,
live shared-mode activation, Solver image/binding installation, or trusted Tool Wiki activation
was performed in this slice. The existing isolated outside-snapshot negative remains in its
prior suite; the unchanged isolated capture lifecycle and saved-service policy suites above
were rerun here. The umbrella change is not complete.

### Independent review corrections: whole-calendar preflight and contracts

The live-tree preflight reads the maximum `earliestFinish` of every scheduled work item,
then calls `addWorkdays(date, lastWorkdayOf(0, projectFinish))`. The original chain projection
checked only assigned slices and could miss an independent unassigned item beyond the
ECMAScript calendar range. The chain now performs that same whole-work-item preflight on
the selected displayed schedule before filtering persons or zero-time slices. It replaces
the earlier assigned-slice calendar check; the earlier mutation observation describes the
previous implementation, and the new proof covers the replacement.

Three new real-domain regressions were watched RED: an independent unassigned 80,000,000-day
item left its influencer marked available, both with assigned slices and with the assigned
work on hold (no assigned slices); a target without assignments returned a schedule instead
of `calendar_range`. After the fix all fourteen chain unit tests passed (37 assertions).
R5 mutation: removing only `addWorkdays(date, lastWorkdayOf(0, projectFinish))` made all three
new regressions fail again (0 pass / 3 fail); the production bytes were restored. Both
influencer cases now book nothing and leave the downstream target's start at zero.

The glossary, application JSDoc, design and rulings now call upward traversal **Influencer
closure**. The mode delta explicitly describes future fan-out to lower-ranked projects by
shared-person edges following rank downward; no `Downward closure` references remain.
The normative `openspec/specs/saved-plans/spec.md` retains typed-dependency history and adds
only the shared capture/current exception plus isolated ordering. The original saved-plans
wbs-domain delta and current-comparison JSDoc are qualified consistently. Shared schedule
bytes remain historical display evidence; replay provenance remains outside this slice.

Follow-up focused command:

```sh
bun test \
  libs/wbs/application/core/src/service/shared-people.test.ts \
  libs/wbs/application/core/src/service/saved-plan-input.test.ts \
  libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/captured-optimization-reader.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan.service.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan-current.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan-schedule.db.test.ts
```

| Check                                                                                                                                            | Observed outcome                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Focused command above, including isolated save/current connection-order negatives                                                                | 104 pass / 0 fail; 353 assertions across eight files (10.69s), exit 0 |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-core,wbs-store-sqlite --skip-nx-cache --output-style=static` | All five tasks passed, exit 0 (33.9s)                                 |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:build --skip-nx-cache --output-style=static`                                     | Backend plus solver-protocol dependency passed, exit 0 (1.5s)         |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                         | 146 passed / 0 failed, exit 0                                         |
| Repository reference search for the removed glossary term                                                                                        | No matches                                                            |

Canonical exact-hash h2puni gate, substantive CI and independent rereview remain required
before merge. The activation, portable/browser, Solver installation and other deferred
checks listed above remain unperformed in this bounded follow-up.

### Canonical-gate correction: detached value ownership and reader kind

The canonical gate exposed two omitted architecture checks. Fresh direct reproduction:
`bun test libs/wbs/application/core/src/module-boundaries.test.ts` failed the closed-feature
production audit (14 pass / 1 fail, 30.93s), naming the saved-plan import and uses of
`SharedPeopleRead`. `bun test tools/tool-devsync/src/service-kinds.test.ts` failed the
production classification inventory (16 pass / 1 fail, 189ms), naming `shared-people.ts`.

Following independent Astra architecture review, `InfluencerRead` and `SharedPeopleRead`
now live in `ports/shared-people-values.ts`. That detached contract imports `PlanInputReads`
directly from `saved-plan-capture-values.ts`; `ChainSnapshot` and `ChainSnapshotStore` remain
repository capabilities in `chain-snapshot-store.ts`. The saved-plans feature imports the
values directly, and the service re-export is removed. The core public barrel exports the
pure values so adapter callers keep their existing import surface. No audit is relaxed.

The reader is classified as `resource` with the exact glossary term `Influencer closure` and
a rationale naming `ChainSnapshotStore` and its coherent displayed-schedule/booking read.
Only its policy entry is inserted, between saved-plan.service.ts and smoke.service.ts;
existing entries keep their order. The shared capture callback and runtime behavior are unchanged.

The previously failing closed-feature case passed after the split (1 pass / 0 fail, 5.86s).
The classification suite passed after insertion (17 pass / 0 fail, 208ms). Follow-up verification:

| Command                                                                                                                                          | Observed outcome                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Eight-file focused command in the review-correction section above                                                                                | 104 pass / 0 fail, 353 assertions (12.73s), exit 0            |
| `bun test libs/wbs/application/core/src/module-boundaries.test.ts tools/tool-devsync/src/service-kinds.test.ts`                                  | 32 pass / 0 fail, 39 assertions (41.57s), exit 0              |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-core,wbs-store-sqlite --skip-nx-cache --output-style=static` | All five tasks passed (37.9s), exit 0                         |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:build --skip-nx-cache --output-style=static`                                     | Backend plus solver-protocol dependency passed (1.6s), exit 0 |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                         | 146 passed / 0 failed, exit 0                                 |

The canonical
exact-hash gate remains required for the pushed head; the earlier failure is not a gate pass.
