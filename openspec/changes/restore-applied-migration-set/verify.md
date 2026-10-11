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

### Slice 2.2: Kubernetes exact-set caller (local checkpoint)

RED: `bun test tools/tool-deploy/src/k8s/execute.test.ts -t ...` observed the
older-stamp failed-health case end `rollback-failed` instead of `rolled-back`
(`/tmp/puni-07012-slice22-older-red.log`), and an interrupted legacy capture
entered the cluster/journal path instead of refusing before mutation
(`/tmp/puni-07012-slice22-legacy-red.log`). The baseline four-file Kubernetes
suite was 88/88, 355 assertions (`/tmp/puni-07012-slice22-baseline.log`).

The new journal schema 2 carries an exact-set capture with complete applied
and pending name/forward-hash/down-hash identities. Its serialized original
bytes and SHA-256 are pinned once at capture. Expected target binds the request's
cluster UID, backend namespace, fixed data PVC and database path; attempt is
the durable transaction ID, and candidate is the pinned backend image. The
coordinator and disk journal refuse legacy, missing, altered or foreign resumed captures
before Lease/cluster/journal mutation; a newly observed capture is checked before
its journal write. The backend Job writes those bytes to a
0600 `/tmp` file and invokes the digest-pinned exact-set CLI; the rendered
manual Job retains the same bytes, digest, image and identity. `rollbackSchema`
returns complete observed name/hash rows; equality refuses changed or duplicate
rows before writes reopen. Baseline name remains display-only.

The real generated `BACKEND_TASK_SCRIPT` test used disposable SQLite with a
newer pre-applied baseline and an older newly introduced candidate: migrate
applied both, then exact-set rollback restored precisely the baseline name/hash
and table. The same test executed environment values extracted from the actual
printed manual Job manifest after repeating migrate. An intact manifest
restored; changed bytes with the old pin refused, leaving the complete applied
ledger unchanged. Coordinator tests cover wrong target, attempt and candidate,
corrupted bytes, duplicate/reordered/malformed payload, missing capture,
crash/resume, and zero-exit restored-hash mismatch retaining the writer fence.

R5 watched faults were injected **independently**, each filtered production-path
test exited 1 with a named failing test, and source was restored after each
run. Raw command/output excerpts are in
`/tmp/puni-07012-slice22-mutations.log`:

| Removed or weakened guard                                        | Observed failing test/effect                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Resume preflight                                                 | Legacy capture reached rollback and rewrote the journal     |
| Capture byte/digest presence                                     | Legacy capture lost the explicit prior-executor refusal     |
| Journal schema-1 route                                           | Legacy journal lost its explicit prior-executor refusal     |
| Capture-boundary validation                                      | Foreign capture persisted/promoted                          |
| Disk journal validation                                          | Changed capture was returned as a journal record            |
| Original-byte SHA check                                          | Whitespace-altered bytes resumed into rollback              |
| Target/attempt/candidate comparison                              | Wrong target resumed into rollback                          |
| Capture format/version and forward hash shape, separately        | Unsupported/malformed payload resumed                       |
| Duplicate identity, pending order, envelope equality, separately | Corrupt captures passed preflight and reached rollback      |
| Missing capture at a captured phase                              | Migration resumed and reported rolled-back with no capture  |
| Restored full name/hash equality                                 | Changed baseline hash ended rolled-back and reopened writes |
| Exact-set backend CLI call                                       | Legacy timestamp cutoff left older candidate applied        |
| Adapter rollback/manual identity checks, separately              | Foreign capture reached kubectl or rendered manual manifest |
| Adapter caller image/attempt check                               | Wrong image/attempt reached the adapter path                |
| Manual manifest pin                                              | Rendered manifest contained an empty digest                 |
| Backend captured-byte transport                                  | Generated script could not restore the older candidate      |
| Backend required capture fields                                  | Generated script lost its exact-set input-boundary refusal  |
| Manual command configured kubeconfig                             | Executed command omitted the pinned kubeconfig argument     |
| Manual command shell quoting                                     | Executed command split a kubectl path containing spaces     |

