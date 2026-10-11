import { describe, expect, it } from 'bun:test';

import {
  InMemoryOidcLinkStore,
  InMemoryOidcTransactionStore,
  InMemoryTokenStore,
} from './oidc-store';

describe('InMemoryOidcLinkStore', () => {
  const proof = (userId: string) => ({
    userId,
    session: `session-${userId}`,
    state: 'state',
    nonce: 'nonce',
    verifier: 'verifier',
  });

  it('expires proofs and bounds the retained starts', () => {
    let now = 1_000;
    const store = new InMemoryOidcLinkStore(() => now, 2);
    store.save('first', proof('first'));
    store.save('second', proof('second'));
    store.save('third', proof('third'));
    expect(store.consume('first', 'state', 'session-first')).toBeNull();
    expect(store.consume('second', 'state', 'session-second')).toMatchObject({ userId: 'second' });
    now += 300_000;
    expect(store.consume('third', 'state', 'session-third')).toBeNull();
  });

  it('refuses a nonpositive link retention limit', () => {
    expect(() => new InMemoryOidcLinkStore(() => 1_000, 0)).toThrow(
      'link transaction limit must be positive',
    );
  });
});

function transactionRecords(store: InMemoryOidcTransactionStore): Map<string, unknown> {
  // Tests inspect the concrete in-memory boundary to prove what it retains.
  return (store as unknown as { records: Map<string, unknown> }).records;
}

