import { canWriteInOrganization, POSITION_STEP } from '@wbs/domain';

import type { ProjectService } from '../module/project/project.resource';
import type { Clock } from '../ports/clock';
import type { ResourceAccess } from '../ports/organization-access';
import type { ProjectWithAccess } from '../ports/project-store';
import type { Space, SpaceStore } from '../ports/space-store';

/** The address of the virtual All projects space (spec `space-read`). */
export const ALL_PROJECTS = 'all';
/** The longest space name, in code points, after trimming. */
export const SPACE_NAME_MAX = 120;

/**
 * Why a space request was refused. `malformed_name` is a blank or over-long
 * name; every other word is the wire's `error`.
 */
export type SpaceRefusal =
  | 'organization_required'
  | 'forbidden'
  | 'not_found'
  | 'name_taken'
  | 'already_in_space'
  | 'virtual_space'
  | 'malformed_name';

/** A decision, or the refusals that method can answer and no others. */
export type SpaceAnswer<T, R extends SpaceRefusal> =
  { ok: true; value: T } | { ok: false; refusal: R };

/** One space as the routes answer it; the virtual space has no author, instant or revision. */
export interface SpaceSummary {
  id: string;
  name: string;
  virtual: boolean;
  projectCount: number;
  revision: number;
  createdById: string | null;
  createdAt: number | null;
}

/** One readable project in its place. */
export interface SpaceRow {
  project: ProjectWithAccess;
  position: number;
}

export interface SpaceResourceOptions {
  spaces: SpaceStore;
  /**
   * The project routes' own predicate: `listWithin` is what `GET
   * /api/projects` answers and `readWithin` is what `GET /api/projects/:id`
   * finds. Every space read and add goes through them and nothing else, so a
   * future read restriction on projects needs no change here (the leak rule).
   */
  projects: Pick<ProjectService, 'listWithin' | 'readWithin'>;
  clock: Clock;
}

type Owner = { ok: true; organizationId: string } | { ok: false; refusal: 'organization_required' };

/**
 * Spaces through the caller's access (`add-spaces`, specs `space-read` and
 * `space-authorization`).
 *
 * **The leak rule.** A project the caller cannot open is omitted from every
 * answer: no row, no count, no placeholder. Membership is filtered through
 * {@link SpaceResourceOptions.projects}, never read raw into a reply.
 *
 * The owner is the scope's organization, or under legacy access the one marked
 * legacy; with none, every named-space request answers
 * `organization_required` while `all` still reads. Writes to `all` answer
 * `virtual_space` under any access. Viewers read and never write.
 */
export class SpaceResource {
  constructor(private readonly opts: SpaceResourceOptions) {}

  async list(
    actorId: string,
    access: ResourceAccess,
  ): Promise<SpaceAnswer<SpaceSummary[], 'organization_required'>> {
    const owner = await this.ownerOf(access);
    if (!owner.ok) return owner;
    const readable = await this.readableIds(actorId, access);
    const spaces = await this.opts.spaces.listIn(owner.organizationId);
    const summaries: SpaceSummary[] = [];
    for (const space of spaces) {
      const members = await this.opts.spaces.membersOf(owner.organizationId, space.id);
      // Deleted between the two reads: it is no longer a space to list.
      if (members === null) continue;
      summaries.push(
        summaryOf(space, members.filter(({ projectId }) => readable.has(projectId)).length),
      );
    }
    return { ok: true, value: summaries };
  }