Astra's review found that the printed manual completion command omitted an
explicit kubeconfig and did not quote shell arguments. The new production
generation/execution regression uses a fake kubectl in a directory with spaces
and an apostrophe, an explicit kubeconfig path with spaces, and a context with
spaces. RED exited 1 because Bash returned 127 for the split kubectl path
(`/tmp/puni-07012-slice22-kubeconfig-red.log`). After constructing the command
from the adapter's existing pinned argv and quoting each argument, GREEN passed
1/1 (`/tmp/puni-07012-slice22-kubeconfig-green.log`). Independently removing
the kubeconfig option and removing quoting each made that test fail, with source
restored after each fault (`/tmp/puni-07012-slice22-kubeconfig-mutations.log`).
The row parser now uses discriminator overloads rather than unchecked result
casts.

The explicit duplicate restored-row check was removed as redundant: final
full-identity array equality independently refuses extra rows, including
duplicates, and `refuses duplicate restored identities before reopening writes`
passes. The first full `tool-deploy:test` sandbox run reached 292 pass, six
local-listener failures and one listener error; with listener access the next
run exposed an accidental admission fixture version edit from this slice. That
line was restored to its original version while the journal fixture stayed at
version 2. An exact emitted-error assertion was then made robust to ANSI output
without relying on source-context text, and its guard-removal test failed again.
Final commands were `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
tool-deploy:test --skip-nx-cache` with local listener access, and `bun test
tools/tool-deploy/src/k8s/{release,execute,journal,execute-adapter}.test.ts`
(the four paths were passed explicitly). The target and scoped checks used the
same final source after independent fault restoration.
The final full target passed **301/301, 877 assertions**
(`/tmp/puni-07012-slice22-tool-deploy-test-final5.log`). The earlier four-file
focused suite passed **107/107, 438 assertions** before the added manual command
regression (`/tmp/puni-07012-slice22-focused-final3.log`).
`tool-deploy:typecheck`, `tool-deploy:lint` and `tool-deploy:build` passed
(`/tmp/puni-07012-slice22-{typecheck,lint,build}-final3.log`);
scoped source Prettier check passed (`/tmp/puni-07012-slice22-format-final3.log`),
final `verify.md` Prettier check passed after formatting, OpenSpec strict
validation passed 1/1 (`/tmp/puni-07012-slice22-openspec-final4.log`), and
`git diff --check` passed.
Astra independently reran the final four-file focused suite: **108/108, 441
assertions** (`/tmp/astra-07012-slice22-final-review.log`), inspected the
generated command and both watched fault logs, and cleared the 2.2 local
checkpoint with no remaining Critical, Important or Minor findings. No k3s live
rehearsal, canonical gate, push or #259 integration is claimed.

### Slice 3.1: disposable k3s rehearsal (local preparation; live run pending)

The added `20261001015000_lab_older_candidate` fixture is copied only into the
v2 backend candidate and sorts before the already-applied
`20261005110000_add_shared_people` baseline. The original
`29991231000000_lab_additive` fixture and its ordering test remain intact.
The lab now records the pre-upgrade complete `{name, hash}` ledger, table list,
work-item columns and project `{id, name}` sentinel rows, then compares all four
after the existing failed-health and interrupted-rollout rollbacks. A separate
final-scenario image adds `29991231010000_lab_rollback_failure`: its unchanged
down script fails a CHECK while the control row is blocked. The final lab
scenario requires `rollback-failed`, a closed writer fence, backend replicas
zero, no active writer, the parked held Lease and retained journal, then runs
one admitted control-row repair Job and the exact printed manual schema command.
Its post-manual inspection Job compares full baseline evidence while the
backend stays stopped and the writer fence/Lease remain held.

The older-fixture file test was RED because its folder was absent
(`/tmp/puni-07012-slice31-fixture-red.log`) and GREEN 3/3 after the fixture and
Dockerfile COPY (`/tmp/puni-07012-slice31-fixture-green.log`). The schema
comparison test was RED when a changed baseline hash was accepted
(`/tmp/puni-07012-slice31-schema-red.log`); the sentinel test was separately RED
when a missing project row was accepted
(`/tmp/puni-07012-slice31-sentinel-red.log`). The generated backend-script test
was RED with the absent fault fixture (`/tmp/puni-07012-slice31-down-red.log`).
After the stable SQL guard and Drizzle statement breakpoints were added, the
real-script/SQLite test proved failed down kept the full ledger and control
table, then control-row repair and the **same captured bytes/digest** restored
the baseline (`/tmp/puni-07012-slice31-down-green.log`).

