import type { Project, ProjectPatch, ProjectStore, Role } from '../repository';

/**
 * The roles a project starts with. Two sets of estimates is the default the
 * product asks for; a project that began with none would accept no estimates at
 * all until someone thought to add a role.
 */
export const STARTING_ROLES = ['Dev', 'QA'] as const;

export interface ProjectWithRoles {
  project: Project;
  roles: Role[];
}

export type UpdateOutcome =
  | { ok: true; result: Project }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export interface ProjectServiceOptions {
  projects: ProjectStore;
  now?: () => number;
  newId?: () => string;
}

/**
 * Whether `actorId` may write to `project`.
 *
 * Exported because every later mutation asks the same question — work items,
 * estimates, freeze — and a second copy of this rule is how one of them ends up
 * enforcing a different one. Reading is deliberately not gated: an unrestricted
 * project is editable by any authenticated account, and a restricted one is
 * readable by all and writable only by its owner.
 */
export function canEdit(project: Project, actorId: string): boolean {
  return !project.restricted || project.ownerId === actorId;
}

export class ProjectService {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly opts: ProjectServiceOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  async create(name: string, ownerId: string): Promise<ProjectWithRoles> {
    const project: Project = {
      id: this.newId(),
      name,
      ownerId,
      restricted: false,
      createdAt: this.now(),
    };
    const roles = STARTING_ROLES.map((roleName) => ({
      id: this.newId(),
      projectId: project.id,
      name: roleName,
    }));
    await this.opts.projects.create(project, roles);
    return { project, roles };
  }

  list(): Promise<Project[]> {
    return this.opts.projects.list();
  }

  async read(id: string): Promise<ProjectWithRoles | null> {
    const project = await this.opts.projects.findById(id);
    if (project === null) return null;
    return { project, roles: await this.opts.projects.rolesOf(id) };
  }

  async update(id: string, actorId: string, patch: ProjectPatch): Promise<UpdateOutcome> {
    const project = await this.opts.projects.findById(id);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };
    const updated = await this.opts.projects.update(id, patch);
    // Gone between the read and the write. Reporting success would tell the
    // caller their rename landed on a project that no longer exists.
    if (updated === null) return { ok: false, reason: 'not_found' };
    return { ok: true, result: updated };
  }
}
