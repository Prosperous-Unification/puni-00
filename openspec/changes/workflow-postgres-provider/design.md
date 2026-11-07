# PostgreSQL provider design in progress

**Engine and serialized-write direction approved on 2026-11-04. The private connection/transaction/close prerequisite is implemented; the [concrete physical-store protocol](physical-store-design.md) and [its TDD plan](physical-store-tasks.md) are proposed for owner review.** Current semantic contracts are pinned to merged PR787 source `9917286d18ae327182558f9eec17463fe01339ac`, tree `f40d36482cfdfb2bdf915e48b4a97be0fdaa732d`. [ADR0069](../../../docs/adr/0069-postgresql-is-the-second-workflow-store.md) records the selected direction. [The lifecycle plan](lifecycle-tasks.md) and [publication record](publication.md) distinguish accepted private work from the still-missing complete RunStore/ArtifactStore adapter, schema, configuration and transfer.

## Context

The S0 foundation requires an actual second durable store and shared conformance; configuration switches and a disposable SQL experiment do not supply that. Implement a PostgreSQL adapter for the **current 26 RunStore operations, two ArtifactStore operations and awaited bundle close**, preserving exact identities, original acknowledgements, local ownership, capacity, history and recovery semantics. Use existing pure planners/codecs and unchanged provider-neutral ports. Prove it on real PostgreSQL, through independent processes, restart and faults, before production selection becomes available.

Keep the current SQLite implementation and its migration identities intact. This work does not select an operator deployment, move an operator store, change WBS tenant limits/credentials/compute, alter CTT, select tool-output/ACP profiles, or complete S7a. Versioned paused-writer transfer remains an explicit acceptance deliverable; its interchange contract requires a separate reviewed packet before use.

The recent experiment established a private exact-key indexing primitive and demonstrated why a lock/lookup snapshot boundary matters. It did not establish Bun SQL transaction/lifecycle behavior or full provider conformance. Historical P10 client-close/backend-absence failures remain failures.

## Decisions

The selected engine and serialized-write direction are recorded in [ADR0069](../../../docs/adr/0069-postgresql-is-the-second-workflow-store.md). The advisory lock/key mechanism below remains proposed; metadata-row locking is also viable pending its own proofs.

## Goals / Non-Goals

Use existing **RunStore**, **ArtifactStore**, **ownership**, **attempt**, **reservation**, **runtime scope**, **intent**, **acceptance**, **recovery journal**, **fence**, **closure**, **write obligation**, **receipt** and **provider bundle** terms. A database lock is not an ownership lease; a committed local record is not an authenticated WBS receipt; released local capacity is not proof that an external worker stopped. No new domain term is resolved, so the glossary needs no edit.

Files would belong under `apps/twilight-structure/twilight-dash/cli/src/runs/postgres/`; shared planners, portable record codecs and history verification stay in `runs/`. SQL/driver handles, physical migrations and transaction callbacks stay private. `openStores` eventually gains explicit validated PostgreSQL selection only after provider acceptance; opening absent state does not bootstrap it. Credentials remain owner-supplied adapter configuration and are never retained in execution records or diagnostics.

## Physical identity and integrity

Retain exact UTF-8 bytes of JSON-encoded semantic identities and portable records in BYTEA. JSON escaping preserves NUL, lone surrogates and literal escapes before UTF-8 encoding; PostgreSQL text/JSONB normalization must not replace that boundary. Digests remain lookup buckets or existing content hashes, never new public IDs.

Use compact private UUID slots for primary/foreign keys. A nonunique fixed-size digest bucket index locates full retained identity bytes; compare complete bytes after the lock. Distinct full keys in one bucket are distinct. Multiple retained rows with the same full semantic identity are trusted-state corruption and throw. Fetching only the first bucket candidate is insufficient. Parent/child slots and composite foreign keys preserve scope/run/attempt correspondence; a slot alone cannot excuse mismatched record content.

The schema must map existing identity families rather than inventing one global command namespace. In particular, runtime command identity is globally unique within that store, while execution/recovery/coupled-write histories have existing exclusions and exact-replay exceptions. Preserve both pure planner rules **and existing adapter-level guards in their current precedence order** against a complete locked view. For example, `sqlite/run-store.ts:874` excludes retained write-local IDs before recordExecution replay, and `:943` has the equivalent guard before claim staging; claim acceptance and turn staging have the same exclusion. The recordExecution path also interlocks with active recovery before fresh execution planning. Reusing only `plan*` functions would omit these checks. The reviewed [28-operation order map](evidence/postgres-operation-order.md) records exact source guard/replay/clock/publication ordering and its evidence limits; do not extract a generic helper that weakens that ordering. Bounded IDs also need reversible encoding: their current length bounds do not eliminate admitted Unicode edge cases.

Retain migration/down hashes, immutable store configuration/identity, original replies, history counters, original/derived record correspondence and referenced artifacts. On open and read, use existing decoders and equivalent provider integrity scans; do not manufacture absent rows/counters, overwrite duplicate retained content or repair corruption automatically. PostgreSQL's finite value/transaction resource limits remain operational errors, not silent truncation or a newly imposed shared-ID limit.

