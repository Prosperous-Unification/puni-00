# verify — estimate-units

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Allocated numbers (filled at packet time)

| What                                  | Value                                   | Checked against                                                    | Date       |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ | ---------- |
| Migration stamp                       | `20261012130000_add_step_estimate_unit` | base `99f588257` / integration queue; final collision recheck open | 2026-10-12 |
| `PLAN_DOCUMENT_VERSION`               | 8                                       | base `99f588257` document 7; mounted round trip                    | 2026-10-12 |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | 6                                       | base `99f588257` canonical 5; upgrade/capture tests                | 2026-10-12 |
| `SCHEDULER_CONTRACT_VERSION`          | 16                                      | base 15; minute corpus-version lint                                | 2026-10-12 |

## Commands

| Slice | Command | Result |
| ----- | ------- | ------ |
| —     | —       | —      |

## Failure proofs

Each fault is injected into the production function, the named test run, and the file
restored; the adjacent `Proof:` comment names the fault and the observed output.

| Check | Fault injected | Test that observed it | Observed |
| ----- | -------------- | --------------------- | -------- |
| —     | —              | —                     | —        |

## Not run

—

## Slice 1 — domain arithmetic (2026-10-12)

Base `99f588257`; isolated branch `batch-10/020-11-estimate-units`. Locked Bun install exit 0.
Initial focused tests exit 1 for the missing new exports; after implementation, both files
pass: 45 tests, 123 assertions. Existing workday arithmetic tests remain unchanged except
mechanical renames of the unit-free helpers and continue to pass.

| Check                        | Fault injected                                 | Test that observed it                                         | Observed                                            |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Whole-minute charge          | `Math.ceil` → `Math.round`                     | charges a minute step to the whole minute after its allowance | exit 1, expected 52, received 51                    |
| Project rounding independent | charge through `roundDays(..., rule.rounding)` | never consults the project rounding for a minute step         | exit 1, expected 52, received 51                    |
| Whole minute boundary        | remove `Number.isInteger`                      | refuses a fractional minute point                             | exit 1, expected minutes_not_integer, received null |
| Maximum minute boundary      | remove maximum guard                           | refuses a minute point above MAX_ESTIMATE_MINUTES             | exit 1, expected minutes_above_max, received null   |

Every injected file was restored before the green rerun. No stored units or public minute
writes exist at this checkpoint. Remaining slices and final host gate are not run yet.

## Slice 2 — deploy boundary (2026-10-12)

Focused Docker unit probes: 6 pass. Whole swap suite: 98 pass, 242 assertions.
Rollback CLI usage and unmigrated database test: 1 pass, 7 assertions.

| Check                | Fault injected                                 | Test that observed it                            | Observed                                                       |
| -------------------- | ---------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Swap unit vocabulary | remove ESTIMATE_UNITS_VOCABULARY from registry | three minute swap cases                          | exit 1; 3 failures, absent refusal/probe and routing continued |
| Legacy CLI absence   | unconditional workdays answer                  | estimate unit commands: missing source directory | exit 1, expected 74, received 0                                |
| Rollback usage       | bypass argument guard                          | estimate unit rollback CLI usage                 | exit 1, expected usage, received ENOENT                        |

Save/remove/restore round-trip and its remove-row fault await slice 3's column. No minute
writes are enabled. Domain lint/typecheck passed at slice 1; canonical saved-plan tests 29 pass.

## Slice 3 — storage (2026-10-12)

Allocated `20261012130000_add_step_estimate_unit` after main `99f588257`'s latest
`20261012120000_add_step_node_attempts` and the puni-plan integration queue. PM independently
confirmed no collision. Storage focused migration tests 4 pass; step repository suite 37 pass;
CLI unit usage + roundtrip 2 pass, 31 assertions. Migration lint exit 0. Store SQLite typecheck
exit 0 after adding the required field to existing step builders and fixtures.

