import { describe, expect, it, vi } from 'vitest';

import type { PersonView } from '@/lib/wbs-api';

import { claimActions, claimantOf, claimOfferOf } from './claim-offer';

const person = (
  id: string,
  accountId: string | null | undefined,
  kind: PersonView['kind'] = 'person',
): PersonView => ({
  id,
  name: id,
  kind,
  teamIds: [],
  ...(accountId === undefined ? {} : { accountId }),
});

describe('who the account claims as (wbs-claim-display C23)', () => {
  it('claims as the human, not the account’s agent', () => {
    // Proof: counting agent persons failed on `expected { kind: 'several', …(1)
    // } to deeply equal { kind: 'bound', …(2) }`; watched 2026-10-27.
    expect(claimantOf([person('dany', 'u1'), person('claude-code', 'u1', 'agent')], 'u1')).toEqual({
      kind: 'bound',
      personId: 'dany',
      name: 'dany',
    });
  });

  it('is unbound when no person names the account', () => {
    expect(claimantOf([person('dany', null), person('eve', 'u2')], 'u1')).toEqual({
      kind: 'unbound',
    });
  });

  it('will not guess between two people bound to one account', () => {
    expect(claimantOf([person('ada', 'u1'), person('bea', 'u1')], 'u1')).toEqual({
      kind: 'several',
      names: ['ada', 'bea'],
    });
  });

  it('cannot say from a person row without accountId', () => {
    // Proof: dropping the missing-field arm failed on `expected { kind:
    // 'bound', …(2) } to deeply equal { kind: 'unknown' }`; watched 2026-10-27.
    expect(claimantOf([person('dany', 'u1'), person('old', undefined)], 'u1')).toEqual({
      kind: 'unknown',
    });
  });
});

describe('what a row offers (wbs-claim-display C23, C24)', () => {
  const me = { kind: 'bound', personId: 'dany', name: 'dany' } as const;

  it('offers Claim on an unclaimed row and on one somebody else holds', () => {
    expect(claimOfferOf(me, [], false)).toEqual({ kind: 'claim', personId: 'dany' });
    // be-01 answers `already_claimed` with the holders; the menu does not
    // second-guess it.
    expect(claimOfferOf(me, ['claude-code'], false)).toEqual({ kind: 'claim', personId: 'dany' });
  });

  it('offers Release on a row the claimant holds', () => {
    // Proof: offering Claim whatever the row holds failed on `expected
    // 'claim' to be 'release'`; watched 2026-10-27.
    expect(claimOfferOf(me, ['claude-code', 'dany'], false).kind).toBe('release');
    expect(claimOfferOf(me, ['dany'], true).kind).toBe('release');
  });

  it('refuses Claim on a done row', () => {
    // Proof: dropping the done arm failed on `expected { kind: 'claim', …(1) }
    // to deeply equal { kind: 'refused', …(1) }`; watched 2026-10-27.
    expect(claimOfferOf(me, [], true)).toEqual({
      kind: 'refused',
      because: 'Done — there is nothing left to claim',
    });
  });

  it('says where the binding is made when there is none, or several', () => {
    expect(claimOfferOf({ kind: 'unbound' }, [], false)).toEqual({
      kind: 'refused',
      because:
        'Your account is not bound to a person — an organization admin binds it in the Directory before you can claim',
    });
    expect(claimOfferOf({ kind: 'several', names: ['ada', 'bea'] }, [], false)).toEqual({
      kind: 'refused',
      because:
        'Your account is bound to ada, bea — an organization admin binds it in the Directory to one person',
    });
    expect(claimOfferOf({ kind: 'unknown' }, [], false).kind).toBe('refused');
  });
});

describe('the menu item', () => {
  it('is nothing for a table drawn for no account', () => {
    expect(claimActions(null, { claim: vi.fn(), release: vi.fn() })).toEqual([]);
  });

  it('claims and releases for the offer’s person', () => {
    const take = { claim: vi.fn(), release: vi.fn() };
    const [claim] = claimActions({ kind: 'claim', personId: 'dany' }, take);
    const [release] = claimActions({ kind: 'release', personId: 'dany' }, take);
    expect([claim.label, release.label]).toEqual(['Claim', 'Release my claim']);
    claim.run();
    release.run();
    expect(take.claim).toHaveBeenCalledWith('dany');
    expect(take.release).toHaveBeenCalledWith('dany');
  });

  it('draws a refused Claim with its reason rather than leaving it out', () => {
    const [item] = claimActions(
      { kind: 'refused', because: 'why' },
      { claim: vi.fn(), release: vi.fn() },
    );
    expect(item).toMatchObject({ id: 'claim', label: 'Claim', refusedBecause: 'why' });
  });
});
