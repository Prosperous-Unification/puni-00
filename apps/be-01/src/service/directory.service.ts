import type {
  DirectoryStore,
  Person,
  PersonPatch,
  PersonWithTeams,
  ServiceTeam,
  TouchedProjects,
} from '../repository';
import type { Broadcaster } from './broadcast';
import {
  type DirectoryUsage,
  directoryUsageOfPerson,
  directoryUsageOfTeam,
} from './directory-usage';

export interface DirectoryServiceOptions {
  directory: DirectoryStore;
  /**
   * Required, like the role service's. A directory service built without one
   * would rename somebody assigned across three plans and tell none of them —
   * every other client would keep drawing the old name until somebody
   * reloaded.
   */
  broadcast: Broadcaster;
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

/**
 * How a removal answered.
 *
 * `in_use` carries the **directory usage** rather than a count, because the
 * next request is the same one with `cascade`, and the person confirming has to
 * know what they are agreeing to.
 */
export type RemoveDirectoryOutcome =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'in_use'; usage: DirectoryUsage };

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
    // `size: null` — unstated. A team is created by somebody typing a name
    // into a cell, and how many of them there are is a separate statement made
    // on the directory page. Null constrains no schedule; see `schema.ts`.
    return this.opts.directory.addTeam({ id: this.newId(), name: clean, size: null });
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
    await this.announce(written.projectIds);
    return { ok: true, result: written.team };
  }

  /**
   * Sets how many of a team may be at work at once, or clears it back to
   * unstated.
   *
   * **Announced to every project the team labels work in**, which is the same
   * fan-out a rename gets and a stronger claim on it: a rename moves a word on
   * screen, and a size moves every date in the plan. The event is
   * `directory_changed` and the existing {@link TouchedProjects} carries the
   * list — v1 of the plan invented a `team_capacity_set` event, and this is
   * that finding folded in.
   *
   * **Inheritance is already covered by that list and needs no widening.** A
   * leaf inherits from an ancestor in its own project — `effectiveTeamOf` walks
   * `parentId`, which never leaves the project — so a project holding an
   * inheriting leaf holds the labelled ancestor too, and the ancestor is what
   * puts it in the list. `projectsLabelled` reads every row that carries the
   * label rather than only the leaves, which is the line that makes that true.
   *
   * Not journalled, and therefore not undoable: the directory is not journalled
   * today — neither a rename nor a removal is — and giving one field of it an
   * undo stack would put a Cmd+Z on the directory page that worked for exactly
   * one of the four things a person can do there.
   *
   * The size is validated at the controller, which is the only place a value
   * that is not a whole number of 1 to 1000 can enter. A 0 here would be a pool
   * of no slots and a plan of `Infinity` dates.
   */
  async resizeTeam(teamId: string, size: number | null): Promise<DirectoryOutcome<ServiceTeam>> {
    const written = await this.opts.directory.resizeTeam(teamId, size);
    if (!written.ok) {
      // A size is held by no index, so `taken` cannot arrive here. The outcome
      // type carries it because the rename shares this shape, and answering
      // anything but `not_found` about it would be inventing a state.
      return { ok: false, reason: 'not_found' };
    }
    await this.announce(written.projectIds);
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
  async addPerson(name: string, teamIds: readonly string[]): Promise<DirectoryOutcome<Person>> {
    const clean = cleanName(name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const written = await this.opts.directory.addPerson({ id: this.newId(), name: clean }, teamIds);
    // The whole create, or none of it: a person made without the membership
    // that was asked for is a row somebody would have to notice was wrong.
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, result: written.person };
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
    // Only a rename is announced. A membership edit changes no row any project
    // renders — the assumed assignee is derived from assignments, not from who
    // belongs to which team — so an event would send every open plan to reread
    // a tree that is exactly as it was.
    if (clean !== undefined) await this.announce(written.projectIds);
    return { ok: true, result: written.person };
  }

  /**
   * Removes a person, refusing the first time when an assignment holds them.
   *
   * The refusal carries the **directory usage** rather than a bare conflict:
   * the assignments are rows somebody typed, and the assumed assignees are
   * readings that would move under them. A person nobody has been assigned is
   * removed without a second call — there is nothing to warn about, and asking
   * anyway teaches people to confirm without reading. Their own memberships go
   * with them and force nothing: they name nobody else.
   *
   * `cascade` is the caller saying it has seen that usage, and it is the only
   * thing carried across the two requests. **The count that decides is the one
   * inside the delete's transaction** — the read below is a fast path that
   * answers most refusals without opening one, and an assignment written after
   * it is refused by the transaction rather than deleted by it.
   *
   * Proof, watched 2026-08-09: with the transaction's own count replaced by
   * this fast path's, `refuses a removal when an assignment lands after the
   * count` deletes the person and the assignment the caller was never shown.
   */
  async removePerson(personId: string, cascade: boolean): Promise<RemoveDirectoryOutcome> {
    if (!cascade) {
      const seen = directoryUsageOfPerson(
        await this.opts.directory.usageOfPerson(personId),
        personId,
      );
      if (seen.projects.length > 0) return { ok: false, reason: 'in_use', usage: seen };
    }
    const removed = await this.opts.directory.removePerson(personId, cascade);
    if (!removed.ok) {
      if (removed.reason === 'not_found') return { ok: false, reason: 'not_found' };
      // The transaction's own usage, not the fast path's: it is the only one
      // that was still true at the moment the deletes would have run.
      return {
        ok: false,
        reason: 'in_use',
        usage: directoryUsageOfPerson(removed.usage, personId),
      };
    }
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /**
   * Removes a team, refusing the first time when a work item carries it **or a
   * person belongs to it**.
   *
   * The memberships count here where a person's own do not, because they name
   * somebody else: a confirmation showing an empty impact list while two
   * people were about to be taken out of a team is a confirmation of nothing.
   */
  async removeTeam(teamId: string, cascade: boolean): Promise<RemoveDirectoryOutcome> {
    if (!cascade) {
      const seen = directoryUsageOfTeam(await this.opts.directory.usageOfTeam(teamId), teamId);
      if (seen.projects.length > 0 || seen.members.length > 0) {
        return { ok: false, reason: 'in_use', usage: seen };
      }
    }
    const removed = await this.opts.directory.removeTeam(teamId, cascade);
    if (!removed.ok) {
      if (removed.reason === 'not_found') return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'in_use', usage: directoryUsageOfTeam(removed.usage, teamId) };
    }
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /**
   * Tells every project the write touched, **after** its transaction has
   * committed.
   *
   * One event per project rather than one global one, because a project's
   * sequence is what a reconnecting client resumes from: an event outside every
   * sequence has nowhere to be replayed from and no client would ever see it
   * twice. A write touching no project announces nothing — there is nothing
   * anywhere to reread.
   *
   * After the commit, and that is the whole of it: an event published first
   * would send every listener back to read the state it was told had changed
   * and find the old one. It is `role-crud`'s timing, chosen for `role-crud`'s
   * reason — `recordEvent` opens a transaction of its own, so it cannot be
   * nested inside the write's.
   *
   * Proof: with either publish moved ahead of its write, `records the event
   * after the write, never before it` fails — the directory read from inside
   * `publish` still held `Kat`; watched 2026-08-09.
   */
  private async announce(projectIds: TouchedProjects): Promise<void> {
    for (const projectId of projectIds) {
      await this.opts.broadcast.publish(projectId, { type: 'directory_changed' });
    }
  }
}
