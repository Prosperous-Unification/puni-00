import { expect, test } from 'bun:test';

import { observeRegistryDeletion } from './registry-deletion-observation.fixture';

for (const mode of ['unsafe-gc', 'tag-cleanup'] as const)
  for (const fault of [
    'none',
    'private-mode',
    'original-mode-invalid',
    'restored-mode-differs',
    'actual-mode-differs',
    'owner-success',
    'unfenced',
    'backup',
    'provenance',
    'gc-exit',
    'child-present',
    'accepted',
    'http',
    'restore-service',
    'unknown-cause',
    'early-failure',
    'protected-status',
    'protected-content',
  ] as const) {
    if (
      (mode === 'unsafe-gc' &&
        [
          'accepted',
          'http',
          'private-mode',
          'original-mode-invalid',
          'restored-mode-differs',
          'actual-mode-differs',
        ].includes(fault)) ||
      (mode === 'tag-cleanup' &&
        ['gc-exit', 'child-present', 'unknown-cause', 'early-failure'].includes(fault))
    )
      continue;
    test(`actual deletion controller ${mode} ${fault}`, async () => {
      const observed = await observeRegistryDeletion({ mode, fault });
      if (fault === 'none' || fault === 'private-mode') {
        expect(observed.state).toBe('fulfilled');
        expect(observed.guardCloses).toBe(2);
        expect(observed.guardModes).toEqual(['writable', 'readonly']);
        expect(observed.records).toContainEqual({ deletionNativeReceipt: observed.nativeReceipt });
        expect(
          observed.records.some(
            (entry) =>
              typeof entry === 'object' &&
              entry !== null &&
              Reflect.get(entry, 'proof') === 'owned-deletion-failure',
          ),
        ).toBe(true);
        const protectedRequests = [
          '/v2/retained/index/manifests/sha256:38b9e3f81a86acaf84289c72b802246971298eebf4d8126baef1dab47d1d6023',
          '/v2/retained/index/manifests/sha256:bfd75aab2e925bb2eaa582da730407ddf8d0d8018f2542b65137b323573916f2',
          '/v2/retained/index/manifests/sha256:50211d4b6822302552a5ba7f07c03ff3c34e445328ae2ceb96bd676bd2520292',
          '/v2/retained/index/blobs/sha256:9a99be53bbd3626e25d728c15ab596bdea62834f192887f252eb19cd24d44afc',
          '/v2/retained/index/blobs/sha256:43bb6c1b6f673ec01ffc616dd3795ac2048b9d224158bdfa8bb2fa2add0cb164',
          '/v2/retained/index/blobs/sha256:2ee118f26956a1ea9a9b4d8cf6d1c249f33c0d1367a0a00956f950b5a7433dc5',
          '/v2/retained/index/blobs/sha256:3ee81e2fc562d9362d9e13f22ae023728a3cb831871397efde4e3e0508e369cc',
        ];
        expect(observed.requests).toEqual(
          mode === 'unsafe-gc' ? protectedRequests.slice(0, 1) : protectedRequests,
        );
        expect(observed.requestedModes).toEqual([
          'initialize',
          'backup',
          'index-reopen',
          'deletion-publish-expired',
          'deletion-publish-protected',
          'deletion-protect',
          'deletion-retire',
        ]);
        expect(observed.ownedWrites).toHaveLength(4);
      } else {
        expect(observed.state).toBe('rejected');
        expect(
          observed.records.some(
            (entry) =>
              typeof entry === 'object' &&
              entry !== null &&
              Reflect.get(entry, 'proof') === 'owned-deletion-failure',
          ),
        ).toBe(false);
        if (fault === 'restored-mode-differs' || fault === 'actual-mode-differs')
          expect(observed.message).toBe('Tag link original mode was not restored');
        if (fault === 'protected-status' || fault === 'protected-content') {
          expect(observed.message).toBe('Protected deletion fixture content changed');
          expect(observed.guardCloses).toBe(2);
          expect(observed.requests).toHaveLength(1);
        }
      }
    });
  }
