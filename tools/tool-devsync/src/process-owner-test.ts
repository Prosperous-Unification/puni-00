import { dlopen, ptr } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function expectOrdinaryParent(): void {
  const libc = dlopen('libc.so.6', {
    prctl: { args: ['i32', 'ptr', 'i64', 'i64', 'i64'], returns: 'i32' },
  });
  const status = Int32Array.of(-1);
  try {
    expect(libc.symbols.prctl(37, ptr(status), 0, 0, 0)).toBe(0);
    // Proof: the dirty Browser candidate test armed the shared process before worker isolation.
    expect(status[0]).toBe(0);
  } finally {
    libc.close();
  }
}

/** Runs the original assertions in a separate Linux process so subreaper adoption stays with the native owner. */
export function processOwnerTest(file: string) {
  return (name: string, action: () => Promise<void>, timeout = 30_000): void => {
    test(
      name,
      async () => {
        const receipt = 'completed native process owner test ' + name;
        if (process.env['PUNI_OWNER_TEST_WORKER'] === JSON.stringify([process.ppid, file, name])) {
          await action();
          process.stderr.write(receipt + '\n');
          return;
        }
        expectOrdinaryParent();
        const child = Bun.spawn(
          [
            process.execPath,
            'test',
            file,
            '--test-name-pattern',
            name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') + '$',
          ],
          {
            env: {
              ...process.env,
              PUNI_OWNER_TEST_WORKER: JSON.stringify([process.pid, file, name]),
            },
            stdin: 'ignore',
            stdout: 'inherit',
            stderr: 'pipe',
          },
        );
        try {
          const { exitCode, stderr } = await awaitPerformanceSupervisor(child, timeout - 250);
          // Proof: a worker that printed its receipt and exited 27 failed here.
          expect(exitCode, stderr).toBe(0);
          // Proof: a zero-exit worker that skipped its test body failed the receipt check.
          expect(stderr.split('\n')).toContain(receipt);
        } finally {
          expectOrdinaryParent();
        }
      },
      timeout,
    );
  };
}
