import { randomUUID } from 'node:crypto';

import type { WriteStamp } from '@wbs/core';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { canonicalOidcEmail } from './canonical-oidc-email';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { externalIdentity, users } from './schema';

/** A verified identity-provider account: the pair a token proves, never an email. */
export interface IssuerSubject {
  readonly issuer: string;
  readonly subject: string;
}

/** Whether a pair now maps to the requested user, or already belongs to another. */
export type IdentityMapping = { kind: 'mapped' } | { kind: 'collision'; userId: string };

/** Expected outcomes of an explicit, password-account-only Auth0 link. */
export type PasswordIdentityLink =
  | { kind: 'linked' }
  | {
      kind:
        'inactive' | 'unverified' | 'identity_collision' | 'email_collision' | 'invalid_account';
    };

/**
 * The `(issuer, subject)` → local user mapping of `organization-migration`'s
 * "External identity mapping is stable". Activated logins resolve through it;
 * explicit password-account links use a separate immediate transaction.
 */
export class ExternalIdentityRepository {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Reads the durable marker on each start request; malformed trusted state throws. */
  async isLinkActive(): Promise<boolean> {
    await Promise.resolve();
    return readOrganizationActivation(this.db) === 'activated';
  }

  /** Commits a proved user's mapping and verified email in one immediate transaction.
   * Proof: 2026-09-28, bypassing pair ownership made `refuses an existing pair or email belonging to another user without changing either account` receive `linked` for the owned pair.
   * Proof: 2026-09-28, bypassing email ownership made the same test throw a SQLite uniqueness error instead of returning typed `email_collision`.
   */
  async linkPasswordIdentity(
    userId: string,
    identity: IssuerSubject & { readonly email: string | null; readonly emailVerified: boolean },
    stamp: WriteStamp,
  ): Promise<PasswordIdentityLink> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      // Proof: 2026-09-28, replacing the transaction with direct writes made `rolls mapping insertion back when the email update aborts` leave one external_identity row after the update trigger aborted.
      return this.db.transaction(
        (tx): PasswordIdentityLink => {
          // Proof: 2026-09-28, bypassing the activation check made `refuses unverified identity and an inactive marker without creating a mapping` receive linked while inactive.
          if (readOrganizationActivation(tx) !== 'activated') return { kind: 'inactive' };
          if (identity.issuer === '' || identity.subject === '')
            throw new Error('verified Auth0 identity has an empty pair');
          // Proof: 2026-09-28, using normalizeEmail here made `refuses an IDNA-equivalent email owned by another account` link and `refuses a malformed provider email domain before inserting a mapping` link.
          const email = canonicalOidcEmail(identity.email);
          // Proof: 2026-09-28, accepting unverified email made the same store test receive linked.
          if (!identity.emailVerified || email === null) return { kind: 'unverified' };
          const account = tx
            .select({
              passwordHash: users.passwordHash,
              idpIssuer: users.idpIssuer,
              idpSub: users.idpSub,
            })
            .from(users)
            .where(eq(users.id, userId))
            .get();
          // Proof: 2026-09-28, bypassing this check made `refuses a link after the password credential is removed` receive linked.
          if (account === undefined) return { kind: 'invalid_account' };
          if (account.passwordHash === null) return { kind: 'invalid_account' };
          // Proof: 2026-09-28, bypassing this invariant made `throws on a partial legacy identity pair before linking` resolve with an ordinary collision.
          if ((account.idpIssuer === null) !== (account.idpSub === null))
            throw new Error(`password account ${userId} has a partial legacy identity pair`);
          // Proof: 2026-09-28, omitting this check made `refuses a new pair on an account with a different legacy OIDC pair` receive linked and create a mapping normal login cannot resolve.
          if (
            account.idpIssuer !== null &&
            (account.idpIssuer !== identity.issuer || account.idpSub !== identity.subject)
          )
            return { kind: 'identity_collision' };
          const owner = tx
            .select({ userId: externalIdentity.userId })
            .from(externalIdentity)
            .where(
              and(
                eq(externalIdentity.issuer, identity.issuer),
                eq(externalIdentity.subject, identity.subject),
              ),
            )
            .get();
          const legacyOwner = tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.idpIssuer, identity.issuer), eq(users.idpSub, identity.subject)))
            .get();
          // Proof: 2026-09-28, omitting this check made `throws when activation left the account legacy pair unmapped` and `throws when another account holds an unmapped legacy pair` silently insert repair mappings.
          if (legacyOwner !== undefined && legacyOwner.id !== owner?.userId)
            throw new Error(
              owner === undefined
                ? `external identity ${identity.issuer} ${identity.subject} legacy pair has no mapping`
                : `external identity ${identity.issuer} ${identity.subject} legacy pair disagrees with mapping`,
            );
          if (owner !== undefined && owner.userId !== userId) return { kind: 'identity_collision' };
          const emailOwner = tx
            .select({ id: users.id })
            .from(users)
            .where(
              sql`(lower(${users.email}) = ${email} OR lower(${users.username}) = ${email}) AND ${users.id} <> ${userId}`,
            )
            .get();
          if (emailOwner !== undefined) return { kind: 'email_collision' };
          if (owner === undefined)
            tx.insert(externalIdentity)
              .values({
                id: randomUUID(),
                userId,
                issuer: identity.issuer,
                subject: identity.subject,
                ...auditOnCreate(stamp),
              })
              .run();
          tx.update(users)
            .set({ email, emailVerified: true, ...auditOnUpdate(stamp) })
            .where(eq(users.id, userId))
            .run();
          return { kind: 'linked' };
        },
        { behavior: 'immediate' },
      );
    });
  }

  /**
   * Maps a pair to a user, or reports the user it already belongs to.
   *
   * Insert-or-ignore then read back, in one transaction: the unique index
   * decides a race, and the read tells the loser who won. Email plays no part,
   * so two accounts are never merged because their addresses match. The
   * index's proof is beside it in `20260927120000_add_organization_records`.
   */
  async mapIdentity(
    mapping: IssuerSubject & { readonly id: string; readonly userId: string },
    stamp: WriteStamp,
  ): Promise<IdentityMapping> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      const owner = this.db.transaction(
        (tx) => {
          tx.insert(externalIdentity)
            .values({ ...mapping, ...auditOnCreate(stamp) })
            .onConflictDoNothing({ target: [externalIdentity.issuer, externalIdentity.subject] })
            .run();
          return tx
            .select({ userId: externalIdentity.userId })
            .from(externalIdentity)
            .where(
              and(
                eq(externalIdentity.issuer, mapping.issuer),
                eq(externalIdentity.subject, mapping.subject),
              ),
            )
            .get();
        },
        { behavior: 'immediate' },
      );
      if (owner === undefined)
        throw new Error(
          `external identity ${mapping.issuer} ${mapping.subject} is absent right after its insert`,
        );
      return owner.userId === mapping.userId
        ? { kind: 'mapped' }
        : { kind: 'collision', userId: owner.userId };
    });
  }

  /** The local user a verified pair maps to, or null when it maps to none. */
  async findUserId(pair: IssuerSubject): Promise<string | null> {
    await Promise.resolve();
    const row = this.db
      .select({ userId: externalIdentity.userId })
      .from(externalIdentity)
      .where(
        and(eq(externalIdentity.issuer, pair.issuer), eq(externalIdentity.subject, pair.subject)),
      )
      .get();
    return row?.userId ?? null;
  }
}

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/**
 * Copies every user's legacy `(idp_issuer, idp_sub)` into `external_identity`,
 * keeping the local user id, and answers how many mappings it added. Task 7.1
 * runs it inside the transaction that commits activation, after old writers
 * drain, because afterwards logins resolve through the mapping alone and a
 * legacy pair left unmapped refuses its login.
 *
 * `at` dates every mapping it adds. Idempotent: a pair already mapped to its own user is skipped. A user with
 * no pair is password-only and needs nothing.
 *
 * @throws when a pair is half present or empty, or is already mapped to a
 * different user; the whole transaction must then roll back.
 */
