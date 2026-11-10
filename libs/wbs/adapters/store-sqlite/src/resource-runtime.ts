import { createHash } from 'node:crypto';

import {
  hostJobRunRecordAbsence,
  hostJobRunRecordLocator,
  type ResourceAuthority,
  type ResourceRuntimeAdmission,
  type ResourceRuntimeAdmissionReceipt,
  type ResourceRuntimeEvent,
  resourceRuntimeEvent,
  type ResourceRuntimeHostJobUse,
  resourceUse,
} from '@wbs/contracts';
import {
  assertResourceRuntimeActor,
  authorize,
  type ResourceRuntime,
  type ResourceRuntimeActor,
  type ResourceUseAnswer,
  type ResourceUseDenial,
  retainResourceRuntimeActor,
} from '@wbs/core';
import type { ResourceUse, ResourceUseEvent } from '@wbs/domain';
import { and, asc, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { AccessDecisionRepository } from './access-decisions';
import type { Gate } from './gate';
import { currentMembershipAccess } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import {
  actorNameIn,
  admitResourceUseProject,
  appendResourceUseIn,
  personIn,
  readResourceUseCredentialRefusal,
  registerResourceUseIn,
} from './resource-use';
import {
  resourceAuthorityRecord,
  resourceCleanupRequestRecord,
  resourceHostJobRecord,
  resourceRuntimeEventRecord,
  resourceRuntimeUseRecord,
  resourceUseEventRecord,
  resourceUseRecord,
} from './schema';
import { runSecurityTransaction } from './security-transaction';

type Reader = Pick<SQLiteBunDatabase, 'select' | 'get' | 'all'>;
type RuntimeWriter = Pick<SQLiteBunDatabase, 'select' | 'get' | 'all' | 'insert' | 'update'>;
const refused = (reason: 'not_found' | 'forbidden' | 'conflict' | 'invalid_body') =>
  ({ ok: false, reason }) as const;
async function organizationOf(
  tx: Reader,
  actor: ResourceRuntimeActor,
  admin: boolean,
): Promise<{ organizationId: string } | ResourceUseDenial> {
  if (actor.access.kind !== 'scoped' || readOrganizationActivation(tx) !== 'activated')
    return refused('forbidden');
  const organizationId = actor.access.scope.organizationId;
  const member = currentMembershipAccess(tx, organizationId, actor.principal.id);
  // Proof: runtime-current-member.
  // The recorded fault broke `rechecks current membership inside resource requests owner after queueing`; restored GREEN.
  if (!member.ok) return refused('forbidden');
  // Proof: runtime-current-credential.
  // The recorded fault broke `rechecks queued runtime admission replay current source mcp_consent before effects`; restored GREEN.
  if (readResourceUseCredentialRefusal(tx, actor) !== null) return refused('forbidden');
  // Proof: infrastructure-no-grant-dependency.
  // The injected forbidden dependency broke `keeps runtime admission replay independent of grants and mutable planning references`; restored GREEN.
  // Proof: infrastructure-no-planning-dependency.
  // The injected forbidden dependency broke `keeps runtime admission replay independent of grants and mutable planning references`; restored GREEN.
  if (admin) {
    const decision = await authorize(
      new AccessDecisionRepository(tx),
      // Proof: runtime-actual-capped-principal.
      // The recorded fault broke `caps a runtime bind port machine own administrator grant without account fallback`; restored GREEN.
      actor.principal,
      { kind: 'organization', organizationId },
      'organization.manage_directory',
    );
    // Proof: runtime-current-directory-permission.
    // The recorded fault broke `encodes manage_directory for role-only runtime authority bind and read without effects`; restored GREEN.
    if (!decision.ok) return decision;
    // Proof: runtime-current-directory-nondelegation.
    // The recorded fault broke `refuses a delegated human runtime bind with effective manage_directory`; restored GREEN.
    if (actor.principal.delegation !== undefined)
      return { ok: false, reason: 'forbidden', permission: 'organization.manage_directory' };
  }
  return { organizationId };
}
async function authorityIn(
  tx: Reader,
  id: string,
  actor: ResourceRuntimeActor,
  admin: boolean,
): Promise<ResourceAuthority | ResourceUseDenial> {
  const organization = await organizationOf(tx, actor, admin);
  if ('ok' in organization) return organization;
  const { organizationId } = organization;
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
  if (authority === undefined) return refused('not_found');
  if (!admin) {
    // Proof: removing exact credential identity accepted a second key for the same machine person (2026-10-25).
    if (actor.credentialId !== authority.credentialId || actor.personId === null)
      return refused('forbidden');
    // Proof: removing revoked_at accepted an already-admitted grant after revocation in the composed grant test (2026-10-25).
    // Proof: without current person/account binding, queued unbound and rebound actors both committed sequence 2 in the composed review regression (2026-10-25).
    const live = tx.get<
      { id: string } | undefined
    >(sql`SELECT c.id FROM machine_credential c JOIN compute_provider provider ON provider.id=${authority.providerId}
      JOIN person p ON p.id=c.person_id
      JOIN person_organization o ON o.resource_id=p.id AND o.organization_id=c.organization_id
      WHERE c.id=${authority.credentialId} AND c.organization_id=${organizationId} AND provider.organization_id=${organizationId}
      AND c.person_id=${actor.personId} AND p.account_id=${actor.id} AND p.kind='agent' AND c.revoked_at IS NULL`);
    if (live === undefined) return refused('forbidden');
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
    // Proof: entry-bind-tuple.
    // The recorded fault broke `rejects direct resource bind actor mismatch before reads`; restored GREEN.
    assertResourceRuntimeActor(actor);
    // Proof: runtime-bind-actor-retention-first removed this capture independently.
    // retains runtime bind queued id before the writer
    // retains runtime bind queued scope organization before the writer
    // retains runtime bind queued authentication before the writer
    // retains runtime bind queued delegation before the writer
    // Named RED with that fault; restored five-case GREEN (bounded resource/runtime receipt).
    // Proof: store-bind-authority.
    // The recorded fault broke `retains runtime bind queued id before the writer`; restored GREEN.
    actor = retainResourceRuntimeActor(actor);
    // Proof: runtime-bind-payload-retention-first removed this capture independently.
    // retains runtime bind queued payload before the writer
    // Named RED with that fault; restored five-case GREEN (bounded resource/runtime receipt).
    // Proof: store-bind-payload.
    // The recorded fault broke `retains runtime bind queued payload before the writer`; restored GREEN.
    binding = structuredClone(binding);
    // Proof: owner-bind-gate.
    // The recorded fault broke `serializes and fences the actual resource bind owner on the shared Gate connection`; restored GREEN.
    // Proof: owner-bind-transaction.
    // The recorded fault broke `serializes and fences the actual resource bind owner on the shared Gate connection`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const organization = await organizationOf(tx, actor, true);
      if ('ok' in organization) return organization;
      const { organizationId } = organization;
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
    // Proof: entry-read-tuple.
    // The recorded fault broke `rejects direct resource read actor mismatch before reads`; restored GREEN.
    assertResourceRuntimeActor(actor);
    // Proof: store-read-authority.
    // The recorded fault broke `retains runtime read queued id before the writer`; restored GREEN.
    actor = retainResourceRuntimeActor(actor);
    // Proof: owner-read-gate.
    // The recorded fault broke `serializes and fences the actual resource read owner on the shared Gate connection`; restored GREEN.
    // Proof: owner-read-transaction.
    // The recorded fault broke `serializes and fences the actual resource read owner on the shared Gate connection`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const authority = await authorityIn(tx, authorityId, actor, true);
      return 'ok' in authority ? authority : { ok: true as const, value: authority };
    });
  }
  /** The immutable registered history carries admission identity, even before a source sequence exists. */
  admit(
    authorityId: string,
    actor: ResourceRuntimeActor,
    admission: ResourceRuntimeAdmission,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceRuntimeAdmissionReceipt>> {
    // Proof: entry-admit-tuple.
    // The recorded fault broke `rejects direct resource admit actor mismatch before reads`; restored GREEN.
    assertResourceRuntimeActor(actor);
    // Proof: store-admit-authority.
    // The recorded fault broke `retains runtime admit queued id before the writer`; restored GREEN.
    actor = retainResourceRuntimeActor(actor);
    // Proof: store-admit-payload.
    // The recorded fault broke `retains runtime admit queued payload before the writer`; restored GREEN.
    admission = structuredClone(admission);
    // Proof: owner-admit-gate.
    // The recorded fault broke `serializes and fences the actual resource admit owner on the shared Gate connection`; restored GREEN.
    // Proof: owner-admit-transaction.
    // The recorded fault broke `serializes and fences the actual resource admit owner on the shared Gate connection`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const authority = await authorityIn(tx, authorityId, actor, false);
      if ('ok' in authority) return authority;
      // Proof: bypassing the epoch check admitted a wrong-epoch request (final-fix-mutations/admission-epoch.log).
      if (admission.epoch !== authority.epoch) return refused('conflict');
      if (!admission.reason.trim() || admission.observedAt > at + 300000)
        return refused('invalid_body');
      const fingerprint = admissionFingerprint(authorityId, admission);
      const prior = tx
        .select()
        .from(resourceUseRecord)
        .where(eq(resourceUseRecord.id, admission.useId))
        .get();
      if (prior !== undefined) {
        const original = resourceUse.assert(prior.registrationResponse);
        const history = tx
          .select()
          .from(resourceUseEventRecord)
          .where(
            and(
              eq(resourceUseEventRecord.useId, admission.useId),
              eq(resourceUseEventRecord.revision, 1),
            ),
          )
          .get();
        // Proof: omitting exact admission identity accepted changed replay (admission-replay-identity.log).
        if (
          prior.organizationId !== authority.organizationId ||
          original.runtimeId !== authorityId ||
          original.incarnation !== admission.incarnation ||
          history?.fingerprint !== fingerprint
        )
          return refused('conflict');
      } else {
        // Proof: project-only event identity admitted two projects with one authority event (2026-10-25).
        if (
          tx.get<{ id: string } | undefined>(sql`
          SELECT e.id FROM resource_use_event e JOIN resource_use u ON u.id=e.use_id
          WHERE e.id=${admission.eventId}
          AND (e.project_id=${admission.use.projectId} OR json_extract(u.registration_response,'$.runtimeId')=${authorityId})
          LIMIT 1
        `) !== undefined
        )
          return refused('conflict');
        const resourceProvider = tx.get<{ providerId: string | null } | undefined>(
          sql`SELECT provider_id AS providerId FROM resource WHERE id=${admission.use.resourceId}`,
        );
        if (
          resourceProvider !== undefined &&
          resourceProvider.providerId !== null &&
          resourceProvider.providerId !== authority.providerId
        )
          return refused('conflict');
        const provider = tx.get<{ name: string } | undefined>(
          sql`SELECT name FROM compute_provider WHERE id=${authority.providerId}`,
        );
        if (provider === undefined) return refused('not_found');
        const registered = await registerResourceUseIn(
          tx,
          admission.use.projectId,
          actor,
          {
            requestId: `runtime:${authorityId}:${admission.eventId}`,
            resourceId: admission.use.resourceId,
            workItemId: admission.use.workItemId,
            stepId: admission.use.stepId,
            attemptNumber: admission.use.attemptNumber,
            agentRun: admission.use.agentRun,
            responsiblePersonId: admission.use.responsiblePersonId,
            locator: admission.use.locator,
            units: admission.use.units,
          },
          at,
          {
            id: admission.useId,
            authorityId,
            incarnation: admission.incarnation,
            eventId: admission.eventId,
            providerId: authority.providerId,
            providerName: provider.name,
            reason: admission.reason,
            observedAt: admission.observedAt,
            admissionFingerprint: fingerprint,
          },
        );
        if (!registered.ok) return registered;
        queueEndedAttempt(tx, registered.value, actor, at);
      }
      return {
        ok: true,
        value: {
          eventId: admission.eventId,
          useId: admission.useId,
          incarnation: admission.incarnation,
        },
      };
    });
  }
  ingest(
    authorityId: string,
    actor: ResourceRuntimeActor,
    event: ResourceRuntimeEvent,
    at: number,
  ): Promise<ResourceUseAnswer<{ acceptedSequence: number; useId: string; revision: number }>> {
    // Proof: entry-ingest-tuple.
    // The recorded fault broke `rejects direct resource ingest actor mismatch before reads`; restored GREEN.
    assertResourceRuntimeActor(actor);
    // Proof: store-ingest-authority.
    // The recorded fault broke `retains runtime ingest queued id before the writer`; restored GREEN.
    actor = retainResourceRuntimeActor(actor);
    // Proof: store-ingest-payload.
    // The recorded fault broke `retains runtime ingest queued payload before the writer`; restored GREEN.
    // Proof: store-ingest-deep-payload.
    // The recorded fault broke `retains runtime ingest queued nested retention before the writer`; restored GREEN.
    event = structuredClone(event);
    // Proof: owner-ingest-gate.
    // The recorded fault broke `serializes and fences the actual resource ingest owner on the shared Gate connection`; restored GREEN.
    // Proof: owner-ingest-transaction.
    // The recorded fault broke `serializes and fences the actual resource ingest owner on the shared Gate connection`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const authority = await authorityIn(tx, authorityId, actor, false);
      if ('ok' in authority) return authority;
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
      // `returned` is a host job's settlement and only a host job's (`dash-host-jobs` J2'); a
      // host job whose gate never opened is `not_created` (task 6.8), never `removed`.
      // Proof: with this check made `false`, `refuses what a host job cannot be`
      // (host-job-use.controller.db.test.ts) saw a `removed` host job answer 200 (2026-11-01).
      if (
        event.kind === 'release_verified' &&
        (event.use.kind === 'host_job'
          ? event.evidence?.disposition === 'removed'
          : event.evidence?.disposition === 'returned')
      )
        return refused('invalid_body');
      if (
        event.kind === 'release_verified' &&
        event.use.kind === 'host_job' &&
        !namesRunRecord(event.evidence, event.use.host, event.useId)
      )
        return refused('invalid_body');
      if (event.use.kind === 'host_job')
        return ingestHostJob(tx, authority, { ...event, use: event.use }, fingerprint, at);
      // Proof: comparing with delivery time rejected an overdue but valid historical retention event and blocked its following sequence (2026-10-25).
      if (
        event.kind === 'retained' &&
        (event.retention === undefined || event.retention.reviewAt <= event.observedAt)
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
      // Source revision 0 in the original response names provisional admission, not missing runtime authority.
      const admitted =
        stored !== undefined &&
        resourceUse.assert(stored.registrationResponse).runtimeRevision === 0;
      if (
        !(event.kind === 'registered' && admitted) &&
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
          (stored !== undefined && !admitted) ||
          event.revision !== 1 ||
          event.requestId !== undefined
        )
          return refused('conflict');
        if (admitted) {
          const original = resourceUse.assert(stored.registrationResponse);
          const history = tx
            .select()
            .from(resourceUseEventRecord)
            .where(
              and(
                eq(resourceUseEventRecord.useId, event.useId),
                eq(resourceUseEventRecord.revision, 1),
              ),
            )
            .get();
          const admission: ResourceRuntimeAdmission = {
            eventId: event.eventId,
            epoch: event.epoch,
            useId: event.useId,
            incarnation: event.incarnation,
            observedAt: event.observedAt,
            reason: event.reason,
            use: event.use,
          };
          // Proof: omitting confirmation identity accepted a substituted locator after project deletion (admission-confirmation-identity.log).
          if (
            stored.organizationId !== authority.organizationId ||
            original.runtimeId !== authorityId ||
            original.incarnation !== event.incarnation ||
            history?.fingerprint !== admissionFingerprint(authorityId, admission)
          )
            return refused('conflict');
          // Only source progress changes here; operator requests may already have advanced projection history.
          // Proof: restoring the original admission snapshot erased revision 2/pending intent (admission-projection-preservation.log).
          use = { ...resourceUse.assert(stored.snapshot), runtimeRevision: 1 };
          tx.update(resourceUseRecord)
            .set({ snapshot: use })
            .where(eq(resourceUseRecord.id, use.id))
            .run();
        } else {
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
          const registered = await registerResourceUseIn(
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
        }
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
        // The bound runtime owns deleted-package cleanup; personal orphan grants never enter this branch.
        if (
          tx.get<{ id: string } | undefined>(
            sql`SELECT id FROM project WHERE id=${stored.projectId}`,
          ) !== undefined
        ) {
          // Proof: runtime-live-followup-current-permission.
          // The recorded fault broke `encodes actual runtime live followup package.write denial over HTTP without effects`; restored GREEN.
          const project = await admitResourceUseProject(tx, stored.projectId, actor, true, false);
          if ('ok' in project) return project;
        }
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
          if (previous?.snapshot.kind !== 'release_verified') return refused('conflict');
          // The immutable source envelope retains all proof fields, including facts omitted from the display projection.
          const recorded = tx
            .select()
            .from(resourceRuntimeEventRecord)
            .where(
              and(
                eq(resourceRuntimeEventRecord.authorityId, authorityId),
                eq(resourceRuntimeEventRecord.eventId, previous.id),
              ),
            )
            .get();
          if (recorded === undefined)
            throw new Error('terminal runtime evidence envelope is absent');
          const original = resourceRuntimeEvent.assert(JSON.parse(recorded.fingerprint)).evidence;
          if (original === undefined || event.evidence === undefined) return refused('conflict');
          const originalProof = [
            original.digest,
            original.locator,
            original.disposition,
            original.reclaimedBytes,
          ];
          const repeatedProof = [
            event.evidence.digest,
            event.evidence.locator,
            event.evidence.disposition,
            event.evidence.reclaimedBytes,
          ];
          // Proof: comparing only digest/locator accepted removed-to-not_created in the composed terminal-evidence regression (2026-10-25).
          if (JSON.stringify(originalProof) !== JSON.stringify(repeatedProof))
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
      const response = acceptRuntimeEvent(tx, authorityId, event, fingerprint);
      if (event.kind === 'registered' && !admitted) queueEndedAttempt(tx, use, actor, at);
      return { ok: true, value: response };
    });
  }
  requests(authorityId: string, actor: ResourceRuntimeActor, after: number, limit: number) {
    // Proof: entry-requests-tuple.
    // The recorded fault broke `rejects direct resource requests actor mismatch before reads`; restored GREEN.
    assertResourceRuntimeActor(actor);
    // Proof: store-requests-authority.
    // The recorded fault broke `retains runtime requests queued id before the writer`; restored GREEN.
    actor = retainResourceRuntimeActor(actor);
    // Proof: owner-requests-gate.
    // The recorded fault broke `serializes and fences the actual resource requests owner on the shared Gate connection`; restored GREEN.
    // Proof: owner-requests-transaction.
    // The recorded fault broke `fences a second connection at runtime request authority read until settlement`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const authority = await authorityIn(tx, authorityId, actor, false);
      if ('ok' in authority) return authority;
      const rows = tx
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
/** Records the accepted envelope and advances the authority's sequence, in the ingesting transaction. */
function acceptRuntimeEvent(
  tx: RuntimeWriter,
  authorityId: string,
  event: ResourceRuntimeEvent,
  fingerprint: string,
): { acceptedSequence: number; useId: string; revision: number } {
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
  return response;
}

/**
 * Whether a host job's settlement evidence names its run record (`dash-host-jobs` task 6.8,
 * S6F-A1): the locator is exactly {@link hostJobRunRecordLocator} of the declared host and the
 * use, and a `not_created` return (its gate never opened) digests
 * {@link hostJobRunRecordAbsence}. A `returned` digest covers a row only Dash holds, so WBS
 * checks its shape alone. S5-A11's ledger-row evidence (`dash-host-job://…`) is refused.
 */
function namesRunRecord(
  evidence: ResourceRuntimeEvent['evidence'],
  host: string,
  useId: string,
): boolean {
  if (evidence === undefined) return false;
  const locator = hostJobRunRecordLocator(host, useId);
  // Proof: with the locator comparison made `true`, `keeps the run record as a returned job's
  // evidence and refuses the ledger-row shape` (host-job-use.controller.db.test.ts) saw the
  // ledger-row locator answer 200 for 400 (2026-11-05).
  if (evidence.locator !== locator) return false;
  // Proof: with this comparison made `true`, the same test saw a `not_created` return with
  // another digest answer 200 for 400 (2026-11-05).
  return (
    evidence.disposition !== 'not_created' ||
    evidence.digest === createHash('sha256').update(hostJobRunRecordAbsence(locator)).digest('hex')
  );
}

/**
 * Projects one host job event (`dash-host-jobs` J10): `registered` at revision 1 creates the
 * row, owned by the authority and its organization; `release_verified` at revision 2, carrying
 * the same declaration and the settlement evidence (`returned`, or `not_created` when it has no
 * run record; J2', task 6.8), marks it returned and stores that evidence. No
 * other kind exists for a host job, and nothing here admits, refuses or ends one: the host pool
 * already did. Planning links are kept as sent and never resolved, so a deleted project, work
 * item or person cannot strand the use. The caller has checked epoch, sequence, reason, instant
 * and evidence shape.
 */
function ingestHostJob(
  tx: RuntimeWriter,
  authority: ResourceAuthority,
  event: ResourceRuntimeEvent & { use: ResourceRuntimeHostJobUse },
  fingerprint: string,
  at: number,
): ResourceUseAnswer<{ acceptedSequence: number; useId: string; revision: number }> {
  const declaration = JSON.stringify(event.use);
  const stored = tx
    .select()
    .from(resourceHostJobRecord)
    .where(eq(resourceHostJobRecord.useId, event.useId))
    .get();
  if (event.kind === 'registered') {
    // A registration attests an admission, never a settlement.
    // Proof: without this check, `refuses what a host job cannot be` accepted a registration
    // carrying evidence, 200 for 400 (2026-11-02).
    if (event.evidence !== undefined) return refused('invalid_body');
    // Proof, each watched 2026-11-02 in `refuses what a host job cannot be`: without
    // `stored !== undefined` a second registration answered 500 (primary key), not 409; without
    // the revision check a revision-2 registration answered 200; without the request check a
    // registration carrying `requestId` answered 200; without the `resource_use` lookup a host
    // job registered over a worktree use's id answered 200.
    if (
      stored !== undefined ||
      event.revision !== 1 ||
      event.requestId !== undefined ||
      tx.select().from(resourceUseRecord).where(eq(resourceUseRecord.id, event.useId)).get() !==
        undefined
    )
      return refused('conflict');
    tx.insert(resourceHostJobRecord)
      .values({
        useId: event.useId,
        authorityId: authority.authorityId,
        organizationId: authority.organizationId,
        providerId: authority.providerId,
        incarnation: event.incarnation,
        revision: 1,
        declaration,
        state: 'registered',
        registeredAt: at,
      })
      .run();
  } else if (event.kind === 'release_verified') {
    // Proof, each watched in `refuses what a host job cannot be`: without the declaration
    // comparison a return under another label answered 200 for 409 (2026-11-01); without the
    // incarnation comparison a return of another incarnation, without the request check a return
    // carrying `requestId`, and without the authority comparison another authority's return of
    // this job each answered 200 (2026-11-02).
    if (
      stored?.authorityId !== authority.authorityId ||
      stored.organizationId !== authority.organizationId ||
      stored.incarnation !== event.incarnation ||
      stored.state !== 'registered' ||
      event.revision !== 2 ||
      event.requestId !== undefined ||
      stored.declaration !== declaration
    )
      return refused('conflict');
    tx.update(resourceHostJobRecord)
      .set({
        state: 'release_verified',
        revision: 2,
        releasedAt: at,
        evidence: JSON.stringify(event.evidence),
      })
      .where(eq(resourceHostJobRecord.useId, event.useId))
      .run();
  } else return refused('invalid_body');
  return {
    ok: true,
    value: acceptRuntimeEvent(tx, authority.authorityId, event, fingerprint),
  };
}

/** A delayed registration cannot miss an attempt-end signal that committed before its outbox arrived. */
function queueEndedAttempt(
  tx: RuntimeWriter,
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

/** Includes authority/epoch and every immutable field; admission replay never resolves mutable planning rows. */
function admissionFingerprint(authorityId: string, admission: ResourceRuntimeAdmission): string {
  return JSON.stringify({ authorityId, admission });
}
