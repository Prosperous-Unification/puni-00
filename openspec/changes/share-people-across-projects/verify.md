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

## Slice 6 — dormant storage and downgrade safety

Based on exact main `281f18e62e9b260bdc9d2bf4f5feeb34266c2521` in isolated branch
`feat/shared-people-storage`. This release supports runtime modes exactly `['isolated']`;
encoding shared mode does not activate it. No setter, runtime/cache switch, fan-out, mode route
or UI is included. Umbrella tasks 6.1/6.2 remain unchecked. Migration history is preserved;
complete-history test inventories include the new additive migration.

TDD: the new column/default/independent rollback negatives failed before migration code.
Combined recovery tests failed before their implementation. Parent architecture review then
produced four RED cases for semantic backup modes and additional/missing organization restore
behavior. Dedicated-save write injection and existing-file overwrite both failed before the
physical read-only opener and exclusive `0600` file creation. Physical missing-table and dangling
CLI symlink probes subsequently failed (1 pass/2 fail) before fail-closed corrections.

R5 mutation runs restored the exact production bytes after every injected fault. Each row below
was observed to fail its named production-path test with exit 1; no parse/load errors count as
proof. Adjacent `Proof:` comments identify the safety boundaries.

| Injected production fault | Observed failing production-path proof                      |
| ------------------------- | ----------------------------------------------------------- |
| sql-encoding              | stored encoding constraint                                  |
| nonnull                   | stored null encoding constraint                             |
| down-shared               | shared organization refuses downgrade                       |
| down-ranks                | rank independently refuses downgrade                        |
| strict-decode             | corrupt trusted row read                                    |
| missing-organization      | missing trusted organization read                           |
| backup-header             | malformed/duplicate complete backup refuses before mutation |
| backup-mode               | malformed/duplicate complete backup refuses before mutation |
| backup-org-unique         | malformed/duplicate complete backup refuses before mutation |
| backup-rank-unique        | malformed/duplicate complete backup refuses before mutation |
| snapshot-transaction      | coherent concurrent mode/rank capture                       |
| physical-readonly         | injected write on dedicated save connection                 |
| snapshot-close            | close after injected snapshot read throw                    |
| remove-complete-match     | stale mode, rank and organization identities                |
| remove-atomic             | late remove failure leaves all prior state                  |
| restore-supported         | shared restore refuses before first-write trap              |
| restore-saved-exists      | missing saved organization named refusal                    |
| restore-empty-ranks       | nonempty current ranks refusal                              |
| restore-isolated-current  | additional shared organization refusal                      |
| cli-environment           | real CLI names missing DB_PATH                              |
| cli-arguments             | real CLI names invalid arguments with usage refusal         |
| cli-exclusive             | existing recovery bytes stay unchanged                      |
| cli-private               | created backup permissions are 0600                         |
| capability-advertise      | physical current release advertises isolated only           |
| probe-invalid-path        | physical dangling CLI symlink refuses                       |
| probe-missing-source      | physical missing source refuses                             |
| probe-missing-table       | physical missing organization table refuses                 |
| probe-invalid-encoding    | physical corrupt SQLite encoding refuses                    |
| probe-physical-readonly   | physical missing database remains absent                    |
| probe-column-truth        | physical counts reveal shared state                         |
| swap-registration         | swap refuses before migration and after outgoing stop       |
| restore-atomic            | concurrent restore eligibility writer stays locked          |

The initial atomic-remove mutation had a syntax error and was discarded; the corrected callback
without a transaction failed on partial database state. Initial physical read-only mutation still
refused through the missing-table guard, so the negative was strengthened to assert that the
absent database is never created, then observed failing with the mutable opener.

Focused validation before the final rerun: five-file mode/recovery/rank/Docker/swap command
passed 227 tests, 636 assertions, exit 0. OpenSpec validation passed all 146 artifacts. Initial
scoped typecheck found widened map inference and an unknown SQL-row reflection; both were
corrected with precise return typing and an explicit object boundary. Scoped lint required
import sorting, non-void callback braces, nondeprecated SQLite writes and an explicit all-row
delete predicate. Existing migration tests initially exposed their complete-history inventories;
only those expectations are extended for the new migration. Final validation follows below.

Canonical exact-head gate, substantive CI and independent Astra review remain required before
merge. Runtime shared activation, solver installation, cache/fan-out, UI and mode-route checks
remain outside this bounded release and unperformed.

Final scoped commands (fresh, cache bypassed):

| Command                                                                                                                                                                                             | Observed outcome                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `bun test` with mode, combined recovery, rank, Docker and swap files                                                                                                                                | 227 pass / 0 fail; 636 assertions across five files, exit 0 (14.48s)           |
| `bun test libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts libs/wbs/adapters/store-sqlite/src/migrate.db.test.ts`                                                                         | 90 pass / 0 fail; 414 assertions, exit 0 (11.40s)                              |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck,build -p wbs-store-sqlite,wbs-domain,tool-remote-scripts,wbs-be-01 --parallel=2 --skip-nx-cache --output-style=static` | All targets for four projects and four dependency tasks passed; exit 0 (38.4s) |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261005110000_add_shared_people/migration.sql`                                                                    | exit 0                                                                         |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                            | 146 passed / 0 failed, exit 0                                                  |
| `git diff --check`                                                                                                                                                                                  | exit 0                                                                         |

The broader root path-filter command was discarded because Bun also discovered generated
`dist/out-tsc` test files. A correct adapter-cwd run then identified the partial recovery audit
obligation. Independent Astra review confirmed the existing full-row INSERT recovery exceptions
do not apply to mode+id organization UPDATEs. Both remove and restore now take an explicit
operator instant and apply `auditOnUpdate({ at })`; the CLI supplies `Date.now()`. No audit test
or exemption is changed. The fixed-instant behavior case failed before the correction, then
combined recovery and production audit suites passed 29 tests / 102 assertions, exit 0 (3.40s).
Late failures assert entire organization rows unchanged, including audit fields; additional
isolated organizations stay byte-for-byte untouched, and restored ranks retain historical audit
fields. The in-flight adapter-cwd run imported the pre-correction production module, so its two
audit/stamp failures do not establish the corrected head; exact-head canonical verification remains
required. Root-generated output discovery and sandbox stdin failures are tooling limits, not
accepted product degradation.

Audit follow-up final verification: independently dropping the remove stamp and restore stamp
failed the fixed-instant production-path recovery test (exit 1 in each case), then exact bytes
were restored. Final fresh scoped lint/typecheck/build command above passed all targets and four
dependency tasks again, exit 0 (37.3s), after the explicit audit API change. The correct adapter-cwd
run completed 1256 pass / 2 fail / 10645 assertions across 95 files (147.87s), with exactly the
two pre-correction audit/stamp failures; it is superseded for those two cases by the corrected
29-test GREEN run and must not be presented as a complete final-head pass. Canonical exact-head
verification will replace that incomplete broad evidence before merge.

Corrected final-head focused command adds `audit.test.ts` to the five mode/recovery/rank/Docker/
swap files: 234 pass / 0 fail, 648 assertions across six files, exit 0 (14.67s). Fresh migration
lint and OpenSpec all-validation passed again. Explicit changed/new-path Nx format write/check
passed after the audit correction, and `git diff --check` is clean. Self-review confirms the
remaining historical test edits only update complete migration inventories or the newest-name
expectation; existing migration scripts and rank recovery semantics are unchanged.

### Canonical-gate correction: recovery CLI declared test inputs

At committed head `8f273875d2895b18fddf6835b65612dadb950540`, the gate's existing
outside-project read audit correctly refused `wbs-store-sqlite:test` because it omitted
`apps/wbs/be-01/src/shared-people-rollback-cli.ts`. `shared-people-rollback.db.test.ts`
intentionally resolves that source with `new URL` and launches it with `Bun.spawn` to test
real-process recovery, exclusive/private file creation, environment/argument refusal and backup
read failures. Both `test` and `test:api` execute this DB test, so both now explicitly declare
the single CLI source input. Unit and conformance-only targets do not execute it. Runtime code,
audit logic and safety checks are unchanged; no mirrored test is added.

The exact missing-input production audit was watched RED (0 pass / 1 fail, exit 1), then GREEN
(1 pass / 0 fail, two assertions, exit 0, 1.74s) after declaration. Its existing negative proves
that removing this input is detected; this is a dependency declaration fix, not a new check.

| Command                                                                                                                                                                                      | Observed outcome                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| From `tools/tool-devsync`: `NX_DAEMON=false bun test --preload ../test/scratch/preload.ts --timeout=30000 --test-name-pattern 'names every file a suite reads from outside its own project'` | RED before / GREEN after as above               |
| From `tools/tool-devsync`: `NX_DAEMON=false bun test --preload ../test/scratch/preload.ts --timeout=30000 src/workspace-targets.test.ts`                                                     | 22 pass / 0 fail, 74 assertions, exit 0 (2.52s) |
| From `libs/wbs/adapters/store-sqlite`: `bun test src/shared-people-rollback.db.test.ts --test-name-pattern 'combined recovery CLI'`                                                          | 4 pass / 0 fail, 30 assertions, exit 0 (2.50s)  |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint --skip-nx-cache --output-style=static`                                                                           | passed, exit 0 (14.0s)                          |
| `git diff --check`                                                                                                                                                                           | exit 0                                          |

Changed-path Nx format write/check passed for `project.json` and this verification artifact, exit 0.

Typecheck/build were not repeated for this test-input-only metadata correction; application
behavior and TypeScript are unchanged. The coordinator will rerun the canonical exact-head
h2puni gate on the corrected commit before merge. Trusted activation remains deferred.

## Runtime/cache progress — 6.1a–b/6.2a–b implemented; 6.1c–f pending

Architecture baseline is merged main `8bccd93bc537cffac85b53ea056a79f786558eda`, after storage
PR #265. Bounded 6.1a/6.2a implementation on `feat/shared-people-runtime` is recorded below.
The parser count remains **17/23**, with umbrella 6.1/6.2 and UI/mode-route 7/8 unchecked.
Steps 6.1a–b/6.2a–b are implemented and proved; 6.1c–f, durable fan-out and activation remain
pending. Intent remains 379 words; no new glossary term, ADR, migration or release capability is added.

### Runtime proof status — 6.2a–b observed; 6.2c–f pending

The 6.2a rows below were injected separately and observed RED; final focused restoration is
37 pass / 0 fail. The 6.2b proof rows were also injected separately and observed RED; see the
6.1b/6.2b evidence section below for exact commands and outcomes. Rows 6.2c–f remain required
future production-path negatives. A parse/load error does not count.

| Step | Production fault to inject                                    | Required production-path test and expected failure                                   | Observation                                                                                                                                                         |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.2a | Force shared scheduling for isolated/legacy access            | Mounted mode read moves an isolated date or changes its input hash                   | Observed exit 1: isolated influencers a1/a2 instead of []                                                                                                           |
| 6.2a | Remove scoped ownership/cross-reference validation            | Foreign project/person enters the chain or corrupt crossing input is accepted        | Observed exit 1: foreign person exposed; removed ownership/rank checks lost named refusal                                                                           |
| 6.2a | Read mode/rank/assignments outside the owned snapshot         | Concurrent combined edit returns a mixed chain                                       | Observed exit 1: target start 2 instead of 3; separate mode connection tore rank/readable state                                                                     |
| 6.2a | Default malformed mode or skip snapshot close                 | Corrupt mode returns dates, or refusal/throw leaks the read connection               | Observed exit 1: corrupt mode accepted; background close count 0 instead of 1                                                                                       |
| 6.2b | Omit target elsewhere or its response projection              | Mounted tree/export loses displaced dates, holder or waiting count                   | Observed RED; see 6.1b/6.2b evidence below                                                                                                                          |
| 6.2b | Replace command-bound readers with a fresh connection         | Arrange/preflight ignores staged writes and accepts or arranges the wrong plan       | Observed RED; see 6.1b/6.2b evidence below                                                                                                                          |
| 6.2c | Remove incoming basis from memo acceptance                    | Warm load/space returns old B dates after only A changes                             | Not run                                                                                                                                                             |
| 6.2c | Check cache before required influencer availability           | Warm available dates survive an engine-unavailable influencer                        | Not run                                                                                                                                                             |
| 6.2c | Read aggregate projects from incompatible snapshots           | Concurrent upstream edit produces mutually inconsistent shared load/space bookings   | Not run                                                                                                                                                             |
| 6.2d | Rebuild queue/debounce/Retry input without elsewhere          | Solver input differs from live shared input or old Retry hash is accepted            | Debounce omission watched: request lost holder; queued shared rebuild passes. Retry pending contract ruling.                                                        |
| 6.2d | Skip unlaunched reservation release on refusal/throw          | Queued capture negative leaves a counted slot or launches a refused input            | Watched: thrown capture left one counted `starting` slot; disabled capture launched PRI.                                                                            |
| 6.2d | Admit target work before snapshot close                       | Read-only capture oracle observes generation/slot/queue mutation during derivation   | Watched: omitting owned close left one open read at both launch handoffs.                                                                                           |
| 6.2e | Drop shared capture at installer/composition boundary         | Mounted save/current misses upstream displacement                                    | Not run                                                                                                                                                             |
| 6.2e | Reread live influencers for a historical saved display        | Upstream edit/delete changes saved schedule bytes                                    | Not run                                                                                                                                                             |
| 6.2f | Omit only the input-hash predicate in current full-key lookup | H1 outcome serves after B's incoming calendar becomes H2 with generation unchanged   | Observed RED in `/tmp/shared-people-slice6f-hash-predicate-red.log`; H2 became ready/proven instead of pending.                                                     |
| 6.2f | Swallow unavailable/unknown chain outcomes                    | Target returns unmarked Fast dates or hides an unexpected failure                    | Retained chain regressions passed; this existing guard was not re-mutated in 6f.                                                                                    |
| 6.2f | Advertise shared before deferred prerequisites                | Physical capability probe no longer equals isolated-only; shared restore is admitted | Capability mutation RED in `/tmp/shared-people-slice6f-capability-red.log`; independent restore-guard omission RED in `/tmp/shared-people-slice6f-restore-red.log`. |

### Planned implementation validation

Run focused tests from their owning project directories so generated `dist/out-tsc` copies
cannot satisfy discovery. Use actual filenames created by 6.1a–f in the execution record;
the task ids and cases above are the acceptance contract, not claims that tests already exist.

- Focused suites must cover core live projection/transactional consumers, chain and saved-plan
  module composition, load/space, mounted SQLite routes, optimization coordinator and cache
  publication. Preserve existing wire-v3/preflight, immutable saved bytes, scoped authority,
  materialized-row and lifecycle regressions.
- Run scoped Nx test/lint/typecheck/build for every affected project with `--skip-nx-cache`.
  Expected owners are `wbs-core`, `wbs-store-sqlite`, `wbs-be-01` and any domain/contracts owner
  actually changed. Recheck module boundaries, source classification and explicit outside-project
  test inputs if new source/test files require them; do not exempt an audit to make it green.
- Run `bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --type change --json`
  and `bunx @fission-ai/openspec@1.12.0 validate --all --json`.
- Before implementation completion, run `bin/h2puni-gate.sh <implementation-sha>` under the
  canonical lock and record the printed SHA and full outcome. That gate owns full test, lint,
  typecheck, build and `format:check --all`; do not substitute a raw full Nx gate. Then record
  substantive exact-head CI and independent review.

For remaining 6.1c–f work, runtime tests, mutation runs, scoped implementation checks and the
implementation gate have not run. This 6.1b slice's scoped checks and mutation evidence are
recorded below; its canonical exact-head gate remains pending. Live solver deployment/binding
was not run. Delta sync/archive is pending because the end-state change is incomplete. Durable
fan-out/event evidence, UI 7, mode route 8 and activation remain deferred requirements, not
removed scope.

### Planning-artifact validation

These executed commands establish artifact shape and unchanged implementation counts, not
runtime correctness. Nx format write/check used the six changed paths: `design.md`, `tasks.md`,
`verify.md`, and `specs/{elsewhere-scheduling,person-load,shared-people-mode}/spec.md`, each under
`openspec/changes/share-people-across-projects/`.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Observed result                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --type change --json`                                                                                                                                                                                                                                                                                                                                                                                          | 1 passed / 0 failed, no issues, exit 0                |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                                                                                                                                                                                                                                                                               | 146 passed / 0 failed (128 changes, 18 specs), exit 0 |
| `bunx @fission-ai/openspec@1.12.0 instructions apply --change share-people-across-projects --json`                                                                                                                                                                                                                                                                                                                                                                                     | total 23, complete 17, remaining 6, exit 0            |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --files=openspec/changes/share-people-across-projects/design.md,openspec/changes/share-people-across-projects/tasks.md,openspec/changes/share-people-across-projects/verify.md,openspec/changes/share-people-across-projects/specs/elsewhere-scheduling/spec.md,openspec/changes/share-people-across-projects/specs/person-load/spec.md,openspec/changes/share-people-across-projects/specs/shared-people-mode/spec.md` | no output, exit 0                                     |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | no output, exit 0                                     |
| `wc -w openspec/changes/share-people-across-projects/proposal.md`                                                                                                                                                                                                                                                                                                                                                                                                                      | 379 words; unchanged                                  |

Full `format:check --all`, runtime tests, mutation proofs, lint/typecheck/build and the canonical
implementation gate are intentionally unperformed for this docs-only planning commit. Their
future commands and obligations remain above; the earlier storage evidence is not runtime proof.

## Runtime 6.1a / paired 6.2a — mode-aware coherent read

Implemented on `feat/shared-people-runtime`, starting exactly at
`54708c0f13c6d6da84d1671bbdf6054b0ee53c42`. Umbrella 6.1/6.2 remain unchecked.
Owned human and project-owned readers require a target; isolated/legacy materialize only that
project, without rank or project-list reads. The application retains influencer closure,
scheduling and booking projection; the adapter chooses the mode's readable candidate capability
before materialization. `ChainAccess` is an organization-only value, never a synthetic user/role.
`readChainSnapshotIn` borrows an authorized transaction and `readChain` returns detached values;
it does not begin, commit or close that transaction. No live tree/consumer/cache/admission wiring
from 6.1b–f, setter, fan-out, mode route or activation was added.

Observed RED before behavior: `bun test libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts
--test-name-pattern 'shared runtime selects mode'` exited 1: isolated influencers expected `[]`,
received `a1/a2`. Background entrypoint RED exited 1 with missing `withProjectSnapshot`.
Target-first refinement RED exited 1 in `never materializes upstream assignments for isolated or
legacy targets` with `upstream isolated assignment read`.

Final commands (2026-10-05):

- `bun test libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts
libs/wbs/application/core/src/service/shared-people.test.ts`: 37 pass, 0 fail,
  115 assertions, exit 0, after all final code changes.
- The same two files plus `saved-plan-capture.db.test.ts`, `shared-people-mode.db.test.ts` and
  `testing/source-conformance.db.test.ts` under store-sqlite: 140 pass, 0 fail,
  6690 assertions, exit 0 (29.82 s).
- `bunx eslint` on the six changed TypeScript files: exit 0, no output, with Nx's project graph
  present. An earlier import-sort failure was fixed. The earlier graphless invocation reported
  a skipped module-boundary check and was not accepted as verification.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck`:
  actual target ran, exit 0, `Successfully ran target typecheck`, 3.2 s, cache 0/1.
  Earlier direct Nx returned socket diagnostics without running the target; ignored as proof.
  One intermediate test callback implicit-this error was corrected before this final pass.
- `git diff --check`: exit 0.

Each mutation below was run separately against the production SQLite test path with its source
restored immediately afterward; each exited 1. Logs are session-local
`/tmp/shared-people-runtime-proof-<fault>.log`.

| Injected fault                                            | Observed production-path failure                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Strict mode decoder always returns shared                 | mode-selection test returned a1/a2 influencers under isolated instead of []                                           |
| Human isolated target selection disabled                  | narrow project-list test threw `isolated project list`                                                                |
| Background isolated target selection disabled             | narrow project/rank test threw `isolated rank list` after human read succeeded                                        |
| Isolated rank selection bypassed                          | narrow project/rank test threw `isolated rank list`                                                                   |
| Capture receives legacy instead of scoped authority       | scoped cross-reference/directory test exposed `foreign` person                                                        |
| Human transaction replaced by no-op begin/commit/rollback | concurrent mode/rank/assignment/date test read target start 2 instead of 3                                            |
| Mode read on another connection                           | authority-bound concurrent mode test threw rank/readable disagreement, demonstrating mixed states                     |
| Missing project-ownership guard removed                   | corrupt-mode/broken-ownership test got undefined dereference instead of named ownership refusal                       |
| Project-owned ranked-project null guard removed           | broken-readable dependency test got null dereference instead of named rank refusal                                    |
| Background transaction replaced by no-op                  | background concurrent mode/assignment/date test read target start 2 instead of 3                                      |
| Background commit omitted                                 | background lifecycle test refused nested BEGIN in close-time transaction-release assertion                            |
| Background close omitted                                  | background lifecycle test observed 0 closes instead of 1                                                              |
| Malformed-mode decoder guard removed                      | corrupt-mode test got expected-operation-to-throw instead of strict mode refusal                                      |
| Factory opens writable connection (with real import)      | readonly-factory test's unsafe UPDATE succeeded instead of throwing; final test asserts wrapped SQLITE_READONLY cause |

The early core-dispatch removal was observed before target-first refinement; final mode dispatch
proof is the strict decoder mutation above, because isolated capabilities now contain only the
target. That redundant core branch was removed rather than keeping an unbreakable safety check.

Full canonical gate, build, live deployment and broader runtime/cache consumers were not run for
this bounded task. The controller owns exact-head integration gate and independent review.
`SUPPORTED_CAPACITY_MODES` and all activation boundaries remain isolated-only.

Review follow-up: added the missing adjacent `Proof:` comment to background isolated target
selection, referencing its already-observed independent mutation. No behavior changed. Repeated
the exact six-file ESLint command (exit 0), actual store-sqlite Nx typecheck (exit 0) and focused
chain/application suite (37 pass, 0 fail, 115 assertions, exit 0).

## Runtime 6.1b / 6.2b — detached live and export projection

Bounded to live tree, JSON/Markdown export and borrowed arrange/calendar preflight. Core holds
pure detached values; source composition binds ordinary read-only and admitted command readers
with the same scheduler factory and optimization options. A human scope retains user identity
and revalidates activation/membership on the snapshot DB before project/rank reads. Project-owned
commands use a distinct method. Access refusal propagates as whole-request 403 through tree,
export, load and space, without unavailable output or memo publication. Export captures full
scoped catalogs only for export because saved-input `CapturedPerson` omits the live person's
required `kind`; public tree payloads contain no export context. `exportedAt` stays generation time.

Initial mounted REDs were observed before implementation: `shared tree and export agree`
expected start/finish 3/4 but returned 0/1; staged arrange expected other/lower but returned
lower/other. The first oversized preflight fixture (80m single estimate) received boundary 400
and was discarded; valid three 30m estimates then exercised actual calendar 422 and rollback.
The independent date and estimate tests separate arrangement from preflight.

Authorization RED: `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts
--test-name-pattern 'refuses revocation between'` returned 200 with concurrently edited upstream
rows (start 7) instead of 403/not_a_member; 0 pass, 1 fail. After fixing the scope boundary, all six
cold-cache callers refused. Revocation after snapshot authority preserves its authorized captured
response; the next request refuses. Legacy activation races refuse; missing, unreadable or
malformed marker and malformed stored role return 500 rather than legacy success.

Structured export RED: `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts
--test-name-pattern 'keeps structured export'` exited 1 (0 pass, 1 fail, 2 assertions): project/settings
were the earlier project while catalogs/markers were later values. Removing the preliminary
project lookup moved that fixture's repository hook inside BEGIN; it was moved to the actual
`afterResolve` boundary, retaining expected Captured project/revision 7. JSON and Markdown then
passed (2 pass, 5 assertions). Snapshot-adjacent project/directory/marker edits remain in the fixture.

Observed independent R5 faults (each Bun child exit 1, source bytes restored in `finally`):

| Guard or dependency              | Injected fault and observed failure                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target incoming calendar         | Omit target elsewhere input: mounted target start/finish 0/1 instead of 3/4.                                                                                         |
| Optional waiting count           | Omit live waitingElsewhere projection: undefined instead of 1.                                                                                                       |
| Borrowed command DB              | Replace borrower with dedicated fresh DB: staged order and staged-date order wrong; independent calendar expected 422, received 200.                                 |
| Production installation          | Omit source.bindLivePlans: mounted target starts 0 instead of 3.                                                                                                     |
| Captured optimized cache binding | Substitute process-bound cache reader: first response starts 4 instead of captured 3.                                                                                |
| Owned BEGIN observation          | Omit owned transaction: metadata and cache-publication fixtures both mix newer writes.                                                                               |
| Owned COMMIT                     | Omit commit: success/refusal close-time BEGIN fails because transaction remains active.                                                                              |
| Owned ROLLBACK                   | Omit rollback: dependency-failure close-time BEGIN fails because transaction remains active.                                                                         |
| Owned CLOSE                      | Omit close: all three lifecycle cases observe zero closes instead of one.                                                                                            |
| Ranked live project              | Make repository return null for a ranked project, then remove guard: unrelated null dereference replaces named trusted-state refusal.                                |
| Ranked live target               | Rank dependency omits target, then remove guard: live read resolves instead of throwing.                                                                             |
| Legacy activation recheck        | Remove recheck: admission-to-snapshot activation yields 200 instead of 403.                                                                                          |
| Scoped activation recheck        | Remove recheck after injected durable-marker reset: 200 instead of 403.                                                                                              |
| Snapshot membership refusal      | Ignore refusal after concurrent removal: 200 with new upstream rows instead of 403.                                                                                  |
| Tree/export wire refusal         | Remove each mapping independently: 500 instead of declared 403.                                                                                                      |
| Load/space refusal projection    | Restore generic kind-to-unavailable conversion separately: 200 with unavailable output instead of 403.                                                               |
| Export project evidence          | Reread project after snapshot: Later project/revision 8 instead of Captured project/revision 7.                                                                      |
| Export directory evidence        | Reread people after snapshot: Later Ana instead of Local Ana.                                                                                                        |
| Export marker evidence           | Reread markers after snapshot: Later marker instead of Captured marker.                                                                                              |
| Isolated public fixture contract | Bypass public isolated tree: mounted disappearance returned 200 instead of 404; malformed core fields returned 200 instead of 500. Public fixture dispatch restored. |

Fault logs are `/tmp/shared-people-live-proof-<fault>.log`; the implementer report records exact
filenames. Marker/role parser guards are reused unchanged and retain their existing adjacent
proofs; export's uncoded-step, missing-reference and typed-dependency guards are retained in the
pure assembler and their 27 existing tests passed (68 assertions).

Checks before the final isolated fixture correction:

| Command                                                                                                                                                               | Fresh output                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `bun test` schedule-organization, chain-snapshot, person-load.feature, space.resource, work-item/module and module-boundaries test files                              | 118 passed, 0 failed, 293 assertions.                                                                    |
| `bun test` both SQLite/memory source-conformance files and core module-boundaries test                                                                                | 161 passed, 0 failed, 11514 assertions after explicit memory absent-capability inventory correction.     |
| `bun test libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts --test-name-pattern 'materializes only assigned'`                                            | 1 passed, 0 failed, 5 assertions. An earlier search in services.db matched zero tests and was discarded. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-conformance,wbs-be-01 --skip-nx-cache --output-style=static` | All 4 projects + 2 module dependencies passed, 39.8s.                                                    |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:build --skip-nx-cache --output-style=static`                                                          | Actual build + dependency passed, 5.2s.                                                                  |
| `bunx eslint $(git diff --name-only -- '*.ts')`                                                                                                                       | Exit 0 after import/fixture fixes.                                                                       |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                              | Exit 0, 146 passed, 0 failed.                                                                            |

The first broad export validation reported 121 passed / 2 failed because two isolated controller
fixtures override public tree reads. Their expectations were preserved, dispatch fixed, and the
focused two-case rerun passed. Final post-correction check output is recorded below.

Fresh independent Astra review found no remaining important correctness issue; its focused rerun
passed 96 tests / 349 assertions. The canonical exact-head host gate, CI secrets/migration checks,
deployment and live solver binding remain unrun. Tasks 6.1/6.2 remain unchecked at 17/23; only
inline 6.1b/6.2b are complete. c–f, shared activation, cache-basis/fan-out/admission/saved
callback/UI behavior remain pending; supported modes still advertise isolated only. No migration,
algorithm, saved hash address or stored-byte change.

Final post-correction validation:

| Command                                                                                                                                                                                                                         | Fresh output                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts apps/wbs/be-01/src/controller/project.controller.test.ts` | Exit 0; 123 passed, 0 failed, 417 assertions.                   |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01 --skip-nx-cache --output-style=static`                                                                                            | Exit 0; both projects + both module dependencies passed, 33.1s. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:build --skip-nx-cache --output-style=static`                                                                                                                    | Exit 0; build + dependency passed, 2.4s.                        |
| `bunx eslint $(git diff --name-only -- '*.ts')`                                                                                                                                                                                 | Exit 0; no errors.                                              |
| `bunx prettier --write $(git diff --name-only)` and `git diff --check`                                                                                                                                                          | Exit 0; final artifact formatting checked separately.           |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                        | Exit 0; 146 passed, 0 failed after D10/task/verification edits. |

The first GitHub workspace gate run exposed two follow-up defects. The independent source
conformance inventory omitted `livePlans.read:legacy-and-absence`, and the staged database
regression relied on a single microtask to prove a detached read completed while the solver was
blocked. Both failures reproduced locally before the corrections. The inventory now includes the
case in its independent catalog and expected list; the regression awaits the read while the fake
solver remains unresolved and releases it in `finally`.

| Follow-up command                                                                                                                                    | Fresh output                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `bun test apps/wbs/be-01/src/services.db.test.ts --test-name-pattern 'returns a live plan read while its newly admitted solver is still unresolved'` | Exit 0; 1 passed, 0 failed, 2 assertions.                                                                       |
| `bun test libs/wbs/application/conformance/src/stores/existing.test.ts libs/wbs/application/conformance/src/case-manifest.test.ts`                   | Exit 0; 4 passed, 0 failed.                                                                                     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test -p wbs-conformance wbs-be-01 --skip-nx-cache --output-style=static`               | Exit 0 with approved socket/process access; conformance 35 passed, backend 1,651 passed / 1 skipped / 0 failed. |
| `bunx prettier --check` on the three changed TypeScript files and this verification record; `git diff --check`                                       | Exit 0; formatting clean and no whitespace errors.                                                              |

The follow-up edits are not included in the implementation commit yet. GitHub status could not
be refreshed from this environment because `api.github.com` was unreachable. The canonical
`bin/h2puni-gate.sh <sha>` also remains unrun for the follow-up because this workspace lacks the
required `/home/puni1/.cache` host-wide lock location. Trusted activation CI remains deferred by
user instruction; it is a distinct check from the implementation gate.

No source fault remains injected. The implementation and independent review are ready for
integration; the exact-head gate and CI checks remain outstanding.

## Runtime 6.1c / 6.2c — incoming-calendar cache identity

The mounted person-load RED was observed first on `c5f16573`: `bun test
apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern
'refreshes a warm target booking'` exited 1, returning Billing start `2026-10-08` after
Platform grew to five days, where `2026-10-12` was required. After the batch observation
implementation the same test passed. The mounted isolated-mode switch RED likewise exited 1:
warm shared Billing `2026-10-08` persisted after mode returned to isolated, instead of
`2026-10-05`; the isolated memo discriminator then made it pass.

