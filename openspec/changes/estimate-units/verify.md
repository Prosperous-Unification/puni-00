# verify — estimate-units

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Allocated numbers (filled at packet time)

| What                                  | Value | Checked against | Date |
| ------------------------------------- | ----- | --------------- | ---- |
| Migration stamp                       | —     | —               | —    |
| `PLAN_DOCUMENT_VERSION`               | —     | —               | —    |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | —     | —               | —    |
| `SCHEDULER_CONTRACT_VERSION`          | —     | —               | —    |

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
