import { createHash } from 'node:crypto';

import { normalizeEmail, type OidcIdentity } from '@wbs/auth';
import type { User, UserStore, WriteStamp } from '@wbs/core';
import { isCanonicalDomain } from '@wbs/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnCreateBesidesCreatedAt, auditOnUpdate } from './audit';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { externalIdentity, users } from './schema';

/**
 * SQLite reports a uniqueness violation as a message, not a typed error, so
 * `create` translates it into a `null` return the caller can branch on. The
 * alternative — checking for an existing row first — is a race: two
 * registrations of the same username both see it free.
 */
/**
 * The columns a {@link User} is, named once because seven reads in this file want
 * exactly them.
 *
 * Spelled out rather than left to `select()`, and every read that crosses this
 * class's boundary uses it: the audit columns are **recorded, not published**, so
 * a bare select would hand `updated_at` and `created_by` to every caller of
 * `findById` and into the HTTP payload behind it. It also keeps
 * `resolveOidcIdentity` to one shape — that method returns a stored row on one
 * path and a constructed object on another, and without this the two differed by
 * three fields.
 *
 * The declared return types are what check the list is complete: drop a column
 * and `tsc` refuses the assignment to `User`.
 */
const USER_COLUMNS = {
  id: users.id,
  username: users.username,
  passwordHash: users.passwordHash,
  email: users.email,
  idpIssuer: users.idpIssuer,
  idpSub: users.idpSub,
  createdAt: users.createdAt,
};

