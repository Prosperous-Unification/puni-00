# verify — add-child-and-quiet-expansion

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 126 passed, 0 failed. This change was valid without issues. File-scoped bunx prettier --check exited 0 for the four packet files.

## Slice 1 — WBS 010.4.2 (tasks 1–3), 2026-09-27

Focused runs, each through the project's own runner (`env -u CLAUDECODE` for Bun):

- `TZ=UTC bunx vitest run src/components/wbs/plan-structure.test.tsx src/components/wbs/plan-cards.test.tsx` in fe-01: 159 passed. New cases: `adding a child from the row menu` (leaf, parent last-child order, collapsed frozen parent, first child after Collapse all, refused create) and the card's `adds a child through the table’s own handler and opens it into view`. Every pre-existing menu inventory now lists `Add child` after the status entries.
- `plan-filter.test.tsx`: `keeps a flat plan out of collapsed-all, so its first child arrives open` asserts the saved `wbs.expanded.p1` value is unchanged after each flat-plan control, no toast and no `data-fact` on either control; `shows the first child of a flat plan after Collapse all and a remount`. Both failed before the guard (`expected '{}' to be 'true'`, `expected [ '010' ]`).
- `bun test src/controller/work-item.controller.test.ts -t "break an existing dependency"` in be-01: 3 passed — a direct `moveWorkItem` under its own predecessor answers 409 `ancestor`, one whose expanded graph loops answers 409 `cycle`, both with the parent map unchanged; a valid move still answers 200. Before the guard both negatives answered 200.

Review round (Astra, high): two Important findings fixed. A child made from an ancestor shown only by a filter was hidden by that filter; `narrowTree` now takes the rows made under the current filter (`revealRow`, forgotten when the filter changes) and keeps them with their line. The ancestor half of the expansion had no proof; `reveals a child made under a filter and opens every ancestor it sits under` now carries it. Minor: `collectPath`'s throw has a negative, and the toolbar predicate is `hasNestedItems` with JSDoc.

Witnessed R5 faults, each restored afterwards and named by an adjacent `Proof:` comment:

- `addChild`'s `setExpanded` removed: three child-visibility cases (two table, one card) failed with the new row absent.
- Parent-only expansion instead of `collectPath`: the filter case failed on `[ '010', '020' ]` after the filter was cleared. `revealRow` removed: the same case failed with the new row hidden (`[ '010', '010.1', '010.1.1' ]`).
- `collectPath`'s throw replaced with a `break`: its unit case failed on `expected [Function] to throw an error`.
- Flat-plan guard removed from Collapse all: both flat-plan cases failed as above.
- Backend `canReparent` return disabled: both mounted negatives failed on `Received: 200`. Its ancestor loop skipped alone: the `ancestor` case failed on `"error": "cycle"`.
- First-child hand-down (`estimates.moveAll`) skipped: be-01 `hands the estimates back up when it undoes the first child that took them` failed. Add child sends exactly one `createWorkItem({ parentId, afterId, name: '' })` and no other write, so the hand-down and the single undo entry are that command's.

Assumptions: flat-plan controls are inert rather than disabled, keeping their existing `Close every branch`/`Open every branch` hover words and adding no message. The concurrent-edit half of 3.2 rests on the batch runner's write lock: the guard reads rows and edges inside the same locked write. Filtering's forced expansion is untouched, and its existing tests remain the evidence.

## Slice 2 — WBS 010.4.3 (task 4), 2026-09-27

Focused fe-01 runs (`TZ=UTC bunx vitest run … --testTimeout=60000`; the host sat near load 65, and the default 5s timeout failed unrelated layout cases on time alone): plan-structure 45/45, plan-cards 160 and dep-graph 22 (drag-drop included) 168/168 together.

- `dragging a row under another`:
  - The middle zone shows `Move under 020 · Sand` (a `role="status"` overlay under the target, laid over the table so no row moves), and the edges keep their `data-drop` lines.
  - No cue appears over a refused target.
  - A collapsed parent held for 600ms opens without changing the target.
  - An abandoned drag closes what it opened. A pointer that left early opens nothing. A landed drop keeps the parent open, sending one `moveWorkItem(w4, w1, w2)`.
  - A dependency-invalid move is refused before sending, with its reason.
  - A server `cycle` refusal is re-worded as the move's own and closes the parent the gesture opened.
- `moving a row under a chosen parent`: the Move under… picker sends one move as the last child. It offers neither the row nor its descendants. Alt+Right and Alt+Left still indent and outdent. The card menu opens the same picker.
- `moveRefusalFor` (fe-01's port of be-01 `canReparent`) has unit cases for `ancestor` both ways, the expanded `cycle` and a valid move.
- Existing cases already cover frozen-number rows moving with their labels, the concurrent-edit cancel and the self/descendant refusal. They stay green.

Witnessed R5 faults, each restored, with adjacent `Proof:` comments:

- Timer `clearTimeout` removed: `does not open a parent the pointer left before the wait ran out` failed.
- Drag-end restore removed: `closes the parent it opened when the drag is abandoned` failed.
- Refused-drop restore removed: `explains a refused move and closes the parent the gesture opened` failed.
- Self/descendant check removed: the subtree refusal, the no-cue case and both picker cases failed.
- Client dependency pre-check skipped: `refuses a move that would break a dependency, and sends nothing` failed.

Review round (Astra, high): no Critical findings; both Important findings fixed.

1. Hover-opened parents were written into the saved expansion, so leaving the project mid-drag could persist them. They are now an overlay the table draws and the preference never sees. A drop commits them through `keep`.
2. The client cycle branch had no mounted negative. `refuses a move whose dependencies would loop once expanded` now carries it: no cue, no request, a reason, and no picker entry.

Minor findings, all fixed:

- The picker renders an empty state.
- `cueTopPx` is required, and a missing frame throws.
- Renamed `formatDestination` and `translateMoveRefusal`.

Faults re-witnessed after the rewrite:

- Timer clear: 1 failed.
- End reset: 1 failed.
- Refused restore: 1 failed.
- Hover written to the saved expansion: 2 failed.
- Client cycle branch answering `null`: the new loop case failed.

Assumptions:

- "Exit" means leaving the gesture (drag end, or a drop that moves nothing), not leaving the row. Leaving the row would close a parent the moment the pointer moved into its children.
- The picker offers every row a middle drop would be taken by, except the current parent. The top level stays Alt+Left's job.

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
