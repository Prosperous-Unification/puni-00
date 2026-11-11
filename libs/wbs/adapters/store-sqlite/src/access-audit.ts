import type { AccessActor, AccessGrantRecord, OrganizationAuditDetail } from '@wbs/core';
import type { GrantOrigin } from '@wbs/domain';

import type { Drizzle } from './db';
import { appendOrganizationAudit } from './organization-audit-log';

type OperationOrigin = Exclude<GrantOrigin, 'backfill'> | 'cascade';

/** The actual access owner's audit identity; an operator is never a reconstructed account. */
export function readAccessActorId(actor: AccessActor): string {
  // Proof: operator-actual-actor: substituting the operator identity failed `grants a current member with origin operator and no creator, and prints the count`;
  // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
  return actor.kind === 'user' ? actor.userId : 'operator:' + actor.login;
}

/** Standalone administration is a route act or the explicit host-operator act. */
export function readAccessOperationOrigin(actor: AccessActor): 'route' | 'operator' {
  return actor.kind === 'operator' ? 'operator' : 'route';
}

/**
 * Appends actual grant evidence on its mutation owner's connection, without a gate/transaction.
 * `origin` describes this operation, independently of the grant's historical stored origin.
 * Event IDs belong to the owner and differ from grant IDs and other cascade event IDs.
 * @throws on every audit failure; the owner must roll its mutation back with this append.
 */
export function appendGrantAudit(
  tx: Pick<Drizzle, 'insert'>,
  evidence: {
    readonly grant: AccessGrantRecord;
    readonly action: 'access_granted' | 'access_revoked';
    readonly auditId: string;
    readonly actorId: string;
    readonly at: number;
    readonly origin: OperationOrigin;
  },
): void {
  const { grant, action, auditId, actorId, at, origin } = evidence;
  const scopeId =
    grant.scope.kind === 'organization'
      ? grant.organizationId
      : grant.scope.kind === 'project'
        ? grant.scope.projectId
        : grant.scope.workPackageId;
  let subjectId: string;
  switch (grant.subject.kind) {
    case 'user':
      subjectId = grant.subject.userId;
      break;
    case 'group':
      subjectId = grant.subject.groupId;
      break;
    case 'organization_members':
      subjectId = grant.organizationId;
      break;
    case 'machine_credential':
      subjectId = grant.subject.credentialId;
      break;
  }
  const detail: OrganizationAuditDetail = {
    roleId: grant.roleId,
    scopeKind: grant.scope.kind,
    scopeId,
    subjectKind: grant.subject.kind,
    subjectId,
    origin,
  };
  appendOrganizationAudit(tx, {
    id: auditId,
    organizationId: grant.organizationId,
    actorId,
    action,
    subjectKind: 'access_grant',
    subjectId: grant.id,
    detail,
    at,
  });
}