| Check                     | Fault injected                     | Test that observed it                    | Observed                                                  |
| ------------------------- | ---------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Rollback minute guard     | remove guard statements            | refuses rollback over a minutes step     | exit 1; rollback returned instead of naming CLI           |
| SQLite unit vocabulary    | remove CHECK                       | refuses hours through its CHECK          | exit 1; invalid UPDATE did not throw                      |
| Remove saved minute trios | omit DELETE                        | minute-unit CLI roundtrip                | exit 1; four trios remained after remove                  |
| Unmigrated column         | bypass assertUnitColumn            | estimate unit CLI usage/unmigrated       | exit 1; raw missing-column stack instead of named refusal |
| Save version              | widen version schema to number     | minute-unit CLI roundtrip malformed save | exit 1; version refusal absent                            |
| Stale save                | bypass current comparison          | minute-unit CLI roundtrip stale save     | exit 1; remove succeeded after estimate changed           |
| Missing restored step     | bypass current-step guard          | minute-unit CLI roundtrip missing step   | exit 1; restore succeeded for missing step                |
| Occupied restored step    | bypass estimate-count guard        | minute-unit CLI roundtrip occupied step  | exit 1; raw primary-key failure replaced named refusal    |
| Orphan saved row          | bypass saved-step membership guard | minute-unit CLI roundtrip orphan row     | exit 1; raw foreign-key failure replaced named refusal    |

All files restored. Unit patching remains for slice 4, so task 3.2 stays open until that
store operation is implemented. No public minute writes are enabled at this checkpoint.

## Slice 4 — transactional write boundary (2026-10-12)

Full step controller and step contract suites: 43 pass, 248 assertions. Focused unit boundary
suite after adding ordinary workday overflow: 4 pass, 29 assertions. Contract and core
(including module) typechecks exit 0. The migration ordering regression suite is 91 pass,
427 assertions; its initial failures were expected migration ordering/newest-stamp assertions,
now updated. The memory step count test passes and its count-bypass mutation fails.

The normalizer remains pure and now checks finite, nonnegative, ordered figures with no
unit maximum. Astra approved reading the Step in `WorkItemService.setEstimate` inside the
command UoW; D6 and tasks 4.2/4.3 now record this correction. Mounted invalid minute batches
prove rollback of the preceding rename, command journal and plan history, and no captured
broadcast escapes. The original harness counted rollback without performing one; this
SQLite harness now uses the real SQLite UoW. Whole-minute figures above the workday maximum
parse structurally; a successful mounted write at that size awaits slice 5's minute placement.

| Check                      | Fault injected              | Test that observed it             | Observed                                         |
| -------------------------- | --------------------------- | --------------------------------- | ------------------------------------------------ |
| Unit change with estimates | bypass SQLite count refusal | mounted three-estimate step patch | 200 instead of 409                               |
| Minute write validation    | skip service unit branch    | mounted fractional minute command | 200 instead of 422                               |
| Posted vocabulary          | accept every string         | mounted hours step patch          | SQLite CHECK/500 instead of 422                  |
| Memory count parity        | bypass memory count refusal | step-unit.test.ts                 | conversion succeeds instead of estimates_present |

All mutated files restored. This isolated branch enables minute writes and MUST NOT be
released until slices 6 and 7 preserve documents/saved plans and validate/render frontend units.
Task 4.1 remains open for the valid above-workday-cap mounted minute write and tool-document
coverage. Slices 5–8 and the final host gate have not run.

Additional R5 proofs: removing the structural finite check admitted Infinity (EstimateTrio
nonfinite test, exit 1). Injecting an absent estimate-count row and removing its guard
produced raw TypeError instead of the named refusal (step.db.test.ts, exit 1). Both restored.
Checkpoint focused tests: 92 pass/270 assertions before the added missing-count test;
core, store-memory and store-sqlite typechecks all exit 0. Direct affected-file ESLint exit 0;
OpenSpec estimate-units validation valid=true. Final all-change validation and host gate pending.

## Slice 5 and immutable journal units (2026-10-12)

