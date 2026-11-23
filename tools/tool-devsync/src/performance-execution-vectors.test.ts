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
    // Proof: preloading the production owner in this test process failed the approved BE/GW vector with flag 1.
    expect(status[0]).toBe(0);
  } finally {
    libc.close();
  }
}

beforeEach(expectOrdinaryParent);
afterEach(expectOrdinaryParent);

for (const [scenario, title, timeout] of [
  [
    'approved BE/GW services',
    'Performance selects captured Bun for approved BE/GW services',
    240000,
  ],
  ['both Playwright stages', 'Performance selects captured Bun for both Playwright stages', 240000],
  [
    'settled FE build then preview',
    'Performance selects captured Bun for settled FE build then preview',
    240000,
  ],
  ['failed-build', 'Performance failed actual Vite build cannot preview or discover tests', 240000],
  [
    'cancelled-build',
    'Performance cancellation while actual Vite build is pending settles owned children before any later stage',
    180000,
  ],
  [
    'unknown-owner',
    'Performance retains the actual checkout and archive when native post-run owner recovery is unknown',
    240000,
  ],
] as const) {
  it(
    title,
    async () => {
      const supervisor = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          join(import.meta.dir, 'performance-execution-vectors.test.fixture.ts'),
          scenario,
        ],
        { stdin: 'ignore', stdout: 'inherit', stderr: 'pipe' },
      );
      const { exitCode, stderr } = await awaitPerformanceSupervisor(supervisor, timeout - 1000);
      expect(exitCode, stderr).toBe(0);
      expect(stderr.split('\n')).toContain('completed Performance execution vector ' + scenario);
    },
    timeout,
  );
}
