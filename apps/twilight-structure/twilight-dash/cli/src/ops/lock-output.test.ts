import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const helper = join(import.meta.dir, 'testing/lock-owner.test.fixture.ts');
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni lock native sinks '));
  roots.push(root);
  return { root, path: join(root, 'mutex') };
}
async function boundedExit(child: Bun.Subprocess) {
  const observed = await Promise.race([
    child.exited.then((status) => ({ kind: 'exited' as const, status })),
    Bun.sleep(3500).then(() => ({ kind: 'deadline' as const })),
  ]);
  expect(observed.kind).toBe('exited');
  if (observed.kind !== 'exited') throw new Error('native sink owner did not finish');
  return observed.status;
}
it('ends a real blocked FileSink status write as failure70 without claiming output was flushed', async () => {
  const f = createFixture(),
    queue = f.path + '.queue';
  mkdirSync(queue);
  const newline = String.fromCharCode(10),
    label = 'lane ' + 'x'.repeat(4096);
  for (let index = 0; index < 256; index++)
    writeFileSync(
      join(queue, (1800000000000000000n + BigInt(index)).toString() + '-' + String(process.pid)),
      [
        'pid ' + String(process.pid),
        'label ' + label,
        'started fixture',
        'deadline 9999999999',
        'command fixture',
        '',
      ].join(newline),
    );
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      'ops',
      'lock',
      'status',
    ],
    { lazy: true, cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  const diagnostic = new Response(child.stderr).text();
  try {
    // No reader drains stdout: real kernel backpressure reaches Bun's native FileSink.
    expect(await boundedExit(child)).toBe(70);
    expect(await diagnostic).toBe('error: lock operation failed' + newline);
    expect(existsSync(f.path)).toBe(false);
    expect(existsSync(f.path + '.d')).toBe(false);
    expect(readdirSync(queue)).toHaveLength(256);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await child.exited;
    await child.stdout.cancel();
    await diagnostic;
  }
});
for (const operation of ['status', 'run'] as const)
  it(
    'owns an actual closed ' + (operation === 'status' ? 'stdout' : 'admission stderr') + ' pipe',
    async () => {
      const f = createFixture(),
        payload = join(f.root, 'payload.ts'),
        marker = join(f.root, 'ran');
      writeFileSync(
        payload,
        'await Bun.write(' + JSON.stringify(marker) + ',' + JSON.stringify('ran') + ');',
      );
      const args =
        operation === 'status'
          ? ['ops', 'lock', 'status']
          : ['ops', 'lock', 'run', '--', process.execPath, payload];
      const child = Bun.spawn(
        [process.execPath, '--no-env-file', '--config=/dev/null', helper, f.path, ...args],
        { lazy: true, cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      );
      if (operation === 'status') await child.stdout.cancel();
      else await child.stderr.cancel();
      try {
        expect(await boundedExit(child)).toBe(70);
        expect(existsSync(marker)).toBe(false);
        expect(existsSync(f.path + '.d')).toBe(false);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await child.exited;
        if (operation === 'status') await child.stderr.cancel();
        else await child.stdout.cancel();
      }
    },
  );
