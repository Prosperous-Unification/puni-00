import type {
  MembershipWritten,
  Space,
  SpaceMember,
  SpaceStore,
  SpaceWritten,
  WriteStamp,
} from '@wbs/core';
import { placeAfter } from '@wbs/domain';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { organization, projectOrganization, space, spaceProject } from './schema';

type Transaction = Parameters<Parameters<Drizzle['transaction']>[0]>[0];
type Reader = Pick<Drizzle, 'select'>;

const IMMEDIATE = { behavior: 'immediate' } as const;

const SPACE_COLUMNS = {
  id: space.id,
  organizationId: space.organizationId,
  name: space.name,
  revision: space.revision,
  createdBy: space.createdBy,
  createdAt: space.createdAt,
} as const;

/**
 * Proof, observed 2026-09-29: with the organization condition dropped,
 * `answers another organization's space as absent to every route` in
 * `space-organization.controller.db.test.ts` received 200 instead of 404.
 */
const inOrganization = (organizationId: string, spaceId: string) =>
  and(eq(space.id, spaceId), eq(space.organizationId, organizationId));

function findSpace(db: Reader, organizationId: string, spaceId: string): Space | null {
  return (
    db.select(SPACE_COLUMNS).from(space).where(inOrganization(organizationId, spaceId)).get() ??
    null
  );
}

function membersOf(db: Reader, spaceId: string): SpaceMember[] {
  return db
    .select({ projectId: spaceProject.projectId, position: spaceProject.position })
    .from(spaceProject)
    .where(eq(spaceProject.spaceId, spaceId))
    .orderBy(asc(spaceProject.position), asc(spaceProject.projectId))
    .all();
}

function nameTaken(tx: Transaction, organizationId: string, name: string, except?: string) {
  const clash = tx
    .select({ id: space.id })
    .from(space)
    .where(
      and(
        eq(space.organizationId, organizationId),
        eq(space.name, name),
        except === undefined ? undefined : ne(space.id, except),
      ),
    )
    .get();
  return clash !== undefined;
}

function bumpRevision(tx: Transaction, spaceId: string, at: number): void {
  tx.update(space)
    .set({ revision: sql`${space.revision} + 1`, ...auditOnUpdate({ at }) })
    .where(eq(space.id, spaceId))
    .run();
}

/**
 * Places `projectId` after `afterProjectId` among `group` (which excludes it),
 * writing any respaced sibling, and answers its new position; null when
 * `afterProjectId` is not in the group. `placeAfter` throws on a stranger, so
 * the membership check comes first.
 */
function place(
  tx: Transaction,
  spaceId: string,
  group: readonly SpaceMember[],
  afterProjectId: string | null,
  at: number,
): number | null {
  if (afterProjectId !== null && !group.some(({ projectId }) => projectId === afterProjectId)) {
    return null;
  }
  const placement = placeAfter(
    group.map(({ projectId, position }) => ({ id: projectId, position })),
    afterProjectId,
  );
  for (const sibling of placement.renumbered) {
    tx.update(spaceProject)
      .set({ position: sibling.position, ...auditOnUpdate({ at }) })
      .where(and(eq(spaceProject.spaceId, spaceId), eq(spaceProject.projectId, sibling.id)))
      .run();
  }
  return placement.position;
}

/**
 * {@link SpaceStore} over SQLite (`add-spaces`, design D2).
 *
 * Every write runs in an immediate transaction and decides from reads made
 * inside it, so a name or membership raced by another process is answered as
 * a typed refusal rather than a constraint error. The composite references
 * are the second line: a membership across organizations cannot be stored
 * even if a read here were wrong.
 */
