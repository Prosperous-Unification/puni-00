import type {
  IncidentDependencyStore,
  IncidentReceipt,
  StoredTypedDependency,
  TypedDependencyStore,
  WriteStamp,
} from '@wbs/core';
import {
  formatTypedDependencyKey,
  isDependencyEndpointScope,
  isRelationshipType,
  type ScopedDependencyEndpoint,
} from '@wbs/domain';
import { and, eq, inArray, or } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import {
  externalDependency,
  type ExternalDependencyRow,
  organization,
  stepDefinition,
  typedDependency,
  type TypedDependencyRow,
  workItem,
  workPackage,
  workPackageOrganization,
  workPackageStep,
} from './schema';

/**
 * Refuses stored endpoint discriminants that this release cannot interpret.
 *
 * Proof: bypassing the scope check made `refuses unknown scopes and
 * scope/step mismatches on read` fail on the wrong message (`a other
 * predecessor without a step`); bypassing the whole/step check or the
 * missing-step check made it fail on `Received: (resolved without throwing)`; watched
 * 2026-09-27.
 */
function readEndpoint(
  rowId: string,
  end: 'predecessor' | 'successor',
  workItemId: string,
  scope: string,
  stepId: string | null,
  workPackageId: string,
): ScopedDependencyEndpoint {
  if (!isDependencyEndpointScope(scope)) {
    throw new Error(`typed dependency ${rowId} has unknown ${end} scope ${scope}`);
  }
  if (scope === 'whole') {
    if (stepId !== null)
      throw new Error(`typed dependency ${rowId} has a whole ${end} with a step`);
    return { scope, workItemId, workPackageId };
  }
  if (stepId === null)
    throw new Error(`typed dependency ${rowId} has a ${scope} ${end} without a step`);
  return { scope, workItemId, stepId, workPackageId };
}

/** Validates stored discriminants when SQLite rows cross into the domain. */
export function readTypedDependency(row: TypedDependencyRow): StoredTypedDependency {
  // Proof: bypassing this check returned an injected SF row instead of
  // refusing it in `refuses an unsupported stored relationship type on read`
  // (0 pass / 1 fail); watched 2026-09-28.
  if (!isRelationshipType(row.type)) {
    throw new Error(`typed dependency ${row.id} has unknown relationship type ${row.type}`);
  }
  return {
    id: row.id,
    workPackageId: row.workPackageId,
    predecessor: readEndpoint(
      row.id,
      'predecessor',
      row.predecessorWorkItemId,
      row.predecessorScope,
      row.predecessorStepId,
      row.workPackageId,
    ),
    successor: readEndpoint(
      row.id,
      'successor',
      row.successorWorkItemId,
      row.successorScope,
      row.successorStepId,
      row.workPackageId,
    ),
    type: row.type,
  };
}

function mapStoredColumns(row: StoredTypedDependency) {
  return {
    workPackageId: row.workPackageId,
    predecessorWorkItemId: row.predecessor.workItemId,
    predecessorScope: row.predecessor.scope,
    predecessorStepId: row.predecessor.scope === 'whole' ? null : row.predecessor.stepId,
    successorWorkItemId: row.successor.workItemId,
    successorScope: row.successor.scope,
    successorStepId: row.successor.scope === 'whole' ? null : row.successor.stepId,
    type: row.type,
  };
}

type Transaction = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

/**
 * Throws unless each endpoint names its declared work package's rows in the shape
 * its scope requires, with successor ownership and same-organization evidence; a node
 * endpoint's work item has no children and a descendant-step endpoint's has
 * some. Delete-pending or absent work packages cannot accept new endpoint facts.
 *
 * Once typed commands exist (task 4), the service must refuse these first
 * with typed 4xx. This is the persistence boundary inside the write's transaction,
 * where a concurrent tree edit cannot slip between the check and the insert.
 * Foreign keys alone prove only that the rows exist somewhere.
 *
 * Proof: the work package comparison, the step-owner comparison and each of the two
 * leafhood comparisons disabled in turn made its own line of `refuses an
 * endpoint outside the workPackage or in the wrong shape` fail on `Received:
 * (resolved without throwing)` (`foreign work item`, `foreign step`, `node on a
 * parent`, `descendant-step on a leaf`); watched 2026-09-27.
 */