The null-basis mounted RED used two isolated 40,000,000-workday estimates and warmed both
person-load and space roll-up caches. After `shared_people` became 1, the live Billing tree
reported `calendar_range`, but load still returned Billing as available. The test now passes:
shared load reports Billing unavailable with `calendar_range`, shared roll-up carries that
error, and both isolated outputs recover when the mode returns to 0 without another write.

The aggregate read uses one owned SQLite read transaction for authority, mode, rank, project
captures, selected optimization, revision, sequence and tree metadata. Captured plans and
scheduler reads are reused across target closures; one aggregate test observed exactly four
scheduler calls for four targets with overlapping chains. Shared load and space inspect captured
availability before held entries, compare the adapter-owned SHA-256 incoming-calendar basis
alongside existing cache dimensions, and project misses from the same captured tree. The domain
canonicalizer is shared with the full scheduler input and preserves absent/empty calendar bytes.
Mounted tests cover person and organization load, roll-ups and in-progress after upstream-only
estimate/date edits, exact-key ready upstream publication, unavailable influencer and target,
recovery, whole-request typed revocation and second-connection coherence. A rank/name fixture
kept both basis and full input hash stable; an upstream date changed both. Holder and interval
dimensions have the domain canonicalizer test. Isolated cache reuse, access separation and TTL
retain their prior tests.

Each fault below was injected independently on the production path, tested with Bun, and
restored in `finally`; every listed command exited 1. The log paths contain the full output.

| Fault and exact command                                                                                                                                                                                                                                     | Observed failure                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit load basis comparison: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern 'refreshes a warm target booking'` (`/tmp/shared-people-cache-proof-load-basis.log`)                                              | Billing remained `2026-10-08`, expected `2026-10-12`.                                                                                                                                                                                                          |
| Omit space basis on both lookup and storage: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern 'refreshes warm space'` (`/tmp/shared-people-cache-proof-space-basis.log`)                                       | Warm roll-up remained `2026-10-08`, expected `2026-10-12`; the same case asserts in-progress dates.                                                                                                                                                            |
| Accept held load before availability: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern 'marks a warm target unavailable'` (`/tmp/shared-people-cache-proof-availability.log`)                                  | Billing remained an available booking, expected absent from projects and listed unavailable.                                                                                                                                                                   |
| Bypass only the aggregate owned transaction: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern 'overlapping target chains'` (`/tmp/shared-people-cache-proof-aggregate-snapshot.log`)                           | The response mixed Platform's old `2026-10-05` start with Billing's after-write `2026-10-05`, expected old coherent pair `2026-10-05`/`2026-10-08`. A preliminary mutation of the shared transaction begin failed fixture setup at ROLLBACK and was discarded. |
| Ignore aggregate membership revalidation: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern 'between route admission and aggregate'` (`/tmp/shared-people-cache-proof-aggregate-authority.log`)                 | Revocation between route admission and snapshot returned 200 with dates, expected 403/not_a_member.                                                                                                                                                            |
| Ignore aggregate scoped activation recheck: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --test-name-pattern 'activation reset between route admission'` (`/tmp/shared-people-cache-proof-aggregate-activation.log`)           | Marker reset after route admission returned 200 with dates, expected 403/no_active_organization.                                                                                                                                                               |
| Ignore aggregate legacy activation recheck: `bun test libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts --test-name-pattern 'refuses a legacy aggregate read'` (`/tmp/shared-people-cache-proof-aggregate-legacy-activation.log`)                | The adapter answered isolated after activation, expected access_refused/no_active_organization. The mounted route still returned 403 through an earlier route gate, so the adapter-path test proves this guard.                                                |
| Omit load null-basis lookup guard: `bun test apps/wbs/be-01/src/controller/person-load.controller.db.test.ts -t 'does not reuse isolated load or roll-up entries when a shared chain has no basis'` (`/tmp/shared-people-cache-proof-load-null-lookup.log`) | Shared load kept Billing available after live `calendar_range`; expected absent from projects.                                                                                                                                                                 |
| Omit load null-basis storage guard: same command (`/tmp/shared-people-cache-proof-load-null-storage.log`)                                                                                                                                                   | Return to isolated omitted Billing because the shared error replaced the isolated memo entry.                                                                                                                                                                  |
| Omit space null-basis lookup guard: same command (`/tmp/shared-people-cache-proof-space-null-lookup.log`)                                                                                                                                                   | Shared roll-up reported `scheduleError: null` where `calendar_range` was required.                                                                                                                                                                             |
| Omit space null-basis storage guard: same command (`/tmp/shared-people-cache-proof-space-null-storage.log`)                                                                                                                                                 | Return to isolated kept `scheduleError: calendar_range` where null was required.                                                                                                                                                                               |

Adjacent `Proof:` comments identify these faults in the cache and transaction code. No fault
remains injected. This task does not run the exact-head host gate: the worktree is uncommitted,
and the coordinator owns the integration gate. Tasks 6.1/6.2 remain unchecked; 6.1d–f and
activation remain pending.

Final scoped checks:

| Command                                                                                                                                                          | Observed result                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` with the person-load, space-organization, schedule-organization, chain-snapshot, PersonLoad, SpaceResource and canonical-schedule-input test files    | Exit 0; 172 passed, 0 failed, 504 assertions. Full log: `/tmp/shared-people-cache-final-tests.log`.                                                                                             |
| `bun test libs/wbs/domain/domain/src/canonical-schedule-input.test.ts` after the final optional-argument type correction                                         | Exit 0; 36 passed, 0 failed, 77 assertions.                                                                                                                                                     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-domain,wbs-core,wbs-store-sqlite,wbs-be-01 --skip-nx-cache --output-style=static` | Exit 0; four projects and two dependencies passed. The first run exposed a required parameter used without an argument in the new domain test; the signature was corrected and this run passed. |
| `bunx eslint` on the 13 changed TypeScript files                                                                                                                 | Exit 0 after import ordering and test fixture corrections.                                                                                                                                      |
| `bunx prettier --check` on the changed TypeScript and OpenSpec files; `git diff --check`                                                                         | Both exit 0.                                                                                                                                                                                    |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                         | Exit 0; 146 passed, 0 failed.                                                                                                                                                                   |

The canonical host gate, full Nx test/lint/build, CI secrets and migration checks, deployment
and live solver binding were not run in this bounded, uncommitted worktree.

## Runtime 6.1d / 6.2d — shared optimizer admission and Retry

The mounted live-tree read uses one captured shared input and settings after its owned SQLite
observation closes; its response retains that captured display. Project-owned capture supplies
edit debounce and queued restart. Human-scoped capture supplies Retry and rechecks access after
route admission. A required unavailable chain returns typed HTTP 409
`schedule-input-unavailable` with reason and readable failing project identity; it does not
invent a hash or fall back to local input. Upstream-only changes stale the old hash, and a
matching hash launches the holder-bearing shared request. Unlaunched queue reservations are
released for absence, unavailable/disabled/stale capture, preflight refusal and thrown capture;
launched children retain their seats until terminal evidence or cancellation.

Mounted cases assert two holder-bearing initial requests, canonical hash and durable generation
and slots; an upstream-only edit changes the request with the target revision fixed. Concurrent
enablement/engine and upstream estimate changes cannot mix observations. The initial response
stays idle, and launcher callbacks see zero open read connections. Export and borrowed command
reads launch nothing. Queue cases inspect actual FIFO launch calls and durable slots; the
unexpected-exception case now also admits the next queued TIME request after cleanup. Retry
cases inspect the wire request, old/current hashes, full generation/cache/slot/queue/event
snapshots on refusal, human access recheck and read-close ordering. Target cycle/range refuse;
upstream cycle/range continue with skipped bookings. The public response contract and client
reject malformed reason or project identity.

### R5 watched faults

Each log below records one Bun production-path test run with an independent injected fault;
the source was restored after each RED. The seven initial/queue faults were watched before
the amended Retry implementation; the five Retry faults were watched after it. All twelve
named runs exited 1 with exactly one failing test. The exact test commands use the named
pattern against the indicated file; full raw output is at each path.

| Fault                                              | Command and raw log                                                                                                                                                                                                            | Observed RED                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Omit `buildServices.captureOf`                     | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'edit admission hashes the changed upstream booking'` — `/tmp/shared-people-r5-01-capture-wiring.log`                  | Holder-bearing `elsewhere` missing from actual edit request.                                        |
| Skip initial live-tree admission                   | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'admits a holder-bearing shared input after the captured tree closes'` — `/tmp/shared-people-r5-02-tree-admission.log` | Zero launches instead of two.                                                                       |
| Reread enablement outside snapshot                 | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'keeps optimizer enablement and upstream input on one observation'` — `/tmp/shared-people-r5-03-coherent-settings.log` | Two launches from old booking instead of none.                                                      |
| Omit owned snapshot close                          | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'closes the shared observation before admitting'` — `/tmp/shared-people-r5-04-snapshot-close.log`                      | Launcher observed an open read connection.                                                          |
| Omit queued captured-disable guard                 | `bun test apps/wbs/be-01/src/service/optimization-restart.db.test.ts --test-name-pattern 'releases a queued reservation after disabled capture'` — `/tmp/shared-people-r5-05-queue-disabled.log`                               | Disabled PRI launched beside next TIME.                                                             |
| Bypass queued typed-unavailable guard              | `bun test apps/wbs/be-01/src/service/optimization-restart.db.test.ts --test-name-pattern 'releases a queued reservation after engine_unavailable capture'` — `/tmp/shared-people-r5-06-queue-unavailable.log`                  | Undefined input reached canonical hash and threw before FIFO pump continued.                        |
| Omit queued `finally` release                      | `bun test apps/wbs/be-01/src/service/optimization-restart.db.test.ts --test-name-pattern 'releases a queued reservation when input capture throws'` — `/tmp/shared-people-r5-07-queue-finally.log`                             | Durable `starting` slot remained counted. The restored test additionally proves next TIME capacity. |
| Replace scoped shared Retry input with local input | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'Retry rejects an upstream-only old hash'` — `/tmp/shared-people-r5-retry-01-local-input.log`                          | Old hash was not rejected as stale.                                                                 |
| Bypass required-unavailable Retry refusal          | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'refuses Retry for a required unavailable engine'` — `/tmp/shared-people-r5-retry-02-unavailable-refusal.log`          | Typed 409 refusal changed.                                                                          |
| Replace readable failing-project ID with target ID | Same command — `/tmp/shared-people-r5-retry-03-failing-project.log`                                                                                                                                                            | Response identified the wrong project.                                                              |
| Bypass human-scoped capture recheck                | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'rechecks human authority in the Retry capture'` — `/tmp/shared-people-r5-retry-04-human-scope.log`                    | Revoked member received stale-hash 409 instead of 403.                                              |
| Omit human snapshot close                          | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'closes the human Retry snapshot'` — `/tmp/shared-people-r5-retry-05-close.log`                                        | Launcher saw an open read connection.                                                               |

Follow-up review required the actual serialized solver request to be checked separately from
the holder-bearing canonical input. All four mounted initial/edit/queued/Retry paths now assert
`request.request.elsewhere` at solver quantum resolution; the four-case green command is
`bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'Retry rejects an upstream-only old hash|rebuilds a queued shared request|edit admission hashes the changed upstream booking|admits a holder-bearing shared input'`
(`4 pass, 38 expectations`, `/tmp/shared-people-slice6d-wire-green.log`). These additional
independent watched faults were restored after their RED runs:

| Fault                                                                         | Exact command and raw log                                                                                                                                                                                                          | Observed RED                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the serialized `elsewhere` in `buildSolverRequest` with `{}`          | The four-case command above — `/tmp/shared-people-slice6d-r5-wire-omission.log`                                                                                                                                                    | 0 pass / 4 fail: each launch kept its holder-bearing canonical input but sent `{}` in the actual solver request, expected `ana` interval `[0,144]` or `[0,192]`. |
| Treat upstream cycle/range as target refusal instead of skipping its bookings | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'keeps a schedulable target when an upstream'` — `/tmp/shared-people-slice6d-r5-upstream-skip.log`                         | 0 pass / 2 fail: both upstream cycle and range cases returned 500 rather than a schedulable target.                                                              |
| Remove the new 409 response variant from the endpoint schema                  | `bun test libs/wbs/domain/contracts/src/http/client.test.ts --test-name-pattern 'validates the modeled Retry schedule-input refusal'` — `/tmp/shared-people-slice6d-r5-contract-variant.log`                                       | 0 pass / 1 fail: typed client classified the 409 as `invalid_response` instead of the modeled refusal.                                                           |
| Inject a live optimizer read before the target-cycle refusal                  | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'refuses Retry for a target cycle without optimizer writes or launch'` — `/tmp/shared-people-slice6d-r5-refusal-write.log` | The HTTP 409 stayed correct, but full optimizer-state equality failed: an unasked generation and two counted `starting` slots appeared (0 pass / 1 fail).        |

The target cycle/range fixture enables optimization while retaining the Fast engine before its
five-table before-snapshot; unmutated typed refusal, state equality and zero launch pass 2/2
(`/tmp/shared-people-slice6d-refusal-state-green-final.log`). A preliminary injected read on a
disabled target returned an idle generation-null answer and the test stayed green. That
non-operative fault is **not** counted; enabling the target made the same injected write
observable without changing the product route.

### Scoped validation and process-test diagnosis

`bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts
apps/wbs/be-01/src/controller/project.controller.test.ts
apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts
apps/wbs/be-01/src/service/optimization-restart.db.test.ts
apps/wbs/be-01/src/service/optimization-events.db.test.ts
apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts
apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts
apps/wbs/be-01/src/service/optimization-orphan.proc.db.test.ts
apps/wbs/be-01/src/module/optimization/module.test.ts
libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts` passed **214**, skipped the
existing orphan-process case **1**, failed **0**, with 19,347 expectations
(`/tmp/shared-people-slice6d-final-tests-escalated.log`).
The same command inside the filesystem sandbox failed only at the spawn-handshake marker wait
(`213 pass, 1 skip, 1 fail`, `/tmp/shared-people-slice6d-final-tests.log`). Its isolated run
also failed (`/tmp/shared-people-slice6d-spawn-isolated.log`). A disposable clean-base
worktree at `f49cef02a5de5a5ba1284e64b9b0590615d47d07` reproduced the same failure
(`/tmp/shared-people-slice6d-spawn-baseline.log`). Test-only baseline diagnostics observed
both green durable slots `running` with their expected child PIDs; two `EPERM` errors occurred
at `subprocess.stdin.end()` before the children could receive EOF and write markers
(`/tmp/shared-people-slice6d-spawn-baseline-diagnostic.log`). Identical baseline and candidate
isolated commands with approved unsandboxed process access passed 1/1, 13 assertions each
(`/tmp/shared-people-slice6d-spawn-baseline-escalated.log`,
`/tmp/shared-people-slice6d-spawn-escalated.log`). The test `afterEach` kills and awaits its
children; the four diagnostic PIDs were absent on subsequent `ps`. The disposable baseline
worktree was restored and removed. No production timeout or spawn lifecycle code changed.

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p wbs-core wbs-store-sqlite wbs-be-01 wbs-contracts --skip-nx-cache --output-style=static` first failed only at backend lint: the new mounted test had import order and a redundant assertion (`/tmp/shared-people-slice6d-targets-final.log`, direct diagnostic `/tmp/shared-people-slice6d-eslint-focused.log`). After correction, direct backend eslint passed (`/tmp/shared-people-slice6d-eslint-backend.log`) and the exact Nx rerun passed all targets and dependencies (`/tmp/shared-people-slice6d-targets-final2.log`).

After final formatting, `bun test` on the mounted schedule-organization controller and contracts
HTTP client/refusal test files passed 94/94 with 265 expectations
(`/tmp/shared-people-slice6d-final-changed-tests.log`). After the review proof additions,
the same 11-file suite plus both HTTP contract files passed **254**, skipped the one existing
orphan-process case, failed **0**, with 19,456 expectations; exact output is
`/tmp/shared-people-slice6d-final-review-suite.log`. The exact affected Nx lint/typecheck/build
command above passed again on the reviewed bytes (`/tmp/shared-people-slice6d-final-review-targets.log`).
Final `bunx prettier --check` on all 23 changed files, `git diff --check`, pinned strict
OpenSpec validation of this change and all-change validation are recorded at
`/tmp/shared-people-slice6d-final-review-format.log`,
`/tmp/shared-people-slice6d-final-review-diffcheck.log`,
`/tmp/shared-people-slice6d-final-review-openspec-strict.json` and
`/tmp/shared-people-slice6d-final-review-openspec-all.json`, respectively.

Exact-SHA host gate, publication, CI, deployment and shared-mode activation were not performed
in this uncommitted worktree. The existing isolated-only release boundary remains in force.

## Runtime 6.1e / 6.2e — installed shared saved/current capture

Worktree `.worktrees/shared-people-slice6e`, branch `feat/shared-people-slice6e`, based exactly on
the reviewed local 6d checkpoint `bbf3ffbf5015afc33e6738e069c20ccefbd0052c`. No release,
activation, fan-out, UI, mode setter, merge or host gate is part of this slice. Frozen Bun install
first failed with temporary-directory `EROFS` (`/tmp/shared-people-slice6e-install.log`); retry
with `BUN_TMPDIR=/tmp bun install --frozen-lockfile` passed
(`/tmp/shared-people-slice6e-install2.log`). The initial three-file saved-plan baseline passed
28/28, 97 assertions (`/tmp/shared-people-slice6e-baseline.log`).

The first mounted test used
`bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts -t 'installed saved capture and current comparison'`.
Before wiring it failed as intended: saved B started at 0 rather than the shared-chain start 3
(`/tmp/shared-people-slice6e-mounted-red.log`). After the callback passed through the module
installer and composition root, the same test passed 1/1, 12 assertions
(`/tmp/shared-people-slice6e-mounted-green-attempt1.log`). The callback uses the admitted
human's `ResourceAccess` with `livePlans.read`, whose SQLite observation rechecks membership
and mode before returning detached chain evidence. `isolated` still uses the existing saved
capture; saved bodies remain immutable and the S4 selection uses the exact captured cache state.

Mounted 6e cases now cover upstream estimate edit and assignment removal, unchanged saved
input/schedule bytes and hashes on readback, both saved/current comparison directions, and
actual `0`, `false` and `''` diff values. The existing comparison response requires `left` and
`right` for every difference; the domain represents absent fields as `undefined`. On removal,
JSON omitted those required keys and the mounted route answered 500. The route now encodes only
missing sides as JSON `null`, leaving actual values unchanged. The initial removal failure and
raw domain diff are at `/tmp/shared-people-slice6e-mounted-expanded1.log` and
`/tmp/shared-people-slice6e-remove-diagnostic.log`; the repaired six-case run passed 6/6,
32 assertions (`/tmp/shared-people-slice6e-mounted-expanded2.log`). Both independent
normalization removals below reproduced the HTTP 500. This restores the existing response
shape; it does not add a public variant.

Installed route tests also cover save and current-comparison revocation between route admission
and capture (`403 not_a_member`, no saved row), selected optimized ready (stored start 8 and
`optimized:15+0.2.0:pri:60000` versus Fast start 3), pending target, required upstream
engine unavailable, target cycle and calendar-range infeasible, and exact-key failed/corrupt
optimized target unavailable. Each S4 test compares the saved side with the captured current
side and requires an empty input and schedule diff. It snapshots generation/cache/slot/queue
before save and asserts equality after both save and comparison, while allowing the requested
saved-plan record itself. In particular, pending, ready, failed and corrupt fixtures keep
optimization enabled through both reads; their seven-case follow-up passed 7/7, 37 assertions
(`/tmp/shared-people-slice6e-s4-current-green1.log`).
The selected-ready test passed 1/1, six assertions
(`/tmp/shared-people-slice6e-ready1.log`); failed/corrupt passed 2/2
(`/tmp/shared-people-slice6e-failed-corrupt1.log`); target calendar range passed 1/1
(`/tmp/shared-people-slice6e-range1.log`). The other six mounted cases passed together in
`/tmp/shared-people-slice6e-mounted-expanded2.log` before the additional variants were added.

### 6.2e watched production-path faults

Each mutation below was applied alone, run with Bun 1.4.2 against the mounted route, and
restored after its observed RED. Adjacent `Proof:` comments name the failing path. All commands
run from the 6e worktree. The first six use the schedule-organization controller file; `-t`
is Bun's test-name filter.

| Injected fault                                                                 | Exact command filter and raw log                                                                                                                                                                        | Observed RED                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installer provider returns `undefined` for `captureSharedPlan`                 | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts -t 'installed saved capture and current comparison'` — `/tmp/shared-people-slice6e-mutation-installer-red.log`      | Saved B start 0 instead of 3.                                                                                                                                     |
| Saved-plan module omits callback option                                        | Same command — `/tmp/shared-people-slice6e-mutation-module-red.log`                                                                                                                                     | Saved B start 0 instead of 3.                                                                                                                                     |
| Composition root omits callback binding                                        | Same command — `/tmp/shared-people-slice6e-mutation-compose-red.log`                                                                                                                                    | Saved B start 0 instead of 3.                                                                                                                                     |
| Composition uses project-owned `readProject` instead of human `read`           | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts -t 'rechecks admitted human authority inside shared'` — `/tmp/shared-people-slice6e-mutation-authority-red.log`     | Revoked current comparison answered 200 rather than 403 `not_a_member`; save writer separately refused 403 `forbidden`.                                           |
| Ready optimized branch substitutes `scheduled.fast`                            | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts -t 'stores the selected ready optimized schedule'` — `/tmp/shared-people-slice6e-mutation-fast-red.log`             | Stored start 3 instead of selected ready start 8, despite the optimized algorithm label.                                                                          |
| Comparison omits input absent-side normalization                               | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts -t 'installed saved capture and current comparison'` — `/tmp/shared-people-slice6e-mutation-input-null-red.log`     | Target assignment removal answered 500 instead of 200.                                                                                                            |
| Comparison omits schedule absent-side normalization                            | Same command — `/tmp/shared-people-slice6e-mutation-schedule-null-red.log`                                                                                                                              | Upstream booking removal answered 500 instead of 200.                                                                                                             |
| Composition injects process scheduler with `mode: 'live'` after shared capture | `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts -t 'stores shared S4 pending for target'` — `/tmp/shared-people-slice6e-mutation-live-admission-red.log`            | The save still returned, but the optimizer-state equality failed: a generation and two failed cache rows appeared where all four tables were empty before.        |
| Remove installed feature's missing-access guard                                | `bun test libs/wbs/application/core/src/module/saved-plans/module.test.ts -t 'refuses installed shared save and current before capture'` — `/tmp/shared-people-slice6e-mutation-missing-access-red.log` | Save/current invoked the shared callback twice without admitted access (expected 0); the original guard keeps callback, local capture and saved writes untouched. |

The installed-feature no-access case passed 1/1, seven assertions before and after the watched
guard omission (`/tmp/shared-people-slice6e-missing-access-green1.log`,
`/tmp/shared-people-slice6e-missing-access-green2.log`). Its test checks callback and local
capture counts and the saved-plan list, then verifies the explicit guard error. The mutant
failed at the callback count rather than at a downstream nullish access error.

The first expanded five-file run failed two pre-existing test fixtures after the interface
changed: the route spy expected three `compare` arguments rather than the admitted fourth, and
the hand-built DI test host lacked the new optional callback provider. It recorded 131 pass,
2 fail (`/tmp/shared-people-slice6e-focused-green1.log`). The first real Nx module typecheck
found the same DI fixture omission (`/tmp/shared-people-slice6e-core-typecheck2.log`). Both
test fixtures were updated; the affected controller/module regression files then passed
(`/tmp/shared-people-slice6e-regression-fix-green.log`). An earlier `bunx nx` invocation
returned 0 after only a sandbox socket warning and no target output
(`/tmp/shared-people-slice6e-typecheck1.log`); it is **not** counted as typecheck evidence.

The first nine-file production-path sweep passed 213 and failed three direct
`chain-snapshot.db.test.ts` saved-service fixtures: they supplied a shared callback but no
admitted access, which the feature now requires (`/tmp/shared-people-slice6e-final-focused-tests.log`).
Those fixtures now pass explicit scoped access to save/current; their isolated three-case rerun
passes (`/tmp/shared-people-slice6e-chain-fixture-green.log`). No production access guard was
weakened to make direct construction pass.

After the fixture corrections, this nine-file production-path command passed:

```sh
bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts \
  apps/wbs/be-01/src/controller/saved-plan-organization.controller.db.test.ts \
  apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan-current.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan.service.db.test.ts \
  apps/wbs/be-01/src/service/saved-plan-schedule.db.test.ts \
  libs/wbs/application/core/src/module/saved-plans/module.test.ts \
  libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts
```

The run passed
**216/216**, **804 assertions**, zero failures, in 40.86 seconds
(`/tmp/shared-people-slice6e-final-focused-tests2.log`). Subsequent test-only changes
addressed one incorrect Bun SQLite query call, typed JSON test assertions and matcher lint;
the full mounted schedule-organization controller then passed **64/64**, 229 assertions
(`/tmp/shared-people-slice6e-final-mounted-tests.log`). The first combined Nx target run
failed only at those test type/lint findings (`/tmp/shared-people-slice6e-final-targets.log`);
direct focused ESLint passed after correction (`/tmp/shared-people-slice6e-eslint-focused2.log`).
The exact combined rerun
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p wbs-core wbs-store-sqlite wbs-be-01 --skip-nx-cache --output-style=static`
passed all targets and dependencies (`/tmp/shared-people-slice6e-final-targets2.log`). Final
12-file `bunx prettier --check` passed
(`/tmp/shared-people-slice6e-final-format-check3.log`), `git diff --check` exited 0
(`/tmp/shared-people-slice6e-final-diffcheck2.log`), pinned OpenSpec strict validation passed
1/1 (`/tmp/shared-people-slice6e-openspec-strict2.json`), and pinned all-change validation
passed 148/148 (`/tmp/shared-people-slice6e-openspec-all2.json`). The affected full test files
outside the mounted controller were unchanged after their 216/216 sweep.

After Astra's bounded proof review, the nine-file changed-byte command above passed **217/217**,
**818 assertions**, zero failures (`/tmp/shared-people-slice6e-review-followup-focused-tests.log`).
The first follow-up Nx run failed only core lint because the new test callback was `async` with
no `await` (`/tmp/shared-people-slice6e-review-followup-targets.log`; direct diagnostic
`/tmp/shared-people-slice6e-review-followup-eslint.log`). The callback now returns
`Promise.resolve` with the same observed behavior. Its module test passed 9/9
(`/tmp/shared-people-slice6e-review-followup-module-final.log`), targeted ESLint exited 0
(`/tmp/shared-people-slice6e-review-followup-eslint2.log`), and the exact combined affected
Nx lint/typecheck/build command above passed all targets and dependencies on final source
(`/tmp/shared-people-slice6e-review-followup-targets2.log`).
Final 12-file Prettier check, diff check, pinned strict change validation and pinned all-change
validation exited 0 (`/tmp/shared-people-slice6e-review-followup-format.log`,
`/tmp/shared-people-slice6e-review-followup-diffcheck.log`,
`/tmp/shared-people-slice6e-review-followup-openspec-strict.json`,
`/tmp/shared-people-slice6e-review-followup-openspec-all.json`); strict was 1/1 and all was
148/148.

Exact-SHA host gate, CI, publication, merge and shared-mode activation remain unrun. Review
clearance and any local checkpoint commit are separate next steps.

## Runtime 6.1f / 6.2f — exact cache address and isolated-only release

Worktree `.worktrees/shared-people-slice6f`, branch `feat/shared-people-slice6f`, based exactly
on reviewed 6e checkpoint `3ffc710fb73a661c61d3b75fab2638b940f9ad2f`. The first
`BUN_TMPDIR=/tmp bun install --frozen-lockfile` attempt failed `EROFS` accessing Bun's
temporary directory in the filesystem sandbox. An approved unsandboxed
`bun install --frozen-lockfile` checked 1602 installs across 1447 packages without lockfile
changes. The initial `bun test src/chain-snapshot.db.test.ts
src/captured-optimization-reader.db.test.ts` from the store-sqlite package passed 35/35,
108 assertions.

The new SQLite production-path case `stores an eligible old shared result only at H1 and never
serves it for captured H2` uses `SharedPeopleReader`'s owned read-only chain snapshot and
captured optimizer reader. No tree GET or live admission precedes its H2 lookup; the installed
snapshot scheduler throws if live admission is attempted. An upstream-only A edit changes B's
captured canonical input H1 to H2 and visibly changes B's Fast start while B's generation G
and stored generation input H1 remain unchanged. A still-held H1 slot then stores a constructed
eligible H1 outcome and a durable `schedule_optimized` event with H1's complete identity through
the production outcome/event transaction.
Repeated publication returns `already-recorded` with one event. Exact H1 lookup returns its
stored schedule; H2 capture remains pending with no optimized schedule. The generation, cache,
slot, queue and event tables are unchanged across the captured reads. On the final test bytes,
`bun test src/chain-snapshot.db.test.ts --test-name-pattern 'stores an eligible old shared
result only at H1'` passed 1/1, 21 assertions.

R5 watched faults were independent and restored after their recorded REDs:

| Injected production fault                                                                | Exact test command and log                                                                                                                                                             | Observed failure                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove only `optimizedScheduleCache.inputHash == key.inputHash` from `readOptimizedPair` | `bun test src/chain-snapshot.db.test.ts --test-name-pattern 'stores an eligible old shared result only at H1'` in store-sqlite; `/tmp/shared-people-slice6f-hash-predicate-red.log`    | Exit 1: under unchanged G, H2 received H1's `ready/proven` result instead of pending; restored test passed in `/tmp/shared-people-slice6f-hash-predicate-green.log`.                                                                   |
| Add `shared` to physical `SUPPORTED_CAPACITY_MODES`                                      | `bun test src/capacity-modes-cli.test.ts` in be-01; `/tmp/shared-people-slice6f-capability-red.log`                                                                                    | Exit 1: the actual capability CLI subprocess returned `['isolated','shared']` instead of exactly `['isolated']`.                                                                                                                       |
| Bypass only the shared-restore supported-mode guard                                      | `bun test src/shared-people-rollback.db.test.ts --test-name-pattern 'rejects shared restoration before the first write'` in store-sqlite; `/tmp/shared-people-slice6f-restore-red.log` | Exit 1: a physical first-write trigger observed an attempted organization update instead of the required pre-write `unsupported capacity mode shared` refusal; the untouched organization/rank state is asserted by the restored test. |

The physical capability CLI test passed 1/1, three assertions before mutation; the restore
pre-write test passed in `/tmp/shared-people-slice6f-restore-green.log`. Full changed-byte
store tests (`bun test` on chain-snapshot, captured-optimization-reader, optimized-cache,
optimized-outcome, optimized-schedule-cache, optimization-generation, optimization-admission,
optimization-queue and shared-people-rollback from store-sqlite) passed **174/174**,
708 assertions (`/tmp/shared-people-slice6f-store-focused.log`). The backend eight-file
suite (capacity CLI, mounted schedule-organization, coordinator, events, two-coordinator
cancellation, restart, repository and optimization module) passed **138/138**,
658 assertions (`/tmp/shared-people-slice6f-backend-focused.log`). The core shared-chain
regressions passed 14/14, 37 assertions (`/tmp/shared-people-slice6f-core-chain.log`), including
transitivity, undated bridge, target/influencer cycle and calendar-range distinctions, and
required-engine unavailability. Domain elsewhere placement passed 15/15,
14,843 assertions (`/tmp/shared-people-slice6f-domain-elsewhere.log`). These retained suites
cover generation, slot/token, cancellation, enablement, blue/green cache retention and
outcome/event atomicity; no new publication or activation policy was added.

