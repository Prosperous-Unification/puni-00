import {
  type CredentialRuleFacts,
  type CredentialRuleRefusal,
  credentialRuleRefusal,
  type OrganizationAccess,
  type OrganizationAccessResolution,
  type OrganizationPrincipal,
  subjectPrefixOf,
} from '@wbs/core';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@wbs/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readOrganizationActivation } from './organization-activation';
import { organizationMembership } from './schema';
import { checkedPolicy } from './session-policy';

/**
 * The organization a user's session is bound to, or null when it is bound to
 * none. Task 2.4 binds the browser's active organization to the WBS session and
 * supplies the real source; until then production passes
 * {@link NO_BOUND_ORGANIZATION}.
 */
export type ActiveOrganizationOf = (principal: OrganizationPrincipal) => Promise<string | null>;

/** Keeps existing user-only test fixtures explicit during the session-bound migration. */
export function userBoundOrganizationOf(
  userOrganization: (userId: string) => Promise<string | null>,
): ActiveOrganizationOf {
  return (principal) => userOrganization(principal.id);
}

/**
 * No session is bound to an organization yet. After activation every protected
 * project request is therefore a typed 403, which is the fail-closed answer
 * for a release that must not be activated before task 2.4 ships.
 */
export const NO_BOUND_ORGANIZATION: ActiveOrganizationOf = () => Promise.resolve(null);

/**
 * {@link OrganizationAccess} over the shared database.
 *
 * The activation marker is re-read on every call because blue and green share
 * SQLite and either may be running when the marker is committed. Only an
 * explicit `pre_activation` answers `legacy`; a broken marker throws and the
 * request fails as a server error. After activation the bound organization
 * must still list the user as a member **now**, so a removed member's live
 * token stops working on its next request. A verified delegation's
 * organization takes the place of the session's binding; before activation
 * it is ignored like every other organization claim.
 */
export class SqliteOrganizationAccess implements OrganizationAccess {
  /**
   * `now` is the evaluating service's injected clock (ADR 0012), read once
   * per evaluation for session policy; never `Date.now` inside the rule.
   */
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly activeOrganizationOf: ActiveOrganizationOf,
    private readonly now: () => number,
  ) {}

  /**
   * The credential rules for `principal` entering `organizationId` now, as
   * browser selection and the membership listing ask them: a membership
   * refusal, a rule's refusal, or null to admit.
   *
   * Only the pair that authenticated THIS credential counts. Proof:
   * evaluating any pair linked to the user instead of
   * `principal.authentication` made `does not lend a linked SSO pair to a
   * social credential` (`organization-credential-rules.controller.db.test.ts`)
   * select A; watched 2026-10-12.
   */
  async admitTo(
    principal: OrganizationPrincipal,
    organizationId: string,
  ): Promise<'not_a_member' | CredentialRuleRefusal | null> {
    await Promise.resolve();
    const read = readAccessFacts(this.db, organizationId, principal);
    if (read === null) return 'not_a_member';
    return credentialRuleRefusal(
      organizationId,
      read.facts,
      { authentication: principal.authentication, delegated: principal.delegation !== undefined },
      this.now(),
    );
  }

  async resolve(principal: OrganizationPrincipal): Promise<OrganizationAccessResolution> {
    const userId = principal.id;
    // Proof: answering `legacy` without reading the marker made `scopes the same
    // running app once another connection activates isolation` in
    // `project-organization.controller.db.test.ts` still list both
    // organizations' projects after activation; watched 2026-09-27.
    if (readOrganizationActivation(this.db) === 'pre_activation') {
      // A delegation names one organization, which does not exist as an
      // authority before activation; it must never widen into deployment-wide
      // legacy access.
      // Proof: answering `legacy` for a delegation made `refuses a verified
      // delegation before activation` in `delegation.controller.db.test.ts`
      // list every organization's projects; watched 2026-09-28.
      if (principal.delegation !== undefined)
        return { ok: false, refusal: 'no_active_organization' };
      return { ok: true, access: { kind: 'legacy' } };
    }
    // A verified delegation (task 2.5) carries its organization; a session
    // takes the one it is bound to. Membership is rechecked below either way.
    // Proof: taking the session's binding instead of the delegation's made
    // `lists only the delegated organization's projects` in
    // `delegation.controller.db.test.ts` answer 403; watched 2026-09-28.
    const organizationId =
      principal.delegation === undefined
        ? await this.activeOrganizationOf(principal)
        : principal.delegation.organizationId;
    // Proof: answering `legacy` here instead made `refuses a session bound to no
    // organization before any lookup` in
    // `project-organization.controller.db.test.ts` answer 200 for the list;
    // watched 2026-09-27.
    if (organizationId === null) return { ok: false, refusal: 'no_active_organization' };
    // Proof: skipping this membership lookup (scoping to the bound organization
    // as a member) made `refuses a removed member on the next request` in
    // `project-organization.controller.db.test.ts` receive 200 instead of 403;
    // watched 2026-09-27.
    const read = readAccessFacts(this.db, organizationId, principal);
    if (read === null) return { ok: false, refusal: 'not_a_member' };
    const refused = credentialRuleRefusal(
      organizationId,
      read.facts,
      { authentication: principal.authentication, delegated: principal.delegation !== undefined },
      this.now(),
    );
    if (refused !== null) return { ok: false, ...refused };
    return {
      ok: true,
      access: { kind: 'scoped', scope: { organizationId, userId, role: read.role } },
    };
  }
}

/**
 * A membership recheck alone, for a read that already passed the credential
 * rules at its route's admission and only asks whether the member was removed
 * since (the chain snapshot's own connection).
 */