  async create(
    actorId: string,
    access: ResourceAccess,
    name: string,
  ): Promise<
    SpaceAnswer<
      SpaceSummary,
      'organization_required' | 'forbidden' | 'name_taken' | 'malformed_name'
    >
  > {
    const trimmed = spaceNameOf(name);
    if (trimmed === null) return { ok: false, refusal: 'malformed_name' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    const written = await this.opts.spaces.create(
      { id: this.opts.clock.newId(), organizationId: owner.organizationId, name: trimmed },
      this.opts.clock.stampFor(actorId),
    );
    if (written.ok) return { ok: true, value: summaryOf(written.space, 0) };
    // A create names no existing space, so `not_found` cannot arise from it.
    if (written.reason === 'not_found') throw new Error('space create answered not_found');
    return { ok: false, refusal: written.reason };
  }

  async read(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
  ): Promise<
    SpaceAnswer<{ space: SpaceSummary; rows: SpaceRow[] }, 'organization_required' | 'not_found'>
  > {
    const projects = await this.opts.projects.listWithin(actorId, access);
    if (spaceId === ALL_PROJECTS) {
      return {
        ok: true,
        value: {
          space: {
            id: ALL_PROJECTS,
            name: 'All projects',
            virtual: true,
            projectCount: projects.length,
            revision: 0,
            createdById: null,
            createdAt: null,
          },
          rows: projects.map((project, index) => ({
            project,
            position: (index + 1) * POSITION_STEP,
          })),
        },
      };
    }
    const owner = await this.ownerOf(access);
    if (!owner.ok) return owner;
    const space = await this.opts.spaces.findIn(owner.organizationId, spaceId);
    if (space === null) return { ok: false, refusal: 'not_found' };
    const readable = new Map(projects.map((project) => [project.id, project]));
    const members = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
    if (members === null) return { ok: false, refusal: 'not_found' };
    const rows: SpaceRow[] = [];
    for (const { projectId, position } of members) {
      const project = readable.get(projectId);
      // Proof, observed 2026-09-29: with this filter removed (a row for every
      // member), `omits a project the caller cannot open from the rows and the
      // count` in `space.resource.test.ts` received a third row.
      if (project !== undefined) rows.push({ project, position });
    }
    return { ok: true, value: { space: summaryOf(space, rows.length), rows } };
  }

  async rename(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    name: string,
  ): Promise<
    SpaceAnswer<
      SpaceSummary,
      | 'organization_required'
      | 'forbidden'
      | 'not_found'
      | 'name_taken'
      | 'virtual_space'
      | 'malformed_name'
    >
  > {
    if (spaceId === ALL_PROJECTS) return { ok: false, refusal: 'virtual_space' };
    const trimmed = spaceNameOf(name);
    if (trimmed === null) return { ok: false, refusal: 'malformed_name' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    const written = await this.opts.spaces.rename(
      owner.organizationId,
      spaceId,
      trimmed,
      this.opts.clock.stampFor(actorId),
    );
    if (!written.ok) return { ok: false, refusal: written.reason };
    const readable = await this.readableIds(actorId, access);
    const members = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
    if (members === null) return { ok: false, refusal: 'not_found' };
    return {
      ok: true,
      value: summaryOf(
        written.space,
        members.filter(({ projectId }) => readable.has(projectId)).length,
      ),
    };
  }

  async remove(
    access: ResourceAccess,
    spaceId: string,
  ): Promise<
    SpaceAnswer<null, 'organization_required' | 'forbidden' | 'not_found' | 'virtual_space'>
  > {
    if (spaceId === ALL_PROJECTS) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    return (await this.opts.spaces.remove(owner.organizationId, spaceId))
      ? { ok: true, value: null }
      : { ok: false, refusal: 'not_found' };
  }

  async addProject(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
  ): Promise<
    SpaceAnswer<
      number,
      'organization_required' | 'forbidden' | 'not_found' | 'already_in_space' | 'virtual_space'
    >
  > {
    if (spaceId === ALL_PROJECTS) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    // Proof, observed 2026-09-29: with this read bypassed, `answers a project
    // the caller cannot open as not_found, adding nothing` in
    // `space.resource.test.ts` received the store's position instead. Over
    // SQLite today the store's ownership read refuses a foreign project too;
    // this is the gate a future read restriction on projects relies on.
    if ((await this.opts.projects.readWithin(projectId, access)) === null) {
      return { ok: false, refusal: 'not_found' };
    }
    const written = await this.opts.spaces.addProject(
      owner.organizationId,
      spaceId,
      projectId,
      afterProjectId,
      this.opts.clock.stampFor(actorId),
    );
    return written.ok
      ? { ok: true, value: written.position }
      : { ok: false, refusal: written.reason };
  }

  async removeProject(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    projectId: string,
  ): Promise<
    SpaceAnswer<null, 'organization_required' | 'forbidden' | 'not_found' | 'virtual_space'>
  > {
    if (spaceId === ALL_PROJECTS) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    return (await this.opts.spaces.removeProject(
      owner.organizationId,
      spaceId,
      projectId,
      this.opts.clock.stampFor(actorId),
    ))
      ? { ok: true, value: null }
      : { ok: false, refusal: 'not_found' };
  }

  async moveProject(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
  ): Promise<
    SpaceAnswer<number, 'organization_required' | 'forbidden' | 'not_found' | 'virtual_space'>
  > {
    if (spaceId === ALL_PROJECTS) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    const written = await this.opts.spaces.moveProject(
      owner.organizationId,
      spaceId,
      projectId,
      afterProjectId,
      this.opts.clock.stampFor(actorId),
    );
    // A move never adds, so the store's `already_in_space` cannot arise;
    // answering it as absent would hide a store fault, so it throws.
    if (!written.ok && written.reason === 'already_in_space') {
      throw new Error(`space ${spaceId} answered already_in_space to a move`);
    }
    return written.ok ? { ok: true, value: written.position } : { ok: false, refusal: 'not_found' };
  }

  private async ownerOf(access: ResourceAccess): Promise<Owner> {
    if (access.kind === 'scoped') return { ok: true, organizationId: access.scope.organizationId };
    const legacy = await this.opts.spaces.legacyOrganizationId();
    return legacy === null
      ? { ok: false, refusal: 'organization_required' }
      : { ok: true, organizationId: legacy };
  }

  /**
   * {@link ownerOf}, refusing a viewer. Legacy access keeps its
   * deployment-wide write authority, as it does for projects.
   *
   * Proof, observed 2026-09-29: with this role check skipped,
   * `refuses a viewer every space write and lets the viewer read` in
   * `space-organization.controller.db.test.ts` received 201 instead of 403 for
   * the viewer's create, and `refuses a viewer every write` in
   * `space.resource.test.ts` received the writes' answers instead of `forbidden`.
   */
  private async writableOwner(
    access: ResourceAccess,
  ): Promise<Owner | { ok: false; refusal: 'forbidden' }> {
    if (access.kind === 'scoped' && !canWriteInOrganization(access.scope.role)) {
      return { ok: false, refusal: 'forbidden' };
    }
    return this.ownerOf(access);
  }

  private async readableIds(actorId: string, access: ResourceAccess): Promise<Set<string>> {
    return new Set(
      (await this.opts.projects.listWithin(actorId, access)).map((project) => project.id),
    );
  }
}

/** The trimmed name, or null when blank or longer than {@link SPACE_NAME_MAX} code points. */
function spaceNameOf(name: string): string | null {
  const trimmed = name.trim();
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are the unit the spec counts in
  const length = [...trimmed].length;
  return length === 0 || length > SPACE_NAME_MAX ? null : trimmed;
}

function summaryOf(space: Space, projectCount: number): SpaceSummary {
  return {
    id: space.id,
    name: space.name,
    virtual: false,
    projectCount,
    revision: space.revision,
    createdById: space.createdBy,
    createdAt: space.createdAt,
  };
}
