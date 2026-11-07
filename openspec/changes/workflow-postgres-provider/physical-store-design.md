# PostgreSQL physical-store bootstrap and admission

**Status: proposed for owner review, 2026-11-05.** PostgreSQL and serialized writes are already selected; this packet makes the previously open physical protocol concrete. It adds no implementation or accepted format. [ADR0070](../../../docs/adr/0070-workflow-store-locks-bind-to-postgres-namespaces.md) contains alternatives. [Ordered tasks](physical-store-tasks.md) lead to complete-provider operations, not a metadata-only provider.

## Source boundary

Base is PR846 source `b1fd7fd15f59e8064d6e9286f0ba82cc723c880f`; its existing private session stays frozen while gated. Semantic source remains merged PR787 `9917286d18ae327182558f9eec17463fe01339ac`, with the [28-operation ordering map](evidence/postgres-operation-order.md). Relevant callers are `runs/open-stores.ts`, `sqlite/open-stores.ts`, `sqlite/schema.ts`, `sqlite/read-history.ts` and their tests. Current ordinary open does not create/upgrade, matches organization/capacity/lease, audits complete history and returns retained ownership without advancing the clock.

Keep those boundaries and existing ports. PostgreSQL objects, key derivation, lifecycle callbacks and migration identities stay adapter-private. Existing domain terms suffice; schema, namespace and incarnation UUID describe physical implementation, not new workflow concepts. No glossary edit is required.

## Namespace and writer exclusion

Configure an explicit nonempty ASCII schema identifier matching `[a-z][a-z0-9_]{0,62}`, excluding `public`, `information_schema` and every `pg_` prefix. Reject invalid input before creating clients. Do not derive a physical namespace from a public organization/run/command ID, truncate it, lowercase an admitted mixed-case identifier or resolve it through `search_path`. Fully qualify every adapter relation with the validated identifier and every system function/catalog with `pg_catalog`; SQL identifier quoting is separate from value parameterization.

A database plus schema name identifies the physical target. One configured direct-server role owns the namespace and its relations; writer and observer connect to that same role/database under the existing lifecycle topology. Bootstrap additionally requires database CREATE permission. Ordinary open requires no CREATE permission and performs no DDL. No new role/credential management or deployment topology is introduced.

Lock protocol version1 is deterministic:

1. Encode `JSON.stringify(['twilight-dash-postgres-store-lock', 1, namespace])` as UTF-8.
2. Calculate SHA-256, read the first eight digest bytes in big-endian order, interpreted as a signed two's-complement64-bit integer. Never pass through JavaScript Number.
3. Acquire the exclusive **single-bigint** overload `pg_catalog.pg_advisory_xact_lock(key::bigint)` as its own awaited command in READ COMMITTED. The next command obtains current metadata. Do not combine lock and lookup in one statement.
4. Retain `lock_protocol=1`, the exact schema name and `lock_key` in metadata. After locking, require the retained values to equal the configured derivation. Do not follow a changed key, generate a replacement or retry under another key.

This key exists before metadata, so bootstrap uses exactly the same lock as later mutations. Advisory keys are database scoped. A digest collision between different schemas causes extra serialization only; it never changes a qualified target or allows digest-only semantic equality. No global key-uniqueness table is needed. All semantic writes, artifact retention, bootstrap, explicit migration/down and any future transfer publication must use this protocol. Readers use the existing coherent snapshot wrapper; a migration/transfer must also pause/drain readers and writers as specified below.

Documentation vectors, independently calculated with Bun's native crypto API (not PostgreSQL acceptance):

| Namespace         | Signed key             |
| ----------------- | ---------------------- |
| `dash_workflow`   | `2786038215943965059`  |
| `dash_workflow_a` | `-1091180736639099176` |
| `dash_workflow_b` | `42890902827600556`    |

The database must prove the actual lock overload, not merely a blocked JavaScript promise. Inspect the held advisory entry for the exact database/backend/key and single-bigint representation, and show a separate process blocks before its callback. Inject a forced digest collision through the private derivation dependency and prove distinct namespace isolation.

## Metadata, bytes and relational layout

