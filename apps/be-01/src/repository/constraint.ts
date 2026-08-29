/**
 * Whether a thrown error is SQLite refusing a write because a foreign key
 * pointed at a row that is not there.
 *
 * `bun:sqlite` reports constraint violations as messages rather than typed
 * errors, so this is a string test — the same translation
 * `UserRepository.create` makes for a duplicate username, and
 * `StepRepository.add` for a duplicate step name.
 *
 * **It does not say which key.** SQLite's message names no column, so a caller
 * that turns this into a refusal must establish *which* of the request's ids is
 * missing before it does — otherwise it reports a confident lie about the one
 * that was fine. {@link WorkItemService} does that by re-reading the project's
 * steps and rethrowing when the step is still there.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes('FOREIGN KEY constraint failed');
}
