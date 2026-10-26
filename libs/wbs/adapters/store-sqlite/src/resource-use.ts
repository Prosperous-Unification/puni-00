import { resourceUse as useSchema, resourceUseEvent as eventSchema } from '@wbs/contracts';
import {
  mayEditProjectWithin,
  type ResourceUseActor,
  type ResourceUseAnswer,
  type ResourceUsePage,
  type ResourceUses,
} from '@wbs/core';
import {
  type ResourceUse,
  type ResourceUseEventDraft,
  type ResourceUseRegistration,
  transitionResourceUse,
} from '@wbs/domain';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { currentMembershipAccess } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { resourceCleanupRequestRecord } from './schema';
import { resourceUseEventRecord, resourceUseRecord } from './schema';

type Reader = Pick<SQLiteBunDatabase, 'get' | 'all' | 'select' | 'insert' | 'update'>;
const refused = (reason: 'not_found' | 'forbidden' | 'conflict' | 'invalid_body') =>
  ({ ok: false, reason }) as const;
function fingerprint(
  actor: ResourceUseActor,
  body: ResourceUseRegistration | ResourceUseEventDraft,
): string {
  return JSON.stringify([
    actor.fingerprint,
    Object.entries(body).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
/** Rechecks membership and project ownership inside the same write transaction or coordinated read. */
export function admitResourceUseProject(
  tx: Reader,
  projectId: string,
  actor: ResourceUseActor,
  write: boolean,
  orphan: boolean,
): { name: string; organizationId: string | null } | 'not_found' | 'forbidden' {
  let access = actor.access;
  const active = readOrganizationActivation(tx) === 'activated';
  if (access.kind === 'legacy') {
    if (active) return 'forbidden';
  } else {
    if (!active) return 'forbidden';
    const member = currentMembershipAccess(tx, access.scope.organizationId, access.scope.userId);
    if (!member.ok) return 'forbidden';
    if (member.access.kind !== 'scoped')
      throw new Error('membership recheck returned legacy access');
    access = {
      ...member.access,
      scope: {
        ...member.access.scope,
        ...(access.scope.delegated ? { delegated: true as const } : {}),
      },
    };
  }
  const project = tx.get<
    { name: string; ownerId: string; restricted: number; organizationId: string | null } | undefined
  >(sql`
    SELECT p.name,p.owner_id AS ownerId,p.restricted,o.organization_id AS organizationId
    FROM project p LEFT JOIN project_organization o ON o.resource_id=p.id WHERE p.id=${projectId}`);
  if (project === undefined) {
    if (
      !orphan ||
      access.kind !== 'scoped' ||
      access.scope.delegated ||
      !['admin', 'super_admin'].includes(access.scope.role)
    )
      return 'not_found';
    const prior = tx
      .select()
      .from(resourceUseRecord)
      .where(
        and(
          eq(resourceUseRecord.projectId, projectId),
          eq(resourceUseRecord.organizationId, access.scope.organizationId),
        ),
      )
      .limit(1)
      .get();
    if (prior === undefined) return 'not_found';
    const snapshot = useSchema.assert(prior.snapshot);
    return { name: snapshot.projectName, organizationId: access.scope.organizationId };
  }
  // Proof: disabling this tenant comparison exposed a foreign project in the composed guards test (2026-10-25).
  if (access.kind === 'scoped' && project.organizationId !== access.scope.organizationId)
    return 'not_found';
  // Proof: disabling mayEditProjectWithin let a viewer write in the composed guards test (2026-10-25).
  if (
    write &&
    !mayEditProjectWithin({ ...project, restricted: project.restricted !== 0 }, actor.id, access)
  )
    return 'forbidden';
  return { name: project.name, organizationId: project.organizationId };
}
export function personIn(
  tx: Reader,
  id: string,
  organizationId: string | null,
): { name: string } | undefined {
  return organizationId === null
    ? tx.get(sql`SELECT name FROM person WHERE id=${id}`)
    : tx.get(
        sql`SELECT o.name FROM person p JOIN person_organization o ON o.resource_id=p.id WHERE p.id=${id} AND o.organization_id=${organizationId}`,
      );
}
/** Captures a readable reporter, never resolving mutable names on a historical read. */
export function actorNameIn(
  tx: Reader,
  actorId: string,
  personId: string | null,
  organizationId: string | null,
): string {
  const actor =
    personId === null
      ? tx.get<{ name: string } | undefined>(
          sql`SELECT username AS name FROM users WHERE id=${actorId}`,
        )
      : personIn(tx, personId, organizationId);
  if (actor === undefined) throw new Error('admitted resource-use reporter is absent');
  return actor.name;
}
/** Persists an event and its projection atomically; callers already hold their transaction. */
export function appendResourceUseIn(
  tx: Reader,
  projectId: string,
  use: ResourceUse,
  draft: ResourceUseEventDraft,
  actorId: string,
  at: number,
  identity: string,
  actorPersonId: string | null = null,
): ResourceUseAnswer<ResourceUse> {
  let changed: ResourceUse | 'conflict' | 'invalid_body';
  if (use.source === 'runtime') {
    if (draft.kind !== 'cleanup_requested') return refused('forbidden');
    if (
      use.state === 'release_verified' ||
      use.revision !== draft.expectedRevision ||
      use.pendingCleanupRequest
    )
      return refused('conflict');
    if (!draft.reason.trim()) return refused('invalid_body');
    if (
      use.runtimeId === undefined ||
      use.runtimeRevision === undefined ||
      use.incarnation === undefined
    )
      throw new Error('runtime use lacks authority identity');
    tx.insert(resourceCleanupRequestRecord)
      .values({
        authorityId: use.runtimeId,
        useId: use.id,
        incarnation: use.incarnation,
        expectedRevision: use.runtimeRevision,
        reason: draft.reason,
        at,
      })
      .run();
    changed = {
      ...use,
      revision: use.revision + 1,
      updatedAt: at,
      updatedBy: actorId,
      pendingCleanupRequest: true,
    };
  } else changed = transitionResourceUse(use, draft, actorId, at);
  if (typeof changed === 'string') return refused(changed);
  const event = {
    id: draft.eventId,
    useId: use.id,
    revision: changed.revision,
    kind: draft.kind,
    source: 'reported' as const,
    actorId,
    actorPersonId,
    actorName: actorNameIn(tx, actorId, actorPersonId, use.organizationId),
    at,
    reason: draft.reason,
    evidence: draft.evidence ?? null,
    ownerPersonId: draft.ownerPersonId ?? null,
    reviewAt: draft.reviewAt ?? null,
  };
  tx.insert(resourceUseEventRecord)
    .values({
      id: event.id,
      useId: use.id,
      projectId,
      revision: event.revision,
      snapshot: event,
      fingerprint: identity,
      response: changed,
    })
    .run();
  tx.update(resourceUseRecord)
    .set({ state: changed.state, revision: changed.revision, snapshot: changed })
    .where(eq(resourceUseRecord.id, use.id))
    .run();
  return { ok: true, value: changed };
}
/** Registers inside an admitted transaction; only the separately authorized runtime adapter supplies runtime identity. */
export function registerResourceUseIn(
  tx: Reader,
  projectId: string,
  actor: ResourceUseActor,
  draft: ResourceUseRegistration,
  at: number,
  runtime?: {
    id: string;
    authorityId: string;
    incarnation: string;
    eventId: string;
    providerId: string;
    providerName: string;
    reason: string;
    observedAt: number;
    admissionFingerprint?: string;
  },
): ResourceUseAnswer<ResourceUse> {
  const project = admitResourceUseProject(tx, projectId, actor, true, false);
  if (typeof project === 'string') return refused(project);
  const identity = fingerprint(actor, draft);
  const prior = tx
    .select()
    .from(resourceUseRecord)
    .where(
      and(
        eq(resourceUseRecord.projectId, projectId),
        eq(resourceUseRecord.requestId, draft.requestId),
      ),
    )
    .get();
  if (prior !== undefined)
    return prior.requestFingerprint === identity
      ? { ok: true, value: useSchema.assert(prior.registrationResponse) }
      : refused('conflict');
  // Proof: removing the pinned-person check let a machine register another in-scope person (2026-10-25).
  if (
    runtime === undefined &&
    actor.personId !== null &&
    actor.personId !== draft.responsiblePersonId
  )
    return refused('forbidden');
  if (
    (draft.stepId === undefined) !== (draft.attemptNumber === undefined) ||
    !draft.agentRun.trim() ||
    !draft.locator.trim()
  )
    return refused('invalid_body');
  const owner = personIn(tx, draft.responsiblePersonId, project.organizationId);
  const work = tx.get<{ name: string } | undefined>(
    sql`SELECT name FROM work_item WHERE id=${draft.workItemId} AND project_id=${projectId}`,
  );
  const resource = tx.get<
    | {
        name: string;
        unitLabel: string;
        providerId: string | null;
        providerName: string | null;
      }
    | undefined
  >(sql`
        SELECT coalesce(o.name,r.name) AS name,r.unit_label AS unitLabel,r.provider_id AS providerId,p.name AS providerName
        FROM resource r LEFT JOIN resource_organization o ON o.resource_id=r.id LEFT JOIN compute_provider p ON p.id=r.provider_id
        WHERE r.id=${draft.resourceId} AND (${project.organizationId} IS NULL OR o.organization_id=${project.organizationId})`);
  if (owner === undefined || work === undefined || resource === undefined)
    return refused('not_found');
  if (draft.stepId !== undefined) {
    const attempt = tx.get<
      { endedAt: number | null; executorPersonId: string | null } | undefined
    >(sql`SELECT a.ended_at AS endedAt,a.executor_person_id AS executorPersonId FROM step_node_attempt a JOIN step s ON s.id=a.step_id
          WHERE a.work_item_id=${draft.workItemId} AND a.step_id=${draft.stepId} AND a.attempt_number=${draft.attemptNumber ?? null} AND s.project_id=${projectId}`);
    if (attempt === undefined) return refused('not_found');
    if (runtime === undefined && attempt.endedAt !== null) return refused('conflict');
    if (attempt.executorPersonId !== draft.responsiblePersonId) return refused('invalid_body');
  }
  const use: ResourceUse = {
    id: runtime?.id ?? crypto.randomUUID(),
    source: 'reported',
    organizationId: project.organizationId,
    projectId,
    projectName: project.name,
    resourceId: draft.resourceId,
    resourceName: resource.name,
    unitLabel: resource.unitLabel,
    providerId: runtime?.providerId ?? resource.providerId,
    providerName: runtime?.providerName ?? resource.providerName,
    workItemId: draft.workItemId,
    workItemName: work.name,
    stepId: draft.stepId ?? null,
    attemptNumber: draft.attemptNumber ?? null,
    agentRun: draft.agentRun,
    responsiblePersonId: draft.responsiblePersonId,
    responsiblePersonName: owner.name,
    locator: draft.locator,
    units: draft.units,
    state: 'active',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    createdBy: actor.id,
    updatedBy: actor.id,
    retention: null,
    ...(runtime === undefined
      ? {}
      : {
          source: 'runtime' as const,
          runtimeId: runtime.authorityId,
          runtimeRevision: runtime.admissionFingerprint === undefined ? 1 : 0,
          incarnation: runtime.incarnation,
          pendingCleanupRequest: false,
          reclaimedBytes: null,
        }),
  };
  tx.insert(resourceUseRecord)
    .values({
      ...use,
      snapshot: use,
      requestId: draft.requestId,
      requestFingerprint: identity,
      registrationResponse: use,
    })
    .run();
  const event = {
    id: runtime?.eventId ?? crypto.randomUUID(),
    useId: use.id,
    revision: 1,
    kind: 'registered' as const,
    source: use.source,
    actorId: actor.id,
    actorPersonId: actor.personId,
    actorName: actorNameIn(tx, actor.id, actor.personId, project.organizationId),
    at,
    reason: runtime?.reason ?? 'Resource use reported',
    ...(runtime === undefined ? {} : { observedAt: runtime.observedAt }),
    evidence: null,
    ownerPersonId: null,
    reviewAt: null,
  };
  tx.insert(resourceUseEventRecord)
    .values({
      id: event.id,
      useId: use.id,
      projectId,
      revision: 1,
      snapshot: event,
      fingerprint: runtime?.admissionFingerprint ?? identity,
      response: use,
    })
    .run();
  return { ok: true, value: use };
}
/** SQLite reported tracking; no operation changes claims, occupancy, files or provider capacity. */
export class SqliteResourceUses implements ResourceUses {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}
  register(
    projectId: string,
    actor: ResourceUseActor,
    draft: ResourceUseRegistration,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceUse>> {
    return writeImmediately(this.db, this.gate, (tx) =>
      registerResourceUseIn(tx, projectId, actor, draft, at),
    );
  }
  append(
    projectId: string,
    useId: string,
    actor: ResourceUseActor,
    draft: ResourceUseEventDraft,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceUse>> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const project = admitResourceUseProject(tx, projectId, actor, true, true);
      if (typeof project === 'string') return refused(project);
      const stored = tx
        .select()
        .from(resourceUseRecord)
        .where(and(eq(resourceUseRecord.id, useId), eq(resourceUseRecord.projectId, projectId)))
        .get();
      if (stored?.organizationId !== project.organizationId) return refused('not_found');
      const identity = fingerprint(actor, draft);
      const prior = tx
        .select()
        .from(resourceUseEventRecord)
        .where(
          and(
            eq(resourceUseEventRecord.projectId, projectId),
            eq(resourceUseEventRecord.id, draft.eventId),
          ),
        )
        .get();
      if (prior !== undefined)
        return prior.useId === useId && prior.fingerprint === identity
          ? { ok: true, value: useSchema.assert(prior.response) }
          : refused('conflict');
      if (
        draft.kind === 'retained' &&
        draft.ownerPersonId !== undefined &&
        personIn(tx, draft.ownerPersonId, project.organizationId) === undefined
      )
        return refused('not_found');
      return appendResourceUseIn(
        tx,
        projectId,
        useSchema.assert(stored.snapshot),
        draft,
        actor.id,
        at,
        identity,
        actor.personId,
      );
    });
  }
  list(projectId: string, actor: ResourceUseActor, page: ResourceUsePage) {
    return this.gate.enter(async () => {
      await Promise.resolve();
      const project = admitResourceUseProject(this.db, projectId, actor, false, true);
      if (typeof project === 'string') return refused(project);
      const rows = this.db
        .select()
        .from(resourceUseRecord)
        .where(
          and(
            eq(resourceUseRecord.projectId, projectId),
            project.organizationId === null
              ? sql`${resourceUseRecord.organizationId} IS NULL`
              : eq(resourceUseRecord.organizationId, project.organizationId),
            page.workItemId === undefined
              ? undefined
              : eq(resourceUseRecord.workItemId, page.workItemId),
            page.state === undefined ? undefined : eq(resourceUseRecord.state, page.state),
            page.cursor === undefined ? undefined : gt(resourceUseRecord.id, page.cursor),
          ),
        )
        .orderBy(asc(resourceUseRecord.id))
        .limit(page.limit + 1)
        .all();
      const visible = rows.slice(0, page.limit).map((row) => useSchema.assert(row.snapshot));
      return {
        ok: true as const,
        value: {
          uses: visible,
          nextCursor: rows.length > page.limit ? (visible.at(-1)?.id ?? null) : null,
        },
      };
    });
  }
  history(projectId: string, useId: string, actor: ResourceUseActor, page: ResourceUsePage) {
    return this.gate.enter(async () => {
      await Promise.resolve();
      const project = admitResourceUseProject(this.db, projectId, actor, false, true);
      if (typeof project === 'string') return refused(project);
      const use = this.db
        .select()
        .from(resourceUseRecord)
        .where(and(eq(resourceUseRecord.projectId, projectId), eq(resourceUseRecord.id, useId)))
        .get();
      if (use?.organizationId !== project.organizationId) return refused('not_found');
      if (page.cursor !== undefined && !/^\d+$/.test(page.cursor)) return refused('invalid_body');
      const rows = this.db
        .select()
        .from(resourceUseEventRecord)
        .where(
          and(
            eq(resourceUseEventRecord.useId, useId),
            gt(resourceUseEventRecord.revision, Number(page.cursor ?? 0)),
          ),
        )
        .orderBy(asc(resourceUseEventRecord.revision))
        .limit(page.limit + 1)
        .all();
      const visible = rows.slice(0, page.limit).map((row) => eventSchema.assert(row.snapshot));
      return {
        ok: true as const,
        value: {
          events: visible,
          nextCursor: rows.length > page.limit ? String(visible.at(-1)?.revision) : null,
        },
      };
    });
  }
}
/** A committed claim removal signals only active uses matching its exact person/run; null run is never a wildcard. */
export function signalClaimResourceUses(
  tx: ImmediateTransaction,
  claim: { workItemId: string; personId: string; runId: string | null; stepId: string | null },
  at: number,
  actorId: string,
): void {
  if (claim.runId === null) return;
  const rows = tx
    .select()
    .from(resourceUseRecord)
    .where(
      and(
        eq(resourceUseRecord.workItemId, claim.workItemId),
        eq(resourceUseRecord.responsiblePersonId, claim.personId),
        // Proof: dropping run identity changed another run in the last-matching-claim test (2026-10-25).
        eq(resourceUseRecord.agentRun, claim.runId),
        eq(resourceUseRecord.state, 'active'),
        claim.stepId === null
          ? undefined
          : or(isNull(resourceUseRecord.stepId), eq(resourceUseRecord.stepId, claim.stepId)),
      ),
    )
    .all();
  for (const row of rows) {
    const use = useSchema.assert(row.snapshot);
    if (use.pendingCleanupRequest) continue;
    const remaining =
      tx.get(sql`SELECT id FROM claim WHERE work_item_id=${use.workItemId} AND person_id=${use.responsiblePersonId} AND run_id=${use.agentRun}
      AND (${use.stepId} IS NULL OR step_id IS NULL OR step_id=${use.stepId}) LIMIT 1`);
    // Proof: removing this check signaled cleanup while another matching claim remained (2026-10-25).
    if (remaining !== undefined) continue;
    const draft: ResourceUseEventDraft = {
      eventId: crypto.randomUUID(),
      kind: 'cleanup_requested',
      expectedRevision: use.revision,
      reason: 'Claim released; cleanup required',
    };
    const changed = appendResourceUseIn(
      tx,
      use.projectId,
      use,
      draft,
      actorId,
      at,
      JSON.stringify(['claim-release', actorId, draft]),
    );
    if (!changed.ok) throw new Error('active use refused claim cleanup signal');
  }
}
/** An ended attempt signals only its exact immutable attempt identity; another run/attempt stays untouched. */
export function signalAttemptResourceUses(
  tx: ImmediateTransaction,
  attempt: {
    workItemId: string;
    stepId: string;
    attemptNumber: number;
    executorPersonId: string | null;
  },
  at: number,
  actorId: string,
): void {
  if (attempt.executorPersonId === null) return;
  const rows = tx
    .select()
    .from(resourceUseRecord)
    .where(
      and(
        eq(resourceUseRecord.workItemId, attempt.workItemId),
        // Proof: dropping step identity signaled another attempt in the exact-ended-attempt test (2026-10-25).
        eq(resourceUseRecord.stepId, attempt.stepId),
        eq(resourceUseRecord.attemptNumber, attempt.attemptNumber),
        eq(resourceUseRecord.responsiblePersonId, attempt.executorPersonId),
        eq(resourceUseRecord.state, 'active'),
      ),
    )
    .all();
  for (const row of rows) {
    const use = useSchema.assert(row.snapshot);
    if (use.pendingCleanupRequest) continue;
    const draft: ResourceUseEventDraft = {
      eventId: crypto.randomUUID(),
      kind: 'cleanup_requested',
      expectedRevision: use.revision,
      reason: 'Attempt ended; cleanup required',
    };
    const changed = appendResourceUseIn(
      tx,
      use.projectId,
      use,
      draft,
      actorId,
      at,
      JSON.stringify(['attempt-end', actorId, draft]),
    );
    if (!changed.ok) throw new Error('active use refused attempt cleanup signal');
  }
}
