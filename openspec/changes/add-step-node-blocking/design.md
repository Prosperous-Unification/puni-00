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

## Deletion closure (task 3.0.4)

`remove` reads direct blockage before cascades, explicitly clears each removed fact using conditional `replace_blockage`, deletes owners, then sets agreed surviving-parent blockage after it is a leaf. Agreement uses every former leaf per project step and the maximum original blocked time without a zero seed; done facts remain eligible and proxy readings never enter the fold. Progress keeps the existing deletion fold.

Both subtree command directions carry optional `deletionState`: exact removed blockage, surviving `parentId`, expected `parentBlockages`, prior `restoredParentProgress`, and forward `handedBlockages`. The decoder validates owner membership, unique pairs, safe times, parent shape and owner-bound historical progress. References include metadata owners and steps even for empty parent snapshots. Legacy markerless commands retain their existing behavior.

The existing complete `Preconditions.moveProgress` mechanism also guards deletion parents, including empty sets. Modern deletion metadata requires that owner snapshot in both directions. Collection captures final batch state; flip captures current facts; the existing revision equality and exact written-pair rebase rules carry neighbors without accepting unrelated facts. Historical parent progress restoration participates in exact progress write attribution. Restore compares the complete parent blockage set, clears it conditionally before inserting children, restores prior parent statements after the repository removes the handed-up keys, then restores exact subtree blockage after owners exist. Redo compares the complete removed-owner blockage set before conditional clearing or deletion. All steps run within the command runner transaction; stale refusal keeps the existing journal-discard policy.

`delete_state_v1` is a separate replay capability, detected by own metadata property recursively in both stored directions and counted once per journal row, including empty metadata. Compose protects both existing admission phases. Kubernetes #428/#429 follow-up integration is coordinated in F11.1c: its independent replay inventory and all capability validators must recognize this marker before guarded deletion histories enter that delivery path. No live action belongs to this slice.

## Task 3.0.5: project-step deletion closure

Use the existing shared `stepIsInUse` rule for both fast refusal and fresh transactional refusal. `StepHoldings`, `StepUsageRows`, core `StepInUse` and `StepRemoval` require a separate `blockages` count. SQLite counts raw direct facts, independent of derived readings and done precedence. The existing deletion transaction explicitly deletes the restrictive step foreign key facts and includes their owners in its revision union before the project bump. Existing scoped replay reference validation refuses historical commands naming a removed step before restoration; conditional replacement remains the inner replay defense.

Only the HTTP older-server boundary permits an absent count. The frontend preserves that unknown state and renders it explicitly in the confirmation. No migration, document/saved-plan/scheduler version, public command or replay discriminator/capability changes belong to this slice.

## Saved-plan direct capture (task 4.2.1)

Against exact parent `f069af34082983003b0714ca59fd8532a396d605`, saved input schema6 is current and schema7 is free. This slice allocates schema7 only. Plan document v8 and scheduler schema16 remain unchanged; no migration is needed.

`PlanInputReads.stepBlockages` contains only direct `(workItemId, stepId, blockedAt)` facts read inside the existing SQLite snapshot or memory capture turn. The detached fold preserves them and the canonical body sorts them by owner and step identity. Derived readings and proxy causes are excluded. Retained facts on done nodes remain captured. Schema1–6 upgrade through the existing chain to an empty direct collection without rewriting stored bytes. Current schema7 capture and stored-body normalization for comparison refuse absent/malformed collections, duplicate pairs, unknown owners/steps, non-leaf owners and unsafe/fractional timestamps. Comparison keys the collection by owner and step and reports additions, removals and time changes under progress. Saved bytes/hash change with direct facts; scheduler input and full Fast output remain unchanged.

## Plan-document direct transfer (task 4.2.2)

