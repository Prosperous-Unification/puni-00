# verify — add-child-and-quiet-expansion

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 121 passed, 0 failed. This change was valid without issues. File-scoped bunx prettier --check exited 0 for every new file.

## Planned checks — pending implementation

- **Pending:** Focused table and card tests for the menu action, last-child order, Name focus, failed create, first-child estimate hand-down and one undo.
- **Pending:** Flat-plan toolbar test covering Collapse all, first-child creation, remount and the saved per-project expansion key; assert that no no-nested hint or message appears.
- **Pending:** Nested-plan Collapse all and Expand all tests, plus filtering's forced expansion and saved-state preservation.
- **Pending R5 proof:** Remove the successful-create ancestor expansion; a collapsed-branch child visibility test must fail. Restore and add an adjacent Proof: comment naming the observed failure.
- **Pending R5 proof:** Reintroduce the unconditional empty-map write on flat-plan Collapse all; the first-child/remount test must fail. Restore and record its output.
- **Pending R5 proof:** Break first-child hand-down or single undo; a production-path create test must fail. Restore and record its output.
- **Pending:** Format, lint, typecheck, OpenSpec validation, browser checks and host gate. No application behavior has been verified for this packet at spec time.