export function assertEndpointsHeld(
  tx: Transaction,
  row: StoredTypedDependency,
): string | undefined {
  const organizationId = assertEvidence(tx, row);
  for (const endpoint of [row.predecessor, row.successor]) {
    // Proof: bypassing this fence admitted new A→B links with either endpoint
    // delete-pending in the installed deletion safety fixture (2026-10-22).
    const target = tx
      .select({ pendingAt: workPackage.optimizationDeletePendingAt })
      .from(workPackage)
      .where(eq(workPackage.id, endpoint.workPackageId))
      .get();
    if (target?.pendingAt !== null)
      throw new Error(`work package ${endpoint.workPackageId} is pending deletion or unavailable`);
  }

  for (const endpoint of [row.predecessor, row.successor]) {
    if (endpoint.scope === 'whole') continue;
    const child = tx
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.parentId, endpoint.workItemId))
      .limit(1)
      .get();
    if (endpoint.scope === 'node' && child !== undefined) {
      throw new Error(
        `typed dependency ${row.id} names a node of ${endpoint.workItemId}, a parent`,
      );
    }
    if (endpoint.scope === 'descendant-step' && child === undefined) {
      throw new Error(
        `typed dependency ${row.id} names descendants of ${endpoint.workItemId}, a leaf`,
      );
    }
  }
  return organizationId;
}

/** A physical row retained through validation so representation moves preserve creation audit. */
type PhysicalDependency =
  | {
      readonly external: false;
      readonly row: TypedDependencyRow;
      readonly dependency: StoredTypedDependency;
    }
  | {
      readonly external: true;
      readonly row: ExternalDependencyRow;
      readonly dependency: StoredTypedDependency;
    };

/** Proof: bypassing owner agreement made `rejects cross-work-package mismatched endpoints and foreign organizations` accept the wrong owner (2026-10-22). */
function assertOwner(row: StoredTypedDependency): void {
  if (row.workPackageId !== row.successor.workPackageId) {
    throw new Error(`typed dependency ${row.id} has inconsistent successor ownership`);
  }
}

/** Reads external discriminants without inventing any endpoint ownership. */
function readExternalDependency(row: ExternalDependencyRow): StoredTypedDependency {
  const local = readTypedDependency({ ...row, workPackageId: row.successorWorkPackageId });
  return {
    ...local,
    predecessor: { ...local.predecessor, workPackageId: row.predecessorWorkPackageId },
  };
}

/**
 * Current definition ownership and explicit package membership on the supplied snapshot.
 * Identity evidence deliberately excludes transient leafhood during incident staging;
 * assertEndpointsHeld separately validates node/descendant shape before writes.
 * Explicit package values are archived identity evidence, not leaf applicability.
 */
