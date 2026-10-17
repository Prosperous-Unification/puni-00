## Foundation boundary

ADR 0031 and the original step-node design memo choose sparse pair-keyed policy over a
mandatory leaf × step occurrence table. `StoredStepParallel` holds only the two identities
and the authored `maxParallel`. `StepParallelStore` offers project/targeted reads, set/replace
and remove. There is deliberately no `moveAll` contract in this slice: lifecycle semantics
and transport integration require their own TDD slices before a public writer is admitted.

`PlanTransactionalStores.stepParallels` names the catalog entry. SQLite `buildStores` binds
both public coordinated and admitted unit-of-work repositories. Memory `MemoryState` owns
cloneable rows, binds the store to the same work-item/step authorities, coordinates writes,
and copies rows on commit. The working-plan catalog passes through this dormant store solely
for catalog completeness; no command invokes it and no resource projection reads it.

## SQLite shape and trust

The fresh migration `20261015110000_add_step_node_parallelism` was allocated after inspecting
all folders; the highest existing allocation was `20261015100000_add_step_blockage_activation_receipt`.
`step_parallel` has composite primary key `(work_item_id, step_id)`, integer/range check,
foreign keys, audit columns, step lookup index, and insert/update project and leaf triggers.
The forward migration creates only new structures, preserving old-binary SQL compatibility
while the table is empty. It does not establish semantic rollout compatibility for authored facts.

Reads use left joins so dangling owner/step references cannot disappear. A full project read
refuses an ownerless fact because it cannot safely assign it to a project. Other corrupt facts
are checked in the selected project; targeted reads validate selected owners. Missing references
throw; they are never an inherited/default state. SQL provides pair uniqueness; memory checks
retained duplicate facts. Both return detached values ordered by owner, step position and ID.

SQLite upsert preserves creation audit and changes update audit, then bumps owner
revision in one savepoint nested in the source unit of work. Memory provides fact parity and
terminal unit-of-work atomicity; like its other fixtures it does not simulate SQL audit storage.
Guarded down checks the retained count before dropping anything and refuses with a concrete
instruction to preserve and explicitly remove facts; no rollback extraction tool ships here.

## Remaining feature design

Public editing must follow structured node authorization and common command journaling.
Before enabling writes, lifecycle paths must remap/refuse facts consistently, step deletion
must include usage, and transports/snapshots must allocate versions against current schemas.
Stage 7a resource reads, Fast, optimized input hashing/building and independent publication
validation must adopt explicit-before-default resolution together. Person and pool clamps retain
existing rules. Release must install compatible readers and mutation guards, drain incompatible
writers and then enable writing; downgrade must refuse unsupported retained policy. UI must
show inheritance and clearing explicitly. These are authored requirements, not implemented claims.

## Evidence

Focused source parity, adapter corruption and raw SQL migration tests exercise production
paths. `verify.md` and `evidence/receipts.json` record observed injected faults. No proof comment
is added until its mutation caused the named negative to fail.

## Pure resolver prerequisite (2026-10-17)

`resolveStepParallel` accepts `StepNodeRef`, the row maximum and an optional
`StoredStepParallel`; it returns `{ kind: 'inherited' | 'explicit', maxParallel: number }`.
It validates both numeric inputs and the supplied fact's exact pair. Provenance is derived
from presence alone. The supplied numeric property is read once, and that captured number is both validated and
returned; this also prevents a changing accessor from bypassing validation. The copied number prevents later fact mutation from changing
an already resolved value. Stores retain existence, leaf and project checks. Resource-rule
composition is tested directly without admitting this prerequisite into any live consumer.
The unavailable later sparse transport head is not reconstructed by this slice.

## Saved-plan preservation prerequisite (2026-10-17)

The bounded successor captures `stepParallels` independently of derived node resources.
Canonical input schema 8 requires this sparse collection; schema 7 upgrades explicitly to an
empty collection in memory without editing historical bytes. Capture and stored-read boundaries
reject malformed collections, invalid maxima, duplicates, absent references and parent ownership.
Canonical ordering and pair-keyed capacity differences preserve explicit equality and sibling
absence. Both source captures read facts from their existing consistent snapshot and detach them.
This slice does not enable public writing, live resolution, scheduling or document version 10.

## Step-removal prerequisite (2026-10-17)

