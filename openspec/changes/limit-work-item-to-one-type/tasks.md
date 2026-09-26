## 1. Refuse several types at the command boundary

- [ ] 1.1 Red: mounted patch and batch over HTTP and MCP with two `typeIds` or `typeRefs` return `work_item_takes_one_type` and write nothing; zero and one still replace; two successive single-type patches in one batch leave the second. Work-item creation takes no types today and is out of scope.
- [ ] 1.2 Lower the type list limit to one with the new refusal in the command normalizers and regenerate OpenAPI and MCP schemas.
- [ ] 1.3 Negative proof: restore the limit of ten; watch the mounted refusal fail, restore, add adjacent `Proof:`.

## 2. Hold the invariant inside the write transaction

- [ ] 2.1 Red: a service-level authored write with two types, bypassing the normalizer, is refused; a batch containing it is refused atomically; undo/redo restore exact sets including a conflict; no authored command reaches the restoration path.
- [ ] 2.2 Check the resulting type set in the work-item service transaction, not only at the HTTP boundary.
- [ ] 2.3 Negative proofs: remove the transactional check; route an authored patch through the restoration path. Watch the service-level refusal and the authored-path test fail, restore, add adjacent `Proof:`.

## 3. Read a type conflict without choosing

- [ ] 3.1 Red: a row stored with two types reads with both, its unrelated edits succeed, and keeping one is a single undoable write.
- [ ] 3.2 Expose the conflict on reads from the unchanged `typeIds` array and update conformance fixtures that seed two types.
- [ ] 3.3 Negative proof: truncate the read to the first type; watch the conflict read test fail, restore, add adjacent `Proof:`.

## 4. Refuse multi-type import rows

- [ ] 4.1 Red: import of a row with two types is refused naming it, with no partial write, for current and earlier document versions; copy and duplication carry a conflict unchanged.
- [ ] 4.2 Add the row check to import preparation.
- [ ] 4.3 Negative proof: skip the import check; watch the import refusal fail, restore, add adjacent `Proof:`.

## 5. Make the Type cell single-select

- [ ] 5.1 Red: fe-01 component tests for replace, clear, create-and-select, the flagged conflict with keep-one, and one-line height.
- [ ] 5.2 Implement single selection and the conflict affordance in the Type cell.
- [ ] 5.3 Negative proof: append instead of replace; watch the replace test fail, restore, add adjacent `Proof:`.

## 6. Verify

- [ ] 6.1 Run affected tests, format, lint, typecheck, build, OpenSpec validation and the host gate; record outputs and proofs in verify.md.
