import { describe, expect, it } from 'bun:test';

import { InFlightCounter } from './in-flight-counter';

describe('an in-flight counter', () => {
  it('admits up to the limit per key, and a second release frees nothing', () => {
    const counter = new InFlightCounter(2);
    const first = counter.acquire('org-a');
    const second = counter.acquire('org-a');
    expect(counter.acquire('org-a')).toBeNull();
    expect(counter.acquire('org-b')).not.toBeNull();
    first?.();
    first?.();
    expect(counter.countOf('org-a')).toBe(1);
    expect(counter.acquire('org-a')).not.toBeNull();
    expect(counter.acquire('org-a')).toBeNull();
    second?.();
    expect(counter.countOf('org-a')).toBe(1);
  });

  it('drops a key whose calls all ended', () => {
    const counter = new InFlightCounter(1);
    counter.acquire('org-a')?.();
    expect(counter.size).toBe(0);
  });

  it('refuses a limit that admits nothing', () => {
    expect(() => new InFlightCounter(0)).toThrow('positive integer');
    expect(() => new InFlightCounter(1.5)).toThrow('positive integer');
  });
});
