import type { DirectoryStore, Person, PersonWithTeams, ServiceTeam } from '../repository';

export interface DirectoryServiceOptions {
  directory: DirectoryStore;
  newId?: () => string;
}

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
}
