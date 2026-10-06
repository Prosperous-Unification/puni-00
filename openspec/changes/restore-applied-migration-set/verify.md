# Implementation evidence

## Slice 1.1 — capture and exact-set CLI

Worktree `feat/restore-applied-migration-set` began at planning commit
`e35d325691e498e4ff2c1e458197b3e4f8ee6846`. No deployment or canonical
gate has been run for this implementation. The held PR #259 integration worktree
was not changed.

The pre-change backend migration CLI suite passed 9 tests and 68 assertions
(`bun test apps/wbs/be-01/src/migration-cli.db.test.ts`,
`/tmp/puni-07012-cli-baseline.log`). The first new real-CLI test used a database
already migrated through `20261005110000_add_shared_people` and then introduced
the older `20261001020000_add_browser_auth_lifecycle` migration. It failed RED
because the old status CLI printed only a single name, which was not JSON:
`bun test apps/wbs/be-01/src/migration-cli.db.test.ts -t 'restores an older newly introduced migration'`
exited 1 (`/tmp/puni-07012-cli-red.log`, JSON parse failure). The restored test
now exercises capture, forward migration and exact-set rollback through the
actual backend CLIs, comparing complete schema and name/hash ledger and retaining
a baseline user row.

The implementation adds a versioned capture with target/attempt/candidate,
complete baseline name/hash identities and ordered pending name/forward/down
hashes. The status CLI emits it with `--capture`; the down CLI accepts
`--capture-file=<path>` and the same identity flags. Existing manual `--to=`
behavior remains covered by the original CLI round trip. Exact-set rollback
reuses the existing per-migration down-script transaction and checks the final
ledger. Capture opens an existing database read-only.

Observed independent R5 faults, each restored before continuing:

| Production fault                                                | Real test failure                                                                                | Log                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Reintroduced timestamp cutoff when choosing candidate additions | Older-candidate CLI restore exited 1 instead of 0; candidate ledger row remained                 | `/tmp/puni-07012-fault-timestamp-cutoff.log`   |
| Included captured baseline identities among down candidates     | Preservation CLI did not report the new addition and exited before preserving retained lifecycle | `/tmp/puni-07012-fault-preservation.log`       |
| Treated an existing empty database without a ledger as an error | Empty-set CLI capture exited 1 instead of 0                                                      | `/tmp/puni-07012-fault-empty-capture.log`      |
| Used creating `openDatabase` for capture                        | Missing-database CLI capture exited 0 and created the file                                       | `/tmp/puni-07012-fault-capture-creates-db.log` |
| Disabled final name/hash equality after down execution          | Ledger-reinsertion CLI test observed exit 0 instead of refusal                                   | `/tmp/puni-07012-fault-final-equality.log`     |

Adjacent `Proof:` comments name the faults in `migration-set.ts`. The
production-path test suite also covers repeat restoration and recovery after one
down script plus its ledger deletion committed.

After formatting, `bun test apps/wbs/be-01/src/migration-cli.db.test.ts
libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts` passed 35/35 tests,
275 assertions (`/tmp/puni-07012-slice11-tests-final.log`). Backend and SQLite
store Nx lint and typecheck targets all exited 0
(`/tmp/puni-07012-{be,store}-{lint,typecheck}-final*.log`). Scoped Prettier
check and strict validation of `restore-applied-migration-set` exited 0
(`/tmp/puni-07012-prettier-check.log`, `/tmp/puni-07012-openspec-slice11.json`).
`git diff --check` exited 0. These checks are local slice evidence, not a
canonical h2puni gate or deployment acceptance.

Slice 1.2 still must prove malformed capture, capture ownership, unexpected
ledger changes, script-byte changes and failure/resume integrity. Compose and
Kubernetes callers remain unchanged.

Astra's independent review ran the two focused suites (35/35, 275 assertions)
and found no regression in the completed happy-path behavior. Its disposable
review separately reproduced two mandatory input-boundary defects: reordered
pending entries can commit one down script before the next fails, and
simultaneous exact/legacy CLI flags can silently select exact mode. The PM
required these production-path negatives and repairs before accepting the 1.1
checkpoint. Those repairs and independent fault proofs are recorded below.

### Review follow-up: boundary regressions

