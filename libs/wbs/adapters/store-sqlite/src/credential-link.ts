import { randomUUID } from 'node:crypto';

import type { CredentialPair } from '@wbs/contracts';
import type { WriteStamp } from '@wbs/core';
import { and, eq, or } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate } from './audit';
import { readOrganizationActivation } from './organization-activation';
import { externalIdentity, person, users } from './schema';

/** What `link-credential-cli.ts` asks for: a pair, an existing account, and optionally a person. */
export interface CredentialLinkRequest extends CredentialPair {
  /** An account id or username; both are tried, and a disagreement is refused. */
  readonly account: string;
  readonly personId: string | null;
}

/** The account a link names, as the CLI prints it. */
export interface LinkedAccount {
  readonly id: string;
  readonly username: string;
}

/**
 * Every answer of {@link linkCredential}. Each refusal writes nothing.
 *
 * - `inactive`: organization isolation is not activated, so logins resolve
 *   through `users.idp_*` and never read `external_identity`; a linked pair
 *   would mint a new account at its first login instead of acting as this one.
 * - `unknown_account`: no account has that id or username.
 * - `ambiguous_account`: the text is one account's id and another's username.
 * - `already_linked`: the pair already maps to an account, named.
 * - `sign_in_pair`: the pair is an account's own `users.idp_*` sign-in, named;
 *   linking it elsewhere would make that person's next login throw.
 * - `unknown_person`, `person_not_bound`: the pin names no person, or a person
 *   not bound to this account (`boundTo` is the account it is bound to, or null).
 */
export type CredentialLinkOutcome =
  | {
      readonly kind: 'linked';
      readonly id: string;
      readonly account: LinkedAccount;
      readonly pair: CredentialPair;
      readonly personId: string | null;
    }
  | { readonly kind: 'inactive' }
  | { readonly kind: 'unknown_account'; readonly account: string }
  | {
      readonly kind: 'ambiguous_account';
      readonly account: string;
      readonly matches: readonly LinkedAccount[];
    }
  | { readonly kind: 'already_linked'; readonly account: LinkedAccount }
  | { readonly kind: 'sign_in_pair'; readonly account: LinkedAccount }
  | { readonly kind: 'unknown_person'; readonly personId: string }
  | {
      readonly kind: 'person_not_bound';
      readonly personId: string;
      readonly boundTo: string | null;
    };

/**
 * Every answer of {@link unlinkCredential}.
 *
 * - `own_sign_in`: the pair is the account's own `users.idp_*` sign-in, which
 *   `resolveOidcIdentity` requires to stay mapped to it; removing it would make
 *   every other credential of the account throw at login.
 */
export type CredentialUnlinkOutcome =
  | {
      readonly kind: 'unlinked';
      readonly account: LinkedAccount;
      readonly pair: CredentialPair;
      readonly personId: string | null;
    }
  | { readonly kind: 'not_linked' }
  | { readonly kind: 'own_sign_in'; readonly account: LinkedAccount };

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/**
 * Links a fleet credential to an existing account as one `external_identity`
 * row, pinned to `personId` when given (`wbs-team-claims` D6), in one
 * immediate transaction. Creates no account and no membership: the account's
 * memberships are what every request of the credential reaches.
 *
 * `created_by` is the linked account itself: the link is that account's grant
 * to its fleet, and the host operator who runs the CLI has no account to name.
 *
 * @throws on an empty issuer, subject or account, or on unreadable activation
 *   state; nothing is written.
 */