Exact parent `b4537c83e8f0767f14b6e9304b6475c63e7cc239` writes plan document v8;
this slice allocates v9. Saved input schema7 and scheduler schema16 remain current.
Version 9 requires root `stepBlockages` containing only direct owner/step/time facts.
Exports detach and sort facts by owner and step, omit row `blockages` and derived
`blockageCauses`, and throw on missing leaf maps or invalid trusted references/time.
Versions 1–8 normalize empty or absent blockage collections to no facts; nonempty
root facts or row aliases refuse `invalid_body` before they could be discarded.
Current malformed collections and times refuse at their indexed field paths.
Import preparation refuses unknown/non-leaf owners, unknown steps and duplicate
pairs. The import resource remaps both file identities and writes exact timestamps
after subtree insertion in the existing unit of work, before announcements.
A refused store write throws; any later failure rolls the entire import back.
Import is a blockage writer, so enabling it has the same incompatible-writer drain
obligation as command writes during blue/green overlap.
Navigator accepts external v7 and v8: both strict wire shapes exclude the new
root field, while their internal adapters supply v9 and empty facts. External v9
remains refused. Version 7 retains task schema1 with workday estimates; version 8
retains task schema2 with native estimate units. Schedule calculations and progress are independent of these facts.

## Compose stopped-writer transition (task 6.4)

Every backend swap stops previous writers before candidate startup. Preflight validates environment, the existing SQLite file and ledger, live routing and exposure state, then decodes the effective merged Compose configuration. It rejects unexpected aliases, published ports, dependencies, links, unresolved env files and host networking. The resolved configuration is stored privately, escaping literal dollars against later interpolation, and startup uses only that snapshot with forced recreation, no dependencies and no pull. This closes the unchanged-idle-container alias retention found during review of the first implementation.

Candidate database identity comes from its effective DB_PATH through a writable directory bind. Main-file binds and any shadow mount affecting the main/WAL/SHM/journal family refuse. Canonical directory plus filename must match the main file and each existing sidecar; renamed main-file aliases, redirected sidecars and dangling sidecar links refuse. This deliberately narrows supported layouts so the fixed `/data` probe and every writer observe the same SQLite family. Docker Config.Env and Mounts.Destination independently resolve the outgoing and idle database files; both canonical paths must equal the candidate. Incidental data mounts and same-directory/different-filename assumptions are insufficient. The complete writable mount inventory still refuses unknown overlapping writers, and the exact identity/database inventory is rechecked after managed writers stop.

Separate exclusive directory-synced stop, capture-identity and possible-exposure records survive phases and process loss. The incoming digest must also pass independent read-only fact/replay admission after every old writer stops and before any boot; post-boot admission remains a readback. Exposure is recorded **before candidate boot**, because boot can write or listen without the shared alias. Migration, health and compatibility remain prerequisites for shared-alias/Caddy admission, but cannot make a booted candidate read-only. All post-start failures retain exposure and forbid automatic down, old snapshot restore or incompatible old-writer restart. The capture remains evidence, not downgrade authority. The read-only recovery CLI proves stopped writers and fact/replay compatibility only; operator recovery must independently account for schema/ledger and every post-boot write. SQLite StepBlockage activation remains a separate application boundary.

Stored-state one-offs keep production mounted read-only but copy the quiescent main database and retained WAL/journal to a private writable scratch directory. They omit source SHM and run the existing independent production query commands with scratch DB_PATH. SQLite may create scratch SHM after clean WAL close or read retained WAL; it never opens the production database. Only optional sidecar ENOENT is accepted; unreadable files fail. Writer exclusivity and stopped-state proof are prerequisites for a coherent copy.

Unmanaged non-overlapping writable regular mounts require physical device/inode comparison against every existing SQLite family file. Writable directories require a complete bounded read-only daemon-assisted audit of every nested inode; special files and symlinks refuse. The pinned, already-local candidate runs as UID0 with only DAC_READ_SEARCH, 128MiB/16-process bounds, no network, no pull, read-only root and two read-only binds. This resolves host EACCES for Docker volume paths without changing production permissions. Every inode is visited across nested devices; 100k entries, depth 64 and 15 seconds bound each audit. Invalid/incomplete receipts or audit failure refuse before stop. This admits shipped Caddy/registry volumes without trusting service names or Docker volume ownership as exclusion proof. Distinct regular files remain admitted and read-only mounts are unaffected. The recovery DB_PATH itself goes through the same full-family directory resolver as candidate/managed writers before Docker inventory or probes, including the no-container case.
