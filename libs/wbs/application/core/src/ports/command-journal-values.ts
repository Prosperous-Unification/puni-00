/** Whether an account has anything to undo or redo on one project. */
export interface UndoState {
  undoable: boolean;
  redoable: boolean;
}
