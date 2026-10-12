import type { WriteStamp } from './write-stamp';

/**
 * Every act `organization_audit` records (`organization-audit`). The table's
 * CHECK holds the same list; an act outside it is refused by the store.
 */
export const ORGANIZATION_AUDIT_ACTIONS = [
  'restricted_project_recovery',
  'sso_connection_created',
  'sso_connection_updated',
  'sso_connection_deleted',
  'sso_connection_proven',
  'sso_enforcement_changed',
  'provisioning_token_issued',
  'provisioning_token_rotated',
  'provisioning_token_revoked',
  'scim_user_provisioned',
  'scim_user_updated',
  'scim_user_deprovisioned',
  'pending_membership_activated',
  'session_policy_changed',
] as const;

export type OrganizationAuditAction = (typeof ORGANIZATION_AUDIT_ACTIONS)[number];

/** What an audit row is about. */
export type OrganizationAuditSubjectKind =
  'project' | 'sso_connection' | 'provisioning_token' | 'scim_user' | 'session_policy';

/**
 * The detail one audit row keeps: flat values only, so it is reviewable at a
 * glance. It never holds a token, a token digest or a full upstream subject;
 * the store refuses a detail that looks like one.
 */
export type OrganizationAuditDetail = Readonly<
  Record<string, string | number | boolean | null | readonly string[]>
>;

/**
 * One audited act's identity: when and by whom its rows are stamped, and the
 * id its single audit row takes. Built once per act by the caller, which holds
 * the injected clock (ADR 0012); stores have no clock.
 *
 * `actor` is what the audit row names: a super-admin's user id, the acting
 * user's id for an activation, or `scim:<token id>` for a SCIM act.
 */
export interface AuditedAct {
  readonly stamp: WriteStamp;
  readonly actor: string;
  readonly auditId: string;
}

/** Reads an organization's audit rows, newest last; for administration and tests. */
export interface OrganizationAuditLog {
  list(organizationId: string): Promise<readonly OrganizationAuditRecord[]>;
}

/** One stored audit row. */
export interface OrganizationAuditRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly action: OrganizationAuditAction;
  readonly subjectKind: OrganizationAuditSubjectKind;
  readonly subjectId: string;
  readonly detail: OrganizationAuditDetail;
  readonly createdAt: number;
}
