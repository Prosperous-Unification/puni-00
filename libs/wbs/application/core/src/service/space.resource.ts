import type { Permission } from '@wbs/domain';
import {
  type InProgressLeaf,
  inProgressLeavesOf,
  POSITION_STEP,
  ROLLUP_DTO_VERSION,
  rollUpWorkPackage,
  SCHEDULER_CONTRACT_VERSION,
  sortInProgress,
  type WorkPackageRollUp,
} from '@wbs/domain';

import type { AccessDecisions } from '../ports/access-decisions';
import type { Clock } from '../ports/clock';
import type { ResourceAccess } from '../ports/organization-access';
import type { SettingStore, SettingTarget } from '../ports/setting-store';
import type { AccessRefused } from '../ports/shared-people-values';
import type { Space, SpaceStore } from '../ports/space-store';
import type { TreeRead } from '../ports/tree-read';
import type { Broadcaster } from '../ports/work-package-event';
import type { WorkPackageRead } from '../ports/work-package-read';
import type { WorkPackageWithAccess } from '../ports/work-package-store';
import type { WriteStamp } from '../ports/write-stamp';
import { authorize } from './authorize';

/** The address of the virtual All work packages space (spec `space-read`). */
export const ALL_WORK_PACKAGES = 'all';
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
  | 'project_in_other_space'
  | 'already_in_space'
  | 'virtual_space'
  | 'malformed_name';

/** A decision, or the refusals that method can answer and no others. */
export type SpaceAnswer<T, R extends SpaceRefusal> =
  | { ok: true; value: T }
  | { ok: false; refusal: Exclude<R, 'project_in_other_space'>; readonly permission?: Permission }
  | ('project_in_other_space' extends R
      ? {
          ok: false;
          refusal: 'project_in_other_space';
          spaceId: string;
          readonly permission?: never;
        }
      : never);

/** One space as the routes answer it; the virtual space has no author, instant or revision. */
export interface SpaceSummary {
  id: string;
  name: string;
  virtual: boolean;
  workPackageCount: number;
  revision: number;
  createdById: string | null;
  createdAt: number | null;
}

/** One leaf in progress in a space, with its work package and that work package's place. */
export interface InProgressItem extends InProgressLeaf {
  workPackageId: string;
  workPackageName: string;
  position: number;
}

/** One readable work package in its place. */
export interface SpaceRow {
  workPackage: WorkPackageWithAccess;
  position: number;
}

export interface SpaceResourceOptions {
  readonly accessDecisions?: AccessDecisions;
  spaces: SpaceStore;
  settings: {
    readTarget(
      scope: { readonly level: 'project'; readonly id: string },
      organizationId: string | null,
    ): Promise<Extract<SettingTarget, { readonly kind: 'project' }> | null>;
    touchPackages: SettingStore['touchPackages'];
  };
  announcements: Broadcaster;
  /**
   * The work package routes' own predicate: `listWithin` is what `GET
   * /api/work-packages` answers and `readWithin` is what `GET /api/work-packages/:id`
   * finds. Every space read and add goes through them and nothing else, so a
   * future read restriction on work packages needs no change here (the leak rule).
   */
  workPackages: WorkPackageRead;
  clock: Clock;
  /** The work package page's own read and the shared aggregate projection for cache admission. */
  trees: TreeRead;
  /** The work package's event sequence, read before the tree to key the cache. */
  sequences: Pick<Broadcaster, 'latestSeq'>;
  /** One process's roll-ups; a fresh cache per process, shared by its requests. */
  rollUpCache: RollUpCache;
}

/** A work package whose scheduler engine is unavailable: drawn as a mark, never a Fast fallback. */
export interface UnavailableRollUp {
  kind: 'unavailable';
}

/** An in-progress read's default and largest `limit` (spec `in-progress-now`). */
export const IN_PROGRESS_LIMIT = { default: 200, max: 1_000 } as const;

