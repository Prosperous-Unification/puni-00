import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { workPackage, workPackageAbbreviation, workPackageOrganization } from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];
type Connection = SQLiteBunDatabase | Transaction;

/** A normalized persisted address, scoped to its organization's explicit namespace. */
export interface StoredWorkPackageAbbreviation {
  readonly workPackageId: string;
  readonly namespace: string;
  readonly abbreviation: string;
}

/**
 * Reads persisted state, answering undefined only for an absent work package.
 * @throws When an existing work package has missing or malformed trusted abbreviation state.
 */
export function readWorkPackageAbbreviation(
  db: Connection,
  workPackageId: string,
): StoredWorkPackageAbbreviation | undefined {
  const stored = db
    .select({
      workPackageId: workPackage.id,
      organizationId: workPackageOrganization.organizationId,
      namespace: workPackageAbbreviation.namespace,
      abbreviation: workPackageAbbreviation.abbreviation,
    })
    .from(workPackage)
    .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
    .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
    .where(eq(workPackage.id, workPackageId))
    .get();
  if (stored === undefined) return undefined;
  return decodeWorkPackageAbbreviation(stored);
}

/** Validates joined trusted state without issuing another query. Missing or malformed state throws. */
export function decodeWorkPackageAbbreviation(stored: {
  readonly workPackageId: string;
  readonly organizationId: string | null;
  readonly namespace: string | null;
  readonly abbreviation: string | null;
}): StoredWorkPackageAbbreviation {
  // Proof: returning undefined here failed `storage read and write require a persisted row` (2026-10-22).
  // Proof: defaulting the absent foreign address returned unsafe 201 in both mounted save modes (mounted-save-refusal/absent-abbreviation.log).
  if (stored.abbreviation === null || stored.namespace === null)
    throw new Error(`work package ${stored.workPackageId} abbreviation is missing`);
  // Proof: disabling this guard returned bad.code in `storage read refuses malformed trusted code` (2026-10-22).
  if (!/^[A-Z][A-Z0-9_-]{0,19}$/.test(stored.abbreviation))
    throw new Error(`work package ${stored.workPackageId} abbreviation is malformed`);
  // Proof: the guard's absence returned org:b for org:a in `storage read refuses forged trusted namespace` (2026-10-22).
  const namespace = stored.organizationId === null ? 'legacy' : `org:${stored.organizationId}`;
  // Proof: removing this guard made mounted `rejects forged trusted namespaces before rendering workPackage labels` return 200 instead of 500 (2026-10-22).
  if (stored.namespace !== namespace)
    throw new Error(`work package ${stored.workPackageId} abbreviation namespace is malformed`);
  return {
    workPackageId: stored.workPackageId,
    namespace: stored.namespace,
    abbreviation: stored.abbreviation,
  };
}

/**
 * Changes a normalized code on the caller's connection or borrowed transaction.
 * SQL enforces grammar and namespace uniqueness; callers translate modeled conflicts.
 * User edits must accompany the parent work package audit/revision update in the same transaction;
 * legacy allocator and migration writes retain the parent creation audit.
 * @throws When the required persisted row is missing or SQL refuses the value.
 */
export function writeWorkPackageAbbreviation(
  db: Connection,
  workPackageId: string,
  abbreviation: string,
): void {
  const changed = db
    .update(workPackageAbbreviation)
    .set({ abbreviation })
    .where(eq(workPackageAbbreviation.workPackageId, workPackageId))
    .returning({ workPackageId: workPackageAbbreviation.workPackageId })
    .all();
  // Proof: disabling this guard silently skipped a missing row in `storage read and write require a persisted row` (2026-10-22).
  if (changed.length !== 1)
    throw new Error(`work package ${workPackageId} abbreviation is missing`);
}
