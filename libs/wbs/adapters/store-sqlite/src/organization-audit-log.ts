import {
  isSecretShaped,
  ORGANIZATION_AUDIT_ACTIONS,
  type OrganizationAuditAction,
  type OrganizationAuditDetail,
  type OrganizationAuditLog,
  type OrganizationAuditRecord,
  type OrganizationAuditSubjectKind,
} from '@wbs/core';
import { asc, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { organizationAudit } from './schema';

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

const SUBJECT_KINDS: readonly OrganizationAuditSubjectKind[] = [
  'project',
  'sso_connection',
  'provisioning_token',
  'scim_user',
  'session_policy',
  'machine_credential',
  'trusted_issuer',
  'compute_provider',
];

/**
 * Appends one row to `tx`, so it commits or rolls back with the act it
 * records. There is deliberately no update or delete: the table is
 * append-only and its triggers refuse both.
 *
 * Proof: skipping the secret check made `refuses a detail carrying a token,
 * digest or full subject` in `enterprise-sso-stores.db.test.ts` store the row;
 * watched 2026-10-12.
 *
 * @throws when the detail carries a token, a digest or a full subject; that
 * is a programming fault, and the act rolls back with it.
 */
export function appendOrganizationAudit(
  tx: Transaction,
  row: {
    readonly id: string;
    readonly organizationId: string;
    readonly actorId: string;
    readonly action: OrganizationAuditAction;
    readonly subjectKind: OrganizationAuditSubjectKind;
    readonly subjectId: string;
    readonly detail: OrganizationAuditDetail;
    readonly at: number;
  },
): void {
  for (const value of Object.values(row.detail)) {
    const strings = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
    if (strings.some((text: string) => isSecretShaped(text)))
      throw new Error(`audit detail for ${row.action} would carry a secret or a full subject`);
  }
  tx.insert(organizationAudit)
    .values({
      id: row.id,
      organizationId: row.organizationId,
      actorId: row.actorId,
      action: row.action,
      subjectKind: row.subjectKind,
      subjectId: row.subjectId,
      detail: JSON.stringify(row.detail),
      createdAt: row.at,
    })
    .run();
}

/** {@link OrganizationAuditLog} over the shared database. */
export class SqliteOrganizationAuditLog implements OrganizationAuditLog {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * @throws when a stored action, kind or detail is malformed: an audit row
   * that cannot be read is corrupt evidence, never skipped.
   */
  async list(organizationId: string): Promise<readonly OrganizationAuditRecord[]> {
    await Promise.resolve();
    const rows = this.db
      .select()
      .from(organizationAudit)
      .where(eq(organizationAudit.organizationId, organizationId))
      .orderBy(asc(organizationAudit.createdAt), asc(organizationAudit.id))
      .all();
    return rows.map((row) => {
      const actions: readonly string[] = ORGANIZATION_AUDIT_ACTIONS;
      const kinds: readonly string[] = SUBJECT_KINDS;
      if (!actions.includes(row.action) || !kinds.includes(row.subjectKind))
        throw new Error(`organization audit row ${row.id} has a malformed action or kind`);
      const detail: unknown = JSON.parse(row.detail);
      if (typeof detail !== 'object' || detail === null || Array.isArray(detail))
        throw new Error(`organization audit row ${row.id} has a malformed detail`);
      return {
        id: row.id,
        organizationId: row.organizationId,
        actorId: row.actorId,
        // Narrowed by the vocabulary checks above, which are the boundary.
        action: row.action as OrganizationAuditAction,
        subjectKind: row.subjectKind as OrganizationAuditSubjectKind,
        subjectId: row.subjectId,
        // An object parsed from the stored JSON, checked above.
        detail: detail as OrganizationAuditDetail,
        createdAt: row.createdAt,
      };
    });
  }
}