Pinned `bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`
passed 1/1 (`/tmp/shared-people-slice6f-openspec-strict.json`), and pinned `validate --all
--json` passed 148/148 (`/tmp/shared-people-slice6f-openspec-all.json`). Affected Nx,
final formatting and diff checks are recorded below after their terminal runs. The first
combined Nx run failed only store-sqlite typecheck/lint because the new test returned an outer
chain value that lost its already-checked nested schedule discriminant, treated an optional
recorded event as present, and had imports out of order (`/tmp/shared-people-slice6f-targets.log`).
The test now returns its narrowed input/scheduled pair and checks that publication supplied
the event record. Direct `bunx eslint --fix` on the new store test and
`bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json` passed. The changed
chain-snapshot file then passed 32/32, 114 assertions
(`/tmp/shared-people-slice6f-chain-final.log`). The exact affected rerun
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p wbs-domain wbs-core wbs-store-sqlite wbs-be-01 --skip-nx-cache --output-style=static`
passed all four targets and three dependencies (`/tmp/shared-people-slice6f-targets2.log`).
The first four-file Prettier check found only this newly appended verify section unformatted
(`/tmp/shared-people-slice6f-format.log`); after formatting, the same check passed
(`/tmp/shared-people-slice6f-format2.log`). Final four-file Prettier check passed
(`/tmp/shared-people-slice6f-format-final.log`), `git diff --check` passed
(`/tmp/shared-people-slice6f-diffcheck-final.log`), and pinned strict/all OpenSpec validation
passed 1/1 and 148/148 respectively
(`/tmp/shared-people-slice6f-openspec-strict-final.json`,
`/tmp/shared-people-slice6f-openspec-all-final.json`).
Exact-SHA host gate, CI, publication, merge, fan-out and shared-mode activation are outside
this slice.

## Durable fan-out planning amendment (6g–6l)

Planning-only base: `73264fce66deff231c71b8a14f73da856e5fa811`, isolated worktree
`.worktrees/shared-people-fanout-plan`, branch `plan/shared-people-fanout`. No production code,
WBS record, runtime configuration or publication is changed. At planning time all
6g–6l implementation checks were pending; the reviewed 6g local checkpoint is
recorded below, while later slices remain pending.

| Slice   | Production fault required                                                                                                     | Named observation target                                                                   | Result                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 6g      | Fast substitution; equal-hash suppression; old-graph omission; mixed-edge traversal; duplicate pair; mode/organization bypass | Selected display, availability, removed bridge, false path and pair/authority tests        | Reviewed local checkpoint; 17 watched REDs; focused 32/32, 76 assertions |
| 6h      | Record after commit; push before commit; omitted binding/trigger; live admission                                              | Real command/undo/redo mutation, event sequence, push witness and optimizer-state equality | Pending                                                                  |
| 6i      | Independent rank/settings/directory binding omission; new-only usages; detached topology                                      | Mounted rank/settings/directory recipients and coherent observations                       | Pending                                                                  |
| 6j      | Import binding omission; request-only deletion; lost old closure; missed release/reconcile; detached recording                | Import rollback and final drain/delete event/ledger assertions                             | Pending                                                                  |
| 6k      | Any-insertion fan-out; input-only comparison; Fast substitution; detached read; missing atomic event                          | H1/H2 silence, selected display, availability and atomic cache/event rollback              | Pending                                                                  |
| 6l      | Missing durable row; push reinsertion; memory-only replay; authority bypass                                                   | Cold-process replay, stable sequence, retention and denied subscription                    | Pending                                                                  |
| Release | Advertise shared; bypass restore guard                                                                                        | Physical capability CLI and first-write restore trap                                       | Pending rerun after fan-out                                              |

Execution commands: use `bun test <changed-test-path>` for each RED/GREEN and independent R5
fault; retain exact command, assertion, exit and restored source evidence per fault. Run affected
Nx test/lint/typecheck/build targets and scoped Prettier before each checkpoint. Run
`bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json` and
`bunx @fission-ai/openspec@1.12.0 validate --all --json`. Before claiming integrated completion,
run `bin/h2puni-gate.sh <reviewed-sha>` on h2puni under its canonical lock; no raw full Nx gate
there. No new fan-out implementation test, host gate or live failure experiment was run while
preparing this amendment. Existing replay retention and process-local engine-loss limits are
part of acceptance, not missing proof to conceal.

Planning validation: pinned targeted strict OpenSpec passed 1/1
(`/tmp/shared-fanout-plan-strict.json`) and pinned all-change validation passed 148/148
(`/tmp/shared-fanout-plan-all.json`). An initial final-byte Prettier check flagged task-list wrapping; a second write corrected it.
Final six-file Prettier and `git diff --check` passed. Intent
is 384 words, below the 400-word limit. Final-byte reruns use the same commands/log paths.
No Nx implementation suite was run for this documentation-only amendment; no new production
behavior or R5 outcome is claimed. Before committing, self-review checked source ownership,
scenario/task coverage and that every new implementation checkbox and proof remains pending.

## 6g pure projection and recipient calculation

Branch feat/shared-people-fanout-6g, isolated worktree
.worktrees/shared-people-fanout-6g, exact planning base
24025e6545b36bae8f32e18c078b5b755670211c. This slice adds only a pure value
service/test and reuses the existing captured-chain display selector. Old/new ordered
project facts, outcomes and direct causes are explicit inputs; the service imports no
DB, snapshot, writer, adapter, event or live admission dependency. It compares
canonical absolute fractional person/project/work-item/step intervals separately
from modeled availability and emits sorted, deduplicated recipient/cause pairs.

Baseline from libs/wbs/application/core: bun test src/service/shared-people.test.ts
passed 14/14, 37 assertions (/tmp/shared-people-fanout-6g-baseline.log). First
new-test RED failed at the explicit unimplemented comparison
(/tmp/shared-people-fanout-6g-selected-red.log); selected ready versus Fast
then passed 1/1 (/tmp/shared-people-fanout-6g-selected-green.log). Removed
bridge first missed C under one-hop traversal
(/tmp/shared-people-fanout-6g-old-topology-red.log), then passed after
separate old/new closure traversal (...old-topology-green.log). Pair
ordering/dedup first failed with duplicate and unsorted Z pairs
(...pairs-red.log), then passed (...pairs-green.log). Foreign X first appeared
(...boundary-red.log), then was filtered (...boundary-green.log). Topology-only
changed incoming basis first omitted B (...topology-only-red.log), then passed
(...topology-only-green.log). Missing direct cause and missing/mismatched shared
organization each failed before refusal and passed after it
(...missing-cause-{red,green}.log, ...org-identity-{red,green}.log).
The first fractional fixture requested optimized mode with null optimizer state;
the selector correctly threw (...fractional-check.log). Correcting this test-only
fixture to Fast mode passed (...fractional-green.log); it was no product failure.

Every watched fault below ran from libs/wbs/application/core with
bun test src/service/shared-people-fanout.test.ts -t '<test fragment>'.
Each named fault exited 1 at the asserted behavior and was restored; adjacent
Proof comments in the source name the failures.

| Fault                                        | Test fragment                        | RED log and observed failure                                                                      |
| -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Substitute Fast for ready selected schedule  | selected displayed bookings          | /tmp/shared-people-fanout-6g-fault-fast.log: B disappeared                                        |
| Suppress availability at equal hash          | equal hashes retain availability     | /tmp/shared-people-fanout-6g-fault-equal-hash.log: engine-unavailable to cycle reported unchanged |
| Omit old graph                               | removed bridge retains               | /tmp/shared-people-fanout-6g-fault-old-graph.log: C disappeared                                   |
| Union old/new person edges                   | mixed old and new edges              | /tmp/shared-people-fanout-6g-fault-mixed-edges.log: invented C appeared                           |
| Remove pair deduplication                    | deduplicates and orders              | /tmp/shared-people-fanout-6g-fault-dedup.log: duplicate Z pairs                                   |
| Remove pair sorting                          | deduplicates and orders              | /tmp/shared-people-fanout-6g-fault-order.log: B/Z preceded B/A                                    |
| Omit organization filter                     | isolated and foreign organization    | /tmp/shared-people-fanout-6g-fault-org.log: foreign X appeared                                    |
| Omit mode guard                              | isolated and foreign organization    | /tmp/shared-people-fanout-6g-fault-mode.log: isolated A to B appeared                             |
| Admit undated candidate                      | stops traversal at an undated bridge | /tmp/shared-people-fanout-6g-fault-undated-candidate.log: undated B appeared                      |
| Admit undated predecessor                    | an undated cause cannot              | /tmp/shared-people-fanout-6g-fault-undated-predecessor.log: A to B appeared                       |
| Admit zero-time slice                        | omits zero-time and unassigned       | /tmp/shared-people-fanout-6g-fault-zero-time.log: zero-length A booking                           |
| Admit unassigned slice                       | omits zero-time and unassigned       | /tmp/shared-people-fanout-6g-fault-unassigned.log: null-person B booking                          |
| Omit changed incoming-basis filter           | topology-only changes to unchanged   | /tmp/shared-people-fanout-6g-fault-topology-filter.log: unchanged B received A pair               |
| Include deleted recipients                   | deleted cause identity               | /tmp/shared-people-fanout-6g-fault-deleted-recipient.log: deleted B received A pair               |
| Omit canonical booking sort                  | canonicalizes booking order          | /tmp/shared-people-fanout-6g-fault-booking-sort.log: reordered map falsely changed bookings       |
| Skip absent direct-cause refusal             | explicit cause missing               | /tmp/shared-people-fanout-6g-fault-missing-cause.log: returned empty instead of throwing          |
| Return empty for invalid shared organization | missing or inconsistent organization | /tmp/shared-people-fanout-6g-fault-org-identity.log: returned empty instead of throwing           |

After restoration and formatting, bun test src/service/shared-people-fanout.test.ts
src/service/shared-people.test.ts passed 32/32, 76 assertions
(/tmp/shared-people-fanout-6g-focused-final.log). The new cases cover selected
ready versus Fast, equal-hash availability, separate graph closure, topology-only
basis filtering, mixed-edge exclusion, multiple direct causes, deletion, organization
and mode bounds, fractional absolute intervals, canonical collection order, undated
barriers, cycle/range skip-bookings and required engine unavailability.
Initial direct ESLint found 21 new-file findings
(/tmp/shared-people-fanout-6g-eslint-pre.log); --fix removed 11, then explicit
typed-array and optional-chain cleanup removed the remaining 10
(/tmp/shared-people-fanout-6g-eslint-fix.log). Direct ESLint passed
(/tmp/shared-people-fanout-6g-eslint-green.log). Initial direct TSC found an
undiscriminated cycle/range outcome union
(/tmp/shared-people-fanout-6g-typecheck-pre.log); splitting those two modeled
variants made direct TSC pass (/tmp/shared-people-fanout-6g-typecheck-pre2.log,
/tmp/shared-people-fanout-6g-tsc-pre.log).

The affected command
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build
-p wbs-domain wbs-core --skip-nx-cache --output-style=static exited 0; Nx
scheduled lint/typecheck for both projects and the core module typecheck dependency,
but no build target under the generic build name
(/tmp/shared-people-fanout-6g-nx.log). The separately declared
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:build:portable
--skip-nx-cache --output-style=static exited 0 and bundled 539 modules
(/tmp/shared-people-fanout-6g-portable-build.log). Pinned
bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects
--strict --json passed 1/1
(/tmp/shared-people-fanout-6g-openspec-strict-review.json); pinned validate --all
--json passed 148/148
(/tmp/shared-people-fanout-6g-openspec-all-review.json).
The first final four-file Prettier check flagged only the new source after
ESLint/manual cleanup (/tmp/shared-people-fanout-6g-prettier-final.log).
Prettier write corrected it (/tmp/shared-people-fanout-6g-source-format-write.log);
the affected two-file focused suite then passed again 32/32, 76 assertions
(/tmp/shared-people-fanout-6g-focused-after-format.log). The four-file Prettier
check passed again on final verification text
(/tmp/shared-people-fanout-6g-prettier-review.log), and git diff --check
passed (/tmp/shared-people-fanout-6g-diffcheck-review.log).
Durable fan-out events, transaction integration, delivery, shared activation
and the exact-SHA host gate remain open.

## 6h architecture checkpoint (2026-10-06)

Prepared on `plan/shared-people-fanout-6h-architecture`, based on plan commit
`24025e6545b36bae8f32e18c078b5b755670211c`. The normative design links
[6h-architecture.md](6h-architecture.md); the delta spec adds command capture and committed
optimizer-notification requirements, and task 6h links the exact implementation handoff.
No product source, migration, runtime capability, WBS record or publication changed.

Inspected real command/undo/redo, admitted-write, SQLite UoW/event-store/borrowed capture,
core composition, services/boot/mounted app, gateway delivery and optimizer-trigger callers
and their existing tests. Independently inspected 6g commit
`6ac0cd4dc8772790c1dafc63c89d10d2a6a8a3db`: `FanoutObservation.projects` now documents
that input is already in authoritative project-rank order and `rankPosition` is metadata,
closing its P3 documentation finding. No claim of rerunning unchanged 6g behavior tests.

Validation in the isolated architecture worktree:

- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`:
  1 change passed, 0 failed, no issues.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`:
  148 passed, 0 failed (130 changes, 18 specs); report
  `/tmp/shared-people-fanout-6h-openspec-all.json`.
- Prettier write/check of the five touched Markdown files via the existing workspace
  installation: passed. `git diff --check`: passed.

Tool recovery: `openspec` was absent from PATH. An initial direct cached 1.13.0 invocation
failed with missing `commander` and is not validation evidence. A Bun invocation without
`BUN_TMPDIR` failed with EROFS; the repository-pinned 1.12.0 invocation above succeeded using
writable `/tmp`, with no dependency/lockfile changes.

Not run: product tests, fault injections, lint/typecheck/build, canonical exact-SHA h2puni
gate or CI. This is a documentation checkpoint, not implemented 6h or integration evidence.
Every new 6h RED/restored-GREEN production proof in the packet remains pending; 6h and later
slices remain unchecked. No push or merge.

## 6h admitted observation authority clarification

Planning-only amendment atop `618af6132e87f412efa8cddda8838fdfa6aed4e7`, on isolated
`plan/shared-people-fanout-6h-architecture`. The normative packet now distinguishes the
service's request-scope classification from the repository's fresh membership guard. The
admitted beforeWrite hook must perform a read-only current-authority check before capture,
without duplicating audit/grant admission. Product files and WBS remain untouched.

| Required fault                                        | Decisive production-path negative                                                       | Result  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| Omit fresh authority check or capture before it       | Queued demotion/removal or foreign request reaches capture instead of its typed refusal | Pending |
| Replace read-only check with auditing admission       | Super-admin recovery creates more than one audit; step recovery must not broaden        | Pending |
| Move hook after mutation or omit either route binding | Old settings/step unavailable or expected downstream event absent                       | Pending |
| Fail capture or later downstream insertion            | Domain/audit/history/event/sequence rollback and zero delivery/optimizer witnesses      | Pending |

No product tests or R5 injections are claimed for this clarification. Targeted pinned strict
OpenSpec, pinned all validation, four-file Prettier and diff checks are rerun before the local
checkpoint; exact result logs are `/tmp/6h-authority-plan-{strict,all}.json` and
`/tmp/6h-authority-plan-format.log`. Canonical gate, CI, publication and implementation remain
pending. The new tasks are unchecked.

Planning validation completed: pinned strict 1/1 and all 148/148 passed with zero failures;
four-file Prettier and `git diff --check` passed. Final-byte reruns use the same logs.

## 6h scoped recovery transaction correction (2026-10-06)

Documentation-only amendment from `9345be989310313fa55b3e2894402f73e5fc8eb0`, isolated branch
`plan/shared-people-fanout-6h-recovery`. Independent call-path review found that the mounted
scoped step route calls `runRecoveryWrite` with its own granted batch, bypassing the bare
`createAdmittedWrites` service. Its existing restricted-project super-admin removal succeeds
and audits once; the previous packet's unqualified forbidden-removal wording was incorrect.
The normative packet, delta spec and task now distinguish the two transaction owners.

The correction preserves recovery's original UoW, fresh admission, grant expiry and audit;
observation, after-capture and event recording join that same transaction. It prohibits a
nested UoW or a second admission/audit and retains delivery after commit/writer release.
Bare mapped writes retain `NO_ADMISSION` and the separate read-only authority check. No
product source, permission implementation or runtime capability changed.

| Required fault / production path                                                             | Decisive negative                                                                                  | Result  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| Omit scoped recovery binding, independently of bare binding                                  | Mounted shared DELETE succeeds but expected downstream rows disappear                              | Pending |
| Substitute bare graph or repeat auditing admission in scoped recovery                        | Existing successful super-admin deletion is refused, or audit count grows from one to two          | Pending |
| Bypass fresh recovery admission or capture before it                                         | Revoked/demoted or foreign caller reaches throwing capture instead of typed refusal                | Pending |
| Omit hook or move it after removal, separately in scoped recovery and bare shared-mode paths | Old-step witness or required downstream event fails                                                | Pending |
| Fail capture, then independently a later event insert, on each path                          | Domain/event/sequence and scoped audit roll back, grant expires, zero delivery/optimizer witnesses | Pending |
| Deliver inside recovery UoW, independently of bare-path mutation                             | Pending transport blocks a second writer or emits before commit                                    | Pending |

All implementation tests and R5 fault injections above remain unrun/pending. Normal local
commit hooks will run; their inactive Tool Wiki status is not certification. No full h2puni
gate, CI, product test/lint/typecheck/build, push or merge is claimed by this planning packet.

Planning validation: `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate
share-people-across-projects --strict --json` passed 1/1; the same pinned tool's
`validate --all --json` passed 148/148 (130 changes, 18 specs). Reports:
`/tmp/6h-recovery-plan-strict.json` and `/tmp/6h-recovery-plan-all.json`. Four-file Prettier
check and `git diff --check` passed; final-byte validation is rerun before commit.
Legacy is deliberately non-capturing: its negative plants throwing shared dependencies and
requires successful removal without calling them. Shared hook omission/fault proofs must use
a permitted shared-mode actor, not a legacy no-fan-out result.

## 6h review: grant lifetime and topology causes (2026-10-06)

Documentation-only amendment from `300b3d3dd9e5894b850420c546c45b2c3228f3ac`, isolated branch
`plan/shared-people-fanout-6h-lifetime`. Product review of Sol's dirty candidate found two
regressions; this packet clarifies implementation obligations without implementing their fixes.

A real SQLite `createPlanCommandRunner` probe retained `batchServices`' admission and performed
an independent-connection UPDATE in `deliverCommitted`. The writer entered, but the grant
still admitted its original actor/project there; it refused only after the runner returned.
The candidate's awaited delivery delayed execute/walk's outer grant-expiry finally. The
normative packet now explicitly closes that lifetime before delivery for execute and undo/redo,
with unconditional refusal/exception cleanup and existing history-repair semantics retained.

A mounted `setAssignee` probe used dated A/Ana, sequential B/Ana+Ben and C/Ben. Removing B's
Ana assignment returned 200 but recorded only `(C,B)`. Existing design.md already requires
changed connection endpoints as causes; A's unchanged local input hash does not remove its
causal identity. The packet and task now spell out deriving endpoint changes alongside local
facts and require durable `(B,A)` / `(C,A)` witnesses when those incoming bases change.

| Required fault / path                                 | Decisive negative                                                                               | Implementation status                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Delay execute grant expiry until delivery completes   | Second writer enters while retained grant still admits during held push                         | Candidate defect observed; restored proof pending   |
| Delay undo/redo grant expiry until delivery completes | Same held-push refusal assertion fails for each history direction                               | Required; pending                                   |
| Omit refusal/exception grant cleanup                  | Retained authority remains usable after settlement; stale-history repair must stay NO_ADMISSION | Required; pending                                   |
| Omit changed connection endpoint causes               | Mounted assignment removal keeps `(C,B)` but loses `(B,A)` and `(C,A)`                          | Candidate omission observed; restored proof pending |

Independent review's seven-file focused run passed 79/79, 469 assertions before fixes, in
`/tmp/astra-6h-review-focused.log`; it did not cover the two new witnesses above. Standalone
read-only-review probes used temporary SQLite fixtures and left candidate files untouched.
No implementation clearance follows from that green suite. Sol owns production fixes and
watched RED/restored-GREEN evidence. No product change, full exact-SHA gate, CI, push or merge
is part of this documentation amendment.

Planning validation: pinned `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate
share-people-across-projects --strict --json` passed 1/1, and `validate --all --json` passed
148/148 (130 changes, 18 specs). Reports: `/tmp/6h-lifetime-plan-{strict,all}.json`.
Four-file Prettier and `git diff --check` passed; final-byte checks and normal local commit
hooks run before the checkpoint. An inactive Tool Wiki hook is not certification.

## 6h implementation checkpoint (2026-10-06, uncommitted)

Branch `feat/shared-people-fanout-6h` at architecture head
`300b3d3dd9e5894b850420c546c45b2c3228f3ac`; implementation remains dirty and
unreviewed. This section reports source and test observations, not a complete 6h clearance.
It supersedes only the planning packet's statements that implementation had not begun.

The SQLite fan-out capture borrows the write transaction and the captured optimizer reader.
Command and admitted project/step writes compare before and after only after admitted
preflights; event rows are inserted before commit, and exact recorded envelopes are delivered
after the writer releases. Bare writes recheck current authority read-only before capture.
Mounted scoped step removal retains its existing recovery UoW, grant and single audit. Legacy
and isolated modes produce no shared fan-out.

`bun test` over `fanout-capture.db.test.ts`, PlanCommand module, composition, optimizer
broadcaster, mounted command, command organization and step-marker organization passed
**79/79, 469 assertions across seven files** on the latest restored bytes:
`/tmp/shared-people-fanout-6h-focused-final-2.log`. The mounted cold command emits a durable
downstream event without a tree GET. Execute/undo/redo, late refusal, project PATCH, scoped
recovery DELETE, bare `NO_ADMISSION` removal, queued demotion, super-admin single-audit
recovery, physical capture failure and second-event failure are exercised there. The command
suite separately observes a directory-only cascading person deletion with three old-topology
pairs `(B,A)`, `(C,A)`, `(C,B)`, each once. The borrowed-capture fixture seeds an exact-key
ready PRI schedule: A's Fast start 0 and selected optimized start 1 differ. Staging A's engine
back to Fast leaves A's input hash unchanged, shifts two-day B from start 2 to 1, changes B's
incoming basis and returns `(B,A)`. The generation, cache, slot and queue rows remain equal
before and after both reads; the test's live scheduler throws if invoked.

| Watched production fault                                 | RED log and decisive observation                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit fresh bare step authority                           | `/tmp/shared-people-fanout-6h-r5-bare-authority.log`: stale-role bare removal succeeds instead of forbidden; restored focused log `-bare-authority-restored.log`.                                                                                                 |
| Omit project service before-write binding                | `/tmp/shared-people-fanout-6h-r5-project-binding.log`: expected four recipient rows become three.                                                                                                                                                                 |
| Omit bare step binding                                   | `/tmp/shared-people-fanout-6h-r5-bare-step-binding.log`: expected three rows become two.                                                                                                                                                                          |
| Omit scoped recovery binding                             | `/tmp/shared-people-fanout-6h-r5-scoped-step-binding.log`: injected event failure expected 500 becomes 204.                                                                                                                                                       |
| Bypass project read-only authority                       | `/tmp/shared-people-fanout-6h-r5-project-authority.log`: queued demotion reaches broken capture and returns 500 instead of typed 403.                                                                                                                             |
| Add second auditing admission in recovery                | `/tmp/shared-people-fanout-6h-r5-second-recovery-audit.log`: two audit rows instead of one.                                                                                                                                                                       |
| Remove committed optimizer reaction                      | `/tmp/shared-people-fanout-6h-r5-committed-reaction.log`: recipient notification is absent.                                                                                                                                                                       |
| Remove `elsewhere_changed` scheduling predicate          | `/tmp/shared-people-fanout-6h-r5-elsewhere-predicate.log`: recipient notification is absent.                                                                                                                                                                      |
| Publish instead of push recorded envelope                | `/tmp/shared-people-fanout-6h-r5-publish-instead-of-push.log`: sequence/payload witness fails.                                                                                                                                                                    |
| Record command event after UoW return                    | `/tmp/shared-people-fanout-6h-r5-record-after-uow.log`: second-event failure leaves mutation, journal, first event and sequence committed; restored test `-record-after-uow-restored.log`.                                                                        |
| Omit core PlanCommand installer delivery provider        | `/tmp/shared-people-fanout-6h-r5-core-installer-delivery.log`: scoped admitted run refuses missing delivery. An earlier legacy-only fixture stayed green and was corrected; it is not counted as proof.                                                           |
| Omit mounted app delivery binding                        | `/tmp/shared-people-fanout-6h-r5-mounted-app-delivery.log`: cold admitted command returns 500 instead of 200.                                                                                                                                                     |
| Omit SQLite borrowed capture binding                     | `/tmp/shared-people-fanout-6h-r5-sqlite-source-capture.log`: cold admitted command returns 500 instead of 200.                                                                                                                                                    |
| Drop captured optimizer binding                          | `/tmp/shared-people-fanout-6h-r5-drop-captured-optimizer.log`: ready selected A becomes engine-unavailable; restored seven-file suite passes.                                                                                                                     |
| Keep only first directory cause                          | `/tmp/shared-people-fanout-6h-r5-directory-second-cause.log`: `(C,B)` is absent; restored seven-file suite passes.                                                                                                                                                |
| Omit boot-to-app delivery forwarding                     | `/tmp/shared-people-fanout-6h-r5-boot-delivery.log`: cold command through `bootBe01`'s mounted app returns 500 instead of 200; restored durable-row test `/tmp/shared-people-fanout-6h-boot-restored.log` passes.                                                 |
| Push committed envelope inside command UoW               | `/tmp/shared-people-fanout-6h-r5-push-before-commit.log`: held gateway push keeps writer lock; independent SQLite write fails `SQLITE_BUSY`. Restored `/tmp/shared-people-fanout-6h-push-release-restored.log` passes while push is held.                         |
| Force live scheduling in borrowed capture                | `/tmp/shared-people-fanout-6h-r5-live-admission.log`: enabled optimized fixture invokes its throwing `readLive` dependency instead of capture-only read.                                                                                                          |
| Detach SQLite capture to a separate read-only connection | `/tmp/shared-people-fanout-6h-r5-detached-snapshot.log`: cold mounted command records zero downstream rows because after-capture misses staged mutation. Restored capture/mounted suite `/tmp/shared-people-fanout-6h-capture-faults-restored.log` passes 3/3,33. |

The optimized fixture first used a one-day B, which could fit before selected A and made an
expected start-2 assertion fail. A two-day B creates the required overlap. A preliminary
assertion also incorrectly expected B's propagated input hash unchanged; A's local hash is
unchanged, while B's hash correctly changes with inherited bookings. These are test fixture
corrections, not product failures. The directory event assertion initially compared random
UUID subscription order with creation order; sorting subscription/cause pairs corrected it.

The first affected Nx lint/typecheck run failed only on the new directory test's missing Bun
SQLite query type argument and inferred tuple shape; all seven other scheduled targets passed
(`/tmp/shared-people-fanout-6h-nx-lint-type-final.log`). Corrected backend typecheck passed
(`/tmp/shared-people-fanout-6h-be-type-restored.log`). Declared builds passed independently:
`NX_DAEMON=false bunx nx run-many -t build:portable -p wbs-core --skip-nx-cache`
(`/tmp/shared-people-fanout-6h-core-build.log`) and
`NX_DAEMON=false bunx nx run wbs-be-01:build --skip-nx-cache`
(`/tmp/shared-people-fanout-6h-be-build.log`). SQLite store has no declared build target.
The corrected combined command
`NX_DAEMON=false bunx nx run-many -t lint typecheck -p wbs-core wbs-store-sqlite wbs-be-01 --skip-nx-cache`
passed all eight scheduled targets (`/tmp/shared-people-fanout-6h-nx-lint-type-restored.log`).
Prettier check passed on all modified/new paths
(`/tmp/shared-people-fanout-6h-prettier-final.log`); pinned OpenSpec 1.12.0 strict
`validate share-people-across-projects --strict --json` passed 1/1 and `validate --all --json`
passed 148/148 (`/tmp/shared-people-fanout-6h-openspec-{strict,all}.json`); `git diff --check`
passed (`/tmp/shared-people-fanout-6h-diff-check.log`). Boot and held-push tests were added
after those checks, so final-byte format, focused suites and affected Nx checks must be rerun.
The live-admission mutation tripped a no-live callback; a positive allocator-write fault is
not claimed. Astra confirmed that this tripwire plus unchanged optimizer rows satisfies the
slice's capture/no-admission proof. The first post-Prettier eight-file run was 81 pass/27 fail
because the sandbox denied existing boot-suite loopback listeners with `EPERM: listen`
(`/tmp/shared-people-fanout-6h-final-eight-files.log`); the new socketless boot case passed.
The **same exact eight-file command**, approved outside the sandbox without changing listener
configuration, then passed **108/108, 535 assertions**
(`/tmp/shared-people-fanout-6h-final-eight-files-escalated.log`). The initial sandbox failure
is infrastructure evidence superseded by that rerun. The final changed-byte
`NX_DAEMON=false bunx nx run-many -t lint typecheck -p wbs-core wbs-store-sqlite wbs-be-01 --skip-nx-cache`
passed all eight scheduled targets (`/tmp/shared-people-fanout-6h-nx-final.log`). Declared
`wbs-core:build:portable` and `wbs-be-01:build` passed independently
(`/tmp/shared-people-fanout-6h-{core,be}-build-final.log`); SQLite store declares no build.
Final-byte Prettier passed on all modified/new paths
(`/tmp/shared-people-fanout-6h-prettier-final-2.log`), pinned strict OpenSpec passed 1/1,
pinned all validation passed 148/148
(`/tmp/shared-people-fanout-6h-openspec-{strict,all}-final.json`), and `git diff --check`
passed (`/tmp/shared-people-fanout-6h-diff-final.log`). Independent review remains pending;
the 6h task is not marked complete and no local implementation commit exists.
Exact-SHA host gate, CI, publication, merge, 6i–6l and umbrella completion remain outstanding.

## 6h review corrections (2026-10-06, uncommitted)

The lifetime packet was cherry-picked as documentation-only commit `edde1faf0` on
`feat/shared-people-fanout-6h`; the live implementation and this ledger remain uncommitted.
This section supersedes the earlier implementation checkpoint's final-byte test counts and
the lifetime packet's pending implementation rows, while retaining their raw logs as history.

The production command transaction now expires its scoped grant immediately after its UoW
settles and before awaiting recipient delivery. The runner's existing `finally` still expires
it on refusal, rollback, repair or exception. Real SQLite execute, undo and redo tests retain
the actual `batchServices` admission, commit a shared fan-out event, hold delivery after a
second-connection project UPDATE has succeeded, and require the retained admission to refuse
the original actor/project before push release. All three failed before the fix (`true` vs
`false`, `/tmp/shared-people-fanout-6h-grant-lifetime-red.log`), passed 3/3, 9 assertions
after it (`/tmp/shared-people-fanout-6h-grant-lifetime-green.log`), and independently failed
again when the new settlement callback was omitted
(`/tmp/shared-people-fanout-6h-r5-settlement-expiry-omission.log`). Existing refusal and
stale-journal `NO_ADMISSION` repair tests remain in the final focused suite.

`recordCommittedFanout` now includes both endpoints of changed old/new rank-directed shared
person connections among direct causes, alongside changed local scheduling facts. A
source-neutral A/Ana → B/Ana+Ben → C/Ben test records `(C,A)` and `(C,B)`; its first RED
recorded only `(C,B)` (`/tmp/shared-people-fanout-6h-topology-endpoints-red.log`), then
passed after the change (`/tmp/shared-people-fanout-6h-topology-endpoints-green.log`). A
mounted assignment-removal command with a B Ana→Ben dependency makes C's incoming basis
change and durably records `(B,A)`, `(C,A)`, `(C,B)`
(`/tmp/shared-people-fanout-6h-mounted-endpoints-green.log`). Removing only the endpoint
union makes the mounted `(B,A)` assertion fail
(`/tmp/shared-people-fanout-6h-r5-mounted-endpoint-omission.log`); the earlier source-neutral
omission RED is `/tmp/shared-people-fanout-6h-r5-endpoint-omission.log`. The first mounted
fixture had independent B Ben work, so C's basis did not change and `(C,A)` was correctly
absent. Adding the B Ana→Ben dependency corrected the test fixture, not product behavior.

The scoped recovery removal route now holds gateway delivery after commit while an
independent SQLite project UPDATE succeeds; the restored production test passes
(`/tmp/shared-people-fanout-6h-recovery-release-restored.log`). Moving recovery delivery
inside its UoW makes that writer fail `SQLITE_BUSY`
(`/tmp/shared-people-fanout-6h-r5-recovery-deliver-inside-uow.log`). Independently moving
the step before-remove observation hook after deletion makes a separately mounted scoped
super-admin DELETE return 204 with no downstream event instead of the required `(B,A)` row
(`/tmp/shared-people-fanout-6h-r5-scoped-late-hook-mounted.log`); its restored witness passes
(`/tmp/shared-people-fanout-6h-scoped-late-hook-restored.log`). The earlier
`/tmp/shared-people-fanout-6h-r5-scoped-late-hook.log` stopped at a bare-removal assertion
before the mounted route and is **not** counted as scoped proof. Both temporary faults were
restored before the final suite. The topology correction added a valid extra recovery event;
the test now derives rank from project creation order and sorts pairs by recipient/cause.
An interim 97-pass/1-fail run used lexical random UUID order as rank
(`/tmp/shared-people-fanout-6h-final-ten-files.log`); this was a test-only expectation error.

The final ten-file focused suite passed **99/99, 561 assertions**
(`/tmp/shared-people-fanout-6h-final-ten-files-scoped.log`); its prior 98/98, 555 run
(`/tmp/shared-people-fanout-6h-final-ten-files-restored.log`) predates the isolated scoped
test. The exact boot suite, which
needs its existing loopback listener, passed **29/29, 66 assertions** in the authorized
unsandboxed run (`/tmp/shared-people-fanout-6h-boot-final-escalated.log`). The first Nx
review-correction run failed on a test-only TypeScript closure narrowing and four ESLint
findings (`/tmp/shared-people-fanout-6h-review-corrections-nx.log`); after correcting them,
the final affected `NX_DAEMON=false bunx nx run-many -t lint typecheck -p wbs-core
wbs-store-sqlite wbs-be-01 --skip-nx-cache` passed all eight scheduled targets
on final scoped-test bytes (`/tmp/shared-people-fanout-6h-final-nx-scoped.log`; the prior
eight-target success is `/tmp/shared-people-fanout-6h-final-nx.log`). Declared
`wbs-core:build:portable` and
`wbs-be-01:build` passed independently (`/tmp/shared-people-fanout-6h-final-{core,be}-build.log`);
SQLite store has no declared build target. Formatting, pinned strict/all OpenSpec and diff
checks passed on all modified/new paths (`/tmp/shared-people-fanout-6h-final-prettier-scoped.log`),
1/1 strict and 148/148 all validation
(`/tmp/shared-people-fanout-6h-final-openspec-{strict,all}-scoped.json`), and zero whitespace
errors (`/tmp/shared-people-fanout-6h-final-diff-scoped.log`). Exact-SHA host gate, CI,
publication, merge, 6i–6l and umbrella completion remain outstanding; Astra implementation
re-review is pending.

## 6h local checkpoint (2026-10-06)

Astra's final exact-byte review cleared the 39-path implementation manifest
`/tmp/astra-6h-final-cleared-manifest.json` (raw-file SHA256
`aec95a10445c1a804ebe2cac9bcb93989d0b78a1b50d5146f11ac6e01ad8a8b5`). The
implementation was committed locally as `f740615d4eccf11d8b503de0f3d7b8c37bd431c5` on
`feat/shared-people-fanout-6h`; the worktree was clean immediately afterward and all 39
committed blob hashes matched the cleared manifest. Normal commit hooks passed formatting,
lint and secret checks; migration lint and doc caps had no matching files, and Tool Wiki
reported inactive/uncertified. The planning tables above retain their historical Pending
status as of their documentation-only amendments. The final implementation proof matrix is:

| Boundary                                   | Final witness and watched fault                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grant lifetime, execute/undo/redo          | Held-delivery SQLite writer and retained admission 3/3 GREEN; settlement omission 3/3 RED (`/tmp/shared-people-fanout-6h-grant-lifetime-green.log`, `/tmp/shared-people-fanout-6h-r5-settlement-expiry-omission.log`).                                                                                         |
| Changed topology endpoints                 | Mounted B assignment removal durably records `(B,A)`, `(C,A)`, `(C,B)`; endpoint omission loses `(B,A)` (`/tmp/shared-people-fanout-6h-mounted-endpoints-green.log`, `/tmp/shared-people-fanout-6h-r5-mounted-endpoint-omission.log`).                                                                         |
| Scoped recovery timing                     | Separate mounted DELETE 204 and `(B,A)` event; late hook returns 204 but records no row (`/tmp/shared-people-fanout-6h-scoped-late-hook-restored.log`, `/tmp/shared-people-fanout-6h-r5-scoped-late-hook-mounted.log`). The earlier broad `/tmp/shared-people-fanout-6h-r5-scoped-late-hook.log` is bare-only. |
| Writer release                             | Scoped recovery second SQLite writer enters during held push; inside-UoW delivery fails `SQLITE_BUSY` (`/tmp/shared-people-fanout-6h-recovery-release-restored.log`, `/tmp/shared-people-fanout-6h-r5-recovery-deliver-inside-uow.log`).                                                                       |
| Capture, authority, atomicity and bindings | Mounted and SQLite proofs with exact fault logs are in the preceding 6h implementation table; final ten-file suite 99/99, 561 assertions and independent Astra review passed.                                                                                                                                  |

The 6h task alone is now checked. This documentation-only
follow-up has separate final checks and a separate local commit. 6i–6l, 6.1/6.2 umbrella,
exact-SHA host gate, CI, merge and publication remain open.

## 6i architecture checkpoint (2026-10-06)

Planning branch `plan/shared-people-fanout-6i-architecture` starts from reviewed 6h documentation
head `956dba9feb8f140112c34b66121f86794f6ccf30`. `6i-architecture.md`, linked normatively from
`design.md`, records actual rank and directory call paths, explicit standalone async UoW
ownership, raw OPEN borrowed stores, source/services/boot rank wiring, comparison/cause rules,
separate R5 proof obligations and Sol's ordered handoff. Mounted directory mutations already
enter command batches. Existing admitted settings/date writes retain the 6h owner. Rank and
directory synchronous Drizzle callbacks require the async-owner decision now, ahead of 6j.

No product code or R5 fault execution is included in this planning checkpoint. Implementation,
new fault proofs, independent implementation review, exact-SHA host gate, CI, publication and
merge remain pending; task 6i remains unchecked. No product tests, builds or R5 injections were
run for this documentation-only amendment. Fresh validation passed:

- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`:
  1/1 (`/tmp/shared-people-fanout-6i-arch-strict.json`).
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`: 148/148,
  comprising 130 changes and 18 specs (`/tmp/shared-people-fanout-6i-arch-all.json`).
- Prettier check over the packet, design, tasks, shared-people-mode delta spec and this ledger:
  all matched files use Prettier style. `git diff --check`: no whitespace errors.

The local checkpoint uses normal commit hooks without bypass. An inactive Tool Wiki hook is
not certification. These planning checks do not replace the later implementation review/gate.

### 6i architecture admission and refusal correction

Independent review of `e47dc238b` required mandatory current rank admission and a precise
ownership-refusal boundary. The normative packet now requires read-only current membership
inside the rank owner before capture, typed `RankMoved.forbidden` with no recovery audit,
and separate caller-addressed absent/foreign outcomes versus corrupt trusted ownership.
The task/spec and R5 matrix include queued-demotion and standalone capture-spy negatives.
Raw OPEN savepoints and single outer-owner event semantics remain unchanged. No product code
or fault execution is claimed; implementation and those new proofs remain pending.

Validation for this documentation amendment uses the same pinned strict/all, changed-path
Prettier, diff and normal-hook commands as the original checkpoint. Fresh outputs are
`/tmp/shared-people-fanout-6i-admission-{strict,all}.json`: strict 1/1 and all 148/148 passed.
Changed-path Prettier passed and `git diff --check` found no whitespace errors. Product tests
and R5 injections were not run for this documentation-only correction.

## 6i per-store mutation ownership clarification

Planning-only amendment on `plan/shared-people-fanout-6i-architecture`, parent
`ce083e9983118fd143d2c93f2ebb1196268449e0`. The normative packet requires an immutable
invocation-scoped DirectoryStore facade and one owner per raw mutator; it explicitly rejects
wrapping whole patchPersonWithin/patchTeamWithin operations in a new UoW. No product edit,
WBS mutation, publication or implementation completion is claimed.

| Required fault                                               | Decisive witness                                                                             | Result  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------- |
| Whole-service UoW replaces independent owners                | Public-facade rename survives later link after-capture failure; zero-pair links emit nothing | Pending |
| Reuse service-wide before state or wrap raw internal helpers | Exact per-mutator before/after and owner/event counts                                        | Pending |
| Capture before service validation                            | Invalid input refusal invokes zero capture/mutation/delivery                                 | Pending |
| Mutable shared invocation access                             | Deterministic cross-organization interleaving preserves each scope                           | Pending |
| Facade republishes/collects ordinary events                  | Existing ordinary service announcement count and timing remain                               | Pending |
| Facade installed beneath command/import/repair owner         | Borrowed graph retains single comparison and no nested owner                                 | Pending |

Targeted pinned strict OpenSpec, changed-path Prettier and diff checks are required for this
local documentation checkpoint. Product tests, R5 mutations, Nx gates, CI and canonical host
gate remain unrun here. All new implementation proofs/checkpoints remain pending.

Initial formatting check flagged the inline ordered task block. It was replaced by explicit
unchecked 6i.a–6i.d TDD checkpoints before the final formatting/strict/diff reruns.

Formatting needed a further correction: multiline inline-code test names in the new task list
were normalized to single-line names to avoid repeated Prettier indentation changes. Final
pinned strict validation passed 1/1, four-file Prettier and diff checks passed; logs are
`/tmp/6i-mutation-owner-plan-strict.json` and `/tmp/6i-mutation-owner-plan-format.log`.

### 6i separate mutation-boundary and event-rollback proofs

Planning correction atop `37ac4f4ab586f08cda8b80f32c47b02d6ef13c07`: links/memberships alone
are not assumed scheduler inputs. The compound public-facade proof fails after-capture of the
second link mutation and preserves the earlier rename. Separately, a cascade must first derive
at least two real recipient/cause pairs before faulting the second event insert. Name-idempotent
membership additions are observed normally; zero derived pairs means zero fan-out writes.

| Fault                                | Required distinct witness                                                                            | Result  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------- |
| Whole-service owner                  | Rename remains after second link mutation's after-capture fails; no invented event in zero-pair case | Pending |
| Record after cascade commit          | Second real insert failure rolls back cascade, first event and sequences; no delivery                | Pending |
| Emit on any membership/link mutation | Normal zero-pair comparison must stay silent                                                         | Pending |

No product code or proof execution in this amendment. Planning validation uses pinned strict
OpenSpec, four-file Prettier, diff and normal commit hooks; implementation proofs remain pending.

Planning checks passed: pinned strict OpenSpec 1/1 (`/tmp/6i-split-proof-plan-strict.json`),
four-file Prettier (`/tmp/6i-split-proof-plan-format.log`) and `git diff --check`. Final-byte
reruns use those same commands/logs. No product test, R5 or host-gate result is claimed.

### 6i implementation candidate and observed boundaries

The standalone rank and directory paths now capture and record in the mutation owner's UoW,
then deliver after release. Standalone directory services receive an invocation-scoped facade;
each actual raw mutator has its own owner. The facade constructor performs no database work.
Borrowed command services retain the raw stores and their existing outer owner. The scoped
directory missing-row read checks trusted ownership corruption without opening a write owner
before service input validation.

The first compound person/team fixture was RED under whole-service ownership
(`/tmp/shared-people-6i-person-partial-red.log`,
`/tmp/shared-people-6i-team-partial-red.log`). The per-mutator facade restored the two cases
GREEN (`/tmp/shared-people-6i-partial-facade-green.log`). A later second-owner after-capture
failure retains the first rename and its ordinary directory announcement while discarding
the later link mutation (`/tmp/shared-people-6i-second-owner-after-capture-green.log`, 1/1,
7 assertions). That link patch produced zero scheduler pairs; no fan-out event was fabricated.
Successful compound person/team patches enter two owners and capture four observations
(`/tmp/shared-people-6i-mutator-owner-count-green.log`). The separate real used-person cascade
control recorded three exact recipient/cause pairs
(`/tmp/shared-people-6i-cascade-three-pair-control.log`). Faulting its second event insert
rolled back the cascade, first event and sequence, with no push
(`/tmp/shared-people-6i-cascade-event-atomic-green.log`).

| Watched fault                                                              | Production-path failure log                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry UoW before invalid/empty input classification                        | `/tmp/shared-people-6i-r5-entry-owner-preflight.log`: owner calls 6 instead of 0                                                                                                                                         |
| Bypass trusted ownership read on missing scoped row                        | `/tmp/shared-people-6i-r5-ownership-read-bypass.log`: orphan accepted instead of thrown corruption                                                                                                                       |
| Reuse whole-service before state                                           | `/tmp/shared-people-6i-r5-reuse-whole-service-before.log`: three captures instead of four                                                                                                                                |
| Bind borrowed command directory to standalone facade                       | `/tmp/shared-people-6i-r5-borrowed-standalone-binding.log`: nested-owner diagnostic and mounted 500 instead of 200                                                                                                       |
| Share latest directory address across invocations                          | `/tmp/shared-people-6i-r5-global-directory-context.log`: first organization's write returns not_found while second succeeds                                                                                              |
| Omit cold boot rank binding                                                | `/tmp/shared-people-6i-r5-boot-rank-binding.log`: missing second durable recipient event                                                                                                                                 |
| Omit rank current-admin or capture-before-admin checks                     | `/tmp/shared-people-6i-r5-rank-current-admin.log`, `/tmp/shared-people-6i-r5-rank-capture-before-admin.log`                                                                                                              |
| Move rank or directory delivery inside owner                               | `/tmp/shared-people-6i-r5-rank-delivery-inside-owner.log`, `/tmp/shared-people-6i-r5-directory-delivery-inside-owner.log`                                                                                                |
| Record after owner release or capture after mutation                       | `/tmp/shared-people-6i-r5-rank-record-after-uow.log`, `/tmp/shared-people-6i-r5-directory-record-after-uow.log`, `/tmp/shared-people-6i-r5-rank-late-capture.log`, `/tmp/shared-people-6i-r5-directory-late-capture.log` |
| Replace selected schedule with Fast; omit numeric rank cause               | `/tmp/shared-people-6i-r5-selected-rank-forced-fast.log`, `/tmp/shared-people-6i-r5-numeric-rank-cause.log`                                                                                                              |
| Omit scoped directory composition binding or resolve address after capture | `/tmp/shared-people-6i-r5-directory-composition-binding.log`, `/tmp/shared-people-6i-r5-directory-capture-before-resolver.log`                                                                                           |

The valid empty/invalid-input control has zero owner/capture/delivery calls
(`/tmp/shared-people-6i-invalid-zero-owner-green.log`). The idempotent existing-person add
changes membership through one raw owner, but the scheduling hash remains unchanged and normal
comparison emits no pair (`/tmp/shared-people-6i-idempotent-person-green.log`). Borrowed
project-null and two-resource batches preserve one outer owner
(`/tmp/shared-people-6i-borrowed-owner-green.log`,
`/tmp/shared-people-6i-borrowed-two-resource-green.log`). The selected-ready rank and settings
fixtures check actual numeric downstream starts and byte-equal optimizer tables
(`/tmp/shared-people-6i-selected-rank-green.log`,
`/tmp/shared-people-6i-selected-settings-green.log`). The initially attempted Working Plan
reload mutation did not reach a changed event answer and is **not counted** as R5 proof;
the borrowed once-per-batch witness covers this boundary instead.

An initial combined sandbox run failed 27 boot cases with socket `EPERM` and passed 57 others
(`/tmp/shared-people-6i-seven-file-green.log`); it is not a passing suite. The exact boot
suite passed unsandboxed 29/29, 70 assertions
(`/tmp/shared-people-6i-boot-unsandboxed.log`). On final formatted test bytes, the six-file
nonboot command `bun test apps/wbs/be-01/src/controller/directory-command-organization.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-command.controller.db.test.ts apps/wbs/be-01/src/controller/project-rank.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/working-plan-order.db.test.ts` passed 56/56, 361 assertions
(`/tmp/shared-people-6i-nonboot-final-bytes.log`).

Adding the project rank store initially broke the conformance type graph and memory's passed-case
expectation (`/tmp/shared-people-6i-final-nx-lint-type.log`,
`/tmp/shared-people-6i-conformance-type.log`,
`/tmp/shared-people-6i-conformance-repair.log`). The SQLite source now offers and runs the
scoped rank case; memory explicitly declares it absent. `bun test
libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts
libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts` passed 146/146,
11,510 assertions (`/tmp/shared-people-6i-conformance-repair-green.log`), and store TS build
passed (`/tmp/shared-people-6i-conformance-type-green.log`). The full affected
`NX_DAEMON=false bunx nx run-many -t lint typecheck -p wbs-core wbs-store-sqlite wbs-be-01
--parallel=3` rerun passed 8/8 (`/tmp/shared-people-6i-nx-lint-type-rerun.log`). Declared
`wbs-core:build:portable` and `wbs-be-01:build` passed
(`/tmp/shared-people-6i-core-build-final.log`, `/tmp/shared-people-6i-be-build-final.log`).

Final documentation formatting, pinned strict/all OpenSpec, diff, local hooks, independent
implementation review and the exact-SHA host gate remain separate; no CI, push, merge or
activation is claimed here. Task 6i and later 6j–6l remain unchecked.

The first final Prettier check found only the mounted directory controller test's formatting
(`/tmp/shared-people-6i-final-format.log`). Prettier rewrote that test, then its affected
mounted suite passed 26/26, 198 assertions
(`/tmp/shared-people-6i-directory-final-formatted.log`) and `wbs-be-01:lint` passed again
(`/tmp/shared-people-6i-be-lint-after-format.log`). Pinned strict OpenSpec validated 1/1
(`/tmp/shared-people-6i-final-strict.json`); all validated 148/148, comprising 130 changes
and 18 specs (`/tmp/shared-people-6i-final-all.json`). Final format and diff checks follow
this ledger edit.

### 6i independent review follow-up (candidate after `f931c348277e813c5d2dbb138a50a655841ef381`)

Independent review identified three Important findings in that clean local checkpoint. The
follow-up is scoped to the public standalone directory facade, transaction-bound reach check,
and retained Working Plan reload proof. The prior disqualified Working Plan reload attempt above
remains historical evidence; the mounted consequence below replaces its missing R5 proof.

1. The public facade's second raw owner can observe a vanished link target or addressed entry
   after the service's earlier preflight. Before the fix, the queued team-link race threw a
   generic `unknown_service` Error (`/tmp/shared-people-6i-review-a-typed-red.log`). Scoped
   person/team patch, existing-person add, new-person later link and addressed not_found now
   preserve their declared typed refusal. The second connection changes the referenced root
   just before `BEGIN IMMEDIATE`; the refusing owner captures zero values and leaves its
   domain/event/sequence snapshot unchanged. A preceding rename remains committed. Focused
   restored logs are `/tmp/shared-people-6i-review-a-typed-green.log`,
   `/tmp/shared-people-6i-review-a-typed-expanded.log`, and
   `/tmp/shared-people-6i-review-a-new-link-green.log`.
2. The owner's resolver used to recheck only a person's assignment project. The A-team removal
   race inserts B's person's membership after public preflight but before the owner; the
   unfixed path reached the throwing capture spy rather than refusing corrupt reach
   (`/tmp/shared-people-6i-review-b-team-race-red.log`). It now calls the existing complete
   `admitted.directory.foreignReferencesTo` on the same OPEN writer before capture. Mounted
   races cover team membership, service's foreign team, tag/type on a foreign work item and a
   person's assignment on a foreign step (`/tmp/shared-people-6i-review-b-reach-matrix-green.log`,
   5/5). The A-team race separately compares the full directory, event log and sequencer with
   the state just after the second-connection insertion, asserts zero capture and zero delivery.
   Removing only the owner-side foreign reach recheck fails by reaching capture
   (`/tmp/shared-people-6i-review-b-owner-check-omission-red.log`); restored source passed the
   12-case focused suite (`/tmp/shared-people-6i-review-followup-focused-green.log`, 65 assertions).
3. Name-idempotent membership addition now asserts zero event rows, sequencer changes and push
   despite its real raw write. Injecting a spurious recipient into the production recorder made
   that mounted assertion RED on a durable `elsewhere_changed` row
   (`/tmp/shared-people-6i-review-c-spurious-event-red.log`). The team second-owner after-capture
   fault independently retains its first rename, one ordinary announcement, and no later link
   (`/tmp/shared-people-6i-review-c-team-idempotent-green.log`, 2/2). A mounted mixed batch
   performs `setEstimate` → `deleteTeam(cascade)` → `duplicateWorkItem` →
   `arrangeBySchedule`. Restored production returns 200; original and copy have no deleted team,
   copy keeps Ana, later project's addressed Fast slice starts at 2 instead of 1, and its exact
   shared event names the first project as cause
   (`/tmp/shared-people-6i-review-c-working-plan-restored-green.log`). Removing only
   `await reloadPlan()` leaves the deleted team on the retained leaf. The later duplicate tries
   to insert that stale team FK, so the mounted batch returns 500 instead of 200
   (`/tmp/shared-people-6i-review-c-working-plan-reload-omission-red.log`). The first fixture
   assertion included both default steps and failed before the batch; it was corrected to
   inspect only the addressed step (`/tmp/shared-people-6i-review-c-working-plan-green-attempt.log`).

All three injected production faults were restored before the focused GREEN. These logs do not
claim a new gate, CI, push, merge, publication or activation. Task 6i stays unchecked pending
independent follow-up review.

The additional three typed-refusal arms were each faulted independently after the team RED:
throwing instead of returning the existing-person add, new-person link and person-patch
refusals respectively failed their mounted queued cases
(`/tmp/shared-people-6i-review-a-existing-refusal-omission-red.log`,
`/tmp/shared-people-6i-review-a-new-refusal-omission-red.log`,
`/tmp/shared-people-6i-review-a-person-patch-refusal-omission-red.log`). Each source mutation was
restored; the final typed focused run passed 4/4, 28 assertions and includes zero-delivery
checks (`/tmp/shared-people-6i-review-a-final-green.log`).

The post-follow-up six-file mounted/store suite passed 67/67, 419 assertions
(`/tmp/shared-people-6i-review-six-file-final2.log`). First affected Nx lint/typecheck failed
on six new test typing errors (`/tmp/shared-people-6i-review-nx-final.log`), which were fixed
without changing assertions; direct BE `tsc --build --force` then passed
(`/tmp/shared-people-6i-review-type-fix.log`). The next full run passed typecheck but failed
store lint on the new import order (`/tmp/shared-people-6i-review-nx-final2.log`, targeted
diagnosis `/tmp/shared-people-6i-review-store-eslint-diagnosis.log`). That import was sorted;
full affected Nx lint/typecheck passed 8/8 (`/tmp/shared-people-6i-review-nx-final3.log`).
The subsequent test-only zero-delivery assertions passed 4/4 and BE lint/typecheck passed
(`/tmp/shared-people-6i-review-be-final-test-check.log`). Declared
`wbs-core:build:portable` and `wbs-be-01:build` passed
(`/tmp/shared-people-6i-review-core-build.log`, `/tmp/shared-people-6i-review-be-build.log`).

Final changed-path Prettier, pinned strict OpenSpec 1/1, all OpenSpec 148/148 and diff check
passed after the ledger reconciliation
(`/tmp/shared-people-6i-review-final-ledger-format.log`,
`/tmp/shared-people-6i-review-final-ledger-strict.json`,
`/tmp/shared-people-6i-review-final-ledger-all.json`,
`/tmp/shared-people-6i-review-final-ledger-diff.log`). The historical first format/type/lint
failures above are retained; no blanket pass is inferred from their failed runs.

## 6j architecture amendment at merged main d1d7399e

Planning-only checkpoint: `6j-architecture.md` and its normative design link, delta scenarios
and ordered 6j.a–f tasks. Source inspection found async borrowed capture versus synchronous
optimizer writes, per-sweep reconciliation ownership, selected retirement without local-fact
change, and import's pre-transaction authority boundary. The packet makes these explicit;
it does not claim any implementation or runtime proof. Main's existing 6i completion ledger
is unchanged despite PR #275 code being present.

All 6j production RED/GREEN/mutation evidence is **pending**, including installed import,
current authority, optimizer serialization, direct final deletion/retirement, every release
caller, startup/periodic sweeps and isolated-only release negatives. No product tests or host
gate were run for this docs-only amendment. Validation commands/results are recorded by the
planning checkpoint handoff; no implementation checkbox is advanced.

Planning validation (2026-10-06):

- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`
  exited 0, 1/1; `/tmp/shared-people-6j-plan-strict.json`.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`
  exited 0, 148/148; `/tmp/shared-people-6j-plan-all.json`.
- `bunx prettier --check` on the five changed planning paths and `git diff --check`
  exited 0. Final-byte checks are repeated before the local commit.

### 6j independent architecture review correction

Review of the first planning checkpoint found that `reserveSolverSlotIn` performs unscoped
reclaim before requester eligibility. Initial admission, FIFO dequeue and Retry can therefore
finish unrelated drains in several organizations, even on a non-reserved return. The revised
packet assigns those final-drain effects to their actual enclosing 6j owners; only their own
admission display changes remain 6k. It requires conservative pre-write victim discovery across
all possible queue/Retry cutoffs, retained old causes, complete reservation/queue/audit/event
rollback, post-commit delivery and separate installed-binding faults. New membership/ownership
checks now have explicit corrupt-state negatives and watched omission requirements; physically
unrepresentable conflicting ownership must be evidenced at its schema boundary.

This is a planning correction, not an observed runtime fault or implemented fix. All new
production RED/GREEN and R5 evidence remains pending, and no task checkbox is advanced.

The rereview also clarified shared-person tail imports: the existing comparator can legitimately
emit to the newly imported lower project with an existing higher cause. Silence applies to
pre-existing recipients, not all event rows; unused-person imports provide the separate total
silence case. No comparator filtering is authorized. The import authority port is now explicit
on the borrowed capture capability, including scoped missing-capability refusal and preserved
legacy fixtures. The required proof cases remain pending.

A further lifecycle review requires committed reservation/token handoff independently of
post-commit transport. The packet now prescribes tracked delivery errors and exact launch or
unlaunched cleanup for initial/dequeue/Retry reservations, with held/rejected transport and
handoff omission faults. These are pending production proofs, not claims that cleanup already
works after this new binding.

Amended planning validation repeated the pinned strict command (1/1) and all command
(148/148), both exit 0, with outputs `/tmp/shared-people-6j-plan-review-strict.json` and
`/tmp/shared-people-6j-plan-review-all.json`. Four changed Markdown files passed Prettier
check and `git diff --check` exited 0. Final-byte checks are repeated before local commit;
no product tests or host gate are claimed by this amendment.

## 6j.a borrowed import owner implementation (2026-10-06)

The installed scoped import now carries the original actor and access into its one
borrowed SQLite writer. It validates the current stored role before observation or
directory enumeration. Missing scoped authority/capture or delivery is an error;
explicit legacy imports retain the raw path. A successful import observes the
organization before its first write and after its last label, records actual
recipient/cause rows in the same UoW, releases the writer, delivers the committed
envelopes, then drains ordinary import announcements. No 6j.b–f owner changed.

Mounted TDD RED: `bun test apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts -t 'records the imported earlier project displacing a tied lower project'`
failed only at the durable `(B,A)` assertion, received `[]` after confirmed rank
`[A,B]` and displayed B earliestStart `0→1`
(`/tmp/shared-people-6ja-import-mounted-red.log`). Corrected production binding
passed 1/1, 9 assertions (`/tmp/shared-people-6ja-import-mounted-green-try2.log`).
The first GREEN attempt failed at DI resolution because `committedFanout` was not
registered (`/tmp/shared-people-6ja-import-mounted-green-try1.log`); the installer
provider was added before the passing rerun.

Mounted positive/refusal boundaries:

- Two existing tied lower projects plus earlier imported A produce three actual
  rows `(B,A),(C,A),(C,B)`, not a manufactured pair; control 1/1
  (`/tmp/shared-people-6ja-two-pair-control-green.log`). A later tail import
  produces only the new recipient `(A,B)`, while an unused-person import is
  wholly silent (`/tmp/shared-people-6ja-tail-green-try1.log`,
  `/tmp/shared-people-6ja-unused-green-try1.log`).
- A queued import whose role changes to viewer or whose membership is removed
  returns typed 403, capture count zero and no project/event row. A malformed
  trusted role injected past the SQLite CHECK constraint throws HTTP 500 from
  borrowed role validation, also capture zero and no writes. Matrix 3/3,
  12 assertions (`/tmp/shared-people-6ja-queued-authority-matrix-green.log`).
  A scoped in-memory source without transactional authority throws before any
  write/announcement (`/tmp/shared-people-6ja-missing-scoped-capability-green-try1.log`).
- An installed late `source_refused` from a real missing tag returns typed 409
  `workItems[0]/unknown_tag`, rolls back every user table, invokes only the
  before capture and pushes nothing (`/tmp/shared-people-6ja-typed-late-refusal-green2.log`).
  Injected before- and after-capture exceptions return HTTP 500 with complete
  state equality and no push; the after fault observes both captures after
  directory/project writes (`/tmp/shared-people-6ja-before-capture-failure-green.log`,
  `/tmp/shared-people-6ja-after-capture-failure-green.log`).
- A trigger refuses C's real event insert only after B's first event insert.
  HTTP 500 leaves all user tables, including ownership, optimizer rows,
  `event_log` and `event_sequencer`, byte-equal to pre-import, with zero push
  (`/tmp/shared-people-6ja-second-event-rollback-green.log`). A terminal
  gateway 400 after successful commit leaves the imported project and durable
  event row intact, with one event push attempt and no import retry
  (`/tmp/shared-people-6ja-postcommit-push-green-try1.log`).
- A valid import with directory reconciliation uses one borrowed UoW and two
  captures (`/tmp/shared-people-6ja-single-owner-green-try1.log`).

Watched R5 source mutations, each independently restored before GREEN:

| Injected production fault                                       | Mounted RED                                                                                                                   | Restored GREEN                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Installer `committedFanout` provider returns `undefined`        | Tied import 201→500; `/tmp/shared-people-6ja-r5-installer-omission-red.log`                                                   | `/tmp/shared-people-6ja-r5-installer-restored-green.log`                |
| Composition omits delivery binding                              | Tied import 201→500; `/tmp/shared-people-6ja-r5-composition-omission-red.log`                                                 | `/tmp/shared-people-6ja-r5-composition-restored-green.log`              |
| Borrowed source omits `authorizeImport`                         | Tied import 201→500 before observation; `/tmp/shared-people-6ja-r5-owner-omission-red.log`                                    | `/tmp/shared-people-6ja-r5-owner-restored-green.log`                    |
| Borrowed authority admits unconditionally                       | Queued viewer 403→201; `/tmp/shared-people-6ja-r5-authority-omission-red.log`                                                 | `/tmp/shared-people-6ja-r5-authority-restored-green.log`                |
| Stored role validation replaced by admin                        | Malformed role 500→201; `/tmp/shared-people-6ja-r5-role-validation-omission-red.log`                                          | Same restored authority matrix above                                    |
| Capture moved before authority                                  | Refused viewer capture count 0→1; `/tmp/shared-people-6ja-r5-observe-before-authority-red.log`                                | Same restored authority matrix above                                    |
| Public standalone directory wrapper replaces raw borrowed graph | Mounted import rejects at bounded nested-owner assertion; `/tmp/shared-people-6ja-r5-public-directory-wrapper-red-assert.log` | `/tmp/shared-people-6ja-r5-public-directory-wrapper-restored-green.log` |
| After capture replaced by before                                | Real `(B,A)` row becomes `[]`; `/tmp/shared-people-6ja-r5-after-capture-omission-red.log`                                     | Tied import restored GREEN above                                        |
| Transactional fan-out record omitted                            | Real `(B,A)` row becomes `[]`; `/tmp/shared-people-6ja-r5-record-omission-red.log`                                            | Tied import restored GREEN above                                        |

The first parallel Nx run lacked any task summary despite exit 0 and is not
counted (`/tmp/shared-people-6ja-nx-lint-type-try1.log`). The next run failed
at actual core `CapturedFanout|undefined` typing, incomplete module DI fixture,
and changed-file lint (`/tmp/shared-people-6ja-nx-lint-type-try2.log`); its
follow-up still found a typed test event shape and lint findings
(`/tmp/shared-people-6ja-nx-lint-type-final-try1.log`). Those source/test
findings were corrected. Exact final changed-byte suites and targets follow.

Final changed-byte import suite: `bun test` over
`apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts`,
`libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts`,
`libs/wbs/adapters/store-memory/src/import.service.test.ts`, and
`libs/wbs/application/core/src/module/plan-import/module.test.ts` passed 94/94
with 409 assertions (`/tmp/shared-people-6ja-import-fourfile-final-try4.log`).
The separate fan-out-capture/shared-fan-out suite with the controller and module
tests passed 52/52 with 164 assertions in Astra's independent review; those are
distinct file sets, and the counts are not combined. A prior
core lint rerun failed on an import-order rule and an incorrectly typed test
assertion (`/tmp/shared-people-6ja-final-wbs-core-lint.log`); both were corrected
before this passing suite.

Sequential declared Nx targets on the corrected tree passed: `wbs-core:lint`,
`wbs-store-sqlite:lint`, `wbs-be-01:lint`, `wbs-core:typecheck`,
`wbs-store-sqlite:typecheck`, `wbs-be-01:typecheck`,
`wbs-core:build:portable`, and `wbs-be-01:build`. Each ran with
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; exact logs are
`/tmp/shared-people-6ja-final2-<target-with-hyphens>.log`. The store lint was
an Nx cache hit; the other listed lint and typecheck targets executed locally.

Final `bunx prettier --check` of all 12 changed paths passed
(`/tmp/shared-people-6ja-final2-prettier.log`). Pinned
`@fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`
passed 1/1 and `validate --all --json` passed 148/148
(`/tmp/shared-people-6ja-final2-openspec-strict.json`,
`/tmp/shared-people-6ja-final2-openspec-all.json`). `git diff --check` passed.
These are local focused checks; no exact-SHA host gate, CI, push, merge or
activation was run for 6j.a.

Astra's first review found the import-suite filenames above misattributed and
three impossible nullable guards in the scoped/legacy transaction flow. The
flow now branches on legacy before any capture/authority work and returns the
committed delivery capability with scoped events, removing those guards while
preserving the borrowed writer and postcommit delivery boundary. The separate
missing-membership R5 fault changed only `authorizeImportIn`'s absent-membership
return to success: the queued removed-member mounted test answered 201 instead
of typed 403 (`/tmp/shared-people-6ja-r5-missing-membership-omission-red.log`).
Restoring it passed 1/1, four assertions
(`/tmp/shared-people-6ja-r5-missing-membership-restored-green.log`); an adjacent
`Proof:` names that fault. Final changed-byte check results after this review
correction follow.

On the corrected source, the import four-file command listed above passed
94/94, 409 assertions (`/tmp/shared-people-6ja-review-final-import-fourfile.log`),
and the distinct controller/module/fanout-capture/shared-fanout four-file
command passed 52/52, 164 assertions
(`/tmp/shared-people-6ja-review-final-fanout-fourfile.log`). The eight declared
core/store/backend lint, typecheck and build targets passed sequentially with
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; exact logs are
`/tmp/shared-people-6ja-review-final-<target-with-hyphens>.log`.

### 6j.b callback-free observation clarification

The normative packet now resolves the synchronous readPairAndAdmit callback inversion:
observeForAdmission returns generation, immutable pair and exact miss-only requests from one
source-owned synchronous immediate transaction, then coordinator callers await separate public
persistence operations after release. Raw dequeue/Retry transaction helpers stay borrowed;
command scheduling uses the captured reader. The packet specifies all public callers, including
heartbeat, and eight named production RED/mutation proof groups.

This is a docs-only architecture clarification. Sol reported overlap REDs in its separate
implementation worktree; this planning amendment does not independently claim their execution
or GREEN. All eight complete proof groups, implementation validation and host gate remain
pending here. No product source or task checkbox changes accompany this clarification.

Planning validation for this clarification: pinned strict OpenSpec exited 0 (1/1), recorded
in `/tmp/shared-people-6jb-plan-strict.json`; pinned all OpenSpec exited 0 (148/148), recorded
in `/tmp/shared-people-6jb-plan-all.json`. Four-file Prettier and `git diff --check` passed;
final-byte checks are repeated before committing. Independent rereview is requested separately;
this validation is not independent architectural clearance.

### 6j.b callback-free live optimizer implementation (2026-10-06)

The public optimizer repository serializes async persistence and live observations through
the source gate. A short immediate transaction returns the enabled generation, original pair
and miss-only requests; the coordinator releases that owner before awaiting reservation,
queue, preflight storage, child protocol or delivery. Raw dequeue/Retry helpers retain their
existing transaction owners. The borrowed command graph uses synchronous captured scheduling.
This implements 6j.b only; 6j.c–f and global final drain remain open.

The final affected `bun test` invocation over the 20 named controller, coordinator, event,
repository, saved-plan, lifecycle, core, runtime and store test files passed **408/408 with
20,212 assertions** (`/tmp/shared-people-6jb-final-affected-tests-try4.log`). The initial
18-file run passed 397/397, but omitted event/module tests. The first expanded run was
403 pass/5 fail (`...try2.log`): three unawaited fixture reads and two synchronous throws
escaping the newly Promise-typed repository API. Moving synchronous SQLite work into
`Promise.resolve().then(...)` under the held gate restored rejection and rollback
(`/tmp/shared-people-6jb-error-boundary-restored-green.log`). The next expanded run was
403 pass/1 fail (`...try3.log`): the model fixture checked a timer-dequeued slot before async
settlement. Its existing `settle()` boundary now precedes that assertion. These failing logs
remain failures, not part of the final pass count.

| Fault injected into production path                                                                                                                 | Watched RED                                                                                                                                                                                                                                                                                                                                       | Same assertion restored GREEN                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Omit each public gate: allocation, reserve, heartbeat, outcome, enqueue, release, bind, dequeue, reconciliation                                     | `/tmp/shared-people-6jb-{allocation,reserve,heartbeat,outcome,enqueue,release,bind,dequeue,reconcile}-gate-omission-red.log`; held-writer rollback lost durable state or settled early                                                                                                                                                            | `/tmp/shared-people-6jb-repository-all-restored-green.log` (17/17, 61 assertions)                                                |
| Omit coherent observation gate; omit live-variant observation gate                                                                                  | `/tmp/shared-people-6jb-observation-gate-omission-red.log` returned uncommitted generation 2; `/tmp/shared-people-6jb-live-observation-gate-omission-red-try2.log` settled inside owner                                                                                                                                                           | matching `-restored-green.log`                                                                                                   |
| Reenter public gate inside observation                                                                                                              | `/tmp/shared-people-6jb-nested-public-turn-deadlock-red-try3.log` reached bounded 1-second timeout                                                                                                                                                                                                                                                | `/tmp/shared-people-6jb-nested-public-turn-restored-green.log`                                                                   |
| Broaden miss-only policy to both objectives                                                                                                         | `/tmp/shared-people-6jb-hit-policy-widen-omission-red.log` launched ready PRI and missing TIME                                                                                                                                                                                                                                                    | `/tmp/shared-people-6jb-hit-policy-restored-green.log`; cold two-request case `/tmp/shared-people-6jb-cold-miss-exact-green.log` |
| Reread pair after preflight marker                                                                                                                  | `/tmp/shared-people-6jb-snapshot-reread-omission-red.log` replaced original idle display with later failure                                                                                                                                                                                                                                       | `/tmp/shared-people-6jb-snapshot-restored-green.log`                                                                             |
| Omit final reservation generation, enabled, open/drain fences separately                                                                            | `/tmp/shared-people-6jb-{superseded,disabled,draining}-reservation-fence-omission-red.log`; each launched stale child                                                                                                                                                                                                                             | matching `-reservation-fence-restored-green.log`                                                                                 |
| Remove await from heartbeat, normal release, cancellation release, dequeue, reconciliation tracking, stop drain, unlaunched pump release separately | `/tmp/shared-people-6jb-lifecycle-{heartbeat,release}-await-omission-red.log`, `/tmp/shared-people-6jb-cancel-release-await-omission-red.log`, `/tmp/shared-people-6jb-{dequeue,stop-drain}-await-omission-red.log`, `/tmp/shared-people-6jb-reconcile-await-omission-red-try2.log`, `/tmp/shared-people-6jb-pump-release-await-omission-red.log` | matching `-restored-green.log`; cancellation `/tmp/shared-people-6jb-cancel-release-await-restored-green.log`                    |
| Split generation allocation and cache-pair retrieval across source turns                                                                            | `/tmp/shared-people-6jb-split-pair-identity-omission-red.log`: G1 was returned with G3's failed PRI pair, suppressing its request                                                                                                                                                                                                                 | `/tmp/shared-people-6jb-split-pair-identity-restored-green.log`: G1 idle pair with both requests                                 |
| Remove live ready-schedule validation                                                                                                               | `/tmp/shared-people-6jb-live-ready-guard-omission-red.log`: malformed ready PRI with null schedule was accepted                                                                                                                                                                                                                                   | `/tmp/shared-people-6jb-live-ready-guard-restored-green.log`                                                                     |
| Omit await for PID bind before the child verdict                                                                                                    | `/tmp/shared-people-6jb-bind-before-verdict-await-omission-red.log`: bound verdicts were sent while both durable seats remained starting                                                                                                                                                                                                          | `/tmp/shared-people-6jb-bind-before-verdict-await-restored-green.log`                                                            |
| Omit terminal outcome await before lifecycle slot release                                                                                           | `/tmp/shared-people-6jb-terminal-outcome-await-omission-red.log`: release began before held outcome persistence                                                                                                                                                                                                                                   | `/tmp/shared-people-6jb-terminal-outcome-await-restored-green.log`                                                               |
| Omit initial, queued and Retry preflight outcome awaits independently                                                                               | `/tmp/shared-people-6jb-{initial,queued,retry}-preflight-store-await-omission-red.log`: each released its reserved seat before the held failed outcome was stored                                                                                                                                                                                 | matching `-restored-green.log`                                                                                                   |
| Omit stale queued seat release await before replacement enablement read                                                                             | `/tmp/shared-people-6jb-stale-release-before-enabled-await-omission-red.log`: enabled read ran while stale seat release remained held                                                                                                                                                                                                             | `/tmp/shared-people-6jb-stale-release-before-enabled-await-restored-green.log`                                                   |
| Omit initial and Retry preflight release awaits before requesting another dequeue                                                                   | `/tmp/shared-people-6jb-{initial,retry}-release-before-pump-await-omission-red.log`: a new dequeue started with the prior seat's release held                                                                                                                                                                                                     | matching `-restored-green.log`                                                                                                   |
| Remove reconciliation coalescing guard                                                                                                              | `/tmp/shared-people-6jb-reconcile-coalesce-guard-omission-red.log` started overlapping ticks                                                                                                                                                                                                                                                      | `/tmp/shared-people-6jb-reconcile-coalesce-restored-green.log`                                                                   |
| Omit captured mode at composition, module and installer independently                                                                               | `/tmp/shared-people-6jb-command-{mode,module,installer}-omission-red.log`; mounted command entered throwing live reader                                                                                                                                                                                                                           | each `-restored-green.log` (2/2, 6 assertions)                                                                                   |
| Force Fast despite ready selected schedule                                                                                                          | `/tmp/shared-people-6jb-command-selected-forced-fast-red.log` reversed actual mounted arrange/freeze order                                                                                                                                                                                                                                        | `/tmp/shared-people-6jb-command-selected-restored-green.log` (2/2)                                                               |

Each fault changed production bytes, ran its focused assertion, then restored source and
observed GREEN. The first live-observation and reconciliation-await fault runs were falsely
green because the observation windows were too short; their logs without `-try2` are
disqualified. The first nested-gate attempt used OPEN, so only `-try3` with the real
WriteCoordinator proves deadlock. A ready-hit fixture initially tried to seed TIME after its
live launch (`/tmp/shared-people-6jb-hit-policy-green-try1.log`); the full-hit fixture now
uses a separate DB. The preflight fixture initially guessed pending rather than captured
idle (`/tmp/shared-people-6jb-preflight-snapshot-green-try1.log`); this was test-only.
The first cancellation-release fixture timed out because child exit raced the heartbeat
(`/tmp/shared-people-6jb-cancel-release-baseline-green.log`); the corrected child exits
when killed and passes at `/tmp/shared-people-6jb-cancel-release-baseline-green-try2.log`.
The existing stale-switch case stayed green when the release await was removed
(`/tmp/shared-people-6jb-stale-release-caller-omission-attempt.log`); the later held-release
test is the watched proof. Its first run was accidentally made while that mutation was
still installed (`/tmp/shared-people-6jb-stale-release-before-enabled-baseline.log`), then
the restored baseline passed (`...-baseline-restored.log`) before the independent RED/GREEN.
The coherent observation test proves generation, pair and requests from one held source turn;
the independent split mutation above returned a mixed identity and lost the PRI request.
The aggregate snapshot now exposes only a `CapturedScheduler`: `readChain` requests capture
mode, and production binding supplies a captured reader. The redundant aggregate live-mode
refusal was removed; a live admission cannot be expressed through that snapshot interface.
The inner `releaseUnlaunched` await was watched separately from its stale-input and finally
callers: `/tmp/shared-people-6jb-inner-release-unlaunched-await-omission-red.log` observed
four dequeues while durable release was held (expected one); the same assertion passed
1/1, 7 assertions after restoration at
`/tmp/shared-people-6jb-inner-release-unlaunched-await-restored-green.log`.

Follow-up final-byte verification after the source-turn, captured-only and await proofs:
the same 20-file affected `bun test` command passed **418/418, 20,257 assertions** at
`/tmp/shared-people-6jb-followup-affected-tests-final.log`.
The exact final rerun used this command (exit 0, same 418/418 and 20,257 assertions at
`/tmp/shared-people-6jb-inner-final-tests.log`):

```sh
bun test apps/wbs/be-01/src/service/saved-plan-read.db.test.ts apps/wbs/be-01/src/service/deadline-plan-read.test.ts apps/wbs/be-01/src/service/solver-child-lifecycle.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/saved-plan.service.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts apps/wbs/be-01/src/service/saved-plan-current.db.test.ts apps/wbs/be-01/src/service/optimizer-availability.test.ts apps/wbs/be-01/src/service/optimized-plan-read-annotations.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimized-plan-read.test.ts apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts apps/wbs/be-01/src/controller/work-item.controller.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts libs/wbs/adapters/runtime-portable/src/scheduler.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts apps/wbs/be-01/src/module/optimization/module.test.ts libs/wbs/application/core/src/service/shared-people.test.ts libs/wbs/application/core/src/module/work-item/module.test.ts
```

The four declared project
ESLint paths passed at `/tmp/shared-people-6jb-followup-{core,runtime,store}-lint.log`
and `/tmp/shared-people-6jb-followup-backend-lint-restored.log`. The first backend lint
run failed 12 test-only `deferred<void>` findings (`...-backend-lint.log`); changing those
deferred values to `undefined` corrected the declared rerun without behavior changes.
Core and backend module checks plus core/runtime/store/backend `tsc --build --force` all
exited 0 (`/tmp/shared-people-6jb-followup-{core-module,core,runtime,store,backend-module,backend}-typecheck.log`).
Core portable, backend Bun bundle, policy asset copy and OpenAPI emit all exited 0
(`/tmp/shared-people-6jb-followup-{core-portable,backend-bundle,backend-policy,backend-openapi}-build.log`).
The final changed-path Prettier check and `git diff --check` exited 0
(`/tmp/shared-people-6jb-followup-{format,diff}-final.log`). Pinned OpenSpec
strict change validation passed 1/1 and all validation passed 148/148
(`/tmp/shared-people-6jb-followup-{strict,all}-final.log`).

Initial 6j.b candidate checks before the follow-up proof amendments: four project ESLint commands
exited 0 (`/tmp/shared-people-6jb-{core,store,runtime,backend}-lint-final.log`); core
module checker and core/runtime/store/backend direct `tsc --build --force` exited 0
(`...-typecheck-final.log`); core portable bundle and all BE bundle/policy/OpenAPI build
steps exited 0 (`...-build-final.log`). The first lint pass failed on imports/async fixtures,
the first core module checker on the complete DI fixture's omitted schedulerMode, and one
backend type pass on `recordOutcome` union inference; corrected runs are separate. Pinned
`bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`
passed 1/1 and `validate --all --json` passed 148/148
(`/tmp/shared-people-6jb-{strict,all}-final.log`). `git diff --check` exited 0.
The first final Prettier check failed only on this appended ledger
(`/tmp/shared-people-6jb-format-final.log`); after formatting, the exact all-path check is
recorded in `/tmp/shared-people-6jb-format-restored-final.log`.

## 6j.c direct lifecycle checkpoint (in progress)

The installed `optimizationLifecycle` owner wraps raw begin/finish in the borrowed
SQLite writer, resolves current project ownership before capture, compares before
and after, records recipient/cause events in that writer, and delivers after it
releases. Selected ready contract retirement at unchanged input hash emitted
`(B,A)`; equal-display and nonselected retirement were silent. The mounted
event-insert trigger aborted a later recipient and restored the complete
project/optimizer/event/sequencer snapshot. Held push permitted a second writer;
a rejected HTTP 400 push was contained by the established broadcaster, leaving
the committed event row replayable. The earlier test expectation that this
delivery error rejected the lifecycle call was wrong and is disqualified at
`/tmp/shared-people-6jc-contract-delivery-green-attempt.log`; the corrected
behavior passed 2/2, 10 assertions at
`/tmp/shared-people-6jc-contract-delivery-green.log`.

The pre-cleanup two-file final-delete run passed **31 tests, failed 1** (158
assertions) at `/tmp/shared-people-6jc-current-two-file.log`. The failing
mounted case attempts final deletion of a populated project whose `work_item`
and `step` rows hold non-cascading project FKs. Raw `finishDrainIn` issues only
`DELETE project`, so SQLite returns `SQLITE_CONSTRAINT_FOREIGNKEY`. This is a
historical RED before the reviewed 743d621 cleanup amendment and implementation
below. It is not counted as final verification. Preactivation legacy and isolated
silence were instead proven on contract retirement (2/2, 8 assertions at
`/tmp/shared-people-6jc-mode-silence-contract-green.log`).

| Production-path fault                                                          | Watched RED                                                                                                       | Restored GREEN                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Omit unconditional installed lifecycle property                                | `/tmp/shared-people-6jc-installer-omission-red.log`                                                               | `/tmp/shared-people-6jc-installer-restored-green.log`                                |
| Omit borrowed ownership resolver binding                                       | `/tmp/shared-people-6jc-resolver-binding-omission-red.log`                                                        | `/tmp/shared-people-6jc-resolver-binding-restored-green.log`                         |
| Omit installed capture, missing owner, or malformed owner guards independently | `/tmp/shared-people-6jc-{missing-capture,missing-owner,malformed-owner}-guard-omission-red.log`                   | corresponding `-restored-green.log`                                                  |
| Move old capture after contract retirement                                     | `/tmp/shared-people-6jc-old-capture-omission-red.log`: selected displacement event lost                           | `/tmp/shared-people-6jc-old-capture-restored-green.log`                              |
| Omit addressed cause                                                           | `/tmp/shared-people-6jc-addressed-cause-omission-red.log`: `(B,A)` lost at equal hash                             | `/tmp/shared-people-6jc-addressed-cause-restored-green.log`                          |
| Omit transactional recording                                                   | `/tmp/shared-people-6jc-transaction-record-omission-red.log`: later event trigger never aborted retirement        | `/tmp/shared-people-6jc-transaction-record-restored-green.log`                       |
| Deliver inside the borrowed writer                                             | `/tmp/shared-people-6jc-delivery-inside-owner-red.log`: held push made second writer fail `SQLITE_BUSY`           | `/tmp/shared-people-6jc-delivery-inside-owner-restored-green.log`: 1/1, 4 assertions |
| Omit absent/legacy branch                                                      | `/tmp/shared-people-6jc-mode-branch-omission-red.log`: absent target threw `organization undefined is missing`    | `/tmp/shared-people-6jc-mode-branch-restored-green.log`: 3/3, 13 assertions          |
| Omit absent-target resolver branch                                             | `/tmp/shared-people-6jc-absent-target-guard-omission-red.log`: missing project falsely threw ownership corruption | `/tmp/shared-people-6jc-absent-target-guard-restored-green.log`: 1/1, 5 assertions   |

The after-capture fault restored the complete transaction snapshot (1/1 in
`/tmp/shared-people-6jc-after-capture-and-cause-green.log`). An attempted
omission of a `present.has(projectId)` filter was **not** a proof: the mounted
unranked-project case still passed at
`/tmp/shared-people-6jc-absent-cause-omission-red.log`. Removing A's
`project_rank` row leaves A in both captured graphs because the rank reader
includes unranked owned projects. The comparator throws on a truly absent
direct cause; this fixture therefore cannot prove absent-cause filtering. The
redundant filter was removed; the unranked-project, after-capture and
selected-retirement cases then passed 3/3,
19 assertions at `/tmp/shared-people-6jc-after-capture-and-cause-green.log`.
The final-byte two-file rerun has the same sole FK failure: 31 pass/1 fail,
158 assertions at `/tmp/shared-people-6jc-current-two-file-final.log`.
With only that named blocked test filtered by
`-t '^(?!.*finishes a marked shared project)'`, the same two files pass
31/31, 156 assertions at `/tmp/shared-people-6jc-unblocked-two-file-final.log`;
the filtered result does not establish final deletion.
Core and store declared ESLint passed at `/tmp/shared-people-6jc-{core,store}-eslint.log`;
backend ESLint passed at `/tmp/shared-people-6jc-backend-eslint-final.log`.
The first backend lint reported 14 import-order, test-only SQL boundary and
void-valued async assertion findings at `/tmp/shared-people-6jc-backend-eslint.log`;
the corrected assertion helper and imports passed on the final test bytes.
Direct `bunx tsc --build --force` for core, store-sqlite and be-01 each exited
0 (`/tmp/shared-people-6jc-{core,store-sqlite,be-01}-type-direct.log`).
Core portable, BE Bun bundle, policy asset copy and OpenAPI emit each exited 0
(`/tmp/shared-people-6jc-{core,backend,openapi}-build.log`). Pinned OpenSpec
strict validation passed 1/1 and all validation 148/148 at
`/tmp/shared-people-6jc-{strict,all}-final.json`; `git diff --check` exited 0
at `/tmp/shared-people-6jc-diff-final.log`. The first final Prettier check
reported the modified test file (`/tmp/shared-people-6jc-format-final.log`);
after formatting, all changed paths passed at
`/tmp/shared-people-6jc-format-final-restored.log`.

Six attempted Nx targets returned exit 0 with only daemon/plugin-worker socket
EPERM warnings and no target summaries; their logs
`/tmp/shared-people-6jc-wbs-{core,store-sqlite,be-01}-{lint,typecheck}.log`
are **not** counted as verification. The direct declared commands above are
the evidence for the earlier bytes, not the populated cleanup correction below.

### 6j.c populated-deletion correction (direct owner only)

The 743d6214e2c846c1b397eb51675cc6da171db055 OpenSpec amendment was
incorporated without overwriting this live ledger. The migrated-FK inventory
is `/tmp/6jc-astra-fk-audit.log`: project, step, work item, access, dependency,
typed dependency and estimate references include NO ACTION edges. The raw
project finalizer now checks incoming/outgoing legacy and typed dependency
ownership before cleanup, deletes target estimates and access, deletes all
target work items together, then steps and root in its existing synchronous
borrowed transaction. Valid local dependencies cascade from the work-item
statement. A watched omission of an initial explicit legacy dependency delete
still passed the mounted success assertion
(`/tmp/shared-people-6jc-r5-dependency-omit-trial.log`); the redundant explicit
legacy/typed deletes were removed per architecture ruling. They are not claimed
as R5 proofs. Contract-only retirement remains unchanged.

The migrated mounted target contains nested work, estimate, actual, progress,
measure, assignment, legacy and typed edges, access, command/plan history,
saved-plan header/body, marker, band, team capacity, solution, space placement
and all work-item directory join families. It checks no target residue,
populated B and shared directory/catalog/space/audit sentinels, plus
`PRAGMA foreign_key_check`. The initial RED was
`SQLITE_CONSTRAINT_FOREIGNKEY` at root deletion
(`/tmp/shared-people-6jc-populated-red.log`); expanded fixture passed 1/1,
30 assertions at `/tmp/shared-people-6jc-all-families-green.log`, including
audit retention at `/tmp/shared-people-6jc-audit-retention-green.log`.
Counted-child finish retained the populated raw graph (1/1, 7 assertions,
`/tmp/shared-people-6jc-counted-child-green.log`).

Cross-project legacy, typed work-item and typed-step REDs failed at the wrong
generic FK boundary (`/tmp/shared-people-6jc-cross-{edge,typed-edge,step}-red.log`);
the corrected cases passed in the two-file suite. Target-owned legacy/typed
edges with bystander endpoints passed 2/2, 6 assertions
(`/tmp/shared-people-6jc-foreign-owned-green.log`). A cross-project parent
reference instead relies on its restrictive FK and complete transaction
rollback (1/1, 3, `/tmp/shared-people-6jc-parent-fk-green.log`); a missing typed
step cannot be stored (1/1, 3,
`/tmp/shared-people-6jc-schema-exclusion-green.log`).

The populated partial-cleanup trigger fires only after A's work items are
gone; the installed owner restored the full table snapshot and sent no push
(1/1, 5, `/tmp/shared-people-6jc-partial-rollback-green.log`). The raw case
passed at `/tmp/shared-people-6jc-raw-partial-green.log`. Moving the estimate
delete before the raw transaction left it committed after the later step
trigger: RED `/tmp/shared-people-6jc-r5-outside-owner-red.log`, restored GREEN
1/1, 2 at `/tmp/shared-people-6jc-r5-outside-owner-restored-green.log`.
Populated after-capture failure restored all tables with no push (1/1, 6,
`/tmp/shared-people-6jc-after-capture-green.log`). A later real C event insert
failure also restored all tables; the first fixture expected only C←A but
actual valid pairs include C←A and C←B, so the initial expectation failed at
`/tmp/shared-people-6jc-populated-event-rollback-green.log`. Corrected GREEN
was 1/1, 7 at `/tmp/shared-people-6jc-populated-event-rollback-green2.log`.

Held populated delivery allowed a second writer, then contained HTTP 400 while
retaining original B seq0/cause A for replay; repeat finish was absent/silent
(1/1, 9, `/tmp/shared-people-6jc-populated-replay-green.log`). Deleting that
durable row after owner settlement made the replay assertion fail: RED
`/tmp/shared-people-6jc-r5-replay-delete-red.log`, restored GREEN 1/1, 9 at
`/tmp/shared-people-6jc-r5-replay-restored-green.log`.

| Independently injected fault                                      | Observed RED                                                                                                  | Restored GREEN                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Omit target estimate, access, work-item or step delete separately | `/tmp/shared-people-6jc-r5-omit-{estimate,projectAccess,workItem,step}.log`: each mounted success failed 0/1  | `/tmp/shared-people-6jc-r5-family-restored-green.log`: 1/1, 23 assertions |
| Broaden each of those four destructive predicates separately      | `/tmp/shared-people-6jc-r5-broad-{estimate,projectAccess,workItem,step}.log`: B preservation failed           | `/tmp/shared-people-6jc-r5-broad-restored-green.log`: 2/2, 29 assertions  |
| Bypass legacy or typed cross-project refusal separately           | `/tmp/shared-people-6jc-r5-omit-{Legacy,Typed}-guard.log`: each accepted corrupt bystander edge as `finished` | `/tmp/shared-people-6jc-r5-guard-restored-green.log`: 2/2, 6 assertions   |
| Bypass marker or counted-slot fence separately                    | `/tmp/shared-people-6jc-r5-{marker,slot}-bypass.log`: unmarked project or counted child finished early        | `/tmp/shared-people-6jc-r5-fence-restored-green.log`: 2/2, 10 assertions  |

The first complete changed-byte two-file pass after formatted source was
86/86, 363 assertions at
`/tmp/shared-people-6jc-populated-two-file-final-candidate.log`. Later
sentinel additions require the final suite/check rerun below. These direct
owner results do **not** cover raw release/reclaim/reconcile callers assigned
to 6j.d/e; no integrated populated-deletion publication or 6j completion is
claimed.

Final corrected-byte verification: `bun test` on
`apps/wbs/be-01/src/services.db.test.ts`,
`libs/wbs/adapters/store-sqlite/src/optimization-drain.db.test.ts`,
`libs/wbs/application/core/src/service/committed-fanout.test.ts`, and
`libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts` passed 90/90,
399 assertions (`/tmp/shared-people-6jc-final-four-file.log`); the two-file
mounted/raw subset passed 86/86, 370 assertions
(`/tmp/shared-people-6jc-final-two-file.log`). Direct ESLint across complete
core, store-sqlite and be-01 source passed
(`/tmp/shared-people-6jc-final-{core,store,be}-eslint.log`). The first combined
TypeScript command named a nonexistent `be-01/tsconfig.app.json` and stopped
with TS6053 (`/tmp/shared-people-6jc-final-type.log`); the corrected declared
`bunx tsc --build --force` over core, store-sqlite and be-01 `tsconfig.json`
passed (`/tmp/shared-people-6jc-final-type-corrected.log`). Core portable
build, BE Bun bundle, policy asset copy and OpenAPI emit passed
(`/tmp/shared-people-6jc-final-{core-build,be-build,be-assets}.log`). Pinned
OpenSpec 1.12.0 strict validation passed 1/1 and all passed 148/148
(`/tmp/shared-people-6jc-final-{strict,all}.json`). The final all-path Prettier
check and staged diff check exited 0
(`/tmp/shared-people-6jc-final-all-format.log`,
`/tmp/shared-people-6jc-final-diff.log`).

### 6j.d first checkpoint: exact-token release owner and child callers

This checkpoint binds only the source-owned release path. The composed
`OptimizationLifecycle.releaseSlot` captures the addressed organization before
raw token deletion, contract retirement and project finish, records the
comparison in that same borrowed UoW, then delivers after writer release.
`buildServices` installs this release on the production optimizer repository;
its uncomposed repository factory remains available to isolated SQLite tests.
Initial reservation, Retry, dequeue/global reclaim and reconciliation owners
are **not** implemented or claimed by this checkpoint. Task 6j.d remains open.

The installed release acceptance was first RED because the lifecycle had no
`releaseSlot` (`/tmp/shared-people-6jd-release-owner-initial-red.log`), then
passed 1/1, 5 assertions after adding the owner
(`/tmp/shared-people-6jd-release-owner-corrected-green.log`). Its first
post-owner fixture expected an `open` contract retirement, but project drain
marks that contract draining; the actual answer was `finished`
(`/tmp/shared-people-6jd-release-owner-first-green.log`). Correcting only that
expectation gave the cited GREEN. The mounted terminal-child test then failed
with no B event while the production repository still used raw release
(`/tmp/shared-people-6jd-composition-binding-red.log`); the composed binding
passed 1/1, 3 assertions
(`/tmp/shared-people-6jd-composition-binding-green.log`).

| Watched production fault or boundary          | RED/observation                                                                                                                                                                   | Restored GREEN                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Omit production release-owner binding         | `/tmp/shared-people-6jd-r5-omit-composition-release-red.log`: terminal child deleted A but recorded no `(B,A)`                                                                    | `/tmp/shared-people-6jd-r5-omit-composition-release-restored-green.log`: 1/1, 3 assertions |
| Replace composed owner with raw release       | `/tmp/shared-people-6jd-r5-omit-release-owner-red.log`: event-insert trigger did not reject, so token and graph committed without comparison                                      | `/tmp/shared-people-6jd-r5-omit-release-owner-restored-green.log`: 1/1, 6 assertions       |
| Stale exact token before valid last release   | `/tmp/shared-people-6jd-stale-token-green.log`: stale release returned false/waiting, no B event; valid release produced one B seq0                                               | Same 1/1, 7 assertions                                                                     |
| Selected-ready contract-only last release     | `/tmp/shared-people-6jd-selected-release-green.log`: Fast start0 vs selected start1; A retained, contract retired and B received `(B,A)`                                          | 1/1, 6 assertions                                                                          |
| Fail recipient event insert at final release  | `/tmp/shared-people-6jd-release-event-rollback-green.log`: complete slot and populated graph snapshot restored, no push; retry succeeded with B seq0                              | 1/1, 6 assertions                                                                          |
| Fail after-capture at final release           | `/tmp/shared-people-6jd-capture-rollback-green.log`: token, graph and sequence restored, zero delivery; retry succeeded                                                           | 1/1, 5 assertions                                                                          |
| Hold then reject transport after last release | `/tmp/shared-people-6jd-held-replay-green.log`: A already deleted, second writer succeeded, completion held; HTTP400 contained and original B seq0 replay retained                | 1/1, 10 assertions                                                                         |
| Child cancellation before terminal evidence   | `/tmp/shared-people-6jd-cancelled-terminal-evidence-green.log`: project and slot remained after kill until exit was supplied; then composed release deleted A and recorded B seq0 | 1/1, 7 assertions                                                                          |

Normal terminal exit reaches the same installed binding in
`/tmp/shared-people-6jd-composition-binding-green.log`. An initial cancellation
fixture used Bun's default 5-second timeout while the actual heartbeat interval
is 5 seconds (`/tmp/shared-people-6jd-cancelled-child-green.log`); the bounded
12-second fixture passed (`/tmp/shared-people-6jd-cancelled-child-timeout-corrected.log`)
before the stronger held-terminal-evidence assertion above. This timeout is a
test-harness mistake, not a product failure. The unchanged five caller awaits
retain the independent 6j.b omission RED/GREEN records: normal and cancellation
child release, inner and outer queued-unlaunched cleanup, and initial/Retry
preflight release-before-pump at the paths listed in the 6j.b table above.
Those tests prove awaiting persistence; this first 6j.d slice proves the
installed release owner. Additional installed queued/preflight and all global
reclaim owner proofs remain pending before 6j.d completion.

An earlier four-file affected suite before the final cancellation witness passed
154/154, 766 assertions (`/tmp/shared-people-6jd-release-slice-four-file.log`).
The final expanded suite passed 158/158, 794 assertions
(`/tmp/shared-people-6jd-release-suite-final.log`) while changed-file ESLint
reported eight import, async-spawner, void-expression and unbound-method
findings (`/tmp/shared-people-6jd-release-lint-final.log`); explicit fixes made
the changed-file ESLint pass
(`/tmp/shared-people-6jd-release-lint-corrected.log`). Corrected combined
core/store/BE TypeScript build passed
(`/tmp/shared-people-6jd-release-type-final.log`). On final source/test bytes,
`bun test apps/wbs/be-01/src/services.db.test.ts
apps/wbs/be-01/src/service/solver-child-lifecycle.db.test.ts
apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
libs/wbs/adapters/store-sqlite/src/optimization-drain.db.test.ts` passed
158/158, 794 assertions
(`/tmp/shared-people-6jd-release-final-byte-suite.log`); complete BE-source
ESLint and combined core/store/BE TypeScript build exited 0
(`/tmp/shared-people-6jd-release-final-{lint,type}.log`). The BE Bun bundle
passed, 1,373 modules
(`/tmp/shared-people-6jd-release-final-build.log`). Pinned OpenSpec 1.12.0
strict passed 1/1 and all passed 148/148, changed-path Prettier passed, and
`git diff --check` exited 0
(`/tmp/shared-people-6jd-release-final-{strict,all,format,diff}.log`). The
exact-SHA host gate, CI, 6j.d global reclaim owners, 6j.e and publication are
not claimed by this local release checkpoint.

### 6j.d queued and preflight release callers (second bounded checkpoint)

No optimizer persistence behavior changed in this checkpoint. The mounted
`buildServices` fixture observes the _committed_ real reserve, Retry admission
or dequeue answer by instrumenting the existing source gate instance, then marks populated A
delete-pending after the source turn releases but before the coordinator's
cleanup call. This inserts a deterministic last-slot drain without moving
production capture or making the gate reentrant. A and B share Ana; each
positive case first reaches a counted A slot and then asserts A deletion and
B's durable seq0 `(B,A)` instead of inferring fan-out from a mock callback.

| Actual installed caller                                | Restored mounted acceptance                                                                                         | Binding omitted, watched RED                                                             | Same assertion restored GREEN                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Initial invalid-horizon preflight (`readPlan`)         | `/tmp/shared-people-6jd-initial-preflight-first.log`: 1/1, 5 assertions; no launch, slot gone, A deleted, B seq0    | `/tmp/shared-people-6jd-initial-binding-final-red.log`: B events `[]` instead of `(B,A)` | `/tmp/shared-people-6jd-initial-binding-final-restored-green.log`: 1/1, 5 |
| Retry failed-cache preflight (`retry`)                 | `/tmp/shared-people-6jd-retry-preflight-first.log`: 1/1, 6; accepted, no launch, exact slot gone, A deleted, B seq0 | `/tmp/shared-people-6jd-retry-binding-final-red.log`: B events `[]`                      | `/tmp/shared-people-6jd-retry-binding-final-restored-green.log`: 1/1, 6   |
| Stale queued input (`pumpQueue` → `releaseUnlaunched`) | `/tmp/shared-people-6jd-queued-stale-first.log`: 1/1, 6; dequeue consumed, stale seat released, A deleted, B seq0   | `/tmp/shared-people-6jd-queued-binding-final-red.log`: B events `[]`                     | `/tmp/shared-people-6jd-queued-binding-final-restored-green.log`: 1/1, 6  |

The single production composition binding was independently omitted against
each caller, then restored. The changed dependency at each caller's existing
await was also independently removed from production code and restored on the
same held-release assertion:

| Await site                       | Watched omission RED                                                                                 | Restored GREEN                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Queued inner `releaseUnlaunched` | `/tmp/shared-people-6jd-queued-await-omission-red.log`: 4 dequeues before held release vs expected 1 | `/tmp/shared-people-6jd-queued-await-restored-green.log`: 1/1, 7  |
| Initial preflight before pump    | `/tmp/shared-people-6jd-initial-await-omission-red.log`: 1 early dequeue vs expected 0               | `/tmp/shared-people-6jd-initial-await-restored-green.log`: 1/1, 4 |
| Retry preflight before pump      | `/tmp/shared-people-6jd-retry-await-omission-red.log`: 1 early dequeue vs expected 0                 | `/tmp/shared-people-6jd-retry-await-restored-green.log`: 1/1, 4   |

The three await faults were fully restored in `optimization.feature.ts`; it
has no final diff. The already reviewed normal-exit/cancellation release
proofs and 6j.b serialization fences remain in the prior section. This
checkpoint proves the installed release binding and three cleanup calls,
**not** the encompassing initial/Retry/dequeue global-reclaim owners or
their transport handoff. Task 6j.d remains unchecked.

The first test-only gate wrapper produced TS2322 because `SqliteSource.gate`
is the concrete `WriteCoordinator` with a private `tail`; this was a fixture
type error, not a product failure (`/tmp/shared-people-6jd-callers-final-type.log`).
The corrected fixture instruments the real source gate instance and the
core/store/backend `tsc --build --force` rerun exited 0
(`/tmp/shared-people-6jd-callers-corrected-type.log`).

Final changed-byte validation used
`bun test apps/wbs/be-01/src/services.db.test.ts apps/wbs/be-01/src/service/solver-child-lifecycle.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-drain.db.test.ts`:
161/161, 811 assertions (`/tmp/shared-people-6jd-callers-current-suite.log`).
`bunx eslint apps/wbs/be-01/src` and
`bunx tsc --build --force libs/wbs/application/core/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json`
exited 0 (`/tmp/shared-people-6jd-callers-current-lint.log`,
`/tmp/shared-people-6jd-callers-current-type-corrected.log`). The first
combined tsc command included a nonexistent `libs/wbs/domain/tsconfig.json`
and failed TS6053; its log is `/tmp/shared-people-6jd-callers-current-type.log`
and is not typecheck evidence. `bunx nx run wbs-be-01:build` and
`bunx nx run wbs-core:build:portable` returned 0 without task summaries after
Nx socket denial, so those invocations are **unverified**
(`/tmp/shared-people-6jd-callers-current-build-{be,core}.log`). The direct
declared Bun bundle commands
`bun build apps/wbs/be-01/src/main.ts --target=bun --outdir=dist/apps/wbs/be-01`
and
`bun build libs/wbs/application/core/testing/portable-composition.ts --target=browser --format=esm --outfile=dist/libs/wbs/application/core/portable-composition.js`
passed with 1,373 and 542 modules respectively
(`/tmp/shared-people-6jd-callers-current-build-{be,core}-direct.log`). The
backend target's other build steps were not verified in this sandbox.
`bunx prettier --check` on the three changed paths passed; pinned
`bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json`
passed 1/1, its `validate --all --json` passed 148/148, and
`git diff --check` exited 0
(`/tmp/shared-people-6jd-callers-final-doc-{format,strict,all,diff}.log`).

### 6j.d committed-decision consumer handoff (third bounded checkpoint)

This checkpoint returns required decision/envelopes pairs from reserveSlot,
dequeueRequest and admitRetry while preserving their inner decisions. The
concrete SQLite adapter returns an empty envelope array for every outcome.
Coordinator tests attach already recorded SQLite envelopes at those ports to
prove consumer behavior; they do not prove installed global-reclaim fan-out.
The coordinator registers delivery before each decision branch, returns the
committed answer without awaiting transport, reports transport errors through
its existing error sink and tracks delivery through stop/drain. The module
forwards its required delivery dependency. Task 6j.d remains unchecked.

Real SQLite decision fixtures cover reserved and project-full initial
admission, reserved and empty dequeue, and accepted and not-retryable Retry.
The initial held-delivery case returns its generation before transport and
keeps stop pending. The held/rejected dequeue and Retry cases each assert one
spawn call, a usable second SQLite writer and replay of the recorded row;
Retry also asserts one remaining slot. They do not assert equality between a
committed attempt token and the launched token. That exact-token matrix remains
for the installed reservation-owner slices. Synchronous delivery throw does
not replace accepted Retry. Adapter empty arrays cause zero transport calls.
The installed module test reaches Retry forwarding; direct repository tests
assert empty adapter arrays.

| Changed safety dependency                       | Watched RED                                                                                                       | Restored GREEN                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Initial registration before project-full return | /tmp/shared-people-6jd-handoff-reserve-register-omission-red.log: delivered []                                    | /tmp/shared-people-6jd-handoff-reserve-register-restored-green.log: 1/1, 8                                |
| Empty-dequeue registration                      | /tmp/shared-people-6jd-handoff-dequeue-register-omission-red.log: delivered []                                    | /tmp/shared-people-6jd-handoff-dequeue-register-restored-green.log: 1/1, 1; strengthened held case 1/1, 3 |
| Nonretryable Retry registration                 | /tmp/shared-people-6jd-handoff-retry-register-omission-red.log: delivered []                                      | /tmp/shared-people-6jd-handoff-retry-register-restored-green.log: 1/1, 3                                  |
| Decision before transport                       | /tmp/shared-people-6jd-handoff-delivery-before-decision-red.log: bounded 500 ms timeout                           | /tmp/shared-people-6jd-handoff-delivery-before-decision-restored-green.log: 1/1, 4                        |
| Deferred synchronous transport invocation       | /tmp/shared-people-6jd-handoff-sync-capture-omission-red.log: thrown transport replaced accepted Retry            | /tmp/shared-people-6jd-handoff-sync-capture-restored-green.log: 1/1, 3                                    |
| Error reporting                                 | /tmp/shared-people-6jd-handoff-error-report-omission-red.log: zero reported errors instead of one                 | /tmp/shared-people-6jd-handoff-error-report-restored-green.log: 1/1, 6                                    |
| In-flight tracking                              | /tmp/shared-people-6jd-handoff-tracking-omission-red-try3.log: stop settled during held transport                 | /tmp/shared-people-6jd-handoff-tracking-restored-green-try3.log: 1/1, 3                                   |
| Empty-array guard                               | /tmp/shared-people-6jd-handoff-empty-guard-omission-red.log: four transport calls instead of zero                 | /tmp/shared-people-6jd-handoff-empty-guard-restored-green.log: 1/1, 1                                     |
| Installer delivery provider                     | /tmp/shared-people-6jd-handoff-installer-omission-red.log: installed dependency resolution failed                 | /tmp/shared-people-6jd-handoff-installer-restored-green.log: 1/1, 2                                       |
| Module forwarding                               | /tmp/shared-people-6jd-handoff-module-forward-omission-red.log: installed Retry reached missing delivery function | /tmp/shared-people-6jd-handoff-module-forward-restored-green.log: 1/1, 2                                  |

The first two in-flight omission trials stayed green because child work or a
short wait masked delivery tracking. Their logs ending
tracking-omission-red.log and tracking-omission-red-try2.log are disqualified.
An initial reservation fixture attached one envelope to both PRI and TIME,
observed duplicate delivery, then narrowed injection to one request.

The first broad run failed four test assertions (159 pass/4 fail,
/tmp/shared-people-6jd-handoff-current-suite.log). Two test-only gate
observers inspected top-level kind instead of the new decision.kind; three
older read calls compared an unawaited Promise to null. The corrected observer
unwraps only for inspection and retains counted-slot/drain assertions; all
three reads are awaited. No product timing or release behavior changed. The
next sandbox run passed 162 and failed only the subprocess handshake
(/tmp/shared-people-6jd-handoff-rerun-suite.log). Diagnostic
/tmp/shared-people-6jd-handoff-handshake-diagnostic.log showed two bound
green slots and EPERM on Bun child stdin pipe writes before child marker
creation. The temporary diagnostic was removed. The exact standalone
handshake test outside the sandbox passed 1/1, 13 assertions
(/tmp/shared-people-6jd-handoff-handshake-unsandboxed.log).

On final source/test bytes, the exact sandbox command:

    bun test apps/wbs/be-01/src/module/optimization/module.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts apps/wbs/be-01/src/services.db.test.ts

passed 162/162, 19,313 assertions
(/tmp/shared-people-6jd-handoff-final-byte-eight.log). Complete BE-source ESLint
and direct BE tsc --build --force exited 0
(/tmp/shared-people-6jd-handoff-final-byte-{lint,type}.log). Direct BE Bun bundle
passed with 1,373 modules
(/tmp/shared-people-6jd-handoff-final-byte-build.log). The nine-file sandbox
command is not claimed green; its process case has separate approved
unsandboxed evidence
(/tmp/shared-people-6jd-handoff-final-byte-handshake.log). Formatting,
OpenSpec and diff results follow the final documentation check below.
Changed-path Prettier passed
(/tmp/shared-people-6jd-handoff-final-doc-format.log); pinned OpenSpec
1.12.0 strict passed 1/1 and all passed 148/148
(/tmp/shared-people-6jd-handoff-final-doc-{strict,all}.log), and
git diff --check exited 0
(/tmp/shared-people-6jd-handoff-final-doc-diff.log). These checks precede
only this results paragraph; formatting and diff were repeated afterward.

### 6j.d initial reservation global-reclaim owner (fourth bounded checkpoint)

The installed initial reserve path now owns its unscoped expired-slot reclaim,
the old and new captures for every existing slot-owner organization, the
reservation decision and event inserts in one borrowed SQLite unit of work.
The raw reclaim reports only targets actually finished; those targets provide
the addressed causes. The owner returns committed envelopes to the existing
coordinator handoff. Retry, dequeue and reconciliation still use their prior
owners and are **not** covered by this checkpoint; task 6j.d stays unchecked.

Mounted `buildServices` tests prove populated A deletion records B←A; distinct
expired A/C in two organizations record B←A and D←C while future E/F remain;
a requester closed just before reservation still commits the victim event.
Selected ready contract retirement records B←A with A's project retained.
The missing borrowed capability refuses before victim mutation (the
requester's earlier observation may legitimately allocate its generation).
The real held/rejected HTTP400 transport test proves committed B seq0 while
transport is held, a second connection writes B, the launched requester
attempt tokens equal the persisted requester slots, and replay retains the
original row. This does not assert victim slot-token equality or claim the
unimplemented Retry/dequeue owner transport matrix.

For `after-capture`, injected capture failure restores all 28 snapshotted
tables and delivers nothing. For `event-insert`, the trigger rejects D's insert
**only after** B's first victim row exists within that transaction; failure
again restores the complete snapshot and delivery remains zero. Removing the
fault and retrying records B←A and D←C once each
(`/tmp/shared-people-6jd-initial-owner-partial-event-confirmed.log`, 2/2,
14 assertions). An earlier single-recipient trigger and its broader fixture
were superseded; the initial overbroad assertion that X had no optimization
failure event was narrowed to the specified absence of an invented X
`elsewhere_changed` event. The first missing-capability fixture tried to use
the lifecycle begin method after removing the same capture capability; it
failed before reservation. The corrected test seeds the raw drain marker and
checks victim state, excluding the separately committed requester observation
generation.

| Changed dependency                        | Watched RED                                                                                                          | Restored GREEN                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Installed initial owner binding           | `/tmp/shared-people-6jd-initial-owner-binding-omission-red.log`: A deleted, B range empty                            | `/tmp/shared-people-6jd-initial-owner-binding-restored-green.log`: 1/1, 5      |
| Capture every old slot-owner organization | `/tmp/shared-people-6jd-initial-capture-org-omission-red.log`: D←C absent while B←A persisted                        | `/tmp/shared-people-6jd-initial-capture-org-restored-green.log`: 1/1, 11       |
| Address actual finished cause             | `/tmp/shared-people-6jd-initial-actual-cause-omission-red.log`: selected B←A absent while A survived                 | `/tmp/shared-people-6jd-initial-actual-cause-restored-green.log`: 1/1, 6       |
| Transactional event record                | `/tmp/shared-people-6jd-initial-record-omission-red.log`: B range empty after A deletion                             | `/tmp/shared-people-6jd-initial-record-restored-green.log`: 1/1, 5             |
| Committed owner result                    | `/tmp/shared-people-6jd-initial-commit-omission-red.log`: A's expired slot remained                                  | `/tmp/shared-people-6jd-initial-commit-restored-green.log`: 1/1, 5             |
| Borrowed-capability guard                 | `/tmp/shared-people-6jd-initial-capability-guard-omission-red.log`: incidental property error replaced typed refusal | `/tmp/shared-people-6jd-initial-capability-guard-restored-green.log`: 1/1, 4   |
| Raw finished-target callback              | `/tmp/shared-people-6jd-initial-finished-callback-omission-red.log`: selected B←A absent                             | `/tmp/shared-people-6jd-initial-finished-callback-restored-green.log`: 1/1, 6  |
| Inner admission callback forwarding       | `/tmp/shared-people-6jd-initial-admission-callback-omission-red.log`: selected B←A absent                            | `/tmp/shared-people-6jd-initial-admission-callback-restored-green.log`: 1/1, 6 |
| Wrapper admission callback forwarding     | `/tmp/shared-people-6jd-initial-admission-wrapper-omission-red.log`: selected B←A absent                             | `/tmp/shared-people-6jd-initial-admission-wrapper-restored-green.log`: 1/1, 6  |
| Stored deadline predicate                 | `/tmp/shared-people-6jd-initial-future-predicate-all-rows-red.log`: future E deleted                                 | `/tmp/shared-people-6jd-initial-future-predicate-restored-green.log`: 1/1, 11  |

The first inverse-deadline mutation failed at surviving expired A/C before
reaching the future E assertion and is disqualified
(`/tmp/shared-people-6jd-initial-future-predicate-omission-red.log`). All
mutated sources were restored against saved current-byte hashes before final
verification.

The exact changed-byte runtime command was:

    bun test apps/wbs/be-01/src/module/optimization/module.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts apps/wbs/be-01/src/services.db.test.ts

It passed 170/170, 19,367 assertions
(`/tmp/shared-people-6jd-initial-final-eight2.log`). The first formatter-byte
run also passed 170/170, but direct tsc found a test-only `unknown` event
message guard and ESLint found seven test/import style errors; those diagnostics
remain in `/tmp/shared-people-6jd-initial-final-{type,eslint}.log`. After
minimal corrections, `bunx eslint apps/wbs/be-01/src
libs/wbs/adapters/store-sqlite/src/optimization-admission.ts
libs/wbs/adapters/store-sqlite/src/optimization-drain.ts` passed with no output
(`/tmp/shared-people-6jd-initial-final-eslint2.log`). Direct
`bunx tsc --build --force` for core, store-sqlite and backend passed
(`/tmp/shared-people-6jd-initial-final-type2.log`). Direct Bun backend and
core bundles passed with 1,374 and 542 modules respectively
(`/tmp/shared-people-6jd-initial-final-build-{be,core}.log`). Final formatting,
strict/all OpenSpec and diff checks are recorded after this ledger update.

On the ledger and source bytes above, seven-path Prettier check passed
(`/tmp/shared-people-6jd-initial-final-format2.log`), pinned OpenSpec 1.12.0
strict passed 1/1 and all passed 148/148
(`/tmp/shared-people-6jd-initial-final-{strict,all}2.log`), and
`git diff --check` exited 0 (`/tmp/shared-people-6jd-initial-final-diff2.log`).

The independent exact-`20416b48` eight-file rerun passed 170/170,
19,367 assertions (`/tmp/shared-people-6jd-astra-20416b48-eight.log`). Review
found two proof gaps, with no product behavior finding. The installed closed
admission test now asserts the actual gateway call after B's durable event.
Removing envelopes only for the non-reserved decision left B's event intact
but made the gateway-call assertion fail
(`/tmp/shared-people-6jd-initial-closed-envelope-omission-red.log`);
restoring the source passed 1/1, 7 assertions
(`/tmp/shared-people-6jd-initial-closed-envelope-restored-green.log`). The
same test passed before injection with the new assertion
(`/tmp/shared-people-6jd-initial-closed-push-baseline-green.log`).

A separate split-commit fault inserted `COMMIT; BEGIN IMMEDIATE` between raw
reservation and event recording on the borrowed connection. The existing D
event trigger fired only after B's first row had been inserted; its rollback
then left A/C deleted, their slots gone and the X reservation present. The
full-state snapshot assertion failed at that residue
(`/tmp/shared-people-6jd-initial-split-commit-omission-red.log`), rather than
at an incidental transaction exception. Restoring the exact pre-fault source
passed the identical case 1/1, 8 assertions
(`/tmp/shared-people-6jd-initial-split-commit-restored-green.log`). Adjacent
Proof comments identify both faults. This follow-up changes only the mounted
test assertion, proof comments and this ledger; the owner algorithm is
unchanged.

On the follow-up bytes, the same literal eight-file Bun command above passed
170/170, 19,368 assertions
(`/tmp/shared-people-6jd-initial-followup-eight.log`). Direct ESLint on the
changed source/test, combined core/store/backend `tsc --build --force`, and
the backend Bun bundle passed (1,374 modules)
(`/tmp/shared-people-6jd-initial-followup-{eslint,type,build-be}.log`).
Three-path Prettier check passed; pinned OpenSpec 1.12.0 strict passed 1/1,
all passed 148/148, and `git diff --check` exited 0
(`/tmp/shared-people-6jd-initial-followup-{format,strict,all,diff}.log`).

### 6j.d Retry global-reclaim owner checkpoint

This isolated slice installs the source-owned borrowed Retry owner only. Its
typed read-only preflight preserves authority → input hash → cached outcome →
live-slot order before capture or token mint. Under one writer turn it captures
all old slot-owner organizations, reserves once at
`max(now, failed.createdAt + 1)`, records only actual finished causes, and
commits the reservation/queue/recovery audit/events together. Direct repository
Retry reuses the preflight and raw mutation helpers, returning `envelopes: []`.
FIFO dequeue, 6j.e, 6j.f and the 6j.d checkbox remain open.

The first mounted production RED used
`bun test apps/wbs/be-01/src/services.db.test.ts --test-name-pattern='records a foreign victim event when an installed Retry reclaims its expired last slot'`:
the direct adapter deleted A but B's event range was empty
(`/tmp/shared-people-6jd-retry-first-red.log`). After installing the owner,
the same case passed 1/1, 6 assertions
(`/tmp/shared-people-6jd-retry-first-green.log`). An intermediate test
assertion expected only one gateway push, overlooking a separate requester
preflight failure event; that test-only error is preserved in
`/tmp/shared-people-6jd-retry-first-green-attempt.log`.

| Installed production-path case                                                  | Observed GREEN                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expired A/C in distinct orgs, future E, marker created later than request clock | `/tmp/shared-people-6jd-retry-multi-cutoff-first.log`: 1/1, 12; B←A and D←C seq0, E retained, no invented X cause                                                                                                                         |
| Selected A contract retired while A and its local input facts survive           | `/tmp/shared-people-6jd-retry-selected-first.log`: 1/1, 6; addressed A cause yields B←A                                                                                                                                                   |
| Foreign, removed actor, public stale hash, live slot, absent failed marker      | `/tmp/shared-people-6jd-retry-refusals-extended2.log`: 1/1, 22; typed refusals, zero added capture/audit/push                                                                                                                             |
| Accepted restricted recovery reservation                                        | `/tmp/shared-people-6jd-retry-recovery-audit-first.log`: 1/1, 5; exactly one audit and B←A                                                                                                                                                |
| Capacity-queued restricted recovery                                             | `/tmp/shared-people-6jd-retry-queued-audit-second.log`: 1/1, 7; persisted PRI queue, one audit, B←A and actual push                                                                                                                       |
| After-capture throw and second real event insert failure                        | `/tmp/shared-people-6jd-retry-rollback-first.log`: 2/2, 18; full lifecycle-table snapshot restored, zero delivery; fault-free retry emits original seq0 and one audit                                                                     |
| Eligible preflight then raw closed or already-present result                    | `/tmp/shared-people-6jd-retry-late-nonreserved-repeat.log`: 2/2, 19; B event pushed in both non-accepted answers, zero audit/launch, competing token retained, repeated Retry silent                                                      |
| Held then gateway-400 victim push                                               | `/tmp/shared-people-6jd-retry-held-first.log`: 1/1, 8; answer before transport, one requester launch token equals persisted slot token, second writer enters, original B seq0 remains replayable                                          |
| Installed missing borrowed capture                                              | `/tmp/shared-people-6jd-retry-missing-capability-second.log`: 1/1, 4; named refusal, state preserved                                                                                                                                      |
| Persisted generation hash mismatches an otherwise valid public Retry request    | `/tmp/shared-people-6jd-retry-r5-persisted-hash-green.log`: 1/1, 27; `retryPreflightIn` refused before capture, lifecycle/audit state unchanged; direct repository token-mint counter is separately asserted in `optimization.db.test.ts` |
| Capacity-queued second real event insert failure                                | `/tmp/shared-people-6jd-retry-queued-rollback-green1.log`: 1/1, 11; snapshot including `solver_queue` and `organization_audit` restored, zero delivery; after trigger removal one PRI queue, one audit, B←A and D←C seq0                  |

The first stale-hash assertion used the inner repository answer instead of the
public `stale-input-hash` contract (`...retry-refusals-extended.log`); the first
queued assertion used inner `admission:null` instead of public
`accepted/retrying` (`...retry-queued-audit-first.log`). The first missing-
capability fixture called lifecycle begin after removing that same capability,
so it failed before Retry (`...retry-missing-capability-first.log`). All three
are test-only fixture corrections. A cause-omission fault against fully deleted
A stayed GREEN because the comparator infers changed local facts; it is
disqualified. The selected contract-only witness above makes explicit causes
provably necessary.

Each R5 fault below changed production bytes, failed at the named mounted
assertion, was restored against a current-byte SHA-256 backup, and passed the
identical assertion. Adjacent `Proof:` comments name these faults.

| Dependency                         | Watched RED                                                                                                                                                                                                                   | Restored GREEN                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Installed Retry binding            | `/tmp/shared-people-6jd-retry-r5-installer-omit-red.log`: A deleted, B row missing                                                                                                                                            | `/tmp/shared-people-6jd-retry-r5-installer-restore-green.log`: 1/1, 6 |
| Every old slot-owner org           | `/tmp/shared-people-6jd-retry-r5-all-orgs-red.log`: D←C missing                                                                                                                                                               | `/tmp/shared-people-6jd-retry-r5-all-orgs-green.log`: 1/1, 12         |
| Marker-adjusted cutoff             | `/tmp/shared-people-6jd-retry-r5-cutoff-red.log`: C survived                                                                                                                                                                  | `/tmp/shared-people-6jd-retry-r5-cutoff-green.log`: 1/1, 12           |
| Actual addressed finished cause    | `/tmp/shared-people-6jd-retry-r5-cause-selected-red.log`: selected B←A missing                                                                                                                                                | `/tmp/shared-people-6jd-retry-r5-cause-selected-green.log`: 1/1, 6    |
| Transactional record               | `/tmp/shared-people-6jd-retry-r5-record-red.log`: B row missing after A deletion                                                                                                                                              | `/tmp/shared-people-6jd-retry-r5-record-green.log`: 1/1, 6            |
| One commit for mutation and events | `/tmp/shared-people-6jd-retry-r5-split-commit-red.log`: second-event failure left A/C deleted and X slot persisted at full-state assertion                                                                                    | `/tmp/shared-people-6jd-retry-r5-split-commit-green.log`: 1/1, 10     |
| Non-accepted envelopes             | `/tmp/shared-people-6jd-retry-r5-nonreserved-both-red.log`: both durable B rows, both gateway pushes absent                                                                                                                   | `/tmp/shared-people-6jd-retry-r5-nonreserved-both-green.log`: 2/2, 14 |
| Borrowed capture guard             | `/tmp/shared-people-6jd-retry-r5-capability-red.log`: incidental property error                                                                                                                                               | `/tmp/shared-people-6jd-retry-r5-capability-green.log`: 1/1, 4        |
| Authority before capture           | `/tmp/shared-people-6jd-retry-r5-preflight-order-red.log`: foreign refusal capture count 2→3                                                                                                                                  | `/tmp/shared-people-6jd-retry-r5-preflight-order-green.log`: 1/1, 22  |
| Persisted generation hash fence    | `/tmp/shared-people-6jd-retry-r5-persisted-hash-red.log`: mounted valid request was accepted/retrying instead of not-retryable when the stored generation hash differed                                                       | `/tmp/shared-people-6jd-retry-r5-persisted-hash-green.log`: 1/1, 27   |
| Queued mutation and event commit   | `/tmp/shared-people-6jd-retry-r5-queued-split-red.log`: temporary COMMIT/BEGIN after raw mutation reached the full-state assertion; A/C slots/graph deleted, X PRI queue and recovery audit survived the second event failure | `/tmp/shared-people-6jd-retry-r5-queued-split-green.log`: 1/1, 11     |

The initial affected command was
`bun test apps/wbs/be-01/src/services.db.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts --timeout=10000`:
151/151, 901 assertions (`/tmp/shared-people-6jd-retry-three-file-first.log`).
Direct BE lint first found seven test-only style errors
(`/tmp/shared-people-6jd-retry-be-lint-first.log`); after correction direct
ESLint exited 0, but warned its Nx boundary rule skipped for absent cached
ProjectGraph (`...retry-be-lint-second.log`). Forced BE tsc exited 0
(`...retry-be-type-second.log`), and the corrected fixture cases passed 3/3,
22 assertions (`...retry-lintfix-focused.log`). After Prettier wrote the final
source/test/ledger bytes, the exact eight-file command was:

    bun test apps/wbs/be-01/src/module/optimization/module.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts apps/wbs/be-01/src/services.db.test.ts --timeout=10000

Before the closed/already-present case was broadened, it passed 181/181, 19,463 assertions
(`/tmp/shared-people-6jd-retry-final-eight-first.log`). Declared
`NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache` succeeded with
a real target summary (`/tmp/shared-people-6jd-retry-nx-lint.log`), as did
`wbs-be-01:typecheck` plus its `typecheck:module` dependency
(`/tmp/shared-people-6jd-retry-nx-typecheck.log`). Declared
`wbs-be-01:build` plus `wbs-solver-supervisor-protocol:build` succeeded; the
backend bundle reports 1,375 modules and the remaining copy/OpenAPI commands
ran (`/tmp/shared-people-6jd-retry-nx-build.log`). Nx warned that plugin
worker sockets were denied and ran plugins in-process; target summaries are
present and successful. The broadened closed/already-present fixture then
passed 2/2, 19 assertions, including its repeated-silence and retained-token
checks (`/tmp/shared-people-6jd-retry-late-nonreserved-repeat.log`). The exact
eight-file command above on the final source/test bytes passed 182/182,
19,475 assertions (`/tmp/shared-people-6jd-retry-final-eight2.log`). Fresh
declared Nx lint, typecheck plus module dependency, and backend build plus
supervisor-protocol dependency all produced successful target summaries
(`/tmp/shared-people-6jd-retry-final-nx-{lint,typecheck,build}.log`).
On the ledger and source bytes above, five-path Prettier check passed
(`/tmp/shared-people-6jd-retry-final-format2.log`); pinned OpenSpec 1.12.0
strict passed 1/1 and all passed 148/148
(`/tmp/shared-people-6jd-retry-final-{strict,all}2.json`); `git diff --check`
exited 0 (`/tmp/shared-people-6jd-retry-final-diff2.log`).

The follow-up closes the independent proof review without changing Retry
behavior. A mounted request whose supplied input hash matched the public
caller input but disagreed with the stored generation hash reached
`retryPreflightIn` and returned `not-retryable` with zero additional capture,
audit, delivery or lifecycle-table writes. Removing only its stored-hash
guard changed that mounted answer to accepted/retrying
(`/tmp/shared-people-6jd-retry-r5-persisted-hash-red.log`); restored GREEN was
1/1, 27 assertions (`...r5-persisted-hash-green.log`). The direct repository
test `checks Retry eligibility before creating a token` owns the token-mint
counter assertion; the mounted refusal fixture does not count token calls.

The separate capacity-queued second-event fixture included `solver_queue`
and `organization_audit` in its exact before/after snapshot. The second real
recipient event trigger rolled back the victim graph, four retained capacity
slots, new PRI queue, recovery audit, events and sequence; after dropping the
trigger, one PRI queue and one audit committed with B←A and D←C seq0
(`/tmp/shared-people-6jd-retry-queued-rollback-green1.log`: 1/1, 11).
Temporarily inserting `COMMIT; BEGIN IMMEDIATE` after `retryMutationIn` but
before event recording made the same full-state assertion fail: A/C had been
deleted and X's PRI queue and recovery audit persisted while the event insert
failed (`/tmp/shared-people-6jd-retry-r5-queued-split-red.log`). Restoring the
owner from a SHA-256-identical current-byte backup returned the identical
case to GREEN 1/1, 11
(`/tmp/shared-people-6jd-retry-r5-queued-split-green.log`).

On these follow-up source/test bytes, the literal eight-file command above
passed 183/183, 19,491 assertions
(`/tmp/shared-people-6jd-retry-followup-eight.log`). Declared
`NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache` succeeded
(`/tmp/shared-people-6jd-retry-followup-nx-lint.log`), as did
`wbs-be-01:typecheck` with its module dependency
(`/tmp/shared-people-6jd-retry-followup-nx-typecheck.log`) and
`wbs-be-01:build` with its solver-supervisor-protocol dependency
(`/tmp/shared-people-6jd-retry-followup-nx-build.log`). All three contain
actual Nx success summaries; Nx used in-process plugins after its socket
warning. Final four-path `bunx prettier --check` passed
(`/tmp/shared-people-6jd-retry-followup-format.log`); pinned OpenSpec 1.12.0
strict passed 1/1 and all passed 148/148
(`/tmp/shared-people-6jd-retry-followup-{strict,all}.log`); `git diff --check`
exited 0 (`/tmp/shared-people-6jd-retry-followup-diff.log`).

### 6j.d FIFO dequeue global-reclaim owner (fifth bounded checkpoint)

This slice installs one borrowed source owner around the entire raw FIFO
dequeue loop. It captures every old slot-owner organization before reclaim,
passes actual finished targets from each reservation, records changed
recipient pairs before commit, and returns committed envelopes for reserved,
empty and capacity-blocked outcomes. The coordinator's existing delivery
handoff and token/stop behavior remain unchanged. Reconciliation, 6j.e/f and
the 6j.d checkbox remain open; no host gate or CI was run.

The first installed RED was an empty B event range after a draining A was
reclaimed by the public `buildServices` queue pump
(`/tmp/shared-people-6jd-dequeue-first-red2.log`). The installed owner made
the same case GREEN 1/1, 2 assertions
(`/tmp/shared-people-6jd-dequeue-first-green-attempt.log`). Further installed
GREEN cases cover later enqueued cutoff after an invalid head with a future C
slot retained (`...dequeue-r5-future-green.log`: 1/1, 6), capacity-blocked and
closed→empty outcomes each delivering B's actual durable event
(`...dequeue-r5-nonreserved-green.log`: 2/2, 10), and selected-contract-only
retirement with A's scheduling input hash unchanged
(`...dequeue-r5-cause-green.log`: 1/1, 5). The second-event fault restores the
complete A/C/E project, slot, FIFO, audit, event and sequence snapshot with
zero spawn/push; after removing the trigger the same installed pump consumes
the invalid head and eligible entry, emits B←A and D←C at seq0, leaves future
E/F silent, and a repeated pump is row-identical
(`/tmp/shared-people-6jd-dequeue-repeat-green.log`: 1/1, 13). Held/rejected
victim delivery lets queued C's committed attempt token launch once and equal
its persisted slot token while a second writer edits B; original B seq0 stays
replayable and stop waits for transport
(`/tmp/shared-people-6jd-dequeue-held-fourth.log`: 1/1, 9).
The installed old-slot owner negatives separately reject absent borrowed
capture, malformed organization, and missing active organization before any
capture, writes or push (`...dequeue-owner-negatives-green.log`: 2/2, 7;
`...dequeue-missing-owner-green.log`: 1/1, 4).

Each fault below changed production bytes, failed at the named mounted
assertion, then was restored from a matching SHA-256 backup and passed. The
adjacent `Proof:` comments identify the safety dependencies.

| Fault                                               | Watched RED                                                                                                                                 | Restored GREEN                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Omit installed dequeue owner                        | `/tmp/shared-people-6jd-dequeue-r5-binding-event-red.log`: B event absent; `...r5-binding-red.log`: second-event rollback no longer rejects | `/tmp/shared-people-6jd-dequeue-r5-binding-green.log`: 2/2, 11     |
| Capture only first old slot-owner organization      | `/tmp/shared-people-6jd-dequeue-r5-all-org-red.log`: D←C and second-event trigger absent                                                    | `/tmp/shared-people-6jd-dequeue-r5-all-org-green.log`: 1/1, 12     |
| Omit raw finished-target callback                   | `/tmp/shared-people-6jd-dequeue-r5-cause-red.log`: selected contract-only B←A absent                                                        | `/tmp/shared-people-6jd-dequeue-r5-cause-green.log`: 1/1, 5        |
| Ignore later head's enqueued cutoff                 | `/tmp/shared-people-6jd-dequeue-r5-cutoff-red.log`: drained A survives                                                                      | `/tmp/shared-people-6jd-dequeue-r5-cutoff-green.log`: 1/1, 4       |
| Broaden cutoff beyond future deadline               | `/tmp/shared-people-6jd-dequeue-r5-future-red.log`: future C slot lost                                                                      | `/tmp/shared-people-6jd-dequeue-r5-future-green.log`: 1/1, 6       |
| Discard nonreserved envelopes                       | `/tmp/shared-people-6jd-dequeue-r5-nonreserved-red.log`: both durable B rows, both gateway pushes absent                                    | `/tmp/shared-people-6jd-dequeue-r5-nonreserved-green.log`: 2/2, 10 |
| Split writer commit before event recording          | `/tmp/shared-people-6jd-dequeue-r5-split-red.log`: second-event failure leaves A/C deleted and FIFO consumed at full snapshot assertion     | `/tmp/shared-people-6jd-dequeue-r5-split-green.log`: 1/1, 12       |
| Omit borrowed capture capability check              | `/tmp/shared-people-6jd-dequeue-r5-capability-red.log`: incidental property error replaces named refusal                                    | `/tmp/shared-people-6jd-dequeue-r5-capability-green.log`: 1/1, 3   |
| Guess owner instead of resolving on borrowed source | `/tmp/shared-people-6jd-dequeue-r5-resolver-red.log`: malformed A ownership passes                                                          | `/tmp/shared-people-6jd-dequeue-r5-resolver-green.log`: 1/1, 4     |
| Omit event recording                                | `/tmp/shared-people-6jd-dequeue-r5-record-red.log`: B row missing after A reclaim                                                           | `/tmp/shared-people-6jd-dequeue-r5-record-green.log`: 1/1, 5       |

The first rollback fixture started the optimizer and startup reconciliation
removed A/C before FIFO; `/tmp/shared-people-6jd-dequeue-rollback-first.log`
is **disqualified**. The corrected test invokes the actual composed
coordinator's existing queue pump directly, isolating only startup
reconciliation while retaining the installed dequeue binding/UoW/raw loop.
The first held fixture queued B, whose input legitimately changed after A
deletion and caused re-admission; `...dequeue-held-third.log` is test-only
fixture evidence, not an accepted token proof. The selected-retirement first
assertion wrongly expected its generation row to survive contract retirement
(`...dequeue-selected-first.log`); the corrected control asserts unchanged
captured scheduling input hash.

Final-byte runtime command:

    BUN_TMPDIR=/tmp bun test apps/wbs/be-01/src/module/optimization/module.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts apps/wbs/be-01/src/services.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-queue.db.test.ts --timeout=10000

Before the final missing-owner negative was added, it passed 197/197, 19,586
assertions (`/tmp/shared-people-6jd-dequeue-final-nine.log`). The final-byte
rerun is recorded below. Direct touched-path ESLint
and forced BE/store tsc exited 0 (`...dequeue-final-{lint,type}.log`); direct
ESLint warned that the absent cached Nx graph skipped its boundary rule.
Declared Nx `wbs-be-01:lint`, `wbs-store-sqlite:lint`,
`wbs-be-01:typecheck` (plus module dependency), and
`wbs-store-sqlite:typecheck` all had successful target summaries
(`...dequeue-nx-{be-lint,store-lint,be-type,store-type}.log`). Declared
`wbs-be-01:build` plus solver-supervisor-protocol dependency succeeded,
bundling 1,376 modules and running the copy/OpenAPI steps
(`...dequeue-nx-be-build.log`). `wbs-store-sqlite:build` is **not a declared
target**; the attempted Nx invocation failed with “Cannot find configuration
for task” (`...dequeue-nx-store-build.log`), and no store build is claimed.

After the separate missing-active-owner negative was added, the literal
nine-file command above passed **198/198, 19,590 assertions** on final
source/test bytes (`/tmp/shared-people-6jd-dequeue-final-nine2.log`). Direct
touched-path ESLint and forced BE/store tsc exited 0, as did five-path
Prettier, pinned OpenSpec strict 1/1 and all 148/148, and diff check
(`/tmp/shared-people-6jd-dequeue-final2-{lint,type,format,strict,all,diff}.log`).
The declared BE lint and typecheck targets were rerun after the test addition
and each has an explicit successful Nx summary, including the module
typecheck dependency (`...dequeue-final2-nx-be-{lint,type}.log`). Store
lint/type and BE build summaries above apply to unchanged production bytes.

The independent exact-SHA review of `063c8c287` reproduced the nine-file
198/198, 19,590 run (`/tmp/shared-people-6jd-astra-063c8c2-nine.log`) and
found a bounded handoff-proof gap. The earlier held fixture kept every push and
the child unsettled, so its pending `stop()` assertion did **not** isolate
delivery tracking. The corrected installed fixture holds only B's real victim
push, returns other pushes, completes C's child and observes its exact slot
released, then checks that `stop()` remains pending on B alone. It finally
rejects B's gateway push with HTTP 400, verifies the original B seq0 row still
replays, and uses a test-only wrapper around the composed delivery dependency
to reject after gateway handling; that later rejection does not replace the
committed queue/token or shutdown outcome.

Three additional production-byte faults each reached this same installed
held/rejected case, were restored against an identical coordinator SHA-256
backup (`39b476d4cb5dab9bcff5dda3e47d852c3f4680502efc8216480233a441bdd82e`),
and passed again. Adjacent coordinator `Proof:` comments now name the installed
consequences.

| Fault                                    | Watched RED                                                                                                                                   | Restored GREEN                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Omit in-flight delivery registration     | `/tmp/shared-people-6jd-dequeue-r5-tracking-red3.log`: after child slot release, `stopSettled` became true while B transport was held         | `/tmp/shared-people-6jd-dequeue-r5-tracking-green.log`: 1/1, 10                |
| Await B transport before dequeue handoff | `/tmp/shared-people-6jd-dequeue-r5-delivery-before-handoff-red.log`: C's committed token did not reach launcher before bounded deadline       | `/tmp/shared-people-6jd-dequeue-r5-delivery-before-handoff-green.log`: 1/1, 10 |
| Rethrow postcommit delivery rejection    | `/tmp/shared-people-6jd-dequeue-r5-rejection-replaces-red2.log`: injected rejection replaced successful stop settlement after durable B event | `/tmp/shared-people-6jd-dequeue-r5-rejection-replaces-green.log`: 1/1, 10      |

The first tracking omission trial (`...dequeue-r5-tracking-red.log`) stayed
GREEN because the fixture still held unrelated child work; an intermediate
private-task assertion (`...dequeue-r5-tracking-red2.log`) failed at a
different in-flight count. Neither is counted as the required stop proof.
The final test waits for C's slot release and lets the child work finish while
only B delivery is held; the accepted RED above fails at `stopSettled` itself.

After this proof correction and test-only JSON-body validation, the literal
nine-file command above passed **198/198, 19,591 assertions** on final bytes
(`/tmp/shared-people-6jd-dequeue-followup-final-nine.log`). The first direct
lint run found only the test-only `String(request?.body)` style diagnostic
(`...dequeue-followup-lint.log`); after checking that the actual push body is
JSON text, the narrowed type check passed direct ESLint
(`...dequeue-followup-lint2.log`). Declared final-byte BE lint, typecheck plus
module dependency, and build plus supervisor-protocol dependency each had an
explicit successful Nx summary
(`...dequeue-followup-nx-be-{lint,type,build}.log`). The store product bytes
and store tests were unchanged from the preceding successful store targets.

### 6j.e installed reconciliation checkpoint (local, not integrated)

The source-bound reconciler is installed only in `buildServices` and retains
`{ reclaimed, finished, waiting }`. It enumerates draining generations, then
delete-pending projects. Each target rechecks its marker under a distinct
borrowed UoW, captures the old state, runs raw scoped reclaim/finalization,
captures again, and records actual-cause recipient events before commit. It
delivers each sweep's envelopes after writer release and before the next sweep.
This checkpoint does not close 6j.e or 6j.f.

The exact affected command
`bun test apps/wbs/be-01/src/services.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-drain.db.test.ts --timeout=30000`
passed **225/225, 1,218 assertions, exit 0**
(`/tmp/shared-people-6je-four-file.log`). Installed startup and periodic tests
each delete populated A and record B seq0. Selected ready A retirement at an
unchanged input hash retains A and records B's addressed A cause. Selected
retirement followed by project deletion records B seq0 and seq1 in separate
sweeps. Future-deadline C stays counted and D silent while expired A deletes.
A later C event-insert failure preserves C's populated graph while earlier A
deletion/B event remains committed; retry finishes C to D seq0 without
duplicating B. The first partial-pass run
(`/tmp/shared-people-6je-partial-first.log`) incorrectly expected C's earlier
committed generation-slot reclamation to roll back with its later project
sweep; the corrected run passed 1/1, 13
(`/tmp/shared-people-6je-partial-second.log`).

| Watched production fault          | RED                                                                                  | Restored GREEN                                           |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Omit installed owner              | A deletes without B event: `/tmp/shared-people-6je-binding-red.log`                  | `/tmp/shared-people-6je-binding-green.log` 1/4           |
| Omit startup trigger              | A remains pending: `/tmp/shared-people-6je-startup-omission-red.log`                 | `/tmp/shared-people-6je-startup-omission-green.log` 1/4  |
| Omit periodic trigger             | A remains pending: `/tmp/shared-people-6je-periodic-omission-red.log`                | `/tmp/shared-people-6je-periodic-omission-green.log` 1/4 |
| Bypass persisted deadline         | Future C deletes: `/tmp/shared-people-6je-deadline-omission-red.log`                 | `/tmp/shared-people-6je-deadline-omission-green.log` 1/8 |
| Bypass in-writer marker recheck   | Stale C slot reclaims: `/tmp/shared-people-6je-stale-guard-red.log`                  | `/tmp/shared-people-6je-stale-guard-green.log` 1/9       |
| Reverse generation/project phases | Missing B seq1: `/tmp/shared-people-6je-order-swap-red.log`                          | `/tmp/shared-people-6je-order-swap-green.log` 1/5        |
| Omit old capture                  | A deletes without B event: `/tmp/shared-people-6je-capture-omission-red.log`         | `/tmp/shared-people-6je-capture-omission-green.log` 1/4  |
| Omit recording                    | A deletes without B event: `/tmp/shared-people-6je-record-omission-red.log`          | `/tmp/shared-people-6je-record-omission-green.log` 1/4   |
| Omit actual finished cause        | Selected A remains, B event absent: `/tmp/shared-people-6je-cause-omission-red.log`  | `/tmp/shared-people-6je-cause-omission-green.log` 1/6    |
| Omit capture-capability guard     | Named refusal becomes TypeError: `/tmp/shared-people-6je-capability-guard-red.log`   | `/tmp/shared-people-6je-capability-guard-green.log` 1/4  |
| Omit coalescing guard             | Four sweeps instead of three: `/tmp/shared-people-6je-coalescing-red.log`            | `/tmp/shared-people-6je-coalescing-green.log` 1/7        |
| Omit delivery await               | Stop settles during held B push: `/tmp/shared-people-6je-delivery-await-red4.log`    | `/tmp/shared-people-6je-delivery-await-green.log` 1/9    |
| Omit stop drain await             | Stop settles during held capture: `/tmp/shared-people-6je-held-capture-stop-red.log` | `/tmp/shared-people-6je-held-capture-stop-green.log` 1/6 |

The held-capture test also proves a second source-gate turn cannot enter
before the sweep releases its writer (`...6je-held-capture-gate.log`, 1/8).
The held-delivery test proves a second SQLite connection can update B after
A's commit and before B's push settles. An after-capture fault restores the
complete lifecycle table snapshot and delivers nothing; retry produces one B
seq0 (`...6je-after-capture-second.log`, 1/8). Its first trial asserted an
incorrect total capture count across other real sweeps and is disqualified.
The first held-delivery await-removal trials (`...6je-delivery-await-red.log`
through `...red3.log`) were non-breaking because unrelated edit debounce kept
stop pending; the accepted test isolates that debounce before fault injection.

The first direct BE lint found four test-only fixture diagnostics
(`/tmp/shared-people-6je-be-lint.log`), corrected without product behavior
changes. Final changed-file ESLint passed
(`/tmp/shared-people-6je-changed-lint.log`), but direct ESLint skipped the Nx
boundary rule for lack of a cached ProjectGraph. Declared Nx summaries pass:
BE/store lint, BE typecheck plus module dependency, store typecheck, and BE
build plus supervisor-protocol dependency
(`/tmp/shared-people-6je-nx-{be,store}-{lint,type}.log`,
`/tmp/shared-people-6je-nx-be-build.log`). Store has no declared build target.
Six-path Prettier check passed (`/tmp/shared-people-6je-format-final.log`);
pinned OpenSpec 1.12.0 strict passed 1/1 and all passed 148/148
(`/tmp/shared-people-6je-final-{strict,all}.json`); `git diff --check` exited 0
(`/tmp/shared-people-6je-final-diff.log`). An initial unpinned
`bunx openspec` attempt failed because that package does not expose the
required CLI; that attempt is superseded by the pinned rerun;
only the pinned validator results above are accepted.

Independent review of clean `6d65c00f` reproduced the four-file 225/225,
1,218 assertion run (`/tmp/shared-people-6je-astra-6d65c00f-four.log`) and
found two bounded gaps. First, enumeration of generation and project targets
read the shared SQLite connection outside the source gate, so a held writer's
temporary marker clear could be mistaken for a committed absence. The owner
now takes a short, separate gated read turn for each phase and releases that
turn before any per-target UoW. A project-only pending fixture proves the
second gate independently from the generation gate. The first broad held-writer
RED (`/tmp/shared-people-6je-enumeration-red.log`) settled early; its initial
GREEN (`...6je-enumeration-green.log`) was strengthened to generation-only
selected retirement so the later project gate could not mask a missing first
gate. Omitting the generation gate then left A's generation present after the
writer rolled back (`/tmp/shared-people-6je-generation-gate-red2.log`), while
restoration passed 1/5 (`...generation-gate-green.log`). Independently
omitting the project gate settled the project-only pass while its marker was
temporarily clear (`...project-gate-red.log`); restoration passed 1/4
(`...project-gate-green.log`). The first generation-gate fault trial
(`...generation-gate-red.log`) remained GREEN because its project gate still
waited and recovered A; it is disqualified.

Second, the later-C event-failure fixture originally compared only three C
tables. A borrowed capture callback now snapshots **every** `lifecycleTables`
row immediately before C's project sweep, after earlier A and C-generation
sweeps have committed. The named second-event INSERT fault leaves that full
snapshot identical, including estimates, assignments, access, cache, queue,
audit, event rows and sequencers; A/B remain committed and retry emits only D
seq0 (`/tmp/shared-people-6je-full-snapshot-first.log`, 1/13). A watched
C-only COMMIT/BEGIN between raw cleanup and event recording then failed at
the full snapshot with C project, work item, step, estimate and assignment
rows missing (`...6je-project-split-red.log`), not at an incidental transaction
error. Restoring the single owner transaction passed 1/13
(`...6je-project-split-green.log`).

After those corrections, the same literal four-file command above passed
**227/227, 1,227 assertions**, exit 0
(`/tmp/shared-people-6je-followup-four-file.log`). Declared final-byte Nx
summaries passed BE/store lint and typecheck, BE module typecheck dependency,
and BE build with supervisor-protocol dependency
(`/tmp/shared-people-6je-followup-nx-{be,store}-{lint,type}.log`,
`/tmp/shared-people-6je-followup-nx-be-build.log`). Store still declares no
build target. At that local 6j.e checkpoint, exact-SHA review and 6j.f were
pending; activation and the host gate were not claimed.

### 6j.f installed boundary closure audit (independently reviewed)

This audit started from reviewed `77d43e707c2c383d8f1e9ef5bea11730a7b353a4`. The real
`buildServices` graph installs the import authority/capture binding and five optimizer owners
together: direct lifecycle/release, initial reservation, Retry reservation, whole-loop FIFO
dequeue and per-sweep reconciliation. The table reconciles each required behavior to its
installed caller, writer, assertion, accepted watched fault, reviewed checkpoint and current
regression. Historical slice sections above retain the complete fault lists and separate
disqualified attempts; a disqualified fault is not counted here.

| Requirement                                     | Installed caller → writer                                                                                   | Observed assertion                                                                                              | Accepted RED → restored GREEN                                                                                                                                                                            | Reviewed SHA                           | Current regression                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| 6j.a scoped import authority/capture            | Mounted import → borrowed import UoW                                                                        | Tied A displaces B/C; removed member refuses before capture; event failure restores graph                       | `/tmp/shared-people-6ja-r5-owner-omission-red.log` → `/tmp/shared-people-6ja-r5-owner-restored-green.log`                                                                                                | `b0add7304`                            | import/command eleven-file group             |
| 6j.b coherent live read/captured command        | `observeForAdmission` → source gate; commands use borrowed captured scheduler                               | G1 pair and requests stay coherent; arrange/freeze does not enter live gate                                     | `/tmp/shared-people-6jb-split-pair-identity-omission-red.log` → `/tmp/shared-people-6jb-split-pair-identity-restored-green.log`                                                                          | `41443a3e7`                            | optimizer/store/command groups               |
| 6j.c direct finish and populated cleanup        | `optimizationLifecycle` → borrowed finish UoW                                                               | Old cause, selected retirement, local dependency closure, retained bystander/audit and rollback                 | `/tmp/shared-people-6jc-r5-outside-owner-red.log` → `/tmp/shared-people-6jc-r5-outside-owner-restored-green.log`; initial FK RED is separately recorded above                                            | `54773e1ce`                            | optimizer/store groups                       |
| 6j.d exact-token release/callers                | Composed release → lifecycle UoW; terminal/cancel/queued/preflight await it                                 | Last-slot B←A; stale token silent; event failure restores slot/graph                                            | `/tmp/shared-people-6jd-r5-omit-release-owner-red.log` → `/tmp/shared-people-6jd-r5-omit-release-owner-restored-green.log`                                                                               | `816627139`, `2d4ae4341`               | optimizer/store groups                       |
| 6j.d initial reclaim, including closed result   | `readPlan` → initial UoW, raw reserve once, envelope handoff                                                | Y/Z causes; future slot retained; closed victim push; second event rolls back all state                         | `/tmp/shared-people-6jd-initial-capture-org-omission-red.log` → `/tmp/shared-people-6jd-initial-capture-org-restored-green.log`                                                                          | `1d4634267` after consumer `3942979e0` | optimizer/store groups                       |
| 6j.d Retry reclaim, including queue/nonaccepted | Retry preflight → one borrowed audit/reserve/queue/event UoW                                                | Early refusal capture-free; adjusted cutoff; one accepted audit; closed push; queued rollback                   | `/tmp/shared-people-6jd-retry-r5-queued-split-red.log` → `/tmp/shared-people-6jd-retry-r5-queued-split-green.log`                                                                                        | `f20666ca2`                            | optimizer/store groups                       |
| 6j.d FIFO reclaim, including empty/capacity     | Installed queue pump → one UoW around entire raw loop                                                       | Later-head cutoff; exact token; actual cause; nonreserved push; full-loop rollback                              | `/tmp/shared-people-6jd-dequeue-r5-split-red.log` → `/tmp/shared-people-6jd-dequeue-r5-split-green.log`                                                                                                  | `f7cf3f03c`                            | optimizer/store groups                       |
| 6j.e startup/periodic sweeps                    | Startup/timer → separate gated enumeration and target UoWs                                                  | Generation before project; deadline/recheck; earlier A/B commit survives failed C; stop awaits capture/delivery | `/tmp/shared-people-6je-project-split-red.log` → `/tmp/shared-people-6je-project-split-green.log`                                                                                                        | `77d43e707`                            | optimizer/store groups                       |
| 6j.f release/space boundary                     | Capability CLI and pre-write restore; composed space DELETE → `SpaceRepository.removeProject` immediate UoW | Isolated-only, shared restore refused before write; only membership removed, graph/event/sequence/push retained | `/tmp/shared-people-6jf-physical-shared-advertised-red.log`, `/tmp/shared-people-6jf-restore-guard-bypass-red.log`, `/tmp/shared-people-6jf-space-project-delete-red.log` → matching restored GREEN logs | `025aa239f`                            | physical/restore cases; import/command group |

The 6j.d initial/Retry/FIFO owner tests each include actual victim causes and accepted, nonreserved
and failed transaction outcomes; their slice tables above identify independent binding, capture,
record, deadline and delivery faults. Direct release and retirement tests include complete
populated graph rollback and replay; the import tests cover scoped role/membership/capability,
raw borrowed graph and second-event rollback. The composed space test snapshots project, step,
work item and estimate rows, `event_log`, `event_sequencer` and gateway push count. Membership
DELETE removes only `space_project` and advances revision. A temporary store mutation replacing
membership DELETE with project DELETE returned HTTP 500 at the populated project's FK boundary
instead of 204; restored source hash `dacdaabfd96b2e5a67fb488e9c0528ea3e14535bb85880564ef3efd7819f76df`
passed the strengthened test (1/1, 11 assertions) with a real estimate row
(`/tmp/shared-people-6jf-space-populated-project-delete-red.log` →
`/tmp/shared-people-6jf-space-populated-project-delete-restored-green.log`). This mutation proves the route cannot substitute
project deletion; the successful route's graph/zero-push assertions guard its intended result.

Physical release mutations on current source were also independent: adding `shared` to
`SUPPORTED_CAPACITY_MODES` changed the real CLI output to `['isolated','shared']`; bypassing
restore's supported-mode check reached its injected first-write trigger instead of the expected
pre-write refusal. Both sources were restored and their exact single-case commands passed.

The exact current four cross-layer commands were:

```sh
bun test apps/wbs/be-01/src/services.db.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts apps/wbs/be-01/src/service/solver-child-lifecycle.db.test.ts apps/wbs/be-01/src/module/optimization/module.test.ts apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.test.ts --timeout=30000
bun test libs/wbs/adapters/store-sqlite/src/optimization-drain.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-admission-global.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-admission.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-queue.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-generation.db.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts libs/wbs/adapters/store-sqlite/src/captured-optimization-reader.db.test.ts libs/wbs/adapters/store-sqlite/src/shared-people-rollback.db.test.ts libs/wbs/adapters/store-sqlite/src/space.db.test.ts libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts --timeout=30000
bun test apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-command.controller.db.test.ts apps/wbs/be-01/src/controller/directory-command-organization.controller.db.test.ts apps/wbs/be-01/src/controller/space-organization.controller.db.test.ts apps/wbs/be-01/src/service/plan-commands.db.test.ts libs/wbs/adapters/store-memory/src/import.service.test.ts libs/wbs/application/core/src/module/plan-import/module.test.ts libs/wbs/application/core/src/service/shared-people-fanout.test.ts libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts libs/wbs/application/core/src/module/plan-commands/working-plan-directory.test.ts libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts --timeout=30000
bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts apps/wbs/be-01/src/capacity-modes-cli.test.ts libs/wbs/adapters/store-sqlite/src/optimized-cache.db.test.ts libs/wbs/adapters/store-sqlite/src/optimized-outcome.db.test.ts libs/wbs/adapters/store-sqlite/src/optimized-schedule-cache.db.test.ts libs/wbs/application/core/src/service/shared-people.test.ts libs/wbs/domain/domain/src/schedule-elsewhere.test.ts libs/wbs/domain/contracts/solver/src/elsewhere-wire.test.ts --timeout=30000
```

All exited 0: **215/215, 19,678 assertions** (`/tmp/shared-people-6jf-installed-optimizer-ten.log`),
**186/186, 724 assertions** (`/tmp/shared-people-6jf-store-ten.log`), **219/219, 958
assertions** (`/tmp/shared-people-6jf-import-command-eleven-final.log`), and **199/199, 16,012
assertions** (`/tmp/shared-people-6jf-6af-regression-eight.log`). Physical CLI and shared
restore single cases each passed before mutation and after restoration; the formatted space
single case passed 1/1, 11 assertions
(`/tmp/shared-people-6jf-space-populated-project-delete-restored-green.log`).

The sandboxed child-process two-file command had one configured orphan skip because
`WBS_SOLVER_ORPHAN_IMAGE` is unset and one spawn-handshake marker timeout
(`/tmp/shared-people-6jf-child-proc-two.log`, exit 1). The exact spawn-handshake single-file
command, run locally outside that sandbox, passed 1/1, 13 assertions, exit 0
(`/tmp/shared-people-6jf-spawn-handshake-unsandboxed.log`). Orphan-image behavior is unverified.
The release-boundary and process commands were:

```sh
bun test apps/wbs/be-01/src/capacity-modes-cli.test.ts
bun test libs/wbs/adapters/store-sqlite/src/shared-people-rollback.db.test.ts --test-name-pattern 'rejects shared restoration before the first write'
bun test apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts apps/wbs/be-01/src/service/optimization-orphan.proc.db.test.ts --timeout=30000
bun test apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts --timeout=30000
```

The first local frozen Bun install was unavailable because restricted DNS and cache misses
prevented fetching locked tarballs; dependencies were reused by symlinking `node_modules` from
the clean exact-base 6j.e worktree, with the same lockfile. No package metadata changed.

Disqualified historical faults remain explicitly excluded in their sections above, including
6j.b short-window observation/reconcile awaits, 6j.c redundant dependency DELETE/absent cause,
6j.d startup-masked FIFO rollback and 6j.e first enumeration-gate trial. The matrix cites only
accepted faults. Astra independently reviewed exact clean `025aa239ffaffd755a55c2a357e56c5a4704d68c`
and ran the three boundary files: 37/37 tests, 174 assertions, exit 0
(`/tmp/shared-people-6jf-astra-025aa239-boundaries.log`). Its review cleared the
6j.a–f local implementation and evidence; those six task checkboxes are now complete.
The 6j parent, 6.1/6.2 umbrella, 6k and 6l remain open. Trusted activation is deferred;
full cold replay/retention/authorization (6l), canonical host gate and CI are not claimed.

Declared task validation on the closure bytes: the first `wbs-be-01:lint` run failed two
test-only findings, an unnecessary `async` callback and unsafe stringification of the push
request (`/tmp/shared-people-6jf-nx-be-lint.log`, exact diagnostics in
`/tmp/shared-people-6jf-direct-space-lint.log`). The sink now counts calls and returns an
explicit Promise; direct file ESLint and its focused SQLite test passed
(`/tmp/shared-people-6jf-direct-space-lint-restored.log`,
`/tmp/shared-people-6jf-space-populated-project-delete-restored-green.log`).
The no-cache declared commands were:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-be-01 wbs-core wbs-store-sqlite wbs-store-memory --skip-nx-cache --output-style=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:build:portable --skip-nx-cache --output-style=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p wbs-be-01 --skip-nx-cache --output-style=static
```

