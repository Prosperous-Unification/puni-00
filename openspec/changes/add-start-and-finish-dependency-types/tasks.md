## 1. Gate rollout and code rollback

- [ ] 1.1 Red: production swap refuses FS-only code when SS/FF rows exist; compatible readers accept the rows.
- [ ] 1.2 Deploy compatible readers before writes and add the code rollback guard with a manual recovery command. Verify Stage A's migration pair supports SS/FF or ship an additive pair.
- [ ] 1.3 Negative proof: bypass the code guard; watch the production swap refusal fail, restore, add adjacent `Proof:`.

## 2. Validate SS/FF graph semantics

- [ ] 2.1 Red: parent Cartesian, whole-scope boundary selection, negative FF weight and combined-graph cycle cases.
- [ ] 2.2 Extend shared expansion to SS/FF with the Stage A acyclic slice-graph rule.
- [ ] 2.3 Negative proof: omit a parent pair or clamp an FF weight; watch graph goldens fail, restore, add adjacent `Proof:`.

## 3. Extend typed commands

- [ ] 3.1 Red: mounted SS/FF mutations, uniqueness by type, unsupported type refusal and legacy command compatibility.
- [ ] 3.2 Extend command schemas and generated HTTP/MCP contracts while preserving Stage A request shapes.
- [ ] 3.3 Negative proof: bypass unsupported-type validation; watch mounted test fail, restore, add adjacent `Proof:`.

## 3a. Preserve history and batch atomicity

- [ ] 3a.1 Red: SS/FF undo/redo identity, stale refusal and later-command cycle refusal in a batch.
- [ ] 3a.2 Carry type through journal replay and validate the combined graph atomically.
- [ ] 3a.3 Negative proof: bypass stale-history refusal; watch mounted test fail, restore, add adjacent `Proof:`.

## 4. Preserve types in import and export

- [ ] 4.1 Red: SS/FF round-trip, missing/unsupported type and dangling/duplicate refusal.
- [ ] 4.2 Allocate the next archive version and carry type through explicit converters.
- [ ] 4.3 Negative proof: drop FF or accept a missing type; watch import test fail, restore, add adjacent `Proof:`.

## 4a. Preserve type through copy

- [ ] 4a.1 Red: copied relationships remap IDs and retain SS/FF type.
- [ ] 4a.2 Extend project/subtree copy mapping.
- [ ] 4a.3 Negative proof: retain a source endpoint ID; watch copy test fail, restore, add adjacent `Proof:`.

## 4b. Preserve immutable saved-plan reads

- [ ] 4b.1 Red: a later live type edit does not reinterpret historical SS/FF.
- [ ] 4b.2 Capture type with saved-plan endpoint identities for read/display.
- [ ] 4b.3 Negative proof: read live type for history; watch saved-plan test fail, restore, add adjacent `Proof:`.

## 4c. Expose working-plan type edits

- [ ] 4c.1 Red: a later command sees an SS/FF edit and refused edits leave retained state unchanged.
- [ ] 4c.2 Publish committed type through the working-plan read.
- [ ] 4c.3 Negative proof: return stale type after update; watch batch-read test fail, restore, add adjacent `Proof:`.

## 5. Build weighted solver constraints

- [ ] 5.1 Red: FS/SS/FF wire and CP-SAT goldens including unknown zero-duration endpoints.
- [ ] 5.2 Enforce weighted edges and real FS/SS/FF boundary checks.
- [ ] 5.3 Negative proof: omit one SS edge or real-boundary check; watch validation fail, restore, add adjacent `Proof:`.

## 6. Protect FF quantization

- [ ] 6.1 Red: 0.030/0.021 counterexample and forged one-unit-too-small W_FF.
- [ ] 6.2 Add W_FF to versioned wire and recompute it independently before publication.
- [ ] 6.3 Negative proof: lower wire weight or skip recomputation; watch the counterexample fail, restore, add adjacent `Proof:`.

## 7. Generalize Fast placement

- [ ] 7.1 Red: longer FF successor legitimately starts before its predecessor under resource constraints.
- [ ] 7.2 Replace chronological person queues with availability placement that respects weighted predecessor bounds.
- [ ] 7.3 Negative proof: restore chronological-only placement; watch golden fail, restore, add adjacent `Proof:`.

## 8. Rebuild resource-order replay

- [ ] 8.1 Red: replay of actual intervals with an earlier-starting FF successor.
- [ ] 8.2 Reconstruct resource-order evidence from placed intervals.
- [ ] 8.3 Negative proof: replay topological order instead; watch replay test fail, restore, add adjacent `Proof:`.

## 9. Compute latest dates and float

- [ ] 9.1 Red: latest-date, float and critical-path goldens with negative FF weights.
- [ ] 9.2 Propagate weighted constraints through backward analysis without clamping.
- [ ] 9.3 Negative proof: clamp negative FF weight; watch float golden fail, restore, add adjacent `Proof:`.

## 10. Preserve outcome truth and cache identity

- [ ] 10.1 Red: Fast deadline miss with feasible optimized order, timeout unknown, quantized-only infeasibility and stale cache after type edit.
- [ ] 10.2 Distinguish these outcomes, bump wire and scheduler contract versions, update hash and corpora.
- [ ] 10.3 Negative proof: label Fast miss infeasible or accept old cache; watch outcome test fail, restore, add adjacent `Proof:`.

## 11. Show SS/FF in the editor and chart

- [ ] 11.1 Red: type picker, one-click FS default, full accessible wording and mobile card.
- [ ] 11.2 Implement type selector and labels.
- [ ] 11.3 Negative proof: change one-click default to FF; watch UI test fail, restore, add adjacent `Proof:`.
- [ ] 11.4 Red: SS start/start, FF finish/finish, unknown tick and collapsed proxy geometry.
- [ ] 11.5 Draw relationship-specific routes and proxies.
- [ ] 11.6 Negative proof: attach FF arrow to placeholder finish; watch geometry fail, restore, add adjacent `Proof:`.

## 12. Verify

- [ ] 12.1 Run mounted/transfer/scheduler/browser checks, rollback guard, format, lint, typecheck, build, OpenSpec validation and host gate. Record outputs and observed faults in verify.md.
