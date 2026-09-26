# verify — add-child-and-quiet-expansion

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 126 passed, 0 failed. This change was valid without issues. File-scoped bunx prettier --check exited 0 for the four packet files.

## Planned commands — pending implementation

- `bun run test:unit` and `bun run e2e` for affected behavior, plus focused component tests through the frontend's configured runner.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` and file-scoped `bunx prettier --check`.
- `bin/h2puni-gate.sh <sha>` at the committed implementation SHA on h2puni; record the printed running SHA.

## Planned checks — pending implementation

- **Pending:** Focused table and card tests for the menu action, last-child order, Name focus, failed create, first-child estimate hand-down and one undo.
- **Pending:** Flat-plan toolbar test covering Collapse all, first-child creation, remount and the saved per-project expansion key; assert that no no-nested hint or message appears.
- **Pending:** Nested-plan Collapse all and Expand all tests, plus filtering's forced expansion and saved-state preservation.
- **Pending R5 proof:** Remove the successful-create ancestor expansion; a collapsed-branch child visibility test must fail. Restore and add an adjacent Proof: comment naming the observed failure.
- **Pending R5 proof:** Reintroduce the unconditional empty-map write on flat-plan Collapse all; the first-child/remount test must fail. Restore and record its output.
- **Pending R5 proof:** Break first-child hand-down or single undo; a production-path create test must fail. Restore and record its output.
- **Pending R5 proof:** Bypass backend graph validation on a mounted direct move request; dependency-invalid reparenting must fail its refusal test. Restore and record output.
- **Pending:** Drag middle-zone last-child placement, “Move under …” cue, edge insertion lines, ~600ms valid-parent hover opening, stable target, cancellation restoration and successful-drop retention.
- **Pending:** Refusal and concurrency cases: self/descendant, dependency-invalid reparenting, changed tree, server refusal with restored preview and explanation, frozen-number labels and one move undo.
- **Pending:** Keyboard/mobile arbitrary-parent Move under… picker and existing Alt+Right/Alt+Left navigation.
- **Pending R5 proof:** Leave a hover timer active after exit; cancellation/expansion test must fail. Restore and record output.
- **Pending R5 proof:** Retain preview after refused write or accept a self-drop; refusal test must fail. Restore and add adjacent Proof: comment.
- **Pending:** Format, lint, typecheck, OpenSpec validation, browser checks and host gate. No application behavior has been verified for this packet at spec time.
