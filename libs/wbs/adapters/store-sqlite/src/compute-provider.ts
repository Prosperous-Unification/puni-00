import {
  type AuditedAct,
  type CapacityReports,
  type ComputeProviderAdministration,
  type ComputeProviderDraft,
  type ComputeProviderPatch,
  type ComputeProviderSummary,
  type MachineCredentialActorRefusal,
  type ResourceProviderReading,
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
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  computeProvider,
  type ComputeProviderRow,
  person,
  resource,
  resourceCapacityReport,
  type ResourceCapacityReportRow,
  resourceOrganization,
} from './schema';

type Transaction = ImmediateTransaction;

/**
 * Whether the actor may administer provider instances of `organizationId`
 * now: `inactive` before activation, `forbidden` for a member, a viewer or a
 * non-member (P2: an instance admits reports every project sees).
 */
function administering(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): MachineCredentialActorRefusal | 'admin' {
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  const role = roleIn(tx, organizationId, actorId);
  // Proof: with members admitted here, `refuses a member every compute
  // provider route, writing nothing` in
  // `compute-provider.controller.db.test.ts` answered the member's list 200;
  // watched 2026-10-22.
  if (role !== 'admin' && role !== 'super_admin') return 'forbidden';
  return 'admin';
}

/** @throws on a kind outside {@link COMPUTE_PROVIDER_KINDS}, which the table's CHECK refuses. */
function kindOf(row: ComputeProviderRow): ComputeProviderKind {
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
  if (row.outcome === 'measured' && row.capacityUnits !== null && row.usageUnits !== null)
    return {
      ...common,
      outcome: { kind: 'measured', capacityUnits: row.capacityUnits, usageUnits: row.usageUnits },
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
    actorId: string,
  ): Promise<readonly ComputeProviderSummary[] | MachineCredentialActorRefusal> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const role = administering(tx, organizationId, actorId);
      if (role !== 'admin') return role;
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
    actorId: string,
    draft: ComputeProviderDraft,
    act: AuditedAct,
  ): ReturnType<ComputeProviderAdministration['register']> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const role = administering(tx, organizationId, actorId);
      if (role !== 'admin') return { kind: role };
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
    actorId: string,
    id: string,
    patch: ComputeProviderPatch,
    act: AuditedAct,
  ): ReturnType<ComputeProviderAdministration['update']> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const role = administering(tx, organizationId, actorId);
      if (role !== 'admin') return { kind: role };
      const before = ownProvider(tx, organizationId, id);
      if (before === undefined) return { kind: 'unknown_provider' };
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
    actorId: string,
    id: string,
    cascade: boolean,
    act: AuditedAct,
  ): ReturnType<ComputeProviderAdministration['remove']> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const role = administering(tx, organizationId, actorId);
      if (role !== 'admin') return role;
      const row = ownProvider(tx, organizationId, id);
      // Proof: with the organization predicate dropped from `ownProvider`,
      // `answers another organization's instance unknown_provider on patch
      // and delete` in `compute-provider.controller.db.test.ts` renamed B's
      // instance (200); watched 2026-10-22.
      if (row === undefined) return 'unknown_provider';
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
   * Reads the facts, decides and writes inside one `BEGIN IMMEDIATE`
   * transaction, so a second process's report waits for this one's commit
   * and then compares against it. No test interleaves two processes here;
   * `verify.md` records that race as unverified.
   */
  put(request: CapacityReportRequest): Promise<CapacityReportDecision> {
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
    await Promise.resolve();
    const readings = new Map<string, ResourceProviderReading>();
    if (resourceIds.length === 0) return readings;
    return this.db.transaction((tx) => {
      const reports = new Map(
        tx
          .select()
          .from(resourceCapacityReport)
          .where(inArray(resourceCapacityReport.resourceId, [...resourceIds]))
          .all()
          .map((row) => [row.resourceId, reportOf(row)] as const),
      );
      for (const row of tx
        .select({ id: resource.id, providerId: resource.providerId })
        .from(resource)
        .where(inArray(resource.id, [...resourceIds]))
        .all()) {
        const report = reports.get(row.id) ?? null;
        // A report outlives no reference change: `setResourceProvider` deletes
        // it, so one naming another instance is malformed trusted state.
        if (report !== null && report.providerId !== row.providerId)
          throw new Error(`capacity report of resource ${row.id} names another instance`);
        readings.set(row.id, { providerId: row.providerId, report });
      }
      return readings;
    });
  }
}
