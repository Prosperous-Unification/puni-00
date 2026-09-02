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

/**
 * The physical columns of one unique index, spelled the way SQLite quotes them
 * in a violation message: `table.column`, in the index's own order.
 *
 * A stale spelling here is silent — the message simply stops matching and the
 * refusal the caller owed becomes an uncaught 500. That happened once already:
 * `20260831120000_rename_role_to_step` renamed the table and
 * `StepRepository`'s literal kept saying `role`. Every entry of
 * {@link UNIQUE_INDEXES} is therefore asserted against a migrated database by
 * `constraint.db.test.ts`.
 */
export type UniqueIndexColumns = readonly [string, ...string[]];

/**
 * Every unique index a repository translates into a modeled refusal, by the
 * name the refusal has in the domain.
 *
 * Kept together rather than beside each caller so the test above has one list
 * to walk; a literal written inline is a literal nothing checks.
 *
 * Proof that a stale spelling is not cosmetic: `refuses a name the project
 * already holds, and leaves the steps as they were` and `refuses a rename onto
 * a name already in use, leaving both alone` in `step.test.ts` were watched
 * failing with `stepNameInProject` left at the pre-rename `role.project_id,
 * role.name` against the renamed schema, on `SQLiteError: UNIQUE constraint
 * failed: step.project_id, step.name` escaping the repository instead of
 * becoming a `taken`. Observed 2026-08-31.
 */
export const UNIQUE_INDEXES = {
  personName: ['person.name'],
  serviceName: ['service.name'],
  stepNameInProject: ['step.project_id', 'step.name'],
  tagName: ['tag.name'],
  teamName: ['service_team.name'],
  username: ['users.username'],
  workItemTypeName: ['work_item_type.name'],
} as const satisfies Record<string, UniqueIndexColumns>;

/**
 * Whether a thrown error is SQLite refusing a write because it would have made
 * a second row with the same key under `index`.
 *
 * A string test for the same reason {@link isForeignKeyViolation} is one, and
 * unlike that one it **does** say which key: the message names the index's
 * columns, so a different constraint failing at the same call site stays an
 * unknown and still throws.
 */
export function isUniqueViolation(err: unknown, index: UniqueIndexColumns): boolean {
  return (
    err instanceof Error && err.message.includes(`UNIQUE constraint failed: ${index.join(', ')}`)
  );
}