Each exited 0 with an explicit Nx success summary: four projects plus two typecheck
dependencies (`/tmp/shared-people-6jf-nx-four-lint-type.log`), core portable build
(`/tmp/shared-people-6jf-nx-core-portable-build.log`), and final fixture-byte backend
lint/typecheck/build plus two dependencies (`/tmp/shared-people-6jf-nx-be-final.log`).
Store-sqlite and store-memory declare no build target. Final two-path Prettier check and
`git diff --check` exited 0 (`/tmp/shared-people-6jf-format-check.log`,
`/tmp/shared-people-6jf-diff-check.log`). Pinned OpenSpec 1.12.0 strict change validation
passed 1/1 and all-change validation passed 148/148
(`/tmp/shared-people-6jf-final-openspec-{strict,all}.json`). These are local checks; this
closure has not run the canonical host gate or CI.

## 6k architecture amendment — planning evidence only

The [6k packet](6k-architecture.md) was traced against clean source
`a8c6c641584001407f5277b8cada6748263300fe` in an isolated
`plan/shared-people-fanout-6k-architecture` worktree. It resolves the async source UoW around
synchronous outcome/event and admission-observation savepoints, committed decision/envelope
handoff, complete generation/cache replacement/eviction inventory, and the distinction between
optimization-status labels and modeled scheduling availability. The existing `CONTEXT.md` terms
and 6j transaction decisions are preserved; no glossary entry, ADR or production edit was needed.

