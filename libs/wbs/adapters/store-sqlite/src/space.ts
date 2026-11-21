import type {
  MembershipWritten,
  Space,
  SpaceContents,
  SpaceMember,
  SpaceStore,
  SpaceWritten,
  WriteStamp,
} from '@wbs/core';
import { placeAfter } from '@wbs/domain';
import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import {
  organization,
  personOrganization,
  project,
  serviceTeamOrganization,
  space,
  spacePerson,
  spaceTeam,
} from './schema';
import { readSettingTargetIn } from './settings';

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
    .select({ projectId: project.id, position: sql<unknown>`${project.spacePosition}` })
    .from(project)
    .where(eq(project.spaceId, spaceId))
    .orderBy(asc(project.spacePosition), asc(project.id))
    .all()
    .map(({ projectId, position }) => {
      if (typeof position !== 'number' || !Number.isSafeInteger(position))
        throw new Error('stored project space position is malformed');
      return { projectId, position };
    });
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

/** Advances one surviving space inside its owning transaction; throws if native storage skips the update. */
export function bumpSpaceRevision(tx: Transaction, spaceId: string, at: number): void {
  const updated = tx
    .update(space)
    .set({ revision: sql`${space.revision} + 1`, ...auditOnUpdate({ at }) })
    .where(eq(space.id, spaceId))
    .run().changes;
  // Proof: RAISE(IGNORE) on the actual space revision update returned HTTP204 and retained the link without this check (space-membership-http-implemented-v1).
  // Proof: omitting this check let both actual directory removals commit after RAISE(IGNORE), instead of rolling back (space-directory-fault-native-revision-v1).
  if (updated !== 1) throw new Error('space revision update did not affect exactly one row');
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
    tx.update(project)
      .set({ spacePosition: sibling.position, ...auditOnUpdate({ at }) })
      .where(and(eq(project.spaceId, spaceId), eq(project.id, sibling.id)))
      .run();
  }
  return placement.position;
}

