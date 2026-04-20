import { describe, expect, it } from 'bun:test';

import { ReplayBuffer } from './replay-buffer';

describe('ReplayBuffer', () => {
  it('returns in-order events with seq strictly greater than sinceSeq', () => {
    const buf = new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 60_000, now: () => 1_000 });
    for (let i = 0; i < 10; i++) buf.record('doc:a', i, { i });
    const out = buf.since('doc:a', 5);
    expect(out.map((e) => e.seq)).toEqual([6, 7, 8, 9]);
  });

  it('evicts oldest when size cap reached', () => {
    const buf = new ReplayBuffer({ maxPerSubscription: 3, maxAgeMs: 60_000, now: () => 1_000 });
    for (let i = 0; i < 5; i++) buf.record('doc:a', i, {});
    const out = buf.since('doc:a', -1);
    expect(out.map((e) => e.seq)).toEqual([2, 3, 4]);
  });

  it('evicts by age cap on subsequent record calls', () => {
    let t = 0;
    const buf = new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 1000, now: () => t });
    buf.record('doc:a', 0, {});
    t = 1500;
    buf.record('doc:a', 1, {});
    expect(buf.since('doc:a', -1).map((e) => e.seq)).toEqual([1]);
  });

  it('oldestSeq returns the first buffered seq or null when empty', () => {
    const buf = new ReplayBuffer({ maxPerSubscription: 10, maxAgeMs: 60_000, now: () => 1 });
    expect(buf.oldestSeq('doc:a')).toBeNull();
    buf.record('doc:a', 3, {});
    buf.record('doc:a', 4, {});
    expect(buf.oldestSeq('doc:a')).toBe(3);
  });
});