export class SpaceRepository implements SpaceStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  legacyOrganizationId(): Promise<string | null> {
    return Promise.resolve(
      this.db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.legacy, true))
        .get()?.id ?? null,
    );
  }

  listIn(organizationId: string): Promise<Space[]> {
    return Promise.resolve(
      this.db
        .select(SPACE_COLUMNS)
        .from(space)
        .where(eq(space.organizationId, organizationId))
        .orderBy(asc(space.name), asc(space.id))
        .all(),
    );
  }

  findIn(organizationId: string, spaceId: string): Promise<Space | null> {
    return Promise.resolve(findSpace(this.db, organizationId, spaceId));
  }

  membersOf(organizationId: string, spaceId: string): Promise<SpaceMember[] | null> {
    return Promise.resolve(
      this.db.transaction((tx) =>
        findSpace(tx, organizationId, spaceId) === null ? null : membersOf(tx, spaceId),
      ),
    );
  }

  membersIn(organizationId: string): Promise<Map<string, SpaceMember[]>> {
    const rows = this.db
      .select({
        spaceId: spaceProject.spaceId,
        projectId: spaceProject.projectId,
        position: spaceProject.position,
      })
      .from(spaceProject)
      .where(eq(spaceProject.organizationId, organizationId))
      .orderBy(asc(spaceProject.spaceId), asc(spaceProject.position), asc(spaceProject.projectId))
      .all();
    const members = new Map<string, SpaceMember[]>();
    for (const { spaceId, projectId, position } of rows) {
      const group = members.get(spaceId) ?? [];
      group.push({ projectId, position });
      members.set(spaceId, group);
    }
    return Promise.resolve(members);
  }

  create(
    fresh: Pick<Space, 'id' | 'organizationId' | 'name'>,
    stamp: WriteStamp,
  ): Promise<SpaceWritten> {
    return this.write(() =>
      this.db.transaction((tx): SpaceWritten => {
        if (nameTaken(tx, fresh.organizationId, fresh.name)) {
          return { ok: false, reason: 'name_taken' };
        }
        tx.insert(space)
          .values({ ...fresh, revision: 0, ...auditOnCreate(stamp) })
          .run();
        return {
          ok: true,
          space: { ...fresh, revision: 0, createdBy: stamp.by, createdAt: stamp.at },
        };
      }, IMMEDIATE),
    );
  }

  rename(
    organizationId: string,
    spaceId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<SpaceWritten> {
    return this.write(() =>
      this.db.transaction((tx): SpaceWritten => {
        if (findSpace(tx, organizationId, spaceId) === null) {
          return { ok: false, reason: 'not_found' };
        }
        if (nameTaken(tx, organizationId, name, spaceId))
          return { ok: false, reason: 'name_taken' };
        tx.update(space)
          .set({ name, ...auditOnUpdate(stamp) })
          .where(eq(space.id, spaceId))
          .run();
        bumpRevision(tx, spaceId, stamp.at);
        const renamed = findSpace(tx, organizationId, spaceId);
        if (renamed === null) throw new Error(`space ${spaceId} vanished inside its own rename`);
        return { ok: true, space: renamed };
      }, IMMEDIATE),
    );
  }

  remove(organizationId: string, spaceId: string): Promise<boolean> {
    return this.write(() =>
      this.db.transaction(
        (tx) => tx.delete(space).where(inOrganization(organizationId, spaceId)).run().changes > 0,
        IMMEDIATE,
      ),
    );
  }

  addProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<MembershipWritten> {
    return this.write(() =>
      this.db.transaction((tx): MembershipWritten => {
        if (findSpace(tx, organizationId, spaceId) === null) {
          return { ok: false, reason: 'not_found' };
        }
        const owned = tx
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(
            and(
              eq(projectOrganization.resourceId, projectId),
              eq(projectOrganization.organizationId, organizationId),
            ),
          )
          .get();
        // Proof, observed 2026-09-29: with this read skipped, `refuses a project
        // another organization owns, storing nothing` failed on a thrown
        // `FOREIGN KEY constraint failed` instead of the typed `not_found`.
        if (owned === undefined) return { ok: false, reason: 'not_found' };
        const group = membersOf(tx, spaceId);
        if (group.some((each) => each.projectId === projectId)) {
          return { ok: false, reason: 'already_in_space' };
        }
        const position = place(tx, spaceId, group, afterProjectId, stamp.at);
        if (position === null) return { ok: false, reason: 'not_found' };
        tx.insert(spaceProject)
          .values({
            spaceId,
            projectId,
            organizationId,
            position,
            ...auditOnCreate(stamp),
          })
          .run();
        bumpRevision(tx, spaceId, stamp.at);
        return { ok: true, position };
      }, IMMEDIATE),
    );
  }

  removeProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    stamp: WriteStamp,
  ): Promise<boolean> {
    return this.write(() =>
      this.db.transaction((tx) => {
        if (findSpace(tx, organizationId, spaceId) === null) return false;
        const removed = tx
          .delete(spaceProject)
          .where(and(eq(spaceProject.spaceId, spaceId), eq(spaceProject.projectId, projectId)))
          .run().changes;
        if (removed === 0) return false;
        bumpRevision(tx, spaceId, stamp.at);
        return true;
      }, IMMEDIATE),
    );
  }

  moveProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<MembershipWritten> {
    return this.write(() =>
      this.db.transaction((tx): MembershipWritten => {
        if (findSpace(tx, organizationId, spaceId) === null) {
          return { ok: false, reason: 'not_found' };
        }
        const members = membersOf(tx, spaceId);
        if (!members.some((each) => each.projectId === projectId)) {
          return { ok: false, reason: 'not_found' };
        }
        const group = members.filter((each) => each.projectId !== projectId);
        const position = place(tx, spaceId, group, afterProjectId, stamp.at);
        if (position === null) return { ok: false, reason: 'not_found' };
        tx.update(spaceProject)
          .set({ position, ...auditOnUpdate(stamp) })
          .where(and(eq(spaceProject.spaceId, spaceId), eq(spaceProject.projectId, projectId)))
          .run();
        bumpRevision(tx, spaceId, stamp.at);
        return { ok: true, position };
      }, IMMEDIATE),
    );
  }

  /** Runs one synchronous write transaction in this process's write turn. */
  private write<T>(transaction: () => T): Promise<T> {
    return this.gate.enter(() => Promise.resolve(transaction()));
  }
}
