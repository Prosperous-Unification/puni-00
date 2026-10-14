## Context

`StepState` is stored in `step_progress` as `in_progress` or `done`; an unknown step has no row. Work-item readiness and holds are leaf-scoped facts. `resolveDependencyGraph` already builds the complete `StepNodeGraph`, and `nodeReadingsOf` is the canonical reading projection. Reuse both; never add parallel step readings. However, `blockedByProxyOf` deliberately expands dependencies to whole leaves and documents a false positive when a different step on a held predecessor is complete. `withoutHeldSubtrees` removes whole leaves only. Step-level blocking must therefore have a separate read model and must not reuse the work-item proxy fold.

## Goals / Non-Goals

**Goals:** Persist a direct blockage statement on one step node; expose a deterministic node reading and root causes; carry the fact through undo, structural edits, transfer, saved plans and rollback; show it accessibly in the step UI; prove schedule input and result are unchanged.

**Non-Goals:** Change `StepState`, work-item status precedence, the leaf-level work-item proxy behavior, schedule eligibility, or add step readiness, step `on_hold`, cancellation, skipped work, or per-node capacity.

## Decisions

- Keep blockage in a separate audited table keyed by the existing `(work_item_id, step_id)` identity. Absence means no direct blockage. Do not store a derived reading or cause.
- Add `setStepBlocked({ workItemId, stepId, isBlocked })` to the existing project command boundary. Reuse ownership checks, command journal, write coordination and conditional undo. A done step refuses a new direct blockage; equivalent writes are no-ops. Progress changes leave the fact intact, with done taking precedence on read.
- Extend `nodeReadingsOf` and `nodeReadingOf` with direct blockage and precise root causes from the complete unreduced graph. Preserve skipped/done/row-hold precedence; direct blockage follows row hold and precedes in-progress; running attempts stop incoming proxy propagation. Preserve waiting from workflow/authored predecessors only. Use all edge provenances for blockage propagation and never copy row proxy onto every step. Validate legacy endpoints before `expandToLeaves`; reject duplicate node identities and missing edge endpoints. Stepless boundaries carry row holds internally but never become public steps. FS/SS/FF propagation is informational, not proof that temporal inequalities are unsatisfied. Work-item readiness stays context for the user. Direct blockers seed graph propagation; running and done nodes stop it. The node projection reports root blocker identities and does not call `blockedByProxyOf`.
- Apply work-item holds to its nodes for node-level readings. Preserve the work-item status fold and current leaf-level proxy independently.
- Treat the statement as belonging to the work represented by a leaf's steps: hand it down with progress when a first child is added; clear a parent's statement when unrelated work is moved under it; omit it on duplication; restore it exactly on undo; hand it up only when all former leaves agreed.
- Add a nullable-by-absence SQLite table through an additive migration and a refusal guard in `down.sql`. Extend swap inventory and rollback save/remove/restore so an older image never starts after blockage facts are silently discarded.
- Add the fact to plan-document and saved-plan payloads. Older versions upgrade with no facts. Validate ownership at the import boundary; refused imports leave no partial project.
- Keep canonical schedule input, schedule hashes, schedules, and solver contracts byte-identical. The blocker is a planning reading, not a schedule filter.

## Risks / Trade-offs

- A step may read blocked while its work item remains in progress or ready. The step UI must make that scope obvious; changing the work-item fold later will be a separate decision.
- A separate table may later be consolidated with a broader node-lifecycle model; this costs an additive migration and reader transition.
- Node proxy causes can be wrong if graph expansion omits a supported endpoint scope or relationship type. Tests must compare the derived node graph against explicit multi-step examples and distinguish `A.dev` from `A.qa`.
- Import/export and rollback version allocation can collide with unintegrated branches. Recheck the actual integration head before assigning versions or migration timestamp.

## Stored cycles stay readable

The complete graph can contain a stored cycle despite write-time guards, as the existing
read contract models a cycle with an unscheduled tree and `scheduleError: 'cycle'`.
Projection must not recursively throw on that modeled state. Compute intrinsic readings
first, then propagate the finite root sets monotonically over every validated edge.
A root is added to each silent node at most once; done, running and directly held/blocked
nodes remain barriers to incoming roots. Derive waiting only from intrinsic done
predecessors on nonlegacy edges: done cannot arise from propagation. This preserves all
edges and terminates even around stored cycles. The dependency write guard still refuses
new cycles, and malformed endpoints still throw.

## Historical progress compatibility and structural replay

Historical versions can leave `step_progress` on rows that later gained children.
Preserve these statements in the existing row fold and stored/exported facts; exclude
only known parent-owned progress from the leaf node projection. Unknown work-item or
step references still throw. A migrated-state regression must prove both live read
modes remain readable without changing their row fold. Inventory and explicit repair
remain release obligations; do not silently delete legacy statements or require their
repair before a compatible read can open the plan.

When unrelated work moves beneath a leaf, capture and clear destination progress
before the store move, preserve incoming progress, and journal restoration after the
inverse move. Redo clears before moving again. Include the cleared destination in
`touched`. Do not add progress hand-up when a last child moves away. Replay guards
must refuse move/delete undo atomically if the newly leaf parent acquired newer
progress, even when revision checks are bypassed by the test fixture. Restore neither
the tree nor stale facts over that newer statement. Structural blockage restore retains
its timestamp; progress replay retains the existing replay timestamp semantics.

## Migration Plan

Deploy the additive table with compatible readers and replay guards. Drain incompatible writers before enabling blockage writes: old binaries can invalidate node ownership during the blue/green overlap. Inventory existing parent progress and document explicit repair while compatible reads continue preserving it. The new runtime reads and writes the table, while swap checks record whether it contains facts. On rollback, save and remove those facts before an older image starts, and restore them only after the new schema is re-applied. The guarded `down.sql` refuses while facts remain. Plan document and saved-plan readers upgrade older bodies with empty blockage collections.

