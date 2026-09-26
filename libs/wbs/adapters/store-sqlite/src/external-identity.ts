import type { WriteStamp } from '@wbs/core';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate } from './audit';
import type { Gate } from './gate';
import { externalIdentity } from './schema';

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
