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
    expect(ctx['SITE_ADDRESS']).toBe('wbs.bulletpoints.club');
    expect(ctx['BE_ROUTE']).toBe('reverse_proxy be-01-green:3100');
    expect(ctx['GW_ROUTE']).toContain('reverse_proxy gw-01-blue:3200 {');
    expect(ctx['GW_ROUTE']).toContain('stream_close_delay 310s');
    expect(ctx['FE_ROUTE']).toBe('reverse_proxy fe-01-green:80');
  });

  // Bug found in the Task 12 rehearsal: a tier with no observed colour used
  // to default to 'blue', which got written into site.caddy as if it were
  // real routing state, then read back as ground truth by the NEXT tier's
  // own first deploy — turning a fresh deploy into a bogus "swap" that
  // failed at stop-blue against a container that never existed. `null`
  // must render as an honest "not deployed" response, never a guessed colour.
  it('renders a never-deployed tier (null colour) as an honest 503, not a guessed colour', () => {
    const ctx = siteContext({ be: null, gw: 'blue', fe: null }, 'wbs.bulletpoints.club');
    expect(ctx['BE_ROUTE']).toBe('respond "be-01 not yet deployed" 503');
    expect(ctx['FE_ROUTE']).toBe('respond "fe-01 not yet deployed" 503');
    expect(ctx['BE_ROUTE']).not.toContain('blue');
    expect(ctx['BE_ROUTE']).not.toContain('green');
    // routedColorFor must read this back as null, not as some colour —
    // this is the actual property the bug broke.
    const rendered = `handle /api/* {\n\t\t${ctx['BE_ROUTE']}\n\t}`;
    expect(routedColorFor('be', rendered)).toBeNull();
  });
});
