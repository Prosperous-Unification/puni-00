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