The singleton metadata record retains format version/bundle hash, schema name, lock protocol/key, a newly generated private incarnation UUID, logical ownership/store/organization identity, capacity, lease duration, last observed time and the existing usage/history counters. Use checked BIGINT for safe nonnegative integers; decode driver integer representations without rounding and reject values beyond the existing safe-integer contract. Capacity and lease are strictly positive. The incarnation is distinct from the portable logical store ID: transfer preserves the latter and creates fresh target physical metadata. A reopened bundle pins its incarnation; every operation revalidates it, and an old bundle must reject a drop/rebootstrap replacement even when schema/key/options are identical.

Retain exact UTF-8 bytes of JSON-encoded identities and records in BYTEA, preserving NUL, lone surrogates and literal escapes. Decode UTF-8 strictly, parse through current codecs and require canonical identity re-encoding. Private UUID slots carry primary/composite foreign keys. Fixed32-byte SHA-256 buckets are **nonunique** lookup indexes; read every candidate and compare full bytes. Duplicate full identities are corruption. Public IDs acquire no new size, normalization or hashing rule.

The first complete PostgreSQL format has a paired `migrations/0001-store/migration.sql` and `down.sql`; it does not copy SQLite's six historical physical generations. Its relation inventory covers every current semantic family:

| Relations                                              | Retained correspondence                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| meta, migration                                        | Singleton physical/configuration identity; ordered complete forward/down ledger                     |
| artifact, manifest, run                                | Exact identity/content/reference; manifest link; current and initial run records                    |
| attempt, reservation                                   | Run/occurrence/ordinal; original admission; held capacity; active occurrence exclusivity            |
| execution, completion, outbox                          | Execution commands and original replies; one completion per attempt; exact pending completion       |
| decision, consumption, receipt                         | Decision/attempt/correlation; wait and original reply; completion/attempt acceptance correspondence |
| runtime_scope, runtime_intent, runtime_acceptance      | Scoped revision/pin; global runtime-command identity; command-plus-scope foreign keys               |
| recovery_journal, recovery_fence, recovery_observation | Opening command/scope; recovery/ordinal; original fence and observation provenance                  |
| recovery_closure, recovery_barrier, recovery_active    | Closure/scope boundary and active journal correspondence                                            |
| write, write_obligation, write_receipt                 | Stage command/run/attempt; complete obligation; original acceptance                                 |
| runtime_format, recovery_format, write_format, usage   | Existing retained count/usage witnesses, with no inferred missing zero rows                         |

Claim/turn facts belong to the current execution/runtime records, not newly invented tables. Scope/occurrence/correlation identity slots must enforce the same full-byte distinctions as their parent records; avoid indexing arbitrary-length admitted bytes. Concrete columns/composite keys and extracted active-state fields are required in the initial migration before bootstrap can be accepted. Decoded record-to-column correspondence and existing full history validators remain mandatory; relational constraints do not replace those checks. This packet does not pretend to provide the final DDL or its passing catalog profile.

## Explicit bootstrap

Validate configuration and all lifecycle budgets before opening resources. Through the existing bounded session, begin READ COMMITTED, acquire the namespace key, then independently inspect namespace existence and effective durability settings. If any namespace already exists, return an operational `exists` failure without adopting, repairing or dropping it, including an empty or malformed namespace. A concurrent successful initializer wins; the loser preserves it byte-for-byte logically.

Only the absent target can be created, in that same transaction. Create the schema and complete current migration, write every compiled ledger identity and initial metadata, observe a validated trusted clock after lock acquisition, create logical ownership at epoch0/no owner, and audit the complete empty format. Publish only after native COMMIT acknowledgement is validated. An intermediate statement failure rolls back schema, ledger and metadata together. Execute complete compiled SQL statements with explicit breakpoints, not a semicolon split or a best-effort whole-script executor.

A lost COMMIT acknowledgement fences the session and leaves initialization operationally uncertain. Never compensate with DROP SCHEMA, retry bootstrap or infer absence from a lost reply. An independent read-only inspection may report whether a complete store exists; it does not reconstruct an invocation acknowledgement. Retain the incarnation generated by this bootstrap invocation. Returning the bundle additionally requires ordinary locked open/admission against that exact expected incarnation; a replacement in the post-COMMIT interval throws without adopting or deleting it. Preserve failure of this phase without deleting an already committed namespace.

## Ordinary open and every operation

Open creates no objects and does not modify the logical store, persisted format, clock or configuration. Use the namespace lock in a bounded write transaction for initial complete admission; no semantic planner runs there. Require exactly one metadata row, the exact complete compiled migration bundle and matching organization/capacity/lease. Pin the private incarnation only after physical and full semantic validation. Absence, permission denial, incompatible format, malformed/duplicate state and configuration mismatch remain distinct contextual operational errors, with original SQL causes retained. An absent required table in an existing namespace is corruption; never initialize it.