export class UserRepository implements UserStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /**
   * Makes the fixed local-mode identity a real owner before any project write
   * can use it.
   *
   * Takes its own stamp rather than reading a clock here, which is the rule the
   * whole folder keeps: every instant the repository stores arrived in a
   * {@link WriteStamp}. The account creates itself, so `by` is its own id — the
   * one row in the schema whose author is the row.
   */
  ensureLocalIdentity(identity: Pick<User, 'id' | 'username'>, stamp: WriteStamp): void {
    const byId = this.db
      .select(USER_COLUMNS)
      .from(users)
      .where(eq(users.id, identity.id))
      .limit(1)
      .all()
      .at(0);
    const byUsername = this.db
      .select(USER_COLUMNS)
      .from(users)
      .where(eq(users.username, identity.username))
      .limit(1)
      .all()
      .at(0);
    if (byId === undefined && byUsername === undefined) {
      this.db
        .insert(users)
        .values({
          ...identity,
          passwordHash: null,
          email: null,
          idpIssuer: null,
          idpSub: null,
          createdAt: stamp.at,
          ...auditOnCreateBesidesCreatedAt(stamp),
        })
        .run();
      return;
    }
    if (byId?.username !== identity.username || byUsername?.id !== identity.id) {
      throw new Error('local identity conflicts with an existing account');
    }
  }

  async create(user: User, stamp: WriteStamp): Promise<User | null> {
    return await this.gate.enter(async () => {
      try {
        await this.db.insert(users).values({ ...user, ...auditOnCreateBesidesCreatedAt(stamp) });
        return user;
      } catch (err) {
        if (isUniqueViolation(err, UNIQUE_INDEXES.username)) return null;
        throw err;
      }
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows = await this.db
      .select(USER_COLUMNS)
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.select(USER_COLUMNS).from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /**
   * Resolves one first login under a single SQLite transaction. `null` is an
   * identity collision, not "not found": the caller must stop rather than
   * silently reassign it.
   *
   * The activation marker is read inside that transaction, on every call, so
   * another process activating isolation takes effect without a restart.
   * Before activation subject wins over email, and email can only attach to a
   * password account whose legacy username is that verified address. After
   * activation the pair resolves only through `external_identity`; see
   * {@link resolveMappedIdentity}.
   *
   * @throws {OrganizationActivationRefused} when the marker is absent,
   * unreadable or malformed; and, after activation, on a broken mapping.
   */
  async resolveOidcIdentity(
    identity: Pick<OidcIdentity, 'issuer' | 'subject' | 'email' | 'emailVerified'>,
    create: { id: string },
    stamp: WriteStamp,
  ): Promise<User | null> {
    return await this.gate.enter(async () => {
      return Promise.resolve(
        this.db.transaction(
          (tx) => {
            // Proof: resolving as before activation regardless of the marker failed
            // five cases of `user-oidc.db.test.ts`'s after-activation block;
            // watched 2026-09-28.
            if (readOrganizationActivation(tx) === 'activated')
              return resolveMappedIdentity(tx, identity, create, stamp);
            const subject = tx
              .select(USER_COLUMNS)
              .from(users)
              .where(and(eq(users.idpIssuer, identity.issuer), eq(users.idpSub, identity.subject)))
              .limit(1)
              .all();
            const subjectAccount = subject.at(0) ?? null;
            if (subjectAccount !== null) return subjectAccount;

            const normalizedEmail = identity.email === null ? null : normalizeEmail(identity.email);
            const trustedEmail = identity.emailVerified ? normalizedEmail : null;
            if (trustedEmail !== null) {
              const emailOwner = tx
                .select(USER_COLUMNS)
                .from(users)
                .where(sql`lower(${users.email}) = ${trustedEmail}`)
                .limit(1)
                .all();
              if ((emailOwner.at(0) ?? null) !== null) return null;

              const legacy = tx
                .select(USER_COLUMNS)
                .from(users)
                .where(sql`lower(${users.username}) = ${trustedEmail}`)
                .limit(1)
                .all();
              const candidate = legacy.at(0) ?? null;
              if (
                candidate?.idpIssuer === null &&
                candidate.idpSub === null &&
                looksLikeEmail(candidate.username)
              ) {
                const linked = tx
                  .update(users)
                  .set({
                    email: trustedEmail,
                    idpIssuer: identity.issuer,
                    idpSub: identity.subject,
                    // Only the update clock moves: this row's author is whoever
                    // registered the password account, and a first OIDC login
                    // linking to it is not that act. The stamp's `by` names the id
                    // this login would have minted, which is deliberately not
                    // written anywhere here.
                    ...auditOnUpdate(stamp),
                  })
                  .where(eq(users.id, candidate.id))
                  .returning(USER_COLUMNS)
                  .all();
                return linked[0] ?? null;
              }
            }

            const username = availableOidcUsername(tx, identity);
            const created: User = {
              id: create.id,
              username,
              passwordHash: null,
              email: trustedEmail,
              idpIssuer: identity.issuer,
              idpSub: identity.subject,
              createdAt: stamp.at,
            };
            tx.insert(users)
              .values({ ...created, ...auditOnCreateBesidesCreatedAt(stamp) })
              .run();
            return created;
          },
          { behavior: 'immediate' },
        ),
      );
    });
  }
}

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/**
 * Resolves a verified pair after activation, through `external_identity`
 * alone: email never selects or merges an account (linking is task 4.2).
 *
 * - A mapped pair answers its user, whatever email the token now carries.
 * - An unmapped pair whose verified email an account already holds, as its
 *   email or as its email-shaped username, is a collision: null.
 * - Any other unmapped pair creates a user and its mapping together.
 *
 * Nothing is repaired at login. Activation (task 7.1) copies every legacy
 * pair first (`backfillExternalIdentities`), so a legacy pair without its
 * mapping, a mapping to no user, a user whose legacy pair names someone else,
 * or an empty issuer or subject is corrupt trusted state.
 *
 * @throws on any such corruption.
 */
function resolveMappedIdentity(
  tx: Transaction,
  identity: Pick<OidcIdentity, 'issuer' | 'subject' | 'email' | 'emailVerified'>,
  create: { id: string },
  stamp: WriteStamp,
): User | null {
  const { issuer, subject } = identity;
  // Proof: skipping this made `throws on an empty issuer or subject` in
  // `user-oidc.db.test.ts` create an account; watched 2026-09-28.
  if (issuer.length === 0 || subject.length === 0)
    throw new Error('a verified identity has an empty issuer or subject');
  const mappings = tx
    .select({ userId: sql<unknown>`${externalIdentity.userId}` })
    .from(externalIdentity)
    .where(and(eq(externalIdentity.issuer, issuer), eq(externalIdentity.subject, subject)))
    .all();
  // The unique index allows one; a second, or a user id that is not text, is
  // corrupt trusted state.
  // Proof: answering the first of two mappings made `throws on a duplicate
  // or malformed mapping` in `user-oidc.db.test.ts` resolve; watched
  // 2026-09-28.
  if (mappings.length > 1)
    throw new Error(
      `external identity ${issuer} ${subject} is mapped ${String(mappings.length)} times`,
    );
  const legacyOwners = tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.idpIssuer, issuer), eq(users.idpSub, subject)))
    .all();
  const mapping = mappings.at(0);
  if (mapping !== undefined) {
    if (typeof mapping.userId !== 'string' || mapping.userId.length === 0)
      throw new Error(`external identity ${issuer} ${subject} has a malformed user id`);
    const owner = tx.select(USER_COLUMNS).from(users).where(eq(users.id, mapping.userId)).get();
    // Proof: skipping this check, then the disagreement check below, each
    // made `throws on a mapping to no user and on one its user disagrees with`
    // in `user-oidc.db.test.ts` fail; watched 2026-09-28.
    if (owner === undefined)
      throw new Error(`external identity ${issuer} ${subject} maps to no user`);
    const ownPair = owner.idpIssuer === null && owner.idpSub === null;
    if (!ownPair && (owner.idpIssuer !== issuer || owner.idpSub !== subject))
      throw new Error(`external identity ${issuer} ${subject} disagrees with its user's own pair`);
    // Proof: skipping this made `throws when the pair maps to one user and
    // is another's legacy pair` in `user-oidc.db.test.ts` resolve; watched
    // 2026-09-28.
    if (legacyOwners.some(({ id }) => id !== owner.id))
      throw new Error(`external identity ${issuer} ${subject} is another user's legacy pair`);
    const email = canonicalOidcEmail(identity.email);
    if (email !== null) {
      const holder = tx
        .select({ id: users.id })
        .from(users)
        .where(
          sql`(lower(${users.email}) = ${email} OR lower(${users.username}) = ${email}) AND ${users.id} <> ${owner.id}`,
        )
        .get();
      // Proof: 2026-09-28, bypassing this check made `refuses a mapped email
      // collision without changing the old address or identity` return a user.
      if (holder !== undefined) return null;
    }
    // Proof: 2026-09-28, omitting this update failed `answers the mapped user
    // whatever email the token now carries` and `clears verification when a
    // mapped callback lacks literal verified evidence`.
    return tx
      .update(users)
      .set({
        email,
        emailVerified: identity.emailVerified && email !== null,
        ...auditOnUpdate(stamp),
      })
      .where(eq(users.id, owner.id))
      .returning(USER_COLUMNS)
      .get();
  }
  // Proof: skipping this made `throws on a legacy pair activation never
  // mapped` in `user-oidc.db.test.ts` create a second account; watched
  // 2026-09-28.
  if (legacyOwners.length > 0)
    throw new Error(`legacy identity ${issuer} ${subject} was never mapped at activation`);
  const normalizedEmail = canonicalOidcEmail(identity.email);
  if (normalizedEmail !== null) {
    const holder = tx
      .select({ id: users.id })
      .from(users)
      .where(
        sql`lower(${users.email}) = ${normalizedEmail} OR lower(${users.username}) = ${normalizedEmail}`,
      )
      .get();
    // Proof: skipping this made `refuses an unmapped identity whose verified
    // email an account holds, changing nothing` in `user-oidc.db.test.ts`
    // create an account; watched 2026-09-28.
    if (holder !== undefined) return null;
  }
  const created: User = {
    id: create.id,
    username: availableOidcUsername(tx, identity),
    passwordHash: null,
    email: normalizedEmail,
    idpIssuer: issuer,
    idpSub: subject,
    createdAt: stamp.at,
  };
  tx.insert(users)
    .values({
      ...created,
      emailVerified: identity.emailVerified && normalizedEmail !== null,
      ...auditOnCreateBesidesCreatedAt(stamp),
    })
    .run();
  tx.insert(externalIdentity)
    .values({ id: create.id, userId: create.id, issuer, subject, ...auditOnCreate(stamp) })
    .run();
  return created;
}

