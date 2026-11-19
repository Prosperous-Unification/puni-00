import {
  accessSubjectOf,
  authorize,
  authorizePackageAt,
  authorizePackageSettings,
  capOf,
  type DirectoryStore,
  type PlanInputReads,
  readChain,
} from '@wbs/core';
import type {
  BeforeImport,
  BeforeStepRemoval,
  BeforeWorkPackageUpdate,
  CapturedFanout,
  DirectoryWriteAddress,
  DirectoryWriteResolution,
  LifecycleOwnership,
  ResolveWorkPackageWriteScope,
} from '@wbs/core/ports/fanout-capture-store';
import { scheduleInputOfCaptured } from '@wbs/core/service/saved-plan-schedule';
import type { DependencyFanout } from '@wbs/core/service/shared-people-fanout';
import { and, eq, sql } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import { type ChainSnapshotOptions, readChainSnapshotIn } from './chain-snapshot';
import { discoverConnectedTopologyIn } from './connected-plan-capture';
import type { Drizzle } from './db';
import { OPEN } from './gate';
import { readOrganizationActivation } from './organization-activation';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { readConnectedPlanInputIn } from './saved-plan-capture';
import { incomingCalendarHash, scheduleInputHash } from './schedule-input-hash';
import {
  externalDependency,
  organization,
  organizationMembership,
  workPackage,
  workPackageOrganization,
} from './schema';
import { readSettingTargetIn } from './settings';
import { readCapacityMode } from './shared-people-mode';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { WorkPackageRepository } from './work-package';
import { WorkPackageRankRepository } from './work-package-rank';

/** Resolves a trusted maintenance target on its borrowed writer before any lifecycle mutation. */
export function resolveLifecycleOwnerIn(db: Drizzle, workPackageId: string): LifecycleOwnership {
  const target = db
    .select({ id: workPackage.id })
    .from(workPackage)
    .where(eq(workPackage.id, workPackageId))
    .get();
  // Proof: omitting the absent-target branch changed the mounted no-op into
  // a false missing-ownership corruption error for work package `missing`.
  if (target === undefined) return { kind: 'absent' };
  if (readOrganizationActivation(db) === 'pre_activation') return { kind: 'legacy' };
  const ownership = db
    .select({ organizationId: workPackageOrganization.organizationId })
    .from(workPackageOrganization)
    .where(eq(workPackageOrganization.resourceId, workPackageId))
    .get();
  // Proof: omitting this refusal replaced trusted missing ownership with an
  // incidental property error in the mounted active-work-package negative.
  if (ownership === undefined)
    throw new Error(`active work package ${workPackageId} lacks organization ownership`);
  const owner = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, ownership.organizationId))
    .get();
  // Proof: omitting this check replaced a malformed trusted owner with an
  // incidental property error before the mounted capture-zero assertion.
  if (owner === undefined)
    throw new Error(`work package ${workPackageId} has malformed organization ownership`);
  return { kind: 'scoped', organizationId: owner.id };
}

/** Current import write authority on the same borrowed connection as capture. */
export function authorizeImportIn(db: Drizzle): BeforeImport {
  return async (actorId, access, project) => {
    if (access.kind === 'legacy') return { ok: true };
    if (access.scope.userId !== actorId || access.principal.id !== actorId)
      throw new Error('import permission principal differs from its actor');
    // Historical P16 organization-admission evidence follows; the destination-project gate requires its own current proof.
    // Proof: import-create-grant fault failed 'encodes organization.create_work_package on a refused import' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    if (project.chain.organizationId !== access.scope.organizationId)
      throw new Error('import project target differs from its admitted organization');
    const decision = await authorize(
      new AccessDecisionRepository(db),
      access.principal,
      project,
      'project.manage_packages',
    );
    return decision.ok
      ? { ok: true }
      : decision.reason === 'not_found'
        ? { ok: false, reason: 'not_found' }
        : { ok: false, reason: 'forbidden', permission: 'project.manage_packages' };
  };
}

