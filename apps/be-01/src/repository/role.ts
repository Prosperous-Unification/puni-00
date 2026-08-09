import { eq, inArray, max } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { NewRole, Role, RoleRemoval, RoleStore, RoleUsageRows, RoleWritten } from './index';
import { ROLE_POSITION_STEP } from './index';
import { bumpProject, bumpWorkItems } from './revision';
import { assignment, estimate, role, workItem } from './schema';

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
export class RoleRepository implements RoleStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * The project's roles, in role order.
   *
   * The `ORDER BY` is load-bearing, not tidiness: without it SQLite answers
   * `WHERE project_id = ?` from the `role_project_name` index and hands back
   * the rows in **name** order, which puts a role called `Analysis` in front of
   * `Dev` however late it was added — and role order is what a work item's
   * slices run in.
   *
   * Proof: with the `orderBy` removed, `reads a role added later last, however
   * its name sorts` fails with `Analysis, Dev, QA`; watched 2026-08-09.
   */
  listByProject(projectId: string): Promise<Role[]> {
    return this.db
      .select()
      .from(role)
      .where(eq(role.projectId, projectId))
      .orderBy(role.position, role.id);
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
   * The place it takes is read **inside** the transaction, so two roles added
   * at the same moment cannot both be told the same last position — one of them
   * would then sort by id, which is a UUID, which is no order at all.
   *
   * Proof: with the `isDuplicateName` branch removed, `refuses a name the
   * project already holds, and leaves the roles as they were` fails with the
   * raw `SQLITE_CONSTRAINT_UNIQUE` instead of a refusal — the 500 this
   * translation exists to prevent. With `bumpProject` removed, `adds a role and
   * moves the project’s revision` fails, 1 expected and 0 read. Both watched
   * 2026-08-08.
   */
  async add(toAdd: NewRole): Promise<RoleWritten> {
    await Promise.resolve();
    try {
      return this.db.transaction((tx) => {
        const last = tx
          .select({ position: max(role.position) })
          .from(role)
          .where(eq(role.projectId, toAdd.projectId))
          .get();
        const written: Role = {
          ...toAdd,
          position: (last?.position ?? 0) + ROLE_POSITION_STEP,
        };
        tx.insert(role).values(written).run();
        bumpProject(tx, toAdd.projectId);
        return { ok: true, role: written };
      });
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

  /**
   * What a removal would take with it, read for the refusal that names it.
   *
   * The assignments are the whole project's — see {@link RoleUsageRows} for why
   * this role's own rows cannot answer the question.
   */
  async usageOf(projectId: string, roleId: string): Promise<RoleUsageRows> {
    const held = await this.db
      .select({ workItemId: estimate.workItemId })
      .from(estimate)
      .where(eq(estimate.roleId, roleId));
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    // `inArray` with an empty list becomes `IN ()`, which SQLite refuses — and
    // a project with no work items has no assignments by definition.
    if (ids.length === 0) return { estimates: held.length, assignments: [] };
    const assignments = await this.db
      .select()
      .from(assignment)
      .where(
        inArray(
          assignment.workItemId,
          ids.map((row) => row.id),
        ),
      );
    return { estimates: held.length, assignments };
  }

  /**
   * Removes the role and everything that hangs off it, in one transaction.
   *
   * The estimates are deleted **explicitly**: `estimate.role_id` has no
   * `onDelete` cascade, so deleting the role row on its own hits the foreign
   * key and answers 500 — which is what a role delete does today. The
   * assignments are deleted explicitly too, though their column does cascade,
   * so that what this reports having removed is what this statement removed
   * rather than what the database did behind it.
   *
   * Which work items to bump is read **inside** the transaction, immediately
   * before the deletes. An estimate written after the caller counted is
   * therefore deleted with the rest and its work item's revision moves with it:
   * the row can never be left pointing at a role that has gone, and a journal
   * entry that touched it refuses instead of applying against a plan whose
   * phases changed.
   *
   * Proof, both watched 2026-08-08: with the estimate delete removed, all three
   * removal cases fail on `FOREIGN KEY constraint failed` — the 500 a bare role
   * delete answers today; with the bump set narrowed to the assignments alone,
   * `deletes an estimate written between the count and the confirmed removal`
   * fails, the work item estimated after the count still reading its old
   * revision.
   *
   * What no test here can observe is a writer landing **inside** this
   * transaction: `bun:sqlite` transactions are synchronous, so the interleave
   * the API actually faces — count, somebody else's write, confirm — is the one
   * the test reproduces, and it is reproduced across the two calls rather than
   * inside one.
   */
  async remove(projectId: string, roleId: string): Promise<RoleRemoval> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const estimated = tx
        .select({ workItemId: estimate.workItemId })
        .from(estimate)
        .where(eq(estimate.roleId, roleId))
        .all();
      const assigned = tx
        .select({ workItemId: assignment.workItemId })
        .from(assignment)
        .where(eq(assignment.roleId, roleId))
        .all();
      tx.delete(estimate).where(eq(estimate.roleId, roleId)).run();
      tx.delete(assignment).where(eq(assignment.roleId, roleId)).run();
      tx.delete(role).where(eq(role.id, roleId)).run();
      const workItemIds = [...new Set([...estimated, ...assigned].map((row) => row.workItemId))];
      bumpWorkItems(tx, workItemIds);
      bumpProject(tx, projectId);
      return { estimates: estimated.length, assignments: assigned.length, workItemIds };
    });
  }
}
