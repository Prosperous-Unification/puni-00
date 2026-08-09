import type {
  DirectoryStore,
  Person,
  PersonPatch,
  PersonWithTeams,
  ServiceTeam,
} from '../repository';

export interface DirectoryServiceOptions {
  directory: DirectoryStore;
  newId?: () => string;
}

/**
 * Why a directory write was refused. Every one is a state of the directory or
 * of the request, never a fault: the controller turns each into a 4xx.
 *
 * `nothing_to_change` is a patch naming neither a name nor memberships.
 * Accepting it as a no-op would answer 200 to a request that was almost
 * certainly a client bug, and leave nothing on the wire to notice it by.
 */
export type DirectoryRefusal = 'name_required' | 'not_found' | 'nothing_to_change' | 'unknown_team';

/**
 * What a directory write answered.
 *
 * The `taken` arm carries the **surviving** name — the one the row that already
 * holds it keeps. A bare `taken` would leave a caller who asked for a trimmed
 * name unable to say which of the two spellings is now on screen.
 */
export type DirectoryOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: DirectoryRefusal }
  | { ok: false; reason: 'taken'; name: string };

/** The trimmed name, or null when there is nothing there to name. */
function cleanName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The global directory of teams and people.
 *
 * Global on purpose, and it is the decision worth arguing with: the same teams
 * and the same people work across projects, and a list per project would be
 * the same names typed again with typos between them. The cost is that anyone
 * on this deployment can see every team and person anyone has ever added — a
 * directory, not a secret. Dany asked for exactly this ("the list is global
 * for all projects, anyone can add one").
 *
 * Adding is idempotent by name so the "type it if it is not in the list"
 * picker cannot make two `Platform`s, and neither can two people typing it at
 * the same moment.
 */
export class DirectoryService {
  private readonly newId: () => string;

  constructor(private readonly opts: DirectoryServiceOptions) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  listTeams(): Promise<ServiceTeam[]> {
    return this.opts.directory.listTeams();
  }

  /** Null for a name that is only whitespace — an unnamed team helps nobody find anything. */
  async addTeam(name: string): Promise<ServiceTeam | null> {
    const clean = cleanName(name);
    if (clean === null) return null;
    return this.opts.directory.addTeam({ id: this.newId(), name: clean });
  }

  /**
   * Renames a team, keeping the name unique across the deployment.
   *
   * Any signed-in account may, as any may create one today: there is no admin
   * concept here, and inventing one for a rename would be a different change.
   */
  async renameTeam(teamId: string, name: string): Promise<DirectoryOutcome<ServiceTeam>> {
    const clean = cleanName(name);
    // Before the row is read: a team called nothing would sit in every picker
    // with no way to tell it from the next one.
    if (clean === null) return { ok: false, reason: 'name_required' };
    const written = await this.opts.directory.renameTeam(teamId, clean);
    if (!written.ok) {
      if (written.reason === 'taken') return { ok: false, reason: 'taken', name: clean };
      return { ok: false, reason: 'not_found' };
    }
    return { ok: true, result: written.team };
  }

  listPeople(): Promise<PersonWithTeams[]> {
    return this.opts.directory.listPeople();
  }

  /**
   * Adds a person, optionally joining them to teams.
   *
   * No teams means a **free agent**, which is the absence of memberships
   * rather than membership of a "Free agents" row: a real row could be
   * renamed, deleted, or given work of its own, and the default would then
   * mean whatever somebody last did to it.
   */
  async addPerson(name: string, teamIds: readonly string[]): Promise<Person | null> {
    const clean = cleanName(name);
    if (clean === null) return null;
    return this.opts.directory.addPerson({ id: this.newId(), name: clean }, teamIds);
  }

  /**
   * Renames a person, replaces their memberships, or both at once.
   *
   * A patch naming neither is refused rather than answered as a no-op: nothing
   * on this deployment sends one deliberately, so it is a client bug, and a 200
   * would leave nothing on the wire to notice it by.
   *
   * The two halves are one transaction in the store — see
   * {@link DirectoryStore.patchPerson} — so a refused patch leaves the rename
   * beside it unapplied.
   */
  async patchPerson(
    personId: string,
    patch: PersonPatch,
  ): Promise<DirectoryOutcome<PersonWithTeams>> {
    if (patch.name === undefined && patch.teamIds === undefined) {
      return { ok: false, reason: 'nothing_to_change' };
    }
    const clean = patch.name === undefined ? undefined : cleanName(patch.name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const written = await this.opts.directory.patchPerson(personId, {
      ...(clean === undefined ? {} : { name: clean }),
      ...(patch.teamIds === undefined ? {} : { teamIds: patch.teamIds }),
    });
    if (!written.ok) {
      // `clean` is defined on this branch — `taken` is the name index refusing,
      // and a patch that named no name cannot have reached it.
      if (written.reason === 'taken' && clean !== undefined) {
        return { ok: false, reason: 'taken', name: clean };
      }
      return {
        ok: false,
        reason: written.reason === 'unknown_team' ? 'unknown_team' : 'not_found',
      };
    }
    return { ok: true, result: written.person };
  }
}
