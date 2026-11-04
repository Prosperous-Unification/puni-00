import { expect, test } from 'bun:test';

import { observeRegistryServer } from './registry-server-observation.fixture';

for (const phase of ['ready', 'spawn'] as const)
  for (const fault of ['none', 'metadata', 'identity', 'unlink'] as const)
    test(
      'actual server preserves ' + phase + ' failure through ' + fault + ' authentication cleanup',
      async () => {
        const proof = await observeRegistryServer({
          family: 'cleanup',
          fault,
          phase,
          action: 'deletion',
          primary: 'error',
        });
        expect(proof.state).toBe('rejected');
        if (fault === 'identity') expect(proof.observations).not.toContain('unlink');
        if (fault === 'none') expect(proof.isOriginalFailure).toBe(true);
        else {
          expect(proof.isAggregateError).toBe(true);
          expect(proof.hasOriginalFirst).toBe(true);
          expect(proof.memberCount).toBe(2);
          if (fault === 'identity') {
            expect(proof.cleanupMessage).toBe(
              'Maintenance authentication cleanup identity mismatch',
            );
            expect(proof.hasIdentityCause).toBe(true);
          } else {
            expect(proof.hasCleanupSecond).toBe(true);
            expect(proof.hasCleanupCause).toBe(true);
          }
        }
        const expected = ['authentication', 'spawn'];
        if (phase === 'ready') expected.push('ready', 'settled');
        expected.push('metadata');
        if (fault === 'none' || fault === 'unlink') expected.push('unlink');
        expect(proof.observations).toEqual(expected);
        expect(proof.cleanupPaths).toEqual(
          Array.from(
            { length: fault === 'none' || fault === 'unlink' ? 2 : 1 },
            () => '/run/puni-registry-maintenance/auth.htpasswd',
          ),
        );
        expect(proof.hasSettledBeforeCleanup).toBe(true);
        expect(proof.authClosed).toBe(true);
        expect(proof.authWrites).toEqual(['maintenance:modeled-bcrypt\n']);
      },
    );

for (const primary of ['undefined', 'null', 'string'] as const)
  for (const fault of ['none', 'unlink'] as const)
    test(
      'actual server retains ' +
        (primary === 'string' ? 'owned cancellation' : primary) +
        ' failure with ' +
        fault +
        ' cleanup',
      async () => {
        const proof = await observeRegistryServer({
          family: 'cleanup',
          fault,
          phase: 'spawn',
          action: 'deletion',
          primary,
        });
        expect(proof.state).toBe('rejected');
        if (fault === 'none') expect(proof.isOriginalFailure).toBe(true);
        else {
          expect(proof.isAggregateError).toBe(true);
          expect(proof.memberCount).toBe(2);
          expect(proof.hasOriginalFirst).toBe(true);
          expect(proof.hasCleanupSecond).toBe(true);
        }
        expect(proof.hasSettledBeforeCleanup).toBe(true);
      },
    );

test('actual collection completes without creating or cleaning authentication', async () => {
  const proof = await observeRegistryServer({
    family: 'cleanup',
    fault: 'metadata',
    phase: 'ready',
    action: 'collect',
    primary: 'error',
  });
  expect(proof.state).toBe('fulfilled');
  expect(proof.observations).toEqual(['spawn', 'settled']);
  expect(proof.cleanupPaths).toEqual([]);
  expect(proof.authWrites).toEqual([]);
  expect(proof.spawnCommand).toEqual(['/pinned/registry', 'garbage-collect', '/modeled/deletion']);
});
test('actual collection preserves a spawn failure without authentication cleanup', async () => {
  const proof = await observeRegistryServer({
    family: 'cleanup',
    fault: 'unlink',
    phase: 'spawn',
    action: 'collect',
    primary: 'error',
  });
  expect(proof.isOriginalFailure).toBe(true);
  expect(proof.observations).toEqual(['spawn']);
});
test('actual readonly action retains readiness and cleanup failures', async () => {
  const proof = await observeRegistryServer({
    family: 'cleanup',
    fault: 'unlink',
    phase: 'ready',
    action: 'readonly',
    primary: 'error',
  });
  expect(proof.isAggregateError).toBe(true);
  expect(proof.memberCount).toBe(2);
  expect(proof.hasOriginalFirst).toBe(true);
  expect(proof.hasCleanupSecond).toBe(true);
  expect(proof.observations).toEqual([
    'authentication',
    'spawn',
    'ready',
    'settled',
    'metadata',
    'unlink',
  ]);
  expect(proof.spawnCommand).toEqual(['/pinned/registry', 'serve', '/modeled/readonly']);
  expect(proof.hasSettledBeforeCleanup).toBe(true);
});