Each later write locks, rereads and validates its pinned incarnation/key, complete compiled catalog, full ledger and configuration inside that operation's transaction, reads the required complete semantic view, then preserves its own clock/ownership/history/guard/planner order from the operation map. Artifacts perform the same physical/ledger/configuration checks and exclusion but do not gain semantic ownership or clock observations. Every read also validates the pinned incarnation/key, complete compiled catalog, full ledger and configuration together with needed semantic integrity within its one read-only REPEATABLE READ transaction. Never substitute a matching metadata format hash or cached validation from an earlier transaction for the current catalog/ledger checks.

The existing lifecycle callback is trusted private adapter code: no retained/detached connection work, role/cookie changes, transaction control, autonomous writes or two-phase transactions. Explicitly set and verify transaction-local `synchronous_commit=on` before bootstrap/mutation effects; require observed `fsync=on`, `full_page_writes=on`, `session_replication_role=origin` and a writable primary. Missing/unreadable settings throw. Do not automatically rewrite server settings. Fixed session timeouts and all existing close/unknown-COMMIT obligations still apply.

## Physical-schema and ledger admission

Hash the exact complete forward and down artifact bytes and an ordered, versioned bundle representation. Require every ledger row/name/ordinal/hash to match, with no extra/missing rows. A matching ledger is necessary, not evidence that the physical schema still matches.

Compile a typed catalog profile beside the migration. On real PostgreSQL18, compare the exact namespace relation set and each required relation's kind, logged persistence, ownership, columns/types/nullability/default/generated/identity flags and key structure. Reject partitions/inheritance, foreign/view substitutions, RLS/policies, rewrite rules and unapproved triggers. Foreign-key enforcement triggers must exist and be enabled; constraint validity/enforcement, immediacy, referenced namespace/columns and update/delete behavior must match. Required indexes must be live/ready/valid, with the expected uniqueness, access method, key order, operator classes, collation and predicate.

Resolve FK/type/index identities through catalogs rather than string-stripping a schema name from SQL. For the limited built-in check/predicate expressions, compare PostgreSQL18 canonical output against the compiled expected form; no user functions or arbitrary defaults are allowed. Build and inspect a clean reference migration only in an owned test database to detect profile/DDL drift; ordinary open must never create a reference namespace. Normalize no permission/query failures into empty catalogs.

## Maintenance and transfer boundary

Initial creation is additive; each later format change ships forward/down artifacts and complete identities. Explicit maintenance must pause new access and drain every participating bundle, acquire the same namespace lock, validate the exact predecessor physical/history/configuration state, execute the named paired artifacts atomically and verify the successor before acknowledgement. No ordinary open may upgrade. Down refuses edited applied artifacts and never uses CASCADE or IF EXISTS to hide unexpected state.

The database lock serializes participants; it cannot establish that every independent bundle/reader is paused, or stop an administrator/raw SQL client ignoring the protocol. The complete versioned transfer envelope and externally established pause/drain protocol remain separate, unresolved acceptance work. This design only fixes their mandatory target-lock/empty-target/incarnation constraints. Do not claim portability or activate operator migration from this packet.

## Evidence and acceptance limits

All new behavior is proposed, unimplemented and unproved. The [implementation tasks](physical-store-tasks.md) require production-path negatives with exact source restoration and native receipts. Existing private session54-test evidence does not prove any namespace, bootstrap, catalog, durability or full-provider behavior. A persistent, strictly owned fixture is required for restart tests; the earlier tmpfs fixture is closed.

Primary technical references checked2026-11-05: [advisory functions](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS), [lock semantics](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS), [lock catalog](https://www.postgresql.org/docs/18/view-pg-locks.html), [schema creation](https://www.postgresql.org/docs/18/sql-createschema.html), [schema/search path](https://www.postgresql.org/docs/18/ddl-schemas.html), [isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [constraint catalog](https://www.postgresql.org/docs/18/catalog-pg-constraint.html), [index catalog](https://www.postgresql.org/docs/18/catalog-pg-index.html), [WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html). Protocol choices above are the proposed design inferred from these mechanisms, not PostgreSQL guarantees about this adapter.
