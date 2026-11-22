import { join } from 'node:path';

import { dlopen, ptr } from 'bun:ffi';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { awaitPerformanceSupervisor } from './performance-supervisor-test';

/** Read the Linux child-subreaper flag on this Bun test process before and after each worker. */
function expectOrdinaryParent(): void {
  const libc = dlopen('libc.so.6', {
    prctl: { args: ['i32', 'ptr', 'i64', 'i64', 'i64'], returns: 'i32' },
  });
  const status = Int32Array.of(-1);
  try {
    const PR_GET_CHILD_SUBREAPER = 37;
    expect(libc.symbols.prctl(PR_GET_CHILD_SUBREAPER, ptr(status), 0, 0, 0)).toBe(0);
    expect(status[0]).toBe(0);
  } finally {
    libc.close();
  }
}

beforeEach(expectOrdinaryParent);
afterEach(expectOrdinaryParent);

for (const scenario of [
  'borrowed-run',
  'borrowed-calibration',
  'startup-int',
  'startup-term',
  'standalone-hup',
  'pool-wait',
  'legacy-wait',
  'external-poststart',
  'replay-poststart',
  'fd4-run',
  'fd4-calibration',
  'synchronous-int',
  'delivery-failure-run',
  'delivery-failure-calibration',
  'native-unknown-run',
  'native-unknown-calibration',
  'retirement-operation-run',
  'retirement-operation-calibration',
  'retirement-delivery-run',
  'retirement-delivery-calibration',
  'retirement-only-run',
  'retirement-only-calibration',
  'operation-failure-run',
  'operation-failure-calibration',
  'missing-provenance-run',
  'missing-provenance-calibration',
  'missing-provenance-withdrawal-run',
  'missing-provenance-withdrawal-calibration',
])
  it(
    'borrowed host job control ' + scenario,
    async () => {
      const supervisor = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          join(import.meta.dir, 'job-control-supervisor.test.fixture.ts'),
          scenario,
        ],
        { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
      );
      const { exitCode, stderr } = await awaitPerformanceSupervisor(supervisor, 25000);
      // Proof: a worker writing the expected completion and exiting 27 failed here.
      expect(exitCode, stderr).toBe(0);
      // Proof: a zero-exit worker with an empty or wrong-scenario receipt failed here.
      expect(stderr.split('\n')).toContain('completed job-control scenario ' + scenario);
    },
    30000,
  );
