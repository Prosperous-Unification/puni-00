import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { releaseHold } from './hold-token';
import { createGuardFixture } from './testing/guard-record.test.fixture';

it('records the same complete live guard birth and mutex idempotently without replacing its since time', () => {
  const fixture = createGuardFixture(fakeCredential());
  try {
    expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path)).toBe(true);
    const original = fixture.runtime.hostPoolTransition().guardHolder;
    if (original === null) throw new Error('fixture guard record missing');
    fixture.advance();
    expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path)).toBe(true);
    expect(fixture.runtime.hostPoolTransition().guardHolder).toEqual(original);
    expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path + '.other')).toBe(false);
    expect(fixture.runtime.hostPoolTransition().guardHolder).toEqual(original);
  } finally {
    fixture.close();
  }
});
for (const missing of ['hold', 'decision'] as const)
  it('refuses a fresh guard record after its ' + missing + ' admission witness is retired', () => {
    const fixture = createGuardFixture(fakeCredential());
    try {
      releaseHold(missing === 'hold' ? fixture.hold : fixture.decision);
      expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path)).toBe(false);
      expect(fixture.runtime.hostPoolTransition().guardHolder).toBe(null);
    } finally {
      fixture.close();
    }
  });

it('adopts an already recorded full helper idempotently without releasing its shared hold', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const owned = {
      pid: fixture.identity.pid,
      identity: fixture.identity,
      release() {
        throw new Error('shared guard was incorrectly released');
      },
      get exited(): Promise<number> {
        throw new Error('adoption must not observe native exit');
      },
      diagnostics: () => ({ kind: 'readable' as const, text: '' }),
    };
    expect(fixture.runtime.adoptGuardHold(owned, fixture.path)).toBe(true);
  } finally {
    fixture.close();
  }
});
it('retires an unneeded just-admitted helper within the same ledger transaction as refusal', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    fixture.runtime.releaseGuard('fixture', 'fixture', ['controlled no-legacy enrollment']);
    let wasReleased = false;
    const owned = {
      pid: fixture.identity.pid,
      identity: fixture.identity,
      release() {
        wasReleased = true;
        releaseHold(fixture.hold);
      },
      get exited(): Promise<number> {
        throw new Error('adoption must not observe native exit');
      },
      diagnostics: () => ({ kind: 'readable' as const, text: '' }),
    };
    expect(fixture.runtime.adoptGuardHold(owned, fixture.path)).toBe(false);
    expect(wasReleased).toBe(true);
  } finally {
    fixture.close();
  }
});
it('retains a conflicting handoff while compute remains charged instead of inferring release authorization', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const admitted = fixture.runtime.pollHostJob(fixture.enqueue(), () => undefined);
    expect(admitted.kind).toBe('admitted');
    let wasReleased = false;
    const owned = {
      pid: fixture.identity.pid,
      identity: fixture.identity,
      release() {
        wasReleased = true;
      },
      get exited(): Promise<number> {
        throw new Error('adoption must not observe native exit');
      },
      diagnostics: () => ({ kind: 'readable' as const, text: '' }),
    };
    expect(() => fixture.runtime.adoptGuardHold(owned, fixture.path + '.other')).toThrow(
      'outstanding compute',
    );
    expect(wasReleased).toBe(false);
  } finally {
    fixture.close();
  }
});

it('attributes the qualified dead recorded birth before a replacement record while preserving charged reservations', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const admitted = fixture.runtime.pollHostJob(fixture.enqueue(), () => undefined);
    if (admitted.kind !== 'admitted') throw new Error('fixture compute not admitted');
    const reserved = fixture.runtime.hostPoolStatus().reserved,
      old = {
        ...fixture.identity,
        start: String(BigInt(fixture.identity.start) + 1n),
        lockPath: fixture.path,
        since: 50,
      };
    const ledger = new Database(
      join(fixture.runtime.configuration.root, '.dash', 'resources.sqlite'),
    );
    try {
      ledger.query('UPDATE host_pool SET guard_holder=? WHERE id=1').run(JSON.stringify(old));
    } finally {
      ledger.close();
    }
    expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path)).toBe(true);
    const job = fixture.runtime.inspectHostJob(admitted.job.id);
    expect(job.guardLost?.holderPid).toBe(old.pid);
    expect(job.compute.state).toBe('held');
    expect(fixture.runtime.hostPoolStatus().reserved).toEqual(reserved);
  } finally {
    fixture.close();
  }
});

