import { expect, test } from 'bun:test';

import { observeRegistryServer } from './registry-server-observation.fixture';

/** Actual server module and owned Bun child/group; files, artifact authority and HTTP remain modeled, not Distribution acceptance. Observations precede worker rescue. */
test('ready observer failure waits actual owned server group and both pipes before returning', async () => {
  const proof = await observeRegistryServer({
    family: 'native',
    fault: 'none',
    phase: 'ready',
    action: 'deletion',
    primary: 'error',
  });
  expect(proof.isOriginalFailure).toBe(true);
  expect(proof.code).toBe(137);
  expect(proof.signal).toBe('SIGKILL');
  expect(proof.groupAbsent).toBe(true);
  expect(proof.requests).toBe(2);
  expect(proof.hasSettledBeforeCleanup).toBe(true);
  expect(proof.pipeSettlements).toBe(2);
  expect(proof.cleanupPaths).toEqual([
    '/run/puni-registry-maintenance/auth.htpasswd',
    '/run/puni-registry-maintenance/auth.htpasswd',
  ]);
  expect(proof.authClosed).toBe(true);
  expect(proof.authWrites).toEqual(['maintenance:modeled-bcrypt\n']);
  expect(proof.listenerChecks).toBe(2);
  expect(proof.spawnCommand).toEqual(['/pinned/registry', 'serve', '/modeled/deletion']);
  expect(proof.spawnOptions).toEqual({
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    uid: 59001,
    gid: 59001,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 3],
  });
});
