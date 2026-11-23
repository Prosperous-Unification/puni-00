import type {
  AddressWorkPackageKey,
  CapturedWorkPackageAddresses,
  OrganizationPrincipal,
  ResourceAccess,
  WorkPackageAddressSearchStore,
  WorkPackageAddressSnapshot,
} from '@wbs/core';
import { and, asc, eq, gt, isNull, ne, or, type SQL, sql } from 'drizzle-orm';

import { type Connection, type Drizzle, drizzleReadTransaction } from './db';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { workItem, workPackage, workPackageAbbreviation, workPackageOrganization } from './schema';
import { readCatalogueStepsIn } from './step';
import { readSqliteStepTreeIn } from './step-tree-reads';
import { decodeWorkPackageAbbreviation } from './work-package-abbreviation';
export interface WorkPackageAddressSearchOptions {
  readonly openConnection: () => Connection;
  readonly activeOrganizationOf: (db: Drizzle) => ActiveOrganizationOf;
  readonly now: () => number;
}
/** Owns a read-only connection and transaction through admission and lookup; never retains reader authority. */
export class WorkPackageAddressSearchRepository implements WorkPackageAddressSearchStore {
  constructor(private readonly options: WorkPackageAddressSearchOptions) {}
  async withSnapshot<T>(
    principal: OrganizationPrincipal,
    read: (snapshot: WorkPackageAddressSnapshot) => T | Promise<T>,
  ) {
    const connection = this.options.openConnection();
    let active = true;
    try {
      const transaction = drizzleReadTransaction(connection.db);
      // Proof: removing transaction controls failed `holds authorization metadata and selected placements in one snapshot across rival writes` (rival name/placement visible, 2026-10-22).
      transaction.begin();
      try {
        const resolved = await new SqliteOrganizationAccess(
          connection.db,
          this.options.activeOrganizationOf(connection.db),
          this.options.now,
        ).resolve(principal);
        if (!resolved.ok) {
          transaction.commit();
          return resolved;
        }
        // Proof: removing the active guard failed `closes success modeled refusal and throws and rejects retained reader capabilities` (retained access did not throw, 2026-10-22).
        const assertActive = () => {
          if (!active) throw new Error('work package address snapshot is closed');
        };
        const reader = new AddressReader(connection.db, resolved.access, assertActive);
        const value = await read(reader);
        transaction.commit();
        return { ok: true, value } as const;
      } catch (cause) {
        transaction.rollback();
        throw cause;
      }
    } finally {
      active = false;
      connection.close();
    }
  }
}
class AddressReader implements WorkPackageAddressSnapshot {
  constructor(
    private readonly db: Drizzle,
    private readonly authority: ResourceAccess,
    private readonly assertActive: () => void,
  ) {}
  get access() {
    this.assertActive();
    return this.authority;
  }
  // Proof: removing the organization predicate failed mounted alphabetic discovery (foreign AA instead of AX, 2026-10-22).
  private scope(): SQL | undefined {
    return this.authority.kind === 'legacy'
      ? undefined
      : eq(workPackageOrganization.organizationId, this.authority.scope.organizationId);
  }
  private workPackages(predicate?: SQL) {
    return this.db
      .select({
        workPackageId: workPackage.id,
        name: workPackage.name,
        organizationId: workPackageOrganization.organizationId,
        namespace: workPackageAbbreviation.namespace,
        abbreviation: workPackageAbbreviation.abbreviation,
      })
      .from(workPackage)
      .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .where(and(this.scope(), predicate));
  }
  searchWorkPackages(search: string, after: AddressWorkPackageKey | null, limit: number) {
    this.assertActive();
    // An authorized broken row must fail before a filter can hide absent code evidence.
    const anomaly = this.workPackages(
      or(
        isNull(workPackageAbbreviation.abbreviation),
        isNull(workPackageAbbreviation.namespace),
        ne(
          workPackageAbbreviation.namespace,
          sql`CASE WHEN ${workPackageOrganization.organizationId} IS NULL THEN 'legacy' ELSE 'org:' || ${workPackageOrganization.organizationId} END`,
        ),
      ),
    )
      .limit(1)
      .get();
    // Proof: bypassing anomaly decoding failed mounted `fails missing abbreviation evidence visibly even outside the discovery match` (200 instead of 500, 2026-10-22).
    if (anomaly !== undefined) decodeWorkPackageAbbreviation(anomaly);
    const lowered = search.toLowerCase();
    // Proof: removing the non-ASCII superset branch failed mounted Unicode name matching (CITY omitted for i̇stan, 2026-10-22).
    const matches = or(
      sql`substr(lower(${workPackageAbbreviation.abbreviation}),1,${lowered.length}) = ${lowered}`,
      sql`instr(lower(${workPackage.name}),${lowered}) > 0`,
      sql`${workPackage.name} GLOB '*[^ -~]*'`,
    );
    const continuation =
      after === null
        ? undefined
        : or(
            gt(workPackageAbbreviation.abbreviation, after.abbreviation),
            and(
              eq(workPackageAbbreviation.abbreviation, after.abbreviation),
              gt(workPackage.id, after.workPackageId),
            ),
          );
    return this.workPackages(and(matches, continuation))
      .orderBy(asc(workPackageAbbreviation.abbreviation), asc(workPackage.id))
      .limit(limit)
      .all()
      .map((stored) => {
        const decoded = decodeWorkPackageAbbreviation(stored);
        return {
          workPackageId: decoded.workPackageId,
          abbreviation: decoded.abbreviation,
          name: stored.name,
        };
      });
  }
  capture(workPackageId: string): CapturedWorkPackageAddresses | null {
    this.assertActive();
    const selected = this.workPackages(eq(workPackage.id, workPackageId)).get();
    if (selected === undefined) return null;
    const decoded = decodeWorkPackageAbbreviation(selected);
    const identity = {
      workPackageId: decoded.workPackageId,
      abbreviation: decoded.abbreviation,
      name: selected.name,
    };
    // Proof: removing the work package predicate failed mounted selected-work-package paging (foreign placement entered candidates, 2026-10-22).
    const placements = this.db
      .select({
        id: workItem.id,
        parentId: workItem.parentId,
        position: workItem.position,
        frozenNumber: workItem.frozenNumber,
        name: workItem.name,
      })
      .from(workItem)
      .where(eq(workItem.workPackageId, workPackageId))
      .orderBy(asc(workItem.id))
      .all();
    // Proof: removing this validation failed `rejects malformed trusted placement evidence at capture before returning detached facts` with `capture admitted malformed placement evidence`; mounted malformed-frozen-number lookup also returned 200 instead of 500 (2026-10-22).
    for (const placement of placements) {
      if (
        typeof placement.id !== 'string' ||
        typeof placement.name !== 'string' ||
        !Number.isSafeInteger(placement.position) ||
        (placement.frozenNumber !== null &&
          !/^[0-9]+(?:\.[0-9]+)*(?![\s\S])/.test(placement.frozenNumber))
      )
        throw new Error('malformed work package address placement');
    }
    return {
      workPackage: identity,
      // Proof: metadata-handoff returned plain placements; actual isolated candidate lookup500instead of200.
      placements: readSqliteStepTreeIn(this.db, workPackageId, placements),
      steps: readCatalogueStepsIn(this.db, workPackageId),
    };
  }
}
