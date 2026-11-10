import { resourceRuntimeHostJobUse } from '@wbs/contracts';
import {
  type AuditedAct,
  authorize,
  type CapacityReports,
  type ComputeProviderAdministration,
  type ComputeProviderDraft,
  type ComputeProviderPatch,
  type ComputeProviderPermissionRefusal,
  type ComputeProviderSummary,
  type HostJobReading,
  type ResourceProviderReading,
  retainSecurityPrincipal,
  type SecurityPrincipal,
} from '@wbs/core';
import {
  type CapacityReport,
  type CapacityReportDecision,
  type CapacityReportRequest,
  COMPUTE_PROVIDER_KINDS,
  type ComputeProviderKind,
  decideCapacityReport,
  PERSON_KINDS,
  type PersonKind,
} from '@wbs/domain';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { AccessDecisionRepository } from './access-decisions';
import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { writeImmediately } from './immediate-write';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  computeProvider,
  type ComputeProviderRow,
  person,
  resource,
  resourceCapacityReport,
  type ResourceCapacityReportRow,
  resourceHostJobRecord,
  resourceOrganization,
} from './schema';
import { runSecurityTransaction } from './security-transaction';

type Transaction = Pick<SQLiteBunDatabase, 'select' | 'insert' | 'update' | 'delete' | 'all'>;

/** Current activation, actual principal, fixed cap and directory authority on the owner's connection. */
async function readProviderRefusal(
  tx: SQLiteBunDatabase,
  organizationId: string,
  principal: SecurityPrincipal,
): Promise<'inactive' | ComputeProviderPermissionRefusal | null> {
  // Proof: omitting the activation refusal (provider-activation) failed `refuses inactive compute-provider list at its direct owner`; restored GREEN.
  // Proof: omitting the activation refusal (provider-activation) failed `refuses inactive compute-provider register at its direct owner`; restored GREEN.
  // Proof: omitting the activation refusal (provider-activation) failed `refuses inactive compute-provider update at its direct owner`; restored GREEN.
  // Proof: omitting the activation refusal (provider-activation) failed `refuses inactive compute-provider remove at its direct owner`; restored GREEN.
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  const decision = await authorize(
    new AccessDecisionRepository(tx),
    principal,
    { kind: 'organization', organizationId },
    'organization.manage_directory',
  );
  // Proof: ignoring the current grant denial (provider-current-grant) failed `names manage_directory for a role-only compute-provider list refusal without effects`; restored GREEN.
  // Proof: ignoring the current grant denial (provider-current-grant) failed `names manage_directory for a role-only compute-provider register refusal without effects`; restored GREEN.
  // Proof: ignoring the current grant denial (provider-current-grant) failed `names manage_directory for a role-only compute-provider update refusal without effects`; restored GREEN.
  // Proof: ignoring the current grant denial (provider-current-grant) failed `names manage_directory for a role-only compute-provider remove refusal without effects`; restored GREEN.
  // Proof: admitting delegated personal authority (provider-nondelegation) failed `refuses delegated personal authority at compute-provider list owner`; restored GREEN.
  // Proof: admitting delegated personal authority (provider-nondelegation) failed `refuses delegated personal authority at compute-provider register owner`; restored GREEN.
  // Proof: admitting delegated personal authority (provider-nondelegation) failed `refuses delegated personal authority at compute-provider update owner`; restored GREEN.
  // Proof: admitting delegated personal authority (provider-nondelegation) failed `refuses delegated personal authority at compute-provider remove owner`; restored GREEN.
  if (principal.delegation !== undefined || !decision.ok)
    return { kind: 'forbidden', permission: 'organization.manage_directory' };
  return null;
}

/** @throws on a kind outside {@link COMPUTE_PROVIDER_KINDS}, which the table's CHECK refuses. */
function kindOf(row: Pick<ComputeProviderRow, 'id' | 'kind'>): ComputeProviderKind {
  const known: readonly string[] = COMPUTE_PROVIDER_KINDS;
  if (!known.includes(row.kind)) throw new Error(`compute provider ${row.id} has a malformed kind`);
  // Narrowed by the membership test above, which is the boundary this is.
  return row.kind;
}

function summaryOf(row: ComputeProviderRow, resources: number): ComputeProviderSummary {
  return {
    id: row.id,
    kind: kindOf(row),
    name: row.name,
    locator: row.locator,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    resources,
  };
}