export function linkCredential(
  db: SQLiteBunDatabase,
  request: CredentialLinkRequest,
  at: number,
): CredentialLinkOutcome {
  assertPair(request);
  if (request.account === '') throw new Error('the account must be named');
  return db.transaction(
    (tx): CredentialLinkOutcome => {
      // Proof: skipping this made `refuses before organization activation, when
      // logins would not read the link` in `link-credential-cli.db.test.ts` write
      // the row (watched 2026-10-19).
      if (readOrganizationActivation(tx) !== 'activated') return { kind: 'inactive' };
      const matches = tx
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(or(eq(users.id, request.account), eq(users.username, request.account)))
        .all();
      if (matches.length > 1)
        return { kind: 'ambiguous_account', account: request.account, matches };
      const account = matches.at(0);
      if (account === undefined) return { kind: 'unknown_account', account: request.account };
      const holder = linkedAccountOf(tx, request);
      // Proof: skipping this made `refuses a second link of the same pair,
      // naming the account` in `link-credential-cli.db.test.ts` lose the
      // account's name to the raw `UNIQUE constraint failed` of
      // `external_identity_issuer_subject` (watched 2026-10-19). That index,
      // not this check, is what makes stealing a linked pair impossible.
      if (holder !== undefined) return { kind: 'already_linked', account: holder };
      const signIn = tx
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(and(eq(users.idpIssuer, request.issuer), eq(users.idpSub, request.subject)))
        .get();
      // Proof: skipping this made `refuses an account's own unmapped sign-in
      // pair, naming it` in `link-credential-cli.db.test.ts` write the row
      // (watched 2026-10-20).
      if (signIn !== undefined) return { kind: 'sign_in_pair', account: signIn };
      if (request.personId !== null) {
        const pinned = tx
          .select({ accountId: person.accountId })
          .from(person)
          .where(eq(person.id, request.personId))
          .get();
        if (pinned === undefined) return { kind: 'unknown_person', personId: request.personId };
        // Proof: skipping this made `refuses pinning to a person bound to another
        // account or to none` in `link-credential-cli.db.test.ts` write the pin
        // (watched 2026-10-19).
        if (pinned.accountId !== account.id)
          return {
            kind: 'person_not_bound',
            personId: request.personId,
            boundTo: pinned.accountId,
          };
      }
      const id = randomUUID();
      const stamp: WriteStamp = { at, by: account.id };
      tx.insert(externalIdentity)
        .values({
          id,
          userId: account.id,
          issuer: request.issuer,
          subject: request.subject,
          personId: request.personId,
          ...auditOnCreate(stamp),
        })
        .run();
      return {
        kind: 'linked',
        id,
        account,
        pair: { issuer: request.issuer, subject: request.subject },
        personId: request.personId,
      };
    },
    { behavior: 'immediate' },
  );
}

/**
 * Removes the `external_identity` row of one pair: the next request bearing a
 * token for it is an unknown identity, and the account's other credentials
 * keep working. Revoking a fleet is this.
 *
 * @throws on an empty issuer or subject, or a row naming no account.
 */
export function unlinkCredential(
  db: SQLiteBunDatabase,
  pair: CredentialPair,
): CredentialUnlinkOutcome {
  assertPair(pair);
  return db.transaction(
    (tx): CredentialUnlinkOutcome => {
      const row = tx
        .select({ id: externalIdentity.id, personId: externalIdentity.personId })
        .from(externalIdentity)
        .where(matchesPair(pair))
        .get();
      if (row === undefined) return { kind: 'not_linked' };
      const account = linkedAccountOf(tx, pair);
      if (account === undefined)
        throw new Error(`external identity ${pair.issuer} ${pair.subject} maps to no user`);
      const ownSignIn = tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, account.id),
            eq(users.idpIssuer, pair.issuer),
            eq(users.idpSub, pair.subject),
          ),
        )
        .get();
      if (ownSignIn !== undefined) return { kind: 'own_sign_in', account };
      tx.delete(externalIdentity).where(eq(externalIdentity.id, row.id)).run();
      return { kind: 'unlinked', account, pair, personId: row.personId };
    },
    { behavior: 'immediate' },
  );
}

function assertPair(pair: CredentialPair): void {
  if (pair.issuer === '' || pair.subject === '')
    throw new Error('a credential needs a non-empty issuer and subject');
}

function matchesPair(pair: CredentialPair) {
  return and(eq(externalIdentity.issuer, pair.issuer), eq(externalIdentity.subject, pair.subject));
}

function linkedAccountOf(tx: Transaction, pair: CredentialPair): LinkedAccount | undefined {
  return tx
    .select({ id: users.id, username: users.username })
    .from(externalIdentity)
    .innerJoin(users, eq(users.id, externalIdentity.userId))
    .where(matchesPair(pair))
    .get();
}
