import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type {
  DirectoryRemoved,
  DirectoryStore,
  DirectoryUsageRows,
  Person,
  PersonPatch,
  PersonWithTeams,
  PersonWritten,
  ServiceTeam,
  ServiceTeamWritten,
} from './index';
import { bumpedWorkItem, bumpWorkItems } from './revision';
import { assignment, person, personTeam, project, role, serviceTeam, workItem } from './schema';

/**
 * Whether a thrown error is SQLite refusing a second team of the same name.
 *
 * The message rather than a typed error, because `bun:sqlite` has no typed one
 * — the same translation `RoleRepository` makes for a duplicate role name. It
 * names the index's column so that a different constraint failing here is still
 * an unknown, and still throws.
 */
function isDuplicateTeamName(err: unknown): boolean {
  return (
    err instanceof Error && err.message.includes('UNIQUE constraint failed: service_team.name')
  );
}

/** The same translation as {@link isDuplicateTeamName}, for the person name index. */
function isDuplicatePersonName(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed: person.name');
}

/** Nothing points at it: the empty usage, with both halves present as the spec requires. */
const NOTHING_POINTS_AT_IT: DirectoryUsageRows = {
  workItems: [],
  projects: [],
  assignments: [],
  roles: [],
  people: [],
  members: [],
};

/** A reader that is either the connection or an open transaction — see {@link usageRowsIn}. */
type Reader = Pick<SQLiteBunDatabase, 'select'>;

/**
 * Everything the refusal needs about the projects `projectIds` names, plus the
 * `members` the caller worked out.
 *
 * Takes the reader so the refusal can read it inside the transaction that
 * refused — the same shape `RoleRepository`'s `assignmentsIn` takes, and for
 * the same reason.
 */
function usageRowsIn(
  reader: Reader,
  projectIds: readonly string[],
  members: readonly Person[],
): DirectoryUsageRows {
  // `inArray` with an empty list becomes `IN ()`, which SQLite refuses — and a
  // removal touching no project has no tree to number.
  if (projectIds.length === 0) return { ...NOTHING_POINTS_AT_IT, members };
  const ids = [...projectIds];
  const workItems = reader.select().from(workItem).where(inArray(workItem.projectId, ids)).all();
  const projects = reader
    .select({ id: project.id, name: project.name })
    .from(project)
    .where(inArray(project.id, ids))
    .all();
  const assignments = reader
    .select({
      workItemId: assignment.workItemId,
      roleId: assignment.roleId,
      personId: assignment.personId,
    })
    .from(assignment)
    .innerJoin(workItem, eq(assignment.workItemId, workItem.id))
    .where(inArray(workItem.projectId, ids))
    .all();
  const roles = reader
    .select({ id: role.id, name: role.name })
    .from(role)
    .where(inArray(role.projectId, ids))
    .all();
  const named = [...new Set(assignments.map((each) => each.personId))];
  const people =
    named.length === 0 ? [] : reader.select().from(person).where(inArray(person.id, named)).all();
  return { workItems, projects, assignments, roles, people, members };
}

/** The projects holding a work item this removal would touch, with no duplicates. */
function projectsOf(rows: readonly { projectId: string }[]): string[] {
  return [...new Set(rows.map((each) => each.projectId))];
}

/**
 * The global directory: teams, people, who belongs to which, and who is doing
 * what.
 *
 * One repository rather than three because the three are read together on
 * every request that needs any of them — a picker offers people grouped by
 * team, and splitting them would mean three round trips to answer one
 * question.
 *
 * Both `addTeam` and `addPerson` are idempotent **by name**, at the database
 * rather than by asking first: this list is typed into by everybody, two
 * people adding `Platform` at the same moment both pass a check-then-insert,
 * and only a constraint stops the second one.
 */
