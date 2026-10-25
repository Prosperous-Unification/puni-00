import { type ResourceAuthority, type ResourceRuntimeEvent, resourceUse } from '@wbs/contracts';
import type { ResourceRuntime, ResourceRuntimeActor, ResourceUseAnswer } from '@wbs/core';
import type { ResourceUse, ResourceUseEvent } from '@wbs/domain';
import { and, asc, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { currentMembershipAccess } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import {
  actorNameIn,
  admitResourceUseProject,
  appendResourceUseIn,
  personIn,
  registerResourceUseIn,
} from './resource-use';
import {
  resourceAuthorityRecord,
  resourceCleanupRequestRecord,
  resourceRuntimeEventRecord,
  resourceRuntimeUseRecord,
  resourceUseEventRecord,
  resourceUseRecord,
} from './schema';

type Reader = Pick<SQLiteBunDatabase, 'select' | 'get' | 'all'>;
const refused = (reason: 'not_found' | 'forbidden' | 'conflict' | 'invalid_body') =>
  ({ ok: false, reason }) as const;
function organizationOf(tx: Reader, actor: ResourceRuntimeActor, admin: boolean): string {
  if (actor.access.kind !== 'scoped' || readOrganizationActivation(tx) !== 'activated')
    return 'forbidden';
  const member = currentMembershipAccess(tx, actor.access.scope.organizationId, actor.id);
  if (!member.ok || member.access.kind !== 'scoped') return 'forbidden';
  // Proof: removing the administrator-role predicate let a viewer bind authority in the composed binding test (2026-10-25).
  if (
    admin &&
    (actor.access.scope.delegated ||
      actor.credentialId !== null ||
      !['admin', 'super_admin'].includes(member.access.scope.role))
  )
    return 'forbidden';
  return actor.access.scope.organizationId;
}
function authorityIn(
  tx: Reader,
  id: string,
  actor: ResourceRuntimeActor,
  admin: boolean,
): ResourceAuthority | 'not_found' | 'forbidden' {
  const organizationId = organizationOf(tx, actor, admin);
  if (organizationId === 'forbidden') return organizationId;
  const authority = tx
    .select()
    .from(resourceAuthorityRecord)
    .where(
      and(
        eq(resourceAuthorityRecord.authorityId, id),
        eq(resourceAuthorityRecord.organizationId, organizationId),
      ),
    )
    .get();
  if (authority === undefined) return 'not_found';
  if (!admin) {
    // Proof: removing exact credential identity accepted a second key for the same machine person (2026-10-25).
    if (actor.credentialId !== authority.credentialId || actor.personId === null)
      return 'forbidden';
    // Proof: removing revoked_at accepted an already-admitted grant after revocation in the composed grant test (2026-10-25).
    const live = tx.get<
      { id: string } | undefined
    >(sql`SELECT c.id FROM machine_credential c JOIN compute_provider p ON p.id=${authority.providerId}
      JOIN person_organization o ON o.resource_id=c.person_id AND o.organization_id=c.organization_id
      WHERE c.id=${authority.credentialId} AND c.organization_id=${organizationId} AND p.organization_id=${organizationId}
      AND c.person_id=${actor.personId} AND c.revoked_at IS NULL`);
    if (live === undefined) return 'forbidden';
  }
  return {
    authorityId: authority.authorityId,
    organizationId: authority.organizationId,
    providerId: authority.providerId,
    credentialId: authority.credentialId,
    epoch: authority.epoch,
    acceptedSequence: authority.acceptedSequence,
  };
}
/** Privileged attestation is authorized in the same transaction as sequence, history, projection and acknowledgment. */
export class SqliteResourceRuntime implements ResourceRuntime {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}
  bind(
    authorityId: string,
    actor: ResourceRuntimeActor,
    binding: { providerId: string; credentialId: string; epoch: string },
    at: number,
  ): Promise<ResourceUseAnswer<ResourceAuthority>> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const organizationId = organizationOf(tx, actor, true);
      if (organizationId === 'forbidden') return refused(organizationId);
      const known = tx
        .select()
        .from(resourceAuthorityRecord)
        .where(eq(resourceAuthorityRecord.authorityId, authorityId))
        .get();
      if (known !== undefined) {
        if (known.organizationId !== organizationId) return refused('not_found');
        if (
          known.providerId !== binding.providerId ||
          known.credentialId !== binding.credentialId ||
          known.epoch !== binding.epoch
        )
          return refused('conflict');
        return {
          ok: true,
          value: {
            authorityId,
            organizationId,
            ...binding,
            acceptedSequence: known.acceptedSequence,
          },
        };
      }
      const provider = tx.get<{ id: string } | undefined>(
        sql`SELECT id FROM compute_provider WHERE id=${binding.providerId} AND organization_id=${organizationId}`,
      );
      const credential = tx.get<
        { id: string } | undefined
      >(sql`SELECT c.id FROM machine_credential c JOIN person p ON p.id=c.person_id JOIN person_organization o ON o.resource_id=p.id
        WHERE c.id=${binding.credentialId} AND c.organization_id=${organizationId} AND o.organization_id=${organizationId} AND c.revoked_at IS NULL AND p.kind='agent'`);
      if (provider === undefined || credential === undefined) return refused('not_found');
      if (!binding.epoch.trim() || !authorityId.trim()) return refused('invalid_body');
      if (
        tx
          .select()
          .from(resourceAuthorityRecord)
          .where(
            and(
              eq(resourceAuthorityRecord.organizationId, organizationId),
              eq(resourceAuthorityRecord.providerId, binding.providerId),
            ),
          )
          .get() !== undefined
      )
        return refused('conflict');
      tx.insert(resourceAuthorityRecord)
        .values({
          authorityId,
          organizationId,
          ...binding,
          acceptedSequence: 0,
          createdAt: at,
          createdBy: actor.id,
        })
        .run();
      return { ok: true, value: { authorityId, organizationId, ...binding, acceptedSequence: 0 } };
    });
  }
  read(authorityId: string, actor: ResourceRuntimeActor) {
    return this.gate.enter(async () => {
      await Promise.resolve();
      const authority = authorityIn(this.db, authorityId, actor, true);
      return typeof authority === 'string'
        ? refused(authority)
        : { ok: true as const, value: authority };
    });
  }
  ingest(
    authorityId: string,
    actor: ResourceRuntimeActor,
    event: ResourceRuntimeEvent,
    at: number,
  ): Promise<ResourceUseAnswer<{ acceptedSequence: number; useId: string; revision: number }>> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const authority = authorityIn(tx, authorityId, actor, false);
      if (typeof authority === 'string') return refused(authority);
      const fingerprint = JSON.stringify(event);
      const prior = tx
        .select()
        .from(resourceRuntimeEventRecord)
        .where(
          and(
            eq(resourceRuntimeEventRecord.authorityId, authorityId),
            eq(resourceRuntimeEventRecord.eventId, event.eventId),
          ),
        )
        .get();
      if (prior !== undefined)
        return prior.fingerprint === fingerprint
          ? { ok: true, value: prior.response }
          : refused('conflict');
      // Proof: removing sequence adjacency accepted a gap in the composed runtime-credential test (2026-10-25).
      if (event.epoch !== authority.epoch || event.sequence !== authority.acceptedSequence + 1)
        return refused('conflict');
      if (!event.reason.trim() || event.observedAt > at + 300000) return refused('invalid_body');
      // Proof: removing evidence validation accepted an unproved release in the composed cleanup-outbox test (2026-10-25).
      if (
        event.kind === 'release_verified' &&
        (event.evidence === undefined ||
          !/^[a-f0-9]{64}$/.test(event.evidence.digest) ||
          !event.evidence.locator.trim())
      )
        return refused('invalid_body');
      if (
        event.kind === 'retained' &&
        (event.retention === undefined || event.retention.reviewAt <= at)
      )
        return refused('invalid_body');
      if (
        event.kind === 'retained' &&
        event.retention !== undefined &&
        personIn(tx, event.retention.ownerPersonId, authority.organizationId) === undefined
      )
        return refused('not_found');
      const runtime = tx
        .select()
        .from(resourceRuntimeUseRecord)
        .where(eq(resourceRuntimeUseRecord.useId, event.useId))
        .get();
      const stored = tx
        .select()
        .from(resourceUseRecord)
        .where(eq(resourceUseRecord.id, event.useId))
        .get();
      let use: ResourceUse;
      if (
        tx
          .select()
          .from(resourceUseEventRecord)
          .where(
            and(
              eq(resourceUseEventRecord.projectId, event.use.projectId),
              eq(resourceUseEventRecord.id, event.eventId),
            ),
          )
          .get() !== undefined
      )
        return refused('conflict');
      if (event.kind === 'registered') {
        if (
          runtime !== undefined ||
          stored !== undefined ||
          event.revision !== 1 ||
          event.requestId !== undefined
        )
          return refused('conflict');
        const resourceProvider = tx.get<{ providerId: string | null } | undefined>(
          sql`SELECT provider_id AS providerId FROM resource WHERE id=${event.use.resourceId}`,
        );
        if (
          resourceProvider !== undefined &&
          resourceProvider.providerId !== null &&
          resourceProvider.providerId !== authority.providerId
        )
          return refused('conflict');
        const providerName = tx.get<{ name: string } | undefined>(
          sql`SELECT name FROM compute_provider WHERE id=${authority.providerId}`,
        );
        if (providerName === undefined) return refused('not_found');
        const registered = registerResourceUseIn(
          tx,
          event.use.projectId,
          actor,
          {
            requestId: `runtime:${authorityId}:${event.eventId}`,
            resourceId: event.use.resourceId,
            workItemId: event.use.workItemId,
            stepId: event.use.stepId,
            attemptNumber: event.use.attemptNumber,
            agentRun: event.use.agentRun,
            responsiblePersonId: event.use.responsiblePersonId,
            locator: event.use.locator,
            units: event.use.units,
          },
          at,
          {
            id: event.useId,
            authorityId,
            incarnation: event.incarnation,
            eventId: event.eventId,
            providerId: authority.providerId,
            providerName: providerName.name,
            reason: event.reason,
            observedAt: event.observedAt,
          },
        );
        if (!registered.ok) return registered;
        use = registered.value;
        tx.insert(resourceRuntimeUseRecord)
          .values({
            useId: use.id,
            authorityId,
            incarnation: event.incarnation,
            revision: event.revision,
            declaration: JSON.stringify(event.use),
          })
          .run();
      } else {
        // Proof: removing declaration equality allowed runtime identity to drift in the composed authority test (2026-10-25).
        if (
          runtime === undefined ||
          stored === undefined ||
          runtime.authorityId !== authorityId ||
          stored.organizationId !== authority.organizationId ||
          runtime.incarnation !== event.incarnation ||
          runtime.revision + 1 !== event.revision ||
          runtime.declaration !== JSON.stringify(event.use)
        )
          return refused('conflict');
        const project = admitResourceUseProject(tx, stored.projectId, actor, true, true);
        // Runtime authority retains responsibility for deleted projects; its immutable organization binding owns those orphans.
        if (
          typeof project === 'string' &&
          (project !== 'not_found' ||
            tx.get<{ id: string } | undefined>(
              sql`SELECT id FROM project WHERE id=${stored.projectId}`,
            ) !== undefined)
        )
          return refused(project);
        use = resourceUse.assert(stored.snapshot);
        const terminalAcknowledgment =
          use.state === 'release_verified' &&
          event.kind === 'release_verified' &&
          event.requestId !== undefined;
        // Proof: actual Dash blocked-then-release smoke returned 409 before admitting retry observations; repeated pending/blocked controller cases also failed (2026-10-25).
        const allowed =
          terminalAcknowledgment ||
          (event.kind === 'cleanup_pending'
            ? ['active', 'cleanup_pending', 'blocked', 'retained'].includes(use.state)
            : event.kind === 'retained'
              ? ['active', 'cleanup_pending', 'blocked'].includes(use.state)
              : ['cleanup_pending', 'blocked'].includes(use.state));
        if (!allowed || use.source !== 'runtime') return refused('conflict');
        // A request remains valid causal attribution after its first acknowledgment; later lifecycle events may reuse it.
        const acknowledgment =
          event.requestId === undefined
            ? undefined
            : tx
                .select()
                .from(resourceCleanupRequestRecord)
                .where(
                  and(
                    eq(resourceCleanupRequestRecord.requestId, event.requestId),
                    eq(resourceCleanupRequestRecord.authorityId, authorityId),
                    eq(resourceCleanupRequestRecord.useId, use.id),
                    eq(resourceCleanupRequestRecord.incarnation, event.incarnation),
                  ),
                )
                .get();
        if (
          event.requestId !== undefined &&
          (acknowledgment === undefined || acknowledgment.expectedRevision > runtime.revision)
        )
          return refused('conflict');
        if (terminalAcknowledgment) {
          const previous = tx
            .select()
            .from(resourceUseEventRecord)
            .where(eq(resourceUseEventRecord.useId, use.id))
            .orderBy(desc(resourceUseEventRecord.revision))
            .limit(1)
            .get();
          if (
            previous?.snapshot.kind !== 'release_verified' ||
            previous.snapshot.evidence !== event.evidence?.locator ||
            previous.snapshot.evidenceDigest !== event.evidence.digest
          )
            return refused('conflict');
        }
        // Pending status is derived from other unacknowledged requests, so a late request-1 event cannot erase request 2.
        const changed: ResourceUse = {
          ...use,
          state: event.kind,
          revision: use.revision + 1,
          runtimeRevision: event.revision,
          updatedAt: at,
          updatedBy: actor.id,
          pendingCleanupRequest:
            tx
              .select({ id: resourceCleanupRequestRecord.requestId })
              .from(resourceCleanupRequestRecord)
              .where(
                and(
                  eq(resourceCleanupRequestRecord.authorityId, authorityId),
                  eq(resourceCleanupRequestRecord.useId, use.id),
                  isNull(resourceCleanupRequestRecord.acknowledgedSequence),
                  event.requestId === undefined
                    ? undefined
                    : ne(resourceCleanupRequestRecord.requestId, event.requestId),
                ),
              )
              .limit(1)
              .get() !== undefined,
          retention:
            event.kind === 'retained' && event.retention !== undefined
              ? {
                  ownerPersonId: event.retention.ownerPersonId,
                  reviewAt: event.retention.reviewAt,
                  reason: event.reason,
                }
              : null,
          reclaimedBytes: null,
        };
        const history: ResourceUseEvent = {
          id: event.eventId,
          useId: use.id,
          revision: changed.revision,
          kind: event.kind,
          source: 'runtime',
          actorId: actor.id,
          actorPersonId: actor.personId,
          actorName: actorNameIn(tx, actor.id, actor.personId, authority.organizationId),
          at,
          observedAt: event.observedAt,
          ...(event.evidence === undefined ? {} : { evidenceDigest: event.evidence.digest }),
          reason: event.reason,
          evidence: event.evidence?.locator ?? null,
          ownerPersonId: event.retention?.ownerPersonId ?? null,
          reviewAt: event.retention?.reviewAt ?? null,
        };
        tx.insert(resourceUseEventRecord)
          .values({
            id: event.eventId,
            useId: use.id,
            projectId: use.projectId,
            revision: changed.revision,
            snapshot: history,
            fingerprint,
            response: changed,
          })
          .run();
        tx.update(resourceUseRecord)
          .set({ state: changed.state, revision: changed.revision, snapshot: changed })
          .where(eq(resourceUseRecord.id, use.id))
          .run();
        tx.update(resourceRuntimeUseRecord)
          .set({ revision: event.revision })
          .where(eq(resourceRuntimeUseRecord.useId, use.id))
          .run();
        if (event.requestId !== undefined)
          tx.update(resourceCleanupRequestRecord)
            .set({ acknowledgedSequence: event.sequence })
            .where(
              and(
                eq(resourceCleanupRequestRecord.requestId, event.requestId),
                isNull(resourceCleanupRequestRecord.acknowledgedSequence),
              ),
            )
            .run();
      }
      const response = {
        acceptedSequence: event.sequence,
        useId: event.useId,
        revision: event.revision,
      };
      tx.insert(resourceRuntimeEventRecord)
        .values({
          authorityId,
          eventId: event.eventId,
          sequence: event.sequence,
          fingerprint,
          response,
        })
        .run();
      tx.update(resourceAuthorityRecord)
        .set({ acceptedSequence: event.sequence })
        .where(eq(resourceAuthorityRecord.authorityId, authorityId))
        .run();
      if (event.kind === 'registered') queueEndedAttempt(tx, use, actor, at);
      return { ok: true, value: response };
    });
  }
  requests(authorityId: string, actor: ResourceRuntimeActor, after: number, limit: number) {
    return this.gate.enter(async () => {
      await Promise.resolve();
      const authority = authorityIn(this.db, authorityId, actor, false);
      if (typeof authority === 'string') return refused(authority);
      const rows = this.db
        .select()
        .from(resourceCleanupRequestRecord)
        .where(
          and(
            eq(resourceCleanupRequestRecord.authorityId, authorityId),
            gt(resourceCleanupRequestRecord.requestId, after),
            isNull(resourceCleanupRequestRecord.acknowledgedSequence),
          ),
        )
        .orderBy(asc(resourceCleanupRequestRecord.requestId))
        .limit(limit + 1)
        .all();
      const visible = rows
        .slice(0, limit)
        .map(({ requestId, useId, incarnation, expectedRevision, reason, at }) => ({
          requestId,
          useId,
          incarnation,
          expectedRevision,
          reason,
          at,
        }));
      return {
        ok: true as const,
        value: {
          requests: visible,
          nextCursor: rows.length > limit ? String(visible.at(-1)?.requestId) : null,
        },
      };
    });
  }
}
/** A delayed registration cannot miss an attempt-end signal that committed before its outbox arrived. */
function queueEndedAttempt(
  tx: ImmediateTransaction,
  use: ResourceUse,
  actor: ResourceRuntimeActor,
  at: number,
): void {
  if (use.stepId === null || use.attemptNumber === null) return;
  const ended = tx.get<{ endedAt: number | null } | undefined>(
    sql`SELECT ended_at AS endedAt FROM step_node_attempt WHERE work_item_id=${use.workItemId} AND step_id=${use.stepId} AND attempt_number=${use.attemptNumber}`,
  );
  if (ended?.endedAt == null) return;
  const queued = appendResourceUseIn(
    tx,
    use.projectId,
    use,
    {
      eventId: crypto.randomUUID(),
      expectedRevision: use.revision,
      kind: 'cleanup_requested',
      reason: 'Attempt already ended when runtime registration arrived',
    },
    actor.id,
    at,
    'late-runtime-registration',
    actor.personId,
  );
  if (!queued.ok) throw new Error('late runtime registration could not queue cleanup');
}