export function currentMembershipAccess(
  db: Pick<SQLiteBunDatabase, 'select'>,
  organizationId: string,
  userId: string,
):
  | Extract<OrganizationAccessResolution, { ok: true }>
  | { readonly ok: false; readonly refusal: 'not_a_member' } {
  const membership = db
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, userId),
      ),
    )
    .get();
  if (membership === undefined) return { ok: false, refusal: 'not_a_member' };
  return {
    ok: true,
    access: {
      kind: 'scoped',
      scope: { organizationId, userId, role: validateStoredRole(membership.role, organizationId) },
    },
  };
}

interface FactsRow {
  readonly role: string;
  readonly strategy: string | null;
  readonly auth0Connection: string | null;
  readonly loginSlug: string | null;
  readonly maxSessionSeconds: number | null;
  readonly reauthenticateAfterSeconds: number | null;
  readonly lifecycleUserId: string | null;
  readonly openedAt: number | null;
  readonly reauthenticatedAt: number | null;
}

function checkedTime(value: number | null, what: string): number | null {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0))
    throw new Error(`browser lifecycle ${what} is malformed`);
  return value;
}

/**
 * Membership, the organization's enforced proven connections, its session
 * policy and the credential's browser lifecycle times, in ONE query: the
 * membership recheck every resolution already made, joined, so the credential
 * rules add no query (`organization-session-policy`). Null for no membership.
 *
 * @throws on a malformed role, connection, policy or lifecycle, or a
 * lifecycle that belongs to another user: corrupt trusted state.
 */
function readAccessFacts(
  db: Pick<SQLiteBunDatabase, 'all'>,
  organizationId: string,
  principal: OrganizationPrincipal,
): { readonly role: OrganizationRole; readonly facts: CredentialRuleFacts } | null {
  const credential = principal.organizationBinding?.credential;
  // Only an OIDC browser credential belongs to a lifecycle; a native one's
  // times come from its own issue time.
  const digest = credential?.kind === 'oidc' ? credential.digest : null;
  // Proof: reading the policy in a second query made `reads the credential
  // rules in the membership query` in `organization-credential-rules.db.test.ts`
  // count four statements per resolution instead of three; watched 2026-10-12.
  const rows = db.all<FactsRow>(sql`SELECT m.role AS role,
      c.strategy AS strategy, c.auth0_connection AS auth0Connection, c.login_slug AS loginSlug,
      p.max_session_seconds AS maxSessionSeconds,
      p.reauthenticate_after_seconds AS reauthenticateAfterSeconds,
      l.user_id AS lifecycleUserId, l.opened_at AS openedAt,
      l.reauthenticated_at AS reauthenticatedAt
    FROM organization_membership m
    LEFT JOIN organization_sso_connection c ON c.organization_id = m.organization_id
      AND c.enforced = 1 AND c.proven_at IS NOT NULL
    LEFT JOIN organization_session_policy p ON p.organization_id = m.organization_id
    LEFT JOIN browser_auth_association a ON a.kind = 'oidc' AND a.credential_digest = ${digest}
    LEFT JOIN browser_auth_lifecycle l ON l.session_digest = a.session_digest
    WHERE m.organization_id = ${organizationId} AND m.user_id = ${principal.id}
    ORDER BY c.login_slug`);
  const first = rows.at(0);
  if (first === undefined) return null;
  const role = validateStoredRole(first.role, organizationId);
  const enforced = rows.flatMap((row) => {
    if (row.strategy === null && row.auth0Connection === null && row.loginSlug === null) return [];
    if (
      (row.strategy !== 'samlp' && row.strategy !== 'oidc') ||
      row.auth0Connection === null ||
      row.loginSlug === null
    )
      throw new Error(`an enforced connection of organization "${organizationId}" is malformed`);
    return [
      {
        prefix: subjectPrefixOf({ strategy: row.strategy, auth0Connection: row.auth0Connection }),
        loginSlug: row.loginSlug,
      },
    ];
  });
  const policy =
    first.maxSessionSeconds === null && first.reauthenticateAfterSeconds === null
      ? null
      : checkedPolicy(
          {
            maxSessionSeconds: first.maxSessionSeconds,
            reauthenticateAfterSeconds: first.reauthenticateAfterSeconds,
          },
          organizationId,
        );
  if (first.lifecycleUserId !== null && first.lifecycleUserId !== principal.id)
    throw new Error('a browser lifecycle belongs to another user than its credential');
  const lifecycle =
    first.lifecycleUserId === null
      ? null
      : {
          openedAt: checkedTime(first.openedAt, 'opened_at'),
          reauthenticatedAt: checkedTime(first.reauthenticatedAt, 'reauthenticated_at'),
        };
  return { role, facts: { enforced, policy, lifecycle } };
}

/**
 * The stored role, checked rather than trusted: the column's type is only what
 * the schema declares, and an unknown role reaching the policy would be read as
 * a writing one.
 *
 * Proof: returning the stored value unchecked made `fails as a server error on
 * a malformed membership role` in `project-organization.controller.db.test.ts`
 * answer 200 instead of 500; watched 2026-09-27.
 *
 * @throws when the stored role is not one of {@link ORGANIZATION_ROLES}.
 */
export function validateStoredRole(role: string, organizationId: string): OrganizationRole {
  const known: readonly string[] = ORGANIZATION_ROLES;
  if (!known.includes(role)) {
    throw new Error(`membership in organization "${organizationId}" has a malformed role`);
  }
  // Narrowed by the membership test above, which is the boundary this is.
  return role as OrganizationRole;
}
