import { and, asc, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { DirectoryStore, Person, PersonWithTeams, ServiceTeam } from './index';
import { assignment, person, personTeam, serviceTeam } from './schema';

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

  async assignmentsOf(
    workItemIds: readonly string[],
  ): Promise<{ workItemId: string; roleId: string; personId: string }[]> {
    if (workItemIds.length === 0) return [];
    const wanted = new Set(workItemIds);
    const rows = await this.db.select().from(assignment);
    return rows.filter((row) => wanted.has(row.workItemId));
  }

  async assign(workItemId: string, roleId: string, personId: string | null): Promise<void> {
    if (personId === null) {
      // `and(...)`, not `&&`: the JS operator would evaluate to the second
      // condition alone and delete every role's assignment on this work item.
      await this.db
        .delete(assignment)
        .where(and(eq(assignment.workItemId, workItemId), eq(assignment.roleId, roleId)));
      return;
    }
    await this.db
      .insert(assignment)
      .values({ workItemId, roleId, personId })
      // The pair is the primary key, so reassigning is an update rather than a
      // constraint violation.
      .onConflictDoUpdate({
        target: [assignment.workItemId, assignment.roleId],
        set: { personId },
      });
  }
}
