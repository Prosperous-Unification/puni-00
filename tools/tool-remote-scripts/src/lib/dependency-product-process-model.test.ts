import { rejects } from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createProductByteTransportFixture } from '../fixtures/product-byte-transport';
import { readProductHostProc } from './product-host-proc';

async function assertRealHostReader(): Promise<void> {
  const status = await readProductHostProc('/proc/self/status', 65536, performance.now() + 5000);
  expect(status).toMatch(/^NSpid:\s+\d+/m);
}

async function runModelChild(
  command: readonly string[],
  deadlineMs: number,
  project: string,
  environment?: NodeJS.ProcessEnv,
): Promise<{
  readonly exit: number;
  readonly expired: boolean;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
}> {
  const child = Bun.spawn([...command], {
    cwd: project,
    env: environment,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
    killSignal: 'SIGKILL',
  });
  let expired = false;
  // Proof: removing the SIGKILL watchdog let a late valid-looking child finish;
  // the focused owned-child timer negative failed its signal assertion.
  const timer = setTimeout(() => {
    expired = true;
    child.kill('SIGKILL');
  }, deadlineMs);
  try {
    const reader = child.stderr.getReader();
    const stderr = new TextDecoder();
    let output = '';
    const drain = (async () => {
      try {
        for (;;) {
          const frame = await reader.read();
          if (frame.done) break;
          output += stderr.decode(frame.value, { stream: true });
          // Proof: model-output omission accepted oversized stderr; owned-child output refusal missed its rejection.
          if (output.length > 65536) {
            child.kill('SIGKILL');
            throw new Error('modeled product process child output bound exceeded');
          }
        }
        output += stderr.decode();
      } finally {
        reader.releaseLock();
      }
    })();
    const [exit] = await Promise.all([child.exited, drain]);
    return { exit, expired, signal: child.signalCode, output };
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    await child.exited;
  }
}

const MODEL_CHILD_WORK_MS = 1_440_000;
// Frozen measurement: 16 cases took 1111.14s; 60 * ceil((1111.14 + 277.785) / 60) = 1440s.
// This test-only allowance leaves every per-case and product operation deadline unchanged.
const MODEL_PARENT_TEST_MS = MODEL_CHILD_WORK_MS + 60_000;

const MODEL_CASES = [
  'modeled raw IO reaches both role successes, stable binding, and mount refusal',
  'modeled first binding refuses same-byte init executable object replacement',
  'modeled first observation refuses application mount namespace mismatch',
  'modeled first observation refuses init-argv drift',
  'modeled first observation refuses init-cwd drift',
  'modeled admitted init directory is retained and later cwd drift refuses',
  'modeled listener inode owned by init is refused after successful binding',
  'modeled three-process wrapper object replacement cannot rebind',
  'modeled three-process wrapper allowed argv spelling cannot rebind',
  'modeled lost exec reap prevents acceptance and all later effects',
  'modeled retained private supervisor group prevents acceptance and later effects',
  'modeled missing-done refuses privately and blocks later effects',
  'modeled duplicate-done refuses privately and blocks later effects',
  'modeled oversized-receipt refuses privately and blocks later effects',
  'modeled private-stderr refuses privately and blocks later effects',
  'modeled cleanup-failure refuses privately and blocks later effects',
] as const;

function assertCompleteModelSummary(output: string): void {
  expect(output).toMatch(/\b16 pass\b/);
  expect(output).toMatch(/\b0 fail\b/);
  expect(output).not.toMatch(/^\s*\d+ (?:skip|todo)\b|^\((?:skip|todo)\)/m);
  const passed = [...output.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map((match) => match[1]);
  // Proof: replacing one named case with an impostor while retaining a 16/0 footer
  // was accepted when this exact-list check was omitted; the summary negative failed.
  expect(passed).toEqual([...MODEL_CASES]);
}

function assertModelChild(child: Awaited<ReturnType<typeof runModelChild>>): void {
  expect(child.expired).toBe(false);
  expect(child.signal).toBeNull();
  // Proof: model-exit omission accepted nonzero exit with a complete-looking case list; the nonzero child negative missed its rejection.
  if (child.exit !== 0) throw new Error('modeled product process child failed');
  assertCompleteModelSummary(child.output);
}

// Proof: temporarily importing the mock-bearing model into this configured test file made
// the real /proc/self/status sentinel fail with "modeled host proc path unsupported".
test('ordinary collection retains the real host proc reader', async () => {
  await assertRealHostReader();
});

test(
  'modeled product process suite runs in a joined child without contaminating host proc reads',
  async () => {
    await assertRealHostReader();
    const project = new URL('../..', import.meta.url).pathname;
    const fixture = await createProductByteTransportFixture();
    try {
      const child = await runModelChild(
        [
          process.execPath,
          'test',
          'test/dependency-product-process-model-child.test.ts',
          '--preload',
          '../test/scratch/preload.ts',
          '--timeout=300000',
        ],
        MODEL_CHILD_WORK_MS,
        project,
        fixture.environment,
      );
      // Preserve the bounded joined transcript before refusal so failing case identities survive.
      process.stderr.write(child.output);
      assertModelChild(child);
    } finally {
      await rm(fixture.directory, { recursive: true });
    }
    await assertRealHostReader();
  },
  MODEL_PARENT_TEST_MS,
);

test('modeled summary refuses an impostor case despite a valid-looking 16/0 footer', () => {
  const lines = MODEL_CASES.map((name) => `(pass) ${name} [1ms]`);
  lines[0] = '(pass) modeled impostor [1ms]';
  expect(() => {
    assertCompleteModelSummary(`${lines.join('\n')}\n 16 pass\n 0 fail\n`);
  }).toThrow();
});

test('modeled child watchdog kills and joins owned work before a late valid-looking summary', async () => {
  const project = new URL('../..', import.meta.url).pathname;
  const child = await runModelChild(
    [
      process.execPath,
      '-e',
      "setTimeout(() => process.stderr.write('(pass) late model\\n16 pass\\n0 fail\\n'), 100)",
    ],
    20,
    project,
  );
  expect(child.expired).toBe(true);
  expect(child.signal).toBe('SIGKILL');
  expect(child.output).not.toContain('16 pass');
}, 5000);

for (const mode of ['nonzero', 'signal'] as const)
  test(`model child refuses ${mode} despite complete-looking cases`, async () => {
    const output =
      MODEL_CASES.map((name) => `(pass) ${name} [1ms]`).join('\n') + '\n16 pass\n0 fail\n';
    const source = `process.stderr.write(${JSON.stringify(output)}); ${mode === 'nonzero' ? 'process.exit(9)' : "process.kill(process.pid, 'SIGTERM')"};`;
    const child = await runModelChild(
      [process.execPath, '-e', source],
      1000,
      new URL('../..', import.meta.url).pathname,
    );
    expect(() => {
      assertModelChild(child);
    }).toThrow();
  });

test('model child output refusal joins exact owned child before returning', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'product-model-output-'));
  try {
    const path = join(directory, 'pid');
    const source = `await Bun.write(${JSON.stringify(path)}, String(process.pid)); process.stderr.write('X'.repeat(65537)); setTimeout(() => {}, 100);`;
    await rejects(
      runModelChild(
        [process.execPath, '-e', source],
        1000,
        new URL('../..', import.meta.url).pathname,
      ),
      /output bound exceeded/,
    );
    const pid = Number(await readFile(path, 'utf8'));
    expect(Number.isSafeInteger(pid)).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow('No such process');
  } finally {
    await rm(directory, { recursive: true });
  }
});