Mounted step controller: 51 pass, 326 assertions, including 240-minute placement and a
44,739,243-minute successful write above the workday cap. Focused compensating/work-item,
roll-up/schedule, both corpus, solver-request and wire suites: 233 pass, 603 assertions.
Additional contract identity/document/wire suites: 49 pass, 259 assertions. StepView Vitest:
3 pass. Domain, contracts, core and frontend typechecks (including module targets): exit 0.
OpenSpec estimate-units validation: valid=true.

Native minute charges are folded before conversion to workdays. New reads emit charged
figures; historical backend reads may omit charged/unit, with absent wire units explicitly
mapped to workdays. Fast and Quantum corpora each gained a minute case through their writers.
The actual corpus-version lint refused version 15 with both new cases (exit 1); version 16
passes (exit 0). All ten previous Fast workday schedules compared unchanged against HEAD.

| Check                  | Injected fault                         | Observed failure                                   |
| ---------------------- | -------------------------------------- | -------------------------------------------------- |
| Placement axis         | WORKDAY_MINUTES = 60                   | mounted half-day expected 0.5, got 4               |
| Native charged read    | omit charged field                     | mounted minute read loses its charge               |
| Required internal unit | default absent unit to workdays        | missing-unit throw test fails                      |
| Corpus ownership       | hand-edit generated Fast case          | corpus comparison fails; writer restores           |
| Tool unit wording      | replace workdays/whole minutes wording | emitted-description assertion fails                |
| Wire unit preservation | force StepView unit to workdays        | Vitest minute-preservation test fails              |
| Replay comparison      | bypass current-unit comparison         | mounted stale undo answers 200, not 409            |
| Restore coverage       | omit restore estimate arrays           | deleted-subtree undo answers 200, not 409          |
| Nested coverage        | omit nested batch recursion            | mixed batch replays instead of refusing atomically |
| Delete coverage        | omit delete setEstimates               | recursive coverage test misses handed-up step      |
| Flip retention         | omit bindings on flip                  | chained minute redo answers 409, not 200           |
| Legacy units           | interpret absent map as minutes        | historical workday undo answers 409, not 200       |
| Binding shape          | skip shape guard                       | malformed trusted-state test gets raw TypeError    |
| Binding vocabulary     | skip unit validation                   | malformed hours map accepted                       |
| Binding completeness   | skip coverage guard                    | incomplete trusted map answers 200, not 500        |
| Missing bound step     | skip missing-step guard                | mounted undo answers 500, not 409                  |

Every injected fault was watched red (exit 1) and restored; adjacent Proof comments name the
fault and production-path observation. Replay mounted cases cover both unit directions,
redo, first-child hand-down, last-child hand-up, deleted subtree restore, mixed-batch rollback
with no revision/journal/event leak, stale-entry discard and access to an older entry, chained
flip/rebase, historical journals, same-unit/unrelated changes and away-and-back equality.

Slices 6 and 7 and the final host gate remain pending. This checkpoint MUST NOT be released:
minute writes require plan-document/saved-plan preservation and frontend validation/readout.

Checkpoint final rerun after style fixes: mounted step + compensating suites 58 pass,
348 assertions; StepView + delivered-plan model Vitest 4 pass. Affected-file ESLint exit 0,
Prettier write exit 0 and git diff --check exit 0. The four-project typecheck ran six targets,
all successful (two reused matching Nx cached outputs). Full frontend/browser suites,
all-change validation, final migration-stamp collision check and host gate remain pending.

Native read schema follow-up: work-item-response suite passes positive workday/minute charges
and refuses fractional/negative minute charges and unknown units. Weakening minutes to number
and weakening the minute discriminator to string each failed this production response-schema
suite (exit 1), then restored with adjacent Proof. This check is separate from input validation.

## Review corrections — rollback history and recovery trios (2026-10-12)

