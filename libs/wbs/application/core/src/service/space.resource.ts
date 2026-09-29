import {
  canWriteInOrganization,
  type InProgressLeaf,
  inProgressLeavesOf,
  POSITION_STEP,
  type ProjectRollUp,
  ROLLUP_DTO_VERSION,
  rollUpProject,
  SCHEDULER_CONTRACT_VERSION,
  sortInProgress,
} from '@wbs/domain';

import type { ProjectService } from '../module/project/project.resource';
import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { Clock } from '../ports/clock';
import type { ResourceAccess } from '../ports/organization-access';
import type { Broadcaster } from '../ports/project-event';
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

/** One leaf in progress in a space, with its project and that project's place. */
export interface InProgressItem extends InProgressLeaf {
  projectId: string;
  projectName: string;
  position: number;
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
  /** The project page's own read, which every roll-up is computed from. */
  trees: Pick<WorkItemService, 'treeWithin'>;
  /** The project's event sequence, read before the tree to key the cache. */
  sequences: Pick<Broadcaster, 'latestSeq'>;
  /** One process's roll-ups; a fresh cache per process, shared by its requests. */
  rollUpCache: RollUpCache;
}

/** A project whose scheduler engine is unavailable: drawn as a mark, never a Fast fallback. */
export interface UnavailableRollUp {
  kind: 'unavailable';
}

/** An in-progress read's default and largest `limit` (spec `in-progress-now`). */
export const IN_PROGRESS_LIMIT = { default: 200, max: 1_000 } as const;

/** The most roll-ups one request may ask for (spec `space-read`). */
export const ROLL_UPS_PER_REQUEST = 50;

/** What one tree read yields for a space: its roll-up and its leaves in progress. */
export interface RolledProject {
  rollUp: ProjectRollUp;
  inProgress: InProgressLeaf[];
}

/**
 * A per-process LRU of {@link RolledProject}s (`add-spaces` design, memo §8).
 *
 * Keyed by project, event sequence, project revision, reader access,
 * scheduler contract and roll-up version: every plan write publishes to the
 * sequence and every settings write moves the revision, so a hit is current
 * in the writing process. Another process's write (blue/green overlap) or a
 * missed publication converges within {@link RollUpCache.ttlMs}. `capacity`
 * counts entries, one per project and reader, whatever number of leaves each
 * holds.
 */
export class RollUpCache {
  private readonly held = new Map<string, { rolled: RolledProject; storedAt: number }>();

  constructor(
    private readonly clock: Pick<Clock, 'now'>,
    private readonly capacity = 2_000,
    readonly ttlMs = 60_000,
  ) {}

  /**
   * The key for one project at one event sequence and one project revision,
   * as one kind of reader sees it.
   * The revision is not redundant with the sequence: a project settings change
   * (start date, PERT weights, reach, estimate method or rounding) advances
   * the revision and moves dates and totals, yet publishes no event.
   */
  static keyOf(projectId: string, seq: number, revision: number, access: ResourceAccess): string {
    // The access is part of what a tree read answers: scoped reads rename
    // assignees to the organization's own names (`treeWithin`).
    const reader = access.kind === 'legacy' ? 'legacy' : `org:${access.scope.organizationId}`;
    return `${projectId}:${String(seq)}:${String(revision)}:${reader}:${String(SCHEDULER_CONTRACT_VERSION)}:${String(ROLLUP_DTO_VERSION)}`;
  }

  get(key: string): RolledProject | undefined {
    const entry = this.held.get(key);
    if (entry === undefined) return undefined;
    // Proof, observed 2026-09-29: with this expiry skipped, `expires a roll-up
    // after the TTL even at the same sequence` in `space.resource.test.ts`
    // received the stale total 3 instead of 5.
    if (this.clock.now() - entry.storedAt >= this.ttlMs) {
      this.held.delete(key);
      return undefined;
    }
    this.held.delete(key);
    this.held.set(key, entry);
    return entry.rolled;
  }

