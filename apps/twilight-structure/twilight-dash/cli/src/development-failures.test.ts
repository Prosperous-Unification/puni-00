import { fileURLToPath } from 'node:url';

import { expect, it } from 'bun:test';

const fixture = fileURLToPath(new URL('./development-failures.test.fixture.ts', import.meta.url));
for (const mode of ['delivery', 'late-sink'] as const) {
  it(
    'development owner retains bounded ' + mode + ' failure without losing custody',
    () => {
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', fixture, mode],
        {
          env: {},
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 35000,
          killSignal: 'SIGKILL',
          maxBuffer: 1024 * 1024,
        },
      );
      expect(child.signalCode, child.stderr.toString()).toBeUndefined();
      expect(child.exitedDueToTimeout).toBe(false);
      expect(child.exitedDueToMaxBuffer).toBe(false);
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      const observed: unknown = JSON.parse(child.stdout.toString());
      const pidMatcher: unknown = expect.any(Number);
      expect(observed).toMatchObject({
        mode,
        baseline: 0,
        preflights: 2,
        readyPid: pidMatcher,
      });
      if (mode === 'delivery') {
        expect(observed).toMatchObject({
          signalAttempts: 1,
          rejected: true,
          retainedExactSignalFailure: true,
        });
        if (
          observed === null ||
          typeof observed !== 'object' ||
          !('elapsedMs' in observed) ||
          typeof observed.elapsedMs !== 'number'
        )
          throw new Error('delivery fixture omitted actual elapsed progress');
        expect(observed.elapsedMs).toBeLessThan(8000);
      } else {
        const descriptorMatcher: unknown = expect.any(Number);
        expect(observed).toMatchObject({
          sinkActuallyPending: true,
          explicitUnconfirmedExpiry: true,
          exactOwnedFDReuse: true,
          captureDescriptor: descriptorMatcher,
        });
        expect(observed).toMatchObject({ lateHex: '' });
      }
    },
    40000,
  );
}
