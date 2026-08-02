import { describe, expect, it } from 'bun:test';

import { resolveColor } from './color';

describe('resolveColor', () => {
  it('accepts "blue" from SMOKE_COLOR', () => {
    expect(resolveColor({ SMOKE_COLOR: 'blue' })).toBe('blue');
  });

  it('accepts "green" from SMOKE_COLOR', () => {
    expect(resolveColor({ SMOKE_COLOR: 'green' })).toBe('green');
  });

  it('throws rather than defaulting when SMOKE_COLOR is unset', () => {
    // The whole point of this check is that the live colour alternates on
    // every deploy — silently assuming "blue" would eventually smoke-test
    // the wrong (dead) colour with no indication anything was wrong.
    expect(() => resolveColor({})).toThrow(/SMOKE_COLOR/);
  });

  it('throws on an invalid value instead of silently accepting it', () => {
    expect(() => resolveColor({ SMOKE_COLOR: 'purple' })).toThrow(/SMOKE_COLOR/);
  });
});
