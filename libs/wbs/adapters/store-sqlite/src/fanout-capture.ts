import { type DirectoryStore, type PlanInputReads, readChain } from '@wbs/core';
import type {
  BeforeImport,
  BeforeModeSwitch,
  BeforeProjectUpdate,
  BeforeRankMove,
  BeforeStepRemoval,
  CapturedFanout,
  DirectoryWriteAddress,
  DirectoryWriteResolution,
  LifecycleOwnership,
} from '@wbs/core/ports/fanout-capture-store';
import { roleMaySwitchCapacityMode } from '@wbs/core/service/capacity-mode.resource';
import { scheduleInputOfCaptured } from '@wbs/core/service/saved-plan-schedule';
import type { DependencyFanout } from '@wbs/core/service/shared-people-fanout';
import {
  canEditProjectInOrganization,
  canWriteInOrganization,
  classifyProjectEdit,
} from '@wbs/domain';
import { and, eq, sql } from 'drizzle-orm';

import { type ChainSnapshotOptions, readChainSnapshotIn } from './chain-snapshot';
import { discoverConnectedTopologyIn } from './connected-plan-capture';
import type { Drizzle } from './db';
import { OPEN } from './gate';
import { capStoredRole, validateStoredRole } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { readConnectedPlanInputIn } from './saved-plan-capture';
import { incomingCalendarHash, scheduleInputHash } from './schedule-input-hash';
import {
  externalDependency,
  organization,
  organizationMembership,
  project,
  projectOrganization,
} from './schema';
import { readCapacityMode } from './shared-people-mode';

/** Resolves a trusted maintenance target on its borrowed writer before any lifecycle mutation. */
export function resolveLifecycleOwnerIn(db: Drizzle, projectId: string): LifecycleOwnership {
  const target = db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).get();
  // Proof: omitting the absent-target branch changed the mounted no-op into
  // a false missing-ownership corruption error for project `missing`.
  if (target === undefined) return { kind: 'absent' };
  if (readOrganizationActivation(db) === 'pre_activation') return { kind: 'legacy' };
  const ownership = db
    .select({ organizationId: projectOrganization.organizationId })
    .from(projectOrganization)
    .where(eq(projectOrganization.resourceId, projectId))
    .get();
  // Proof: omitting this refusal replaced trusted missing ownership with an
  // incidental property error in the mounted active-project negative.
  if (ownership === undefined)
    throw new Error(`active project ${projectId} lacks organization ownership`);
  const owner = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, ownership.organizationId))
    .get();
  // Proof: omitting this check replaced a malformed trusted owner with an
  // incidental property error before the mounted capture-zero assertion.
  if (owner === undefined)
    throw new Error(`project ${projectId} has malformed organization ownership`);
  return { kind: 'scoped', organizationId: owner.id };
}

/** Current import write authority on the same borrowed connection as capture. */
export function authorizeImportIn(db: Drizzle): BeforeImport {
  return (actorId, access) => {
    if (access.kind === 'legacy') return Promise.resolve({ ok: true });
    const { organizationId } = access.scope;
    const membership = db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    // Proof: admitting a missing membership let a queued removed member's
    // mounted import return 201 instead of the typed 403.
    if (membership === undefined) return Promise.resolve({ ok: false, reason: 'forbidden' });
    // Proof: replacing validation with admin let a queued malformed role
    // import return 201 instead of surfacing trusted corruption as 500.
    // Proof: dropping this ceiling made borrowed viewer-import authority admit (2026-10-22).
    const role = capStoredRole(
      validateStoredRole(membership.role, organizationId),
      access.scope.role,
    );
    // Proof: admitting unconditionally let a queued viewer import return 201
    // instead of the typed 403, with writes and capture after demotion.
    return Promise.resolve(
      canWriteInOrganization(role) ? { ok: true } : { ok: false, reason: 'forbidden' },
    );
  };
}