/** Resources referencing each of `ids`. */
function referenceCounts(tx: Transaction, ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  for (const row of tx
    .select({ providerId: resource.providerId, n: count() })
    .from(resource)
    .where(inArray(resource.providerId, [...ids]))
    .groupBy(resource.providerId)
    .all())
    if (row.providerId !== null) counts.set(row.providerId, row.n);
  return counts;
}

function ownProvider(
  tx: Transaction,
  organizationId: string,
  id: string,
): ComputeProviderRow | undefined {
  return tx
    .select()
    .from(computeProvider)
    .where(and(eq(computeProvider.id, id), eq(computeProvider.organizationId, organizationId)))
    .get();
}

function isNameTaken(
  tx: Transaction,
  organizationId: string,
  name: string,
  except: string | null,
): boolean {
  const holder = tx
    .select({ id: computeProvider.id })
    .from(computeProvider)
    .where(and(eq(computeProvider.organizationId, organizationId), eq(computeProvider.name, name)))
    .get();
  return holder !== undefined && holder.id !== except;
}

/** The audit detail of an instance act: its kind, name and locator, never a credential (P2). */
function auditDetail(row: Pick<ComputeProviderRow, 'kind' | 'name' | 'locator'>) {
  return { kind: row.kind, name: row.name, locator: row.locator };
}

/**
 * The stored report as the domain reads it.
 *
 * @throws when its columns contradict its outcome, which the table's CHECK
 * refuses (trusted state).
 */
function reportOf(row: ResourceCapacityReportRow): CapacityReport {
  const common = {
    providerId: row.providerId,
    observedAt: row.observedAt,
    cadenceSeconds: row.cadenceSeconds,
    reportedBy: row.reportedByPersonId,
    reportedAt: row.reportedAt,
  };
  // The table's CHECK keeps the reserved pair together; a lone half is broken trusted state.
  if ((row.reservedUnits === null) !== (row.reservedDimension === null))
    throw new Error(`capacity report of resource ${row.resourceId} is malformed`);
  if (row.outcome === 'measured' && row.capacityUnits !== null && row.usageUnits !== null)
    return {
      ...common,
      outcome: {
        kind: 'measured',
        capacityUnits: row.capacityUnits,
        usageUnits: row.usageUnits,
        // Absent, not null, for a report sent without it: the pre-change answer byte for byte.
        ...(row.reservedUnits === null || row.reservedDimension === null
          ? {}
          : { reservedUnits: row.reservedUnits, reservedDimension: row.reservedDimension }),
      },
    };
  if (row.outcome === 'unreachable' && row.reason !== null)
    return { ...common, outcome: { kind: 'unreachable', reason: row.reason } };
  throw new Error(`capacity report of resource ${row.resourceId} is malformed`);
}

/** @throws on a person kind outside {@link PERSON_KINDS}, which the table's CHECK refuses. */
function personKindOf(tx: Transaction, personId: string): PersonKind {
  const row = tx.select({ kind: person.kind }).from(person).where(eq(person.id, personId)).get();
  if (row === undefined) throw new Error(`machine credential pinned to missing person ${personId}`);
  const known: readonly string[] = PERSON_KINDS;
  if (!known.includes(row.kind)) throw new Error(`person ${personId} has a malformed kind`);
  return row.kind;
}

/**
 * {@link ComputeProviderAdministration} and {@link CapacityReports} over the
 * shared database (`compute-providers` P2, P5, P6).
 */
