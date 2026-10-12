import {
  type AuditedAct,
  isAdmissibleSessionPolicy,
  type SessionPolicies,
  type SessionPolicy,
} from '@wbs/core';
import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { superAdminRefusal } from './enterprise-connection';
import type { Gate } from './gate';
import { appendOrganizationAudit } from './organization-audit-log';
import { organizationSessionPolicy } from './schema';

type Reader = Pick<SQLiteBunDatabase, 'select'>;

/**
 * The organization's stored policy, or null for none.
 *
 * @throws on a stored row no super-admin could have set.
 */
export function readSessionPolicy(db: Reader, organizationId: string): SessionPolicy | null {
  const row = db
    .select({
      maxSessionSeconds: organizationSessionPolicy.maxSessionSeconds,
      reauthenticateAfterSeconds: organizationSessionPolicy.reauthenticateAfterSeconds,
    })
    .from(organizationSessionPolicy)
    .where(eq(organizationSessionPolicy.organizationId, organizationId))
    .get();
  if (row === undefined) return null;
  return checkedPolicy(row, organizationId);
}

/** @throws when `row` is not an admissible, non-empty policy. */
export function checkedPolicy(row: SessionPolicy, organizationId: string): SessionPolicy {
  if (
    (row.maxSessionSeconds === null && row.reauthenticateAfterSeconds === null) ||
    !isAdmissibleSessionPolicy(row)
  )
    throw new Error(`session policy of organization ${organizationId} is malformed`);
  return row;
}

/** {@link SessionPolicies} over the shared database. */
export class SessionPolicyRepository implements SessionPolicies {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async read(
    organizationId: string,
    actorId: string,
  ): Promise<SessionPolicy | null | 'inactive' | 'forbidden'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return refusal;
      return readSessionPolicy(tx, organizationId);
    });
  }

  set(
    organizationId: string,
    actorId: string,
    policy: SessionPolicy,
    act: AuditedAct,
  ): Promise<'set' | 'cleared' | 'unchanged' | 'inactive' | 'forbidden'> {
    if (!isAdmissibleSessionPolicy(policy))
      throw new Error('session policy reached the store without boundary validation');
    return this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          const refusal = superAdminRefusal(tx, organizationId, actorId);
          if (refusal !== null) return refusal;
          const current = readSessionPolicy(tx, organizationId);
          const clearing =
            policy.maxSessionSeconds === null && policy.reauthenticateAfterSeconds === null;
          if (
            (clearing && current === null) ||
            (current !== null &&
              current.maxSessionSeconds === policy.maxSessionSeconds &&
              current.reauthenticateAfterSeconds === policy.reauthenticateAfterSeconds)
          )
            return 'unchanged' as const;
          if (clearing)
            tx.delete(organizationSessionPolicy)
              .where(eq(organizationSessionPolicy.organizationId, organizationId))
              .run();
          else if (current === null)
            tx.insert(organizationSessionPolicy)
              .values({ organizationId, ...policy, ...auditOnCreate(act.stamp) })
              .run();
          else
            tx.update(organizationSessionPolicy)
              .set({ ...policy, ...auditOnUpdate(act.stamp) })
              .where(eq(organizationSessionPolicy.organizationId, organizationId))
              .run();
          appendOrganizationAudit(tx, {
            id: act.auditId,
            organizationId,
            actorId: act.actor,
            action: 'session_policy_changed',
            subjectKind: 'session_policy',
            subjectId: organizationId,
            detail: {
              maxSessionSeconds: policy.maxSessionSeconds,
              reauthenticateAfterSeconds: policy.reauthenticateAfterSeconds,
            },
            at: act.stamp.at,
          });
          return clearing ? ('cleared' as const) : ('set' as const);
        },
        { behavior: 'immediate' },
      );
    });
  }
}
