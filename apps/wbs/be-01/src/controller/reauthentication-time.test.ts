import { describe, expect, it } from 'bun:test';

import { pairPrefixOf, reauthenticatedAtOf } from './reauthentication-time';

const AT = Date.UTC(2026, 9, 12, 9);
const prompted = { prompt: 'login', maxAge: 3_600 } as const;
const promptOnly = { prompt: 'login', maxAge: null } as const;

describe('the reauthentication time a login callback proves', () => {
  it('names the strategy and connection of a subject', () => {
    expect(pairPrefixOf('samlp|acme-saml|m@acme.test')).toBe('samlp|acme-saml|');
    expect(pairPrefixOf('google-oauth2|7')).toBe('google-oauth2|');
  });

  it('reads auth_time only under max_age', () => {
    const authTime = Math.floor(AT / 1000) - 60;
    const base = { replaced: { kind: 'native' } as const, subject: 'samlp|a|m', callbackAt: AT };
    expect(reauthenticatedAtOf({ ...base, requested: prompted, authTime })).toBe(authTime * 1000);
    expect(reauthenticatedAtOf({ ...base, requested: promptOnly, authTime })).toBeNull();
    expect(
      reauthenticatedAtOf({ ...base, requested: prompted, authTime: Math.floor(AT / 1000) + 60 }),
    ).toBeNull();
  });

  it('takes the callback time for a prompted sign-in with nothing replaced or the same pair', () => {
    const base = { requested: promptOnly, authTime: undefined, callbackAt: AT };
    expect(
      reauthenticatedAtOf({ ...base, replaced: { kind: 'none' }, subject: 'google-oauth2|7' }),
    ).toBe(AT);
    expect(
      reauthenticatedAtOf({
        ...base,
        replaced: { kind: 'oidc', subject: 'samlp|acme-saml|old' },
        subject: 'samlp|acme-saml|m',
      }),
    ).toBe(AT);
  });

  it('does not reauthenticate through a different connection', () => {
    expect(
      reauthenticatedAtOf({
        requested: promptOnly,
        authTime: undefined,
        replaced: { kind: 'oidc', subject: 'samlp|acme-saml|m' },
        subject: 'google-oauth2|7',
        callbackAt: AT,
      }),
    ).toBeNull();
  });

  it('proves nothing without a prompt, or over a password session', () => {
    expect(
      reauthenticatedAtOf({
        requested: undefined,
        authTime: Math.floor(AT / 1000),
        replaced: { kind: 'none' },
        subject: 'samlp|a|m',
        callbackAt: AT,
      }),
    ).toBeNull();
    expect(
      reauthenticatedAtOf({
        requested: promptOnly,
        authTime: undefined,
        replaced: { kind: 'native' },
        subject: 'samlp|a|m',
        callbackAt: AT,
      }),
    ).toBeNull();
  });
});
