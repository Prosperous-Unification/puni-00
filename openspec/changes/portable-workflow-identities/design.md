## Context

RunStore.createRun accepts an already formed Run; current production callers do not yet
construct coordinator runs. RunIdCodec accepts strings of 1–256 UTF-16 units. Before this
change, SQLite format4 bound raw IDs directly, whereas payload JSON preserved lone surrogates.
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
use an actual pinned format4 producer. Preserve the existing BB14 production source pin,
worker/protocol bytes and typed format3 fixture behavior. Its current test-only archive,
provenance, IPC, readiness and close/drain host can be extracted into one shared owner,
with wrappers retaining their own compiled pins. Format4 reuses the unchanged strict
legacy wire decoder through a thin adapter and includes that archived dependency in its
provenance. Its worker retains a version-specific bootstrap: reusing the frozen format3
worker would require changing that control or rewriting executable source. The explicit
cost is one historical worker fork; future format4 worker fixes do not update the frozen
format3 control. Reverify direct
and transitive lifecycle/provenance/construction consumers; preserve original causes and
retain fixtures when native closure is unestablished. The new format4 fixture pins genuine
b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda. No archived producer source is refactored.
An in-process genuine-predecessor bridge retains a source lease before importing/opening
its native provider. Only fulfilled native close releases that lease. Host close still
attempts worker shutdown and both pipe drains, then rejects with the retained path and
pending-owner diagnosis while a lease remains. Preserve primary and independent causes;
an opaque open/close rejection never proves quiescence or permits archive removal.

Repeated imports from separate verified archive paths retained distinct predecessor module
graphs; the broad validation measured roughly13GiB in its parent alone. Keep one explicitly
owned, verified b3b archive/module for ordinary in-process fixtures per Bun test process,
with leases for each independent
native store. Share only immutable compiled code, never connections, stores, clocks or
per-case state. Controlled native-fault proofs keep their explicitly isolated verified
imports and prove closure of each exact native connection before test-owned removal.
Genuine IPC workers keep independent source archives and protocols.

Dash's dedicated format4-lifetime-preload installs this source owner before fixture use.
Its single suite teardown awaits pooled-source disposal before calling the existing generic
removeProcessRoot; unknown closure retains both visibly and throws with original causes.
Missing the owner refuses before shared-source allocation. No app dependency is added to
global test infrastructure. A real multi-file child test must establish the preload's actual
scope, cross-file reuse and later-file usability rather than assuming helper hook semantics.
Keep the existing30s hook allowance and60s target budget. Current source provenance,
isolated import-fault ownership, native open/close and missing/late-owner checks remain.

## Migration Plan

Under BEGIN IMMEDIATE, validate genuine format4 completely before copying. Populate
successor rows from validated records, changing only raw-key fields; copy payload bytes
unchanged. Set the intended version and hash inside the uncommitted transaction so the
existing full validator can audit the successor. Audit every row, count and key relationship,
then COMMIT; COMMIT is publication. Any error rolls the whole transaction back. Corrupt
predecessors refuse without a guessed repair. Fresh bootstrap builds the complete current
format5; ordinary open rejects predecessor formats without mutating them.

Both explicit transition pairs share format-transition.ts for inspection, bounded BUSY
acquisition, transaction phases, audits, rollback, native close and the public error class.
Their migration modules retain compiled preparation with explicit unused checks and apply
work, preserving each pair's statement order and failure categories. The original public
module re-exports the same error class. Finite copy SQL remains in migrate-identities.ts.

A persisted usage marker is set transactionally with every applied new-format semantic
reply, including ownership and manifest changes, through the existing finish boundary.
Duplicate/refused clock observations and shared immutable artifact retention are explicit
exceptions; observed clocks are never rolled backward during downgrade. Marker updates
must verify actual affected rows so suppressed marking cannot leave downgrade enabled.
Recovery closure keeps its existing prohibition on history reads between semantic writes
and COMMIT. Its checked usage-marker readback is a separate exact metadata query after
all semantic writes and the marker UPDATE; only clock finalization follows. Tests must
not broaden that exception to arbitrary SELECTs or permit later semantic writes.
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