Three additional real-CLI tests were written before their fixes. With the
previous production code, the mixed-mode test exited 0 and reversed the
candidate (`/tmp/puni-07012-red-mixed-modes.log`); the duplicated `--target`
capture exited 0 (`/tmp/puni-07012-red-duplicate-flags.log`); and a reversed
`pending` list committed the first down script before failing the second, so
the observed ledger lost its first migration row
(`/tmp/puni-07012-red-pending-order.log`). The parser now refuses conflicting
modes and repeated flags before database access, and capture validation checks
the candidate's forward order before rollback. These tests reached GREEN in
the backend CLI suite (18/18, 129 assertions;
`/tmp/puni-07012-cli-boundary-green.log`).

Each safety guard was then disabled independently and restored. With mixed-mode
refusal disabled, its real CLI test again saw exit 0
(`/tmp/puni-07012-fault-mixed-modes.log`). With duplicate detection disabled,
the duplicate capture test again saw exit 0
(`/tmp/puni-07012-fault-duplicate-flags.log`). With pending-order validation
disabled, the reordered capture again removed the first ledger row before the
later down failure (`/tmp/puni-07012-fault-pending-order.log`). Adjacent
`Proof:` comments name the observed failures in `migration-cli-options.ts` and
`migration-set.ts`. The combined CLI/SQLite store suite passed 38/38 tests,
291 assertions after these fixes (`/tmp/puni-07012-boundary-tests-final.log`).
Backend/store typecheck and store lint passed on the corrected source; backend
lint passed after the test's typed capture-array fix
(`/tmp/puni-07012-boundary-be-lint-final.log`). Strict change validation passed
(`/tmp/puni-07012-boundary-openspec.json`). Astra's follow-up review independently
reran the combined suites (38/38, 291 assertions) and confirmed that both
original boundary reproductions now refuse before changing the ledger or schema.
It found no Critical or Important issue and cleared the local 1.1 checkpoint
after correction of the duplicate-flag `Proof:` wording: without that guard,
`Map.set` accepts the last conflicting value. The slice 1.2 integrity proofs
follow below; the full gate remains pending.

After the proof wording correction and checkpoint documentation update, the
combined CLI/store tests passed again (38/38, 291 assertions;
`/tmp/puni-07012-checkpoint-tests.log`). Backend lint passed with Nx daemon and
plugin worker isolation disabled for the sandbox (exit 0;
`/tmp/puni-07012-checkpoint-lint-no-daemon.log`). The ordinary Nx invocation
returned exit 0 while reporting socket denial, so its output was not counted as
lint evidence (`/tmp/puni-07012-checkpoint-lint.log`). Scoped Prettier and
strict OpenSpec validation each passed (`/tmp/puni-07012-checkpoint-format.log`,
`/tmp/puni-07012-checkpoint-openspec.json`); `git diff --check` passed. This
clears task 1.1 as a local checkpoint only; deployment callers and the canonical
h2puni gate remain unverified.

## Slice 1.2 — capture, ledger and script integrity

The actual backend status, forward and down CLIs run against disposable SQLite
in `migration-cli.db.test.ts`. A two-addition fixture captures one baseline row,
then applies both additions so each refusal can prove that neither down script
committed. Tests cover an absent capture, a mode-000 capture read by a
nonprivileged Bun subprocess, malformed JSON, unsupported version, duplicate
name, malformed sha256, mismatched target/attempt/candidate, unrelated applied
row, missing/changed baseline row, changed pending hash, and changed/missing/
unreadable `migration.sql` and `down.sql`. Partial forward application and a
repeated no-op converge to the baseline. A failed multi-statement down script
leaves its earlier marker insert and ledger deletion uncommitted; creating the
modeled missing table permits a retry with the same capture. The 1.1 resumed
reversal test remains in the combined suite.

These checks were independently faulted, with source restored after each run.
All fault runs below exited 1 on the named production-CLI test. The exact
mutated source and observed failures are adjacent `Proof:` comments at
`migrate-down-cli.ts:29`, `migration-set.ts:10,86-100,124-165`, and
`migrate-down.ts:215` (line numbers before final formatting):