## Durable-commit admission

The initial provider supports a writable primary and permanent logged provider tables. Require observed `fsync=on` and `full_page_writes=on`; set and verify transaction-local `synchronous_commit=on` before writes. These are explicit admission requirements, not database defaults inferred from a successful COMMIT. Reject inaccessible/malformed settings, recovery/standby mode, unlogged/temporary provider relations and disabled/unvalidated required constraints. Session settings must preserve constraint enforcement; do not disable foreign-key triggers or use a replication role that bypasses them. Verify actual physical schema and migration identities rather than trusting table names. PostgreSQL documents asynchronous commit and fsync trade-offs in [WAL configuration](https://www.postgresql.org/docs/18/runtime-config-wal.html), and unlogged tables' crash behavior in [CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html).

Future production-path negatives must independently disable fsync/full-page writes, force transaction-local asynchronous commit, substitute an unlogged provider relation, disable an FK/constraint, and make required settings unreadable. Observe the corresponding admission/integrity assertion fail with the relevant check removed, then restore exact production code. These negatives have not been run. Server/process crash tests remain finite observations; local durable acknowledgement does not certify hardware honesty, replica failover or power-loss survival. The disposable tmpfs index experiment supplied no durable-storage certificate.

## Mutation protocol

1. Decode/clone caller-owned input once before queueing, using the current operation's boundary and timing. Fence new operations synchronously when close begins; queued operations do not acquire a connection afterward.
2. Reserve a driver connection for the full transaction. Use finite connection, transaction, statement and lock budgets. Begin explicitly at READ COMMITTED; establish exclusive transaction advisory locking with one awaited SQL command.
3. **After lock acquisition completes**, issue a separate command to read metadata and the complete view required by that operation. Revalidate that metadata still names the exact lock key just acquired; a changed/missing key throws. Observe the trusted clock after waiting, check persisted clock monotonicity, and apply the current live-owner/epoch checks before duplicate/revision evaluation where required by existing planners and adapter guards.
4. Preserve adapter guard/replay ordering, then run the existing pure planner. Write every affected row, acknowledgement, revision, history counter and reservation atomically. Expected refusals remain the existing unions and preserve existing clock-observation behavior. Artifact retention also participates in the write lock; it does not acquire semantic execution ownership.
5. Await COMMIT acknowledgement before returning applied/duplicate/refused. Never expose a reply from the transaction callback before the driver confirms the commit. Do no remote WBS/worker work in the transaction.

The [physical-store proposal](physical-store-design.md#namespace-and-writer-exclusion) specifies one explicit schema and a versioned signed64-bit advisory key derived from its exact name. Bootstrap and every later writer use the same database-scoped single-bigint transaction lock, including before metadata exists; locked admission revalidates the retained derivation and physical incarnation. [Proposed ADR0070](../../../docs/adr/0070-workflow-store-locks-bind-to-postgres-namespaces.md) records the alternatives. No physical protocol or new format is accepted or experimentally proved by publishing this design.

## Reads, retries and uncertain outcomes

ReadRun, readRuntimeScope, readExecutionHistory and integrity scans require a consistent view across all queries. Use an explicit read-only REPEATABLE READ transaction for those multi-query reads; do not transplant the mutation protocol to that isolation level. Reads must be detached from mutable driver buffers. Artifact reads verify retained reference, bytes, length, media type and digest. Single-query reads can use the same wrapper for uniform cleanup, without acquiring semantic ownership.

Retry only a fully classified aborted transaction when rollback is positively observed and the connection remains usable; budgets are finite. Preserve both original and cleanup causes. Transport loss before or after COMMIT can have the same driver error, so it does not authorize replay. Fence the uncertain bundle and throw a contextual operational error without claiming the write was absent. For operations with retained original command/acknowledgement histories, a fresh verified observer can reconcile **only what those exact records prove**. Automatic retries must not create a new command/attempt or release capacity.

`acquireOwnership`, `renewOwnership` and refused-clock-only mutations do not have equivalent per-call replay journals. A later ownership/clock read can establish current state but cannot always prove which invocation committed. Preserve that uncertainty as an operational failure; do not promise original replies, generate a new public replay key, infer absence or automatically retry such a call. No universal exactly-once acknowledgement is claimed. This preserves the current public contract and adds no business outcome union.

## Private awaited-close prerequisite

The [private lifecycle design](lifecycle-design.md) specifies direct same-role pinned connections, startup cookies, exact backend identities, one prepared inspection containing continuity checks, finite budgets and sticky failures. The [session record](evidence/postgres-session-publication.md) covers synchronous fencing, queued-call rejection, actual admitted settlement, separate lock/read commands, coherent snapshots, validated native COMMIT tags, independent ordered disposals and fresh server writer observation. Late rollback failure cannot disappear behind an already-rejected caller deadline.

The earlier driver packet showed local force-close fulfillment before backend disappearance. Current close therefore does not infer absence from that signal. The final read-only observer is disposed locally after writer observation; no all-OS-process reaping or resolution of unknown COMMIT is promised. Missing visibility, marker/identity replacement, query failure or exhausted observation throws.

The [fixture phase correction](evidence/postgres-parallel-fixture-publication.md) preserves conservative ambiguity rejection and exact captured-worker barriers. Its original intermittent-failure cause remains unproven. These private proofs do not establish future provider compliance with fixed direct-server/trusted-callback constraints, effective durability settings, physical-store lock-key binding, complete26+2 semantics or transfer. Those remain acceptance obligations before enabling selection.

## Complete operation coverage

| Family                       | Existing operations to implement and prove                                      |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Ownership                    | acquireOwnership, renewOwnership                                                |
| Retained manifest/run        | retainManifest, readManifest, createRun, readRun                                |
| Attempts and legacy outcomes | admitAttempt, recordExecution, commitOutcome, reconcileReceipt                  |
| Human decisions              | receiveDecision, consumeDecision                                                |
| Receiver authority           | pinRuntimeScope, readRuntimeScope, stageRuntimeRequest, recordRuntimeAcceptance |
| Claim/turn history           | stageClaim, recordClaimAcceptance, stageTurn, readExecutionHistory              |
| Logical recovery             | beginRecovery, stageRecoveryFence, recordRecoveryFence, resolveRecovery         |
| Coupled write                | stageWrite, recordWriteAcceptance                                               |
| Artifact bytes               | retainArtifact, readArtifact                                                    |

The current inventory maps 27 exported shared-suite functions to 54 memory/SQLite registrations. Add real PostgreSQL registrations with the same oracles; do not count registration sites as executed acceptance. Preserve provider-specific real-process, rollback, corruption and snapshot tests as additional evidence.

## Ordered implementation and acceptance obligations

1. Review the proposed engine/private representation and resolve lifecycle topology/observer details before retaining implementation. Record approved intent, delta specs, nontrivial design and ordered TDD tasks in OpenSpec; record an ADR only for the accepted hard-to-reverse choice.
2. Build a real PostgreSQL fixture with exact server/runtime/dependency identity and strict owned cleanup. Establish bounded lifecycle with production-path negative controls, including previous fault classes, before relying on fixture cleanup.
3. Implement explicit bootstrap/open, paired additive migration/down artifacts, complete ledger/hash validation, durable-commit admission, trusted metadata and snapshot integrity. Tests break every new gate and prove absent/malformed/unreadable states separately when distinct.
4. Implement all families in the coverage table through shared planners, current adapter-level guards/precedence and atomic transactions. For each write family inject an actual mid-transaction failure, reopen independently and verify the entire prior state, then pass with the real commit path restored. Preserve original-reply duplicates where journaled, uncertainty where not, and cross-family exclusions.
5. Execute unchanged shared conformance against PostgreSQL, then real competing-process ownership/capacity/collision cases, read snapshots across competing commits, server restart, connection loss around COMMIT and bounded close failures. Finite restart evidence does not certify failover/power-loss.
6. Design and prove a versioned transfer carrying complete artifacts/manifest/run/attempt/ownership/clock/capacity/provenance/inbox/outbox/runtime/recovery/write histories and original acknowledgements. Pause **every writer**, verify an immutable source capture, import into an empty target in an atomic controlled operation, reopen and compare public state and original replay behavior. Existing current ports have no transfer operation; do not smuggle export/import through generic transactions or claim a WBS export is sufficient.
7. Independently review, run required exact-source gates, integrate normally and maintain WBS. New production selection/configuration does not activate an operator transition. No production deployment.

## Open Questions

The owner selected PostgreSQL and serialized writes. The concrete physical-store lock/bootstrap proposal awaits owner review and its real implementation/proofs; the transfer envelope remains unresolved. The supported private lifecycle topology is specified and tested; complete-provider integration must still honor it. The current PR's merge is independent of these new decisions. Tool-output and ACP choices already pending are separate and are not asked again here. This publication records that selected direction and the remaining implementation obligations; it does not claim that the adapter exists.

Evidence: [SQL findings](evidence/postgres-index-findings.md), [official-source research](evidence/postgres-index-research.md), [current provider inventory](evidence/provider-acceptance-inventory-v3.md), [independent SQL audit](evidence/postgres-index-audit.json). Existing source references: `runs/run-store.ts`, `runs/artifact-store.ts`, `runs/open-stores.ts`, `runs/sqlite/run-store.ts`, `runs/plan-{runtime,recovery,writes}.ts` at the pinned source above.

## Risks / Trade-offs

Store writes serialize; worker execution remains parallel. Incorrect guard precedence, weak durability settings, stale read snapshots, uncertain COMMIT and incomplete backend observation can invalidate the adapter. The shared suites and production-path negative controls remain required.

## Migration Plan

Bootstrap a new explicitly selected PostgreSQL store only after schema/lifecycle acceptance. Preserve paired additive migration/down identities and every applied-ledger check. Ordinary open does not create or upgrade. Versioned transfer requires a separately reviewed envelope, every writer paused, an immutable capture, empty-target atomic import and independent reopen/replay verification. No operator store transition or production deployment is included.