export class DirectoryRepository implements DirectoryStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  listTeams(): Promise<ServiceTeam[]> {
    return this.db.select().from(serviceTeam).orderBy(asc(serviceTeam.name));
  }

  async addTeam(toAdd: ServiceTeam): Promise<ServiceTeam> {
    await this.db.insert(serviceTeam).values(toAdd).onConflictDoNothing();
    // The row that is there now, which is the earlier one when two arrived at
    // once. Returning `toAdd` would hand back an id nothing holds.
    const rows = await this.db
      .select()
      .from(serviceTeam)
      .where(eq(serviceTeam.name, toAdd.name))
      .limit(1);
    const found = rows.at(0);
    if (found === undefined) throw new Error(`team vanished after insert: ${toAdd.name}`);
    return found;
  }

  /**
   * Renames one team, or reports the name being held or the row being gone.
   *
   * A refused rename writes nothing. The team carries no revision of its own —
   * it is global rather than a satellite of any project — so what tells an open
   * project about the new name is the event the service publishes after this
   * commits, not a counter moved here.
   *
   * Proof: with the `isDuplicateTeamName` branch removed, `refuses a name
   * another team holds, naming the survivor` fails with the raw
   * `SQLITE_CONSTRAINT_UNIQUE` instead of a refusal — the 500 this translation
   * exists to prevent. With the empty-`returning` branch reporting success,
   * `refuses a team that is not there` answers `ok` about a row nothing holds.
   * Both watched 2026-08-09.
   */
  async renameTeam(teamId: string, name: string): Promise<ServiceTeamWritten> {
    await Promise.resolve();
    try {
      return this.db.transaction((tx) => {
        const rows = tx
          .update(serviceTeam)
          .set({ name })
          .where(eq(serviceTeam.id, teamId))
          .returning()
          .all();
        const renamed = rows.at(0);
        if (renamed === undefined) return { ok: false, reason: 'not_found' };
        return { ok: true, team: renamed };
      });
    } catch (err) {
      if (isDuplicateTeamName(err)) return { ok: false, reason: 'taken' };
      throw err;
    }
  }

  async listPeople(): Promise<PersonWithTeams[]> {
    const people = await this.db.select().from(person).orderBy(asc(person.name));
    const memberships = await this.db.select().from(personTeam);
    const teamsOf = new Map<string, string[]>();
    for (const row of memberships) {
      teamsOf.set(row.personId, [...(teamsOf.get(row.personId) ?? []), row.serviceTeamId]);
    }
    // A person with no memberships is a free agent, and that is the empty
    // array rather than a magic team id — see `personTeam`'s note.
    return people.map((each) => ({ ...each, teamIds: teamsOf.get(each.id) ?? [] }));
  }

  async addPerson(toAdd: Person, teamIds: readonly string[]): Promise<Person> {
    await this.db.insert(person).values(toAdd).onConflictDoNothing();
    const rows = await this.db.select().from(person).where(eq(person.name, toAdd.name)).limit(1);
    const found = rows.at(0);
    if (found === undefined) throw new Error(`person vanished after insert: ${toAdd.name}`);
    if (teamIds.length > 0) {
      await this.db
        .insert(personTeam)
        .values(teamIds.map((serviceTeamId) => ({ personId: found.id, serviceTeamId })))
        .onConflictDoNothing();
    }
    return found;
  }

  /**
   * Renames a person and replaces their memberships in one transaction.
   *
   * **The teams are validated before anything is written, inside the same
   * transaction.** Returning from a drizzle transaction callback *commits* it,
   * so a refusal decided after the name had been set would answer
   * `unknown_team` and leave the rename in the database — the half-applied
   * state the spec says is not observable. Validating first is what makes the
   * refusal write nothing without needing a rollback.
   *
   * The ids are deduplicated here rather than trusted from the caller: the
   * primary key would refuse the second copy, turning a client sending a team
   * twice into a 500 for a patch that means exactly what it says.
   *
   * Proof: with the team validation moved below the name update, `refuses the
   * whole patch for a team that is not there, rename included` fails — `Katrin`
   * survived a patch that answered `unknown_team`. With the present-person
   * guard removed, `refuses a name of whitespace alone, and a person that is
   * not there` answers `ok` for an id nothing holds — a patch of no rows
   * reporting a person. With the
   * `isDuplicatePersonName` branch removed, `refuses a name another person
   * holds, naming the survivor` fails with the raw `SQLITE_CONSTRAINT_UNIQUE`.
   * All watched 2026-08-09.
   */
  async patchPerson(personId: string, patch: PersonPatch): Promise<PersonWritten> {
    await Promise.resolve();
    const wanted = patch.teamIds === undefined ? null : [...new Set(patch.teamIds)];
    try {
      return this.db.transaction((tx) => {
        const held = tx.select({ id: person.id }).from(person).where(eq(person.id, personId)).all();
        if (held.length === 0) return { ok: false, reason: 'not_found' };
        if (wanted !== null && wanted.length > 0) {
          const found = tx
            .select({ id: serviceTeam.id })
            .from(serviceTeam)
            .where(inArray(serviceTeam.id, wanted))
            .all();
          if (found.length !== wanted.length) return { ok: false, reason: 'unknown_team' };
        }
        if (patch.name !== undefined) {
          tx.update(person).set({ name: patch.name }).where(eq(person.id, personId)).run();
        }
        if (wanted !== null) {
          tx.delete(personTeam).where(eq(personTeam.personId, personId)).run();
          if (wanted.length > 0) {
            tx.insert(personTeam)
              .values(wanted.map((serviceTeamId) => ({ personId, serviceTeamId })))
              .run();
          }
        }
        const rows = tx.select().from(person).where(eq(person.id, personId)).all();
        const patched = rows.at(0);
        if (patched === undefined) throw new Error(`person vanished mid-patch: ${personId}`);
        const teamIds = tx
          .select({ serviceTeamId: personTeam.serviceTeamId })
          .from(personTeam)
          .where(eq(personTeam.personId, personId))
          .all();
        return {
          ok: true,
          person: { ...patched, teamIds: teamIds.map((row) => row.serviceTeamId) },
        };
      });
    } catch (err) {
      if (isDuplicatePersonName(err)) return { ok: false, reason: 'taken' };
      throw err;
    }
  }

  /**
   * The projects a person's assignments reach into, read for the refusal that
   * names them.
   *
   * A **fast path**, never the authority: see {@link DirectoryStore.usageOfPerson}.
   * `members` is empty by construction — a person's own memberships name nobody
   * else, so a removal that would drop only them has nothing to warn about.
   */
  async usageOfPerson(personId: string): Promise<DirectoryUsageRows> {
    await Promise.resolve();
    return usageRowsIn(this.db, this.projectsAssigning(this.db, personId), []);
  }

  /** The same for a team: the projects it labels work in, and the people in it. */
  async usageOfTeam(teamId: string): Promise<DirectoryUsageRows> {
    await Promise.resolve();
    return usageRowsIn(
      this.db,
      this.projectsLabelled(this.db, teamId),
      this.membersOf(this.db, teamId),
    );
  }

  /**
   * Counts, decides and deletes in **one** transaction.
   *
   * The count is inside because it *is* the decision, not a report about it —
   * the rule `RoleRepository.remove` sets out at length. An assignment written
   * between an unconfirmed caller's own count and this statement refuses the
   * removal rather than being deleted by it: the usage that caller was shown
   * never mentioned it.
   *
   * The assignments are deleted **explicitly** although `assignment.person_id`
   * cascades, and the memberships although `person_team.person_id` does, so
   * that what this reports having removed is what these statements removed
   * rather than what the database did behind them.
   *
   * Proof, both watched 2026-08-09: with this transaction's own count made
   * unreachable, so that only the caller's earlier read decides, `refuses a
   * removal when an assignment lands after the count` deletes the person and
   * the assignment the caller was never shown. With `bumpWorkItems` removed,
   * `removes a person on the second, explicit call, and moves what lost a row`
   * fails on the work item's revision — a journal entry holding the old number
   * would have undone against a directory that had changed under it.
   */
  async removePerson(personId: string, cascade: boolean): Promise<DirectoryRemoved> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const held = tx
        .select({ workItemId: assignment.workItemId })
        .from(assignment)
        .where(eq(assignment.personId, personId))
        .all();
      if (!cascade && held.length > 0) {
        return {
          ok: false,
          reason: 'in_use',
          usage: usageRowsIn(tx, this.projectsAssigning(tx, personId), []),
        };
      }
      const projectIds = this.projectsAssigning(tx, personId);
      tx.delete(assignment).where(eq(assignment.personId, personId)).run();
      tx.delete(personTeam).where(eq(personTeam.personId, personId)).run();
      const removed = tx.delete(person).where(eq(person.id, personId)).returning().all();
      // Nothing was deleted, so there was nothing here to delete: somebody
      // else's removal committed first. This request changed nothing and must
      // move no revision — the two deletes above touched nothing for the same
      // reason.
      if (removed.length === 0) return { ok: false, reason: 'not_found' };
      const workItemIds = [...new Set(held.map((each) => each.workItemId))];
      bumpWorkItems(tx, workItemIds);
      return { ok: true, removal: { workItemIds, projectIds } };
    });
  }

  /**
   * The same for a team, and it nulls every label itself.
   *
   * `work_item.service_team_id` has **no** foreign key — deliberately, so that
   * a label is a label rather than a constraint — which means the database will
   * not stop this delete and will not clean up after it. A team row deleted on
   * its own leaves every work item that carried it pointing at an id nothing
   * holds, and nothing anywhere would ever report it.
   *
   * Proof, both watched 2026-08-09: with the label update removed, `a cascade
   * nulls every label and moves those work items' revisions` fails on the
   * dangling id the test reads back off the work item — the dangle nothing else
   * would ever have reported. With this transaction's own count made
   * unreachable, `refuses a team removal when a membership or a label lands
   * after the count` takes both with it.
   */
  async removeTeam(teamId: string, cascade: boolean): Promise<DirectoryRemoved> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const labelled = tx
        .select({ id: workItem.id, projectId: workItem.projectId })
        .from(workItem)
        .where(eq(workItem.serviceTeamId, teamId))
        .all();
      const members = this.membersOf(tx, teamId);
      if (!cascade && (labelled.length > 0 || members.length > 0)) {
        return {
          ok: false,
          reason: 'in_use',
          usage: usageRowsIn(tx, projectsOf(labelled), members),
        };
      }
      tx.update(workItem)
        .set({ serviceTeamId: null, revision: bumpedWorkItem })
        .where(eq(workItem.serviceTeamId, teamId))
        .run();
      tx.delete(personTeam).where(eq(personTeam.serviceTeamId, teamId)).run();
      const removed = tx.delete(serviceTeam).where(eq(serviceTeam.id, teamId)).returning().all();
      if (removed.length === 0) return { ok: false, reason: 'not_found' };
      return {
        ok: true,
        removal: { workItemIds: labelled.map((each) => each.id), projectIds: projectsOf(labelled) },
      };
    });
  }

  /** Every project holding a work item this person is assigned on. */
  private projectsAssigning(reader: Reader, personId: string): string[] {
    return projectsOf(
      reader
        .select({ projectId: workItem.projectId })
        .from(assignment)
        .innerJoin(workItem, eq(assignment.workItemId, workItem.id))
        .where(eq(assignment.personId, personId))
        .all(),
    );
  }

  /** Every project holding a work item labelled with this team. */
  private projectsLabelled(reader: Reader, teamId: string): string[] {
    return projectsOf(
      reader
        .select({ projectId: workItem.projectId })
        .from(workItem)
        .where(eq(workItem.serviceTeamId, teamId))
        .all(),
    );
  }

  /** The people in one team, by name, which is the order a confirmation reads them in. */
  private membersOf(reader: Reader, teamId: string): Person[] {
    return reader
      .select({ id: person.id, name: person.name })
      .from(person)
      .innerJoin(personTeam, eq(personTeam.personId, person.id))
      .where(eq(personTeam.serviceTeamId, teamId))
      .orderBy(asc(person.name))
      .all();
  }

  async assignmentsOf(
    workItemIds: readonly string[],
  ): Promise<{ workItemId: string; roleId: string; personId: string }[]> {
    if (workItemIds.length === 0) return [];
    const wanted = new Set(workItemIds);
    const rows = await this.db.select().from(assignment);
    return rows.filter((row) => wanted.has(row.workItemId));
  }

  /**
   * An assignment is a satellite of the work item it is on, so setting or
   * clearing one moves that work item's revision in the same transaction.
   * The person named has none of their own: they are a directory entry rather
   * than part of any plan.
   */
  async assign(workItemId: string, roleId: string, personId: string | null): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      if (personId === null) {
        // `and(...)`, not `&&`: the JS operator would evaluate to the second
        // condition alone and delete every role's assignment on this work item.
        tx.delete(assignment)
          .where(and(eq(assignment.workItemId, workItemId), eq(assignment.roleId, roleId)))
          .run();
      } else {
        tx.insert(assignment)
          .values({ workItemId, roleId, personId })
          // The pair is the primary key, so reassigning is an update rather
          // than a constraint violation.
          .onConflictDoUpdate({
            target: [assignment.workItemId, assignment.roleId],
            set: { personId },
          })
          .run();
      }
      bumpWorkItems(tx, [workItemId]);
    });
  }
}