Tasks 6k and 6k.a–e remain unchecked. The matrix below is a register of required future proofs,
not RED/GREEN evidence. The packet contains each named witness, injected fault and expected
assertion. No proposed fault has been run as part of this docs-only amendment.

| Required proof rows                                                                                                                | Planned owner/slice                                   | Observed result for 6k                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| K1/K2: installed selected publication and H1/nonselected silence                                                                   | 6k.b outcome owner                                    | Unverified; implementation not started here                                                       |
| K3: selected replacement/eviction, Fast and addressed-cause negatives                                                              | 6k.c complete cache mutation                          | Unverified                                                                                        |
| K4: mounted empty-booking availability at unchanged canonical/admission H, plus separate equal-captured-hash comparator regression | 6k.b borrowed projection and existing pure comparator | Unverified; unconditional mounted suppression and conditional pure regression are distinct proofs |
| K5–K8: borrowed capture, atomic rollback, after-capture failure and no-op/legacy/isolated silence                                  | 6k.b outcome owner                                    | Unverified                                                                                        |
| K9/K10/K13: decision independence, tracking/error reporting, exact delivery and recipient reaction                                 | 6k.a consumer, then 6k.b installed owner              | Unverified; consumer-only evidence cannot close the installed obligation                          |
| K11: generation/cache eviction with original observation identity                                                                  | 6k.d observation owner                                | Unverified                                                                                        |
| K12: admission status-only silence and retirement inventory                                                                        | 6k.e closure                                          | Unverified; existing 6j proofs are regressions, not proof of new 6k binding                       |

