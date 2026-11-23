import { expect, it } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { readDecision, readHold, releaseHold } from './hold-token';
import { createGuardFixture } from './testing/guard-record.test.fixture';

it('retires an unready guard under the ledger fence despite queued demand and preserves the full helper witness', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    releaseHold(fixture.decision);
    const ticket = fixture.enqueue();
    expect(fixture.runtime.retireGuardHold(fixture.hold, 'unready')).toBe('retired');
    expect(readHold(fixture.holdFile)).toBe(undefined);
    expect(readDecision(fixture.holdFile + '.ready')).toMatchObject({
      kind: 'retired',
      identity: fixture.identity,
    });
    expect(fixture.runtime.hostPoolTransition().guardHolder).toBe(null);
    expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path)).toBe(false);
    expect(fixture.runtime.pollHostJob(ticket, () => undefined)).toMatchObject({
      kind: 'waiting',
      awaiting: 'singleton guard',
    });
  } finally {
    fixture.close();
  }
});
it('keeps an unready guard token while any admitted compute remains outstanding', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    const admission = fixture.runtime.pollHostJob(fixture.enqueue(), () => undefined);
    if (admission.kind !== 'admitted') throw new Error('fixture job not admitted');
    releaseHold(fixture.decision);
    expect(fixture.runtime.retireGuardHold(fixture.hold, 'unready')).toBe('needed');
    expect(readHold(fixture.holdFile)).toEqual(fixture.hold);
    expect(readDecision(fixture.holdFile + '.ready')).toBe(undefined);
    expect(fixture.runtime.guardStillHeld()).toBe(true);
  } finally {
    fixture.close();
  }
});
it('refuses unready retirement when Ready won after the initial hold observation', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    expect(fixture.runtime.retireGuardHold(fixture.hold, 'unready')).toBe('ready');
    expect(readHold(fixture.holdFile)).toEqual(fixture.hold);
    expect(readDecision(fixture.holdFile + '.ready')).toEqual(fixture.decision);
  } finally {
    fixture.close();
  }
});
it('settled guard release removes admission inside the transaction while retaining Ready for generation cleanup', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    expect(fixture.runtime.retireGuardHold(fixture.hold, 'settled')).toBe('retired');
    expect(readHold(fixture.holdFile)).toBe(undefined);
    expect(readDecision(fixture.holdFile + '.ready')).toEqual(fixture.decision);
    expect(fixture.runtime.hostPoolTransition().guardHolder).toBe(null);
    expect(fixture.runtime.recordGuardHolder(process.pid, fixture.path)).toBe(false);
  } finally {
    fixture.close();
  }
});

it('keeps a qualified idle guard while new demand queues rather than retiring it as settled', () => {
  const fixture = createGuardFixture(fakeCredential(), true);
  try {
    fixture.enqueue();
    expect(fixture.runtime.retireGuardHold(fixture.hold, 'settled')).toBe('needed');
    expect(readHold(fixture.holdFile)).toEqual(fixture.hold);
    expect(readDecision(fixture.holdFile + '.ready')).toEqual(fixture.decision);
  } finally {
    fixture.close();
  }
});
