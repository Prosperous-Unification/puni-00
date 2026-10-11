import { describe, expect, it } from 'bun:test';

import { AUTH_METHODS, authMethod, isAuthMethodId, parseAuthMethods } from './auth-methods';

describe('parseAuthMethods', () => {
  it('parses a list in catalogue order', () => {
    expect(parseAuthMethods('email,google,github')).toEqual(['google', 'github', 'email']);
    expect(parseAuthMethods(' github , apple ')).toEqual(['github', 'apple']);
  });

  it('none is an empty list', () => {
    expect(parseAuthMethods('none')).toEqual([]);
  });

  it('refuses an unknown, empty, duplicated or missing value', () => {
    // Proof: 2026-10-11, deleting the duplicate refusal made `google,google`
    // parse to ['google'] and this case fail; deleting the catalogue refusal
    // made `facebook` parse.
    for (const value of [undefined, '', ' ', 'facebook', 'google,google', 'google,,github']) {
      expect(() => parseAuthMethods(value)).toThrow(/AUTH_METHODS/);
    }
    expect(() => parseAuthMethods('none,google')).toThrow(/AUTH_METHODS/);
  });
});

describe('AUTH_METHODS', () => {
  it('names the tenant default connection for each method in fixed order', () => {
    expect(AUTH_METHODS.map(({ id, connection }) => [id, connection])).toEqual([
      ['google', 'google-oauth2'],
      ['github', 'github'],
      ['email', 'email'],
      ['apple', 'apple'],
    ]);
    expect(authMethod('email').label).toBe('Continue with an email code');
  });

  it('recognizes only catalogue ids', () => {
    expect(isAuthMethodId('google')).toBe(true);
    expect(isAuthMethodId('facebook')).toBe(false);
    expect(isAuthMethodId('toString')).toBe(false);
  });
});