it('refuses recorded cleanup of a live full birth before calling the physical cleanup', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const holder = fixture.runtime.guardObligation().holder;
    if (holder === null) throw new Error('fixture guard record missing');
    let cleaned = false;
    expect(() =>
      fixture.runtime.cleanupDeadGuard(holder, () => {
        cleaned = true;
      }),
    ).toThrow('complete original process termination');
    expect(cleaned).toBe(false);
    expect(fixture.runtime.guardObligation().holder).toEqual(holder);
  } finally {
    fixture.close();
  }
});
it('keeps the dead birth and first loss attribution through failed cleanup without releasing charged reservations', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const admitted = fixture.runtime.pollHostJob(fixture.enqueue(), () => undefined);
    if (admitted.kind !== 'admitted') throw new Error('fixture compute not admitted');
    const reserved = fixture.runtime.hostPoolStatus().reserved,
      holder = {
        ...fixture.identity,
        start: String(BigInt(fixture.identity.start) + 1n),
        lockPath: fixture.path,
        since: 50,
      },
      ledger = new Database(join(fixture.runtime.configuration.root, '.dash', 'resources.sqlite'));
    try {
      ledger.query('UPDATE host_pool SET guard_holder=? WHERE id=1').run(JSON.stringify(holder));
      ledger.run('PRAGMA busy_timeout=0');
      expect(fixture.runtime.recordLostGuard(holder)).toEqual([admitted.job.id]);
      const firstLoss = fixture.runtime.inspectHostJob(admitted.job.id).guardLost;
      fixture.advance();
      fixture.runtime.recordLostGuard(holder);
      expect(fixture.runtime.inspectHostJob(admitted.job.id).guardLost).toEqual(firstLoss);
      const injected = new Error('injected log removal failure');
      expect(() =>
        fixture.runtime.cleanupDeadGuard(holder, () => {
          throw injected;
        }),
      ).toThrow(injected);
      expect(fixture.runtime.guardObligation().holder).toEqual({ ...holder, live: false });
      expect(fixture.runtime.inspectHostJob(admitted.job.id).guardLost).toEqual(firstLoss);
      expect(
        fixture.runtime.cleanupDeadGuard(holder, () => {
          // A second real connection cannot replace the only full witness during physical cleanup.
          expect(() =>
            ledger.query('UPDATE host_pool SET guard_holder=NULL WHERE id=1').run(),
          ).toThrow('locked');
        }),
      ).toBe(true);
      expect(fixture.runtime.guardObligation().holder).toBe(null);
      expect(fixture.runtime.inspectHostJob(admitted.job.id).compute.state).toBe('held');
      expect(fixture.runtime.hostPoolStatus().reserved).toEqual(reserved);
    } finally {
      ledger.close();
    }
  } finally {
    fixture.close();
  }
});
it('leaves a replacement record intact when stale cleanup names another full birth or mutex', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const holder = fixture.runtime.guardObligation().holder;
    if (holder === null) throw new Error('fixture guard record missing');
    for (const stale of [
      { ...holder, start: String(BigInt(holder.start) + 1n) },
      { ...holder, lockPath: holder.lockPath + '.old' },
    ]) {
      let cleaned = false;
      expect(
        fixture.runtime.cleanupDeadGuard(stale, () => {
          cleaned = true;
        }),
      ).toBe(false);
      expect(cleaned).toBe(false);
      expect(fixture.runtime.forgetDeadGuard(stale)).toBe(false);
      expect(fixture.runtime.recordLostGuard(stale)).toEqual([]);
      expect(fixture.runtime.guardObligation().holder).toEqual(holder);
    }
  } finally {
    fixture.close();
  }
});