| Disabled check / injected fault                                | Observed production-path failure                                                                         | Log                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Catch missing capture and silently use legacy rollback-to-none | Missing-capture test saw exit 0 instead of refusal                                                       | `/tmp/puni-07012-slice12-fault-capture_missing.log`                                                  |
| Same fallback on unreadable capture                            | Nonprivileged unreadable-capture test saw exit 0                                                         | `/tmp/puni-07012-slice12-fault-capture_unreadable.log`                                               |
| Same fallback on malformed JSON                                | Malformed-JSON test saw exit 0                                                                           | `/tmp/puni-07012-slice12-fault-capture_malformed.log`                                                |
| Bypass versioned schema parse                                  | Unsupported-version test saw exit 0                                                                      | `/tmp/puni-07012-slice12-fault-capture_version.log`                                                  |
| Remove sha256 shape validation                                 | Malformed-hash test reached script preflight instead of malformed-capture refusal                        | `/tmp/puni-07012-slice12-fault-hash_shape.log`                                                       |
| Disable duplicate-name guard                                   | Duplicate-identity test observed candidate ledger rows removed before final equality failed              | `/tmp/puni-07012-slice12-fault-capture_duplicate.log`                                                |
| Disable target/attempt/candidate comparison                    | Wrong-target CLI case exited 0 and reversed additions                                                    | `/tmp/puni-07012-slice12-fault-ownership.log`                                                        |
| Disable baseline row comparison                                | Missing-baseline CLI case observed candidate ledger rows removed before final equality failed            | `/tmp/puni-07012-slice12-fault-baseline.log`                                                         |
| Disable observed-row membership/hash comparison                | Unexpected addition and changed pending-hash cases each observed candidate reversal before later refusal | `/tmp/puni-07012-slice12-fault-unexpected.log`, `/tmp/puni-07012-slice12-fault-pending_identity.log` |
| Disable forward script preflight                               | Changed `migration.sql` case observed later candidate reversal before per-row hash refusal               | `/tmp/puni-07012-slice12-fault-forward_hash.log`                                                     |
| Disable down script hash preflight                             | Changed `down.sql` case exited 0 and reversed both candidates                                            | `/tmp/puni-07012-slice12-fault-down_hash.log`                                                        |
| Commit first down statement before the later failure           | Failed-down test observed persistent `marker` row while the migration ledger row remained                | `/tmp/puni-07012-slice12-fault-transaction.log`                                                      |
| Treat absent pending row as applied on retry                   | Partial-forward/no-op test exited 1 rather than converging                                               | `/tmp/puni-07012-slice12-fault-convergence.log`                                                      |

The first full CLI/store run after the new cases passed 59/59 tests with 452
assertions (`/tmp/puni-07012-slice12-tests-final.log`). BE and store Nx lint
and typecheck each passed with Nx daemon/plugin isolation disabled for the
sandbox (`/tmp/puni-07012-slice12-{be,store}-{lint,type}-final.log`). After the
final assertion-order adjustment, the combined CLI/store suite passed again
(59/59, 452 assertions; `/tmp/puni-07012-slice12-review-tests.log`), BE lint,
scoped Prettier, strict change validation and `git diff --check` all passed
(`/tmp/puni-07012-slice12-review-be-lint.log`,
`/tmp/puni-07012-slice12-review-format.log`,
`/tmp/puni-07012-slice12-review-openspec.json`). No deployment
caller, canonical gate or PR #259 worktree was changed. Architecture review was
requested before checking task 1.2 or making a checkpoint commit.

### Follow-up: duplicate names in the observed ledger

Astra's independent review found that `restoreAppliedMigrationSet` reduced the
observed ledger to a `Map` before validating uniqueness. Two identical candidate
rows could therefore pass preflight: a down script deleted one row, its table
was dropped, and final equality refused only after the transaction had
committed. Three real-CLI negatives were added before the repair. Capture with
a duplicated baseline name exited 0 and emitted malformed capture
(`/tmp/puni-07012-slice12-duplicate-capture-red.log`). Restoring with duplicate
baseline or pending names reversed candidates before refusal, changing the
ledger and schema (`/tmp/puni-07012-slice12-duplicate-ledger-red.log`).

The shared applied-ledger read now rejects duplicate names before capture
output or rollback selection. Focused positives passed 3/3 tests, 23 assertions
(`/tmp/puni-07012-slice12-duplicate-ledger-green.log`). Independently removing
that guard made all three production-CLI negatives fail again
(`/tmp/puni-07012-slice12-fault-duplicate_observed.log`). The adjacent `Proof:`
comment is in `migration-set.ts` at the applied-ledger read. Astra independently
reproduced the original duplicate-ledger failure, confirmed the repaired CLI
refuses with all ledger rows/tables unchanged, and reviewed the 3/3 positive
and 3/3 guard-removal results. Its follow-up review found no remaining
Critical, Important or Minor issue. The full focused CLI/store suite passed
62/62 tests with 475 assertions
(`/tmp/puni-07012-slice12-duplicate-final-tests.log`). BE/store lint and
typecheck, scoped Prettier, strict change validation and `git diff --check`
passed (`/tmp/puni-07012-slice12-duplicate-{be,store}-{lint,type}.log`,
`/tmp/puni-07012-slice12-duplicate-format.log`,
`/tmp/puni-07012-slice12-duplicate-openspec.json`). Task 1.2 is a local
checkpoint; deployment caller slices, the canonical gate and #259 integration
remain pending.

