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
`Map.set` accepts the last conflicting value. Slice 1.2 integrity proofs and
the full gate remain pending.

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
