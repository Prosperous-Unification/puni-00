import { describe, expect, test } from 'bun:test';

import { ApiFailure } from './api';
import {
  describeFailure,
  describeOperatorFailure,
  InvalidSessionStatus,
  loadAiExploration,
  offersAiExploration,
  parseSessionStatus,
  signInRoute,
  unreachableMessage,
} from './app-flow';

async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

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

  test('offers or hides the AI card from a readable session status', async () => {
    expect(
      await loadAiExploration(() =>
        Promise.resolve({ mode: 'oidc', configured: false, account: null }),
      ),
    ).toEqual({ kind: 'hidden' });
    expect(
      await loadAiExploration(() =>
        Promise.resolve({ mode: 'oidc', configured: true, account: null }),
      ),
    ).toEqual({ kind: 'offered' });
  });

  test('reports modelled session failures as unavailable, carrying the error', async () => {
    const network = new TypeError('Failed to fetch');
    expect(await loadAiExploration(() => Promise.reject(network))).toEqual({
      kind: 'unavailable',
      error: network,
    });
    const api = new ApiFailure(500, 'internal_error');
    expect(await loadAiExploration(() => Promise.reject(api))).toEqual({
      kind: 'unavailable',
      error: api,
    });
    const malformed = await loadAiExploration(() => Promise.resolve({ mode: 'other' }));
    expect(malformed.kind).toBe('unavailable');
    expect(malformed.kind === 'unavailable' && malformed.error).toBeInstanceOf(
      InvalidSessionStatus,
    );
  });

  test('rethrows failures it does not model', async () => {
    const bug = new TypeError('Cannot read properties of undefined');
    expect(await rejectionOf(loadAiExploration(() => Promise.reject(bug)))).toBe(bug);
    const unexpected = new Error('unexpected');
    expect(await rejectionOf(loadAiExploration(() => Promise.reject(unexpected)))).toBe(unexpected);
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

  test('gives operator sign-in its own copy instead of visitor brief copy', () => {
    expect(describeOperatorFailure(new ApiFailure(503, 'operator_unconfigured'))).toBe(
      'Operator sign-in is not set up on this API. Set OPERATOR_PASSWORD and restart it.',
    );
    expect(describeOperatorFailure(new ApiFailure(401, 'invalid_credentials'))).toBe(
      'That password was not accepted.',
    );
    expect(describeOperatorFailure(new TypeError('Failed to fetch'))).toBe(unreachableMessage);
    expect(describeOperatorFailure(new ApiFailure(429, 'rate_limited'))).toBe(
      'Too many attempts. Please wait and try again.',
    );
  });
});