/** Rechecks current membership/work-package ownership without creating an audit or grant. */
export function authorizeWorkPackageFanoutIn(
  db: Drizzle,
  lifetime: ReadSnapshotLifetime,
): BeforeWorkPackageUpdate {
  return async (workPackageId, actorId, access, patch) => {
    if (access.kind === 'legacy') return { ok: true };
    const organizationId = access.scope.organizationId;
    const workPackage = readSettingTargetIn(
      db,
      { level: 'work_package', id: workPackageId },
      organizationId,
    );
    await Promise.resolve();
    // Proof: removing this check made `fanout authorizeWorkPackageUpdate` issue 1 expired membership query.
    lifetime.assertOpen();
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    if (access.scope.userId !== actorId || access.principal.id !== actorId)
      throw new Error('work package fanout principal differs from its actor');
    // Proof: checking package.read here admitted the revoked settings grant in `rechecks manage_settings before workPackage fanout observation after its grant is revoked` (fanout-capture.db.test.ts); watched 2026-11-09.
    return authorizePackageSettings(
      new AccessDecisionRepository(db),
      access.principal,
      workPackage,
      patch,
    );
  };
}

/**
 * Resolves current scope on the borrowed writer, applying detached verifier metadata
 * through the credential role policy before work package classification. Explicit undefined
 * preserves direct-context callers; resolution creates neither audit nor grant.
 * The borrowed lifetime must remain open through work package and membership reads.
 *
 * @throws when the lifetime expires or a trusted membership role is malformed.
 */
export function resolveWorkPackageWriteScopeIn(
  db: Drizzle,
  lifetime: ReadSnapshotLifetime,
): ResolveWorkPackageWriteScope {
  return async (workPackageId, organizationId, actorId, authentication) => {
    const workPackage = readSettingTargetIn(
      db,
      { level: 'work_package', id: workPackageId },
      organizationId,
    );
    await Promise.resolve();
    // Proof: removing this post-await check made suspended runtime work package resolution issue membership SQL during a later writer (R10, 2026-10-26).
    lifetime.assertOpen();
    // Proof: F11 removed this check; the foreign-work-package runtime read threw instead of returning not_found.
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    const membership = db
      .select({ userId: organizationMembership.userId })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, actorId),
        ),
      )
      .get();
    // Proof: F12 removed this check; the removed-member runtime read threw instead of returning forbidden.
    if (membership === undefined) return { ok: false, reason: 'forbidden' };
    const scope = {
      organizationId,
      userId: actorId,
      // Proof: replacing this cap with null failed `preserves the credential
      // cap when resolving a borrowed work package write scope`; watched 2026-11-09.
      cap: capOf(accessSubjectOf({ id: actorId, authentication })),
    };
    // Proof: F13 bypassed this decision; a current viewer received runtime facts.
    const decision = await authorize(
      new AccessDecisionRepository(db),
      { id: actorId, authentication },
      workPackage,
      'package.write',
    );
    lifetime.assertOpen();
    return decision.ok ? { ok: true, scope } : decision;
  };
}

