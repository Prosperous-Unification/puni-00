import { isUnderMcpAuthorizationServer } from '@wbs/contracts';
import { and, eq, isNull } from 'drizzle-orm';

import { type Drizzle, drizzleReadTransaction } from './db';
import { machineCredential, organizationTrustedIssuer } from './schema';

/**
 * One stored row the audience rule (`wbs-mcp-agent-surface` M2) breaks: a
 * trusted issuer registration whose audience is not the authorization server
 * or under it after a `/`, or an unrevoked `oidc` credential whose effective
 * audience (its own narrowing, else its registration's) is not.
 */
export interface BreakingAudience {
  readonly kind: 'registration' | 'credential';
  readonly id: string;
  readonly organizationId: string;
  /** The audience judged; null for a registration stored without one. */
  readonly audience: string | null;
  /** The registration a credential names; null for a registration. */
  readonly trustedIssuerId: string | null;
}

/** What the audience preflight found, against one authorization server. */
export interface AudienceCheck {
  readonly authorizationServer: string;
  /** Every breaking row, registrations first, each in id order. */
  readonly breaking: readonly BreakingAudience[];
  /** The breaking rows not named in the accepted ids: the swap refuses while any is here. */
  readonly unaccepted: readonly BreakingAudience[];
}

/**
 * Lists every stored trusted issuer registration and unrevoked `oidc`
 * credential that the audience rule, judged against `authorizationServer`
 * (the candidate's `WBS_MCP_AUTHORIZATION_SERVER`), would break, so a changed
 * issuer shows too. Nothing is written: stored rows are never rewritten,
 * because the identity provider's side must change with them. A row is
 * accepted only when its own id is in `accepted` (an operator's
 * `WBS_ACCEPT_BREAKING_AUDIENCES`); naming a registration does not accept its
 * credentials. Reads one snapshot.
 *
 * @throws when a credential names a registration that is not stored, and on
 * every store failure.
 */
export function checkTrustedIssuerAudiences(
  db: Drizzle,
  authorizationServer: string,
  accepted: ReadonlySet<string>,
): AudienceCheck {
  const snapshot = drizzleReadTransaction(db);
  snapshot.begin();
  try {
    const registrations = db
      .select({
        id: organizationTrustedIssuer.id,
        organizationId: organizationTrustedIssuer.organizationId,
        audience: organizationTrustedIssuer.defaultAudience,
      })
      .from(organizationTrustedIssuer)
      .orderBy(organizationTrustedIssuer.id)
      .all();
    const credentials = db
      .select({
        id: machineCredential.id,
        organizationId: machineCredential.organizationId,
        audience: machineCredential.audience,
        trustedIssuerId: machineCredential.trustedIssuerId,
      })
      .from(machineCredential)
      .where(and(eq(machineCredential.source, 'oidc'), isNull(machineCredential.revokedAt)))
      .orderBy(machineCredential.id)
      .all();
    const isBroken = (audience: string | null) =>
      audience === null || !isUnderMcpAuthorizationServer(audience, authorizationServer);
    const audienceOf = new Map(registrations.map(({ id, audience }) => [id, audience]));
    const breaking: BreakingAudience[] = [
      ...registrations
        .filter(({ audience }) => isBroken(audience))
        .map((row) => ({ kind: 'registration' as const, ...row, trustedIssuerId: null })),
      ...credentials.flatMap((row) => {
        if (row.trustedIssuerId === null)
          throw new Error(`oidc credential ${row.id} names no trusted issuer`);
        if (!audienceOf.has(row.trustedIssuerId))
          throw new Error(`oidc credential ${row.id} names absent issuer ${row.trustedIssuerId}`);
        // A credential's own narrowing wins over its registration's, as at use.
        const audience = row.audience ?? audienceOf.get(row.trustedIssuerId) ?? null;
        return isBroken(audience)
          ? [
              {
                kind: 'credential' as const,
                ...row,
                audience,
                trustedIssuerId: row.trustedIssuerId,
              },
            ]
          : [];
      }),
    ];
    snapshot.commit();
    // Proof: with every breaking row counted as accepted, `lists a wbs:org
    // registration and its credentials…`, `exits 0 when every listed row is
    // accepted, and only by its own id` and `lists what a changed issuer would
    // break` (trusted-issuer-audience-check-cli.db.test.ts) saw exit 0;
    // watched 2026-10-27.
    return {
      authorizationServer,
      breaking,
      unaccepted: breaking.filter(({ id }) => !accepted.has(id)),
    };
  } catch (cause) {
    snapshot.rollback();
    throw cause;
  }
}
