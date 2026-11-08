# Private SQLite cleanup component

[Intent](sqlite-cleanup-intent.md). This materializes the previously selected seven-path backup cleanup decision as a complete adapter component, with its two storage paths deferred. It introduces no new main architecture adoption. The authoritative decisions are `/tmp/puni-bounded-backup-cleanup-custody-decision-20261101.md` and `/tmp/puni-backup-five-adapter-component-source-decision-20261103.md` (SHA256 `9bf44f4d1b5bc6859713cc69d4b0445e9f59516f53cb05229f1faac8ddbedb21`).

## Source ownership

| Path under libs/wbs/adapters/store-sqlite/src | Responsibility                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sqlite-cleanup.ts (new)                       | Internal opaque SqliteCleanupUnknown type, createSqliteCleanupFailure factory and isSqliteCleanupUnknown identity guard; private original native client, phase and attribution.                                                             |
| db.ts                                         | Classify actual initialization cleanup throw; protect post-initialization Drizzle construction in openExistingConnection and openReadOnlyConnection. Preserve ordinary primary identity, existing aggregate cause/order, and other openers. |
| database-initialization.db.test.ts            | Genuine initialization/wrapper witnesses and exact one-shot fixture delegation/retirement.                                                                                                                                                  |
| backup.ts                                     | Private operation/acquisition/attempt records, opaque SnapshotCleanupUnknown type and isSnapshotCleanupUnknown guard, direct cleanup and genuine lower-marker propagation.                                                                  |
| backup.db.test.ts                             | Actual backup close/partial-acquisition/propagation/identity witnesses and the existing26 regressions.                                                                                                                                      |

No storage, owner, complete-exclusion, Graph/fixture, barrel, alias, lint/config or public caller change is authorized by this component. The future seven-path composition adds the two existing storage paths under the separate owner sequence. Source leases identify exact current hashes before editing; execution leases are separate.

## Failure contracts

The guard signatures are `isSqliteCleanupUnknown(cause: unknown): cause is SqliteCleanupUnknown` and `isSnapshotCleanupUnknown(cause: unknown): cause is SnapshotCleanupUnknown`. Each opaque view extends Error with an unconstructable module-private type brand. Concrete failure classes and original-resource records stay private. Runtime recognition is exact private identity membership, not message, prototype, public fields, instanceof alone, or recursive AggregateError inspection. The internal SQLite factory is used only by the actual DB boundary; it is not a public raw-client capability.

A genuine failure privately retains the acquired native client or exact descriptor/Connection plus original close receiver/arguments and attempt/outcome, independent of mutable diagnostic errors/cause properties. Snapshot inherits genuine lower SQLite custody by retaining that exact lower failure privately. Changing an outward aggregate's errors array cannot discard these references or alter classification. No raw resource, close, retry, discharge or owner API is exported.

An operation-only refusal with successful cleanup preserves its exact primary object and remains unclassified. A cleanup throw, including a primitive or an after-delegation throw, is UNKNOWN. It gets a genuine failure retaining ordered attribution and originals; fixture knowledge never upgrades production UNKNOWN. Preserve the existing lower DB aggregate primary cause and ordering. Snapshot outward failures gain no raw cause. Existing low-level diagnostics remain sensitive as before; the separate public activation boundary remains responsible for sanitization.

Every acquired directly owned cleanup is enrolled before an error can escape. An attempt is marked before entry, remaining unattempted siblings are still attempted after primary failure or expiry, and no attempted UNKNOWN is retried. Successful calls leave no intentionally open backup-owned connection to transfer or retry later. The five existing backup operations retain signatures and successful semantics; no byte cap, clock, publication or deadline is weakened.

## TDD order and finite first slice

The first slice corrects fixture bookkeeping and adds three literal readonly-initializer cases in the existing test file. Establish exact primary with known successful close; before-delegation cleanup throw; and original close returning before the spy throws. A conservative typed false classifier scaffold is allowed solely to avoid a missing-import/parse RED. The selected before-delegation case must fail its genuine `expect(isSqliteCleanupUnknown(failure)).toBe(true)` assertion before implementing classification. Then the SAME case and both controls must pass. No baseline snapshot failure is relabeled as this RED.

Next extend the same actual contracts to writable initialization, both backup-used Drizzle wrappers, and backup's source/semantic Connection, pinned file/parent and legacy publication descriptors. Cover partial acquisition and complete ordered primary/sibling cleanup attribution before calling the adapter component complete. Freeze literal titles and expanded populations before every execution scope; do not treat this document as a runtime grant.

The existing initialization afterEach unconditionally recloses every retained client. Replace it before fault execution: record actual original acquisition and selected native close entry/return. Never reclose an original whose delegation returned. A deliberately withheld close receives its first native close only during separately labelled fixture retirement after production assertions. An entered native close without an observed return remains unretirable; preserve evidence and STOP, with no retry, inferred EBADF success or removal of its evidence. No unreturned constructor experiment, FFI replacement, process scanner, global registry, forced-GC experiment or held helper is selected.

## Completion and evidence limits

The ordinary26-case backup run is recorded separately in [verification](verify-sqlite-cleanup.md); it establishes neither the new classifiers nor historical TDD/R5. Later finite omission/restoration pairs must break each claimed changed production dependency at its unchanged owning classification/count/attribution consumer. Reachability and original retirement are required; no universal GC, physical-native-close or arbitrary boolean proof is inferred.

A retained failure strongly references its originals only while that failure is itself held. This component does not supply a strong owner root or passive keeper after a caller discards it, nor stop current storage sanitization or lock unwind. The seven-path composition, original75398, constructor exception, BP/OH/GAP/UC2 parents, full CI/host gates, main adoption and deployment remain open. No fresh component may edit or rebind frozen8291.