describe('InMemoryOidcTransactionStore', () => {
  // Proof: replacing digestOidcBinding with identity made the retained key equal
  // the raw binding instead of this independently fixed SHA-256 value.
  // Retaining browserBinding in the record exposes it in serialized values.
  it('retains neither the raw browser binding key nor value', () => {
    const store = new InMemoryOidcTransactionStore({ now: () => 1_000, ttlMs: 5_000 });
    const browserBinding = 'unguessable-browser-binding';
    store.save({ browserBinding, nonce: 'nonce-1', state: 'state-1', verifier: 'verifier-1' });

    const records = transactionRecords(store);
    expect([...records.keys()]).toEqual([
      '3bb40d614eda46d5ac33fae80c699a08385a0b4c35ab0d8651f8b33096115f8e',
    ]);
    expect([...records.keys()]).not.toContain(browserBinding);
    expect(JSON.stringify([...records.values()])).not.toContain(browserBinding);
  });

  it('consumes a browser-bound transaction exactly once', () => {
    const store = new InMemoryOidcTransactionStore({ now: () => 1_000, ttlMs: 5_000 });
    store.save({
      browserBinding: 'browser-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });

    expect(store.consume('browser-1', 'state-1')).toEqual({
      nonce: 'nonce-1',
      outcome: 'consumed',
      verifier: 'verifier-1',
    });
    expect(store.consume('browser-1', 'state-1')).toEqual({ outcome: 'missing' });
  });

  it('refuses another browser without consuming the initiating browser transaction', () => {
    const store = new InMemoryOidcTransactionStore({ now: () => 1_000, ttlMs: 5_000 });
    store.save({
      browserBinding: 'browser-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });

    expect(store.consume('browser-2', 'state-1')).toEqual({ outcome: 'missing' });
    expect(store.consume('browser-1', 'state-1')).toEqual({
      nonce: 'nonce-1',
      outcome: 'consumed',
      verifier: 'verifier-1',
    });
  });

  /**
   * TASK-276, and it **inverts an assertion this file made on purpose.** The
   * case it replaces was `burns a transaction when the initiating browser
   * returns the wrong state`, which consumed with `'wrong-state'` and then
   * asserted the *correct* state was also gone. That was TASK-269's recorded
   * decision, and the argument for it is quoted and answered on `consume`: the
   * retry oracle it avoided needs 256 bits, and the burn it created needs one
   * navigation carrying the `SameSite=Lax` binding cookie.
   *
   * The three arrivals here are the whole contract in order — the forged
   * callback finds the door shut, the honest one still finishes the login it
   * started, and single-use survives the move from the arrival to the match.
   */
  it('keeps the initiating browser transaction when a forged callback returns the wrong state', () => {
    const store = new InMemoryOidcTransactionStore({ now: () => 1_000, ttlMs: 5_000 });
    store.save({
      browserBinding: 'browser-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });

    expect(store.consume('browser-1', 'wrong-state')).toEqual({ outcome: 'state_mismatch' });
    expect(store.consume('browser-1', 'state-1')).toEqual({
      nonce: 'nonce-1',
      outcome: 'consumed',
      verifier: 'verifier-1',
    });
    expect(store.consume('browser-1', 'state-1')).toEqual({ outcome: 'missing' });
  });

  it('refuses and removes an expired transaction', () => {
    let now = 1_000;
    const store = new InMemoryOidcTransactionStore({ now: () => now, ttlMs: 5_000 });
    store.save({
      browserBinding: 'browser-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });

    now = 6_000;
    expect(store.consume('browser-1', 'state-1')).toEqual({ outcome: 'expired' });
    expect(store.cleanupExpired()).toBe(0);
  });

  /**
   * The ordering the preserved mismatch arm depends on. Expiry is dead for
   * everyone and keeps deleting on sight; if the comparison ran first, an
   * expired record answering a wrong state would be preserved by the very arm
   * that exists to protect a live login.
   *
   * **The claim is about this call, not about the record's fate.** An earlier
   * version of this comment said nothing would ever remove such a record except
   * a later `save` on the same binding; that is wrong, because `save` runs the
   * whole-map `cleanupExpired` and the public `cleanupExpired` removes every
   * expired entry regardless of binding. What the ordering actually decides is
   * whether a callback that reaches a dead record leaves it behind, which is
   * why the second assertion is `cleanupExpired()` finding nothing left to do.
   */
  it('reports an expired transaction as expired even when the state also mismatches', () => {
    let now = 1_000;
    const store = new InMemoryOidcTransactionStore({ now: () => now, ttlMs: 5_000 });
    store.save({
      browserBinding: 'browser-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });

    now = 6_000;
    expect(store.consume('browser-1', 'wrong-state')).toEqual({ outcome: 'expired' });
    expect(store.cleanupExpired()).toBe(0);
  });

  /**
   * `expiresAt` is the only thing a callback asks about a binding whose deadline
   * has passed, because `selectBrowserBindings` no longer offers those to
   * `consume` — so if it read without deleting, a dead login's nonce and
   * verifier would stay resident until an unrelated `save` swept them (peer
   * review, TASK-272 r2, Important).
   */
  it('reaps an expired transaction it is asked to order', () => {
    let now = 1_000;
    const store = new InMemoryOidcTransactionStore({ now: () => now, ttlMs: 5_000 });
    store.save({
      browserBinding: 'browser-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });

    expect(store.expiresAt('browser-1')).toBe(6_000);
    expect(store.expiresAt('browser-2')).toBeNull();

    now = 6_000;
    expect(store.expiresAt('browser-1')).toBeNull();
    // Nothing left for a sweep to find: the read above removed it.
    expect(store.cleanupExpired()).toBe(0);
    // …and a live transaction is not spent by being ordered.
    now = 6_500;
    store.save({
      browserBinding: 'browser-3',
      nonce: 'nonce-3',
      state: 'state-3',
      verifier: 'verifier-3',
    });
    expect(store.expiresAt('browser-3')).toBe(11_500);
    expect(store.consume('browser-3', 'state-3').outcome).toBe('consumed');
  });
});

describe('InMemoryTokenStore', () => {
  const firstCredential = {
    kind: 'oidc' as const,
    userId: 'user-1',
    digest: 'a'.repeat(64),
    expiresAt: 5_000,
  };

  it('retains the exact local user, generation and verified credential for a refresh join', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    store.save({
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      sessionCorrelation: 'session-1',
      userId: 'user-1',
      generation: 1,
      credential: firstCredential,
    });

    expect(store.read('session-1')).toEqual({
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      userId: 'user-1',
      generation: 1,
      credential: firstCredential,
    });
  });

  it('does not let a stale refresh completion overwrite or recreate a local winner', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    const first = {
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      userId: 'user-1',
      generation: 1,
      credential: firstCredential,
    };
    const second = {
      ...first,
      expiresAt: 7_000,
      refreshToken: 'refresh-2',
      generation: 2,
      credential: { ...firstCredential, digest: 'b'.repeat(64) },
    };
    store.save({ ...first, sessionCorrelation: 'session-1' });

    expect(store.replaceIfCurrent('session-1', first, second)).toBe(true);
    expect(store.replaceIfCurrent('session-1', first, { ...second, generation: 3 })).toBe(false);
    expect(store.read('session-1')).toEqual(second);
    store.delete('session-1');
    expect(store.replaceIfCurrent('session-1', first, second)).toBe(false);
    expect(store.read('session-1')).toBeNull();
  });

  it('removes only the captured refresh material after a failed durable transition', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    const first = {
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      userId: 'user-1',
      generation: 1,
      credential: firstCredential,
    };
    const second = {
      ...first,
      refreshToken: 'refresh-2',
      generation: 2,
      credential: { ...firstCredential, digest: 'b'.repeat(64) },
    };
    store.save({ ...first, sessionCorrelation: 'session-1' });
    expect(store.replaceIfCurrent('session-1', first, second)).toBe(true);
    expect(store.deleteIfCurrent('session-1', first)).toBe(false);
    expect(store.read('session-1')).toEqual(second);
    expect(store.deleteIfCurrent('session-1', second)).toBe(true);
    expect(store.read('session-1')).toBeNull();
  });

  it('gives one exact refresh attempt ownership and cannot release a successor claim', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    const first = {
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      userId: 'user-1',
      generation: 1,
      credential: firstCredential,
    };
    const second = { ...first, generation: 2, refreshToken: 'refresh-2' };
    store.save({ ...first, sessionCorrelation: 'session-1' });
    store.save({ ...first, sessionCorrelation: 'session-2' });
    const owner = store.claimIfCurrent('session-1', first);
    expect(typeof owner).toBe('object');
    if (typeof owner !== 'object' || owner === null) throw new Error('claim missing');
    expect(store.claimIfCurrent('session-1', first)).toBe('busy');
    expect(typeof store.claimIfCurrent('session-2', first)).toBe('object');
    expect(owner.replace(second)).toBe(true);
    const successor = store.claimIfCurrent('session-1', second);
    expect(typeof successor).toBe('object');
    if (typeof successor !== 'object' || successor === null)
      throw new Error('successor claim missing');
    owner.release();
    expect(store.claimIfCurrent('session-1', second)).toBe('busy');
    successor.release();
    expect(typeof store.claimIfCurrent('session-1', second)).toBe('object');
  });

  it('invalidates a refresh owner when logout deletes its captured record', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    const first = {
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      userId: 'user-1',
      generation: 1,
      credential: firstCredential,
    };
    store.save({ ...first, sessionCorrelation: 'session-1' });
    const owner = store.claimIfCurrent('session-1', first);
    if (typeof owner !== 'object' || owner === null) throw new Error('claim missing');
    store.delete('session-1');
    expect(owner.replace({ ...first, generation: 2 })).toBe(false);
    expect(owner.delete()).toBe(false);
    expect(store.read('session-1')).toBeNull();
  });

  it('keeps a refresh token behind the session correlation', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    store.save({
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      sessionCorrelation: 'session-1',
    });

    expect(store.read('session-1')).toEqual({ expiresAt: 6_000, refreshToken: 'refresh-1' });
    expect(store.read('another-session')).toBeNull();
  });

  it('rotates a refresh token atomically', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    store.save({
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      sessionCorrelation: 'session-1',
    });

    expect(
      store.rotate({
        expiresAt: 7_000,
        previousRefreshToken: 'refresh-1',
        refreshToken: 'refresh-2',
        sessionCorrelation: 'session-1',
      }),
    ).toBe('rotated');
    expect(store.read('session-1')).toEqual({ expiresAt: 7_000, refreshToken: 'refresh-2' });
  });

  it('detects replay of a rotated token and ends the session', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    store.save({
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      sessionCorrelation: 'session-1',
    });
    store.rotate({
      expiresAt: 7_000,
      previousRefreshToken: 'refresh-1',
      refreshToken: 'refresh-2',
      sessionCorrelation: 'session-1',
    });

    expect(
      store.rotate({
        expiresAt: 8_000,
        previousRefreshToken: 'refresh-1',
        refreshToken: 'refresh-3',
        sessionCorrelation: 'session-1',
      }),
    ).toBe('replay');
    expect(store.read('session-1')).toBeNull();
  });

  it('refuses an unknown previous token without ending the session', () => {
    const store = new InMemoryTokenStore({ now: () => 1_000 });
    store.save({
      expiresAt: 6_000,
      refreshToken: 'refresh-1',
      sessionCorrelation: 'session-1',
    });

    expect(
      store.rotate({
        expiresAt: 7_000,
        previousRefreshToken: 'unknown',
        refreshToken: 'refresh-2',
        sessionCorrelation: 'session-1',
      }),
    ).toBe('invalid');
    expect(store.read('session-1')?.refreshToken).toBe('refresh-1');
  });

  it('removes expired and logged-out sessions', () => {
    let now = 1_000;
    const store = new InMemoryTokenStore({ now: () => now });
    store.save({ expiresAt: 6_000, refreshToken: 'refresh-1', sessionCorrelation: 'expired' });
    store.save({ expiresAt: 7_000, refreshToken: 'refresh-2', sessionCorrelation: 'logout' });

    expect(store.delete('logout')).toBe(true);
    expect(store.read('logout')).toBeNull();
    now = 6_000;
    expect(store.cleanupExpired()).toBe(1);
    expect(store.read('expired')).toBeNull();
  });
});
