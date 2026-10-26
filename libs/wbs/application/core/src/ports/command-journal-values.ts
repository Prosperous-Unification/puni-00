/**
 * Whose undo stack: one per project, account and **acting person**.
 *
 * `personId` is the agent person a machine or consent credential is pinned to
 * (`wbs-machine-credentials` A12, A20) and null for an account acting as
 * itself. A consent principal acts as its human's account, so keying the stack
 * on the account alone let an agent's undo pop its human's browser edits, and
 * two agent keys bound to one account undo each other's.
 *
 * The key is the person, not the credential: two credentials pinned to the
 * same agent person — two concurrent consents, or two API keys — share one
 * stack, and either can undo or clear the redo of the other's edits. A rotated
 * key keeps its history for the same reason.
 * `actingPersonOf` in `@wbs/contracts` names the person.
 */
export interface UndoStack {
  readonly projectId: string;
  readonly userId: string;
  readonly personId: string | null;
}

/** Whether one {@link UndoStack} has anything to undo or redo. */
export interface UndoState {
  undoable: boolean;
  redoable: boolean;
}
