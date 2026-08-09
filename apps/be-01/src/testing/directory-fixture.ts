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
    renameTeam(teamId, name) {
      const found = teams.get(teamId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      // The unique index, modelled: a fixture that let two `Platform`s exist
      // would let a caller's `taken` branch pass untested.
      const held = [...teams.values()].some((each) => each.name === name && each.id !== teamId);
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      teams.set(teamId, { ...found, name });
      return Promise.resolve({ ok: true, team: { ...found, name } });
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
    patchPerson(personId, patch) {
      const found = people.get(personId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      const wanted = patch.teamIds === undefined ? null : [...new Set(patch.teamIds)];
      // Validated before either write, as production is: a fixture that wrote
      // the name first would let a half-applied patch pass here and fail there.
      if (wanted?.some((each) => !teams.has(each)) === true) {
        return Promise.resolve({ ok: false, reason: 'unknown_team' });
      }
      if (patch.name !== undefined) {
        const held = [...people.values()].some(
          (each) => each.name === patch.name && each.id !== personId,
        );
        if (held) return Promise.resolve({ ok: false, reason: 'taken' });
        people.set(personId, { ...found, name: patch.name });
      }
      if (wanted !== null) memberships.set(personId, new Set(wanted));
      const patched = people.get(personId);
      if (patched === undefined) throw new Error(`person vanished mid-patch: ${personId}`);
      return Promise.resolve({
        ok: true,
        person: { ...patched, teamIds: [...(memberships.get(personId) ?? [])] },
      });
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