Astra's P1 reproduced: the stored-unit probe omitted retained minute bindings and down.sql
rolled back over minute undo/redo history after the live unit became workdays. CLI remove
also succeeded while leaving minute history. New-image replay was safe, but old code would
ignore bindings. The probe now includes journal minute bindings regardless of live step;
down and recovery remove refuse whole affected history unchanged. Journal quarantine is
not supported. Tests cover redo, nested batch inverse and missing live step. Malformed
binding maps fail closed; absent legacy maps remain workday-only.

P2 reproduced: CLI restore accepted a fractional saved minute trio. Saved rows now pass
EstimateTrio finite/nonnegative/order and minuteTrioProblem integer/maximum checks before
any recovery mutations. CLI negatives cover fractional, unordered, nonfinite and above-max
figures, asserting identical unit/estimate state after refusal.

Fault proofs observed exit 1 and restored: remove the history guard from down; skip recovery
history refusal; skip structural trio parse; skip minute refusal; omit history minutes from
probe; remove probe precondition/map/vocabulary checks. Adjacent Proof comments record each.
The first null-map fault was caught only by incidental TypeError; its check was strengthened
to assert the named refusal and rerun red, then restored.

Focused command probes: 36 pass, 106 assertions. Recovery CLI round trip and negatives:
1 pass, 36 assertions. Store-sqlite and remote-scripts typechecks passed; affected ESLint,
Prettier and migration lint exited 0. An initial full docker suite exposed an overbroad test
edit in two unrelated fixtures; corrected and the focused command suites rerun green.

## Slice 6 — document and saved-plan unit preservation (2026-10-12)

The base already writes document 7 and canonical input 5 (the initial packet allocation was
stale). This change writes document 8 and canonical input 6. Historical canonical inputs
upgrade from 5 with explicit workday units; historical documents through 7 import as workdays.
Current documents require a supported unit; minute trios retain native figures through
preparation and both store imports. Captured saved-plan units enter the hashed canonical body
and scheduling; a captured 240-minute slice schedules as 0.5 workday. Saved-plan readers now
advertise versions 1–6. Unit changes appear in the steps diff.

Focused domain/core plus both import-source contracts: 233 pass, 889 assertions. Composed
minute import/export: 1 pass, 17 assertions, including missing/unknown units and fractional/
above-max trios refused before writes. Full composed import and saved-plan suites initially
67 pass/1 fail: the supported-version response assertion still expected versions 1–5; updated
for version 6 and its focused case rerun. Full backend typecheck found a missing production
step-route forwarding method from slice 4; it now forwards patchUnitWithin and the composed
minute test reaches its 409 estimated-step refusal. Six projects/eight typecheck targets pass.

R5 faults watched exit 1 then restored: drop the historical unit upgrade; drop its list/step
shape guards; force captured/canonical units to workdays; skip current document-unit refusal;
skip trusted export missing-unit refusal; skip imported minute validation; force persisted
import units to workdays. Adjacent Proof comments identify the observing tests. New tests
first failed on document version 7 vs 8 and canonical version 5 vs 6/unit loss.

Rollback review full suite rerun: 117 pass, 354 assertions. This checkpoint leaves spreadsheet
headers/native output and the frontend controls/validation/readout for slice 7. Task 6.1 stays
open for that export assertion; slices 7–8 and the final host gate remain pending.

## Slice 6 corrected mounted checkpoint

After correcting the supported-version assertion, the complete import/saved-plan mounted
suite passed: 68 tests, 272 assertions (`/tmp/estimate-unit-slice6-mounted-corrected.log`).

## Slice 7 — frontend units and native duration readout (2026-10-12)

Step creation sends an explicit unit. Empty steps can change unit; controls over stored
estimates are disabled and name the count. Both folded shorthand and unfolded points refuse
fractional and above-maximum minute input before setEstimate is called. Missing trusted
counts and native minute charges throw; the mounted missing-charge case reaches the Error
Boundary. Table, folded detail, cards, chart and spreadsheet final figures read native charge
through showDuration. Minutes render as minutes/hours below 480 and eight-hour days from
480; workday faces keep their existing text. Spreadsheet minute headers identify min, and
minute trio/final cells use the shared formatter. No chart geometry or existing workday
pixel assertions changed.