For implementation acceptance, append exact test commands/counts, accepted fault/restoration
logs and adjacent production `Proof:` locations for each changed dependency. Keep disqualified
trials explicit. Do not infer a mounted proof from mocked envelopes or pure comparison. A
calendar-availability fixture that cannot pass existing admitted-result validation requires
design review, not a new availability state or removal of the required test.

Planning validation commands (run from this isolated worktree):

```sh
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate share-people-across-projects --strict --json
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json
bunx prettier --check openspec/changes/share-people-across-projects/6k-architecture.md openspec/changes/share-people-across-projects/design.md openspec/changes/share-people-across-projects/tasks.md openspec/changes/share-people-across-projects/specs/shared-people-mode/spec.md openspec/changes/share-people-across-projects/verify.md
git diff --check
```

Initial pinned strict validation passed 1/1 and all validation passed 149/149, exit 0
(`/tmp/shared-people-6k-strict.json`, `/tmp/shared-people-6k-all.json`), before this ledger append.
The all count reflects this integrated base; historical 148/148 evidence above is unchanged.
Final five-path Prettier and diff checks passed, exit 0
(`/tmp/shared-people-6k-final-format.log`, `/tmp/shared-people-6k-final-diff.log`); pinned strict
passed 1/1 and all passed 149/149, exit 0
(`/tmp/shared-people-6k-final-strict.json`, `/tmp/shared-people-6k-final-all.json`). The same
commands were repeated after this evidence text was added. Dependencies for these docs tools
reuse the base worktree's `node_modules`; this is not a fresh frozen-install claim. No runtime
suite, Nx product lint/typecheck/build, canonical host gate, CI, publication, 6l closure,
UI/mode work or trusted activation was performed by this amendment.