## Slice 2.1 — Compose swap capture and rollback

The swap now asks the incoming green backend for its observed `DB_PATH` and versioned
capture, writes an attempt-specific 0600 file with exclusive publication and file/directory
fsync, reads the exact bytes back, then runs forward migration. Abort rechecks those retained
bytes, copies the file into green, checks the copied SHA-256 through the incoming backend CLI,
runs exact-set down, and compares the complete final name/hash ledger. A failed reversal
reports the original failure plus a manual command using the pinned incoming image,
read-only capture, read-write host data mount, and the observed green DB path. The capture
remains after green stops. Legacy operator `--to` commands remain documented separately.

The command-adapter regression first failed on an older lifecycle migration introduced after
a newer shared-people baseline: the old `--to` path said no migrations to roll back and left
the candidate table (`/tmp/puni-07012-slice21-older-candidate-red.log`). The persistence
failure test initially observed forward migration despite a failed capture write
(`/tmp/puni-07012-slice21-capture-persist-red.log`). Before the handoff guards, the pinned
DB path, changed host bytes and changed copied bytes cases failed independently
(`/tmp/puni-07012-slice21-handoff-red.log`); reversed pending order reached migration until
the deploy transport parser rejected it (`/tmp/puni-07012-slice21-parser-red2.log`).

Each changed safety guard was then faulted independently and restored. Every named mutation
run exited 1 on its watched test:

| Injected production fault                                                         | Observed failure                                                               | Log                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish over an existing attempt instead of no-replace link                       | Writer test accepted a second capture                                          | `/tmp/puni-07012-slice21-exclusive-mutation.log`                                                                                                                                                                            |
| Omit published-directory sync                                                     | Writer test observed no directory durability fence                             | `/tmp/puni-07012-slice21-dirsync-mutation.log`                                                                                                                                                                              |
| Move forward migrate before capture write                                         | Disk-full test observed `migrate-cli.ts` ran                                   | `/tmp/puni-07012-slice21-order-mutation.log`                                                                                                                                                                                |
| Skip exact persisted readback comparison                                          | Valid JSON with changed bytes passed and forward migration ran                 | `/tmp/puni-07012-slice21-readback-mutation2.log`                                                                                                                                                                            |
| Skip host retained-byte comparison                                                | Tampered host capture copied and candidate reversed                            | `/tmp/puni-07012-slice21-host-mutation.log`                                                                                                                                                                                 |
| Skip copied-byte digest comparison                                                | Altered transfer reached exact-set down and candidate was reversed             | `/tmp/puni-07012-slice21-copy-mutation.log`                                                                                                                                                                                 |
| Accept DB path outside mounted `/data`                                            | Swap resolved instead of refusing before capture                               | `/tmp/puni-07012-slice21-dbpath-mutation.log`                                                                                                                                                                               |
| Use a default instead of observed DB path in manual command                       | Recovery test reported `/data/wbs.db` instead of green's `/data/plan.db`       | `/tmp/puni-07012-slice21-manual-dbpath-mutation.log`                                                                                                                                                                        |
| Mark the manual data bind read-only                                               | Recovery test found an unusable data mount                                     | `/tmp/puni-07012-slice21-data-rw-mutation.log`                                                                                                                                                                              |
| Remove final applied-set equality                                                 | Zero-exit, unchanged-ledger rollback was reported successful                   | `/tmp/puni-07012-slice21-equality-mutation.log`                                                                                                                                                                             |
| Remove digest CLI argument/path refusal                                           | CLI accepted an ambiguous or non-capture path                                  | `/tmp/puni-07012-slice21-digest-boundary-mutation.log`                                                                                                                                                                      |
| Bypass swap capture schema, identity, duplicate or pending-order check separately | Malformed/foreign/duplicated/reversed status capture reached forward migration | `/tmp/puni-07012-slice21-parser-schema-mutation.log`, `/tmp/puni-07012-slice21-parser-identity-mutation2.log`, `/tmp/puni-07012-slice21-parser-duplicate-mutation.log`, `/tmp/puni-07012-slice21-parser-order-mutation.log` |