function assertEvidence(
  tx: Pick<Drizzle, 'select'>,
  row: StoredTypedDependency,
): string | undefined {
  assertOwner(row);
  for (const endpoint of [row.predecessor, row.successor]) {
    const owner = tx
      .select({ workPackageId: workItem.workPackageId })
      .from(workItem)
      .where(eq(workItem.id, endpoint.workItemId))
      .get();
    // Proof: removing this evidence check returned an orphan in `refuses missing work-item and organization evidence on reads` (2026-10-22).
    if (owner?.workPackageId !== endpoint.workPackageId) {
      throw new Error(
        `typed dependency ${row.id} names work item ${endpoint.workItemId} outside work package ${endpoint.workPackageId}`,
      );
    }
    if (endpoint.scope !== 'whole') {
      const owner = tx
        .select({
          definitionOrganizationId: stepDefinition.organizationId,
          packageOrganizationId: workPackageOrganization.organizationId,
        })
        .from(workPackageStep)
        .innerJoin(stepDefinition, eq(stepDefinition.id, workPackageStep.stepId))
        .innerJoin(
          workPackageOrganization,
          eq(workPackageOrganization.resourceId, workPackageStep.workPackageId),
        )
        .innerJoin(organization, eq(organization.id, workPackageOrganization.organizationId))
        .where(
          and(
            eq(workPackageStep.workPackageId, endpoint.workPackageId),
            eq(workPackageStep.stepId, endpoint.stepId),
          ),
        )
        .get();
      // Proof: removing this check returned a missing step in `refuses missing steps and mismatched recorded organization evidence on reads` (2026-10-22).
      if (owner === undefined || owner.definitionOrganizationId !== owner.packageOrganizationId) {
        throw new Error(
          `typed dependency ${row.id} names step ${endpoint.stepId} outside work package ${endpoint.workPackageId}`,
        );
      }
    }
  }
  if (row.predecessor.workPackageId === row.successor.workPackageId) return undefined;
  const predecessor = tx
    .select()
    .from(workPackageOrganization)
    .where(eq(workPackageOrganization.resourceId, row.predecessor.workPackageId))
    .get();
  const successor = tx
    .select()
    .from(workPackageOrganization)
    .where(eq(workPackageOrganization.resourceId, row.successor.workPackageId))
    .get();
  // Proof: bypassing matching mappings made `refuses missing work-item and organization evidence on reads` return the unmapped external row (2026-10-22).
  if (predecessor === undefined || predecessor.organizationId !== successor?.organizationId) {
    throw new Error(`typed dependency ${row.id} requires matching organization ownership`);
  }
  return predecessor.organizationId;
}

/**
 * Both physical reads and all evidence reads share the caller's explicit transaction.
 * UNION-equivalent reads therefore cannot miss a concurrent representation move.
 * Duplicate identities and keys are corruption, never deduplicated.
 * Proof: removing the owned-read transaction made `keeps a coherent union while a rival
 * commits a representation move between component reads` fail with duplicate identity
 * instead of the original snapshot (2026-10-22).
 */
function readPhysical(
  tx: Pick<Drizzle, 'select'>,
  select:
    | { readonly workPackages: readonly string[] }
    | { readonly owner: string }
    | { readonly id: string }
    | { readonly workItems: readonly string[] },
): PhysicalDependency[] {
  const localFilter =
    'owner' in select
      ? eq(typedDependency.workPackageId, select.owner)
      : 'workPackages' in select
        ? inArray(typedDependency.workPackageId, select.workPackages)
        : 'id' in select
          ? eq(typedDependency.id, select.id)
          : or(
              inArray(typedDependency.predecessorWorkItemId, select.workItems),
              inArray(typedDependency.successorWorkItemId, select.workItems),
            );
  const externalFilter =
    'owner' in select
      ? eq(externalDependency.successorWorkPackageId, select.owner)
      : 'workPackages' in select
        ? or(
            inArray(externalDependency.predecessorWorkPackageId, select.workPackages),
            inArray(externalDependency.successorWorkPackageId, select.workPackages),
          )
        : 'id' in select
          ? eq(externalDependency.id, select.id)
          : or(
              inArray(externalDependency.predecessorWorkItemId, select.workItems),
              inArray(externalDependency.successorWorkItemId, select.workItems),
            );
  const physical: PhysicalDependency[] = [
    ...tx
      .select()
      .from(typedDependency)
      .where(localFilter)
      .all()
      .map((row) => ({ external: false as const, row, dependency: readTypedDependency(row) })),
    ...tx
      .select()
      .from(externalDependency)
      .where(externalFilter)
      .all()
      .map((row) => ({ external: true as const, row, dependency: readExternalDependency(row) })),
  ];
  const localIds = physical.filter((stored) => !stored.external).map(({ row }) => row.id);
  const externalIds = physical.filter((stored) => stored.external).map(({ row }) => row.id);
  const duplicate = [
    ...tx
      .select({ id: externalDependency.id })
      .from(externalDependency)
      .where(inArray(externalDependency.id, localIds))
      .all(),
    ...tx
      .select({ id: typedDependency.id })
      .from(typedDependency)
      .where(inArray(typedDependency.id, externalIds))
      .all(),
  ].at(0);
  // Proof: bypassing this counterpart lookup guard made all five `refuses a physical identity hidden by the %s filter before any mutation` cases resolve instead of refusing (2026-10-22).
  if (duplicate !== undefined) throw new Error(`duplicate unified dependency ${duplicate.id}`);
  const keys = new Set<string>();
  for (const stored of physical) {
    const { dependency } = stored;
    const key = formatTypedDependencyKey(dependency);
    // Proof: removing this key check admitted corrupt rows in `refuses duplicate trusted endpoint keys even when physical uniqueness is corrupted` (2026-10-22).
    if (keys.has(key)) throw new Error(`duplicate unified dependency ${dependency.id}`);
    keys.add(key);
    const organizationId = assertEvidence(tx, dependency);
    // Proof: bypassing this comparison returned the foreign recorded organization in `refuses missing steps and mismatched recorded organization evidence on reads` (2026-10-22).
    if (stored.external && stored.row.organizationId !== organizationId)
      throw new Error(`typed dependency ${dependency.id} has inconsistent organization ownership`);
  }
  return physical.sort((left, right) => left.dependency.id.localeCompare(right.dependency.id));
}

