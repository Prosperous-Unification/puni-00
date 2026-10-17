## 1. Foundation: sparse persistence

- [x] 1.1 Inspect ADR 0031, original memo, Stage 7a resolver, callers, stores and migration allocations.
- [x] 1.2 Write and watch real memory/SQLite source conformance RED for sparse facts and transactions.
- [x] 1.3 Add the precise stored type, internal port and explicit source inventory registration.
- [x] 1.4 Add memory facts, coordinated source binding and unit-of-work snapshot ownership.
- [x] 1.5 Add SQLite audited repository and fresh additive migration with guarded down.
- [x] 1.6 Watch independent production-path safety mutations fail; record adjacent Proof comments.
- [x] 1.7 Run focused conformance/store/migration tests, migration lint/rollback, scoped checks and pinned OpenSpec; record evidence.

## 2. Public writer and history

- [ ] 2.1 Write failing structured-node authorization, set/clear, malformed input and concurrency cases.
- [ ] 2.2 Implement shared command, HTTP/MCP/batch registration, revision/event and undo/redo semantics.
- [ ] 2.3 Prove explicit equal-default survives clear/undo, authorization refusal and stale history replay.

## 3. Lifecycle and transfer

- [ ] 3.1 Write first-child hand-down, child removal, deletion/step-usage and project lifecycle RED.
- [x] 3.1.1 Write step-removal sparse-reference refusal, authorization, corruption and atomicity RED.
- [x] 3.1.2 Write first-child sparse-preservation refusal, admitted-scope rollback, corruption and shared HTTP RED.
- [x] 3.2.1 Implement authoritative memory/SQLite refusal and shared HTTP 409; prove guard omissions.
- [x] 3.1.3 Write move destination sparse-preservation refusal, admitted-scope rollback, corruption and undo/redo RED.
- [x] 3.2.3 Implement required admitted-scope move destination guard before mutation and replay guard; preserve exact 409 nodes and prove each boundary.
- [x] 3.1.4 Write deletion sparse-owner refusal RED for leaf/cascade, promote survival, admitted scope, exact HTTP details and redo-delete/undo-create/undo-duplicate replay.
- [x] 3.2.4 Implement exact removed-owner sparse refusal before forward mutation and compensating deletion; prove policy refusal, trusted-state throws, rollback and journal outcomes independently.
- [x] 3.1.5 Write forward duplication sparse-source refusal RED, exact ordered nodes, pre-allocation atomicity, trusted-state failures, admitted batch scope and mounted single/mixed commands.
- [x] 3.2.5 Implement required admitted sparse source reader after size refusal and before IDs/stamps/writes; prove scope, ordering, detachment and required failures.
- [x] 3.1.6 Write restore destination sparse-preservation RED for redo-create/undo-delete, preceding-patch rollback, history outcomes, trusted failures and precedence controls.
- [x] 3.2.6 Implement admitted restore destination guard after deletion-state refusal and before mutation; prove independent omissions, late reads, overbroad reads and swallowed throws.
- [x] 3.1.7 Write terminal project drain sparse validation RED for both incident directions, trusted corruption/storage failures, raw finish/release/reclaim, exact bystanders and installed event rollback.
- [x] 3.2.7 Implement synchronous transaction-local incident sparse validation after drain/dependency checks and before deletion; prove each ownership, range, required-read and transaction boundary independently.
- [ ] 3.2 Implement atomic remap/refusal and snapshot/history ownership of sparse facts.
- [x] 3.2.2 Implement required admitted-scope sparse create guard before writes; preserve typed node details through the shared 409 and prove each boundary.
- [ ] 3.3 Write copy/import/export/saved-plan version and ID remapping RED; allocate current schema versions.
- [x] 3.3.1 Write saved-plan schema/capture/diff RED and explicit schema7 upgrade; allocate schema8 only.
- [x] 3.3.2 Implement detached source captures, canonical policy preservation and current/legacy readers; prove each safety boundary with watched faults.
- [x] 3.3.3 Write v9 JSON export preservation fence RED for direct/captured evidence and isolated/shared routes.
- [x] 3.4.1 Implement required same-snapshot sparse export evidence and typed unsupported_step_parallelism refusal; prove changed boundaries.
- [ ] 3.4 Implement transports, duplication, captures, compatibility readers and recovery tooling.
- [ ] 3.5 Prove no lifecycle/transfer path drops, invents, widens or silently defaults an override.

- [x] 3.6.1 Write browser plan-writer sparse refusal RED for step deletion, commands, busy release and completed-prefix refresh.
- [x] 3.6.2 Add explicit decoder cases and readable preservation wording; prove independent case/wording omissions and rerun scoped frontend typecheck.

## 4. Resolution, scheduling and UI

- [x] 4.0 Add the pure concrete-node resolver only: detached inherited/explicit provenance, exact pair and both maximum validations; prove equality, sibling isolation, mutation isolation and resource-rule composition independently. Keep all consumers unchanged.

- [x] 4.0.1 Capture the supplied numeric maximum once; prove a getter returning 2 then 1001 cannot escape validation through a second read.
- [ ] 4.1 Write explicit-before-default live read, Fast and optimized request parity RED.
- [ ] 4.2 Implement resolution, hashing/cache versions and independent optimized publication validation together.
- [ ] 4.3 Prove person/pool clamps, zero-duration non-consumption and stale publication refusal.
- [ ] 4.4 Write step-cell inheritance/clear/equal-default interaction RED; implement editor and rendering.

## 5. Release

- [ ] 5.1 Prove compatible readers/lifecycle guards and refusal of old-writer downgrade with retained facts.
- [ ] 5.2 Implement phased writer admission after incompatible writers drain and documented recovery.
- [ ] 5.3 Complete full feature verification, exact-SHA host gate, review and authorized release.