The direct transport parser is scoped to the deployment tool because Nx forbids a buildable
tool importing the non-buildable SQLite store; the backend CLI retains authoritative script
and ledger validation. The combined remote/backend/SQLite focused suite passed 162/162 tests,
733 assertions (`/tmp/puni-07012-slice21-tests-final.log`). `tool-remote-scripts` lint,
typecheck and build passed (`/tmp/puni-07012-slice21-{lint,type,build}-final.log`); the
backend typecheck passed (`/tmp/puni-07012-slice21-be-typecheck-final.log`). Scoped Prettier passed
after formatting (`/tmp/puni-07012-slice21-format-final3.log`). Backend lint passed
(`/tmp/puni-07012-slice21-be-lint-final2.log`); strict OpenSpec validation passed 1/1
(`/tmp/puni-07012-slice21-openspec-final.json`). The final focused suite repeated at 162/162,
733 assertions (`/tmp/puni-07012-slice21-tests-final2.log`). `git diff --check` passed.
Architecture review and the canonical heavy gate remain pending. No #259 worktree or
migration timestamp was changed.

### Review correction: pin manual recovery to the original bytes

Astra found a P1 in the first 2.1 candidate: automatic abort rejected a modified retained
capture, but its printed manual command consumed that same file without an original-byte pin.
Moving the applied shared-people baseline into the pending list produced a valid capture that
could delete both baseline and lifecycle. The new production command-adapter test failed RED
because no original digest appeared in the printed command
(`/tmp/puni-07012-slice21-manual-tamper-red.log`). The correction adds
`--capture-sha256=<original>` to both automatic and printed manual down commands. The backend
CLI reads the file once, checks that digest, parses those same bytes, and only then opens
SQLite for exact-set rollback. The test extracts the actual printed CLI arguments; an intact
capture succeeds after green cleanup, while the valid altered capture exits 1 with the complete
baseline/candidate ledger and both tables unchanged
(`/tmp/puni-07012-slice21-manual-command-green.log`).

Independent watched faults on this correction all exited 1 and were restored: removing the
backend digest comparison made the altered capture's real CLI exit 0 and reverse both migrations
(`/tmp/puni-07012-slice21-manual-digest-mutation.log`); omitting the digest flag from the printed
command made the test catch an unpinned manual procedure
(`/tmp/puni-07012-slice21-manual-flag-mutation.log`); removing digest-shape validation made the
malformed-flag CLI case reach the later hash comparison instead of refusing at the argument
boundary (`/tmp/puni-07012-slice21-manual-shape-mutation.log`). Adjacent `Proof:` comments are
in `migrate-down-cli.ts`, `migration-cli-options.ts` and `swap.ts`. The focused Compose/backend
CLI suite passed 50/50 tests, 359 assertions
(`/tmp/puni-07012-slice21-manual-fix-targeted.log`). Independent faults also removed the
status/legacy mode exclusions for `--capture-sha256`; the real CLIs accepted those mixed modes,
so their watched test failed (`/tmp/puni-07012-slice21-{status,legacy}-pin-mutation.log`).

The combined remote/backend/SQLite tests passed 164/164, 745 assertions
(`/tmp/puni-07012-slice21-tests-digest-final.log`). Remote lint, typecheck and build, and
backend lint and typecheck all passed (`/tmp/puni-07012-slice21-{remote,be}-*-digest-final.log`);
scoped Prettier, strict OpenSpec validation 1/1 and `git diff --check` passed
(`/tmp/puni-07012-slice21-format-digest-final.log`,
`/tmp/puni-07012-slice21-openspec-digest-final.json`). A full
`tool-remote-scripts:test` run inside the sandbox reached 366 passed, two Docker-dependent
skips and three Unix-listener `listen EPERM` failures
(`/tmp/puni-07012-slice21-remote-project-test.log`). The same final-source target was rerun
with Unix-socket access and passed 371/371, 992 assertions, with only the two documented
real-Docker tests skipped (`/tmp/puni-07012-slice21-remote-project-test-elevated.log`).
The held #259 worktree was not changed.

Astra's final follow-up independently confirmed the original tampered-capture repro now exits 1
without ledger/schema change, inspected the complete ledger/table snapshot assertions, and ran
their focused case 1/1, 14 assertions
(`/tmp/astra-07012-slice21-snapshot-followup.log`). Its combined suite had passed 164/164,
745 assertions before those four added equality assertions
(`/tmp/astra-07012-slice21-digest-followup.log`). The final local combined rerun passed
164/164, 749 assertions (`/tmp/puni-07012-slice21-tests-review-final.log`). Astra found no
remaining Critical, Important or Minor issue and cleared task 2.1 as a **local checkpoint**.
Tasks 2.2, 3.1 and 3.2 and the canonical gate remain open.
