import { readChain } from '@wbs/core';
import type {
  BeforeProjectUpdate,
  BeforeStepRemoval,
  CapturedFanout,
} from '@wbs/core/ports/fanout-capture-store';
import { scheduleInputOfCaptured } from '@wbs/core/service/saved-plan-schedule';
import { canEditProjectInOrganization, classifyProjectEdit } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';

import { type ChainSnapshotOptions, readChainSnapshotIn } from './chain-snapshot';
import type { Drizzle } from './db';
import { OPEN } from './gate';
import { validateStoredRole } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { incomingCalendarHash, scheduleInputHash } from './schedule-input-hash';
import { organizationMembership } from './schema';
import { readCapacityMode } from './shared-people-mode';

/** Rechecks current membership/project ownership without creating an audit or grant. */
export function authorizeProjectFanoutIn(db: Drizzle): BeforeProjectUpdate {
  return async (projectId, actorId, access) => {
    if (access.kind === 'legacy') return { ok: true };
    const organizationId = access.scope.organizationId;
    const project = await new ProjectRepository(db, OPEN).findInOrganization(
      projectId,
      organizationId,
    );
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
      role: validateStoredRole(membership.role, organizationId),
    });
    return edit === 'refused' ? { ok: false, reason: 'forbidden' } : { ok: true };
  };
}

/** Bare step removal has creator policy and never inherits a scoped recovery grant. */
export function authorizeStepFanoutIn(db: Drizzle): BeforeStepRemoval {
  return async (projectId, actorId, access) => {
    if (access.kind === 'legacy') return { ok: true };
    const organizationId = access.scope.organizationId;
    const project = await new ProjectRepository(db, OPEN).findInOrganization(
      projectId,
      organizationId,
    );
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
      role: validateStoredRole(membership.role, organizationId),
    });
    return admitted ? { ok: true } : { ok: false, reason: 'forbidden' };
  };
}

/** Reads staged writes on the borrowed transaction; it never owns or closes a connection. */
export async function readFanoutObservationIn(
  db: Drizzle,
  organizationId: string,
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
): Promise<CapturedFanout> {
  if (readOrganizationActivation(db) === 'pre_activation')
    return {
      observation: { mode: 'legacy', organizationId: null, projects: [] },
      localFacts: new Map(),
    };
  const mode = readCapacityMode(db, organizationId);
  if (mode === 'isolated')
    return {
      observation: { mode, organizationId, projects: [] },
      localFacts: new Map(),
    };
  const ranks = await new ProjectRankRepository(db, OPEN).orderIn(organizationId);
  const projects = new ProjectRepository(db, OPEN);
  const readable = await Promise.all(
    ranks.map(async ({ projectId }) => {
      const project = await projects.findInOrganization(projectId, organizationId);
      if (project === null) throw new Error('rank names an unreadable project');
      return project;
    }),
  );
  const snapshot = await readChainSnapshotIn(
    db,
    { kind: 'scoped', scope: { organizationId } },
    readable,
    '',
    // Proof: forcing live scheduler mode in this capture made the enabled
    // optimized fixture invoke its forbidden live admission callback.
    options,
  );
  const localFacts = new Map<string, string>();
  const captured = await Promise.all(
    ranks.map(async ({ projectId, rank }) => {
      const reads = await snapshot.capturePlan(projectId);
      const personIds = [...new Set(reads.assignments.map(({ personId }) => personId))].sort();
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
  return { observation: { mode, organizationId, projects: captured }, localFacts };
}
