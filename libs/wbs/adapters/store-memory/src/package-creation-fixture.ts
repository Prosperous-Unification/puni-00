import {
  type AccessGrantRecord,
  isSecretShaped,
  type OrganizationAuditRecord,
  type Project,
  type User,
  type WorkPackageCreatorGrant,
  type WriteStamp,
} from '@wbs/core';
import { type AccessObjectKind, BUILT_IN_ROLES, roleFitsScope } from '@wbs/domain';

/** Required creation rows owned and staged by the memory Source, without a synthetic permission decision. */
export interface MemoryPackageCreationTables {
  readonly activation: { state: 'pre_activation' | 'activated' };
  readonly roles: Map<string, AccessObjectKind>;
  readonly grants: Map<string, AccessGrantRecord>;
  readonly audits: Map<string, OrganizationAuditRecord>;
  readonly projects: Map<string, Project>;
  readonly creators: Map<string, string>;
}

/** Actual Source account/membership/organization maps used by the borrowed creation writer. */
export interface MemoryPackageCreationContext {
  readonly users: ReadonlyMap<string, User>;
  readonly organizations: ReadonlyMap<string, { readonly legacy: boolean }>;
  readonly memberships: ReadonlyMap<string, ReadonlySet<string>>;
  readonly ownership: Map<string, string>;
}

/** Real seeded built-ins and empty persisted rows; absence of members never grants creation access. */
export function memoryPackageCreationTables(): MemoryPackageCreationTables {
  return {
    activation: { state: 'pre_activation' },
    roles: new Map(BUILT_IN_ROLES.map((role) => [role.id, role.objectKind])),
    grants: new Map(),
    audits: new Map(),
    projects: new Map(),
    creators: new Map(),
  };
}

/** Legacy standalone fixtures have no scoped organization state and therefore refuse scoped creation. */
export function emptyPackageCreationContext(): MemoryPackageCreationContext {
  return {
    users: new Map(),
    organizations: new Map(),
    memberships: new Map(),
    ownership: new Map(),
  };
}

/** Writes the fixed creator grant and its exact audit evidence on the caller's staged tables; every refusal throws through that owner. */
export function writePackageCreatorGrantIn(
  tables: MemoryPackageCreationTables,
  context: MemoryPackageCreationContext,
  organizationId: string,
  workPackageId: string,
  stamp: WriteStamp,
  identities: WorkPackageCreatorGrant,
): void {
  const kind = tables.roles.get('package-manager');
  if (kind === undefined) throw new Error('package creator grant refused: unknown_role');
  if (!roleFitsScope(kind, 'work_package'))
    throw new Error('package creator grant refused: role_scope_mismatch');
  if (
    !context.organizations.has(organizationId) ||
    context.ownership.get(workPackageId) !== organizationId
  )
    throw new Error('package creator grant refused: not_found');
  if (!context.memberships.get(organizationId)?.has(stamp.by))
    throw new Error('package creator grant refused: not_a_member');
  if (!context.users.has(stamp.by)) throw new Error('package creator account reference is absent');
  if (tables.grants.has(identities.id)) throw new Error('duplicate package creator grant identity');
  const grant: AccessGrantRecord = {
    id: identities.id,
    organizationId,
    scope: { kind: 'work_package', workPackageId },
    subject: { kind: 'user', userId: stamp.by },
    roleId: 'package-manager',
    origin: 'creation',
    createdAt: stamp.at,
    createdBy: stamp.by,
  };
  tables.grants.set(grant.id, grant);
  if (tables.audits.has(identities.auditId))
    throw new Error('duplicate package creator audit identity');
  const detail = {
    roleId: grant.roleId,
    scopeKind: 'work_package',
    scopeId: workPackageId,
    subjectKind: 'user',
    subjectId: stamp.by,
    origin: 'creation',
  };
  if (Object.values(detail).some(isSecretShaped))
    throw new Error('audit detail would carry a secret or a full subject');
  tables.audits.set(identities.auditId, {
    id: identities.auditId,
    organizationId,
    actorId: stamp.by,
    action: 'access_granted',
    subjectKind: 'access_grant',
    subjectId: grant.id,
    detail,
    createdAt: stamp.at,
  });
}

/** Trusted modeled source state must be present and closed; legacy organization identity is not admission. */
export function readMemoryOrganizationActivation(
  activation: unknown,
): 'pre_activation' | 'activated' {
  if (
    typeof activation !== 'object' ||
    activation === null ||
    !('state' in activation) ||
    (activation.state !== 'pre_activation' && activation.state !== 'activated')
  )
    throw new Error('memory organization activation is absent or malformed');
  return activation.state;
}
