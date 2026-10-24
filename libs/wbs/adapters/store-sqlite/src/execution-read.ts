import type { LivePlanStore, ResourceAccess, StoredAttempt } from '@wbs/core';
import { deriveExecutionReadiness, resolveConnectedDependencyGraph } from '@wbs/core';

import { ActualRepository } from './actual';
import { ClaimRepository } from './claim';
import { captureConnectedPlanIn, discoverConnectedTopologyIn } from './connected-plan-capture';
import type { Drizzle } from './db';
import { DependencyRepository } from './dependency';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
import { OPEN } from './gate';
import { currentMembershipAccess } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { ProjectRepository } from './project';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { readCapacityMode } from './shared-people-mode';
import { StepBlockageRepository } from './step-blockage';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { StepProgressRepository } from './step-progress';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';

type ExecutionRead = Awaited<ReturnType<LivePlanStore['readExecution']>>;

/** Captures execution and target-only claim/resource facts in the caller's observation; never schedules. */
export async function readExecutionIn(
  db: Drizzle,
  projectId: string,
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
    const membership = currentMembershipAccess(
      db,
      access.scope.organizationId,
      access.scope.userId,
    );
    // Proof: bypassing current membership failed the same execution observation test (task-6-3-admission-proofs/membership.log).
    if (!membership.ok) return { kind: 'access_refused', refusal: membership.refusal };
  }
  const projects = new ProjectRepository(db, OPEN);
  // Proof: replacing scoped lookup with findById leaked b1 in `execution observation refuses foreign and absent targets alike` (task-6-3-admission-proofs/ownership.log).
  const project = await read(
    access.kind === 'scoped'
      ? projects.findInOrganization(projectId, access.scope.organizationId)
      : projects.findById(projectId),
  );
  if (project === null) return { kind: 'not_found' };
  const rows = await read(new WorkItemRepository(db, OPEN).listByProject(projectId));
  const steps = await read(projects.stepsOf(projectId));
  const stated = await read(new StepProgressRepository(db, OPEN).listByProject(projectId));
  const local = {
    projectId,
    reads: {
      project,
      workItems: rows,
      steps,
      progress: stated,
      stepBlockages: await read(new StepBlockageRepository(db, OPEN).listByProject(projectId)),
      estimates: await read(new EstimateRepository(db, OPEN).listByProject(projectId)),
      actuals: await read(new ActualRepository(db, OPEN).listByProject(projectId)),
      dependencies: await read(new DependencyRepository(db, OPEN).listByProject(projectId)),
    },
  };
  const typed = await read(new TypedDependencyRepository(db, OPEN).listByProject(projectId));
  const mode =
    access.kind === 'legacy' ? 'isolated' : readCapacityMode(db, access.scope.organizationId);
  const topology = discoverConnectedTopologyIn(db, projectId, mode, lifetime);
  const capture = topology.hasExternal
    ? await read(captureConnectedPlanIn(db, access, projectId, lifetime))
    : null;
  const members = capture === null ? [local] : capture.projects;
  const relationships = capture === null ? typed : capture.relationships;
  const authored = resolveConnectedDependencyGraph({
    projects: members.map((member) => ({
      projectId: member.projectId,
      state: {
        rows: member.reads.workItems,
        steps: member.reads.steps,
        estimates: member.reads.estimates,
        legacy: member.reads.dependencies,
        typed: relationships.filter(
          (edge) =>
            edge.predecessor.projectId === member.projectId &&
            edge.successor.projectId === member.projectId,
        ),
        reach: member.reads.project.depReach,
      },
    })),
    // Proof: dropping external pairs made mounted `remote unfinished FS` advertise a premature start (task-6-3-admission-proofs/external-edge.log).
    external: relationships.filter(
      (edge) => edge.predecessor.projectId !== edge.successor.projectId,
    ),
  });
  const attemptsByProject = new Map<string, readonly StoredAttempt[]>();
  for (const member of members)
    attemptsByProject.set(
      member.projectId,
      await read(new StepNodeAttemptRepository(db, OPEN).listByProject(member.projectId)),
    );
  // Proof: removing captured progress prevented completion from releasing mounted `remote unfinished FS` (task-6-3-admission-proofs/progress-evidence.log).
  const readiness = deriveExecutionReadiness(members, relationships, authored, attemptsByProject);
  const claims = new ClaimRepository(db, OPEN);
  const stamped = await read(claims.listStampedByProject(projectId));
  const directory = new DirectoryRepository(db, OPEN);
  const assigned = await read(directory.assignmentsInProject(projectId));
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
  const capacities = await read(new ResourceCapacityRepository(db, OPEN).listFor(projectId));
  const resources =
    capacities.length === 0
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
      stepIds: steps.map((step) => step.id),
      stated,
      claims: stamped,
      assignments: assigned.assignments,
      dependencies: { edges: local.reads.dependencies, typed },
      ...readiness,
      personNames: new Map(people.map((person) => [person.id, person.name])),
      teamNames,
      teamId,
      capacities,
      demands: await read(new DemandRepository(db, OPEN).listByProject(projectId)),
      occupancy: await read(claims.occupancyOf(projectId)),
      resources: new Map(resources.map((resource) => [resource.id, resource])),
    },
  };
}