/** Borrows the caller's snapshot and strict physical/evidence decoder without acquiring another owner. */
export function readIncidentDependenciesIn(
  tx: Pick<Drizzle, 'select'>,
  workPackageIds: readonly string[],
): StoredTypedDependency[] {
  if (workPackageIds.length === 0) return [];
  return readPhysical(tx, { workPackages: [...new Set(workPackageIds)] }).map(
    ({ dependency }) => dependency,
  );
}

function requirePhysical(tx: Transaction, id: string): PhysicalDependency {
  const prior = readPhysical(tx, { id });
  const stored = prior.at(0);
  // Proof: returning on a missing row made `refuses update of an unknown id` and `refuses removal of an unknown id` resolve without refusing; watched 2026-09-27.
  if (stored === undefined) throw new Error(`typed dependency ${id} does not exist`);
  return stored;
}

function deletePhysical(tx: Transaction, stored: PhysicalDependency): void {
  if (stored.external)
    tx.delete(externalDependency).where(eq(externalDependency.id, stored.row.id)).run();
  else tx.delete(typedDependency).where(eq(typedDependency.id, stored.row.id)).run();
}

/** Typed links move both endpoint revisions in the same transaction as each write. */
export class TypedDependencyRepository implements TypedDependencyStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  /** {@link TypedDependencyStore.hasDeletingEndpoint} on the caller's borrowed writer. */
  async hasDeletingEndpoint(row: StoredTypedDependency): Promise<boolean> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      let deleting = false;
      for (const endpoint of [row.predecessor, row.successor]) {
        const target = tx
          .select({ pendingAt: workPackage.optimizationDeletePendingAt })
          .from(workPackage)
          .where(eq(workPackage.id, endpoint.workPackageId))
          .get();
        // Proof: accepting absence returned false instead of the named missing-work-package
        // error in typed authoring admission storage tests (2026-10-22).
        if (target === undefined)
          throw new Error(`missing endpoint work package ${endpoint.workPackageId}`);
        // Proof: removing decoding accepted SQLite's quoted missing-column literal
        // after marker-column rename in the unreadable-state test (2026-10-22).
        if (target.pendingAt !== null && typeof target.pendingAt !== 'number')
          throw new Error(
            `unreadable endpoint work package deletion state ${endpoint.workPackageId}`,
          );
        // Proof: forcing this predicate false restored mounted add/update HTTP500
        // instead of work_package_deleting HTTP409 with complete rollback (2026-10-22).
        if (target.pendingAt !== null) deleting = true;
      }
      return deleting;
    });
  }

  /** Raw staging writes stay inside the admitted outer UoW; no async SQLite callback. */
  readonly incidents: IncidentDependencyStore = {
    capture: async (id) => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const stored = requirePhysical(tx, id);
        return {
          dependency: stored.dependency,
          createdAt: stored.row.createdAt,
          createdBy: stored.row.createdBy,
        };
      });
    },
    detach: async (receipt) => {
      await this.gate.enter(async () => {
        await Promise.resolve();
        this.db.transaction((tx) => {
          const stored = requirePhysical(tx, receipt.dependency.id);
          const current: IncidentReceipt = {
            dependency: stored.dependency,
            createdAt: stored.row.createdAt,
            createdBy: stored.row.createdBy,
          };
          // Proof: bypass let stale type evidence detach the edited row, 2026-10-22.
          if (JSON.stringify(current) !== JSON.stringify(receipt))
            throw new Error('incident receipt changed');
          deletePhysical(tx, stored);
        });
      });
    },
    restore: async (receipt, previous, stamp) => {
      await this.gate.enter(async () => {
        await Promise.resolve();
        this.db.transaction((tx) => {
          const row = receipt.dependency;
          // Proof: independently removing ID or owner equality restored a replacement ID or reversed foreign ownership, 2026-10-22.
          if (row.id !== previous.id || row.workPackageId !== previous.workPackageId)
            throw new Error('incident restoration cannot change identity or owner');
          // Proof: omission deferred reused-ID refusal to SQLite uniqueness instead of the required staging diagnostic, 2026-10-22.
          if (readPhysical(tx, { id: row.id }).length !== 0)
            throw new Error(`incident dependency ${row.id} already exists`);
          const organizationId = assertEndpointsHeld(tx, row);
          // Proof: removing auditOnCreate from either insert failed the source audit
          // and its local/external restore cases on updated_at (2026-10-23).
          // Removing the creation overrides failed authored and legacy-null cases
          // for each physical table in external-dependency-migration.db.test.ts.
          if (organizationId === undefined) {
            tx.insert(typedDependency)
              .values({
                id: row.id,
                ...mapStoredColumns(row),
                ...auditOnCreate(stamp),
                createdAt: receipt.createdAt,
                createdBy: receipt.createdBy,
              })
              .run();
          } else {
            tx.insert(externalDependency)
              .values({
                id: row.id,
                ...mapStoredColumns(row),
                organizationId,
                predecessorWorkPackageId: row.predecessor.workPackageId,
                successorWorkPackageId: row.successor.workPackageId,
                ...auditOnCreate(stamp),
                createdAt: receipt.createdAt,
                createdBy: receipt.createdBy,
              })
              .run();
          }
          bumpWorkItems(
            tx,
            [
              previous.predecessor.workItemId,
              previous.successor.workItemId,
              row.predecessor.workItemId,
              row.successor.workItemId,
            ],
            stamp,
          );
        });
      });
    },
  };

  async listByWorkPackage(workPackageId: string): Promise<StoredTypedDependency[]> {
    await Promise.resolve();
    return this.db.transaction((tx) =>
      readPhysical(tx, { owner: workPackageId }).map(({ dependency }) => dependency),
    );
  }

  async listIncident(workPackageIds: readonly string[]): Promise<StoredTypedDependency[]> {
    await Promise.resolve();
    if (workPackageIds.length === 0) return [];
    return this.db.transaction((tx) => readIncidentDependenciesIn(tx, workPackageIds));
  }

  async add(row: StoredTypedDependency, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const organizationId = assertEndpointsHeld(tx, row);
        if (organizationId === undefined) {
          tx.insert(typedDependency)
            .values({ id: row.id, ...mapStoredColumns(row), ...auditOnCreate(stamp) })
            .run();
        } else {
          tx.insert(externalDependency)
            .values({
              id: row.id,
              ...mapStoredColumns(row),
              organizationId,
              predecessorWorkPackageId: row.predecessor.workPackageId,
              successorWorkPackageId: row.successor.workPackageId,
              ...auditOnCreate(stamp),
            })
            .run();
        }
        bumpWorkItems(tx, [row.predecessor.workItemId, row.successor.workItemId], stamp);
      });
    });
  }

  async update(row: StoredTypedDependency, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const prior = requirePhysical(tx, row.id);
        // Proof: bypassing only this comparison accepted a coherent destination owner and both valid destination endpoints in `refuses moving a typed dependency to another workPackage without changing rows or revisions` (2026-10-22).
        if (prior.dependency.workPackageId !== row.workPackageId)
          throw new Error(
            `typed dependency ${row.id} cannot move to work package ${row.workPackageId}`,
          );
        const organizationId = assertEndpointsHeld(tx, row);
        const isExternal = organizationId !== undefined;
        if (prior.external !== isExternal) {
          deletePhysical(tx, prior);
          if (organizationId === undefined) {
            // A physical insert is a logical update: preserve even legacy null creation audit.
            tx.insert(typedDependency)
              .values({
                id: row.id,
                ...mapStoredColumns(row),
                ...auditOnCreate(stamp),
                createdAt: prior.row.createdAt,
                createdBy: prior.row.createdBy,
              })
              .run();
          } else {
            tx.insert(externalDependency)
              .values({
                id: row.id,
                ...mapStoredColumns(row),
                organizationId,
                predecessorWorkPackageId: row.predecessor.workPackageId,
                successorWorkPackageId: row.successor.workPackageId,
                ...auditOnCreate(stamp),
                createdAt: prior.row.createdAt,
                createdBy: prior.row.createdBy,
              })
              .run();
          }
        } else if (organizationId === undefined) {
          tx.update(typedDependency)
            .set({ ...mapStoredColumns(row), ...auditOnUpdate(stamp) })
            .where(eq(typedDependency.id, row.id))
            .run();
        } else {
          tx.update(externalDependency)
            .set({
              ...mapStoredColumns(row),
              organizationId,
              predecessorWorkPackageId: row.predecessor.workPackageId,
              successorWorkPackageId: row.successor.workPackageId,
              ...auditOnUpdate(stamp),
            })
            .where(eq(externalDependency.id, row.id))
            .run();
        }
        bumpWorkItems(
          tx,
          [
            prior.row.predecessorWorkItemId,
            prior.row.successorWorkItemId,
            row.predecessor.workItemId,
            row.successor.workItemId,
          ],
          stamp,
        );
      });
    });
  }

  async remove(id: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const prior = requirePhysical(tx, id);
        deletePhysical(tx, prior);
        bumpWorkItems(tx, [prior.row.predecessorWorkItemId, prior.row.successorWorkItemId], stamp);
      });
    });
  }

  async removeAllFor(
    workItemIds: readonly string[],
    stamp: WriteStamp,
  ): Promise<StoredTypedDependency[]> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      if (workItemIds.length === 0) return [];
      return this.db.transaction((tx) => {
        const doomed = new Set(workItemIds);
        const losing = readPhysical(tx, { workItems: workItemIds });
        // Proof: bypassing the guard removed a surviving work package's prerequisite in `protects surviving external successors and permits deleting both ends` (2026-10-22).
        if (
          losing.some(
            (stored) =>
              stored.external &&
              doomed.has(stored.row.predecessorWorkItemId) &&
              !doomed.has(stored.row.successorWorkItemId),
          )
        ) {
          throw new Error('external dependency predecessor has a surviving successor');
        }
        for (const stored of losing) deletePhysical(tx, stored);
        bumpWorkItems(
          tx,
          losing
            .flatMap(({ row }) => [row.predecessorWorkItemId, row.successorWorkItemId])
            .filter((id) => !doomed.has(id)),
          stamp,
        );
        return losing.map(({ dependency }) => dependency);
      });
    });
  }
}
