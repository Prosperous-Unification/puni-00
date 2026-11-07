# PostgreSQL provider proposal review

Reviewed as an **unadopted architectural decision aid**, not an implementation or runtime acceptance packet. Fresh read-only `git rev-parse HEAD` in `/home/df/.codex/worktrees/ac2c/puni-00` returned `9917286d18ae327182558f9eec17463fe01339ac`. Read the proposal, current RunStore/ArtifactStore/openStores contracts and relevant SQLite/planner paths. Only this report was written; no product/source/ref edits, database commands or gates were performed.

## Strengths

- The operation table matches the current 26 RunStore methods and two ArtifactStore methods. Awaited bundle close remains a separate acceptance obligation.
- The proposal preserves exact reversible identity bytes, nonunique digest buckets, original acknowledgements, detached reads, local ownership and global capacity. It correctly avoids a universal command namespace and distinguishes database serialization from semantic ownership.
- Separate READ COMMITTED lock acquisition and lookup fit the proposed cooperative write protocol. Read-only REPEATABLE READ addresses multi-query coherent reads without reusing the stale-snapshot mutation trap.
- Commit ambiguity fences the bundle and throws rather than claiming rollback, retrying blindly or releasing capacity. The draft explicitly leaves earlier P10 failures unresolved.
- Lifecycle topology/observer authority and the transfer envelope remain visibly unresolved. Their absence is not represented as successful acceptance, and the draft does not authorize an operator migration or public-profile change.

## Critical

None identified in this draft. There is no implementation here to accept for production.

## Important — resolved in revised draft

The initial findings below are retained for traceability. A follow-up read of the revised proposal confirmed all three corrections; no remaining Critical or Important issue was identified at this decision-aid stage. This is a document review, not verification that the proposed mechanisms work.

1. **Planner reuse alone does not preserve all cross-family admission rules.**
   - Proposal: `postgres-provider-proposal.md:36`, `:45`, `:85`.
   - Current source: `runs/sqlite/run-store.ts:874` excludes write-local command identities before execution replay, and `:943` applies the equivalent guard before claim staging. Claim acceptance and turn staging have equivalent adapter checks. The execution adapter also checks the active-recovery interlock around `:896` before its transition planner.
   - The statement that production planners decide these relationships from the complete locked view is too strong: some decisions are implemented in the adapter around the planner and replay calls. Calling the same pure planners with complete catalogs does not automatically reproduce those guards or refusal precedence.
   - **Action:** require an operation-by-operation map of adapter guards, history audits, replay rules and planner calls. Carry those semantics into PostgreSQL, or separately review any shared extraction. Explicitly include the existing local-submission/wire/recovery exclusion matrix and its permitted lexical equality/replay exceptions in acceptance. Do not replace it with one global SQL uniqueness constraint.
   - **Resolution checked:** revised proposal `:36`, `:50`–`:51` and `:93` explicitly require current adapter guards, replay/refusal precedence, the operation/guard-order matrix before coding, and atomic publication alongside the pure planners.

2. **COMMIT acknowledgement lacks a required durability admission policy.**
   - Proposal: `postgres-provider-proposal.md:7`, `:38`, `:46`, `:84`, `:86`.
   - Current source: `runs/sqlite/schema.ts:141`–`:168` configures and checks foreign-key enforcement, WAL and synchronous FULL, with negative evidence for rejected weakened settings. The PostgreSQL proposal currently requires acknowledged COMMIT and restart observations without spelling out the equivalent settings boundary.
   - PostgreSQL permits acknowledged transactions to be lost with `synchronous_commit=off`; disabled `fsync` can undermine crash consistency, and unlogged relations are truncated after an unclean shutdown. These are documented behaviors, not solved by awaiting the driver callback. See [PostgreSQL WAL configuration](https://www.postgresql.org/docs/18/runtime-config-wal.html) and [unlogged tables](https://www.postgresql.org/docs/18/sql-createtable.html#SQL-CREATETABLE-UNLOGGED).
   - **Action:** make the supported local-durability policy an explicit design/admission obligation: accepted effective commit/WAL settings, permanent logged relations, how pooled connections enforce or verify them, and what configuration changes invalidate admission. Include actual production-path negatives for weakened settings. Keep storage-hardware honesty and failover/power-loss certification outside the claims; those exclusions should not remove the ordinary local durability requirement.
   - **Resolution checked:** revised proposal `:40`–`:44` requires observed fsync/full-page-write settings, transaction-local synchronous commit with verification, writable-primary admission, permanent logged relations and enforced validated constraints. It names independent future negatives and preserves honest hardware/failover limits. Those future checks have not been implemented or executed.

3. **Reconciliation is overstated for operations without original per-call histories.**
   - Proposal: `postgres-provider-proposal.md:54`.
   - Current source: `runs/sqlite/run-store.ts` implements `acquireOwnership`/`renewOwnership` by updating current ownership metadata, not retaining an immutable original reply for each call. `finish` also persists clock observations for refusals without retaining a per-call command history. Artifact retention and some insert-or-identical operations likewise have different evidence from journaled commands.
   - A fresh observer may establish current state and backend quiescence, but cannot universally reconstruct the exact original outcome from a retained command/history that does not exist. Later valid mutations can replace the state needed to infer it.
   - **Action:** narrow the reconciliation claim to operations whose existing retained identities/history establish the relevant outcome. Explicitly allow unresolved operational outcomes for other calls, with no new command ID, reconstructed original acknowledgement, automatic semantic replay or capacity release. Add operation-specific uncertainty cases to acceptance. This preserves the existing ports and avoids silently adding a universal operation journal.
   - **Resolution checked:** revised proposal `:60`–`:62` limits reconciliation to what exact retained evidence proves and explicitly leaves ownership/renewal/refused-clock invocations uncertain without generating replay keys or claiming original replies. Acceptance at `:93` preserves uncertainty where operations are not journaled.

## Existing open design obligations, not additional adoption

The draft correctly calls bootstrap and lifecycle details unresolved. Before retained implementation, its OpenSpec design still needs to make these concrete:

- Identify a physical store independently of a connection alias or mutable search path; bind every connection to the same database/store namespace and advisory-lock overload/key encoding.
- Specify the database-level bootstrap serialization point before metadata exists, coordinate migration writers with normal writers, and keep absent/corrupt metadata a throwing open failure. A normal opener must never repair absence by generating a new lock key.
- Enforce and prove the revised proposal's post-lock key revalidation (`:50`): retained immutable lock identity must equal the exact acquired key, and changed/missing identity throws. The requirement is now explicit; its implementation and negative proof remain future work.
- Define exact-server/backend identity, observer authority, observer cleanup and the bounded failure outcome. A PID alone, endpoint alias or observation from a different failover target cannot establish absence. Prepared/detached transactions or alternate pooling modes need either explicit exclusion or their own lifecycle account.
- Keep the transfer-envelope review separate. Pausing every writer, immutable capture and empty-target atomic import are appropriate constraints; they are not yet a selected executable transfer protocol.

The proposed coarse lock is a plausible option for the architectural decision. These obligations do not select a private schema, new privilege/service architecture, engine deployment or public profile.

## Assessment

**Ready as an unadopted architectural decision aid; no remaining Critical or Important document finding. Not implementation authorization or runtime acceptance.** The three findings are addressed in the revised text. Lifecycle topology, concrete bootstrap coordination and transfer format remain explicit design prerequisites. No database behavior, Bun driver lifecycle, fault recovery, migration, conformance suite, lint/typecheck/build, gate or production outcome was verified in this review. Source inspection supports the compatibility findings only.
