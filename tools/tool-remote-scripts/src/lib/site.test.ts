import { describe, expect, it } from 'bun:test';

import { routedColorFor, siteContext } from './site';

describe('routedColorFor', () => {
  const rendered = [
    'wbs.bulletpoints.club {',
    '  reverse_proxy gw-01-blue:3200',
    '  reverse_proxy be-01-green:3100',
    '  reverse_proxy fe-01-green:80',
    '}',
  ].join('\n');

  it('reads the colour a tier is actually routed to out of a rendered site.caddy', () => {
    expect(routedColorFor('be', rendered)).toBe('green');
    expect(routedColorFor('gw', rendered)).toBe('blue');
    expect(routedColorFor('fe', rendered)).toBe('green');
  });

  it('returns null when the file is empty or the tier is not mentioned', () => {
    expect(routedColorFor('be', '')).toBeNull();
    expect(routedColorFor('be', 'reverse_proxy gw-01-blue:3200')).toBeNull();
  });

  it('never matches another tier by substring', () => {
    // "gw-01-green" must not make routedColorFor('be', ...) match.
    expect(routedColorFor('be', 'reverse_proxy gw-01-green:3200')).toBeNull();
  });
});

describe('siteContext', () => {
  it('builds the exact placeholder set site.caddy.tmpl requires', () => {
    const ctx = siteContext({ be: 'green', gw: 'blue', fe: 'green' }, 'wbs.bulletpoints.club');
    expect(ctx).toEqual({
      SITE_ADDRESS: 'wbs.bulletpoints.club',
      BE_COLOR: 'green',
      GW_COLOR: 'blue',
      FE_COLOR: 'green',
    });
  });
});