`StepRemoved` and `RemoveStepOutcome` carry a typed sparse-reference refusal with
readonly structured node references. SQLite queries only the target step selected through
its requested project, inside the existing gated synchronous transaction. A left owner join
keeps malformed trusted references visible; owner project, leaf ownership and maximum are
validated before either cascade path can mutate. No sparse fact is deleted implicitly.

Memory source bindings and the legacy fixture factory pass the same `MemoryStepParallelTable`
and owner authority to both stores. Removal validates target facts, refuses duplicates, sorts
and copies references, and staged source rollback owns all prior writes. Raw fixture
removal re-finds the exact target after owner awaits so concurrent removals cannot
reuse a stale array index or delete a sibling. Service authorization
runs before adapter reference lookup; resource, closed refusal registry and HTTP
mappings preserve the typed 409.
Generic non-cascade usage can retain its existing precedence. No public writer is enabled.

## Version 9 export preservation prerequisite (2026-10-17)

Sparse facts cannot be represented by the current archival writer. Both direct and captured
JSON serialization validate the required private collection and refuse valid nonempty policy
with bare `unsupported_step_parallelism`; version 9 and zero-fact canonical bytes remain stable.
The isolated path receives a required narrow sparse reader through service options and DI,
with the production application binding its actual same-database repository. The shared path
captures and copies that collection inside its existing read transaction, before closing the
owned connection. It never rereads through the isolated port after capture. Existing modeled
uncoded-step precedence applies to valid evidence; unreadable or corrupt shared evidence
throws while being captured under R5. Markdown remains a human schedule projection.

## First-child create preservation prerequisite (2026-10-17)

Until sparse hand-down/remapping and history ownership ship, create refuses a valid
nonnull parent with retained sparse facts, including explicit equality with its row
default. A required narrow reader belongs to each WorkItemService graph. The command
graph reads the current admitted source scope, with working-plan project and lifetime
checks, after project/admission/parent validation and before stamping, ID allocation
or any writes. Selected existing-parent facts are also read so corruption throws.

Valid facts yield `referenced_by_step_parallel` with copied structured node references
in authoritative store order. Command index/kind and exact node details reach the
shared HTTP 409 schema for single-command and multi-command `/commands` requests. Empty policy retains existing
create/undo/redo behavior. Atomicity claims cover the command unit of work; direct
standalone calls do not gain cross-call isolation. No public writer, remap, history
schema, migration, document version, scheduler or UI changes ship in this slice.

## Move destination preservation prerequisite (2026-10-17)

Forward move reads sparse facts for every valid nonnull destination through the required
admitted command reader after actor, membership and structural refusals, before stamping,
clearing destination statements or writing. Valid retained facts refuse with copied
`referenced_by_step_parallel` nodes. Existing-parent and same-parent selected reads validate
corruption; root moves do not read policy. Incoming subtree and unrelated facts retain their
owners. The compensating `applyMove` path separately reads its nonnull destination after
membership validation and refuses valid retained policy through `ApplyOutcome`; the runner
surfaces `stale_undo`, rolls back replay writes and discards the stale history entry under
existing policy. Corrupt trusted evidence throws. This bounded refusal does not enable
remapping, public writing, schema/version changes or complete the lifecycle parent task.

## Work-item deletion preservation prerequisite (2026-10-17)

`step_parallel.work_item_id` cascades with work-item removal while deletion snapshots do
not yet own sparse facts. Forward deletion therefore reads only the owners it removes:
the exact subtree for leaf/cascade, the root alone for promote. The required admitted
reader runs after authorization, context and required strategy checks, before stamping,
ID allocation or mutation. Retained valid facts yield detached ordered references under
`referenced_by_step_parallel` and the existing shared command HTTP 409 schema. Surviving
promoted children and unrelated owners keep their facts; selected corrupt facts throw.

`applyDelete` independently reads `command.remove` after trusted replay root/subtree,
metadata and other pre-mutation checks. This covers redo-delete, undo-create and
undo-duplicate without depending on operation names or owner revision drift. Retained
valid policy refuses through `ApplyOutcome`, so the runner rolls back earlier replay
writes and discards the stale entry under existing `stale_undo` policy. Unreadable or
corrupt evidence throws, preserves the exact journal and returns HTTP 500. No sparse
history schema, remapping, adapter/schema/migration or public writer ships in this slice.
