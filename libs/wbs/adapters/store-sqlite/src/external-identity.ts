import type { WriteStamp } from '@wbs/core';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate } from './audit';
import type { Gate } from './gate';
import { externalIdentity, users } from './schema';

/** A verified identity-provider account: the pair a token proves, never an email. */
export interface IssuerSubject {
  readonly issuer: string;
  readonly subject: string;
}

/** Whether a pair now maps to the requested user, or already belongs to another. */
export type IdentityMapping = { kind: 'mapped' } | { kind: 'collision'; userId: string };

/**
 * The `(issuer, subject)` → local user mapping of `organization-migration`'s
 * "External identity mapping is stable". Inert until the identity slice (task
 * 2.3) routes logins through it; `users.idp_issuer`/`idp_sub` still resolve
 * logins today.
 */
export class ExternalIdentityRepository {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

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
    .select({ id: users.id, issuer: users.idpIssuer, subject: users.idpSub })
    .from(users)
    .where(or(isNotNull(users.idpIssuer), isNotNull(users.idpSub)))
    .all();
  let added = 0;
  for (const { id, issuer, subject } of legacy) {
    // Proof: skipping this check made `refuses a half or empty legacy pair`
    // in `external-identity.db.test.ts` fail; watched 2026-09-28.
    if (issuer === null || subject === null || issuer.length === 0 || subject.length === 0)
      throw new Error(`user ${id} has a partial or empty legacy identity pair`);
    const mapped = tx
      .select({ userId: externalIdentity.userId })
      .from(externalIdentity)
      .where(and(eq(externalIdentity.issuer, issuer), eq(externalIdentity.subject, subject)))
      .get();
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