/** Rechecks current membership/project ownership without creating an audit or grant. */
export function authorizeProjectFanoutIn(
  db: Drizzle,
  lifetime: ReadSnapshotLifetime,
): BeforeProjectUpdate {
  return async (projectId, actorId, access) => {
    if (access.kind === 'legacy') return { ok: true };
    const organizationId = access.scope.organizationId;
    const project = await new ProjectRepository(db, OPEN).findInOrganization(
      projectId,
      organizationId,
    );
    // Proof: removing this check made `fanout authorizeProjectUpdate` issue 1 expired membership query.
    lifetime.assertOpen();
    if (project === null) return { ok: false, reason: 'not_found' };
    const membership = db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    if (membership === undefined) return { ok: false, reason: 'forbidden' };
    const edit = classifyProjectEdit(project, {
      organizationId,
      userId: actorId,
      // Proof: dropping this ceiling made borrowed restricted-project and viewer-project authority admit (2026-10-22).
      role: capStoredRole(validateStoredRole(membership.role, organizationId), access.scope.role),
    });
    return edit === 'refused' ? { ok: false, reason: 'forbidden' } : { ok: true };
  };
}

/** Bare step removal has creator policy and never inherits a scoped recovery grant. */
export function authorizeStepFanoutIn(
  db: Drizzle,
  lifetime: ReadSnapshotLifetime,
): BeforeStepRemoval {
  return async (projectId, actorId, access) => {
    if (access.kind === 'legacy') return { ok: true };
    const organizationId = access.scope.organizationId;
    const project = await new ProjectRepository(db, OPEN).findInOrganization(
      projectId,
      organizationId,
    );
    // Proof: removing this check made `fanout authorizeStepRemoval` issue 1 expired membership query.
    lifetime.assertOpen();
    if (project === null) return { ok: false, reason: 'not_found' };
    const membership = db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    if (membership === undefined) return { ok: false, reason: 'forbidden' };
    const admitted = canEditProjectInOrganization(project, {
      organizationId,
      userId: actorId,
      // Proof: dropping this ceiling made borrowed viewer-step authority admit (2026-10-22).
      role: capStoredRole(validateStoredRole(membership.role, organizationId), access.scope.role),
    });
    return admitted ? { ok: true } : { ok: false, reason: 'forbidden' };
  };
}

/** Read-only current-admin admission after the rank owner acquires its write turn. */
export function authorizeRankMoveIn(db: Drizzle): BeforeRankMove {
  return (organizationId, actorId) => {
    const membership = db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    if (membership === undefined) return Promise.resolve({ ok: false, reason: 'forbidden' });
    const role = validateStoredRole(membership.role, organizationId);
    return Promise.resolve(
      role === 'admin' || role === 'super_admin'
        ? { ok: true }
        : { ok: false, reason: 'forbidden' },
    );
  };
}

/**
 * Current super-admin membership on the borrowed writer, read inside the
 * switch's own turn so a demotion queued ahead of it refuses the switch.
 */
export function authorizeModeSwitchIn(db: Drizzle): BeforeModeSwitch {
  return (organizationId, actorId) => {
    const membership = db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    if (membership === undefined) return Promise.resolve({ ok: false, reason: 'forbidden' });
    const role = validateStoredRole(membership.role, organizationId);
    return Promise.resolve(
      roleMaySwitchCapacityMode(role) ? { ok: true } : { ok: false, reason: 'forbidden' },
    );
  };
}

