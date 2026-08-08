import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Role, RoleWritten } from './index';
import { bumpProject } from './revision';
import { role } from './schema';

/**
 * Whether a thrown error is SQLite refusing a second role of the same name in
 * one project.
 *
 * The message rather than a typed error, because `bun:sqlite` has no typed
 * one — the same translation `UserRepository.create` makes for usernames. It
 * names the index's columns so that a different constraint failing here is
 * still an unknown, and still throws.
 */
function isDuplicateName(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes('UNIQUE constraint failed: role.project_id, role.name')
  );
}

/**
 * A project's roles, and the writes that change them.
 *
 * Its own repository rather than more methods on `ProjectRepository`: removing
 * a role spans four tables — estimates, assignments, the role and the revisions
 * of everything that lost a row — and that transaction has nothing to do with a
 * project's own columns.
 *
 * Every write here moves the **project's** revision, because a role is a
 * satellite of the project: adding, renaming or removing one changes what every
 * estimate in it means. See `project.revision` in `schema.ts`.
 */
export class RoleRepository {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * The project's roles, in the order the rows were written.
   *
   * No `ORDER BY`, matching `ProjectRepository.rolesOf`, which this does not
   * replace. Role order is not a contract yet — `role.position` arrives with
   * the schedule change that needs one — so a caller that cares must not read
   * one into this.
   */
  listByProject(projectId: string): Promise<Role[]> {
    return this.db.select().from(role).where(eq(role.projectId, projectId));
  }

  async findById(roleId: string): Promise<Role | null> {
    const rows = await this.db.select().from(role).where(eq(role.id, roleId)).limit(1);
    return rows.at(0) ?? null;
  }

  /**
   * Writes the role and the project's bump together, or writes neither.
   *
   * The refusal comes from the unique index rather than from a read first: two
   * clients adding `Design` at the same moment both see it free.
   *
   * Proof: with the `isDuplicateName` branch removed, `refuses a name the
   * project already holds, and leaves the roles as they were` fails with the
   * raw `SQLITE_CONSTRAINT_UNIQUE` instead of a refusal — the 500 this
   * translation exists to prevent. With `bumpProject` removed, `adds a role and
   * moves the project’s revision` fails, 1 expected and 0 read. Both watched
   * 2026-08-08.
   */
  async add(toAdd: Role): Promise<RoleWritten> {
    await Promise.resolve();
    try {
      this.db.transaction((tx) => {
        tx.insert(role).values(toAdd).run();
        bumpProject(tx, toAdd.projectId);
      });
      return { ok: true, role: toAdd };
    } catch (err) {
      if (isDuplicateName(err)) return { ok: false, reason: 'taken' };
      throw err;
    }
  }

  /**
   * Renames one role, or says why it could not.
   *
   * A refused rename writes nothing, the project's revision included: a request
   * that changed nothing must not defeat somebody else's precondition.
   *
   * Proof: with the empty-`returning` branch reporting success instead,
   * `reports a role that is gone rather than pretending to rename it` fails —
   * a rename of nothing answered `ok`; watched 2026-08-08.
   */
  async rename(roleId: string, name: string): Promise<RoleWritten> {
    await Promise.resolve();
    try {
      return this.db.transaction((tx) => {
        const rows = tx.update(role).set({ name }).where(eq(role.id, roleId)).returning().all();
        const renamed = rows.at(0);
        // Nothing was updated, so there is no role by that id — and nothing to
        // bump. Rolling back is not needed (the update wrote nothing), but the
        // early return keeps the bump and the write in the same branch.
        if (renamed === undefined) return { ok: false, reason: 'not_found' };
        bumpProject(tx, renamed.projectId);
        return { ok: true, role: renamed };
      });
    } catch (err) {
      if (isDuplicateName(err)) return { ok: false, reason: 'taken' };
      throw err;
    }
  }
}
