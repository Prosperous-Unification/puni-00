import {
  type AuditedAct,
  carriesSubjectPrefix,
  type ConnectionAuthorityRefusal,
  type EnterpriseConnection,
  type EnterpriseConnectionChange,
  type EnterpriseConnectionDraft,
  type EnterpriseConnections,
  type EnterpriseRoute,
  isAttestedEmail,
  type ProvenConnection,
  type RoutedIdentity,
  type RoutedLink,
  subjectPrefixOf,
} from '@wbs/core';
import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { canonicalOidcEmail } from './canonical-oidc-email';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import { linkIdentityWithin } from './external-identity';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  organizationDomainClaim,
  organizationScimToken,
  organizationSsoConnection,
} from './schema';
import { readSessionPolicy } from './session-policy';

type Transaction = ImmediateTransaction;
type Reader = Pick<SQLiteBunDatabase, 'select'>;

/**
 * Whether `actorId` may administer `organizationId`'s enterprise SSO now:
 * `inactive` before activation, `forbidden` for anyone but a current
 * super-admin, null when permitted. Read inside the caller's transaction.
 */
export function superAdminRefusal(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): 'inactive' | 'forbidden' | null {
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  return roleIn(tx, organizationId, actorId) === 'super_admin' ? null : 'forbidden';
}

const COLUMNS = {
  id: organizationSsoConnection.id,
  organizationId: organizationSsoConnection.organizationId,
  domainClaimId: organizationSsoConnection.domainClaimId,
  domain: organizationDomainClaim.domain,
  auth0Connection: organizationSsoConnection.auth0Connection,
  strategy: organizationSsoConnection.strategy,
  loginSlug: organizationSsoConnection.loginSlug,
  enforced: organizationSsoConnection.enforced,
  provenAt: organizationSsoConnection.provenAt,
  provenBy: organizationSsoConnection.provenBy,
  lastPrefixMismatchAt: organizationSsoConnection.lastPrefixMismatchAt,
};

type StoredConnection = {
  [K in keyof typeof COLUMNS]: (typeof COLUMNS)[K]['_']['data'] | null;
};

/**
 * A stored connection, checked rather than trusted.
 *
 * @throws on a malformed strategy, enforcement flag or half-recorded proof.
 */
function checkedConnection(row: StoredConnection): EnterpriseConnection {
  const { id, organizationId, domainClaimId, domain, auth0Connection, strategy, loginSlug } = row;
  if (
    id === null ||
    organizationId === null ||
    domainClaimId === null ||
    domain === null ||
    auth0Connection === null ||
    loginSlug === null ||
    (strategy !== 'samlp' && strategy !== 'oidc') ||
    (row.enforced !== 0 && row.enforced !== 1) ||
    (row.provenAt === null) !== (row.provenBy === null) ||
    (row.enforced === 1 && row.provenAt === null)
  )
    throw new Error(`enterprise connection ${String(id)} is malformed`);
  return {
    id,
    organizationId,
    domainClaimId,
    domain,
    auth0Connection,
    strategy,
    loginSlug,
    enforced: row.enforced === 1,
    provenAt: row.provenAt,
    provenBy: row.provenBy,
    lastPrefixMismatchAt: row.lastPrefixMismatchAt,
  };
}

function selectConnections(db: Reader) {
  return db
    .select(COLUMNS)
    .from(organizationSsoConnection)
    .innerJoin(
      organizationDomainClaim,
      eq(organizationDomainClaim.id, organizationSsoConnection.domainClaimId),
    );
}

/** The organization's connection `id`, or null when absent or another organization's. */
export function connectionIn(
  db: Reader,
  organizationId: string,
  id: string,
): EnterpriseConnection | null {
  const row = selectConnections(db)
    .where(
      and(
        eq(organizationSsoConnection.id, id),
        eq(organizationSsoConnection.organizationId, organizationId),
      ),
    )
    .get();
  return row === undefined ? null : checkedConnection(row);
}

/** Whether `organizationId` holds a provisioning token live at `at`. */
export function hasLiveProvisioningToken(db: Reader, organizationId: string, at: number): boolean {
  return (
    db
      .select({ id: organizationScimToken.id })
      .from(organizationScimToken)
      .where(
        and(
          eq(organizationScimToken.organizationId, organizationId),
          isNull(organizationScimToken.revokedAt),
          or(isNull(organizationScimToken.expiresAt), gt(organizationScimToken.expiresAt, at)),
        ),
      )
      .get() !== undefined
  );
}