Five independent R5 faults—bypassing full ledger/hash, table, column or
project-row comparison, and removing the down CHECK—each failed a named watched
test; source was restored after each (`/tmp/puni-07012-slice31-mutations.log`).
Astra then found the inherited writer observer swallowed a failed kubectl read
and could report max=0 with no samples. A production watcher test was RED on
that behavior (`/tmp/puni-07012-slice31-observer-red.log`). The watcher now
preserves the original read error and refuses zero samples. After one real
successful sample, the watched second read failed; removing only error
propagation made the test falsely resolve with samples=1. Separately removing
the zero-sample guard made its watched test accept zero samples. Both failures
and source restoration are recorded in
`/tmp/puni-07012-slice31-observer-mutations.log`.

Local `tool-deploy:test` passed **308/308, 900 assertions**
(`/tmp/puni-07012-slice31-test-final-local.log`), and the focused lab/adapter
suite passed **27/27, 88 assertions**
(`/tmp/puni-07012-slice31-focused-final2.log`). The final typecheck, lint,
build, scoped Prettier and strict OpenSpec checks passed
(`/tmp/puni-07012-slice31-{type-final2,lint-final-local,build-final-local,format-final-local,openspec-final-local}.log`);
`git diff --check` passed. Astra independently reran the focused suite 27/27,
88 assertions (`/tmp/astra-07012-slice31-final-review.log`) and cleared the
pre-live code checkpoint with no remaining findings. The live
`tool-deploy:test:k3s` remained pending after these local checks. Task 3.1
remains unchecked and **no live cluster result is claimed**.

The pre-live code checkpoint is `fd7a1c92167187762366636eabf5c3188ce3bdd1`
on `feat/restore-applied-migration-set`; the worktree was clean. The branch
push was rejected twice by automatic approval review because `origin` is a
**public** repository and the review did not accept broad project push
authorization as permission to disclose this payload. No alternate code
transfer was attempted. As a local alternative, pinned k3d v5.9.0 and kubectl
v1.36.4 were downloaded to `/tmp` and verified against the SHA-256 values in
`infra/versions/toolchain.json`; local Docker 29.7.2 was reachable, and pre-run
inventory found no named F8 container, network or cluster. However, the
required `bin/with-heavy-lock.sh -- bunx nx run tool-deploy:test:k3s ...`
refused **before the lab started**, exit 70:
`heavy lock: /home/puni1/.cache does not exist`
(`/tmp/puni-07012-slice31-local-k3s.log`). This `pop-os` checkout has no
`/home/puni1`; the wrapper's canonical path cannot be overridden for a
production run. A post-attempt inventory again found no named F8 resources.
The live rehearsal and its R5 mutation remain **unverified**; task 3.1 is open.

## Candidate capability planning amendment — implementation pending

Planning baseline: `137d627577b3caf3e64990d9684c7b15b7ea372b`, isolated branch
`plan/migration-capability-handshake`. Sol's uncommitted adoption documentation and compatibility
test remain in the implementation worktree and are not changed by this planning amendment.

The offline compatibility test observed the actual generated `BACKEND_TASK_SCRIPT` accept an
old `--to`-only candidate and create `snapshots/tx.sqlite`, while its test expected a capability
refusal (`/tmp/puni-07012-slice32-old-candidate-red.log`, one failing test). The pre-change backend
at `eaaa14b28664986e4ab84ddc2710c01615abcdc2` requires `--to` in `migrate-down-cli.ts`; its status
CLI emits the newest name and does not implement structured capture. Source inspection confirms
the current Kubernetes capture script reads SQLite/folders directly, so that Job alone does not
establish the incoming image's exact-set rollback capability.

The PM authorized the bounded planning amendment: a DB-free strict versioned capability CLI,
validated by Kubernetes before SQLite/snapshot, with both `capture-v1` and `restore-v1-sha256`
required. Delta scenarios, design, ADR 0036, ordered offline tasks 3.2a/3.2b and the verification
matrix describe the implementation and watched refusal proofs. There are no source changes,
new database migrations, journal/capture version changes, or new host actions in this amendment.

The observed RED is not a completed fix. Tasks 3.2a/3.2b, live 3.1 and final 3.2 remain open.
The candidate must become available on h2puni through a permitted path before the heavy-locked
rehearsal route can execute there. Rehearsal and the final gate must use the implementation
revision containing this amendment's eventual code, not the earlier pre-live fixture revision.

Planning checks on this amendment:

- `openspec validate restore-applied-migration-set --strict --json`: 1/1 passed.
- `openspec validate --all --json`: 147/147 passed.
- `openspec validate --all --strict --json`: 141/147 passed; all 129 changes passed.
  Six unchanged canonical specs (`dev-deploy`, `live-plan-snapshot`, `plan-command-registry`,
  `plan-import`, `saved-plans`, `scheduler-optimization`) retain placeholder Purpose warnings
  promoted to failures by strict mode. No canonical spec differs from the planning baseline.
- Scoped Prettier and `git diff --check`: passed. Intent: 314 words.
- Logs: `/tmp/puni-07012-capability-plan-targeted.json`,
  `/tmp/puni-07012-capability-plan-all.json`,
  `/tmp/puni-07012-capability-plan-all-strict.json`.

No implementation tests, live rehearsal, full gate or deployment were run for this docs-only
amendment. Those remain implementation verification obligations above.

## Offline capability handshake — slices 3.2a and 3.2b

Implementation is in the isolated `feat/migration-capability-handshake` worktree from planning
commit `c0dded1c9670d352403e4ad533950d4c1ffb97a7`. The prior uncommitted documentation and
compatibility draft in `feat/restore-applied-migration-set` was preserved separately. No image
publication, live k3s rehearsal, canonical h2puni gate or push is claimed here.

The observed old-candidate RED was retained in the new generated-script adapter suite. Before
the preflight, an old `--to`-only candidate exited capture successfully and created
`snapshots/tx.sqlite`; the test failed because it expected a capability refusal
(`/tmp/puni-07012-slice32b-red.log`). Three backend contract tests were RED before the new CLI:
all failed against the missing executable (`bun test apps/wbs/be-01/src/migration-cli.db.test.ts
--test-name-pattern 'advertises exact-set capabilities|refuses unexpected capability
arguments|backs its advertised exact-set protocol'`, 0 pass, 3 fail;
`/tmp/puni-07012-slice32a-red.log`). The DB-free `migrate-capabilities-cli.ts` now emits exactly
the version-1 protocol and both required operations with no database path or migration directory;
it rejects arguments.
The contract test runs
the real status and down CLIs against disposable SQLite with a newer applied baseline and two
older pending migrations. It observes refusal of altered capture bytes under the original
SHA-256 pin with unchanged complete ledger and schema, then restores with those original bytes,
confirms the baseline name/hash ledger and schema, and retains a baseline sentinel row.

The generated Kubernetes capture script executes the candidate CLI before its database
existence check, SQLite open, folder observation or snapshot. It refuses an absent or unreadable
executable, nonzero exit, malformed/extra/legacy stdout, wrong protocol/version, extra fields,
duplicate/unknown/missing capabilities and wrong response shape. Tests use an absent database
to establish ordering and assert neither database nor snapshot was created. Reversed order of
the two valid capabilities succeeds. A coordinator failure case confirms no `state-captured`
journal promotion or migration launch and that normal rollback restores writer/Lease state.
After the missing/unreadable distinction was tightened to check `Module not found` versus
`EACCES`, the focused backend/adapter/coordinator suite passed **132/132, 791 assertions** after
the older-candidate and coordinator proof alignment (`/tmp/puni-07012-slice32-review-focused.log`).

Each R5 mutation below was applied separately to the production path with
`python3 /tmp/puni-07012-capability-faults.py` or the equivalent independent source
substitution, its named test watched fail, then the source restored. Tests match the actual Bun
`error:` line; an initial loose substring assertion could match Bun's source-code frame even when the wrong database error was
thrown, so that assertion was strengthened before counting these proofs.

