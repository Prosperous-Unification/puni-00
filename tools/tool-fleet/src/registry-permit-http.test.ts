import { expect, test } from 'bun:test';

import { observeRegistryPermitHttp } from './registry-permit-http-observation.fixture';

test('exact fixture retries reset and requires the requested HTTP response', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'reset' });
  expect(observed.state).toBe('fulfilled');
  expect(observed.calls).toBe(3);
  expect(observed.categories).toEqual(['connection-reset', '202']);
  expect(observed.lastHttp).toBe('405');
  expect(observed.expectedHttp).toBe(405);
  expect(observed.uploads).toBe(1);
  expect(observed.elapsed).toBe(150);
  expect(observed.requests).toEqual(
    Array.from({ length: 3 }, () => ({
      url: 'http://127.0.0.1:5052/v2/guard-proof/blobs/uploads/',
      method: 'POST',
      aborted: false,
    })),
  );
});
test('exact fixture refuses perpetual resets at the existing six-second bound', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'resets' });
  expect(observed.state).toBe('rejected');
  expect(observed.message).toBe('Owned guard HTTP outcome did not converge');
  expect(observed.calls).toBe(120);
  expect(observed.elapsed).toBe(6000);
});
for (const scenario of ['unknown', 'non-error'] as const)
  test(
    'exact fixture propagates unknown or non-Error transport identity' +
      (scenario === 'non-error' ? ' non-Error' : ''),
    async () => {
      const observed = await observeRegistryPermitHttp({ scenario });
      expect(observed.state).toBe('rejected');
      expect(observed.isOriginalFailure).toBe(true);
      expect(observed.calls).toBe(1);
      expect(observed.categories).toEqual([]);
      expect(observed.lastHttp).toBe('other-error');
    },
  );
test('exact fixture propagates cancellation during a reset without retry', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'cancellation' });
  expect(observed.state).toBe('rejected');
  expect(observed.isCancellation).toBe(true);
  expect(observed.calls).toBe(1);
  expect(observed.categories).toEqual([]);
  expect(observed.lastHttp).toBe('connection-reset');
});
test('exact fixture never treats unexpected HTTP status as convergence', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'unexpected' });
  expect(observed.state).toBe('rejected');
  expect(observed.message).toBe('Unexpected owned guard response');
  expect(observed.calls).toBe(1);
  expect(observed.lastHttp).toBe('unexpected-status');
});
for (const [scenario, category] of [
  ['refused', 'connection-refused'],
  ['timeout', 'timeout'],
] as const)
  test('shared native HTTP retries ' + scenario, async () => {
    const observed = await observeRegistryPermitHttp({ scenario });
    expect(observed.state).toBe('fulfilled');
    expect(observed.calls).toBe(2);
    expect(observed.categories).toEqual([category]);
    expect(observed.elapsed).toBe(50);
  });
for (const scenario of ['uuid-missing', 'uuid-invalid'] as const)
  test('shared native HTTP refuses ' + scenario, async () => {
    const observed = await observeRegistryPermitHttp({ scenario });
    expect(observed.state).toBe('rejected');
    expect(observed.message).toBe('Unknown or excessive owned upload probes');
    expect(observed.calls).toBe(1);
    expect(observed.categories).toEqual([]);
  });
test('shared native HTTP refuses oversized response body', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'oversized' });
  expect(observed.state).toBe('rejected');
  expect(observed.message).toBe('Owned guard HTTP response exceeds 4096 bytes');
  expect(observed.calls).toBe(1);
});
test('shared native HTTP preserves response body failure identity', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'body-error' });
  expect(observed.state).toBe('rejected');
  expect(observed.isAggregateError).toBe(true);
  expect(observed.originalMembers).toBe(2);
  expect(observed.hasOriginalCause).toBe(true);
  expect(observed.calls).toBe(1);
});
test('shared native HTTP caps cumulative uploads despite altered diagnostic snapshot', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'cap' });
  expect(observed.state).toBe('rejected');
  expect(observed.message).toBe('Unknown or excessive owned upload probes');
  expect(observed.calls).toBe(257);
  expect(observed.uploads).toBe(257);
  expect(observed.savedUploads).toBe(0);
});
test('shared native HTTP accepts requested writable response', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'writable' });
  expect(observed.state).toBe('fulfilled');
  expect(observed.calls).toBe(1);
  expect(observed.uploads).toBe(1);
  expect(observed.expectedHttp).toBe(202);
  expect(observed.categories).toEqual([]);
});
test('shared native HTTP refuses already cancelled signal before fetch', async () => {
  const observed = await observeRegistryPermitHttp({ scenario: 'pre-cancel' });
  expect(observed.state).toBe('rejected');
  expect(observed.isCancellation).toBe(true);
  expect(observed.calls).toBe(0);
  expect(observed.requests).toEqual([]);
});
