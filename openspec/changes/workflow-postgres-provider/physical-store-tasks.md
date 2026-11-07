# PostgreSQL physical-store implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. This plan is proposed for owner review; do not treat publication as acceptance of a new physical format.

**Goal:** Build the physical prerequisite for the complete26+2 PostgreSQL provider without changing public ports or admitting a partial provider.

**Architecture:** One configured schema uses the same derived transaction advisory key before and after metadata creation. Existing bounded session callbacks own atomic bootstrap and complete current-format admission; full semantic adapters follow through the published operation-order map.

**Tech stack:** Locked Bun1.4.4/Nx dependencies; Bun SQL; real PostgreSQL18 with a strictly owned persistent fixture.

**Spec:** [Physical-store design](physical-store-design.md), [proposed ADR0070](../../../docs/adr/0070-workflow-store-locks-bind-to-postgres-namespaces.md), [delta spec](specs/workflow-postgres-store/spec.md).

## Global constraints

- Engine/serialized writes are approved. This concrete private protocol is proposed; do not merge it as an accepted architecture or enable selection until owner review.
- Keep PR846 source frozen; implement later in separate isolation based on its accepted source.
- Use unchanged RunStore/ArtifactStore ports, current codecs/planners and exact operation-specific guard/clock/replay order.
- Ordinary open creates/upgrades/repairs nothing. Missing/unreadable/malformed trusted state throws.
- Every new safety gate needs a production-path negative, an observed failure with that gate removed or dependency broken, exact restoration and an adjacent Proof comment.
- Preserve original causes, bounded lifecycle and unknown COMMIT; no blind retries or DROP compensation.
- Paired additive forward/down artifacts; immutable complete ledger. No operator migration, tenant/credential/compute/CTT work or production deployment.

## Task1: Atomic complete-format bootstrap

**Files:** Create `runs/postgres/identity.ts`, `format.ts`, `catalog.ts`, `open-stores.ts`, `migrations/0001-store/{migration,down}.sql`, `identity.test.ts`, `open-stores.db.test.ts` and a strictly owned persistent real-PG fixture under `runs/postgres/testing/`. Keep portable record codecs and history validation in their existing modules.

- [ ] First define the complete current relation/column/key profile from every row of the28-operation map. Name exact run/occurrence/scope/correlation UUID-slot relationships, active-attempt uniqueness and count witnesses. No generic JSON blob or metadata-only bootstrap substitutes for the full schema.
- [ ] Write failing real-open/bootstrap tests for existing namespace preservation, absence, permission denial, a two-process initializer race, intermediate SQL failure and exact initial ownership/configuration/clock. Include digest-collision isolation and all documented signed-key vectors.
- [ ] Prove the actual single-bigint lock overload/database/backend/key via pg_locks, then a separate process blocked before metadata access. Remove the lock and observe the production bootstrap race oracle fail.
- [ ] Implement boundary validation, key derivation, complete migration/down identity, trusted byte/integer decoding and atomic bootstrap through the bounded session. No semantic port/configuration selection is exported yet.
- [ ] Break each namespace validator and key binding; alter retained lock metadata after a bundle opens, replace the store incarnation and corrupt canonical bytes/integer ranges. Observe the intended real-operation assertions fail after gate removal, restore exact source and rerun covering tests.
- [ ] Pause after acknowledged bootstrap COMMIT but before its follow-up admission. Replace/rebootstrap the namespace with identical options and a fresh incarnation; require the original bootstrap call to reject and preserve the replacement unchanged. Remove only its expected-incarnation comparison, observe this test fail, then restore exact source.
- [ ] Inject driver failure around real bootstrap COMMIT on both sides of publication. Verify no false success, blind retry or destructive compensation, and independently observe actual committed/absent state.
- [ ] Review schema, atomicity, uncertainty, native receipts and negative coverage before commit/push.

## Task2: Nonmutating open admission and durable transaction guards

**Files:** Extend `postgres/catalog.ts`, `format.ts`, `open-stores.ts`; add `catalog.db.test.ts` and `admission.db.test.ts`. Change private `session.ts` only for a proved missing narrow hook; do not weaken existing lifecycle semantics. Use current shared history codecs/validators rather than duplicating their rules.

- [ ] Write failing tests opening the complete actual schema with absent/unreadable metadata; extra/missing/edited ledger rows; bad configuration; forged physical identity; and genuine empty tables with altered columns, checks, FK triggers, index validity, RLS or logged persistence.
- [ ] Implement exact compiled catalog/ledger admission and no-DDL ordinary open. In an owned reference database, independently compare migration-built catalog to the compiled profile; changing either side alone must fail.
- [ ] Through each proposed production mutation boundary, independently weaken fsync/full_page_writes, transaction-local synchronous_commit, replication role, relation persistence and required constraint enforcement. Make required settings/catalog queries unreadable. Remove each corresponding check and watch the meaningful durable/admission oracle fail; restore exact source.
- [ ] After a valid bundle is already open, alter a ledger row or an empty relation's required constraint without changing metadata/incarnation. Require its next read and mutation, including artifact paths, to reject inside those operation transactions. Restore the fault and prove successful operations; remove each operation-time catalog/ledger gate for the corresponding observed R5 failure.
- [ ] Verify open returns retained ownership without advancing clock or changing rows/DDL. Check a valid read uses one coherent read-only snapshot and a retained bundle rejects a changed incarnation before returning semantic state.
- [ ] Preserve every native failure and cleanup cause; explicitly audit no callback ran after fencing or deadline. Fresh existing54-test session matrix remains required when the session implementation changes.
- [ ] Review and commit/push with a failure-proof table; none of these tests counts as full semantic conformance.

## Task3: Bind the real semantic provider

**Files:** Implement private PostgreSQL run/artifact readers and writers, shared-suite registrations and complete conformance coverage under `runs/postgres/`; update the parent [tasks](tasks.md) with actual executed evidence.

- [ ] Implement ownership/artifacts/manifests/run creation first, then each parent task3.2–3.7 in order. Every semantic family must preserve map-specific cloning, authority/history checks, exact-ID exclusions, replay, clock/usage and atomic row/reply publication.
- [ ] Only expose a PostgreSQL bundle when all26+2 operations exist. Run all27 unchanged shared-suite functions against the real fixture and verify the explicit operation/suite census.
- [ ] For each write family fail after the first affected real row; independently reopen and compare the complete previous state, then restore and prove real commit. Include interprocess last-slot races, deliberate digest collisions and coherent reads.
- [ ] Prove restart using persistent storage and lost-reply uncertainty without universal exactly-once claims. Finish the separately reviewed complete transfer envelope/protocol and both-direction transfer proofs; metadata/schema admission alone does not complete portability.
- [ ] Independent whole-provider review, R5 audit, exact-source hosted/canonical gates and normal integration precede production selection. Keep WBS in progress until actual evidence proves the complete provider.

## Planned checks

Use the configured fixture environment and exact source test files, not generated dist copies. Run `bun test <covering-files> --timeout=60000`, project uncached lint/typecheck, `bunx nx format:check --all` and `./node_modules/.bin/openspec validate --all --json`. Freeze reviewed source before `bin/h2puni-gate.sh <sha>` in a clean isolated host worktree; poll the same invocation through its native terminal. Original native streams, exact identities and deliberately failing controls are required evidence. No tests or R5 controls in this plan have been run for the proposed physical protocol yet.
