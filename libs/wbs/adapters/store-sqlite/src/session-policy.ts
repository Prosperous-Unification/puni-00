import {
  type AuditedAct,
  isAdmissibleSessionPolicy,
  retainSecurityPrincipal,
  type SecurityPrincipal,
  type SessionPolicies,
  type SessionPolicy,
} from '@wbs/core';
import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { appendOrganizationAudit } from './organization-audit-log';
import { organizationSessionPolicy } from './schema';
import { readSecurityRefusal, runSecurityTransaction } from './security-transaction';

type Reader = Pick<SQLiteBunDatabase, 'select'>;

/**
 * The organization's stored policy, or null for none.
 *
 * @throws on a stored row no admitted security administrator could have set.
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
    principal: SecurityPrincipal,
  ): Promise<SessionPolicy | null | 'inactive' | 'forbidden'> {
    // Proof: dropping this detached snapshot (snapshot-principal-session-read) failed `retains the actual queued security principal and current grant at session-read`; restored GREEN.
    principal = retainSecurityPrincipal(principal);
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readSecurityRefusal(tx, organizationId, principal);
      // Proof: removing this read guard admitted a role-only super-admin in the mounted session-policy GET negative; fault killed/restored, 2026-11-09.
      // Proof: bypassing this current permission check (permission-current-session-read) failed `encodes manage_security for a role-only super-admin on session-policy GET`; restored GREEN.
      if (refusal !== null) return refusal;
      return readSessionPolicy(tx, organizationId);
    });
  }

  set(
    organizationId: string,
    principal: SecurityPrincipal,
    policy: SessionPolicy,
    act: AuditedAct,
  ): Promise<'set' | 'cleared' | 'unchanged' | 'inactive' | 'forbidden'> {
    if (!isAdmissibleSessionPolicy(policy))
      throw new Error('session policy reached the store without boundary validation');
    // Proof: dropping this detached snapshot (snapshot-principal-session-set) failed `retains the actual queued security principal and current grant at session-set`; restored GREEN.
    principal = retainSecurityPrincipal(principal, act.actor, act.stamp.by);
    // Proof: removing the act clone changed created_by in 'retains the queued session-policy actor and policy independently of caller aliases'; killed/restored, 2026-11-09.
    // Proof: dropping this detached snapshot (snapshot-act-session-set) failed `retains detached queued security stamps and audit actors at session-set`; restored GREEN.
    act = structuredClone(act);
    // Proof: current-valid-policy-snapshot removed this clone; 'retains the queued session-policy actor and policy independently of caller aliases' persisted valid7200/3600 instead of28800/3600 and failed; restored GREEN.
    policy = structuredClone(policy);
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readSecurityRefusal(tx, organizationId, principal);
      // Proof: removing this write guard admitted a role-only super-admin in the mounted session-policy PUT negative; fault killed/restored, 2026-11-09.
      // Proof: bypassing this current permission check (permission-current-session-set) failed `encodes manage_security for a role-only super-admin on session-policy PUT`; restored GREEN.
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
    });
  }
}