export class ComputeProviderRepository implements ComputeProviderAdministration, CapacityReports {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async list(
    organizationId: string,
    principal: SecurityPrincipal,
  ): Promise<readonly ComputeProviderSummary[] | 'inactive' | ComputeProviderPermissionRefusal> {
    // Proof: retaining queued principal aliases (provider-list-principal-snapshot) failed `retains queued compute-provider list actual identity and mutable inputs`; restored GREEN.
    // Proof: retaining queued principal aliases (provider-list-principal-snapshot) failed `retains compute-provider list queued machine cap beside its own grant and account authority`; restored GREEN.
    principal = retainSecurityPrincipal(principal);
    // Proof: bypassing this owner’s shared Gate (provider-list-owner-gate) failed `uses the actual composed compute-provider list gate and current grant`; restored GREEN.
    // Proof: omitting this owner’s BEGIN/rollback wrapper (provider-list-transaction) failed `keeps the compute-provider list grant await inside its immediate owner`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readProviderRefusal(tx, organizationId, principal);
      // Proof: ignoring this owner’s current refusal (provider-list-local-decision) failed `rechecks queued compute-provider list grants before effects`; restored GREEN.
      if (refusal !== null) return refusal;
      const rows = tx
        .select()
        .from(computeProvider)
        .where(eq(computeProvider.organizationId, organizationId))
        .orderBy(asc(computeProvider.name), asc(computeProvider.id))
        .all();
      const counts = referenceCounts(
        tx,
        rows.map((row) => row.id),
      );
      return rows.map((row) => summaryOf(row, counts.get(row.id) ?? 0));
    });
  }

  /**
   * Proof: with the audit append's failure caught and dropped, `stores no
   * instance when the audit row cannot be written` in
   * `compute-provider.controller.db.test.ts` answered 201 instead of 500;
   * watched 2026-10-22.
   */
  register(
    organizationId: string,
    principal: SecurityPrincipal,
    draft: ComputeProviderDraft,
    act: AuditedAct,
  ): ReturnType<ComputeProviderAdministration['register']> {
    // Proof: retaining queued principal aliases (provider-register-principal-snapshot) failed `retains queued compute-provider register actual identity and mutable inputs`; restored GREEN.
    // Proof: retaining queued principal aliases (provider-register-principal-snapshot) failed `retains compute-provider register queued machine cap beside its own grant and account authority`; restored GREEN.
    // Proof: omitting authenticated actor equality (provider-register-actor-coherence) failed `rejects compute-provider register actor mismatch before taking its turn`; restored GREEN.
    // Proof: omitting authenticated stamp-by equality (provider-register-stamp-coherence) failed `rejects compute-provider register stamp mismatch before taking its turn`; restored GREEN.
    principal = retainSecurityPrincipal(principal, act.actor, act.stamp.by);
    // Proof: retaining the caller act and stamp aliases (provider-register-act-snapshot) failed `retains queued compute-provider register actual identity and mutable inputs`; restored GREEN.
    // Proof: shallow-copying act and retaining its nested stamp (provider-register-stamp-snapshot) failed `retains queued compute-provider register actual identity and mutable inputs`; restored GREEN.
    act = { ...act, stamp: { ...act.stamp } };
    // Proof: retaining queued draft/patch aliases (provider-register-payload-snapshot) failed `retains queued compute-provider register actual identity and mutable inputs`; restored GREEN.
    draft = structuredClone(draft);
    // Proof: bypassing this owner’s shared Gate (provider-register-owner-gate) failed `uses the actual composed compute-provider register gate and current grant`; restored GREEN.
    // Proof: omitting this owner’s BEGIN/rollback wrapper (provider-register-transaction) failed `rolls compute-provider register back on its late audit failure`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readProviderRefusal(tx, organizationId, principal);
      // Proof: ignoring this owner’s current refusal (provider-register-local-decision) failed `rechecks queued compute-provider register grants before effects`; restored GREEN.
      if (refusal !== null) return typeof refusal === 'string' ? { kind: refusal } : refusal;
      // Proof: with this check removed, `registers PUNI's two gate hosts and
      // refuses a third h4claw` in `compute-provider.controller.db.test.ts`
      // failed on the unique index with 500 instead of 409; watched 2026-10-22.
      if (isNameTaken(tx, organizationId, draft.name, null)) return { kind: 'name_taken' };
      tx.insert(computeProvider)
        .values({
          id: draft.id,
          organizationId,
          kind: draft.kind,
          name: draft.name,
          locator: draft.locator,
          ...auditOnCreate(act.stamp),
        })
        .run();
      const row = ownProvider(tx, organizationId, draft.id);
      if (row === undefined)
        throw new Error(`compute provider ${draft.id} vanished inside its write`);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'compute_provider_registered',
        subjectKind: 'compute_provider',
        subjectId: draft.id,
        detail: auditDetail(row),
        at: act.stamp.at,
      });
      return { kind: 'registered', provider: summaryOf(row, 0) } as const;
    });
  }

  update(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    patch: ComputeProviderPatch,
    act: AuditedAct,
  ): ReturnType<ComputeProviderAdministration['update']> {
    // Proof: retaining queued principal aliases (provider-update-principal-snapshot) failed `retains queued compute-provider update actual identity and mutable inputs`; restored GREEN.
    // Proof: retaining queued principal aliases (provider-update-principal-snapshot) failed `retains compute-provider update queued machine cap beside its own grant and account authority`; restored GREEN.
    // Proof: omitting authenticated actor equality (provider-update-actor-coherence) failed `rejects compute-provider update actor mismatch before taking its turn`; restored GREEN.
    // Proof: omitting authenticated stamp-by equality (provider-update-stamp-coherence) failed `rejects compute-provider update stamp mismatch before taking its turn`; restored GREEN.
    principal = retainSecurityPrincipal(principal, act.actor, act.stamp.by);
    // Proof: retaining the caller act and stamp aliases (provider-update-act-snapshot) failed `retains queued compute-provider update actual identity and mutable inputs`; restored GREEN.
    // Proof: shallow-copying act and retaining its nested stamp (provider-update-stamp-snapshot) failed `retains queued compute-provider update actual identity and mutable inputs`; restored GREEN.
    act = { ...act, stamp: { ...act.stamp } };
    // Proof: retaining queued draft/patch aliases (provider-update-payload-snapshot) failed `retains queued compute-provider update actual identity and mutable inputs`; restored GREEN.
    patch = structuredClone(patch);
    // Proof: bypassing this owner’s shared Gate (provider-update-owner-gate) failed `uses the actual composed compute-provider update gate and current grant`; restored GREEN.
    // Proof: omitting this owner’s BEGIN/rollback wrapper (provider-update-transaction) failed `rolls compute-provider update back on its late audit failure`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readProviderRefusal(tx, organizationId, principal);
      // Proof: ignoring this owner’s current refusal (provider-update-local-decision) failed `rechecks queued compute-provider update grants before effects`; restored GREEN.
      if (refusal !== null) return typeof refusal === 'string' ? { kind: refusal } : refusal;
      const before = ownProvider(tx, organizationId, id);
      if (before === undefined) return { kind: 'unknown_provider' };
      // Proof: with this check removed, `renames and relocates an instance
      // with its audit row` in `compute-provider.controller.db.test.ts`
      // failed on the unique index with 500 instead of 409; watched 2026-10-22.
      if (patch.name !== undefined && isNameTaken(tx, organizationId, patch.name, id))
        return { kind: 'name_taken' };
      tx.update(computeProvider)
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.locator === undefined ? {} : { locator: patch.locator }),
          ...auditOnUpdate(act.stamp),
        })
        .where(eq(computeProvider.id, id))
        .run();
      const row = ownProvider(tx, organizationId, id);
      if (row === undefined) throw new Error(`compute provider ${id} vanished inside its update`);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'compute_provider_updated',
        subjectKind: 'compute_provider',
        subjectId: id,
        detail: { ...auditDetail(row), previousName: before.name, previousLocator: before.locator },
        at: act.stamp.at,
      });
      return {
        kind: 'updated',
        provider: summaryOf(row, referenceCounts(tx, [id]).get(id) ?? 0),
      } as const;
    });
  }

  remove(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    cascade: boolean,
    act: AuditedAct,
  ): ReturnType<ComputeProviderAdministration['remove']> {
    // Proof: retaining queued principal aliases (provider-remove-principal-snapshot) failed `retains queued compute-provider remove actual identity and mutable inputs`; restored GREEN.
    // Proof: retaining queued principal aliases (provider-remove-principal-snapshot) failed `retains compute-provider remove queued machine cap beside its own grant and account authority`; restored GREEN.
    // Proof: omitting authenticated actor equality (provider-remove-actor-coherence) failed `rejects compute-provider remove actor mismatch before taking its turn`; restored GREEN.
    // Proof: omitting authenticated stamp-by equality (provider-remove-stamp-coherence) failed `rejects compute-provider remove stamp mismatch before taking its turn`; restored GREEN.
    principal = retainSecurityPrincipal(principal, act.actor, act.stamp.by);
    // Proof: retaining the caller act and stamp aliases (provider-remove-act-snapshot) failed `retains queued compute-provider remove actual identity and mutable inputs`; restored GREEN.
    // Proof: shallow-copying act and retaining its nested stamp (provider-remove-stamp-snapshot) failed `retains queued compute-provider remove actual identity and mutable inputs`; restored GREEN.
    act = { ...act, stamp: { ...act.stamp } };
    // Proof: bypassing this owner’s shared Gate (provider-remove-owner-gate) failed `uses the actual composed compute-provider remove gate and current grant`; restored GREEN.
    // Proof: omitting this owner’s BEGIN/rollback wrapper (provider-remove-transaction) failed `rolls compute-provider remove back on its late audit failure`; restored GREEN.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readProviderRefusal(tx, organizationId, principal);
      // Proof: ignoring this owner’s current refusal (provider-remove-local-decision) failed `rechecks queued compute-provider remove grants before effects`; restored GREEN.
      if (refusal !== null) return refusal;
      const row = ownProvider(tx, organizationId, id);
      // Proof: with the organization predicate dropped from `ownProvider`,
      // `answers another organization's instance unknown_provider on patch
      // and delete` in `compute-provider.controller.db.test.ts` renamed B's
      // instance (200); watched 2026-10-22.
      if (row === undefined) return 'unknown_provider';
      // Proof: the late-cause request test observed deletion 204 before pending acknowledgments joined this predicate (2026-10-25).
      const outstanding = tx.all<{
        id: string;
        name: string;
      }>(sql`SELECT DISTINCT json_extract(snapshot,'$.resourceId') AS id,json_extract(snapshot,'$.resourceName') AS name FROM resource_use
        WHERE organization_id=${organizationId} AND json_extract(snapshot,'$.providerId')=${id} AND json_extract(snapshot,'$.source')='runtime' AND (state!='release_verified' OR json_extract(snapshot,'$.pendingCleanupRequest')=1)`);
      // Proof: disabling this guard allowed cascading deletion in the unresolved-runtime-use controller test (2026-10-25).
      if (outstanding.length > 0) return { kind: 'in_use', resources: outstanding } as const;
      const fulfilled = tx
        .select({ id: resource.id, name: resourceOrganization.name })
        .from(resource)
        .innerJoin(resourceOrganization, eq(resourceOrganization.resourceId, resource.id))
        .where(eq(resource.providerId, id))
        .orderBy(asc(resourceOrganization.name))
        .all();
      // Proof: with this refusal removed, `refuses removing a fulfilling
      // instance unless cascade` in `compute-provider.controller.db.test.ts`
      // removed it without cascade (204 instead of 409); watched 2026-10-22.
      if (fulfilled.length > 0 && !cascade)
        return { kind: 'in_use', resources: fulfilled } as const;
      // Proof: with this clearing removed, `refuses removing a fulfilling
      // instance unless cascade` in `compute-provider.controller.db.test.ts`
      // answered the cascade 500 on the foreign key instead of 204; watched
      // 2026-10-22.
      tx.update(resource)
        .set({ providerId: null, ...auditOnUpdate(act.stamp) })
        .where(eq(resource.providerId, id))
        .run();
      tx.delete(resourceCapacityReport).where(eq(resourceCapacityReport.providerId, id)).run();
      tx.delete(computeProvider).where(eq(computeProvider.id, id)).run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'compute_provider_removed',
        subjectKind: 'compute_provider',
        subjectId: id,
        detail: { ...auditDetail(row), clearedResources: fulfilled.map((each) => each.id) },
        at: act.stamp.at,
      });
      return 'removed' as const;
    });
  }

  /**
   * Detaches the exact admitted reporter, target, clock and nested outcome
   * before the existing write turn. Optional reservation absence and zero remain
   * distinct. Reads the facts, decides and writes inside one `BEGIN IMMEDIATE`
   * transaction, so a second process's report waits for this one's commit
   * and then compares against it. No test interleaves two processes here;
   * `verify.md` records that race as unverified.
   */
  put(request: CapacityReportRequest): Promise<CapacityReportDecision> {
    // Proof: retaining queued reporter/target/body/clock aliases (report-request-snapshot) failed `retains queued capacity report measured-absent request fields and nested outcome`; restored GREEN.
    // Proof: retaining queued reporter/target/body/clock aliases (report-request-snapshot) failed `retains queued capacity report measured-zero request fields and nested outcome`; restored GREEN.
    // Proof: retaining queued reporter/target/body/clock aliases (report-request-snapshot) failed `retains queued capacity report unreachable request fields and nested outcome`; restored GREEN.
    // Proof: retaining queued reporter/target/body/clock aliases (report-request-snapshot) failed `retains the capacity report clock so a queued alias cannot admit a future report`; restored GREEN.
    // Proof: copying the outer request/body while retaining its outcome alias (report-request-outcome-deep-snapshot) failed `retains queued capacity report measured-absent request fields and nested outcome`; restored GREEN.
    // Proof: copying the outer request/body while retaining its outcome alias (report-request-outcome-deep-snapshot) failed `retains queued capacity report measured-zero request fields and nested outcome`; restored GREEN.
    // Proof: copying the outer request/body while retaining its outcome alias (report-request-outcome-deep-snapshot) failed `retains queued capacity report unreachable request fields and nested outcome`; restored GREEN.
    request = {
      organizationId: request.organizationId,
      personId: request.personId,
      providerId: request.providerId,
      resourceId: request.resourceId,
      now: request.now,
      body: {
        observedAt: request.body.observedAt,
        cadenceSeconds: request.body.cadenceSeconds,
        outcome:
          request.body.outcome.kind === 'measured'
            ? {
                kind: request.body.outcome.kind,
                capacityUnits: request.body.outcome.capacityUnits,
                usageUnits: request.body.outcome.usageUnits,
                // Proof: testing optional reservations by truthiness and dropping zero (report-reservation-zero) failed `retains queued capacity report measured-zero request fields and nested outcome`; restored GREEN.
                ...(request.body.outcome.reservedUnits === undefined
                  ? {}
                  : { reservedUnits: request.body.outcome.reservedUnits }),
                ...(request.body.outcome.reservedDimension === undefined
                  ? {}
                  : { reservedDimension: request.body.outcome.reservedDimension }),
              }
            : { kind: request.body.outcome.kind, reason: request.body.outcome.reason },
      },
    };
    return writeImmediately(this.db, this.gate, (tx) => {
      const provider = tx
        .select({ organizationId: computeProvider.organizationId })
        .from(computeProvider)
        .where(eq(computeProvider.id, request.providerId))
        .get();
      const held = tx
        .select({
          providerId: resource.providerId,
          organizationId: resourceOrganization.organizationId,
        })
        .from(resource)
        .leftJoin(resourceOrganization, eq(resourceOrganization.resourceId, resource.id))
        .where(eq(resource.id, request.resourceId))
        .get();
      const storedRow = tx
        .select()
        .from(resourceCapacityReport)
        .where(eq(resourceCapacityReport.resourceId, request.resourceId))
        .get();
      const decision = decideCapacityReport(
        {
          personKind: personKindOf(tx, request.personId),
          provider: provider ?? null,
          resource:
            held === undefined
              ? null
              : {
                  organizationId: held.organizationId,
                  providerId: held.providerId,
                  stored: storedRow === undefined ? null : reportOf(storedRow),
                },
        },
        request,
      );
      if (decision.kind !== 'store') return decision;
      const { report } = decision;
      const columns = {
        providerId: report.providerId,
        observedAt: report.observedAt,
        cadenceSeconds: report.cadenceSeconds,
        outcome: report.outcome.kind,
        capacityUnits: report.outcome.kind === 'measured' ? report.outcome.capacityUnits : null,
        usageUnits: report.outcome.kind === 'measured' ? report.outcome.usageUnits : null,
        reservedUnits:
          report.outcome.kind === 'measured' ? (report.outcome.reservedUnits ?? null) : null,
        reservedDimension:
          report.outcome.kind === 'measured' ? (report.outcome.reservedDimension ?? null) : null,
        reason: report.outcome.kind === 'unreachable' ? report.outcome.reason : null,
        reportedByPersonId: report.reportedBy,
        reportedAt: report.reportedAt,
      };
      tx.insert(resourceCapacityReport)
        .values({ resourceId: request.resourceId, ...columns })
        .onConflictDoUpdate({ target: resourceCapacityReport.resourceId, set: columns })
        .run();
      return decision;
    });
  }

  async readingsOf(
    resourceIds: readonly string[],
  ): Promise<ReadonlyMap<string, ResourceProviderReading>> {
    // Proof: retaining the caller resource-ID array (provider-readings-selection) failed `retains queued provider reading resource IDs without caller aliases`; restored GREEN.
    resourceIds = [...resourceIds];
    const readings = new Map<string, ResourceProviderReading>();
    if (resourceIds.length === 0) return readings;
    // Proof: opening the native read before administration settles (provider-readings-gate) failed `serializes provider readings behind an actual committed administration grant await`; restored GREEN.
    // Proof: opening the native read before administration settles (provider-readings-gate) failed `serializes provider readings behind an actual failed administration grant await`; restored GREEN.
    return this.gate.enter(() =>
      Promise.resolve(
        this.db.transaction((tx) => {
          const reports = new Map(
            tx
              .select()
              .from(resourceCapacityReport)
              .where(inArray(resourceCapacityReport.resourceId, [...resourceIds]))
              .all()
              .map((row) => [row.resourceId, reportOf(row)] as const),
          );
          for (const row of tx
            .select({
              id: resource.id,
              providerId: resource.providerId,
              kind: computeProvider.kind,
              name: computeProvider.name,
            })
            .from(resource)
            .leftJoin(computeProvider, eq(computeProvider.id, resource.providerId))
            .where(inArray(resource.id, [...resourceIds]))
            .all()) {
            const report = reports.get(row.id) ?? null;
            // A report outlives no reference change: `setResourceProvider` deletes
            // it, so one naming another instance is malformed trusted state.
            if (report !== null && report.providerId !== row.providerId)
              throw new Error(`capacity report of resource ${row.id} names another instance`);
            readings.set(row.id, {
              provider: providerOf(row),
              report,
              hostJobs: row.providerId === null ? [] : hostJobsOf(tx, row.providerId),
            });
          }
          return readings;
        }),
      ),
    );
  }
}