export function backfillExternalIdentities(tx: Transaction, at: number): number {
  const legacy = tx
    .select({
      id: users.id,
      issuer: sql<unknown>`${users.idpIssuer}`,
      subject: sql<unknown>`${users.idpSub}`,
    })
    .from(users)
    .where(or(isNotNull(users.idpIssuer), isNotNull(users.idpSub)))
    .all();
  let added = 0;
  for (const { id, issuer, subject } of legacy) {
    // Proof: skipping this check made `refuses a half, empty or non-text
    // legacy pair` in `external-identity.db.test.ts` fail; watched 2026-09-28.
    if (!isFilledText(issuer) || !isFilledText(subject))
      throw new Error(`user ${id} has a partial or empty legacy identity pair`);
    const mappings = tx
      .select({ userId: externalIdentity.userId })
      .from(externalIdentity)
      .where(and(eq(externalIdentity.issuer, issuer), eq(externalIdentity.subject, subject)))
      .all();
    if (mappings.length > 1)
      throw new Error(`identity ${issuer} ${subject} is mapped ${String(mappings.length)} times`);
    const mapped = mappings.at(0);
    if (mapped !== undefined) {
      // Proof: skipping this check made `refuses a pair already mapped to
      // another user, mapping nothing` in `external-identity.db.test.ts`
      // fail; watched 2026-09-28.
      if (mapped.userId !== id)
        throw new Error(
          `identity ${issuer} ${subject} of user ${id} is mapped to ${mapped.userId}`,
        );
      continue;
    }
    tx.insert(externalIdentity)
      // The account authors its own mapping, as it authored its own row: the
      // audit column references a user, and activation is nobody's act.
      .values({ id, userId: id, issuer, subject, ...auditOnCreate({ at, by: id }) })
      .run();
    added += 1;
  }
  return added;
}

/** Stored identity text: a non-empty string, not a blob, number or null. */
function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