function availableOidcUsername(
  tx: Transaction,
  identity: Pick<OidcIdentity, 'issuer' | 'subject' | 'email'>,
): string {
  const local = identity.email
    ?.split('@', 1)[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const base = local !== undefined && local.length >= 3 ? local : 'oidc';
  const digest = createHash('sha256')
    .update(identity.issuer)
    .update('\0')
    .update(identity.subject)
    .digest('hex');
  for (let attempt = 0; ; attempt += 1) {
    const suffix = attempt === 0 ? digest.slice(0, 12) : `${digest.slice(0, 9)}-${String(attempt)}`;
    const username = `${base.slice(0, 31 - suffix.length)}-${suffix}`;
    const taken = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
      .all();
    if (taken.length === 0) return username;
  }
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Normalizes an activated OIDC address's domain to lowercase ASCII IDNA. */
function canonicalOidcEmail(email: string | null): string | null {
  if (email === null) return null;
  const normalized = normalizeEmail(email);
  if (normalized === null) return null;
  const separator = normalized.lastIndexOf('@');
  const mailbox = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  let host: string;
  try {
    // Proof: 2026-09-28, retaining the Unicode domain here failed `stores
    // activated OIDC domains in canonical ASCII IDNA form`.
    host = new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }
  if (!isCanonicalDomain(host)) return null;
  return `${mailbox}@${host}`;
}