/** Classifies the caller's directory address on the same borrowed writer as the mutation. */
export async function resolveDirectoryWriteIn(
  db: Drizzle,
  directory: DirectoryStore,
  address: DirectoryWriteAddress,
  lifetime: ReadSnapshotLifetime,
): Promise<DirectoryWriteResolution> {
  if (address.access.kind === 'legacy') return Promise.resolve({ ok: true, organizationIds: [] });
  const { organizationId } = address.access.scope;
  const table = {
    people: ['person', 'person_organization'],
    teams: ['service_team', 'service_team_organization'],
    tags: ['tag', 'tag_organization'],
    workItemTypes: ['work_item_type', 'work_item_type_organization'],
    services: ['service', 'service_organization'],
  } as const;
  const ownershipOf = (
    catalog: keyof typeof table,
    resourceId: string,
  ): 'absent' | 'foreign' | 'owned' => {
    const [root, ownership] = table[catalog];
    const present = db
      .all<{ id: string }>(sql`SELECT id FROM ${sql.raw(root)} WHERE id = ${resourceId}`)
      .at(0);
    if (present === undefined) return 'absent';
    const owners = db.all<{ organization_id: string }>(
      sql`SELECT organization_id FROM ${sql.raw(ownership)} WHERE resource_id = ${resourceId}`,
    );
    if (owners.length === 0) throw new Error(`present ${catalog} directory row lacks ownership`);
    if (owners.length !== 1)
      throw new Error(`present ${catalog} directory row has conflicting ownership`);
    return owners[0]?.organization_id === organizationId ? 'owned' : 'foreign';
  };
  const addressed =
    address.kind === 'remove' || address.kind === 'rename'
      ? { catalog: address.catalog, resourceId: address.resourceId }
      : address.kind === 'patch-team'
        ? { catalog: 'teams' as const, resourceId: address.teamId }
        : address.kind === 'patch-person'
          ? { catalog: 'people' as const, resourceId: address.personId }
          : null;
  if (addressed !== null && ownershipOf(addressed.catalog, addressed.resourceId) !== 'owned')
    return Promise.resolve({ ok: false, reason: 'not_found' });
  const linkedTeams =
    address.kind === 'add-person' || address.kind === 'patch-person' ? address.teamIds : undefined;
  for (const teamId of linkedTeams ?? [])
    if (ownershipOf('teams', teamId) !== 'owned')
      return Promise.resolve({ ok: false, reason: 'unknown_team' });
  if (address.kind === 'patch-team')
    for (const serviceId of address.serviceIds ?? [])
      if (ownershipOf('services', serviceId) !== 'owned')
        return Promise.resolve({ ok: false, reason: 'unknown_service' });
  if (addressed !== null) {
    // Proof: omitting this owner-side recheck let A remove its team after a
    // second connection linked B's person to it; capture ran and missed B.
    const foreign = await directory.foreignReferencesTo(
      addressed.catalog,
      addressed.resourceId,
      organizationId,
    );
    // Proof: removing this check exposed foreign-reference details instead of expiry in `directory reference evidence`.
    lifetime.assertOpen();
    if (foreign.length > 0)
      throw new Error(
        `${addressed.catalog} entry "${addressed.resourceId}" of organization "${organizationId}" is reached from outside it: ${foreign.join(', ')}`,
      );
  }
  return { ok: true, organizationIds: [organizationId] };
}

