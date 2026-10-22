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
  'machine_credential_created',
  'machine_credential_rotated',
  'machine_credential_revoked',
  'trusted_issuer_registered',
  'trusted_issuer_removed',
  'organization_limits_changed',
] as const;

export type OrganizationAuditAction = (typeof ORGANIZATION_AUDIT_ACTIONS)[number];

/** What an audit row is about. */
export type OrganizationAuditSubjectKind =
  | 'project'
  | 'sso_connection'
  | 'provisioning_token'
  | 'scim_user'
  | 'session_policy'
  | 'machine_credential'
  | 'trusted_issuer'
  | 'organization_limits';

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

/**
 * A detail value that would leak what an audit row must never hold: a raw
 * provisioning token or API key, a 64-hex digest, or a full upstream subject
 * (two `|`).
 * A prefix such as `samlp|acme-saml|` is allowed; it is what the row names.
 * `appendOrganizationAudit` refuses such a detail as a programming fault, and
 * a route admitting free text that could reach a detail refuses it first.
 *
 * Proof: with the `wbs_mk_` prefix dropped, `refuses a detail carrying a
 * token, digest or full subject` stored an API-key-shaped detail; watched
 * 2026-10-22.
 */
export function isSecretShaped(value: string): boolean {
  return (
    value.startsWith('wbs_scim_') ||
    value.startsWith('wbs_mk_') ||
    /^[0-9a-f]{64}$/i.test(value) ||
    /^[^|]+\|[^|]+\|.+$/.test(value) ||
    /^[^|]+\|[^|]+$/.test(value)
  );
}