### 6k K4 proof-plan correction

Independent review of `de054d5ef15fd2c857df8ebec1e2d6960f605c1c` identified a P2 proof-plan
mismatch: the proposed calendar-range mounted witness preserves canonical/admission Input hash
H, but `readFanoutObservationIn` changes its nullable captured hash from H to null. A conditional
fault that suppresses availability only for equal captured hashes would not break that witness.
The packet now requires unconditional suppression of availability comparison for the mounted
empty-booking `available` → `calendar_range` witness; the required downstream event must disappear.
The existing equal-captured-hash conditional fault remains a separate pure comparator regression
(`shared-people-fanout.test.ts::equal hashes retain availability transitions with no bookings`).
Neither proof is attributed to the other. This correction changes no production shape, domain
term, task completion status or implementation evidence; both future proof obligations remain open.

Correction validation: the same pinned strict/all commands above passed 1/1 and 149/149,
respectively; Prettier on the two changed Markdown files and `git diff --check` passed, all
exit 0 (`/tmp/shared-people-6k-k4-{strict,all}.json`,
`/tmp/shared-people-6k-k4-{format,diff}.log`). These commands were repeated after this ledger
entry. No runtime mutation/test or gate was run for the proof-plan correction.

### 6k revalidation after the 6j merge

PR #282 merged at `ae7c1ff110731277e776ea3de45cd980614b2d67`. Comparing that tree with the
packet's original source `a8c6c641584001407f5277b8cada6748263300fe` found changes only in
`docs/code-organization/kinds.json` and `tools/tool-devsync/src/service-kinds.test.ts`: the five
6j optimizer owners are classified as features, and the policy's existing negative-proof
comment records their omission failure. WBS source, contracts, tests and this change's prior
specification are identical across those source revisions. No transaction/caller redesign
is required.

