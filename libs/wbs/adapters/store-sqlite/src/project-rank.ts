import type {
  ProjectRankStore,
  RankedProject,
  RankMoved,
  SharedPeopleStore,
  WriteStamp,
} from '@wbs/core';
import { type CapacityMode, POSITION_STEP } from '@wbs/domain';
import { and, asc, eq } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import {
  organization,
  project,
  projectOrganization,
  projectRank,
  sharedPeopleAudit,
} from './schema';
import { readCapacityMode } from './shared-people-mode';

type Reader = Pick<Drizzle, 'select'>;

interface Held {
  projectId: string;
  position: number | null;
}

/**
 * The organization's projects in rank order, with each one's stored position.
 *
 * Read in creation order, which is the unranked tail's own order, and sorted
 * here: ranked before unranked, ranked by position, **ties by project id**.
 *
 * Proof, observed 2026-09-29: the id comparison removed made `orders equal
 * positions by project id on every read` in `project-rank.db.test.ts` answer
 * `a3, a1` — the creation order — instead of `a1, a3`.
 */
function heldIn(db: Reader, organizationId: string): Held[] {
  const rows = db
    .select({ projectId: projectOrganization.resourceId, position: projectRank.position })
    .from(projectOrganization)
    .innerJoin(project, eq(project.id, projectOrganization.resourceId))
    .leftJoin(projectRank, eq(projectRank.projectId, projectOrganization.resourceId))
    .where(eq(projectOrganization.organizationId, organizationId))
    .orderBy(asc(project.createdAt), asc(projectOrganization.resourceId))
    .all();
  const ranked = rows
    .filter((row): row is { projectId: string; position: number } => row.position !== null)
    .sort(
      (a, b) =>
        a.position - b.position ||
        (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0),
    );
  return [...ranked, ...rows.filter((row) => row.position === null)];
}

const ranksOf = (held: readonly Held[]): RankedProject[] =>
  held.map(({ projectId, position }, index) => ({
    projectId,
    rank: index + 1,
    ranked: position !== null,
  }));

/**
 * {@link ProjectRankStore} over SQLite (`share-people-across-projects`, slice 3).
 *
 * A move runs in an immediate transaction and decides from reads made inside
 * it. It writes the whole order it leaves, `POSITION_STEP` apart, so every
 * project of the organization is ranked after the first move and a later move
 * never needs to respace. The composite reference is the second line: a rank
 * across organizations cannot be stored even if a read here were wrong.
 */
export class ProjectRankRepository implements ProjectRankStore, SharedPeopleStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  orderIn(organizationId: string): Promise<RankedProject[]> {
    return Promise.resolve(ranksOf(heldIn(this.db, organizationId)));
  }

  moveAfter(
    organizationId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<RankMoved> {
    return this.gate.enter(() =>
      Promise.resolve(
        this.db.transaction(
          (tx): RankMoved => {
            const held = heldIn(tx, organizationId);
            const moving = held.find((each) => each.projectId === projectId);
            if (moving === undefined) return { ok: false, reason: 'not_found' };
            // A project placed after itself stays where it is: a no-op that
            // answers the current order, writing nothing.
            if (afterProjectId === projectId) return { ok: true, order: ranksOf(held) };
            const rest = held.filter((each) => each.projectId !== projectId);
            const after =
              afterProjectId === null
                ? -1
                : rest.findIndex((each) => each.projectId === afterProjectId);
            if (after === -1 && afterProjectId !== null) return { ok: false, reason: 'not_found' };
            const order = [...rest.slice(0, after + 1), moving, ...rest.slice(after + 1)];
            order.forEach((each, index) => {
              const position = (index + 1) * POSITION_STEP;
              if (each.position === position) return;
              if (each.position === null) {
                tx.insert(projectRank)
                  .values({
                    projectId: each.projectId,
                    organizationId,
                    position,
                    ...auditOnCreate(stamp),
                  })
                  .run();
              } else {
                tx.update(projectRank)
                  .set({ position, ...auditOnUpdate(stamp) })
                  .where(
                    and(
                      eq(projectRank.projectId, each.projectId),
                      eq(projectRank.organizationId, organizationId),
                    ),
                  )
                  .run();
              }
            });
            return { ok: true, order: ranksOf(heldIn(tx, organizationId)) };
          },
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  capacityModeIn(organizationId: string): Promise<CapacityMode> {
    // In the executor, so a missing organization rejects rather than throws.
    return new Promise((resolve) => {
      resolve(readCapacityMode(this.db, organizationId));
    });
  }

  /**
   * The mode and its audit row in one immediate transaction, decided from a
   * read inside it: two super-admins switching at once record one switch.
   *
   * Proof: the audit insert removed made `records each switch, and nothing for
   * the mode it already has` (`shared-people-audit.db.test.ts`) find no
   * record; watched 2026-10-11.
   */
  setCapacityMode(
    organizationId: string,
    mode: CapacityMode,
    stamp: WriteStamp,
    auditId: string,
  ): Promise<{ changed: boolean }> {
    return this.gate.enter(() =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            if (readCapacityMode(tx, organizationId) === mode) return { changed: false };
            const encoded = mode === 'shared' ? 1 : 0;
            tx.update(organization)
              .set({ sharedPeople: encoded, ...auditOnUpdate(stamp) })
              .where(eq(organization.id, organizationId))
              .run();
            tx.insert(sharedPeopleAudit)
              .values({
                id: auditId,
                organizationId,
                actorId: stamp.by,
                sharedPeople: encoded,
                createdAt: stamp.at,
              })
              .run();
            return { changed: true };
          },
          { behavior: 'immediate' },
        ),
      ),
    );
  }
}
