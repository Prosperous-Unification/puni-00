import type {
  ChainAccess,
  ConnectedPlanCapture,
  StoredTypedDependency,
  WorkPackage,
} from '@wbs/core';
import { captureLocalTypedDependency } from '@wbs/core';
import { eq, inArray, or } from 'drizzle-orm';

import type { CaptureReadSeam } from './capture-read-seam';
import type { Drizzle } from './db';
import { OPEN } from './gate';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { readConnectedPlanInputIn } from './saved-plan-capture';
import { assignment, externalDependency, workItem, workPackageOrganization } from './schema';
import { readCapacityMode } from './shared-people-mode';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkPackageRepository } from './work-package';
import { WorkPackageRankRepository } from './work-package-rank';

/** Discovers the undirected external/person component without materializing local links. */
export function discoverConnectedTopologyIn(
  db: Drizzle,
  workPackageId: string,
  mode: 'isolated' | 'shared',
  lifetime: ReadSnapshotLifetime,
): { workPackages: ReadonlySet<string>; hasExternal: boolean } {
  const pending = new Set([workPackageId]);
  if (mode === 'isolated') {
    lifetime.assertOpen();
    const edge = db
      .select({ id: externalDependency.id })
      .from(externalDependency)
      .where(
        or(
          eq(externalDependency.predecessorWorkPackageId, workPackageId),
          eq(externalDependency.successorWorkPackageId, workPackageId),
        ),
      )
      .limit(1)
      .get();
    if (edge === undefined) return { workPackages: pending, hasExternal: false };
  }
  let hasExternal = false;
  for (const id of pending) {
    lifetime.assertOpen();
    const edges = db
      .select({
        predecessor: externalDependency.predecessorWorkPackageId,
        successor: externalDependency.successorWorkPackageId,
      })
      .from(externalDependency)
      .where(
        or(
          eq(externalDependency.predecessorWorkPackageId, id),
          eq(externalDependency.successorWorkPackageId, id),
        ),
      )
      .all();
    if (edges.length > 0) hasExternal = true;
    for (const edge of edges) {
      // Proof: deleting predecessor traversal made the mounted bidirectional
      // capture fail with `connected topology omitted an external endpoint`.
      pending.add(edge.predecessor);
      pending.add(edge.successor);
    }
    if (mode !== 'shared') continue;
    const people = db
      .select({ personId: assignment.personId })
      .from(assignment)
      .innerJoin(workItem, eq(workItem.id, assignment.workItemId))
      .where(eq(workItem.workPackageId, id))
      .all();
    if (people.length > 0) {
      const neighbors = db
        .select({ workPackageId: workItem.workPackageId })
        .from(assignment)
        .innerJoin(workItem, eq(workItem.id, assignment.workItemId))
        .where(
          inArray(
            assignment.personId,
            people.map(({ personId }) => personId),
          ),
        )
        .all();
      // Proof: omitting person traversal made the mounted a3 peer return shared despite a2→a1.
      for (const neighbor of neighbors) pending.add(neighbor.workPackageId);
    }
  }
  lifetime.assertOpen();
  return { workPackages: pending, hasExternal };
}

/** Borrows an admitted snapshot; topology and full reads never own transaction lifecycle. */
export async function captureConnectedPlanIn(
  db: Drizzle,
  access: ChainAccess,
  workPackageId: string,
  lifetime: ReadSnapshotLifetime,
  captureRead?: CaptureReadSeam,
): Promise<ConnectedPlanCapture> {
  const { organizationId, mode } = readConnectedOwnershipIn(db, access, workPackageId, lifetime);
  const topology = discoverConnectedTopologyIn(db, workPackageId, mode, lifetime);
  return await captureSelectedConnectedIn(
    db,
    organizationId,
    mode,
    topology.workPackages,
    lifetime,
    captureRead,
  );
}

/** Captures the exact admitted component without rediscovering a wider person universe. */
export async function captureConnectedComponentIn(
  db: Drizzle,
  access: ChainAccess,
  workPackageId: string,
  selected: ReadonlySet<string>,
  lifetime: ReadSnapshotLifetime,
  captureRead?: CaptureReadSeam,
): Promise<ConnectedPlanCapture> {
  const { organizationId, mode } = readConnectedOwnershipIn(db, access, workPackageId, lifetime);
  return await captureSelectedConnectedIn(
    db,
    organizationId,
    mode,
    selected,
    lifetime,
    captureRead,
  );
}

