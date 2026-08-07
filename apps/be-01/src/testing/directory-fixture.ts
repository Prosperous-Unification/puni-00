import type {
  Assignment,
  DirectoryStore,
  Person,
  PersonWithTeams,
  ServiceTeam,
} from '../repository';
import { DirectoryService } from '../service/directory.service';

/**
 * A DirectoryStore backed by Maps, for tests that do not need SQLite.
 *
 * It keeps the guarantees the real schema enforces, because a fixture laxer
 * than production lets a test pass against behaviour that does not exist:
 * names are unique, adding an existing name returns the existing row, and one
 * work item holds at most one assignee per role.
 */
export function inMemoryDirectory(): DirectoryStore {
  const teams = new Map<string, ServiceTeam>();
  const people = new Map<string, Person>();
  const memberships = new Map<string, Set<string>>();
  const assignments = new Map<string, Assignment>();
  const key = (workItemId: string, roleId: string) => `${workItemId}::${roleId}`;

  return {
    listTeams: () =>
      Promise.resolve([...teams.values()].sort((a, b) => a.name.localeCompare(b.name))),
    addTeam(team) {
      const already = [...teams.values()].find((each) => each.name === team.name);
      if (already !== undefined) return Promise.resolve(already);
      teams.set(team.id, team);
      return Promise.resolve(team);
    },
    listPeople: () =>
      Promise.resolve(
        [...people.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(
            (each): PersonWithTeams => ({
              ...each,
              teamIds: [...(memberships.get(each.id) ?? [])],
            }),
          ),
      ),
    addPerson(toAdd, teamIds) {
      const already = [...people.values()].find((each) => each.name === toAdd.name);
      const kept = already ?? toAdd;
      if (already === undefined) people.set(toAdd.id, toAdd);
      if (teamIds.length > 0) {
        memberships.set(kept.id, new Set([...(memberships.get(kept.id) ?? []), ...teamIds]));
      }
      return Promise.resolve(kept);
    },
    assignmentsOf(workItemIds) {
      const wanted = new Set(workItemIds);
      return Promise.resolve([...assignments.values()].filter((a) => wanted.has(a.workItemId)));
    },
    assign(workItemId, roleId, personId) {
      if (personId === null) assignments.delete(key(workItemId, roleId));
      else assignments.set(key(workItemId, roleId), { workItemId, roleId, personId });
      return Promise.resolve();
    },
  };
}

/** A DirectoryService over the in-memory store, for tests that only need `buildApp` to construct. */
export function testDirectoryService(directory: DirectoryStore = inMemoryDirectory()) {
  return new DirectoryService({ directory });
}
