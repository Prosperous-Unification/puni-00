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