/** {@link EnterpriseConnections} over the shared database. */
export class EnterpriseConnectionRepository implements EnterpriseConnections {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async list(
    organizationId: string,
    actorId: string,
  ): Promise<readonly EnterpriseConnection[] | 'inactive' | 'forbidden'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return refusal;
      return selectConnections(tx)
        .where(eq(organizationSsoConnection.organizationId, organizationId))
        .orderBy(organizationSsoConnection.loginSlug)
        .all()
        .map(checkedConnection);
    });
  }

  /**
   * Proof, each watched 2026-10-12 in `enterprise-sso-stores.db.test.ts`:
   * dropping the claim-status recheck made `refuses a pending or suspended
   * claim` store a connection; dropping the organization predicate on the
   * claim made `answers a foreign claim as absent` store one on B's claim.
   * Proof, watched 2026-10-12 through the mounted route: dropping the
   * claim-status recheck made `refuses a pending or suspended domain and
   * stores nothing` in `sso-connection.controller.db.test.ts` answer 201.
   */
  create(
    organizationId: string,
    actorId: string,
    draft: EnterpriseConnectionDraft,
    id: string,
    act: AuditedAct,
  ): ReturnType<EnterpriseConnections['create']> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return { kind: refusal };
      const claim = tx
        .select({ status: organizationDomainClaim.status })
        .from(organizationDomainClaim)
        .where(
          and(
            eq(organizationDomainClaim.id, draft.domainClaimId),
            eq(organizationDomainClaim.organizationId, organizationId),
          ),
        )
        .get();
      if (claim === undefined) return { kind: 'not_found' };
      if (claim.status !== 'verified') return { kind: 'domain_not_verified' };
      const onClaim = tx
        .select({ id: organizationSsoConnection.id })
        .from(organizationSsoConnection)
        .where(eq(organizationSsoConnection.domainClaimId, draft.domainClaimId))
        .get();
      if (onClaim !== undefined) return { kind: 'sso_connection_exists' };
      if (slugHolder(tx, draft.loginSlug) !== null) return { kind: 'login_slug_taken' };
      tx.insert(organizationSsoConnection)
        .values({
          id,
          organizationId,
          domainClaimId: draft.domainClaimId,
          auth0Connection: draft.auth0Connection,
          strategy: draft.strategy,
          loginSlug: draft.loginSlug,
          enforced: 0,
          ...auditOnCreate(act.stamp),
        })
        .run();
      const connection = connectionIn(tx, organizationId, id);
      if (connection === null) throw new Error(`created enterprise connection ${id} vanished`);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'sso_connection_created',
        subjectKind: 'sso_connection',
        subjectId: id,
        detail: {
          domain: connection.domain,
          auth0Connection: connection.auth0Connection,
          strategy: connection.strategy,
          loginSlug: connection.loginSlug,
        },
        at: act.stamp.at,
      });
      return { kind: 'created', connection } as const;
    });
  }

  update(
    organizationId: string,
    actorId: string,
    connectionId: string,
    change: EnterpriseConnectionChange,
    act: AuditedAct,
  ): ReturnType<EnterpriseConnections['update']> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return { kind: refusal };
      const current = connectionIn(tx, organizationId, connectionId);
      if (current === null) return { kind: 'not_found' };
      const next = {
        auth0Connection: change.auth0Connection ?? current.auth0Connection,
        strategy: change.strategy ?? current.strategy,
        loginSlug: change.loginSlug ?? current.loginSlug,
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
        (field) => next[field] !== current[field],
      );
      if (changed.length === 0) return { kind: 'updated', connection: current } as const;
      if (next.loginSlug !== current.loginSlug) {
        const holder = slugHolder(tx, next.loginSlug);
        if (holder !== null && holder !== connectionId) return { kind: 'login_slug_taken' };
      }
      // A proof observed one prefix; a new connection name or strategy is a
      // new prefix nobody has observed, so proof and enforcement end here.
      const prefixChanged =
        subjectPrefixOf(next) !== subjectPrefixOf(current) && current.provenAt !== null;
      tx.update(organizationSsoConnection)
        .set({
          ...next,
          ...(prefixChanged ? { provenAt: null, provenBy: null, enforced: 0 } : {}),
          ...auditOnUpdate(act.stamp),
        })
        .where(eq(organizationSsoConnection.id, connectionId))
        .run();
      const connection = connectionIn(tx, organizationId, connectionId);
      if (connection === null) throw new Error(`updated enterprise connection vanished`);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'sso_connection_updated',
        subjectKind: 'sso_connection',
        subjectId: connectionId,
        detail: { changed, proofCleared: prefixChanged },
        at: act.stamp.at,
      });
      return { kind: 'updated', connection } as const;
    });
  }

  /**
   * Proof, watched 2026-10-12 in `enterprise-sso-stores.db.test.ts`: dropping
   * the actor-subject check made `refuses enforcement unproven or locking out
   * its actor, and audits the change` enforce for a `google-oauth2` actor.
   */
  setEnforced(
    organizationId: string,
    actorId: string,
    connectionId: string,
    enforced: boolean,
    actorSubject: string | null,
    act: AuditedAct,
  ): ReturnType<EnterpriseConnections['setEnforced']> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return { kind: refusal };
      const current = connectionIn(tx, organizationId, connectionId);
      if (current === null) return { kind: 'not_found' };
      if (enforced && current.provenAt === null) return { kind: 'sso_connection_unproven' };
      if (enforced && (actorSubject === null || !carriesSubjectPrefix(actorSubject, current)))
        return { kind: 'enforcement_would_lock_out_actor' };
      if (current.enforced === enforced) return { kind: 'changed', connection: current } as const;
      tx.update(organizationSsoConnection)
        .set({ enforced: enforced ? 1 : 0, ...auditOnUpdate(act.stamp) })
        .where(eq(organizationSsoConnection.id, connectionId))
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'sso_enforcement_changed',
        subjectKind: 'sso_connection',
        subjectId: connectionId,
        detail: { enforced, prefix: subjectPrefixOf(current) },
        at: act.stamp.at,
      });
      return { kind: 'changed', connection: { ...current, enforced } } as const;
    });
  }

  remove(
    organizationId: string,
    actorId: string,
    connectionId: string,
    act: AuditedAct,
  ): Promise<'deleted' | ConnectionAuthorityRefusal | 'provisioning_active'> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return refusal;
      const current = connectionIn(tx, organizationId, connectionId);
      if (current === null) return 'not_found';
      if (hasLiveProvisioningToken(tx, organizationId, act.stamp.at)) return 'provisioning_active';
      tx.delete(organizationSsoConnection)
        .where(eq(organizationSsoConnection.id, connectionId))
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'sso_connection_deleted',
        subjectKind: 'sso_connection',
        subjectId: connectionId,
        detail: { domain: current.domain, auth0Connection: current.auth0Connection },
        at: act.stamp.at,
      });
      return 'deleted' as const;
    });
  }

  async routeBySlug(slug: string): Promise<EnterpriseRoute | null> {
    await Promise.resolve();
    const row = selectConnections(this.db)
      .where(eq(organizationSsoConnection.loginSlug, slug))
      .get();
    if (row === undefined) return null;
    return routeOf(this.db, checkedConnection(row));
  }

  /**
   * Proof: 2026-10-12, dropping the `verified` predicate made mounted `sends
   * no connection for an unrouted domain or a suspended claim` in
   * `enterprise-login.controller.db.test.ts` route `bob@susp.test`.
   */
  async routeByDomain(domain: string): Promise<EnterpriseRoute | null> {
    await Promise.resolve();
    const row = selectConnections(this.db)
      .where(
        and(
          eq(organizationDomainClaim.domain, domain),
          eq(organizationDomainClaim.status, 'verified'),
        ),
      )
      .get();
    if (row === undefined) return null;
    return routeOf(this.db, checkedConnection(row));
  }

  /**
   * Only a connection whose claim is still `verified`: a suspended domain
   * keeps enforcement but vouches for no email (`organization-sso`).
   */
  async provenFor(subject: string): Promise<ProvenConnection | null> {
    await Promise.resolve();
    return provenConnectionFor(this.db, subject);
  }

  async linkThroughConnection(
    userId: string,
    connectionId: string,
    identity: RoutedIdentity,
    act: AuditedAct,
  ): Promise<RoutedLink> {
    try {
      return await this.write((tx): RoutedLink => {
        if (readOrganizationActivation(tx) !== 'activated') return { kind: 'inactive' };
        const row = selectConnections(tx)
          .where(eq(organizationSsoConnection.id, connectionId))
          .get();
        // Deleted between the link's start and its callback.
        if (row === undefined) return { kind: 'not_found' };
        const connection = checkedConnection(row);
        // Proof: 2026-10-12, comparing without the trailing `|` made mounted
        // `leaves the connection unproven and links nothing for
        // samlp|acme-saml-2|alice@acme.test` in
        // `enterprise-link.controller.db.test.ts` prove the connection.
        if (!carriesSubjectPrefix(identity.subject, connection)) {
          tx.update(organizationSsoConnection)
            .set({ lastPrefixMismatchAt: act.stamp.at })
            .where(eq(organizationSsoConnection.id, connectionId))
            .run();
          return { kind: 'sso_prefix_mismatch' };
        }
        const email = canonicalOidcEmail(identity.email);
        const proves =
          connection.provenAt === null &&
          email !== null &&
          // Proof: 2026-10-12, dropping the domain comparison made mounted
          // `does not prove through an address off the connection domain` in
          // `enterprise-link.controller.db.test.ts` prove it.
          email.slice(email.lastIndexOf('@') + 1) === connection.domain &&
          // Proof: 2026-10-12, proving for any member made mounted `links a
          // non-super-admin matching pair without proving or trusting its
          // email` in `enterprise-link.controller.db.test.ts` prove it.
          roleIn(tx, connection.organizationId, userId) === 'super_admin';
        if (proves) {
          // The partial unique index lets one proven record name an Auth0
          // connection; a second organization's proof throws here.
          tx.update(organizationSsoConnection)
            .set({ provenAt: act.stamp.at, provenBy: userId })
            .where(eq(organizationSsoConnection.id, connectionId))
            .run();
          appendOrganizationAudit(tx, {
            id: act.auditId,
            organizationId: connection.organizationId,
            actorId: act.actor,
            action: 'sso_connection_proven',
            subjectKind: 'sso_connection',
            subjectId: connectionId,
            detail: { prefix: subjectPrefixOf(connection), domain: connection.domain },
            at: act.stamp.at,
          });
        }
        const { kind } = linkIdentityWithin(
          tx,
          userId,
          {
            ...identity,
            emailVerified:
              identity.emailVerified &&
              isAttestedEmail(identity.email, provenConnectionFor(tx, identity.subject)),
          },
          act.stamp,
        );
        // The prefix makes the pair an enterprise one, which links unverified.
        if (kind === 'unverified')
          throw new Error(`enterprise pair through ${connectionId} was refused as unverified`);
        // A refused link must not leave the proof it would have carried.
        // Proof: 2026-10-12, returning the refusal instead made mounted `rolls
        // the proof back with a link refused as a collision` in
        // `enterprise-link.controller.db.test.ts` keep the proof.
        if (kind !== 'linked') throw new RefusedRoutedLink({ kind });
        return { kind };
      });
    } catch (cause) {
      if (cause instanceof RefusedRoutedLink) return cause.outcome;
      // Proof: 2026-10-12, rethrowing this violation made mounted `lets one of
      // two organizations prove the same Auth0 connection` in
      // `enterprise-link.controller.db.test.ts` answer 500.
      if (isUniqueViolation(cause, UNIQUE_INDEXES.provenAuth0Connection))
        return { kind: 'sso_connection_taken' };
      throw cause;
    }
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    return writeImmediately(this.db, this.gate, work);
  }
}

