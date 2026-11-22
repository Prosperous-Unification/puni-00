import { rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';

const OBSERVER =
  'source observer consumes the original running source through raw process transport';
const TERMINAL = 'source actual helper cleanup failure closes the original observer context';

for (const name of [OBSERVER, TERMINAL] as const)
  test(`isolated ${name}`, () => runSourceCase(name), 320000);

async function runSourceCase(name: typeof OBSERVER | typeof TERMINAL): Promise<void> {
  const peer = await createReadinessByteTransportFixture();
  const environment: NodeJS.ProcessEnv = { ...peer.environment, FORCE_COLOR: '0' };
  delete environment['SOURCE_ROLE_PROOF'];
  let isSettled = false;
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        'test/source-role-process-model-child.test.ts',
        '-t',
        `^${name}$`,
        '--timeout=300000',
      ],
      {
        cwd: new URL('../..', import.meta.url).pathname,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(310000),
        killSignal: 'SIGKILL',
      },
    );
    const settled = await Promise.allSettled([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const failures: unknown[] = [];
    for (const receipt of settled) {
      if (receipt.status === 'rejected') {
        const cause: unknown = receipt.reason;
        failures.push(cause);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        `source fixture child settlement unproved; peer retained at ${peer.directory}`,
      );
    const [exit, stdout, stderr] = settled;
    if (
      exit.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new Error('source fixture child settlement unproved');
    isSettled = true;
    process.stderr.write(stderr.value);
    expect(exit.value).toBe(0);
    expect(child.signalCode).toBeNull();
    expect(stdout.value).toMatch(/^bun test v[^\n]+\n$/);
    // Proof: a third case in the child transcript produced two filtered cases and failed both wrappers.
    expect(
      stderr.value.match(/^\s*\d+ (?:pass|filtered out|fail)$/gm)?.map((line) => line.trim()),
    ).toEqual(['1 pass', '1 filtered out', '0 fail']);
    const passed = [...stderr.value.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map(
      (match) => match[1],
    );
    expect(passed).toEqual([name]);
    if (name === TERMINAL) {
      for (const fault of ['namespace', 'cleanup']) {
        expect(stderr.value).toContain(`source terminal actual-peer refusal: ${fault}`);
        // Proof: omitting either completion marker from a passing child transcript failed this assertion.
        expect(stderr.value).toContain(`source terminal actual-peer refusal observed: ${fault}`);
      }
      return;
    }
    for (const fault of [
      'missing',
      'duplicate',
      'misassigned',
      'parent',
      'role-parent',
      'extra',
      'uid',
      'cwd',
      'watch',
      'exe',
      'helper-listener',
      'closing-listener',
      'closing-output',
      'closing-host',
      'closing-runtime',
    ])
      expect(stderr.value).toContain(`source first-binding refusal: ${fault}`);
    for (const fault of ['pid-reuse', 'object', 'listener'])
      expect(stderr.value).toContain(`source retained-binding refusal: ${fault}`);
    expect(stderr.value).toContain('source first candidate remains pinned after closing refusal');
  } finally {
    if (isSettled) await rm(peer.directory, { recursive: true });
  }
}
