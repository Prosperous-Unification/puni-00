## 1. Name step nodes in the domain

- [ ] 1.1 Red: domain tests for `StepNodeRef`, the `sn1` encoding and leaf node enumeration including a stepless project; mounted refusals for unknown prefix, arity, unknown work item or step, parent and a step node ID from another project.
- [x] 1.2 Implement the value, codec and enumeration with JSDoc on each symbol.
- [ ] 1.3 Negative proofs: accept a parent work item; skip the same-project check; accept an unknown step ID. Watch each mounted refusal fail, restore, add adjacent `Proof:`.

## 2. Store and suggest step codes

- [x] 2.1 Red: `suggestStepCode` cases (punctuation, leading digit, reserved `s2-…`, collision suffix, repeated collisions on a 32-character stem), step create/rename keeping the code, reserved and duplicate refusals through the mounted route.
- [x] 2.2 Add additive `migration.sql` beside `down.sql`, the store column and partial unique index, and the uncoded union in contracts.
- [x] 2.3 Negative proof: drop the reserved-code check; watch the mounted refusal fail, restore, add adjacent `Proof:`. Run migration lint, apply and rollback.

## 3. Backfill uncoded steps during a swap

- [x] 3.1 Red: a step inserted without a code reads as uncoded; the backfill CLI codes it idempotently; a backfill failure fails the swap with the manual command.
- [x] 3.2 Implement the CLI and wire it into the swap after the old colour drains.
- [x] 3.3 Negative proof: make the swap ignore the CLI's exit status; watch the swap-failure test fail, restore, add adjacent `Proof:`.

## 4. Resolve step references

- [x] 4.1 Red: canonical `010.dev` and `020.2.review`, ordinal alias match and mismatch, unknown code, parent, stale revision.
- [x] 4.2 Implement `resolveStepReference` and its HTTP/MCP resolve request.
- [x] 4.3 Negative proof: skip the revision check; watch the stale-reference test fail, restore, add adjacent `Proof:`.

## 5. Address commands by step node ID

- [x] 5.1 Red: mounted estimate, clear, actual, measure, progress and assignment by step node ID; both-or-neither refusal; old request shapes unchanged; one undo per edit.
- [x] 5.2 Extend command normalizers and generated OpenAPI/MCP schemas; expose node IDs and references on work-item reads.
- [x] 5.3 Negative proof: accept a request with both address forms; watch the refusal test fail, restore, add adjacent `Proof:`.

## 6. Resolve the graph through one seam

- [ ] 6.1 Red: graph resolution tests for workflow and legacy provenance; run existing Fast and solver goldens and request-hash tests through the seam.
- [ ] 6.2 Implement `resolveStepNodeGraph` and move Fast and the solver builder onto it.
- [ ] 6.3 Negative proof: drop one workflow edge; watch a Fast golden fail, restore, add adjacent `Proof:`.

## 7. Journal node mappings on hand-down and hand-up

- [ ] 7.1 Red: mounted first-child create moves every node fact including the assignment, and undo/redo restore the original step node IDs; a move keeps node IDs; last-child deletion keeps today's fold.
- [ ] 7.2 Move and journal assignments on hand-down; return and journal the mapping from the create transaction.
- [ ] 7.3 Negative proofs: omit the mapping from the journal; skip the assignment move. Watch the undo identity and assignment hand-down tests fail, restore, add adjacent `Proof:`.

## 8. Carry codes through plan documents

- [ ] 8.1 Red: code round trip, earlier-version import suggesting codes, missing/malformed/reserved/duplicate refusal, export refused while a step is uncoded, project copy.
- [ ] 8.2 Allocate the next document version with the dependency and allowance changes; implement converters.
- [ ] 8.3 Negative proofs: accept a duplicate code; accept a reserved code; export with an uncoded step. Watch each refusal fail, restore, add adjacent `Proof:`.

## 9. Name the node in the step cell

- [ ] 9.1 Red: fe-01 component tests for `010.dev · Dev`, copy reference, copy link and the uncoded state.
- [ ] 9.2 Implement the detail line and actions.
- [ ] 9.3 Negative proof: render the alias instead of the canonical reference; watch the component test fail, restore, add adjacent `Proof:`.

## 10. Verify

- [ ] 10.1 Run affected tests, migration lint and rollback, format, lint, typecheck, build, OpenSpec validation and the host gate; record outputs and proofs in verify.md.