/**
 * The host jobs the authority bound to `providerId` published and has not
 * returned (`dash-host-jobs` J10), oldest registration first.
 *
 * @throws when a stored declaration is not a host job use: ingestion stored it
 * after the contract accepted it, so anything else is broken trusted state.
 */
function hostJobsOf(
  tx: Pick<SQLiteBunDatabase, 'select'>,
  providerId: string,
): readonly HostJobReading[] {
  return tx
    .select({ useId: resourceHostJobRecord.useId, declaration: resourceHostJobRecord.declaration })
    .from(resourceHostJobRecord)
    .where(
      and(
        eq(resourceHostJobRecord.providerId, providerId),
        eq(resourceHostJobRecord.state, 'registered'),
      ),
    )
    .orderBy(asc(resourceHostJobRecord.registeredAt), asc(resourceHostJobRecord.useId))
    .all()
    .map((row) => {
      const use = resourceRuntimeHostJobUse.assert(JSON.parse(row.declaration));
      return {
        useId: row.useId,
        label: use.label,
        type: use.type,
        host: use.host,
        reservations: use.reservations,
      };
    });
}

/**
 * The instance a resource row names, off its left join.
 *
 * @throws when the reference names no instance: removal clears every
 * reference in its transaction (`cascade`), so a dangling one is broken
 * trusted state; and as {@link kindOf} on a malformed kind.
 */
function providerOf(row: {
  id: string;
  providerId: string | null;
  kind: ComputeProviderRow['kind'] | null;
  name: string | null;
}): ResourceProviderReading['provider'] {
  if (row.providerId === null) return null;
  // Proof: answering null here, `answers 500 on a reference naming no
  // instance` (compute-provider.controller.db.test.ts) failed: the store
  // resolved; watched 2026-10-25.
  if (row.kind === null || row.name === null)
    throw new Error(`resource ${row.id} names provider ${row.providerId}, which is not registered`);
  // Proof: with `row.kind` returned unchecked, `answers 500 on an instance
  // of a malformed kind` failed: the store resolved with `vm` (the route's
  // response contract alone still answered 500); watched 2026-10-25.
  return {
    id: row.providerId,
    kind: kindOf({ id: row.providerId, kind: row.kind }),
    name: row.name,
  };
}

/** One {@link ComputeProviderRepository} serving both ports, as be-01 composes them. */
export function computeProvidersOver(db: SQLiteBunDatabase, gate: Gate) {
  const repository = new ComputeProviderRepository(db, gate);
  return { administration: repository, reports: repository };
}