function readConnectedOwnershipIn(
  db: Drizzle,
  access: ChainAccess,
  workPackageId: string,
  lifetime: ReadSnapshotLifetime,
) {
  lifetime.assertOpen();
  const owner = db
    .select()
    .from(workPackageOrganization)
    .where(eq(workPackageOrganization.resourceId, workPackageId))
    .get();
  // Proof: bypassed scoped owner comparison admitted b1 in `requires existing admitted organization authority`.
  if (
    owner === undefined ||
    (access.kind === 'scoped' && owner.organizationId !== access.scope.organizationId)
  )
    throw new Error('connected capture requires readable organization ownership');
  const organizationId = owner.organizationId;
  const mode = readCapacityMode(db, organizationId);
  return { organizationId, mode };
}

async function captureSelectedConnectedIn(
  db: Drizzle,
  organizationId: string,
  mode: 'isolated' | 'shared',
  selected: ReadonlySet<string>,
  lifetime: ReadSnapshotLifetime,
  captureRead?: CaptureReadSeam,
): Promise<ConnectedPlanCapture> {
  const admitted = { kind: 'scoped', scope: { organizationId } } as const;
  const workPackages = new WorkPackageRepository(db, OPEN);
  const relationships = new Map<string, StoredTypedDependency>();
  const admittedWorkPackages = new Map<string, WorkPackage>();
  for (const id of selected) {
    lifetime.assertOpen();
    if (admittedWorkPackages.has(id)) continue;
    const workPackage = await workPackages.findInOrganization(id, organizationId);
    // Required discovered work packages must remain readable; endpoint ownership is validated by listIncident.
    lifetime.assertOpen();
    if (workPackage === null) throw new Error('connected capture names an unreadable work package');
    admittedWorkPackages.set(id, workPackage);
    for (const relationship of await new TypedDependencyRepository(db, OPEN).listIncident([id])) {
      lifetime.assertOpen();
      const prior = relationships.get(relationship.id);
      // Proof: bypassed comparison accepted a changed SS identity in `refuses inconsistent identity evidence`.
      if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(relationship))
        throw new Error('connected relationship identity disagrees');
      relationships.set(relationship.id, relationship);
      // Proof: deleting predecessor traversal made the mounted bidirectional
      // capture throw here instead of silently omitting a2.
      if (
        !selected.has(relationship.predecessor.workPackageId) ||
        !selected.has(relationship.successor.workPackageId)
      )
        throw new Error('connected topology omitted an external endpoint');
    }
  }
  lifetime.assertOpen();
  const ranks = await new WorkPackageRankRepository(db, OPEN).orderIn(organizationId);
  lifetime.assertOpen();
  const captured: ConnectedPlanCapture['workPackages'][number][] = [];
  for (const [id, workPackage] of admittedWorkPackages) {
    lifetime.assertOpen();
    const rank = ranks.find(({ workPackageId }) => workPackageId === id)?.rank;
    // Proof: omitted guard returned undefined priority in `refuses missing component rank`.
    if (rank === undefined) throw new Error('connected work package rank is absent');
    const reads = await readConnectedPlanInputIn(db, id, admitted, lifetime, captureRead);
    lifetime.assertOpen();
    // Proof: omitted guard changed `refuses a workPackage lost by the full-input reader` to an incidental null dereference.
    if (reads === null) throw new Error('connected work package disappeared inside snapshot');
    const local = [...relationships.values()]
      .filter(
        (relationship) =>
          relationship.predecessor.workPackageId === id &&
          relationship.successor.workPackageId === id,
      )
      .map(captureLocalTypedDependency);
    // Proof: omitted agreement check accepted a missing local row in `refuses inconsistent local-projection evidence`.
    if (JSON.stringify(local) !== JSON.stringify(reads.typedDependencies))
      throw new Error('connected local relationship projection disagrees');
    captured.push({ workPackageId: id, abbreviation: workPackage.abbreviation, rank, reads });
  }
  lifetime.assertOpen();
  return {
    kind: 'connected',
    organizationId,
    mode,
    workPackages: captured.sort(
      (left, right) =>
        left.rank - right.rank || left.workPackageId.localeCompare(right.workPackageId),
    ),
    relationships: [...relationships.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
