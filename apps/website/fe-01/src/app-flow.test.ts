import { describe, expect, test } from 'bun:test';

import { ApiFailure } from './api';
import {
  describeFailure,
  loadAiExploration,
  offersAiExploration,
  parseSessionStatus,
  signInRoute,
  unreachableMessage,
} from './app-flow';

describe('AI exploration routing', () => {
  test('Build offers Google only when OIDC is configured, and demo sign-in only in demo mode', () => {
    expect(signInRoute({ mode: 'oidc', configured: true, signedIn: false })).toBe('google');
    expect(signInRoute({ mode: 'demo', configured: true, signedIn: false })).toBe('demo');
    expect(signInRoute({ mode: 'oidc', configured: false, signedIn: false })).toBe('unavailable');
  });

  test('the manual brief never links back to a Build that would only send the visitor here again', () => {
    expect(offersAiExploration({ mode: 'oidc', configured: false, signedIn: false })).toBe(false);
    expect(offersAiExploration({ mode: 'oidc', configured: true, signedIn: false })).toBe(true);
    expect(offersAiExploration({ mode: 'demo', configured: true, signedIn: false })).toBe(true);
    expect(offersAiExploration({ mode: 'oidc', configured: false, signedIn: true })).toBe(true);
  });

  test('validates the session status at the API boundary', () => {
    expect(parseSessionStatus({ mode: 'oidc', configured: false, account: null })).toEqual({
      mode: 'oidc',
      configured: false,
      signedIn: false,
    });
    expect(
      parseSessionStatus({ mode: 'demo', configured: true, account: { email: 'a@b.test' } }),
    ).toEqual({ mode: 'demo', configured: true, signedIn: true });
    expect(() => parseSessionStatus({ mode: 'saml', configured: true, account: null })).toThrow(
      'session status',
    );
    expect(() => parseSessionStatus({ mode: 'oidc', account: null })).toThrow('session status');
    expect(() => parseSessionStatus(null)).toThrow('session status');
  });

  test('hides the optional AI card when the session status cannot be read', async () => {
    expect(
      await loadAiExploration(() =>
        Promise.resolve({ mode: 'oidc', configured: false, account: null }),
      ),
    ).toBe('hidden');
    expect(
      await loadAiExploration(() =>
        Promise.resolve({ mode: 'oidc', configured: true, account: null }),
      ),
    ).toBe('offered');
    expect(await loadAiExploration(() => Promise.reject(new TypeError('Failed to fetch')))).toBe(
      'hidden',
    );
    expect(await loadAiExploration(() => Promise.resolve({ mode: 'other' }))).toBe('hidden');
  });
});

describe('failure copy', () => {
  test('names an unreachable API in plain language instead of the browser error', () => {
    expect(describeFailure(new TypeError('Failed to fetch'))).toBe(unreachableMessage);
    expect(describeFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      unreachableMessage,
    );
    expect(describeFailure(new TypeError('Load failed'))).toBe(unreachableMessage);
    expect(unreachableMessage).toBe('We couldn’t reach PUNI. Check your connection and try again.');
  });

  test('keeps programming errors and typed API failures distinct from an unreachable API', () => {
    expect(describeFailure(new TypeError('Cannot read properties of undefined'))).toBe(
      'Cannot read properties of undefined',
    );
    expect(describeFailure(new ApiFailure(429, 'rate_limited'))).toBe(
      'Too many attempts. Please wait and try again.',
    );
    expect(describeFailure(new ApiFailure(503, 'oidc_unavailable'))).toBe(
      'This option isn’t available right now. You can still send your brief to a person.',
    );
    expect(describeFailure(new ApiFailure(400, 'invalid_email'))).toBe('invalid email');
    expect(describeFailure('unexpected')).toBe('Something went wrong. Try again.');
  });
});