| Injected fault                                      | Observed named-test failure                                          | Log                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Make capability CLI depend on `DB_PATH`             | DB-free CLI expected exit 0, got 1                                   | `/tmp/puni-07012-slice32-fault-db-dependency.log`            |
| Make capability CLI depend on `./drizzle`           | Migration-free CLI expected exit 0, got 1                            | `/tmp/puni-07012-slice32-fault-migration-dir-dependency.log` |
| Accept unexpected capability CLI argument           | Refusal expected nonzero, got exit 0                                 | `/tmp/puni-07012-slice32-fault-arg-refusal.log`              |
| Disable actual down-CLI digest comparison           | Altered-byte refusal expected nonzero, got exit 0                    | `/tmp/puni-07012-slice32-fault-digest-truth.log`             |
| Reintroduce timestamp cutoff in exact-set capture   | Advertised-protocol test omitted both older pending migrations       | `/tmp/puni-07012-slice32-fault-older-selection.log`          |
| Skip candidate capability invocation                | Old candidate expected probe refusal, reached snapshot capture       | `/tmp/puni-07012-slice32-fault-probe-invocation.log`         |
| Move probe after SQLite snapshot                    | Old candidate was refused only after its snapshot existed            | `/tmp/puni-07012-slice32-fault-preflight-order.log`          |
| Ignore a nonzero capability process                 | Failed executable reported malformed output instead of probe failure | `/tmp/puni-07012-slice32-fault-probe-exit.log`               |
| Replace malformed output with a successful response | Malformed-output case reached absent database                        | `/tmp/puni-07012-slice32-fault-response-parse.log`           |
| Ignore unknown response fields                      | Unknown-field case reached absent database                           | `/tmp/puni-07012-slice32-fault-response-keys.log`            |
| Ignore wrong protocol                               | Wrong-protocol case reached absent database                          | `/tmp/puni-07012-slice32-fault-protocol-validation.log`      |
| Ignore wrong version                                | Wrong-version case reached absent database                           | `/tmp/puni-07012-slice32-fault-version-validation.log`       |
| Ignore capability count/duplicates                  | Duplicate-capability case reached absent database                    | `/tmp/puni-07012-slice32-fault-response-count.log`           |
| Ignore required capture operation                   | Partial candidate reached absent database                            | `/tmp/puni-07012-slice32-fault-capture-capability.log`       |
| Ignore required digest-pinned restore operation     | Partial candidate reached absent database                            | `/tmp/puni-07012-slice32-fault-restore-capability.log`       |
| Fabricate capture after capability Job rejection    | Journal recorded `state-captured`; one migration Job ran             | `/tmp/puni-07012-slice32-fault-coordinator-admission.log`    |

Adjacent `Proof:` comments describe the faults in the CLI and generated script. The capture
and journal format did not change. Live 3.1 and final 3.2 remain open; the offline handshake
does not unblock PR #259 or establish an image/gate result.

The final full `tool-deploy:test` rerun passed **325/325, 957 assertions** with local listener
access (`/tmp/puni-07012-slice32-review-deploy-test.log`). The first sandboxed run was not accepted:
it had 21 assertion failures/one error, including `Bun.serve` `EPERM` at local listener fixtures
and ANSI-colored error lines that the new tests now normalize. The full `wbs-be-01:test`
coverage target passed **1698/1699 with one existing skip, 42420 assertions** on the corrected
fixture with local socket/Docker access (`/tmp/puni-07012-slice32-review-be-test.log`). Its first
sandboxed run had 1661 pass, one skip and 37 infrastructure failures from `EPERM` listeners and
Docker daemon denial (`/tmp/puni-07012-slice32-be-test.log`); those failures were not counted as
passing evidence. `wbs-be-01:build` passed (`/tmp/puni-07012-slice32-review-be-build.log`). The
`tool-deploy:build` target itself passed with `--excludeTaskDependencies`
(`/tmp/puni-07012-slice32-review-deploy-build-direct.log`); its normal dependency-expanded invocation
remains unverified locally because Nx reported a recursive `tool-test-scratch:build` task
(`/tmp/puni-07012-slice32-deploy-build-final.log`). Direct `tool-test-scratch:build` also refused
as self-recursive before executing its command (`/tmp/puni-07012-slice32-scratch-build.log`),
while the exported project graph listed no dependencies for that project. All three affected
project lint and typecheck targets passed (`/tmp/puni-07012-slice32-review-{be,store,deploy}-{lint,type}.log`).
The store adapter has no build target; `nx run wbs-store-sqlite:build` reported no configuration.
Scoped Prettier, `git diff --check` and strict change validation passed
(`/tmp/puni-07012-slice32-review-openspec.json`). The authoritative full h2puni gate and live k3s
rehearsal remain unrun.

Independent architecture review of the corrected 3.2a/3.2b boundary found no remaining
behavior or test gap. Its focused combined run passed 132/132 tests and 791 assertions.
The capture-state `Proof:` comment was corrected to name the observed forward migration
launch. After that comment-only edit, scoped Prettier, ESLint, and `git diff --check`
each exited 0. Only 3.2a and 3.2b are checkpointed; the live 3.1 rehearsal and final
3.2 gate remain open.

## Canonical workstream consolidation and fresh offline verification

