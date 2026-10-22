import { rejects } from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { probeDependencyCapabilities } from './dependency-preflight';

const candidate = `registry/wbs-be-01@sha256:${'a'.repeat(64)}`;
const rollback = `registry/wbs-be-01@sha256:${'b'.repeat(64)}`;
const empty = { protocol: 'wbs-dependency-runtime', version: 1, role: 'backend', semantics: [] };

async function runCli(program: string, signal?: AbortSignal): Promise<string> {
  const child = Bun.spawn([process.execPath, '-e', program], {
    stdout: 'pipe',
    stderr: 'pipe',
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`capability subprocess failed: ${stderr}`);
  return stdout;
}

test('independently probes exact candidate and rollback without database access', async () => {
  const commands: string[][] = [];
  const observations = await probeDependencyCapabilities(candidate, rollback, async (args) => {
    commands.push(args);
    return runCli(
      `console.log(${JSON.stringify(JSON.stringify({ ...empty, semantics: args.includes(rollback) ? ['cross-project-dependencies-v1'] : [] }))})`,
    );
  });
  expect(commands).toEqual(
    [candidate, rollback].map((image) => [
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--entrypoint',
      'bun',
      image,
      'run',
      'src/dependency-capabilities-cli.ts',
    ]),
  );
  expect(observations).toEqual([
    { image: candidate, semantics: [] },
    { image: rollback, semantics: ['cross-project-dependencies-v1'] },
  ]);
});

test('actual backend CLI supplies explicit empty support without DB_PATH', async () => {
  const observations = await probeDependencyCapabilities(candidate, null, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        new URL('../../../../apps/wbs/be-01/src/dependency-capabilities-cli.ts', import.meta.url)
          .pathname,
      ],
      {
        env: { PATH: process.env['PATH'] },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(stderr);
    return stdout;
  });
  expect(observations).toEqual([{ image: candidate, semantics: [] }]);
});

for (const payload of [
  {},
  { ...empty, protocol: 'other' },
  { ...empty, version: 2 },
  { ...empty, role: 'gateway' },
  { ...empty, extra: true },
  { ...empty, semantics: ['unknown'] },
  { ...empty, semantics: ['cross-project-dependencies-v1', 'cross-project-dependencies-v1'] },
  { ...empty, semantics: null },
  { ...empty, semantics: 'cross-project-dependencies-v1' },
  null,
  [],
]) {
  for (const badImage of [candidate, rollback]) {
    test(`refuses independent malformed capability ${JSON.stringify(payload)} from ${badImage}`, async () => {
      await rejects(
        probeDependencyCapabilities(candidate, rollback, (args) =>
          runCli(
            `console.log(${JSON.stringify(JSON.stringify(args.includes(badImage) ? payload : empty))})`,
          ),
        ),
        /dependency capability/,
      );
    });
  }
}

for (const program of [
  "throw new Error('missing CLI')",
  'process.exit(3)',
  "console.log('not JSON')",
]) {
  test(`propagates failed CLI without manufacturing empty support: ${program}`, async () => {
    await rejects(probeDependencyCapabilities(candidate, rollback, () => runCli(program)));
  });
}

test('shared capability budget aborts a stalled subprocess', async () => {
  await rejects(
    probeDependencyCapabilities(
      candidate,
      rollback,
      (_args, signal) =>
        runCli(
          `setTimeout(() => console.log(${JSON.stringify(JSON.stringify(empty))}), 250)`,
          signal,
        ),
      performance.now() + 30,
    ),
    /deadline/,
  );
});

test('rejects mutable references before invoking Docker', async () => {
  await rejects(
    probeDependencyCapabilities('registry/wbs-be-01:latest', rollback, () => {
      throw new Error('unexpected Docker call');
    }),
    /digest-pinned/,
  );
});

for (const fault of ['missing', 'unreadable'] as const) {
  test(`actual ${fault} CLI refuses rather than manufacturing support`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dependency-cli-'));
    const script = join(root, 'capability.ts');
    try {
      if (fault === 'unreadable') {
        expect(process.geteuid?.()).not.toBe(0);
        await writeFile(script, `console.log(${JSON.stringify(JSON.stringify(empty))})`);
        await chmod(script, 0);
      }
      await rejects(
        probeDependencyCapabilities(candidate, rollback, () =>
          runCli(`await import(${JSON.stringify(script)})`),
        ),
        /capability subprocess failed/,
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });
}
