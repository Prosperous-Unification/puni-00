import type { ChainAccess, ConnectedPlanCapture, Project, StoredTypedDependency } from '@wbs/core';
import { captureLocalTypedDependency } from '@wbs/core';
import { eq, inArray } from 'drizzle-orm';

import type { CaptureReadSeam } from './capture-read-seam';
import type { Drizzle } from './db';
import { OPEN } from './gate';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { readConnectedPlanInputIn } from './saved-plan-capture';
import { assignment, projectOrganization, workItem } from './schema';
import { readCapacityMode } from './shared-people-mode';
import { TypedDependencyRepository } from './typed-dependency';

/** Borrows an admitted snapshot; topology and full reads never own transaction lifecycle. */
export async function captureConnectedPlanIn(
  db: Drizzle,
  access: ChainAccess,
  projectId: string,
  lifetime: ReadSnapshotLifetime,
  captureRead?: CaptureReadSeam,
): Promise<ConnectedPlanCapture> {
  lifetime.assertOpen();
  const owner = db
    .select()
    .from(projectOrganization)
    .where(eq(projectOrganization.resourceId, projectId))
    .get();
  // Proof: bypassed scoped owner comparison admitted b1 in `requires existing admitted organization authority`.
  if (
    owner === undefined ||
    (access.kind === 'scoped' && owner.organizationId !== access.scope.organizationId)
  )
    throw new Error('connected capture requires readable organization ownership');
  const organizationId = owner.organizationId;
  const admitted = { kind: 'scoped', scope: { organizationId } } as const;
  const mode = readCapacityMode(db, organizationId);
  const projects = new ProjectRepository(db, OPEN);
  const relationships = new Map<string, StoredTypedDependency>();
  const admittedProjects = new Map<string, Project>();
  const pending = new Set([projectId]);
  for (const id of pending) {
    lifetime.assertOpen();
    if (admittedProjects.has(id)) continue;
    const project = await projects.findInOrganization(id, organizationId);
    // Required discovered projects must remain readable; endpoint ownership is validated by listIncident.
    lifetime.assertOpen();
    if (project === null) throw new Error('connected capture names an unreadable project');
    admittedProjects.set(id, project);
    for (const relationship of await new TypedDependencyRepository(db, OPEN).listIncident([id])) {
      lifetime.assertOpen();
      const prior = relationships.get(relationship.id);
      // Proof: bypassed comparison accepted a changed SS identity in `refuses inconsistent identity evidence`.
      if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(relationship))
        throw new Error('connected relationship identity disagrees');
      relationships.set(relationship.id, relationship);
      // Proof: omitted predecessor traversal lost a2 in `captures both incident directions once`.
      pending.add(relationship.predecessor.projectId);
      pending.add(relationship.successor.projectId);
    }
    lifetime.assertOpen();
    if (mode === 'shared') {
      const people = db
        .select({ personId: assignment.personId })
        .from(assignment)
        .innerJoin(workItem, eq(workItem.id, assignment.workItemId))
        .where(eq(workItem.projectId, id))
        .all();
      if (people.length > 0) {
        const neighbors = db
          .select({ projectId: workItem.projectId })
          .from(assignment)
          .innerJoin(workItem, eq(workItem.id, assignment.workItemId))
          .where(
            inArray(
              assignment.personId,
              people.map(({ personId }) => personId),
            ),
          )
          .all();
        // Proof: omitted neighbor traversal lost a3/a4 in `shared closure alternates person bridges`.
        for (const neighbor of neighbors) pending.add(neighbor.projectId);
      }
    }
  }
  lifetime.assertOpen();
  const ranks = await new ProjectRankRepository(db, OPEN).orderIn(organizationId);
  lifetime.assertOpen();
  const captured: ConnectedPlanCapture['projects'][number][] = [];
  for (const [id, project] of admittedProjects) {
    lifetime.assertOpen();
    const rank = ranks.find(({ projectId }) => projectId === id)?.rank;
    // Proof: omitted guard returned undefined priority in `refuses missing component rank`.
    if (rank === undefined) throw new Error('connected project rank is absent');
    const reads = await readConnectedPlanInputIn(db, id, admitted, lifetime, captureRead);
    lifetime.assertOpen();
    // Proof: omitted guard changed `refuses a project lost by the full-input reader` to an incidental null dereference.
    if (reads === null) throw new Error('connected project disappeared inside snapshot');
    const local = [...relationships.values()]
      .filter(
        (relationship) =>
          relationship.predecessor.projectId === id && relationship.successor.projectId === id,
      )
      .map(captureLocalTypedDependency);
    // Proof: omitted agreement check accepted a missing local row in `refuses inconsistent local-projection evidence`.
    if (JSON.stringify(local) !== JSON.stringify(reads.typedDependencies))
      throw new Error('connected local relationship projection disagrees');
    captured.push({ projectId: id, abbreviation: project.abbreviation, rank, reads });
  }
  lifetime.assertOpen();
  return {
    kind: 'connected',
    organizationId,
    mode,
    projects: captured.sort(
      (left, right) => left.rank - right.rank || left.projectId.localeCompare(right.projectId),
    ),
    relationships: [...relationships.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