/**
 * {@link SpaceStore} over actual project.space_id (ADR0063).
 * Historical package-membership proof paragraphs retain their original observations.
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

  readContents(organizationId: string, spaceId: string): Promise<SpaceContents | null> {
    return Promise.resolve(
      this.db.transaction((tx) => {
        const found = findSpace(tx, organizationId, spaceId);
        if (found === null) return null;
        return {
          space: found,
          projects: membersOf(tx, spaceId),
          personIds: tx
            .select({ id: spacePerson.personId })
            .from(spacePerson)
            .where(
              and(eq(spacePerson.spaceId, spaceId), eq(spacePerson.organizationId, organizationId)),
            )
            .orderBy(asc(spacePerson.personId))
            .all()
            .map(({ id }) => id),
          serviceTeamIds: tx
            .select({ id: spaceTeam.serviceTeamId })
            .from(spaceTeam)
            .where(
              and(eq(spaceTeam.spaceId, spaceId), eq(spaceTeam.organizationId, organizationId)),
            )
            .orderBy(asc(spaceTeam.serviceTeamId))
            .all()
            .map(({ id }) => id),
        };
      }),
    );
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
        spaceId: project.spaceId,
        projectId: project.id,
        position: sql<unknown>`${project.spacePosition}`,
      })
      .from(project)
      .where(and(eq(project.organizationId, organizationId), isNotNull(project.spaceId)))
      .orderBy(asc(project.spaceId), asc(project.spacePosition), asc(project.id))
      .all();
    const members = new Map<string, SpaceMember[]>();
    for (const { spaceId, projectId, position } of rows) {
      if (spaceId === null || typeof position !== 'number' || !Number.isSafeInteger(position))
        throw new Error('stored project space membership is malformed');
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
        bumpSpaceRevision(tx, spaceId, stamp.at);
        const renamed = findSpace(tx, organizationId, spaceId);
        if (renamed === null) throw new Error(`space ${spaceId} vanished inside its own rename`);
        return { ok: true, space: renamed };
      }, IMMEDIATE),
    );
  }

  remove(organizationId: string, spaceId: string, stamp: WriteStamp): Promise<boolean> {
    return this.write(() =>
      this.db.transaction((tx) => {
        if (findSpace(tx, organizationId, spaceId) === null) return false;
        tx.update(project)
          .set({
            spaceId: null,
            spacePosition: null,
            revision: sql`${project.revision} + 1`,
            ...auditOnUpdate(stamp),
          })
          .where(and(eq(project.organizationId, organizationId), eq(project.spaceId, spaceId)))
          .run();
        return tx.delete(space).where(inOrganization(organizationId, spaceId)).run().changes > 0;
      }, IMMEDIATE),
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
        if (findSpace(tx, organizationId, spaceId) === null)
          return { ok: false, reason: 'not_found' };
        const owned = readSettingTargetIn(tx, { level: 'project', id: projectId }, organizationId);
        // Historical package-membership guard proof retained; current target is the actual project.
        // Proof, observed 2026-09-29: with this read skipped, `refuses a workPackage
        // another organization owns, storing nothing` failed on a thrown
        // `FOREIGN KEY constraint failed` instead of the typed `not_found`.
        if (owned === null) return { ok: false, reason: 'not_found' };
        if (owned.chain.spaceId === spaceId) return { ok: false, reason: 'already_in_space' };
        if (owned.chain.spaceId !== null)
          return { ok: false, reason: 'project_in_other_space', spaceId: owned.chain.spaceId };
        const position = place(tx, spaceId, membersOf(tx, spaceId), afterProjectId, stamp.at);
        if (position === null) return { ok: false, reason: 'not_found' };
        tx.update(project)
          .set({
            spaceId,
            spacePosition: position,
            revision: sql`${project.revision} + 1`,
            ...auditOnUpdate(stamp),
          })
          .where(and(eq(project.id, projectId), eq(project.organizationId, organizationId)))
          .run();
        bumpSpaceRevision(tx, spaceId, stamp.at);
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
        const changed = tx
          .update(project)
          .set({
            spaceId: null,
            spacePosition: null,
            revision: sql`${project.revision} + 1`,
            ...auditOnUpdate(stamp),
          })
          .where(
            and(
              eq(project.id, projectId),
              eq(project.organizationId, organizationId),
              eq(project.spaceId, spaceId),
            ),
          )
          .run().changes;
        if (changed === 0) return false;
        bumpSpaceRevision(tx, spaceId, stamp.at);
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
        tx.update(project)
          .set({ spacePosition: position, ...auditOnUpdate(stamp) })
          .where(and(eq(project.spaceId, spaceId), eq(project.id, projectId)))
          .run();
        bumpSpaceRevision(tx, spaceId, stamp.at);
        return { ok: true, position };
      }, IMMEDIATE),
    );
  }

  /** Runs one synchronous write transaction in this process's write turn. */

  peopleOf(organizationId: string, spaceId: string): Promise<readonly string[] | null> {
    if (findSpace(this.db, organizationId, spaceId) === null) return Promise.resolve(null);
    return Promise.resolve(
      this.db
        .select({ id: spacePerson.personId })
        .from(spacePerson)
        .where(
          and(eq(spacePerson.spaceId, spaceId), eq(spacePerson.organizationId, organizationId)),
        )
        .orderBy(asc(spacePerson.personId))
        .all()
        .map(({ id }) => id),
    );
  }
  teamsOf(organizationId: string, spaceId: string): Promise<readonly string[] | null> {
    if (findSpace(this.db, organizationId, spaceId) === null) return Promise.resolve(null);
    return Promise.resolve(
      this.db
        .select({ id: spaceTeam.serviceTeamId })
        .from(spaceTeam)
        .where(and(eq(spaceTeam.spaceId, spaceId), eq(spaceTeam.organizationId, organizationId)))
        .orderBy(asc(spaceTeam.serviceTeamId))
        .all()
        .map(({ id }) => id),
    );
  }
  addPerson(
    organizationId: string,
    spaceId: string,
    personId: string,
    stamp: WriteStamp,
  ): Promise<boolean> {
    return this.write(() =>
      this.db.transaction((tx) => {
        if (findSpace(tx, organizationId, spaceId) === null) return false;
        const person = tx
          .select({ id: personOrganization.resourceId })
          .from(personOrganization)
          .where(
            and(
              eq(personOrganization.resourceId, personId),
              eq(personOrganization.organizationId, organizationId),
            ),
          )
          .get();
        if (person === undefined) return false;
        const existing = tx
          .select({ id: spacePerson.personId })
          .from(spacePerson)
          .where(and(eq(spacePerson.spaceId, spaceId), eq(spacePerson.personId, personId)))
          .get();
        if (existing !== undefined) return true;
        tx.insert(spacePerson)
          .values({ spaceId, personId, organizationId, ...auditOnCreate(stamp) })
          .run();
        bumpSpaceRevision(tx, spaceId, stamp.at);
        return true;
      }, IMMEDIATE),
    );
  }
  removePerson(
    organizationId: string,
    spaceId: string,
    personId: string,
    stamp: WriteStamp,
  ): Promise<boolean> {
    return this.write(() =>
      this.db.transaction((tx) => {
        if (findSpace(tx, organizationId, spaceId) === null) return false;
        const changed =
          tx
            .delete(spacePerson)
            .where(
              and(
                eq(spacePerson.organizationId, organizationId),
                eq(spacePerson.spaceId, spaceId),
                eq(spacePerson.personId, personId),
              ),
            )
            .run().changes > 0;
        if (changed) bumpSpaceRevision(tx, spaceId, stamp.at);
        return changed;
      }, IMMEDIATE),
    );
  }
  addTeam(
    organizationId: string,
    spaceId: string,
    serviceTeamId: string,
    stamp: WriteStamp,
  ): Promise<boolean> {
    return this.write(() =>
      this.db.transaction((tx) => {
        if (findSpace(tx, organizationId, spaceId) === null) return false;
        const team = tx
          .select({ id: serviceTeamOrganization.resourceId })
          .from(serviceTeamOrganization)
          .where(
            and(
              eq(serviceTeamOrganization.resourceId, serviceTeamId),
              eq(serviceTeamOrganization.organizationId, organizationId),
            ),
          )
          .get();
        if (team === undefined) return false;
        const existing = tx
          .select({ id: spaceTeam.serviceTeamId })
          .from(spaceTeam)
          .where(and(eq(spaceTeam.spaceId, spaceId), eq(spaceTeam.serviceTeamId, serviceTeamId)))
          .get();
        if (existing !== undefined) return true;
        tx.insert(spaceTeam)
          .values({ spaceId, serviceTeamId, organizationId, ...auditOnCreate(stamp) })
          .run();
        bumpSpaceRevision(tx, spaceId, stamp.at);
        return true;
      }, IMMEDIATE),
    );
  }
  removeTeam(
    organizationId: string,
    spaceId: string,
    serviceTeamId: string,
    stamp: WriteStamp,
  ): Promise<boolean> {
    return this.write(() =>
      this.db.transaction((tx) => {
        if (findSpace(tx, organizationId, spaceId) === null) return false;
        const changed =
          tx
            .delete(spaceTeam)
            .where(
              and(
                eq(spaceTeam.organizationId, organizationId),
                eq(spaceTeam.spaceId, spaceId),
                eq(spaceTeam.serviceTeamId, serviceTeamId),
              ),
            )
            .run().changes > 0;
        if (changed) bumpSpaceRevision(tx, spaceId, stamp.at);
        return changed;
      }, IMMEDIATE),
    );
  }
  private write<T>(transaction: () => T): Promise<T> {
    return this.gate.enter(() => Promise.resolve(transaction()));
  }
}
