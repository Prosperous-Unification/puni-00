import type { ProjectStore, Role, RoleStore } from '../repository';
import { type AssumedAssigneeFlip, assumedAssigneeFlips } from './assumed-assignee';
import type { Broadcaster } from './broadcast';
import { canEdit } from './project.service';

export interface RoleServiceOptions {
  projects: ProjectStore;
  roles: RoleStore;
  /**
   * Required, like the work item service's. A role service built without one
   * would change what every estimate in a project means and tell nobody — every
   * other client would keep drawing a column for a role that has gone until
   * somebody reloaded.
   */
  broadcast: Broadcaster;
  newId?: () => string;
}

/** Why a role could not be added or renamed. All four are states, not faults. */
export type RoleRefusal = 'not_found' | 'forbidden' | 'name_required' | 'taken';

export type RoleOutcome =
  | { ok: true; result: Role }
  | { ok: false; reason: RoleRefusal };

/** What a removal would take with it, as the refusal reports it. */
export interface RoleInUse {
  estimates: number;
  /** Explicit assignments on this role. The assumed ones are in `assumedAssignees`. */
  assignments: number;
  /**
   * Every work item whose assumed assignee the removal would change — nobody
   * wrote those rows, and a removal that did not name them would move who the
   * plan says is doing the work without saying so.
   */
  assumedAssignees: AssumedAssigneeFlip[];
}

export type RemoveRoleOutcome =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' }
  | { ok: false; reason: 'in_use'; inUse: RoleInUse };

/** The trimmed name, or null when there is nothing there to name. */
function cleanName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A project's roles: adding, renaming and removing them.
 *
 * **Not journalled**, like the project's start date — there is no undo for a
 * role change. What protects the entries already in somebody's stack is the
 * revision bumps the removal makes: an undo whose estimate was deleted with the
 * role refuses as stale rather than writing a row against a role that is gone.
 *
 * Every write announces itself **after** the transaction has committed, so a
 * client that reads on the event reads a project the change is already in. See
 * {@link ProjectEvent}.
 */
export class RoleService {
  private readonly newId: () => string;

  constructor(private readonly opts: RoleServiceOptions) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  async add(projectId: string, actorId: string, name: string): Promise<RoleOutcome> {
    const clean = cleanName(name);
    // Before the project is read: a role called nothing would sit in every
    // header and every estimate row with no way to tell it from the next one.
    if (clean === null) return { ok: false, reason: 'name_required' };
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const written = await this.opts.roles.add({ id: this.newId(), projectId, name: clean });
    if (!written.ok) return { ok: false, reason: written.reason };
    await this.opts.broadcast.publish(projectId, { type: 'role_added', role: written.role });
    return { ok: true, result: written.role };
  }

  async rename(
    projectId: string,
    roleId: string,
    actorId: string,
    name: string,
  ): Promise<RoleOutcome> {
    const clean = cleanName(name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const gate = await this.gate(projectId, roleId, actorId);
    if (!gate.ok) return gate;

    const written = await this.opts.roles.rename(roleId, clean);
    if (!written.ok) return { ok: false, reason: written.reason };
    await this.opts.broadcast.publish(projectId, { type: 'role_renamed', role: written.role });
    return { ok: true, result: written.role };
  }

  /**
   * Removes a role, refusing the first time when anything points at it.
   *
   * The refusal carries what would be lost rather than a bare conflict: the
   * estimates and assignments are rows somebody typed, and the assumed
   * assignees are readings that would change under them. A role nothing points
   * at is removed without a second call — there is nothing to warn about, and
   * asking anyway teaches people to confirm without reading.
   *
   * `cascade` is the caller saying it has seen those counts. Nothing is carried
   * over from the refusal: what the transaction deletes is what is there when it
   * runs, which is why a write that arrived in between is deleted rather than
   * left pointing at a role that has gone.
   *
   * Proof: with the refusal made unreachable, `refuses a role that is used,
   * counting what would go` fails — the first, unconfirmed call took two
   * estimates and an assignment with it; watched 2026-08-08.
   */
  async remove(
    projectId: string,
    roleId: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveRoleOutcome> {
    const gate = await this.gate(projectId, roleId, actorId);
    if (!gate.ok) return { ok: false, reason: gate.reason === 'forbidden' ? 'forbidden' : 'not_found' };

    if (!cascade) {
      const usage = await this.opts.roles.usageOf(projectId, roleId);
      const held = usage.assignments.filter((each) => each.roleId === roleId).length;
      if (usage.estimates > 0 || held > 0) {
        return {
          ok: false,
          reason: 'in_use',
          inUse: {
            estimates: usage.estimates,
            assignments: held,
            assumedAssignees: assumedAssigneeFlips(usage.assignments, roleId),
          },
        };
      }
    }
    await this.opts.roles.remove(projectId, roleId);
    await this.opts.broadcast.publish(projectId, { type: 'role_removed', roleId });
    return { ok: true };
  }

  /**
   * The project this role belongs to, and whether the caller may write to it.
   *
   * A role of another project is `not_found` rather than `forbidden`: it is not
   * this project's role, and saying "you may not" would tell the caller it is.
   *
   * Proof: with the `projectId` comparison dropped, `refuses a role that belongs
   * to another project` fails — one project's route renamed another project's
   * role; watched 2026-08-08.
   */
  private async gate(
    projectId: string,
    roleId: string,
    actorId: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };
    const role = await this.opts.roles.findById(roleId);
    if (role === null || role.projectId !== projectId) return { ok: false, reason: 'not_found' };
    return { ok: true };
  }
}
