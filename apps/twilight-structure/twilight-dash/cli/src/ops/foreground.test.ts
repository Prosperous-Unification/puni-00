import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni foreground '));
  roots.push(root);
  const directory = join(root, 'caller space');
  mkdirSync(directory);
  return {
    root,
    directory,
    path: join(root, 'mutex'),
    record: join(root, 'admission'),
    payload: join(directory, 'payload.ts'),
  };
}
const helper = join(import.meta.dir, 'testing/foreground.test.fixture.ts');
it('keeps native binary IO and payload status after admission is reported', () => {
  const f = createFixture();
  writeFileSync(
    f.payload,
    "import {existsSync}from'node:fs';if(!existsSync(process.argv[2]))process.exit(99);await Bun.write(Bun.stdout,await Bun.stdin.arrayBuffer());await Bun.write(Bun.stderr,new Uint8Array([0,255,10]));process.exitCode=37;",
  );
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      process.execPath,
      f.payload,
      f.record,
    ],
    { stdin: new Uint8Array([255, 0, 65, 10]), stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode).toBe(37);
  expect([...child.stdout]).toEqual([255, 0, 65, 10]);
  expect([...child.stderr]).toEqual([0, 255, 10]);
  expect(JSON.parse(readFileSync(f.record, 'utf8'))).toEqual({
    aheadAtArrival: 0,
    waitedSeconds: 0,
  });
});
it('keeps explicit caller cwd environment and literal payload arguments', () => {
  const f = createFixture();
  writeFileSync(
    f.payload,
    'console.log(JSON.stringify({cwd:process.cwd(),token:process.env.LOCK_FIXTURE_TOKEN,argv:process.argv.slice(2)}));',
  );
  const argv = ['', 'a b', '$(literal)', ';literal', '--literal'];
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      process.execPath,
      f.payload,
      ...argv,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({
    cwd: f.directory,
    token: 'explicit value',
    argv,
  });
});
it('preserves a native payload termination status', () => {
  const f = createFixture();
  writeFileSync(f.payload, "process.kill(process.pid,'SIGTERM');");
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      process.execPath,
      f.payload,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode).toBe(143);
});

it('refuses a successful exposed wait result that contradicts the actual code37 native exit', () => {
  const f = createFixture();
  writeFileSync(f.payload, 'process.exitCode=37;');
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      process.execPath,
      f.payload,
    ],
    {
      env: { ...process.env, PUNI_FOREGROUND_FAULT: 'false-status' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 4000,
    },
  );
  expect(child.exitCode).toBe(70);
});

async function until(ready: () => boolean): Promise<void> {
  const end = performance.now() + 3000;
  while (!ready()) {
    if (performance.now() >= end) throw new Error('owned foreground observation did not converge');
    await Bun.sleep(10);
  }
}
for (const fault of ['native-wait-error', 'missing-identity', 'missing-callback'])
  it(
    'retains a referenced owner and native mutex on unconfirmed termination ' + fault,
    async () => {
      const f = createFixture(),
        done = join(f.root, 'payload-done');
      writeFileSync(
        f.payload,
        "import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],'done');",
      );
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          helper,
          f.path,
          f.directory,
          f.record,
          process.execPath,
          f.payload,
          done,
        ],
        {
          env: { ...process.env, PUNI_FOREGROUND_FAULT: fault },
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      try {
        await until(
          () =>
            child.exitCode !== null ||
            (existsSync(f.record) && readFileSync(f.record, 'utf8').includes('unconfirmed')),
        );
        expect(existsSync(done)).toBe(true);
        const observed = await Promise.race([
          child.exited.then((status) => ({ kind: 'exited' as const, status })),
          Bun.sleep(100).then(() => ({ kind: 'pending' as const })),
        ]);
        expect(observed.kind).toBe('pending');
        expect(existsSync(f.record + '.outcome')).toBe(false);
        const { holdLock } = await import('@shared/heavy-lock');
        expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
        await child.exited;
      }
    },
  );
it('bounds status observation only after a confirmed native terminal event', () => {
  const f = createFixture();
  writeFileSync(f.payload, 'process.exitCode=0;');
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      process.execPath,
      f.payload,
    ],
    {
      env: { ...process.env, PUNI_FOREGROUND_FAULT: 'pending-status' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 4000,
    },
  );
  expect(child.exitCode).toBe(70);
  expect(JSON.parse(readFileSync(f.record + '.outcome', 'utf8'))).toMatchObject({
    value: { kind: 'failed' },
  });
});

it('resolves a relative explicit payload PATH from caller cwd instead of the owner cwd', () => {
  const f = createFixture(),
    right = join(f.directory, 'bin'),
    decoy = join(f.root, 'bin');
  mkdirSync(right);
  mkdirSync(decoy);
  for (const [directory, text] of [
    [right, 'right'],
    [decoy, 'decoy'],
  ] as const)
    writeFileSync(
      join(directory, 'relative-tool'),
      '#!' +
        process.execPath +
        String.fromCharCode(10) +
        'console.log(' +
        JSON.stringify(text) +
        ');',
      { mode: 0o755 },
    );
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      'relative-tool',
    ],
    {
      cwd: f.root,
      env: { ...process.env, PATH: './bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 4000,
    },
  );
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString().trim()).toBe('right');
});
it('models an absent payload as not-started127 without inventing a native terminal event', () => {
  const f = createFixture();
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      f.directory,
      f.record,
      join(f.root, 'absent-program'),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode).toBe(127);
  expect(JSON.parse(readFileSync(f.record + '.outcome', 'utf8'))).toMatchObject({
    value: { kind: 'not-started' },
  });
});