The two reviewed docs commits ending at `5f30a49fa0afcf1d296e10d1f0ed22ec4ce0e345` were rebased
onto that exact merged main without conflicts. The packet now names the merged checkpoint and
requires any new owner file to follow the merged service-kind policy. Its K4 correction and
6k.a–e ordering are preserved. All 6k implementation/proof obligations remain unchecked;
6l, UI, mode routes and trusted activation remain deferred.

Revalidation commands: the five-path Prettier check and pinned OpenSpec commands listed above
passed again (strict 1/1; all 149/149), each with exit 0, as did `git diff --check`.
`git range-diff a8c6c641584001407f5277b8cada6748263300fe..5f30a49fa0afcf1d296e10d1f0ed22ec4ce0e345 ae7c1ff110731277e776ea3de45cd980614b2d67..HEAD`
reported both rebased planning commits patch-equivalent before this revalidation amendment.
The formatting, strict/all and diff checks were repeated after this evidence text was added.

This is source and documentation revalidation only. No implementation, runtime mutation/test,
Nx product check, canonical host gate, CI, push or merge was performed for this update.

### 6k.a committed outcome handoff (consumer checkpoint)

Implemented from clean source `6b08217e53dc0d79d0457e7d1c7020c0f005e248` in
`feat/shared-people-fanout-6ka`. `recordOutcome` now returns the typed durable decision and
downstream envelopes; the direct adapter returns an empty downstream list for stored,
already-recorded and superseded decisions. The coordinator hands the stored outcome envelope
first, followed by downstream records, to the existing tracked `deliverCommitted` boundary
after commit. The obsolete optimizer-specific `pushRecorded` port and DI wiring were removed.
The new coordinator witness injects one separately recorded downstream row at the repository
port: it proves the consumer, **not** the 6k.b installed transactional producer. The composed
delivery test uses the real in-memory event log and broadcaster to prove reaction before held
outcome transport and unchanged original sequences. Two optimizer objectives explain the two
reported errors in the synchronous-throw test.

First TDD RED: `bun test apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
--test-name-pattern 'hands off the stored outcome before downstream'` failed 0/1 because the
combined batch was absent (`/tmp/shared-people-6ka-first-red.log`); the same test passed 1/1
after the port/adapter/coordinator change (`/tmp/shared-people-6ka-first-green.log`).
No-op adapter assertions cover empty downstream arrays for both already-recorded and
superseded. The held/rejected consumer test checks exact-slot release, pending stop while only
transport holds, one ordered outcome/downstream batch, three distinct original sequences,
three durable event rows and one reported rejection. The synchronous-throw case checks the
plan-read decision, durable rows and released slots.

| Watched production fault                              | Required failure                                       | RED log                                                  | Restored GREEN                                   |
| ----------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| Await delivery before returning the committed outcome | Exact slot remains while transport holds               | `/tmp/shared-people-6ka-await-before-handoff-red.log`    | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Drop downstream envelopes                             | Recipient absent from delivered batch                  | `/tmp/shared-people-6ka-drop-downstream-red.log`         | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Omit in-flight tracking                               | Stop settles during held transport                     | `/tmp/shared-people-6ka-omit-tracking-red.log`           | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Omit delivery error reporting                         | Reported errors 0 instead of 1                         | `/tmp/shared-people-6ka-omit-error-report-red.log`       | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Rethrow delivery rejection                            | Held rejection fails the committed lifecycle test      | `/tmp/shared-people-6ka-rethrow-delivery-red.log`        | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Invoke synchronous transport before deferred tracking | Throw replaces the committed read decision             | `/tmp/shared-people-6ka-sync-invocation-red.log`         | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Omit recipient reaction                               | Recipient callback list empty before held outcome push | `/tmp/shared-people-6ka-omit-recipient-reaction-red.log` | `/tmp/shared-people-6ka-focused-unsandboxed.log` |
| Republish instead of pushing recorded rows            | First push advances original sequence 0 to 1           | `/tmp/shared-people-6ka-republish-red.log`               | `/tmp/shared-people-6ka-focused-unsandboxed.log` |

Final nine-file regression command: `bun test apps/wbs/be-01/src/module/optimization/module.test.ts
apps/wbs/be-01/src/repository/optimization.db.test.ts
apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts
apps/wbs/be-01/src/service/optimization-events.db.test.ts
apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts
apps/wbs/be-01/src/service/optimization-restart.db.test.ts
apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts
libs/wbs/application/core/src/compose.test.ts`: 139/139 passed, 19,124 assertions, exit 0
(`/tmp/shared-people-6ka-focused-unsandboxed.log`). The same sandboxed batch reported
138 pass/1 fail because the real child process's stdin pipe returned `EPERM`; diagnostic
`/tmp/shared-people-6ka-spawn-diagnostic.log` showed that boundary, and the exact process
test passed outside the sandbox 1/1, 13 assertions
(`/tmp/shared-people-6ka-spawn-escalated.log`).

`NX_DAEMON=false NX_SOCKET_DIR=/tmp/shared-people-6ka-nx bunx nx run wbs-be-01:lint
--skip-nx-cache` passed (`/tmp/shared-people-6ka-nx-lint.log`). The corresponding
`wbs-be-01:typecheck` (including `typecheck:module`) and `wbs-be-01:build` targets passed
(`/tmp/shared-people-6ka-nx-{typecheck,build}.log`). `git diff --name-only -z | xargs -0 bunx
prettier --check` passed all changed paths (`/tmp/shared-people-6ka-prettier-check.log`), and
`git diff --check` exited 0 (`/tmp/shared-people-6ka-diff-check.log`). Pinned OpenSpec 1.12.0
strict validation passed 1/1 and `--all` passed 149/149
(`/tmp/shared-people-6ka-openspec-{strict,all}.json`). The canonical host gate, CI, independent
exact-SHA review, installed 6k.b owner and trusted activation remain open; no push or merge
was performed.

After this ledger append, the final documentation bytes passed pinned strict OpenSpec 1/1,
all OpenSpec 149/149, changed-path Prettier and `git diff --check`; outputs are
`/tmp/shared-people-6ka-final-{strict,all}.json` and
`/tmp/shared-people-6ka-final-{format,diff}.log`.

### 6k.b installed outcome owner (local candidate)

The installed `buildServices` override now runs the existing synchronous
`storeOptimizedOutcomeAndRecord` savepoint within the source's borrowed
`BEGIN IMMEDIATE` owner. It captures the scoped organization's old display,
stores the admitted outcome, captures the staged display, records only the
addressed project cause, and returns the decision plus downstream envelopes
after commit for 6k.a's tracked delivery. The direct repository continues to
return empty downstream envelopes. This slice does not implement 6k.c–e.

The first mounted selected-outcome test failed with `stored` but no B row
(`/tmp/shared-people-6kb-first-red.log`, 0/1), then passed with the installed
owner (`/tmp/shared-people-6kb-first-green.log`, 1/3). The current two-file
command was exactly:

```sh
bun test apps/wbs/be-01/src/services.db.test.ts apps/wbs/be-01/src/repository/optimization.db.test.ts
```

It passed 123/123, 759 assertions, exit 0
(`/tmp/shared-people-6kb-final-two-file.log`). Mounted cases establish selected
B/C fan-out and no duplicate after repeated write; eligible H1 under current
H2, nonselected PRI under TIME, stale token, isolated and legacy silence;
malformed active ownership refusal; full cache/slot/event/sequencer rollback
after a real second-recipient insert and a thrown borrowed after-capture;
committed B seq0 and second-writer progress while B transport is held; and
replay equality after HTTP 400. The held case compares the persisted A slot's
attempt token to the original write claim, lets the recipient reaction settle,
then proves `stop` remains pending solely for held B delivery.

K4 uses real SQLite input, solver request/evaluation, admitted slot, borrowed
captured schedules and installed outcome write. A retains the canonical
input hash while its selected display changes from `available` to
`calendar_range`; both booking lists are empty and B receives seq0.
The test passed 1/7 (`/tmp/shared-people-6kb-k4-capture-green.log`).
Forcing the production comparator's `availabilityChanged` to false made that
same installed B-row assertion receive `[]`; restored code passed 1/7
(`/tmp/shared-people-6kb-k4-availability-{omission-red,restored-green}.log`).
The first K4 trial read an unavailable optimization input after storing and
was a test-fixture error, not a product negative
(`/tmp/shared-people-6kb-k4-trial.log`).

Accepted independent R5 faults and same-assertion restorations:

| Boundary                       | Injected fault and observed failure                                                                                                                                                            | RED / restored GREEN logs                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| K1 installer, recording, cause | Omit the installed override, transactional recording, or addressed cause separately; B's expected durable row is missing each time.                                                            | `/tmp/shared-people-6kb-{installer,record,cause}-omission-red.log` and matching `-restored-green.log`                                        |
| K2 no invention                | Force outgoing fan-out on every stored insertion; the nonselected outcome gains an unexpected B event.                                                                                         | `/tmp/shared-people-6kb-force-event-on-insert-{red,restored-green}.log`                                                                      |
| K4 availability                | Suppress the modeled availability difference; mounted B event disappears despite unchanged H and empty bookings.                                                                               | `/tmp/shared-people-6kb-k4-availability-{omission-red,restored-green}.log`                                                                   |
| K5 borrowed capture            | Read the staged capture from a separate read-only connection; A stores, but B's required event is absent.                                                                                      | `/tmp/shared-people-6kb-detached-capture-{red,restored-green}.log`                                                                           |
| K5 source turn                 | Bypass `sqliteUnitOfWork`'s gate; the installed write settles before the held writer releases.                                                                                                 | `/tmp/shared-people-6kb-serialization-{omission-red,restored-green}.log`                                                                     |
| K6 one commit                  | Split `COMMIT`/`BEGIN` after raw outcome mutation; the second real event-insert failure leaves committed cache/outcome/event/seq residue, failing full `lifecycleTables` equality.             | `/tmp/shared-people-6kb-split-commit-{red,restored-green}.log`                                                                               |
| K7 post-write capture          | Reuse old capture; selected B event vanishes. The independent thrown after-capture case restores the full snapshot and sends nothing.                                                          | `/tmp/shared-people-6kb-after-capture-{omission-red,restored-green}.log`, `/tmp/shared-people-6kb-postcapture-green.log`                     |
| K8 no-op and capability        | Bypass stored-only guard; already-recorded capture count rises from three to four. Omit borrowed-capability refusal; malformed access becomes a TypeError instead of the named prewrite error. | `/tmp/shared-people-6kb-noop-guard-{omission-red,restored-green}.log`, `/tmp/shared-people-6kb-capability-{omission-red,restored-green}.log` |
| K9 decision before transport   | Await real B delivery before returning `stored`; bounded acceptance times out while transport is held.                                                                                         | `/tmp/shared-people-6kb-installed-await-delivery-{red,restored-green}.log`                                                                   |
| K10 tracked stop               | Omit outcome delivery registration after unrelated recipient reaction has finished; stop settles while B transport remains held.                                                               | `/tmp/shared-people-6kb-installed-tracking-omission-red-try3.log`, `/tmp/shared-people-6kb-installed-tracking-restored-green.log`            |
| K13 downstream handoff         | Drop actual B envelope from outcome batch; bounded B-delivery registration times out while its durable row exists.                                                                             | `/tmp/shared-people-6kb-installed-envelope-drop-{red,restored-green}.log`                                                                    |

The first two K10 omission trials stayed green because another coordinator
recipient-reaction task independently held stop; they are disqualified
(`/tmp/shared-people-6kb-installed-tracking-omission-red.log` and
`-red-try2.log`). The accepted third trial waits for that task while retaining
only B transport. The first malformed-owner setup hit the immutable owner
trigger before exercising the owner; the corrected test deliberately removes
that trigger to model trusted corruption, then verifies refusal
(`/tmp/shared-people-6kb-modes-owner{,-green}.log`). Every temporary
production fault above was restored; the source/capture/UoW/coordinator
files used for K4/K5/K9/K10/K13 match their saved SHA-256 byte hashes.

Direct BE TypeScript initially found an un-narrowed absent ownership union
(`/tmp/shared-people-6kb-tsc-initial.log`); a precise `organizationId`
discriminant fixed it and direct `tsc --build --force` passed
(`/tmp/shared-people-6kb-tsc-fixed.log`). Direct ESLint initially found only
two import-order errors, then passed after inspected import autofix
(`/tmp/shared-people-6kb-be-eslint{,-fixed}.log`). The declared Nx BE lint,
typecheck (including module), and build targets have explicit success
summaries with `--skip-nx-cache`
(`/tmp/shared-people-6kb-nx-{lint,typecheck,build}.log`). An earlier Nx lint
exit 0 without a task summary is excluded (`/tmp/shared-people-6kb-be-lint.log`).
The service-kind inventory first failed because Git did not yet track the
new service file; after `git add -N` the exact test passed 17/17, 19 assertions
(`/tmp/shared-people-6kb-service-kinds{,-restored}.log`).

Pinned strict OpenSpec passed 1/1 and `--all` passed 149/149
(`/tmp/shared-people-6kb-final-doc-{strict,all}.json`). The first final
Prettier check found only this appended ledger unformatted
(`/tmp/shared-people-6kb-format-check.log`); the formatted changed-path
Prettier check and `git diff --check` both exited 0
(`/tmp/shared-people-6kb-final-doc-{format,diff}.log`).
6k.c–e, 6k parent, activation, host gate and CI remain open at this local
checkpoint.

Independent review of local candidate `8438eb7f1eeb2b0141670c997de37f93177e5890`
reopened 6k.b. Its held B-transport fixture invoked private `storeOutcome`
with a seeded slot, so it did not prove the installed child callback, exact
terminal slot release, or a held **outcome** push. URL counts and an HTTP 400
through the gateway's modeled log path also did not prove coordinator
`onChildError`, original recorded sequence/order, recipient reactions, or
republish prevention. The 6k.b checkbox is open pending mounted child-path
tests and watched K9/K10/K13 faults. The earlier owner, rollback, K4 and K5
proofs remain valid for their stated boundaries; no publication occurred.

### 6k.b installed child-path correction (review pending)

The earlier 123/759 two-file run and B-held fixture above are historical owner
evidence, not closure of installed K9/K10/K13. The corrected fixture enters
the actual `buildServices` FIFO pump with one PRI request and a solver response
accepted by `revalidateSolverResult`. The child traverses reservation, bind,
exit evaluation, installed `recordOutcome`, and exact-slot release. Only A's
`schedule_optimized` transport is held; B's durable `elsewhere_changed` row
and recipient reaction finish, the terminal A slot is absent, a second SQLite
writer progresses, and `stop` stays pending solely for the held outcome
delivery. Releasing it pushes the original A seq 0 then B seq 0 without a
new row or sequence. The reporting fixture injects synchronous throw and
rejected `deliverCommitted` at the composed coordinator callback, then checks
the logged `optimizer child failed` boundary, committed A/B rows, absent slot,
and modeled delivery counts. Its rejected promise is held until `drain` has
begun observing it; this separates rejection propagation from teardown.

The mounted tests use `bun test apps/wbs/be-01/src/services.db.test.ts
--test-name-pattern '<case name>'`. Accepted independent R5 faults below
failed the stated installed assertion and then passed again after exact-byte
source restoration:

| Boundary                  | Observed RED                                                                                                                                                     | Restored GREEN                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| K9 child handoff          | Awaiting the whole composed delivery batch before returning outcome left the terminal A slot counted: `/tmp/shared-people-6kb-child-await-handoff-red-try2.log`. | `/tmp/shared-people-6kb-child-await-handoff-restored-green.log` |
| K10 tracked stop          | Omitting `inFlight.add` let stop settle during the held A push: `/tmp/shared-people-6kb-child-tracking-omission-red.log`.                                        | `/tmp/shared-people-6kb-child-tracking-restored-green.log`      |
| K13 downstream envelope   | Dropping outcome downstream envelopes prevented B reaction: `/tmp/shared-people-6kb-child-downstream-omission-red.log`.                                          | `/tmp/shared-people-6kb-child-downstream-restored-green.log`    |
| K13 recipient reaction    | Omitting `reactToProjectEvent` kept B's edit epoch absent: `/tmp/shared-people-6kb-child-reaction-omission-red.log`.                                             | `/tmp/shared-people-6kb-child-reaction-restored-green.log`      |
| K13 original republish    | Replacing `pushRecorded` with `publish` added an A seq 1 row, violating the original seq 0 assertion: `/tmp/shared-people-6kb-child-republish-red.log`.          | `/tmp/shared-people-6kb-child-republish-restored-green.log`     |
| K10 error report          | Omitting `onChildError` left the installed child-error log absent: `/tmp/shared-people-6kb-child-report-omission-red.log`.                                       | `/tmp/shared-people-6kb-child-report-restored-green.log`        |
| K10 rejection containment | Rethrowing after `onChildError` made the held-rejection `drain` settle `rejected` instead of `fulfilled`: `/tmp/shared-people-6kb-child-rethrow-gated-red.log`.  | `/tmp/shared-people-6kb-child-rethrow-gated-restored-green.log` |

The first K9 mutation also triggered a duplicate B reaction before the slot
assertion, so its log is disqualified (`/tmp/shared-people-6kb-child-await-handoff-red.log`).
The first rethrow trial failed through a closed-DB teardown race and is also
disqualified (`/tmp/shared-people-6kb-child-rethrow-red-try2.log`). An invalid
solver response trial did not reach the installed outcome and is excluded.
The malformed-envelope guard retains its previously observed 1-versus-0
cache-row Proof beside the extracted repository helper. These tests and
ledger have not yet received independent exact-SHA review; 6k.b stays open.

After the test-only response literal was narrowed to the required wire version,
the final `bun test apps/wbs/be-01/src/services.db.test.ts
apps/wbs/be-01/src/repository/optimization.db.test.ts --timeout=30000` passed
125/125, 792 assertions (`/tmp/shared-people-6kb-followup-two-file-final.log`).
The nine-file regression command recorded in the 6k.a section passed 139/139,
19,124 assertions outside the sandbox
(`/tmp/shared-people-6kb-followup-nine-file-unsandboxed.log`). Its sandbox
run failed only the child-process marker handshake at 138/139; that process
fixture's Bun child stdin pipe is sandbox-restricted here, so the sandbox
run is unavailable evidence for that case
(`/tmp/shared-people-6kb-followup-nine-file.log`). The initial full BE lint
found three test callback return-type errors, fixed by asserting event
sequence and message separately. A subsequent BE typecheck found the fixture
wire version widened from literal 3 to `number`, fixed with `3 as const`.
Both failure logs remain
(`/tmp/shared-people-6kb-followup-nx-{lint,typecheck}.log`). The corrected
declared `wbs-be-01:{lint,typecheck,build} --skip-nx-cache` targets each have
an explicit Nx success summary
(`/tmp/shared-people-6kb-followup-nx-{lint-fixed,typecheck-fixed,build}.log`).
Pinned OpenSpec strict validation passed 1/1 and `--all` passed 149/149 on
this ledger (`/tmp/shared-people-6kb-followup-final-{strict,all}.json`).
Changed-path Prettier and `git diff --check` passed
(`/tmp/shared-people-6kb-followup-{format-check,diff-check}.log`). Normal
commit hooks remain the final local check.