Fresh checks: 76 node tests passed (draft, duration, fake API and refusing API); 854 mounted
regression tests passed across cells, estimates, chart, cards, folded detail, settings, export,
HTTP client and command routing. Frontend typecheck/module typechecks, affected ESLint and
Prettier passed. The initial broader run had one invalid test sequence: a pending fractional
optimistic draft masked a subsequent maximum complaint. Splitting the two unfolded cases
made each production-path refusal independent; both passed. Two old HTTP export fixtures
still advertised document 7; updated to current document 8 and the HTTP suite passed.

The unchanged Playwright case `draws a bar at the pixel its calendar day says, under its own
axis cell` passed (1 case, 15.0s), isolated worktree servers with E2E_PORT_SHIFT=3900. Sandbox
startup first refused listen with EPERM; the same targeted command passed with escalation.
No full browser suite or final host gate has run at this checkpoint.

R5 faults individually watched fail then restored: remove minute integer check; remove minute
maximum; remove estimate-count disabled arm; omit trusted count guard; omit trusted native
charge guard (also rerun after factoring shared readMinuteCharge); substitute chart dayWords
for showDuration; export the axis fraction instead of native charge; remove fake estimated-step
unit refusal; treat unfolded minute writes as workdays. Mounted negatives observed forbidden
writes, missing disabled controls, missing named throw/Error Boundary, or inconsistent native
readout. Adjacent Proof comments identify each observation. New formatter tests first failed
with `8 h` instead of `1 d` at 480, then passed after adding the specified threshold.

Final slice 7 check: 854 mounted tests passed after adding explicit 40/135/720 minute face agreement; folded card also pins 135 as 2 h 15 min. OpenSpec 1.12.0 validation passed all 18 items. Direct sandbox Bun invocation refused its cache temporary directory (EROFS); pinned bunx validation passed with escalation. Final host gate, full browser suite, migration-stamp check against integration main, and Astra review remain pending.

## Astra P2 corrections — journal root shape and normative versions (2026-10-13)

Direct down and CLI remove now require the trusted journal preconditions root to be an
object before applying the legacy absent-unit-map policy. JSON null, arrays, numeric/boolean/
string scalars, malformed JSON, and null/array maps refuse without changing the unit column,
units, estimate rows or history. Direct down also asserts its migration ledger is unchanged.
Valid legacy object preconditions without estimateUnits still pass direct down and CLI remove,
with their history retained. No journal bindings are removed or relabeled.

Initial red: direct-down suite had five failures (null/array/three scalar forms were accepted);
CLI round trip failed when remove accepted null. After the guard, the complete focused
migration/CLI suites passed 64 tests and 476 assertions. Removing only each new root-object
arm reproduced red: direct down had five failures; CLI remove returned success and failed its
nonzero assertion. Both faults were restored and the complete suites rerun: 64 passed,
0 failed, 476 assertions (`/tmp/estimate-unit-review-root-restored.log`). Mutation logs:
`/tmp/estimate-unit-review-root-down-proof.log` and `/tmp/estimate-unit-review-root-cli-proof.log`.

The normative wbs-domain delta now preserves old workday arithmetic/schedule outputs and
solver quantum/wire schema while explicitly permitting scheduler contract tag/cache identity
16 and canonical input 6 with a versioned estimateUnit field. Allocation tables now record
actual document 8, canonical 6, retained ADR 0042, and the fixed implementation base; no
implementation versions changed. Store-sqlite typecheck, affected ESLint, migration lint,
Prettier and OpenSpec validation (18/18) passed. Task 8/full browser/host gate and the final
migration collision check remain open; this correction does not authorize release.

## Astra proposal consistency correction (2026-10-13)

