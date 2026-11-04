# PostgreSQL identity bucket and transaction-lock follow-up

Research date: 2026-11-04. Scope: read-only primary-source research for a candidate disposable experiment; no database experiments were run by this researcher. This does not select an engine, provider implementation, private schema/store format, public ID hash rule, output profile or ACP profile. The earlier P10 client-close-versus-backend-absence failures remain unresolved.

## Conclusion

**Conditional yes:** a fixed-size, nonunique digest bucket index plus separately retained full reversible identity bytes can support insert-or-identical with an exclusive transaction advisory lock, provided every competing writer uses the same lock protocol and the full-byte lookup is a **separate SQL statement executed after lock acquisition completes**, in the same explicit **READ COMMITTED** transaction. This is a reasoning conclusion from PostgreSQL's statement snapshots and transaction-owned advisory locks, not adapter conformance evidence. [Transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [advisory lock functions](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

Prefer one lock per physical store for the initial narrow experiment: it makes the concurrency argument simpler. Per-bucket locks need a complete account of every identity uniqueness domain, related row/revision/counter updates and multi-lock ordering before they are equivalent. Neither choice has been adopted here.

## Repository premise checked

Read the managed source checkout at `/home/df/.codex/worktrees/ac2c/puni-00`; `git rev-parse HEAD` returned `9917286d18ae327182558f9eec17463fe01339ac`. At that revision:

- `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-codecs.ts` defines `identity = type('string > 0')`; `scopeCodec` and `intentCodec` impose no additional identity length bound. `runtimeScopeKey` serializes the ordered organization/project/person array with `JSON.stringify`.
- `runs/sqlite/runtime-store.ts` writes the scope key and `CURRENT_FORMAT.encode(commandId)` alongside serialized records. The `0002-runtime-authority` and current-family `0005-identity-keys` migrations use full scope/command keys in primary, unique and foreign keys. Runtime `command_id` uniqueness is store-wide, not merely scope-local.

These are source observations, not fresh execution of those codecs or migrations. This research does not change that contract or re-evaluate generic JSONB/BYTEA/SDK feasibility.

## Index and equality implications

PostgreSQL documents a B-tree entry ceiling of approximately one-third of a page after any applicable compression. Exact `REL_18_6` source `_bt_check_third_page` rejects oversized entries; its comment explains why out-of-line storage cannot simply solve the index problem. Consequently SQLite's full-key indexes cannot be copied as an unrestricted PostgreSQL B-tree solution. A highly compressible long fixture alone is an inadequate rejection probe. [PostgreSQL 18 B-trees](https://www.postgresql.org/docs/18/btree.html), [18.6 nbtutils.c](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/backend/access/nbtree/nbtutils.c).