/** Reads staged writes on the borrowed transaction; it never owns or closes a connection. */
export async function readFanoutObservationIn(
  db: Drizzle,
  organizationId: string,
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization' | 'captureRead'>,
  lifetime: ReadSnapshotLifetime,
): Promise<CapturedFanout> {
  lifetime.assertOpen();
  // Proof: removing this guard labeled pre-activation capture isolated, not legacy.
  if (readOrganizationActivation(db) === 'pre_activation')
    return {
      observation: { mode: 'legacy', organizationId: null, projects: [] },
      dependency: null,
      localFacts: new Map(),
    };
  const mode = readCapacityMode(db, organizationId);
  // Proof: removing this guard invoked the throwing shared scheduler in isolated mode.
  if (mode === 'isolated')
    return {
      observation: { mode, organizationId, projects: [] },
      dependency: await readDependencyFanoutIn(db, organizationId, options, lifetime, mode),
      localFacts: new Map(),
    };
  const dependency = await readDependencyFanoutIn(db, organizationId, options, lifetime, mode);
  const ranks = await new ProjectRankRepository(db, OPEN).orderIn(organizationId);
  // Proof: removing this partition restores the historical external-capture refusal in the external shared DB writer witness.
  const ordinary = ranks.filter(
    ({ projectId }) => dependency.projects.get(projectId) === 'not_incident',
  );
  lifetime.assertOpen();
  const projects = new ProjectRepository(db, OPEN);
  const readable = await Promise.all(
    ranks.map(async ({ projectId }) => {
      lifetime.assertOpen();
      const project = await projects.findInOrganization(projectId, organizationId);
      lifetime.assertOpen();
      if (project === null) throw new Error('rank names an unreadable project');
      return project;
    }),
  );
  const fullSnapshot = await readChainSnapshotIn(
    db,
    { kind: 'scoped', scope: { organizationId } },
    readable,
    '',
    // Proof: forcing live scheduler mode in this capture made the enabled
    // optimized fixture invoke its forbidden live admission callback.
    options,
    lifetime,
    options.captureRead,
  );
  lifetime.assertOpen();
  const captures = new Map<string, Promise<PlanInputReads>>();
  const snapshot = {
    ...fullSnapshot,
    projects: fullSnapshot.projects.filter(
      ({ project }) => dependency.projects.get(project.id) === 'not_incident',
    ),
    capturePlan: (projectId: string) => {
      const held = captures.get(projectId);
      // Proof: bypassing this memo reads ordinary a1/a4 twice in the staged external shared capture witness.
      if (held !== undefined) return held;
      const fresh = fullSnapshot.capturePlan(projectId);
      captures.set(projectId, fresh);
      return fresh;
    },
  };
  const localFacts = new Map<string, string>();
  const captured = await Promise.all(
    ordinary.map(async ({ projectId, rank }) => {
      const reads = await snapshot.capturePlan(projectId);
      lifetime.assertOpen();
      const personIds = [...new Set(reads.assignments.map(({ personId }) => personId))].sort();
      // Proof: treating physical numeric rank positions as local facts and
      // observable booking changes emitted a false row on pure respacing.
      localFacts.set(
        projectId,
        JSON.stringify([
          scheduleInputHash(scheduleInputOfCaptured(reads)),
          reads.project.startDate,
          reads.project.optimizationEnabled,
          reads.project.scheduleEngine,
          reads.project.scheduleObjective,
          personIds,
        ]),
      );
      const chain = await readChain(snapshot, projectId);
      if (chain.kind === 'not_found')
        throw new Error('ranked project disappeared inside fan-out capture');
      const outcome =
        chain.kind === 'scheduled'
          ? chain.scheduled
          : chain.kind === 'unavailable'
            ? { kind: chain.reason }
            : chain;
      return {
        projectId,
        organizationId,
        name: reads.project.name,
        rankPosition: rank,
        startDate: reads.project.startDate,
        personIds,
        inputHash: chain.kind === 'scheduled' ? scheduleInputHash(chain.input) : null,
        incomingBasis:
          chain.kind === 'scheduled' ? incomingCalendarHash(chain.input.elsewhere) : null,
        settings: {
          optimizationEnabled: reads.project.optimizationEnabled,
          scheduleEngine: reads.project.scheduleEngine,
          scheduleObjective: reads.project.scheduleObjective,
        },
        outcome,
      };
    }),
  );
  lifetime.assertOpen();
  return {
    observation: { mode, organizationId, projects: captured },
    // Proof: replacing this projection with null loses successor/tail events in mounted shared predecessor completion.
    dependency,
    localFacts,
  };
}

