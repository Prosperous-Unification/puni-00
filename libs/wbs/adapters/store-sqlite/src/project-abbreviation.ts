import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { project, projectAbbreviation, projectOrganization } from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];
type Connection = SQLiteBunDatabase | Transaction;

/** A normalized persisted address, scoped to its organization's explicit namespace. */
export interface StoredProjectAbbreviation {
  readonly projectId: string;
  readonly namespace: string;
  readonly abbreviation: string;
}

/**
 * Reads persisted state, answering undefined only for an absent project.
 * @throws When an existing project has missing or malformed trusted abbreviation state.
 */
export function readProjectAbbreviation(
  db: Connection,
  projectId: string,
): StoredProjectAbbreviation | undefined {
  const stored = db
    .select({
      projectId: project.id,
      organizationId: projectOrganization.organizationId,
      namespace: projectAbbreviation.namespace,
      abbreviation: projectAbbreviation.abbreviation,
    })
    .from(project)
    .leftJoin(projectAbbreviation, eq(projectAbbreviation.projectId, project.id))
    .leftJoin(projectOrganization, eq(projectOrganization.resourceId, project.id))
    .where(eq(project.id, projectId))
    .get();
  if (stored === undefined) return undefined;
  return decodeProjectAbbreviation(stored);
}

/** Validates joined trusted state without issuing another query. Missing or malformed state throws. */
export function decodeProjectAbbreviation(stored: {
  readonly projectId: string;
  readonly organizationId: string | null;
  readonly namespace: string | null;
  readonly abbreviation: string | null;
}): StoredProjectAbbreviation {
  // Proof: returning undefined here failed `storage read and write require a persisted row` (2026-10-22).
  if (stored.abbreviation === null || stored.namespace === null)
    throw new Error(`project ${stored.projectId} abbreviation is missing`);
  // Proof: disabling this guard returned bad.code in `storage read refuses malformed trusted code` (2026-10-22).
  if (!/^[A-Z][A-Z0-9_-]{0,19}$/.test(stored.abbreviation))
    throw new Error(`project ${stored.projectId} abbreviation is malformed`);
  // Proof: the guard's absence returned org:b for org:a in `storage read refuses forged trusted namespace` (2026-10-22).
  const namespace = stored.organizationId === null ? 'legacy' : `org:${stored.organizationId}`;
  // Proof: removing this guard made mounted `rejects forged trusted namespaces before rendering project labels` return 200 instead of 500 (2026-10-22).
  if (stored.namespace !== namespace)
    throw new Error(`project ${stored.projectId} abbreviation namespace is malformed`);
  return {
    projectId: stored.projectId,
    namespace: stored.namespace,
    abbreviation: stored.abbreviation,
  };
}

/**
 * Changes a normalized code on the caller's connection or borrowed transaction.
 * SQL enforces grammar and namespace uniqueness; callers translate modeled conflicts.
 * User edits must accompany the parent project audit/revision update in the same transaction;
 * legacy allocator and migration writes retain the parent creation audit.
 * @throws When the required persisted row is missing or SQL refuses the value.
 */
export function writeProjectAbbreviation(
  db: Connection,
  projectId: string,
  abbreviation: string,
): void {
  const changed = db
    .update(projectAbbreviation)
    .set({ abbreviation })
    .where(eq(projectAbbreviation.projectId, projectId))
    .returning({ projectId: projectAbbreviation.projectId })
    .all();
  // Proof: disabling this guard silently skipped a missing row in `storage read and write require a persisted row` (2026-10-22).
  if (changed.length !== 1) throw new Error(`project ${projectId} abbreviation is missing`);
}