The proposal now excludes scheduler algorithm, solver schema/quantum and Python changes,
while permitting approved contract 16 tag/cache identities and canonical input 6 unit fields
and hashes. It promises unchanged old workday arithmetic/schedule outputs. Allocation text
names document 8/canonical 6/contract 16 and the implemented migration with its final collision
check still open. Directly stale task text now permits the identity expectations and names
legacy document 7. No runtime edits. Changed-document Prettier and OpenSpec validation pass;
task 8/full browser/host gate/migration integration collision remain open.

## Combined minute-axis acceptance (2026-10-13)

Integration branch `batch-10/minute-axis-integration` starts at corrected attempt head
`e0c1ed53cfa4eeee6dc6e1dd8997bc1b417c5cc6` and normally merges estimate head
`a52de9458d32042023f131cccd4243c0d80e2006`, its final intent correction
`893407a5310a35cdb9ccb7b5a408917eb738d424`, and renderer evidence head
`ca1822547a3590be7a6f5ee7557ad0b4e60afeb5`. Source histories are retained.

Six initial conflicts were resolved by retaining both `attemptNodes` and `charged`,
both imports and test groups, and both node-suite entries. Three attempt test fixtures
now explicitly use `estimateUnit: 'workdays'` as the merged type requires.

- Real stack: `CI=1 E2E_PORT_SHIFT=4000 bunx playwright test --config
apps/wbs/fe-01/playwright.config.ts gantt-minute-estimate.spec.ts gantt-attempts.spec.ts
--workers=1 --timeout=30000`: five cases pass. API commands write two native minutes;
  a fresh HTTP read returns `{ unit: 'minutes', minutes: 2 }`, minute step unit and
  schedule duration `2 / 480`. Browser reload consumes that stored plan.
- At `15 min`, authored forecast fill `width * 896` is 4px and pointer width is 18px.
  Browser transform floating point gives approximately 3.99989/17.99992px; tolerances
  are 0.005px for transformed widths and 0.05px for bounds. Existing 2px outline makes
  the forecast's stroke-inclusive bounding box approximately 5.99989px, separately
  asserted as 6px. The test does not call that full outline a 4px box.
- Slice identifiers contain a NUL separator; hit lookup uses the painted bar's parent
  and `[data-gantt-hit]`. Pointer moves to `(pointer.x + pointer.width / 2,
pointer.y + pointer.height / 2)`, where the native Dev tick and zero-duration QA hit
  overlap. The real chooser's `010 · Dev · 2 min` button opens the card containing
  `2 min · placed on the working calendar`; no forced event or synthetic hit is used.
- Both browser files use `America/Los_Angeles`. Attempt cards retain original Kyiv
  instants, including `2026-08-09 09:00:00 — 2026-08-09 09:02:00 (Europe/Kyiv)`.
- Broken dependency: stripping trusted `charged` from the real API read renders the
  router's visible `Something went wrong!` Error Boundary and no chart. This is the
  observed outer boundary, not the nested plan boundary used by the component case.
- The real API refuses fractional minute commands with `422 minutes_not_integer`;
  a subsequent read still contains two native minutes. Removing the optional project
  timezone from the API read visibly reports attempt marks unavailable while retaining
  the forecast after reopening Gantt.
- Six merged frontend suites (`gantt-panel`, `gantt-attempt-panel`, `folded-step-card`,
  `gantt-geometry`, `plan-chart-input`, `use-attempt-actions`): 576 tests pass.
- `bun test apps/wbs/be-01/src/migration-cli.db.test.ts`: 50 pass. Separately,
  `bun test libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts`:
  14 pass, including malformed/unreadable rollback and direct-down refusal coverage.
