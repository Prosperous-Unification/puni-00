import type { LivePlanStore, ResourceAccess, StoredAttempt } from '@wbs/core';
import { deriveExecutionReadiness, resolveConnectedDependencyGraph } from '@wbs/core';
import { captureLeafStepOrders, indexCapturedLeafSteps } from '@wbs/domain';

import { ActualRepository } from './actual';
import { ClaimRepository } from './claim';
import { captureConnectedPlanIn, discoverConnectedTopologyIn } from './connected-plan-capture';
import type { Drizzle } from './db';
import { DependencyRepository } from './dependency';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
import { OPEN } from './gate';
import { readMembershipIn } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { readCapacityMode } from './shared-people-mode';
import { StepBlockageRepository } from './step-blockage';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { StepProgressRepository } from './step-progress';
import { readSqliteStepTreeIn } from './step-tree-reads';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

type ExecutionRead = Awaited<ReturnType<LivePlanStore['readExecution']>>;

/** Captures prerequisites, work-package-local occupancy and organization capacity in the caller's observation; never schedules. */
export async function readExecutionIn(
  db: Drizzle,
  workPackageId: string,
  access: ResourceAccess,
  teamId: string | null,
  lifetime: ReadSnapshotLifetime,
): Promise<ExecutionRead> {
  const read = async <T>(pending: Promise<T>): Promise<T> => {
    lifetime.assertOpen();
    const captured = await pending;
    lifetime.assertOpen();
    return captured;
  };
  lifetime.assertOpen();
  const activation = readOrganizationActivation(db);
  // Proof: bypassing activation parity failed `execution observation rechecks membership and activation` (task-6-3-admission-proofs/activation.log).
  if ((access.kind === 'legacy') !== (activation === 'pre_activation'))
    return { kind: 'access_refused', refusal: 'no_active_organization' };
  if (access.kind === 'scoped') {
    const membership = readMembershipIn(db, access.scope.organizationId, access.scope.userId);
    // Proof: bypassing current membership failed the same execution observation test (task-6-3-admission-proofs/membership.log).
    if (membership === null) return { kind: 'access_refused', refusal: 'not_a_member' };
  }
  const workPackages = new WorkPackageRepository(db, OPEN);
  // Proof: replacing scoped lookup with findById leaked b1 in `execution observation refuses foreign and absent targets alike` (task-6-3-admission-proofs/ownership.log).
  const workPackage = await read(
    access.kind === 'scoped'
      ? workPackages.findInOrganization(workPackageId, access.scope.organizationId)
      : workPackages.findById(workPackageId),
  );
  if (workPackage === null) return { kind: 'not_found' };
  const rows = await read(new WorkItemRepository(db, OPEN).listByWorkPackage(workPackageId));
  const steps = await read(workPackages.stepsOf(workPackageId));
  const leafSteps = captureLeafStepOrders(rows, readSqliteStepTreeIn(db, workPackageId, rows));
  const stated = await read(new StepProgressRepository(db, OPEN).listByWorkPackage(workPackageId));
  const local = {
    workPackageId,
    reads: {
      workPackage,
      workItems: rows,
      steps,
      leafSteps,
      progress: stated,
      stepBlockages: await read(
        new StepBlockageRepository(db, OPEN).listByWorkPackage(workPackageId),
      ),
      estimates: await read(new EstimateRepository(db, OPEN).listByWorkPackage(workPackageId)),
      actuals: await read(new ActualRepository(db, OPEN).listByWorkPackage(workPackageId)),
      dependencies: await read(new DependencyRepository(db, OPEN).listByWorkPackage(workPackageId)),
    },
  };
  const typed = await read(
    new TypedDependencyRepository(db, OPEN).listByWorkPackage(workPackageId),
  );
  const mode =
    access.kind === 'legacy' ? 'isolated' : readCapacityMode(db, access.scope.organizationId);
  const topology = discoverConnectedTopologyIn(db, workPackageId, mode, lifetime);
  const capture = topology.hasExternal
    ? await read(captureConnectedPlanIn(db, access, workPackageId, lifetime))
    : null;
  const members = capture === null ? [local] : capture.workPackages;
  const relationships = capture === null ? typed : capture.relationships;
  const authored = resolveConnectedDependencyGraph({
    workPackages: members.map((member) => ({
      workPackageId: member.workPackageId,
      state: {
        rows: member.reads.workItems,
        steps: member.reads.steps,
        estimates: member.reads.estimates,
        legacy: member.reads.dependencies,
        typed: relationships.filter(
          (edge) =>
            edge.predecessor.workPackageId === member.workPackageId &&
            edge.successor.workPackageId === member.workPackageId,
        ),
        reach: member.reads.workPackage.depReach,
        stepOrder: {
          kind: 'leaf',
          byLeaf: indexCapturedLeafSteps(
            member.reads.workItems,
            member.reads.steps,
            member.reads.leafSteps,
          ),
        },
      },
    })),
    // Proof: dropping external pairs made mounted `remote unfinished FS` advertise a premature start (task-6-3-admission-proofs/external-edge.log).
    external: relationships.filter(
      (edge) => edge.predecessor.workPackageId !== edge.successor.workPackageId,
    ),
  });
  const attemptsByWorkPackage = new Map<string, readonly StoredAttempt[]>();
  for (const member of members)
    attemptsByWorkPackage.set(
      member.workPackageId,
      await read(new StepNodeAttemptRepository(db, OPEN).listByWorkPackage(member.workPackageId)),
    );
  // Proof: removing captured progress prevented completion from releasing mounted `remote unfinished FS` (task-6-3-admission-proofs/progress-evidence.log).
  const readiness = deriveExecutionReadiness(
    members,
    relationships,
    authored,
    attemptsByWorkPackage,
  );
  const claims = new ClaimRepository(db, OPEN);
  const stamped = await read(claims.listStampedByWorkPackage(workPackageId));
  const directory = new DirectoryRepository(db, OPEN);
  const assigned = await read(directory.assignmentsInWorkPackage(workPackageId));
  const peopleIds = [
    ...stamped.map((claim) => claim.personId),
    ...assigned.assignments.map((assignment) => assignment.personId),
  ];
  const teamIds = [...rows.flatMap((row) => row.teamIds), ...(teamId === null ? [] : [teamId])];
  const people = await read(
    access.kind === 'scoped'
      ? directory.listInOrganization('people', access.scope.organizationId)
      : directory.namesOf('people', peopleIds),
  );
  const teams = await read(
    access.kind === 'scoped'
      ? directory.listInOrganization('teams', access.scope.organizationId)
      : directory.namesOf('teams', teamIds),
  );
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  if (teamId !== null && !teamNames.has(teamId)) return { kind: 'unknown_team' };
  const capacities = await read(new ResourceCapacityRepository(db, OPEN).listFor(workPackageId));
  const demands = await read(new DemandRepository(db, OPEN).listByWorkPackage(workPackageId));
  const directoryCapacities = await read(
    directory.directoryCapacitiesOf([...new Set(demands.map(({ resourceId }) => resourceId))]),
  );
  const organizationOccupied = await read(
    claims.organizationUnitsOf(directoryCapacities.map(({ resourceId }) => resourceId)),
  );
  const resources =
    capacities.length === 0 && directoryCapacities.length === 0
      ? []
      : await read(
          access.kind === 'scoped'
            ? directory.listInOrganization('resources', access.scope.organizationId)
            : directory.listResources(),
        );
  return {
    kind: 'ready',
    reads: {
      rows,
      leafSteps: indexCapturedLeafSteps(rows, steps, leafSteps),
      stated,
      claims: stamped,
      assignments: assigned.assignments,
      dependencies: { edges: local.reads.dependencies, typed },
      ...readiness,
      personNames: new Map(people.map((person) => [person.id, person.name])),
      teamNames,
      teamId,
      capacities,
      demands,
      // Proof: returning no directory capacities here made the mounted remote-FS/capacity
      // case advertise the target as fitting while a peer held all seven directory units.
      // Exact restoration passed it and the local-occupancy control (2026-11-04).
      directoryCapacities,
      organizationOccupied,
      occupancy: await read(claims.occupancyOf(workPackageId)),
      resources: new Map(resources.map((resource) => [resource.id, resource])),
    },
  };
}