/** Where `connection` sends a login, with its organization's session policy. */
function routeOf(db: Reader, connection: EnterpriseConnection): EnterpriseRoute {
  return {
    connectionId: connection.id,
    organizationId: connection.organizationId,
    auth0Connection: connection.auth0Connection,
    policy: readSessionPolicy(db, connection.organizationId),
  };
}

/**
 * A routed link's identity write refused after its proof was applied; thrown
 * to roll the proof back with it, and answered as its outcome.
 */
class RefusedRoutedLink extends Error {
  constructor(readonly outcome: Exclude<RoutedLink, { kind: 'linked' }>) {
    super(`routed link refused: ${outcome.kind}`);
  }
}

/** The connection holding `slug`, if any. */
function slugHolder(tx: Reader, slug: string): string | null {
  return (
    tx
      .select({ id: organizationSsoConnection.id })
      .from(organizationSsoConnection)
      .where(eq(organizationSsoConnection.loginSlug, slug))
      .get()?.id ?? null
  );
}

/**
 * The proven connection on a verified claim whose whole prefix `subject`
 * carries. A subject with fewer than three `|`-separated parts names no
 * connection (`samlp|alice@acme.test`) and matches none.
 */
export function provenConnectionFor(db: Reader, subject: string): ProvenConnection | null {
  const parts = subject.split('|');
  if (parts.length < 3) return null;
  const row = selectConnections(db)
    .where(
      and(
        eq(organizationSsoConnection.auth0Connection, parts[1]),
        isNotNull(organizationSsoConnection.provenAt),
        eq(organizationDomainClaim.status, 'verified'),
      ),
    )
    .get();
  if (row === undefined) return null;
  const connection = checkedConnection(row);
  if (!carriesSubjectPrefix(subject, connection)) return null;
  return {
    connectionId: connection.id,
    organizationId: connection.organizationId,
    domain: connection.domain,
    prefix: subjectPrefixOf(connection),
  };
}
