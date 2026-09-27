import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { scratchSync } from './index';

const HELPER = join(import.meta.dir, 'index.ts');
const PRELOAD = join(import.meta.dir, 'preload.ts');

function childSource(ending: 'failure' | 'signal'): string {
  const finish =
    ending === 'failure'
      ? `throw new Error('deliberate failure');`
      : `await new Promise(() => {});`;
  return `
    import { test } from 'bun:test';
    import { scratchSync } from ${JSON.stringify(HELPER)};
    test('cleanup control', async () => {
      const directory = scratchSync('cleanup-proof-');
      process.stdout.write('SCRATCH_DIRECTORY=' + directory + '\\n');
      ${finish}
    });
  `;
}

function childTest(ending: 'failure' | 'signal'): string {
  const directory = scratchSync('scratch-control-');
  const file = join(directory, `${ending}.test.ts`);
  writeFileSync(file, childSource(ending));
  return file;
}

function scratchDirectory(output: string): string {
  const match = /^SCRATCH_DIRECTORY=(.+)$/m.exec(output);
  if (match === null) throw new Error('child exited without its scratch path');
  return match[1].trim();
}

async function readScratchDirectory(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) throw new Error('child exited without its scratch path');
      output += decoder.decode(next.value, { stream: true });
      const match = /^SCRATCH_DIRECTORY=(.+)$/m.exec(output);
      if (match !== null) return match[1].trim();
    }
  } finally {
    reader.releaseLock();
  }
}

describe('per-process test scratch', () => {
  it('removes its root when a test process fails', async () => {
    const child = Bun.spawn(
      [process.execPath, 'test', '--preload', PRELOAD, childTest('failure')],
      {
        stdout: 'pipe',
        stderr: 'ignore',
      },
    );
    const output = new Response(child.stdout).text();
    expect(await child.exited).not.toBe(0);
    const directory = scratchDirectory(await output);
    expect(existsSync(directory)).toBe(false);
  });

  it('removes its root and preserves signal termination', async () => {
    const child = Bun.spawn([process.execPath, 'test', '--preload', PRELOAD, childTest('signal')], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const directory = await readScratchDirectory(child.stdout);
    child.kill('SIGTERM');
    expect(await child.exited).not.toBe(0);
    // The signal itself, not merely a non-zero exit. `preserves signal
    // termination` is the whole claim of the handler's re-raise, and
    // `not.toBe(0)` cannot see it: replacing the re-raise with
    // `process.exit(1)` leaves the root removed and the exit non-zero, so the
    // case stayed green while the guarantee was gone. Measured: with the
    // re-raise, `{exited: 143, exitCode: null, signalCode: 'SIGTERM'}`; with
    // `process.exit(1)`, `{exited: 1, exitCode: 1, signalCode: null}`.
    // Proof: watched failing on `Expected: "SIGTERM" · Received: null`.
    expect(child.signalCode).toBe('SIGTERM');
    expect(existsSync(directory)).toBe(false);
  });

  it('removes its root from a plain Bun process, where no preload hook runs', async () => {
    // External consumers run `bun test --preload ../test/scratch/preload.ts`,
    // and that preload's `afterAll` removes the root under their gates. So
    // `process.on('exit', removeProcessRoot)` in the helper had no call path any
    // test could see: deleting it left the preload-owning cases green. This is
    // the path it is actually for — a plain `bun <script>`, no test runner and
    // no preload, which is what any future consumer that forgets the preload gets.
    // Proof: watched failing on `expect(received).toBe(expected) · Expected:
    // false · Received: true`, the root surviving, with the exit hook removed.
    const directory = scratchSync('scratch-plain-');
    const script = join(directory, 'plain.ts');
    writeFileSync(
      script,
      `
        import { scratchSync } from ${JSON.stringify(HELPER)};
        const made = scratchSync('plain-proof-');
        process.stdout.write('SCRATCH_DIRECTORY=' + made + '\\n');
        throw new Error('deliberate failure');
      `,
    );
    const child = Bun.spawn([process.execPath, script], { stdout: 'pipe', stderr: 'ignore' });
    const output = new Response(child.stdout).text();
    expect(await child.exited).not.toBe(0);
    expect(existsSync(scratchDirectory(await output))).toBe(false);
  });
});

describe('the shared test preload', () => {
  // No limit is given here on purpose: this case passes only while this project's `test` target
  // passes a `--timeout` above Bun's 5-second default, which is how every target states its budget
  // (docs/test-budgets.md).
  // Proof: with `--timeout=30000` removed from tool-test-scratch's `test` target,
  // `bunx nx run tool-test-scratch:test` failed this case at 5000ms (2026-09-27).
  it("a test may outlast Bun's five-second default", async () => {
    await Bun.sleep(5_300);
    expect(true).toBe(true);
  });

  // A budget is only worth stating if it ends a hang in every file a target runs. Bun 1.4.2 applies
  // a preload's `setDefaultTimeout` to the first test file only, and later files fall back to 5
  // seconds, while `--timeout` reaches them all (observed 2026-09-27; that is how the dev poller's
  // overlap test kept failing at 5000ms under this preload). So this runs two suites, each hung on a
  // subprocess, through the real preload with a short budget: both must end at that budget, and Bun
  // must kill each subprocess rather than leave it holding the gate.
  // Proof: with `setDefaultTimeout(30_000)` put back into preload.ts, this failed on its own
  // 10-second limit (2026-09-27). With the flag dropped and the preload setting 500ms instead, it
  // failed on the second file's `timed out after 5000ms` (2026-09-27).
  it('ends every suite hung on a subprocess at the budget its command line states', async () => {
    const directory = scratchSync('scratch-hang-');
    const suites = ['first', 'second'].map((name) => {
      const pidFile = join(directory, `${name}.pid`);
      const suite = join(directory, `${name}.test.ts`);
      writeFileSync(
        suite,
        `
          import { test } from 'bun:test';
          test('${name} waits on a subprocess that never exits', async () => {
            const sleeper = Bun.spawn(['sleep', '1000']);
            await Bun.write(${JSON.stringify(pidFile)}, String(sleeper.pid));
            await sleeper.exited;
          });
        `,
      );
      return { pidFile, suite };
    });
    const started = performance.now();
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        '--preload',
        PRELOAD,
        '--timeout=500',
        ...suites.map(({ suite }) => suite),
      ],
      { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, CLAUDECODE: '0', AGENT: '0' } },
    );
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(await child.exited).toBe(1);
    expect(performance.now() - started).toBeLessThan(9_000);
    // Bun may repeat a failure in its closing summary, so the verdicts are keyed by suite.
    const verdicts = Object.fromEntries(
      [
        ...`${stdout}${stderr}`.matchAll(
          /(first|second) waits[^\n]*\n[^\n]*timed out after (\d+)ms/g,
        ),
      ].map(([, suite, budget]) => [suite, budget]),
    );
    expect(verdicts).toEqual({ first: '500', second: '500' });
    for (const { pidFile } of suites) {
      expect(isAlive(Number(await Bun.file(pidFile).text()))).toBe(false);
    }
  }, 10_000);
});

/** Whether a process with this id still exists; signal 0 probes without delivering anything. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw cause;
  }
}
