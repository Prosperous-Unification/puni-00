## 1. Expand and validate the authored graph

- [ ] 1.1 Red: whole/step, parent Cartesian and synthetic-slice graph cases, including a self-slice refusal.
- [ ] 1.2 Implement one shared expansion and combined-graph cycle check.
- [ ] 1.3 Negative proof: omit one expanded parent pair; watch the graph refusal test fail, restore, add adjacent `Proof:`.

## 2. Guard every graph-changing write

- [ ] 2.1 Red: mounted legacy and typed writes, reparent, step reorder/delete and estimate-driven legacy-anchor change, each with an atomic cycle refusal.
- [ ] 2.2 Call the shared graph check on each resulting state before persistence.
- [ ] 2.3 Negative proof: bypass the legacy-write or estimate-edit guard; watch its mounted refusal fail, restore, add adjacent `Proof:`.

## 3. Persist typed links and guard migration rollback

- [ ] 3.1 Red: typed-row validation, uniqueness, absent/unreadable migration state and rollback refusal with rows present.
- [ ] 3.2 Add the typed table in additive `migration.sql` beside `down.sql`, and guard rollback with the recovery command.
- [ ] 3.3 Negative proof: bypass the typed-row rollback guard; watch production-path refusal fail, restore, add adjacent `Proof:`.

## 4. Expose typed commands through HTTP and MCP

- [ ] 4.1 Red: mounted add/update/remove and old `addDependency` compatibility, invalid references and duplicate/cycle 4xx.
- [ ] 4.2 Implement typed discriminators and regenerate HTTP/OpenAPI/MCP contracts, retaining old request shapes.
- [ ] 4.3 Negative proof: remove old-command compatibility or typed input validation; watch mounted tests fail, restore, add adjacent `Proof:`.

## 5. Keep history and batches atomic

- [ ] 5.1 Red: one-command undo/redo identity, stale refusal, batch-local references and later-command cycle refusal.
- [ ] 5.2 Journal exact typed state and validate combined graph during undo/redo and batch replay.
- [ ] 5.3 Negative proof: bypass stale undo or replay graph validation; watch mounted refusal fail, restore, add adjacent `Proof:`.

## 6. Version import and export

- [ ] 6.1 Red: typed/legacy round-trip and malformed or dangling new-format refusal.
- [ ] 6.2 Allocate an archive version after earlier changes and implement explicit converters.
- [ ] 6.3 Negative proof: drop an endpoint scope or accept a missing step; watch transfer test fail, restore, add adjacent `Proof:`.

## 6a. Remap copied relationships

- [ ] 6a.1 Red: whole-project copy and subtree duplication remap internal IDs without dangling references.
- [ ] 6a.2 Implement copy remapping under the existing external-link policy.
- [ ] 6a.3 Negative proof: retain a source work-item ID; watch copy test fail, restore, add adjacent `Proof:`.

## 6b. Capture saved-plan history

- [ ] 6b.1 Red: a later step reorder or relationship edit does not change a saved-plan read.
- [ ] 6b.2 Capture typed IDs, scopes, steps and type for immutable read/display.
- [ ] 6b.3 Negative proof: resolve history against live steps; watch saved-plan test fail, restore, add adjacent `Proof:`.

## 6c. Expose working-plan mutations

- [ ] 6c.1 Red: a later command in an admitted batch sees the typed edit and a refused edit leaves retained state unchanged.
- [ ] 6c.2 Publish committed typed state through the working-plan read.
- [ ] 6c.3 Negative proof: return the pre-edit retained state; watch batch-read test fail, restore, add adjacent `Proof:`.

## 7. Schedule expanded FS edges in Fast

- [ ] 7.1 Red: later successor step, parent expansion, unknown predecessor and dynamic legacy reach Fast goldens.
- [ ] 7.2 Feed resolved FS edges into Fast placement and date projection.
- [ ] 7.3 Negative proof: omit a later-step edge; watch its golden fail, restore, add adjacent `Proof:`.

## 8. Carry FS edges through solver publication

- [ ] 8.1 Red: solver wire/hash and independently rejected expanded-edge violation.
- [ ] 8.2 Carry all edges through CP-SAT and independent materialized response validation.
- [ ] 8.3 Negative proof: remove one response edge check; watch rejection test fail, restore, add adjacent `Proof:`.

## 9. Retire stale scheduler results

- [ ] 9.1 Red: cache built without typed edges cannot publish after a typed edit.
- [ ] 9.2 Bump `SCHEDULER_CONTRACT_VERSION`, update hash and regenerate versioned corpora.
- [ ] 9.3 Negative proof: reuse the old contract version; watch cache-retirement test fail, restore, add adjacent `Proof:`.

## 10. Expose editing and graph geometry

- [ ] 10.1 Red: one-click default, Customize without write, keyboard/mobile and refused picker choices.
- [ ] 10.2 Implement picker, chip, card and accessible edit flow.
- [ ] 10.3 Negative proof: write on Customize activation; watch the no-write test fail, restore, add adjacent `Proof:`.
- [ ] 10.4 Red: selected FS ticks, unknown placeholder and collapsed-parent proxy geometry.
- [ ] 10.5 Draw actual boundary arrows and grouped proxies.
- [ ] 10.6 Negative proof: anchor an arrow to placeholder width; watch geometry fail, restore, add adjacent `Proof:`.

## 11. Verify

- [ ] 11.1 Run mounted/domain/scheduler/browser checks, migration lint and rollback, format, lint, typecheck, build, OpenSpec validation and host gate. Record outputs and every observed fault in verify.md.
