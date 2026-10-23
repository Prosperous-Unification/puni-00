# Atomic dependency activation storage primitive

2026-10-23; isolated clone based on `9f257ca84ccbf4195f8127d0259c05d8a872bcab`.

`activateDependencies` owns an existing-only SQLite connection and `BEGIN IMMEDIATE`.
It checks the complete applied migration name/hash set against the owner-supplied
pinned candidate artifact, requires external-dependency migration identity, and
strictly inspects current constrained authority. It inserts the exact receipt and
flips ENABLED in one transaction, then independently re-queries trusted authority
and compares the exact decoded receipt before commit. Exact retries return current
authority; conflicting attribution throws. No writable CLI, dispatcher or live
database invocation was added.

The deployment owner still needs actual complete continuous participant fencing,
durable activation intent and an independent committed readback. This primitive
establishes none of those prerequisites and grants no activation permission.

## Verification

- Initial test-first run: missing `activateDependencies` export failed collection;
  implementation then passed the migrated-SQLite behavior cases.
- `bun test libs/wbs/adapters/store-sqlite/src/dependency-activation-write.db.test.ts libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts`:
  116 passed, zero failed, 235 assertions (25 new primitive cases). Cases include receipt-insert and marker-flip
  errors, rewritten receipt and ignored marker update, exact retries with an empty
  edge table, conflicting receipts, malformed enabled receipts, absent/unreadable/
  malformed database, missing/replaced authority tables, missing triggers and
  missing/edited/duplicate/unknown migration identities. The external identity
  negative removes it from both a real copied migration artifact and the ledger.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck --skip-nx-cache`:
  passed. The daemon-disabled rerun avoids restricted socket creation.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint --skip-nx-cache`:
  passed; final touched-file ESLint also passed after import sorting.
- `bunx openspec validate --all --json`: 275 passed, zero failed; existing warnings
  remain in unrelated changes.
- `bunx prettier --write` over the three touched files and `git diff --check` passed.
  Ordinary installed Lefthook checks run during the storage commit.

## R5 fault proofs

Each unsafe mutation was applied to the production primitive, exercised through
the migrated-SQLite test file, observed to fail with exit 1, then restored:

| Removed or broken protection           | Observed negative                                                         |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Complete migration identity refusal    | Edited, missing, duplicate and unknown ledger state was admitted          |
| Required external migration membership | Matching omission from artifact and ledger was admitted                   |
| Enabled exact-receipt equality         | Conflicting activation ID was admitted                                    |
| Persisted receipt equality             | An AFTER INSERT trigger rewrote the activation ID and the write committed |
| Transaction controls together          | Injected marker-flip failure left the inserted receipt behind             |
| Existing-only connection               | An absent database file was created                                       |

Deleting only explicit ROLLBACK did not survive connection closure as an unsafe
change: closing the owned connection still rolled the transaction back. Removing
only initial inspection was also caught by strict final inspection. These controls
are redundant; the table records the mutations that actually violate the promised
persisted behavior. Existing inspector schema/trigger/marker proofs remain beside
their checks and in the authority regression suite.

No full host gate, deployment, activation CLI or live database operation was run.
This isolated primitive does not claim the parent deployment change is complete.
