/** Identifies a failure from the saved-plan write so transports classify only that boundary. */
export class SavedPlanWriteError extends Error {
  constructor(readonly writeCause: unknown) {
    super('Saved-plan write failed', { cause: writeCause });
    this.name = 'SavedPlanWriteError';
  }
}