/** Captures external components and shared-person bridges without scheduling or opening another connection. */
async function readDependencyFanoutIn(
  db: Drizzle,
  organizationId: string,
  options: Pick<ChainSnapshotOptions, 'captureRead'>,
  lifetime: ReadSnapshotLifetime,
  mode: 'isolated' | 'shared',
): Promise<DependencyFanout> {
  lifetime.assertOpen();
  const edges = db
    .select()
    .from(externalDependency)
    // Proof: removing this scope filter made the mounted foreign-edge fixture return 500 at the scoped endpoint refusal, instead of 200; no disclosure was observed.
    .where(eq(externalDependency.organizationId, organizationId))
    .all();
  const connections: DependencyFanout['connections'][number][] = edges.map((edge) => ({
    key: JSON.stringify([
      edge.id,
      edge.predecessorProjectId,
      edge.predecessorWorkItemId,
      edge.predecessorScope,
      edge.predecessorStepId,
      edge.successorProjectId,
      edge.successorWorkItemId,
      edge.successorScope,
      edge.successorStepId,
      edge.type,
    ]),
    predecessorProjectId: edge.predecessorProjectId,
    successorProjectId: edge.successorProjectId,
  }));
  const ownership = db
    .select({ projectId: projectOrganization.resourceId })
    .from(projectOrganization)
    .where(eq(projectOrganization.organizationId, organizationId))
    .all();
  // Proof: retaining only incident IDs lost both event rows in `invalidates surviving projects disconnected by relationship removal`.
  const projects = new Map(ownership.map(({ projectId }) => [projectId, 'not_incident']));
  const members = new Set<string>();
  for (const edge of connections)
    for (const endpoint of [edge.predecessorProjectId, edge.successorProjectId]) {
      if (members.has(endpoint)) continue;
      // Proof: forcing isolated discovery makes the alternating shared capture witness retain ordinary projects [a1, a4] instead of [].
      const topology = discoverConnectedTopologyIn(db, endpoint, mode, lifetime);
      for (const projectId of topology.projects) members.add(projectId);
    }
  const people = new Map<string, readonly string[]>();
  for (const projectId of members) {
    const header = await new ProjectRepository(db, OPEN).findInOrganization(
      projectId,
      organizationId,
    );
    lifetime.assertOpen();
    const captured = await readConnectedPlanInputIn(
      db,
      projectId,
      { kind: 'scoped', scope: { organizationId } },
      lifetime,
      options.captureRead,
    );
    lifetime.assertOpen();
    // Proof: removing this refusal changed the missing-endpoint negative from the named invariant to a property-access TypeError; the unreadable seam separately throws unchanged.
    if (captured === null || header === null)
      throw new Error('dependency fan-out endpoint is unreadable');
    people.set(projectId, [...new Set(captured.assignments.map(({ personId }) => personId))]);
    projects.set(
      projectId,
      JSON.stringify([
        scheduleInputHash(scheduleInputOfCaptured(captured)),
        captured.project.name,
        // Proof: omitting abbreviation made the mounted abbreviation-only PATCH retain one event instead of two.
        header.abbreviation,
        captured.project.startDate,
        captured.project.optimizationEnabled,
        captured.project.scheduleEngine,
        captured.project.scheduleObjective,
        // Proof: substituting [] lost the real borrowed-writer remote-completion event in `records remote completion without shared people`.
        captured.progress,
        captured.actuals,
        captured.stepBlockages,
        captured.stepParallels,
        captured.measures,
        captured.workItems.map((row) => [row.id, row.name, row.position, row.frozenNumber]),
        // Proof: removing code loses successor label events in both staged shared component witnesses.
        captured.steps.map((step) => [step.id, step.name, step.code, step.position]),
      ]),
    );
  }
  // Proof: omitting person bridges loses downstream/tail events in the mounted shared-person label writer.
  if (mode === 'shared')
    for (const [projectId, personIds] of people)
      for (const [neighborId, neighborPeople] of people)
        if (projectId < neighborId)
          for (const personId of personIds)
            if (neighborPeople.includes(personId))
              connections.push({
                key: JSON.stringify(['person', personId, projectId, neighborId]),
                predecessorProjectId: projectId,
                successorProjectId: neighborId,
              });
  return { organizationId, projects, connections };
}