On 2026-10-06, `feat/restore-applied-migration-set` was fast-forwarded from
`c0dded1c9670d352403e4ad533950d4c1ffb97a7` to
`6007fcb2d4ab6003e74aa961fda8b374e33f2644`. The capability commit implements this
same change's 3.2a/3.2b, not a separate OpenSpec objective. The four previous
adoption drafts were preserved in the named Git stash
`070.12 preserved adoption drafts before capability fast-forward`, with exact file
copies under `/tmp/puni-07012-preserved-drafts` and a binary patch at
`/tmp/puni-07012-preserved-drafts.patch`. Their runbook and compatibility material
is incorporated in the reviewed capability commit; the duplicate old-candidate
case was reconciled into its existing legacy-candidate test. Its unique assertion
now requires the entire snapshot directory to remain absent. Injecting directory
creation before the production capability probe made that assertion fail
(`Expected: false`, `Received: true`,
`/tmp/puni-07012-reconcile-snapshot-red.log`); the source was restored before GREEN.
No capability behavior changed during reconciliation. The restored full adapter
suite passed 35/35, 114 assertions
(`/tmp/puni-07012-reconcile-adapter-green.log`); scoped ESLint passed
(`/tmp/puni-07012-reconcile-eslint.log`). Canonical strict/all OpenSpec passed
1/1 and 147/147 (`/tmp/puni-07012-canonical-{strict,all}.json`).

Fresh checks on `6007fcb2d` passed: real backend CLI/generated-script/coordinator
132/132, 791 assertions (`/tmp/puni-07012-resume-focused.log`); SQLite rollback and
Compose swap 111/111, 376 assertions (`/tmp/puni-07012-resume-store-swap.log`);
affected `wbs-be-01`, `wbs-store-sqlite`, and `tool-deploy` lint/typecheck, seven
executed tasks (`/tmp/puni-07012-resume-lint-type-unsandboxed.log`); backend build
plus its dependency (`/tmp/puni-07012-resume-be-build.log`); and normal deployment
build with all five dependencies (`/tmp/puni-07012-resume-deploy-build-unsandboxed.log`).
The earlier dependency-expanded build uncertainty no longer reproduced. The first
sandboxed Nx lint/typecheck and deployment build attempts exited zero with only
socket `EPERM` diagnostics and no executed targets; neither is accepted as passing
check evidence (`/tmp/puni-07012-resume-{lint-type,deploy-build}.log`).
Scoped Prettier, strict OpenSpec 1/1, all OpenSpec 147/147 and diff checks also passed
on that implementation revision (`/tmp/puni-07012-resume-{strict,all}.json`).

The local consolidation does not satisfy live 3.1 or final 3.2. Both remain open.
The integrated candidate must reach h2puni through an explicitly permitted path
before the canonical heavy-locked k3s rehearsal and exact-SHA gate can run; local
host `/home/puni1/.cache` remains unavailable. No push, image publication, live
rehearsal, canonical gate, CI or adoption is claimed by this checkpoint.

Astra independently cleared the exact three-file reconciliation diff against
`6007fcb2d` with no findings. Its full adapter run with the scratch preload passed
35/35, 114 assertions, exit 0 (`/tmp/puni-07012-astra-reconciliation.log`), and
`git diff --check` passed. The watched early-directory RED and adjacent production
`Proof:` comment agree; no runtime behavior changed.

## Batch 10: live 3.1 rehearsal and 3.2 offline checks (2026-10-11)

Branch `batch-10/070-12-restore-applied-migration-set` started at `a12bf6721` and merged
`origin/main` (`a3b1526bd`) without conflicts as `73c6b3f51`. ADR 0036 is taken on main
(`0036-private-companions-are-nested-ignored-clones.md`), so this change's ADR is now
[0041](../../../docs/adr/0041-deployment-rollback-restores-a-captured-migration-set.md)
(`d4ac418c1`, which also updates the status/down CLI headers to the exact-set interface).
No product migration is added; the lab fixtures `20261001015000_lab_older_candidate` and
`29991231010000_lab_rollback_failure` sort where the scenarios need them and ship `down.sql`.