/** Bare step removal has creator policy and never inherits a scoped recovery grant. */
export function authorizeStepFanoutIn(
  db: Drizzle,
  lifetime: ReadSnapshotLifetime,
): BeforeStepRemoval {
  return async (workPackageId, actorId, access) => {
    if (access.kind === 'legacy') return { ok: true };
    const organizationId = access.scope.organizationId;
    const workPackage = readSettingTargetIn(
      db,
      { level: 'work_package', id: workPackageId },
      organizationId,
    );
    await Promise.resolve();
    // Proof: removing this check made `fanout authorizeStepRemoval` issue 1 expired membership query.
    lifetime.assertOpen();
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    return authorizePackageAt(
      new AccessDecisionRepository(db),
      access,
      workPackage,
      actorId,
      'package.write',
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
      observation: { mode: 'legacy', organizationId: null, workPackages: [] },
      dependency: null,
      localFacts: new Map(),
    };
  const mode = readCapacityMode(db, organizationId);
  // Proof: removing this guard invoked the throwing shared scheduler in isolated mode.
  if (mode === 'isolated')
    return {
      observation: { mode, organizationId, workPackages: [] },
      dependency: await readDependencyFanoutIn(db, organizationId, options, lifetime, mode),
      localFacts: new Map(),
    };
  const dependency = await readDependencyFanoutIn(db, organizationId, options, lifetime, mode);
  const ranks = await new WorkPackageRankRepository(db, OPEN).orderIn(organizationId);
  // Proof: removing this partition restores the historical external-capture refusal in the external shared DB writer witness.
  const ordinary = ranks.filter(
    ({ workPackageId }) => dependency.workPackages.get(workPackageId) === 'not_incident',
  );
  lifetime.assertOpen();
  const workPackages = new WorkPackageRepository(db, OPEN);
  const readable = await Promise.all(
    ranks.map(async ({ workPackageId }) => {
      lifetime.assertOpen();
      const workPackage = await workPackages.findInOrganization(workPackageId, organizationId);
      lifetime.assertOpen();
      if (workPackage === null) throw new Error('rank names an unreadable work package');
      return workPackage;
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
    workPackages: fullSnapshot.workPackages.filter(
      ({ workPackage }) => dependency.workPackages.get(workPackage.id) === 'not_incident',
    ),
    capturePlan: (workPackageId: string) => {
      const held = captures.get(workPackageId);
      // Proof: bypassing this memo reads ordinary a1/a4 twice in the staged external shared capture witness.
      if (held !== undefined) return held;
      const fresh = fullSnapshot.capturePlan(workPackageId);
      captures.set(workPackageId, fresh);
      return fresh;
    },
  };
  const localFacts = new Map<string, string>();
  const captured = await Promise.all(
    ordinary.map(async ({ workPackageId, rank }) => {
      const reads = await snapshot.capturePlan(workPackageId);
      lifetime.assertOpen();
      const personIds = [...new Set(reads.assignments.map(({ personId }) => personId))].sort();
      // Proof: treating physical numeric rank positions as local facts and
      // observable booking changes emitted a false row on pure respacing.
      localFacts.set(
        workPackageId,
        JSON.stringify([
          scheduleInputHash(scheduleInputOfCaptured(reads)),
          reads.workPackage.startDate,
          reads.workPackage.optimizationEnabled,
          reads.workPackage.scheduleEngine,
          reads.workPackage.scheduleObjective,
          personIds,
        ]),
      );
      const chain = await readChain(snapshot, workPackageId);
      if (chain.kind === 'not_found')
        throw new Error('ranked work package disappeared inside fan-out capture');
      const outcome =
        chain.kind === 'scheduled'
          ? chain.scheduled
          : chain.kind === 'unavailable'
            ? { kind: chain.reason }
            : chain;
      return {
        workPackageId,
        organizationId,
        name: reads.workPackage.name,
        rankPosition: rank,
        startDate: reads.workPackage.startDate,
        personIds,
        inputHash: chain.kind === 'scheduled' ? scheduleInputHash(chain.input) : null,
        incomingBasis:
          chain.kind === 'scheduled' ? incomingCalendarHash(chain.input.elsewhere) : null,
        settings: {
          optimizationEnabled: reads.workPackage.optimizationEnabled,
          scheduleEngine: reads.workPackage.scheduleEngine,
          scheduleObjective: reads.workPackage.scheduleObjective,
        },
        outcome,
      };
    }),
  );
  lifetime.assertOpen();
  return {
    observation: { mode, organizationId, workPackages: captured },
    // Proof: replacing this projection with null loses successor/tail events in mounted shared predecessor completion.
    dependency,
    localFacts,
  };
}

/**
 * Captures external components and shared-person bridges on the borrowed writer.
 * Rank facts use each component's relative order, so unrelated moves and physical
 * position respacing do not invalidate it. Every member requires rank evidence.
 */
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
      edge.predecessorWorkPackageId,
      edge.predecessorWorkItemId,
      edge.predecessorScope,
      edge.predecessorStepId,
      edge.successorWorkPackageId,
      edge.successorWorkItemId,
      edge.successorScope,
      edge.successorStepId,
      edge.type,
    ]),
    predecessorWorkPackageId: edge.predecessorWorkPackageId,
    successorWorkPackageId: edge.successorWorkPackageId,
  }));
  const ownership = db
    .select({ workPackageId: workPackageOrganization.resourceId })
    .from(workPackageOrganization)
    .where(eq(workPackageOrganization.organizationId, organizationId))
    .all();
  // Proof: retaining only incident IDs lost both event rows in `invalidates surviving workPackages disconnected by relationship removal`.
  const workPackages = new Map(
    ownership.map(({ workPackageId }) => [workPackageId, 'not_incident']),
  );
  const members = new Set<string>();
  const components: ReadonlySet<string>[] = [];
  for (const edge of connections)
    for (const endpoint of [edge.predecessorWorkPackageId, edge.successorWorkPackageId]) {
      if (members.has(endpoint)) continue;
      // Proof: forcing isolated discovery makes the alternating shared capture witness retain ordinary work packages [a1, a4] instead of [].
      const topology = discoverConnectedTopologyIn(db, endpoint, mode, lifetime);
      components.push(topology.workPackages);
      for (const workPackageId of topology.workPackages) members.add(workPackageId);
    }
  const ordinals = new Map<string, number>();
  if (members.size > 0) {
    const order = await new WorkPackageRankRepository(db, OPEN).orderIn(organizationId);
    // Proof: removing this check read one dependency member after rank evidence expired.
    lifetime.assertOpen();
    for (const component of components)
      // Proof: using global rank instead made the disconnected component change
      // during an unrelated move in the component-relative rank DB witness.
      order
        .filter(({ workPackageId }) => component.has(workPackageId))
        .forEach(({ workPackageId }, index) => {
          ordinals.set(workPackageId, index);
        });
  }
  const people = new Map<string, readonly string[]>();
  for (const workPackageId of members) {
    const header = await new WorkPackageRepository(db, OPEN).findInOrganization(
      workPackageId,
      organizationId,
    );
    lifetime.assertOpen();
    const captured = await readConnectedPlanInputIn(
      db,
      workPackageId,
      { kind: 'scoped', scope: { organizationId } },
      lifetime,
      options.captureRead,
    );
    lifetime.assertOpen();
    // Proof: removing this refusal changed the missing-endpoint negative from the named invariant to a property-access TypeError; the unreadable seam separately throws unchanged.
    if (captured === null || header === null)
      throw new Error('dependency fan-out endpoint is unreadable');
    const ordinal = ordinals.get(workPackageId);
    // Proof: omitting this refusal made the omitted authoritative-order member
    // DB negative resolve successfully instead of rejecting corrupt evidence.
    if (ordinal === undefined) throw new Error('dependency fan-out member absent from rank order');
    const attempts = await new StepNodeAttemptRepository(db, OPEN).listByWorkPackage(workPackageId);
    // Proof: expiring the borrowed read during this await must refuse the fanout
    // rather than fingerprinting rows from a closed snapshot.
    lifetime.assertOpen();
    people.set(workPackageId, [...new Set(captured.assignments.map(({ personId }) => personId))]);
    workPackages.set(
      workPackageId,
      JSON.stringify([
        scheduleInputHash(scheduleInputOfCaptured(captured)),
        captured.workPackage.name,
        // Proof: omitting ordinal made isolated/shared staged rank reversal and
        // both mounted rank reversal witnesses retain zero dependency events.
        ordinal,
        // Proof: omitting abbreviation made the mounted abbreviation-only PATCH retain one event instead of two.
        header.abbreviation,
        captured.workPackage.startDate,
        captured.workPackage.optimizationEnabled,
        captured.workPackage.scheduleEngine,
        captured.workPackage.scheduleObjective,
        // Proof: substituting [] lost the real borrowed-writer remote-completion event in `records remote completion without shared people`.
        captured.progress,
        // Proof: substituting [] left zero B/C events after the mounted A
        // startAttempt, while the SS successor became startable.
        attempts,
        captured.actuals,
        captured.stepBlockages,
        captured.stepParallels,
        captured.measures,
        // Proof: omitting hold leaves mounted blocked/clear B/C reads changed
        // without their elsewhere_changed events in both capacity modes.
        captured.workItems.map((row) => [
          row.id,
          row.name,
          row.position,
          row.frozenNumber,
          row.hold,
        ]),
        // Proof: removing code loses successor label events in both staged shared component witnesses.
        captured.steps.map((step) => [step.id, step.name, step.code, step.position]),
      ]),
    );
  }
  // Proof: omitting person bridges loses downstream/tail events in the mounted shared-person label writer.
  if (mode === 'shared')
    for (const [workPackageId, personIds] of people)
      for (const [neighborId, neighborPeople] of people)
        if (workPackageId < neighborId)
          for (const personId of personIds)
            if (neighborPeople.includes(personId))
              connections.push({
                key: JSON.stringify(['person', personId, workPackageId, neighborId]),
                predecessorWorkPackageId: workPackageId,
                successorWorkPackageId: neighborId,
              });
  return { organizationId, workPackages, connections };
}