  set(key: string, rolled: RolledProject): void {
    this.held.delete(key);
    this.held.set(key, { rolled, storedAt: this.clock.now() });
    for (const oldest of this.held.keys()) {
      if (this.held.size <= this.capacity) break;
      this.held.delete(oldest);
    }
  }
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
    // One read for every space's members (task 3.0): a space added between the
    // two reads counts no member, which the next read corrects.
    const members = await this.opts.spaces.membersIn(owner.organizationId);
    return {
      ok: true,
      value: spaces.map((space) =>
        summaryOf(
          space,
          (members.get(space.id) ?? []).filter(({ projectId }) => readable.has(projectId)).length,
        ),
      ),
    };
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
    if (spaceId === ALL_PROJECTS) {
      const projects = await this.opts.projects.listWithin(actorId, access);
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
    // The space is found before the project list is read (task 3.0): an
    // absent space costs one lookup, not the caller's whole project list.
    const space = await this.opts.spaces.findIn(owner.organizationId, spaceId);
    if (space === null) return { ok: false, refusal: 'not_found' };
    const members = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
    if (members === null) return { ok: false, refusal: 'not_found' };
    const projects = await this.opts.projects.listWithin(actorId, access);
    const readable = new Map(projects.map((project) => [project.id, project]));
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

  /**
   * Roll-ups for `projectIds`, each a member of the space the caller can open
   * (`all`: any project the caller can open). Any other id answers
   * `not_found` for the whole request, indistinguishable from a non-member.
   * A cached roll-up is answered only at the project's current sequence.
   */
  async rollUps(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    projectIds: readonly string[],
  ): Promise<
    SpaceAnswer<
      Record<string, ProjectRollUp | UnavailableRollUp>,
      'organization_required' | 'not_found'
    >
  > {
    const projects = await this.opts.projects.listWithin(actorId, access);
    const revisions = new Map(projects.map(({ id, revision }) => [id, revision]));
    const readable = new Set(revisions.keys());
    let members: Set<string> = readable;
    if (spaceId !== ALL_PROJECTS) {
      const owner = await this.ownerOf(access);
      if (!owner.ok) return owner;
      const listed = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
      if (listed === null) return { ok: false, refusal: 'not_found' };
      members = new Set(listed.map(({ projectId }) => projectId));
    }
    // Proof, observed 2026-09-29: with the readable check removed, `answers no
    // roll-up for a project the caller cannot open` in `space.resource.test.ts`
    // received the hidden project's roll-up instead of `not_found`.
    if (projectIds.some((projectId) => !members.has(projectId) || !readable.has(projectId))) {
      return { ok: false, refusal: 'not_found' };
    }
    const rollUps: Record<string, ProjectRollUp | UnavailableRollUp> = {};
    for (const projectId of projectIds) {
      const revision = revisions.get(projectId);
      // Checked readable above; absent here would be the list changing mid-call.
      if (revision === undefined) return { ok: false, refusal: 'not_found' };
      const rolled = await this.rolledOf(projectId, revision, access);
      if (rolled === null) return { ok: false, refusal: 'not_found' };
      rollUps[projectId] = 'kind' in rolled ? rolled : rolled.rollUp;
    }
    return { ok: true, value: rollUps };
  }

  /**
   * One project's roll-up, from the cache when its sequence and revision match.
   *
   * An entry is keyed by the reader's access as well, because the tree read
   * answers differently by access: under scoped access it renames assignees
   * to the organization's own names. A legacy read cached just before
   * activation is therefore never served to a scoped reader.
   *
   * A cache hit skips `treeWithin`, and with it the access gate's fail-closed
   * cross-reference check (`admits`); readability is still checked on every
   * call, above. So a hit can miss a reference across organizations written
   * after the entry was cached (corrupt state, which no route writes), and a
   * change the cache key does not carry, such as a person renamed in the
   * directory (no event, no project revision). Both last at most the 60 s TTL;
   * the next miss reads the tree afresh and fails closed.
   */
  private async rolledOf(
    projectId: string,
    revision: number,
    access: ResourceAccess,
  ): Promise<RolledProject | UnavailableRollUp | null> {
    const seq = await this.opts.sequences.latestSeq(projectId);
    // Proof, observed 2026-09-29: with the sequence left out of this key,
    // `answers a command's new total on the next read, and serves an unchanged
    // one from the cache` in `space.resource.test.ts` received the old total 3
    // instead of 5.
    // Proof, observed 2026-09-29: with the revision left out of this key,
    // `answers new dates after a start date change that publishes no event` in
    // `space-organization.controller.db.test.ts` received the cached
    // `2026-10-05` instead of `2026-11-02`.
    // Proof, observed 2026-09-29: with the access left out of this key, `keeps
    // a legacy read's assignee names from a scoped reader` in
    // `space.resource.test.ts` received the legacy name `Root Kat`.
    const cached = this.opts.rollUpCache.get(RollUpCache.keyOf(projectId, seq, revision, access));
    if (cached !== undefined) return cached;
    const tree = await this.opts.trees.treeWithin(projectId, access);
    if (tree === null) return null;
    // An unavailable engine is not cached: it can recover with no write.
    if ('kind' in tree) return { kind: 'unavailable' };
    const rollUp = rollUpProject({
      workItems: tree.workItems.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        status: row.status,
        finalTotal: row.finalTotal,
        dates: row.dates,
        estimated: Object.keys(row.estimates).length > 0,
      })),
      scheduleError: tree.scheduleError,
      waitingForPerson: tree.waitingForPerson,
      waitingForCapacity: tree.waitingForCapacity,
      displayed: tree.optimization?.displayed ?? 'fast',
      projectRevision: tree.projectRevision,
      seq: tree.seq,
    });
    const rolled: RolledProject = {
      rollUp,
      inProgress: inProgressLeavesOf({
        workItems: tree.workItems,
        slices: tree.slices,
        steps: tree.steps,
        assignedPeople: tree.assignedPeople,
      }),
    };
    // Keyed by the sequence and revision the tree itself read, which are the
    // ones its rows are current at.
    this.opts.rollUpCache.set(
      RollUpCache.keyOf(projectId, tree.seq, tree.projectRevision, access),
      rolled,
    );
    return rolled;
  }

  /**
   * The leaves in progress across the readable members of a space (`all`:
   * every project the caller can open), ordered by end date with undated last,
   * then space position, then number, and cut to `limit`
   * (spec `in-progress-now`). A project whose engine is unavailable
   * contributes nothing; `unavailable` names those projects.
   */
  async inProgress(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    limit: number,
  ): Promise<
    SpaceAnswer<
      { items: InProgressItem[]; truncated: boolean; unavailable: string[] },
      'organization_required' | 'not_found'
    >
  > {
    const projects = await this.opts.projects.listWithin(actorId, access);
    const readable = new Map(projects.map((project) => [project.id, project]));
    let placed: { projectId: string; position: number }[];
    if (spaceId === ALL_PROJECTS) {
      placed = projects.map(({ id }, index) => ({
        projectId: id,
        position: (index + 1) * POSITION_STEP,
      }));
    } else {
      const owner = await this.ownerOf(access);
      if (!owner.ok) return owner;
      const members = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
      if (members === null) return { ok: false, refusal: 'not_found' };
      // The leak rule: a member the caller cannot open contributes nothing.
      // Proof, observed 2026-09-29: with this filter removed, `takes nothing
      // from a member the caller cannot open, and names unavailable engines`
      // in `space.resource.test.ts` threw on the hidden member instead.
      placed = members.filter(({ projectId }) => readable.has(projectId));
    }
    const items: InProgressItem[] = [];
    const unavailable: string[] = [];
    for (const { projectId, position } of placed) {
      const project = readable.get(projectId);
      // `placed` holds only readable projects, so this is a broken invariant.
      if (project === undefined) throw new Error(`placed project ${projectId} is not readable`);
      const rolled = await this.rolledOf(projectId, project.revision, access);
      // Deleted since the list was read: nothing of it is in progress.
      if (rolled === null) continue;
      if ('kind' in rolled) {
        unavailable.push(projectId);
        continue;
      }
      for (const leaf of rolled.inProgress) {
        items.push({ ...leaf, projectId, projectName: project.name, position });
      }
    }
    const ordered = sortInProgress(items, ({ dates }) => dates?.endsOn ?? null);
    // Proof, observed 2026-09-29: with this cut removed, `cuts the list at
    // the limit and says it was cut` in `space.resource.test.ts` received
    // 1,001 items instead of 1,000.
    return {
      ok: true,
      value: {
        items: ordered.slice(0, limit),
        truncated: ordered.length > limit,
        unavailable,
      },
    };
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
    // Proof, observed 2026-09-29: with `projectId` left out of this gate,
    // `answers a project the caller cannot open as not_found, adding nothing`
    // in `space.resource.test.ts` received the store's position instead; with
    // `afterProjectId` left out, `refuses to place a project after it, as if
    // it were not a member` received `{ ok: true, value: 25 }`. Over SQLite
    // today the store's ownership read refuses a foreign project too; this is
    // the gate a future read restriction on projects relies on.
    if (!(await this.canOpenAll(access, projectId, afterProjectId))) {
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
    // Proof, observed 2026-09-29: with this gate removed, `refuses to remove
    // it` in `space.resource.test.ts` received `{ ok: true, value: null }`.
    if (!(await this.canOpenAll(access, projectId))) return { ok: false, refusal: 'not_found' };
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
    // Proof, observed 2026-09-29: with `projectId` left out of this gate,
    // `refuses to move it, or to move another after it` in
    // `space.resource.test.ts` received `{ ok: true, value: 5 }`; with
    // `afterProjectId` left out, the second move received `{ ok: true, value: 30 }`.
    if (!(await this.canOpenAll(access, projectId, afterProjectId))) {
      return { ok: false, refusal: 'not_found' };
    }
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

  /**
   * Whether the caller can open every named project through the project
   * routes' own read (`null` names none). A membership write addressing a
   * project the caller cannot open, as the member or as the anchor, answers
   * that route's 404 exactly as if it were no member: the leak rule for
   * writes, so a hidden member is neither movable, removable nor probeable.
   */
  private async canOpenAll(
    access: ResourceAccess,
    ...projectIds: readonly (string | null)[]
  ): Promise<boolean> {
    for (const projectId of projectIds) {
      if (projectId === null) continue;
      if ((await this.opts.projects.readWithin(projectId, access)) === null) return false;
    }
    return true;
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
    if (!this.mayWrite(access)) return { ok: false, refusal: 'forbidden' };
    return this.ownerOf(access);
  }

  /**
   * Whether the caller may create, rename or delete spaces and edit their
   * membership: every role but viewer, and legacy access as it may write
   * projects. The routes answer it as `writable` so fe-01 shows no handle a
   * write would refuse; the writes still check it themselves.
   */
  mayWrite(access: ResourceAccess): boolean {
    return access.kind === 'legacy' || canWriteInOrganization(access.scope.role);
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