/** The most roll-ups one request may ask for (spec `space-read`). */
export const ROLL_UPS_PER_REQUEST = 50;

/** What one tree read yields for a space: its roll-up and its leaves in progress. */
export interface RolledWorkPackage {
  rollUp: WorkPackageRollUp;
  inProgress: InProgressLeaf[];
}

type SharedTreeEntry = Extract<
  Awaited<ReturnType<TreeRead['sharedTreesWithin']>>,
  { readonly kind: 'shared' }
>['entries'][number];

/**
 * A per-process LRU of {@link RolledWorkPackage}s (`add-spaces` design, memo §8).
 *
 * Keyed by work package, event sequence, work package revision, reader access,
 * scheduler contract and roll-up version; shared reads add the captured
 * incoming-calendar basis. Every plan write publishes to the sequence and
 * every settings write moves the revision. Another process's write or a
 * missed publication converges within {@link RollUpCache.ttlMs}. `capacity`
 * counts entries, one per work package and reader, whatever number of leaves each
 * holds.
 */
export class RollUpCache {
  private readonly held = new Map<string, { rolled: RolledWorkPackage; storedAt: number }>();

  constructor(
    private readonly clock: Pick<Clock, 'now'>,
    private readonly capacity = 2_000,
    // Well above fe-01's 60 s poll, so a poll serves the cache and a write
    // (sequence or revision) is what recomputes; see design D4.
    readonly ttlMs = 300_000,
  ) {}

  /**
   * The key for one work package at one event sequence and one work package revision,
   * as one kind of reader sees it. Shared reads add `basis` while isolated
   * addresses keep their original bytes.
   * The revision is not redundant with the sequence: a work package settings change
   * (start date, PERT weights, reach, estimate method or rounding) advances
   * the revision and moves dates and totals, yet publishes no event.
   */
  static keyOf(
    workPackageId: string,
    seq: number,
    revision: number,
    access: ResourceAccess,
    basis?: string,
  ): string {
    // The access is part of what a tree read answers: scoped reads rename
    // assignees to the organization's own names (`treeWithin`).
    const reader = access.kind === 'legacy' ? 'legacy' : `org:${access.scope.organizationId}`;
    const key = `${workPackageId}:${String(seq)}:${String(revision)}:${reader}:${String(SCHEDULER_CONTRACT_VERSION)}:${String(ROLLUP_DTO_VERSION)}`;
    return basis === undefined ? key : `${key}:${basis}`;
  }