The candidate must allow several distinct full keys in one digest bucket. A unique digest index, or treating digest conflict as identity conflict, would incorrectly reject a real collision. Conversely, adding the full unbounded key to an indexed key or included payload reintroduces index-size exposure. `ON CONFLICT` relies on its unique/exclusion arbiters; it cannot derive collision-safe identity from a nonunique bucket alone. [INSERT conflict arbitration](https://www.postgresql.org/docs/18/sql-insert.html).

Retained bytes must remain the equality authority: find the bucket, compare the entire serialized identity, then compare the existing immutable content required by insert-or-identical. Exact 18.6 `byteaeq` compares lengths then `memcmp` of complete detoasted bytes. This supports byte equality as a candidate mechanism without selecting a private column layout. Preserve the serialized bytes rather than parsing and reserializing them before comparison. [18.6 varlena.c, byteaeq](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/backend/utils/adt/varlena.c).

Derived design obligations: equal identity bytes must always select the same bucket and lock; collisions may create extra contention but must not merge identities. A digest implementation/version mismatch or corrupt stored bucket can create false absence, so the eventual adapter must detect inconsistent trusted state. A lookup returning multiple complete-key matches must fail as corruption rather than silently choosing one. No finite database representation establishes support for mathematically unbounded inputs; the experiment should establish removal of the B-tree-specific limit for tested sizes and retain honest resource-failure boundaries.

## Safe ordering and why it works

Conceptual sequence, without adopting SQL schema:

1. Begin an explicit transaction with isolation explicitly set to READ COMMITTED.
2. Await an exclusive `pg_advisory_xact_lock` using the agreed store or bucket lock identity.
3. Issue and await a separate bucket/full-byte lookup statement.
4. If absent, insert; if exactly one identity match, apply full insert-or-identical content comparison; if conflicting content or corrupt multiplicity, report the modeled failure.
5. Commit all related writes together before reporting committed success.

Inference: writer B waits while writer A owns the lock. If A commits, B's subsequent lookup receives a newer statement snapshot and sees A's row; if A aborts, B sees no committed A row and may insert. A colliding but different identity follows the same serial order but does not compare equal. This argument assumes all relevant mutation paths participate and continue holding the lock through the decision and writes. PostgreSQL describes fresh READ COMMITTED snapshots per command. [Transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html).

### Snapshot traps

- **One statement is unsafe for this argument.** A CTE, subquery or expression that acquires the lock and then looks up the key still uses the outer query's previously established snapshot. Even forcing lock evaluation first does not refresh visibility after waiting. In exact 18.6 `PortalStart`, the snapshot is installed before executor startup. [18.6 pquery.c](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/backend/tcop/pquery.c).
- **REPEATABLE READ is unsafe for this argument even with separate statements.** The lock `SELECT` can itself establish the transaction snapshot before it waits. Later lookups retain that snapshot and can miss A's subsequent commit. Exact 18.6 `GetTransactionSnapshot` returns retained `CurrentSnapshot` in transaction-snapshot mode; READ COMMITTED instead calls `GetSnapshotData` again. SERIALIZABLE requires its own complete retry proof; changing isolation is not a substitute for this protocol's ordering proof. [18.6 snapmgr.c](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/backend/utils/time/snapmgr.c).
- Acquiring a transaction lock in autocommit and then issuing the lookup starts a different transaction after the lock has already been released. A pool-wide client used for one of these steps can similarly place it on a different backend. These are protocol failures, not repaired by correct identity hashing. [Advisory lock lifetime](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

## Lock scope and failure boundaries

Advisory locks are cooperative: PostgreSQL does not force arbitrary inserts to take them. Transaction locks release at transaction end; session locks have different rollback semantics and must not be accidentally substituted. Multiple locks need consistent ordering; PostgreSQL can abort deadlock participants. Locks consume finite shared memory. These properties require modeled timeout/deadlock/error handling, not catch-and-continue. [Explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS).

Exact 18.6 source includes `MyDatabaseId` in the lock tag, distinguishes the one-int64 and two-int32 lock spaces, and implements exclusive xact locking using `LockAcquire(..., ExclusiveLock, false, false)`. Thus all clients must agree on database, overload, signed key mapping and physical-store namespace. Different aliases for the same store must not choose different locks. Truncated lock-key collisions cause extra serialization if mapping is deterministic; they do not by themselves corrupt equality. [18.6 lockfuncs.c](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/backend/utils/adt/lockfuncs.c).

Current store-wide command uniqueness means locking `(scope, command)` alone is insufficient across scopes. Bucket locking also does not automatically protect a scope revision or shared count touched by different command buckets; those require the same broader lock or separately proven concurrent update rules. Per-store locking avoids this particular omission at a concurrency cost.

Exact 18.6 lock ownership uses `CurrentResourceOwner` for transaction locks; owner cleanup releases owned locks. Savepoint recovery can therefore undo a lock acquired inside the aborted subtransaction. Keep the critical section outside recover-and-continue savepoint code, or reacquire and redo the lookup after recovery; do not assume a pre-rollback lookup remains protected. [18.6 lock.c, LockAcquireExtended and LockReleaseCurrentOwner](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/backend/storage/lmgr/lock.c).

Server-observed normal/abnormal termination rolls back an open transaction. A client disconnect can occur before the backend notices it, however; PostgreSQL warns a running statement may finish first. A lost COMMIT response is a separate ambiguous outcome and cannot be classified as rollback by client error alone. [Protocol termination](https://www.postgresql.org/docs/18/protocol-flow.html#PROTOCOL-FLOW-TERMINATION).

With `client_connection_check_interval = 0`, detection normally waits for the next socket interaction; TCP failure detection can need keepalive configuration. Therefore a resolved Bun close promise is insufficient evidence that the backend and its locks are absent. Server observation and bounded convergence remain necessary for that claim. This research does not close old P10. [Connection detection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html#RUNTIME-CONFIG-CONNECTION-SETTINGS).

## Bun and exact-version evidence boundary

Moving Bun SQL documentation says `sql.begin` reserves a dedicated PostgreSQL connection, rolls back on transaction error, and resolves after COMMIT is answered. It also explicitly describes the unanswered-COMMIT uncertainty. Use only the supplied transaction client for every step and await each dependent query. [Bun SQL transactions](https://bun.sh/docs/runtime/sql#transactions).

The fetched `bun-v1.4.4` `sql.ts` source provides stronger version-specific reading evidence: `begin` reserves a pooled connection, `run` awaits BEGIN before invoking the callback and awaits transaction completion before resolving; callback failure takes the rollback path. These source observations are not fresh runtime proofs of every driver path, error type, binary binding or cleanup guarantee. [Bun 1.4.4 sql.ts](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/src/js/bun/sql.ts).

PostgreSQL `/docs/18/` and Bun web docs are moving documentation. The `REL_18_6` and `bun-v1.4.4` source URLs above were fetched for this report; source inspection still does not prove the binaries in the parent's new disposable experiment match them. Capture actual server/runtime versions there. No connection, process, database, container, production or gate state was inspected or changed by this researcher.

## Remaining adapter proofs

The parent owns the new disposable experiment. Necessary observations, beyond this research:

1. Incompressible large identity bytes reject a naive full-key B-tree index while the fixed bucket candidate stores and reads the complete original bytes. Include distinct keys sharing long prefixes and exact JSON-escaped string identities; verify bytes, not parsed-only equivalence.
2. Inject a deliberate digest collision. Distinct keys both remain reachable; identical key/content is idempotent; identical key/different content conflicts. Every lookup must traverse all matching bucket candidates as needed.
3. Two independent clients/backends compete on an initially absent key. Observe blocking, commit then identical/conflict behavior, and rollback then successful creation. Test the cross-scope command uniqueness domain.
4. Negative controls remove the lock and force both absence reads before either insert; combine lock+lookup into one statement with a stale waiting snapshot; repeat with REPEATABLE READ and separate statements. Observe the intended concurrency assertion fail, rather than accepting a schedule that happened not to race.
5. Demonstrate backend affinity, awaited statement ordering, commit acknowledgment, error propagation and lock release after rollback/timeout/savepoint recovery. Break each claimed safety check and record the failing production-path assertion beside the eventual check as required by R5.
6. Retain P10 as unresolved until separate server observation proves backend disappearance and lock absence after client close/failure within a bounded interval. Do not infer that from close/throw alone; do not expand this task into the prior P01–P11 campaign.
7. Provider implementation would additionally need all mutation entrypoints, integrity scans, revisions/counts, references, migration/rollback and recovery semantics covered. The narrow candidate experiment cannot establish RunStore provider conformance.

Checks performed here: repository file reads, exact source HEAD read, official web/source fetches and ignored destination verification. Skipped by design: all runtime/database experiments, Bun adapter probes, tests/lint/typecheck/build, full gates, migration execution and production checks. The already-running canonical 991 gate was not touched.
