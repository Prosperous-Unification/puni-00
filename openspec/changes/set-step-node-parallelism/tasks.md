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
- [ ] 3.2 Implement atomic remap/refusal and snapshot/history ownership of sparse facts.
- [ ] 3.3 Write copy/import/export/saved-plan version and ID remapping RED; allocate current schema versions.
- [ ] 3.4 Implement transports, duplication, captures, compatibility readers and recovery tooling.
- [ ] 3.5 Prove no lifecycle/transfer path drops, invents, widens or silently defaults an override.

## 4. Resolution, scheduling and UI

- [ ] 4.1 Write explicit-before-default live read, Fast and optimized request parity RED.
- [ ] 4.2 Implement resolution, hashing/cache versions and independent optimized publication validation together.
- [ ] 4.3 Prove person/pool clamps, zero-duration non-consumption and stale publication refusal.
- [ ] 4.4 Write step-cell inheritance/clear/equal-default interaction RED; implement editor and rendering.

## 5. Release

- [ ] 5.1 Prove compatible readers/lifecycle guards and refusal of old-writer downgrade with retained facts.
- [ ] 5.2 Implement phased writer admission after incompatible writers drain and documented recovery.
- [ ] 5.3 Complete full feature verification, exact-SHA host gate, review and authorized release.
