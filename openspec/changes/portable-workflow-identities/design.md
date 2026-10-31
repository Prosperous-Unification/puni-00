## Context

RunStore.createRun accepts an already formed Run; current production callers do not yet
construct coordinator runs. RunIdCodec accepts strings of1–256 UTF-16 units. The current
SQLite format4 binds raw IDs directly, whereas payload JSON preserves lone surrogates.
The observed public save/read disagreement establishes an adapter contract defect.

## Goals / Non-Goals

Provide a production run-record constructor that generates one UUID and returns a validated
revision-zero snapshot. Callers retain and resubmit that snapshot for retries; no generation
occurs inside storage or recovery. Preserve existing caller-supplied store IDs.

Repair all raw-key identity columns, not just run_id. Preserve payloads, artifact bytes,
digest keys, existing scope tuple keys, public ordering and all ownership/history invariants.
No operator-store migration, production factory/CLI activation or architectural main merge.

## Decisions

[ADR0065](../../../docs/adr/0065-workflow-ids-use-json-private-keys.md) records the representation
and downgrade boundary. The private codec encodes exactly JSON.stringify(logicalId).
Decode JSON to unknown, require a string, and require exact encode/decode equality.
Domain codecs continue to own logical constraints. Corrupt or noncanonical keys throw.

The constructor accepts Pick<Run, projectId | workItemId | manifestDigest | maxAttempts>,
calls randomUUID once and returns decodeRun with version1 and revision0. Its returned
record is retained before any persistence retry. No injectable ID generator or new retry
framework is needed. Existing store createRun remains payload-bound and unchanged.

Format5 owns new private tables for all keyed execution/runtime/recovery records and
their mutable count markers. Immutable manifests/artifacts can remain shared. The complete
ordered migration bundle and physical schema include retained predecessor structures.
The exact finite key/table mapping is adapter-private, never an arbitrary SQL rewriter.
Compiled raw and successor table maps supply only literal SQL identifiers; explicit
template interpolation selects these constants. Private descriptors thread through all
history/runtime/recovery/outcome/capacity readers so predecessor audits retain raw keys.
The old3↔4 transition retains its explicit identities and genuine predecessor readers.

### Key and family inventory

Successor names use run5_ in place of run_. Copy these eighteen relationship tables,
encoding only the listed columns. Every other column, including serialized JSON, is copied
verbatim. Do not derive stored rows by decoding and reserializing their payloads.

| Table suffix         | JSON-encode columns                      |
| -------------------- | ---------------------------------------- |
| record               | run_id                                   |
| attempt              | attempt_id, run_id, occurrence_id        |
| reservation          | attempt_id                               |
| execution            | command_id, attempt_id                   |
| completion           | command_id, attempt_id                   |
| outbox               | command_id                               |
| decision             | decision_id, attempt_id                  |
| consumption          | decision_id, attempt_id, correlation_key |
| receipt              | command_id, attempt_id                   |
| runtime_scope        | None; scope_key is already a JSON tuple  |
| runtime_intent       | command_id                               |
| runtime_acceptance   | command_id                               |
| recovery_journal     | recovery_id, command_id                  |
| recovery_fence       | recovery_id, command_id                  |
| recovery_observation | recovery_id                              |
| recovery_closure     | recovery_id                              |
| recovery_barrier     | recovery_id                              |
| recovery_active      | recovery_id                              |

New run5_runtime_format and run5_recovery_format own successor counters; run5_usage owns
the required one-row semantic-use marker. Shared run_format retains the published bundle
hash, with its predecessor counts frozen. Shared run_meta owns version/ownership/clock;
run_manifest and run_artifact remain immutable shared content. Every FK, unique and active
index stays within the appropriate family or targets shared immutable content as declared.

Freeze FORMAT4_IDENTITY to migrations.slice(0,4). Keep explicit FORMAT3/FORMAT4 descriptors
for old transitions. Full physical validation must recognize partial known successor
families while comparing each requested format's exact schema. Format5 recovery is read
from its real family; it must never take format3's empty-recovery branch.

Current-format physical corruption/trigger tests target run5_ tables; historical3↔4 tests
use an actual pinned format4 producer. Keep the existing pinned format3 fixture unchanged.
The new predecessor fixture pins genuine b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda.

## Migration Plan

Under BEGIN IMMEDIATE, validate genuine format4 completely before copying. Populate
successor rows from validated records, changing only raw-key fields; copy payload bytes
unchanged. Set the intended version and hash inside the uncommitted transaction so the
existing full validator can audit the successor. Audit every row, count and key relationship,
then COMMIT; COMMIT is publication. Any error rolls the whole transaction back. Corrupt
predecessors refuse without a guessed repair. Fresh bootstrap builds the complete current
format5; ordinary open rejects predecessor formats without mutating them.

A persisted usage marker is set transactionally with every applied new-format semantic
reply, including ownership and manifest changes, through the existing finish boundary.
Duplicate/refused clock observations and shared immutable artifact retention are explicit
exceptions; observed clocks are never rolled backward during downgrade. Marker updates
must verify actual affected rows so suppressed marking cannot leave downgrade enabled.
API downgrade validates the full successor and unused marker; raw down SQL independently
refuses used/missing/corrupt markers before DROP. Unused downgrade removes successor-only
structures and restores/audits the exact predecessor identity. Already-loaded format4
writers must refuse after publication, including queued and BUSY calls. Artifact retention
and refusal-clock exceptions cannot change execution, ownership or history under mismatch.

## Risks / Trade-offs

Parallel state costs metadata space; retained tables become stale after new writes, making
used downgrade unavailable. JSON escaping expands some IDs and changes physical ordering;
public reads preserve decoded/numeric ordering. A new codec alone is not a repaired store.
The unbounded-key indexing problem for a second durable provider remains separate.

## Approval and Verification

The user accepted JSON encoding and the explained UUID recommendation with “ok let's do
this” on2026-10-31. This authorizes implementation/tests of the discussed preserving
transition, not operator migration/main/prod. Tests must cover actual save/read/retry/reopen,
all referenced key families, populated migration, old-writer fencing and direct/API down.
Every new check needs an observed production-path fault and adjacent Proof comment.