- Canonical `NX_DAEMON=false bunx nx run wbs-fe-01:lint:fast`: pass. Nx sandbox socket
  warnings triggered its in-process plugin fallback; the lint task ran and exited zero.
  `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: pass. Changed-file Prettier
  checks pass. OpenSpec CLI 1.14.1 installed temporarily with Bun because `openspec`
  was absent from PATH; `validate --all --json`: 184/184 pass.

Migration stamp inspection found no duplicates: current `origin/main`
`e9acebd6ae148f039bca9d0bf1a6b1f67c38f97e`, integration-11
`13977965d267576a9cb838f119a64f5d7d2dfede`, and integration-12
`403a0462442cb66751d5a8bb5bb69c4236579225` have 68 migrations and no
`20261012130000` stamp. Combined checkout has 69, including that unique estimate
migration with its adjacent `down.sql`.

Full host gate, full frontend suite, full historical Gantt browser shard and broad
backend/domain suites have not been run by this worker. The final exact-SHA host gate
is queued by the PM after the preceding integration merges; task 8.1 stays open.

### PR #380 field-group gate correction — 2026-10-13

Base: `743e0a508905027d8ab9c513e5fe42e73bf1cff8`. This restores the existing
`list-reads` requirement that every tree field belongs to one page field group,
and the existing optional tree-field response contract; no new behavior delta.
`charged` belongs to `estimates`, preserving native minute and workday charges.
`rowOf` copies only present tree properties, preserving absent optional fields.

- Initial `bun test libs/wbs/domain/contracts/src/http/work-item-fields.test.ts`:
  0 pass / 1 fail, missing `charged`.
- Mounted regression exposed explicit undefined `attempts`, `spans`, and `span`
  copied from a leaf without attempts; response validation returned HTTP 500.
  A parent also lacks `nodeReadings`; both absent and present optional fields are
  now covered, including legacy absent `charged` in the core projection test.
- Mutation: removing `charged` from `estimates` failed both the partition test
  and mounted `includes native charges only when the estimates group is requested`
  (missing `charged`). Removing the own-property check restored the mounted HTTP 500. Both mutations were restored; adjacent Proof comments record them.
- `bun test libs/wbs/domain/contracts/src/http/work-item-fields.test.ts
libs/wbs/domain/contracts/src/http/work-item-response.test.ts
libs/wbs/application/core/src/service/work-item-page.test.ts
apps/wbs/be-01/src/controller/work-item-rows.controller.db.test.ts`:
  25 pass / 0 fail, 110 assertions.
- `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json
libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0.
- Changed source files: Prettier check passes. Initial direct ESLint identified
  array-index guards typed as unnecessary; using `at` retains checked absence.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:fast
-p wbs-contracts,wbs-core,wbs-be-01`: all three targets pass (0/3 cache hits).

Full host gate, full repository suites, build, and OpenSpec validation are not run
by this worker; the PM will run the exact-SHA host gate after this fix is pushed.

### PR #380 historical migration suite correction — 2026-10-13

Base: `74ce3c8bf3a0070b7af73198d75cdcebae385f14`. The old host gate's five
SQLite failures reproduce on this head: the historical step-code column comparison
kept `estimate_unit` after rollback, the SSO rollback list omitted its migration,
activation reapplication expected attempts as newest, and two WorkingPlan journal
comparisons omitted `estimateUnits: {}`. Expectations now include the additive
migration and immutable bindings while retaining exact migration order, schema
roundtrip, step identity, journal revisions and undo assertions. Step-code coverage
also asserts the unit column's nullability/default and its reapplied workday value.
No production behavior or safety checks changed.

- Red: focused four-file run, 53 pass / 5 fail (activation checked separately:
  29 pass / 1 fail; other three files: 24 pass / 4 fail).
- Mutation: removing `DROP COLUMN estimate_unit` from its real down migration
  makes the step-code rollback assertion fail, 4 pass / 1 fail. Restored afterwards;
  adjacent Proof comment records the observed fault.
- Green: focused migration/activation/WorkingPlan suite, 111 pass / 0 fail across
  13 files, 310 assertions. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx
run-many -t lint:fast,typecheck -p wbs-store-sqlite`: both targets pass, no cache
  hits. Changed-file Prettier and `git diff --check`: pass.

Full host gate, full SQLite suite, repository build and OpenSpec validation were
not run by this worker; the PM owns the final exact-SHA host gate.