Focused suites after the merge, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`: backend CLI
plus SQLite rollback 65/65 (500 assertions); Compose swap 100/100 (266); tool-deploy
release/execute/journal/execute-adapter/lab-migration 134/134 (524). The same counts held
on `d4ac418c1`.

### 3.1 live rehearsal on a disposable k3d cluster

Host `pop-os` (workstation, Docker 29.7.2), locked k3d v5.9.0 and kubectl v1.36.4 verified
against `infra/versions/toolchain.json` SHA-256. `bin/with-heavy-lock.sh` cannot run here:
`HEAVY_LOCK_WAIT_SECONDS=0 bin/with-heavy-lock.sh -- true` printed
`heavy lock: /home/puni1/.cache does not exist`, exit 70, because the Linux lock path is
h2puni's. The lab therefore ran unwrapped, as `docs/infra/deployment.md` documents and the
`infra-check` CI job runs it, after confirming no `puni-f8-*` cluster, container or network
existed.

`K3D=… KUBECTL=… bunx nx run tool-deploy:test:k3s --skip-nx-cache` on source `73c6b3f51`:
**exit 0, 66 assertions, `all lab assertions passed`**, 16m16s. Backend images: v2
`sha256:1818f476b0c6…0767`, v3 `sha256:dfb9dadc2e3e…5abd`. Release ids
`73c6b3f5164a-cf14efab79fe` (failed health), `-995b808dade5` (SIGKILL then resume),
`-837170bf6e47` (additive promote), `-df27b54bdf99` (failed down). Observed:

- Before upgrade the newer `20261005110000_add_shared_people` baseline is applied and the
  older candidate absent; capture recorded pending
  `[20261001015000_lab_older_candidate, 29991231000000_lab_additive]`.
- Scenarios 1 and 2 ended `rolled-back` with the complete name/hash ledger, table set,
  work-item columns and project sentinel rows equal to the pre-upgrade evidence, writes
  reopened, Lease released, at most one writer (270 and 114 samples).
- Scenario 3 applied the older candidate table and identity and promoted.
- Scenario 5: the blocked down SQL ended `rollback-failed`; writes remained fenced, no
  active writer, the held Lease parked, and the exact retained manual command printed
  (`migrate-down-cli.ts --capture-file=… --capture-sha256=b96e1f71… --attempt=73c6b3f5164a-df27b54bdf99-151d40 …`).
  After the admitted unblock Job, that command restored the complete ledger, tables, columns
  and sentinel rows without reopening writes or releasing the Lease (232 writer samples).
- Cleanup: afterwards `k3d cluster list` was empty and no `f8` container or network remained.

Live R5 fault, source `d4ac418c1` plus one line in `failStep` mapping a failed
`rollback-schema` to `rollback-schema-restored`: the lab exited 1 with
`ASSERTION FAILED: the blocked down SQL ended rollback-failed`; cluster, containers and
network were again absent and the source was restored. The adjacent `Proof:` comment is on
`failStep` in `release.ts`. Logs are retained in the private plan repository under
`batch-10/lanes/migration-set-070-12.k3s-{run1,fault-reopen}.log`.

### 3.2 R5 fault table re-run on `d4ac418c1`

Each fault was injected alone in a separate worktree, its production-path suite run, and
the file restored (final `git status` clean). Every fault failed its suite (exit 1):

| Fault                         | Injected change                                     | Observed failing test (suite)                                                                                  |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| F01 exact selection           | timestamp cutoff in capture's pending filter        | `restores an older newly introduced migration after a newer shared-people baseline` (CLI, 2 fail)              |
| F02 baseline preservation     | captured applied rows added to `doomed`             | `preserves an older migration already captured…` and 5 more (CLI)                                              |
| F03 duplicate identities      | duplicate-name refusal removed                      | `refuses duplicate migration identity before reversing an addition` (CLI)                                      |
| F04 capture ownership         | target/attempt/candidate comparison disabled        | three `refuses a capture belonging to another …` (CLI)                                                         |
| F05 ledger identity           | observed-row membership/hash check disabled         | `refuses an unexpected applied migration…`, `refuses a changed pending ledger identity…` (CLI)                 |
| F06 script identity           | down-hash comparison disabled                       | `refuses changed down.sql bytes before reversing either candidate` (CLI)                                       |
| F07 per-migration transaction | COMMIT after each down statement                    | `rolls back a failed down statement and its ledger deletion…` (CLI)                                            |
| F08 convergence               | absent pending row treated as applied               | `resumes exact restoration after one down script…`, `restores a partial forward application…` and 2 more (CLI) |
| F09 durable capture           | readback byte equality disabled                     | `refuses migration when the persisted capture cannot be read back unchanged` (swap)                            |
| F10a final equality, Compose  | restored-set comparison replaced by `false`         | `does not accept a zero-exit down command that leaves the candidate recorded` (swap)                           |
| F10b final equality, k8s      | restored identity comparison disabled               | `refuses changed restored hash…`, `refuses duplicate restored identities…` (deploy)                            |
| F11 transport                 | `PUNI_CAPTURE_BYTES` replaced by `{}`               | `reverses an older candidate migration after a newer baseline using the generated script` and 2 more (deploy)  |
| F12 legacy compatibility      | schemaVersion 1 route disabled                      | `refuses a legacy in-flight journal without replacing its bytes` (deploy)                                      |
| F13 manual recovery           | `--capture-sha256` dropped from the printed command | `manual recovery refuses a tampered retained capture before deleting the baseline` (swap)                      |
| C01 DB-free advertisement     | capability CLI requires `DB_PATH`                   | `advertises exact-set capabilities without a database or DB_PATH` (CLI)                                        |
| C02 capability invocation     | spawn replaced by a fabricated success              | `refuses a legacy --to-only candidate before taking a capture snapshot` and 14 more (deploy)                   |
| C03 nonzero exit              | exit-code check disabled                            | `refuses nonzero exit before opening SQLite or creating a snapshot` and 3 more (deploy)                        |
| C04 response shape            | exact-key check removed                             | `refuses unknown field before opening SQLite…` (deploy)                                                        |
| C05 required capability       | `restore-v1-sha256` requirement removed             | `refuses unknown capability before opening SQLite…` (deploy)                                                   |
| C06 coordinator admission     | capture-boundary validation removed                 | `refuses a foreign capture before journal persistence` (deploy)                                                |
| C07 advertisement truth       | capture digest verification disabled                | `backs its advertised exact-set protocol with the real capture and digest-pinned down CLIs` (CLI)              |

Restored positives on the same tree: 65/65, 100/100 and 134/134 as above. The capability
ordering fault (probe after VACUUM) was not re-injected; its earlier observation stands.

`bunx @fission-ai/openspec@1.12.0 validate --all --json`: 159/159 passed (141 changes,
18 specs). Scoped Prettier on touched files passed. `nx run-many -t lint:fast typecheck test
build` for `wbs-be-01`, `wbs-store-sqlite`, `tool-deploy` and `tool-remote-scripts` exited 1
under host load average 20–27: lint, typecheck and build passed; three
`assertTierEnvComplete against the release configuration` cases (tool-remote-scripts) and
`a committed revocation refuses the old browser pair…` (be-01) hit the 10 s test timeout.
Each file rerun alone passed (99/99 and
8/8 twice). At load average 6–11 the rerun
`nx run-many -t test -p tool-remote-scripts wbs-be-01 tool-deploy wbs-store-sqlite --skip-nx-cache`
exited 0: 325, 373, 1288 and 1918 tests, 0 fail.

The exact-SHA `bin/h2puni-gate.sh` run and CI remain open, so 3.2 stays unchecked.

### CI follow-up on PR #306

The first CI run on `b977f4f10` failed in three places. The `k3s-rehearsal` job passed.

- `gate tool wiki`: Burokrat's pilot lint refused
  `deploy/k8s/wbs/lab/fault-migrations/…/down.sql matched 0 classification rules`, because migrations
  are classified by a `migrations` path segment. The fixture moved to
  `deploy/k8s/wbs/lab/rollback-fault/migrations/` (`fb548469e`).
- `gate workspace`: `tool-devsync` pins the legacy-source Dockerfile coverage list, and
  `backend-rollback-fault.Dockerfile` was missing from it. It is now pinned and the counts are unchanged.
- The CI `Migration lint` command then refused the moved fixture with
  `does not own migration deploy/k8s/wbs/lab/rollback-fault/migrations/29991231010000_lab_rollback_failure/down.sql`,
  exit 1. That was observed locally with the root absent. `MIGRATION_ROOTS` now includes that exact root.
  - The new test `lints the rollback-fault lab migration under its own root only` was RED first.
  - Widening the root to `lab/rollback-fault` made it accept a sibling `fixtures` migration and fail.
  - After restoring, `tool-git-hooks:test` passed and the exact CI command
    (`bun run tools/tool-git-hooks/src/hooks/migration-lint.ts $(git ls-files '*.sql')`) exited 0.

The live lab run above used the `fault-migrations` path. The rename only changes the Dockerfile
`COPY` source, and lab-migration/execute-adapter passed 43/43 after it. CI `k3s-rehearsal`
reruns the lab on the new SHA.
