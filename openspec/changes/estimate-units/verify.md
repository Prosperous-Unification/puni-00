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
