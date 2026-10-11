import { describe, expect, test } from 'bun:test';

import { ApiFailure } from './api';
import {
  describeFailure,
  describeOperatorFailure,
  offersAi,
  offersBuild,
  unreachableMessage,
} from './app-flow';

describe('manual brief route to Build', () => {
  const now = Date.UTC(2026, 9, 11, 12);

  test('the manual brief offers Build whenever the claim is live', () => {
    // Proof: returning false for a live claim failed this case and the `manual` capture in
    // browser/screens.mjs ("manual brief does not link to Build").
    expect(offersBuild({ expiresAt: '2026-10-11T12:00:01.000Z' }, now)).toBe(true);
    expect(offersBuild({ expiresAt: '2026-10-12T11:59:00.000Z' }, now)).toBe(true);
    expect(offersBuild({ expiresAt: '2026-10-11T12:00:00.000Z' }, now)).toBe(false);
    expect(offersBuild({ expiresAt: '2026-10-10T12:00:00.000Z' }, now)).toBe(false);
  });

  test('the manual brief offers AI only while the claim is live and AI is enabled', () => {
    const live = '2026-10-11T13:00:00.000Z';
    const expired = '2026-10-11T11:00:00.000Z';
    // Proof: returning offersBuild alone made the disabled and paused rows offer AI, the dead
    // "AI chat isn't switched on yet" loop of veto V14.
    for (const [provider, expiresAt, expected] of [
      ['openrouter', live, true],
      ['demo', live, true],
      ['disabled', live, false],
      ['paused', live, false],
      ['openrouter', expired, false],
      ['demo', expired, false],
      ['disabled', expired, false],
      ['paused', expired, false],
    ] as const)
      expect(offersAi({ provider, expiresAt }, now)).toBe(expected);
  });

  test('a malformed claim expiry is an error, not a hidden card', () => {
    expect(() => offersBuild({ expiresAt: 'tomorrow' }, now)).toThrow('claim expiry');
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
