import type { PersonView } from '@/lib/wbs-api';

import type { MenuAction } from './actions-menu';

/**
 * Who the signed-in account claims as (`wbs-claim-display` C23): the one
 * **human** person of the directory bound to it (`patchPerson.accountId`,
 * `wbs-team-claims` D5). Agent persons bound to the same account are its
 * agents, not the account, so they never count.
 *
 * - `bound`: exactly one such person, whom a claim from the plan names.
 * - `unbound`: none; be-01 would refuse `person_not_bound`.
 * - `several`: more than one, and the plan will not guess between them.
 * - `unknown`: a person row arrived without `accountId` (a be-01 that predates
 *   the binding), so whether one is bound cannot be read.
 */
export type Claimant =
  | { kind: 'bound'; personId: string; name: string }
  | { kind: 'unbound' }
  | { kind: 'several'; names: string[] }
  | { kind: 'unknown' };

/**
 * The account's {@link Claimant}, read off the directory the plan already
 * holds rather than a read of its own: the people read carries `accountId`
 * since `wbs-team-claims`, and the session knows its account id.
 *
 * Proof: counting agent persons made `claims as the human, not the account's
 * agent` fail on `expected { kind: 'several', …(1) } to deeply equal { kind:
 * 'bound', …(2) }`; dropping the missing-`accountId` arm made `cannot say from
 * a person row without accountId` fail on `expected { kind: 'bound', …(2) } to
 * deeply equal { kind: 'unknown' }`; watched 2026-10-27.
 */
export function claimantOf(people: readonly PersonView[], accountId: string): Claimant {
  if (people.some((person) => person.accountId === undefined)) return { kind: 'unknown' };
  const bound = people.filter(
    (person) => person.kind === 'person' && person.accountId === accountId,
  );
  const only = bound.at(0);
  if (only === undefined) return { kind: 'unbound' };
  if (bound.length > 1) return { kind: 'several', names: bound.map((person) => person.name) };
  return { kind: 'bound', personId: only.id, name: only.name };
}

/**
 * What a row's menu offers for claiming (C23), or null when the table was
 * drawn for no account (`WbsTable`'s optional `viewerAccountId`).
 *
 * - `release`: the claimant holds a claim on this row (a step claim or its
 *   subtree claim); Release lets go of every one of them.
 * - `claim`: anything else the claimant could take — unclaimed, or held by
 *   somebody else, in which case be-01's `already_claimed` names the holders.
 * - `refused`: Claim drawn but not taken, with the reason (C24: never hidden).
 */
export type ClaimOffer =
  | { kind: 'release'; personId: string }
  | { kind: 'claim'; personId: string }
  | { kind: 'refused'; because: string };

/** Where an admin binds an account to a person, which every refusal points at. */
const BIND_IN_DIRECTORY = 'an organization admin binds it in the Directory';

/**
 * The row's {@link ClaimOffer}.
 *
 * @param claimant Who the signed-in account claims as.
 * @param holders The person ids holding a claim drawn on this row.
 * @param isDone Whether the row is done, which leaves nothing to claim.
 *
 * Proof: offering Claim whatever the row holds made `offers Release on a row
 * the claimant holds` fail on `expected 'claim' to be 'release'`; dropping the
 * done arm made `refuses Claim on a done row` fail on `expected { kind:
 * 'claim', personId: 'dany' } to deeply equal { kind: 'refused', …(1) }`;
 * watched 2026-10-27.
 */
export function claimOfferOf(
  claimant: Claimant,
  holders: readonly string[],
  isDone: boolean,
): ClaimOffer {
  switch (claimant.kind) {
    case 'unknown':
      return {
        kind: 'refused',
        because: 'This server does not say which person your account is bound to',
      };
    case 'unbound':
      return {
        kind: 'refused',
        because: `Your account is not bound to a person — ${BIND_IN_DIRECTORY} before you can claim`,
      };
    case 'several':
      return {
        kind: 'refused',
        because: `Your account is bound to ${claimant.names.join(', ')} — ${BIND_IN_DIRECTORY} to one person`,
      };
    case 'bound':
      if (holders.includes(claimant.personId)) {
        return { kind: 'release', personId: claimant.personId };
      }
      if (isDone) return { kind: 'refused', because: 'Done — there is nothing left to claim' };
      return { kind: 'claim', personId: claimant.personId };
  }
}

/**
 * The menu item for a {@link ClaimOffer}: `Claim`, `Release my claim`, or a
 * `Claim` that says why it cannot be taken. The same one item in the table's
 * ⋯ and a phone card's.
 */
export function claimActions(
  offer: ClaimOffer | null,
  take: { claim: (personId: string) => void; release: (personId: string) => void },
): MenuAction[] {
  if (offer === null) return [];
  switch (offer.kind) {
    case 'claim':
      return [
        {
          id: 'claim',
          label: 'Claim',
          run: () => {
            take.claim(offer.personId);
          },
        },
      ];
    case 'release':
      return [
        {
          id: 'release',
          label: 'Release my claim',
          run: () => {
            take.release(offer.personId);
          },
        },
      ];
    case 'refused':
      return [{ id: 'claim', label: 'Claim', refusedBecause: offer.because, run: () => undefined }];
  }
}