  get(key: string): RolledWorkPackage | undefined {
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

  set(key: string, rolled: RolledWorkPackage): void {
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
 * **The leak rule.** A work package the caller cannot open is omitted from every
 * answer: no row, no count, no placeholder. Membership is filtered through
 * {@link SpaceResourceOptions.work packages}, never read raw into a reply.
 *
 * The owner is the scope's organization, or under legacy access the one marked
 * legacy; with none, every named-space request answers
 * `organization_required` while `all` still reads. Writes to `all` answer
 * `virtual_space` under any access. Viewers read and never write.
 */
// Historical package-membership Proof paragraphs below are preserved provenance; current membership and admission address projects.
export class SpaceResource {
  constructor(private readonly opts: SpaceResourceOptions) {}

  /** Builds only the mapped space resource over this write turn's borrowed catalog. */
  over(
    spaces: SpaceStore,
    accessDecisions: AccessDecisions | undefined,
    settings: SettingStore,
    announcements: Broadcaster,
  ): SpaceResource {
    return new SpaceResource({ ...this.opts, spaces, accessDecisions, settings, announcements });
  }

  async list(
    actorId: string,
    access: ResourceAccess,
  ): Promise<SpaceAnswer<SpaceSummary[], 'organization_required'>> {
    const owner = await this.ownerOf(access);
    if (!owner.ok) return owner;
    const readable = await this.readableProjects(actorId, access);
    const spaces = await this.opts.spaces.listIn(owner.organizationId);
    // One read for every space's members (task 3.0): a space added between the
    // two reads counts no member, which the next read corrects.
    const members = await this.opts.spaces.membersIn(owner.organizationId);
    return {
      ok: true,
      value: spaces.map((space) =>
        summaryOf(
          space,
          (members.get(space.id) ?? []).reduce(
            (count, { projectId }) => count + (readable.get(projectId) ?? 0),
            0,
          ),
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
    SpaceAnswer<
      {
        space: SpaceSummary;
        rows: SpaceRow[];
        personIds: readonly string[];
        serviceTeamIds: readonly string[];
      },
      'organization_required' | 'not_found'
    >
  > {
    if (spaceId === ALL_WORK_PACKAGES) {
      const workPackages = await this.opts.workPackages.listWithin(actorId, access);
      return {
        ok: true,
        value: {
          personIds: [],
          serviceTeamIds: [],
          space: {
            id: ALL_WORK_PACKAGES,
            name: 'All work packages',
            virtual: true,
            workPackageCount: workPackages.length,
            revision: 0,
            createdById: null,
            createdAt: null,
          },
          rows: workPackages.map((workPackage, index) => ({
            workPackage,
            position: (index + 1) * POSITION_STEP,
          })),
        },
      };
    }
    const owner = await this.ownerOf(access);
    if (!owner.ok) return owner;
    // The space is found before the work package list is read (task 3.0): an
    // absent space costs one lookup, not the caller's whole work package list.
    const contents = await this.opts.spaces.readContents(owner.organizationId, spaceId);
    if (contents === null) return { ok: false, refusal: 'not_found' };
    const workPackages = await this.opts.workPackages.listWithin(actorId, access);
    const rows: SpaceRow[] = [];
    for (const workPackage of workPackages) {
      const member = contents.projects.find(({ projectId }) => projectId === workPackage.projectId);
      const position = member?.position;
      // Proof, observed 2026-09-29: with this filter removed (a row for every
      // member), `omits a workPackage the caller cannot open from the rows and the
      // count` in `space.resource.test.ts` received a third row.
      if (position !== undefined) rows.push({ workPackage, position });
    }
    rows.sort(
      (left, right) =>
        left.position - right.position ||
        (left.workPackage.projectId < right.workPackage.projectId
          ? -1
          : left.workPackage.projectId > right.workPackage.projectId
            ? 1
            : 0),
    );
    return {
      ok: true,
      value: {
        space: summaryOf(contents.space, rows.length),
        rows,
        personIds: contents.personIds,
        serviceTeamIds: contents.serviceTeamIds,
      },
    };
  }

  /**
   * Roll-ups for `workPackageIds`, each a member of the space the caller can open
   * (`all`: any work package the caller can open). Any other id answers
   * `not_found` for the whole request, indistinguishable from a non-member.
   * A cached roll-up is answered only at the work package's current sequence.
   */
  async rollUps(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    workPackageIds: readonly string[],
  ): Promise<
    | SpaceAnswer<
        Record<string, WorkPackageRollUp | UnavailableRollUp>,
        'organization_required' | 'not_found'
      >
    | AccessRefused
  > {
    const workPackages = await this.opts.workPackages.listWithin(actorId, access);
    const revisions = new Map(workPackages.map(({ id, revision }) => [id, revision]));
    const readable = new Set(revisions.keys());
    let members: Set<string> = readable;
    if (spaceId !== ALL_WORK_PACKAGES) {
      const owner = await this.ownerOf(access);
      if (!owner.ok) return owner;
      const listed = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
      if (listed === null) return { ok: false, refusal: 'not_found' };
      const projects = new Set(listed.map(({ projectId }) => projectId));
      members = new Set(
        workPackages.filter(({ projectId }) => projects.has(projectId)).map(({ id }) => id),
      );
    }
    // Proof, observed 2026-09-29: with the readable check removed, `answers no
    // roll-up for a work package the caller cannot open` in `space.resource.test.ts`
    // received the hidden work package's roll-up instead of `not_found`.
    if (
      workPackageIds.some(
        (workPackageId) => !members.has(workPackageId) || !readable.has(workPackageId),
      )
    ) {
      return { ok: false, refusal: 'not_found' };
    }
    const observation = await this.opts.trees.sharedTreesWithin(actorId, access);
    if (observation.kind === 'access_refused') return observation;
    const shared =
      observation.kind === 'shared' || observation.kind === 'isolated-connected'
        ? new Map(observation.entries.map((entry) => [entry.workPackageId, entry] as const))
        : null;
    const rollUps: Record<string, WorkPackageRollUp | UnavailableRollUp> = {};
    for (const workPackageId of workPackageIds) {
      const revision = revisions.get(workPackageId);
      // Checked readable above; absent here would be the list changing mid-call.
      if (revision === undefined) return { ok: false, refusal: 'not_found' };
      const entry = shared?.get(workPackageId);
      if (shared !== null && entry === undefined) return { ok: false, refusal: 'not_found' };
      const rolled = await this.rolledOf(workPackageId, entry?.revision ?? revision, access, entry);
      if (rolled === null) return { ok: false, refusal: 'not_found' };
      if ('kind' in rolled && rolled.kind === 'access_refused') return rolled;
      rollUps[workPackageId] = 'kind' in rolled ? rolled : rolled.rollUp;
    }
    return { ok: true, value: rollUps };
  }

  /**
   * One work package's roll-up, from the cache when its sequence and revision match.
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
   * directory (no event, no work package revision). Both last at most the 5 min TTL;
   * the next miss reads the tree afresh and fails closed.
   * Connected trees are not stored under this target-only cache identity; their
   * foreign calendars and required engines can change independently. Shared
   * connected aggregate entries carry a null basis to bypass cache lookup too.
   */
  private async rolledOf(
    workPackageId: string,
    revision: number,
    access: ResourceAccess,
    shared?: SharedTreeEntry,
  ): Promise<RolledWorkPackage | UnavailableRollUp | AccessRefused | null> {
    // Proof: accepting a held value before captured availability made an unavailable influencer retain old dates.
    if (shared !== undefined && 'kind' in shared.tree) return { kind: 'unavailable' };
    const seq = shared?.seq ?? (await this.opts.sequences.latestSeq(workPackageId));
    const basis = shared?.basis ?? undefined;
    const cacheable = shared?.basis !== null;
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
    // Proof: omitting basis lookup/storage made mounted warm roll-up and in-progress reads retain old dates.
    // Proof: omitting the null-basis lookup guard failed mounted `does not reuse isolated load or roll-up entries`: the shared roll-up had no calendar_range.
    const cached = cacheable
      ? this.opts.rollUpCache.get(RollUpCache.keyOf(workPackageId, seq, revision, access, basis))
      : undefined;
    if (cached !== undefined) return cached;
    const tree = shared?.tree ?? (await this.opts.trees.treeWithin(workPackageId, access));
    if (tree === null) return null;
    // An unavailable engine is not cached: it can recover with no write.
    // Proof: removing this branch failed mounted revocation: 403 became 200 with unavailable work package output.
    if ('kind' in tree && tree.kind === 'access_refused') return tree;
    if ('kind' in tree) return { kind: 'unavailable' };
    const rollUp = rollUpWorkPackage({
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
      // Proof: restoring the Fast default failed mounted isolated-capacity unavailable roll-ups (displayed was fast).
      displayed:
        tree.connectedDependencies !== undefined && tree.scheduleError !== null
          ? null
          : (tree.optimization?.displayed ?? 'fast'),
      workPackageRevision: tree.workPackageRevision,
      seq: tree.seq,
    });
    const rolled: RolledWorkPackage = {
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
    // Proof: omitting the null-basis storage guard failed the same mounted test: the following isolated roll-up kept calendar_range.
    // Proof: allowing connected storage failed mounted isolated-capacity calendar recovery: Target roll-up retained missing-calendar after Remote gained an anchor.
    if (cacheable && tree.connectedDependencies === undefined)
      this.opts.rollUpCache.set(
        RollUpCache.keyOf(workPackageId, tree.seq, tree.workPackageRevision, access, basis),
        rolled,
      );
    return rolled;
  }

  /**
   * The leaves in progress across the readable members of a space (`all`:
   * every work package the caller can open), ordered by end date with undated last,
   * then space position, then number, and cut to `limit`
   * (spec `in-progress-now`). A work package whose engine is unavailable
   * contributes nothing; `unavailable` names those work packages.
   */
  async inProgress(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    limit: number,
  ): Promise<
    | SpaceAnswer<
        { items: InProgressItem[]; truncated: boolean; unavailable: string[] },
        'organization_required' | 'not_found'
      >
    | AccessRefused
  > {
    const workPackages = await this.opts.workPackages.listWithin(actorId, access);
    const readable = new Map(workPackages.map((workPackage) => [workPackage.id, workPackage]));
    let placed: { workPackageId: string; position: number }[];
    if (spaceId === ALL_WORK_PACKAGES) {
      placed = workPackages.map(({ id }, index) => ({
        workPackageId: id,
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
      placed = workPackages.flatMap((workPackage) => {
        const member = members.find(({ projectId }) => projectId === workPackage.projectId);
        return member === undefined
          ? []
          : [{ workPackageId: workPackage.id, position: member.position }];
      });
    }
    const observation = await this.opts.trees.sharedTreesWithin(actorId, access);
    if (observation.kind === 'access_refused') return observation;
    const shared =
      observation.kind === 'shared' || observation.kind === 'isolated-connected'
        ? new Map(observation.entries.map((entry) => [entry.workPackageId, entry] as const))
        : null;
    const items: InProgressItem[] = [];
    const unavailable: string[] = [];
    for (const { workPackageId, position } of placed) {
      const workPackage = readable.get(workPackageId);
      // `placed` holds only readable work packages, so this is a broken invariant.
      if (workPackage === undefined)
        throw new Error(`placed work package ${workPackageId} is not readable`);
      const entry = shared?.get(workPackageId);
      if (shared !== null && entry === undefined) continue;
      const rolled = await this.rolledOf(
        workPackageId,
        entry?.revision ?? workPackage.revision,
        access,
        entry,
      );
      // Deleted since the list was read: nothing of it is in progress.
      if (rolled === null) continue;
      if ('kind' in rolled && rolled.kind === 'access_refused') return rolled;
      if ('kind' in rolled) {
        unavailable.push(workPackageId);
        continue;
      }
      for (const leaf of rolled.inProgress) {
        items.push({
          ...leaf,
          workPackageId,
          workPackageName: entry?.name ?? workPackage.name,
          position,
        });
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
    if (spaceId === ALL_WORK_PACKAGES) return { ok: false, refusal: 'virtual_space' };
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
    const readable = await this.readableProjects(actorId, access);
    const members = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
    if (members === null) return { ok: false, refusal: 'not_found' };
    return {
      ok: true,
      value: summaryOf(
        written.space,
        members.reduce((count, { projectId }) => count + (readable.get(projectId) ?? 0), 0),
      ),
    };
  }

  async remove(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
  ): Promise<
    SpaceAnswer<null, 'organization_required' | 'forbidden' | 'not_found' | 'virtual_space'>
  > {
    if (spaceId === ALL_WORK_PACKAGES) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    const members = await this.opts.spaces.membersOf(owner.organizationId, spaceId);
    if (members === null) return { ok: false, refusal: 'not_found' };
    const stamp = this.opts.clock.stampFor(actorId);
    if (!(await this.opts.spaces.remove(owner.organizationId, spaceId, stamp)))
      return { ok: false, refusal: 'not_found' };
    for (const { projectId } of members) await this.changedProject(projectId, access, stamp);
    return { ok: true, value: null };
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
      | 'organization_required'
      | 'forbidden'
      | 'not_found'
      | 'already_in_space'
      | 'project_in_other_space'
      | 'virtual_space'
    >
  > {
    if (spaceId === ALL_WORK_PACKAGES) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    // Proof, observed 2026-09-29: with `workPackageId` left out of this gate,
    // `answers a workPackage the caller cannot open as not_found, adding nothing`
    // in `space.resource.test.ts` received the store's position instead; with
    // `afterWorkPackageId` left out, `refuses to place a workPackage after it, as if
    // it were not a member` received `{ ok: true, value: 25 }`. Over SQLite
    // today the store's ownership read refuses a foreign work package too; this is
    // the gate a future read restriction on work packages relies on.
    if (!(await this.canOpenAll(access, projectId, afterProjectId))) {
      return { ok: false, refusal: 'not_found' };
    }
    const stamp = this.opts.clock.stampFor(actorId);
    const written = await this.opts.spaces.addProject(
      owner.organizationId,
      spaceId,
      projectId,
      afterProjectId,
      stamp,
    );
    if (written.ok) await this.changedProject(projectId, access, stamp);
    if (!written.ok && written.reason === 'project_in_other_space')
      return { ok: false, refusal: written.reason, spaceId: written.spaceId };
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
    if (spaceId === ALL_WORK_PACKAGES) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    // Proof, observed 2026-09-29: with this gate removed, `refuses to remove
    // it` in `space.resource.test.ts` received `{ ok: true, value: null }`.
    if (!(await this.canOpenAll(access, projectId))) return { ok: false, refusal: 'not_found' };
    const stamp = this.opts.clock.stampFor(actorId);
    if (!(await this.opts.spaces.removeProject(owner.organizationId, spaceId, projectId, stamp)))
      return { ok: false, refusal: 'not_found' };
    await this.changedProject(projectId, access, stamp);
    return { ok: true, value: null };
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
    if (spaceId === ALL_WORK_PACKAGES) return { ok: false, refusal: 'virtual_space' };
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    // Proof, observed 2026-09-29: with `workPackageId` left out of this gate,
    // `refuses to move it, or to move another after it` in
    // `space.resource.test.ts` received `{ ok: true, value: 5 }`; with
    // `afterWorkPackageId` left out, the second move received `{ ok: true, value: 30 }`.
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
    if (
      !written.ok &&
      (written.reason === 'already_in_space' || written.reason === 'project_in_other_space')
    ) {
      throw new Error(`space ${spaceId} answered already_in_space to a move`);
    }
    return written.ok ? { ok: true, value: written.position } : { ok: false, refusal: 'not_found' };
  }

  /** Changes only a person/team link and the space revision under current manage-spaces authority. */
  async changeMembership(
    actorId: string,
    access: ResourceAccess,
    spaceId: string,
    memberId: string,
    operation: 'addPerson' | 'removePerson' | 'addTeam' | 'removeTeam',
  ): Promise<
    SpaceAnswer<null, 'organization_required' | 'forbidden' | 'not_found' | 'virtual_space'>
  > {
    // Proof: omitting this guard returned HTTP404 for a virtual membership write, instead of409 (space-membership-fault-virtual-membership-v3).
    if (spaceId === ALL_WORK_PACKAGES) return { ok: false, refusal: 'virtual_space' };
    // Proof: replacing writableOwner by ownerOf admitted a viewer's actual membership write (space-membership-fault-membership-authority-v3).
    const owner = await this.writableOwner(access);
    if (!owner.ok) return owner;
    const isWritten = await this.opts.spaces[operation](
      owner.organizationId,
      spaceId,
      memberId,
      this.opts.clock.stampFor(actorId),
    );
    return isWritten ? { ok: true, value: null } : { ok: false, refusal: 'not_found' };
  }

  /**
   * Whether the caller can open every named work package through the work package
   * routes' own read (`null` names none). A membership write addressing a
   * work package the caller cannot open, as the member or as the anchor, answers
   * that route's 404 exactly as if it were no member: the leak rule for
   * writes, so a hidden member is neither movable, removable nor probeable.
   */
  private async canOpenAll(
    access: ResourceAccess,
    ...projectIds: readonly (string | null)[]
  ): Promise<boolean> {
    for (const projectId of projectIds) {
      if (projectId === null) continue;
      const target = await this.opts.settings.readTarget(
        { level: 'project', id: projectId },
        access.kind === 'legacy' ? null : access.scope.organizationId,
      );
      if (target === null) return false;
      if (
        access.kind === 'scoped' &&
        !(await authorize(this.opts.accessDecisions, access.principal, target, 'project.read')).ok
      )
        return false;
    }
    return true;
  }

  private async changedProject(
    projectId: string,
    access: ResourceAccess,
    stamp: WriteStamp,
  ): Promise<void> {
    const target = await this.opts.settings.readTarget(
      { level: 'project', id: projectId },
      access.kind === 'legacy' ? null : access.scope.organizationId,
    );
    if (target === null) throw new Error('space write lost its admitted project');
    for (const changed of await this.opts.settings.touchPackages(target, stamp))
      await this.opts.announcements.publish(changed.workPackageId, changed.event);
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
   * deployment-wide write authority, as it does for work packages.
   *
   * Proof, observed 2026-09-29: with this role check skipped,
   * `refuses a viewer every space write and lets the viewer read` in
   * `space-organization.controller.db.test.ts` received 201 instead of 403 for
   * the viewer's create, and `refuses a viewer every write` in
   * `space.resource.test.ts` received the writes' answers instead of `forbidden`.
   */
  private async writableOwner(
    access: ResourceAccess,
  ): Promise<Owner | { ok: false; refusal: 'forbidden'; readonly permission?: Permission }> {
    if (!(await this.mayWrite(access)))
      return { ok: false, refusal: 'forbidden', permission: 'organization.manage_spaces' };
    return this.ownerOf(access);
  }

  /**
   * Whether current grants permit organization.manage_spaces. Reads expose
   * this as writable; every scoped write rechecks through its borrowed port.
   * Legacy access retains deployment-wide behavior.
   */
  async mayWrite(access: ResourceAccess): Promise<boolean> {
    if (access.kind === 'legacy') return true;
    // Proof: space-grant fault failed 'missing permission on the direct space creation route' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    return (
      await authorize(
        this.opts.accessDecisions,
        access.principal,
        { kind: 'organization', organizationId: access.scope.organizationId },
        'organization.manage_spaces',
      )
    ).ok;
  }

  private async readableProjects(
    actorId: string,
    access: ResourceAccess,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const workPackage of await this.opts.workPackages.listWithin(actorId, access))
      counts.set(workPackage.projectId, (counts.get(workPackage.projectId) ?? 0) + 1);
    return counts;
  }
}

/** The trimmed name, or null when blank or longer than {@link SPACE_NAME_MAX} code points. */
function spaceNameOf(name: string): string | null {
  const trimmed = name.trim();
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are the unit the spec counts in
  const length = [...trimmed].length;
  return length === 0 || length > SPACE_NAME_MAX ? null : trimmed;
}

function summaryOf(space: Space, workPackageCount: number): SpaceSummary {
  return {
    id: space.id,
    name: space.name,
    virtual: false,
    workPackageCount,
    revision: space.revision,
    createdById: space.createdBy,
    createdAt: space.createdAt,
  };
}
