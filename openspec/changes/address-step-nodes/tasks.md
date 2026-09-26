## 1. Name step nodes in the domain

- [ ] 1.1 Red: domain tests for `StepNodeRef`, the `sn1` encoding and parse refusals (unknown prefix, arity, parent, cross-project), and leaf node enumeration including a stepless project.
- [ ] 1.2 Implement the value, codec and enumeration with JSDoc on each symbol.
- [ ] 1.3 Negative proof: let the parser accept a parent work item; watch the parent-refusal test fail, restore, add adjacent `Proof:`.

## 2. Store and suggest step codes

- [ ] 2.1 Red: `suggestStepCode` cases (punctuation, leading digit, reserved `s2-…`, collision suffix, 32-char cap), step create/rename keeping the code, reserved and duplicate refusals through the mounted route.
- [ ] 2.2 Add additive `migration.sql` beside `down.sql`, the store column and partial unique index, and the uncoded union in contracts.
- [ ] 2.3 Negative proof: drop the reserved-code check; watch the mounted refusal fail, restore, add adjacent `Proof:`. Run migration lint, apply and rollback.

## 3. Backfill uncoded steps during a swap

- [ ] 3.1 Red: a step inserted without a code reads as uncoded; the backfill CLI codes it idempotently; a backfill failure fails the swap with the manual command.
- [ ] 3.2 Implement the CLI and wire it into the swap after the old colour drains.
- [ ] 3.3 Negative proof: make the swap ignore the CLI's exit status; watch the swap-failure test fail, restore, add adjacent `Proof:`.

## 4. Resolve step references

- [ ] 4.1 Red: canonical `010.dev` and `020.2.review`, ordinal alias match and mismatch, unknown code, parent, stale revision.
- [ ] 4.2 Implement `resolveStepReference` and its HTTP/MCP resolve request.
- [ ] 4.3 Negative proof: skip the revision check; watch the stale-reference test fail, restore, add adjacent `Proof:`.

## 5. Address commands by step node ID

- [ ] 5.1 Red: mounted estimate, clear, actual, measure, progress and assignment by step node ID; both-or-neither refusal; old request shapes unchanged; one undo per edit.
- [ ] 5.2 Extend command normalizers and generated OpenAPI/MCP schemas; expose node IDs and references on work-item reads.
- [ ] 5.3 Negative proof: accept a request with both address forms; watch the refusal test fail, restore, add adjacent `Proof:`.

## 6. Resolve the graph through one seam

- [ ] 6.1 Red: graph resolution tests for workflow and legacy provenance; run existing Fast and solver goldens and request-hash tests through the seam.
- [ ] 6.2 Implement `resolveStepNodeGraph` and move Fast and the solver builder onto it.
- [ ] 6.3 Negative proof: drop one workflow edge; watch a Fast golden fail, restore, add adjacent `Proof:`.

## 7. Journal node mappings on hand-down and hand-up

- [ ] 7.1 Red: mounted first-child and last-child edits move node facts and undo/redo restore the original step node IDs.
- [ ] 7.2 Return and journal the mapping from the structural transaction.
- [ ] 7.3 Negative proof: omit the mapping from the journal; watch the undo identity test fail, restore, add adjacent `Proof:`.

## 8. Carry codes through plan documents

- [ ] 8.1 Red: code round trip, earlier-version import suggesting codes, duplicate/reserved refusal, project copy.
- [ ] 8.2 Allocate the next document version with the dependency and allowance changes; implement converters.
- [ ] 8.3 Negative proof: accept a duplicate code; watch the import refusal fail, restore, add adjacent `Proof:`.

## 9. Name the node in the step cell

- [ ] 9.1 Red: fe-01 component tests for `010.dev · Dev`, copy reference, copy link and the uncoded state.
- [ ] 9.2 Implement the detail line and actions.
- [ ] 9.3 Negative proof: render the alias instead of the canonical reference; watch the component test fail, restore, add adjacent `Proof:`.

## 10. Verify

- [ ] 10.1 Run affected tests, migration lint and rollback, format, lint, typecheck, build, OpenSpec validation and the host gate; record outputs and proofs in verify.md.