## Open Questions

- Allocate migration timestamp, plan-document version and saved-plan schema version against the exact integration head; reserved candidates against `0ea6a1166242edf694294d1ed6e715fb7e1aed60` are migration `20261013140000`, plan document v9 and saved-plan input schema v7; scheduler schema stays v16, but unmerged branches may move these.
- Current `resolveStepNodeGraph` covers legacy and typed FS/SS/FF endpoints. Do not repeat the historical graph extraction or introduce historical `stepReadings`.

## Persistent fact and recovery shape

`step_blockage` holds `(work_item_id, step_id, blocked_at)` and the usual audit
columns. Its pair key and foreign keys protect identity; a safe-integer timestamp
constraint and insert/update triggers enforce valid time, common project and leaf
ownership. Work-item deletion cascades for old-writer compatibility; step deletion
remains restrictive until the structural command explicitly accounts for its facts.
Repository reads validate left-joined references so corrupted state is never hidden
by an inner join, including missing owner/step, crossed project and parent ownership.

Recovery file version 1 preserves all columns. Saving exclusively creates the
destination; an existing path refuses without changing its bytes. The decoder rejects malformed
columns, timestamps, versions and duplicate identities. `remove` compares the current
capture with the file in one transaction, while `restore` requires an empty table
and relies on schema reference/ownership checks in the same transaction as inserts.
The CLI opens existing databases with the usual verified pragmas and explicit
readwrite permission; absence never creates a new database. Swap compatibility uses
an image vocabulary plus an independent database inventory at both existing guard
phases. Missing source/database state refuses; only genuine older CLI/table absence
has the modeled empty vocabulary/inventory. Command-history compatibility remains
an explicit prerequisite when new journal variants are enabled in the command slice.

## Move closure (task 3.0.3)

A true reparent into a current leaf captures its progress and blockage before any
write. The forward journal clears destination readiness/hold, progress and exact
blockage facts, moves the incoming subtree, then sets agreed readiness/hold and
blockage on the old parent if it lost its last child. The inverse clears those
handed-up facts, moves the subtree back, restores destination progress and exact
blockage, then restores readiness/hold. Every step runs while its fact owner is a
leaf. Progress restoration keeps the existing `set_progress` replay timestamp
semantics. No new progress hand-up is added.

Blockage agreement is per project step over every former leaf in the moved
subtree: each must hold a direct fact, including facts retained on done nodes.
The old parent's blocked time is the maximum of those timestamps, with no zero
seed so negative timestamps remain valid. Incoming subtree facts are preserved.
Replay into a current leaf compares its complete progress set against an explicit
optional `expectedProgress` snapshot captured on the old parent before its last
child departed. Equality is order-independent over owner, step, state and stated
time; absent snapshot means an empty set. Exact historical rows survive in place,
including audit columns, because clearing and restating them would change their
provenance. Added, removed or changed progress refuses replay even when revisions
were forged unchanged. Any residual blockage still refuses unconditionally after
the recorded clears. Move snapshot owners remain revision-tracked across both
journal directions through `expectedProgressOwnersOf`; other command owner tracking
is unchanged. Same-parent
reorder and existing-parent progress history are preserved. Work-item deletion,
project-step deletion and the public blockage setter remain separate slices.

## Destination progress preconditions and release compatibility

A replay leaf guard runs after recorded destination clear commands, so it cannot
protect a known step that those commands would already have deleted. A move that
clears destination progress records its destination owners in optional
`Preconditions.moveProgress`. The full owner/step/state/stated-time set is checked
before any batch step, preserving added, removed or changed facts on refusal.
Owner keys, owner-bound rows and unique steps are validated at the journal read
boundary; owners and steps participate in scope checks. Collected command batches
retain these owners and capture the final committed set.

Undo continues restamping restored destination progress. Successful flip captures
that actual current set for the next direction. Neighboring replay retains the
existing revision-equality condition and captures guarded owner sets before the
selected command applies. Its exact progress write pairs come only from that
selected direction, recursively including batches and explicit structural rows.
The complete captured set outside those pairs must match the recorded set,
including absence; a mismatch retains the full stale snapshot. On a match, only
written pairs take their actual post-replay values, and unwritten pairs retain
their recorded values. Rename has no progress write pairs and cannot accept a
silent step change. A Dev write can restamp Dev without accepting a changed,
added or removed QA fact. No owner-wide write permission is inferred. This is
separate from the inverse move's unchanged historical-parent allowance.

The existing candidate CLI now advertises replay capabilities
`replace_blockage` and `move_progress_v1` separately from decoder discriminators.
Compose's independent database probe inventories nested forward/inverse move
snapshot fields and precondition snapshot metadata, including empty arrays/maps,
requiring `move_progress_v1` once per journal row. Both existing swap phases refuse
an older or prior image lacking the token even with no blockage facts/commands.
Malformed trusted preconditions refuse the inventory. Fact recovery cannot erase
journal compatibility obligations.

### Kubernetes pre-cutover obligation

Compose is the currently enabled release path. The prepared Kubernetes delivery
path does not yet enforce this replay capability check. Before importing guarded
history or the first Kubernetes rollout, F11 must compare an independent database
replay inventory with incoming/previous image digest capabilities after the writer
stops and before capture/migrate. Rollback must check before `rolloutTiers` or
`reopenWrites`; refusal must retain the fence and lease. Required proofs cover
nested inverse/precondition markers and watched omissions. Migration capability
capture/restore alone is insufficient. This slice implements Compose protection
and records the Kubernetes prerequisite without claiming it is protected.
