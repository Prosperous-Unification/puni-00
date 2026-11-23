import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

async function holdLock<T>(path: string, work: () => Promise<T>) {
  const library = await import('@shared/heavy-lock');
  return await library.holdLock(path, work);
}
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const helper = join(import.meta.dir, 'testing/lock-owner.test.fixture.ts');
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni owner lifecycle '));
  roots.push(root);
  return {
    root,
    path: join(root, 'mutex'),
    payload: join(root, 'payload.ts'),
    ready: join(root, 'ready'),
    release: join(root, 'release'),
    signals: join(root, 'signals'),
  };
}
async function until(ready: () => boolean): Promise<void> {
  const end = performance.now() + 4000;
  while (!ready()) {
    if (performance.now() >= end) throw new Error('native owner observation did not converge');
    await Bun.sleep(10);
  }
}
function launch(f: ReturnType<typeof createFixture>, wait = 0, detached = false) {
  return Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      'ops',
      'lock',
      'run',
      '--label',
      'lifecycle lane',
      '--wait-seconds',
      String(wait),
      '--poll-seconds',
      '1',
      '--',
      process.execPath,
      f.payload,
      f.ready,
      f.release,
      f.signals,
    ],
    { cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached },
  );
}
function writePayload(f: ReturnType<typeof createFixture>) {
  writeFileSync(
    f.payload,
    [
      'import{appendFileSync,existsSync,writeFileSync}from"node:fs";',
      'const[ready,release,signals]=process.argv.slice(2);',
      'for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>appendFileSync(signals,signal+String.fromCharCode(10)));',
      'writeFileSync(ready,String(process.pid));',
      'const end=performance.now()+8000;while(!existsSync(release)){if(performance.now()>=end)throw new Error("payload release missing");await Bun.sleep(10);}process.exit(37);',
    ].join(String.fromCharCode(10)),
  );
}
async function settle(child: ReturnType<typeof launch>, f: ReturnType<typeof createFixture>) {
  writeFileSync(f.release, 'release');
  // The real helper stays alive through native child reaping; never infer that from a marker.
  await until(() => child.exitCode !== null || child.signalCode !== null);
  await child.exited;
}

it('returns contention75 with the recorded holder and never starts a zero-budget payload', async () => {
  const f = createFixture();
  writePayload(f);
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const holding = holdLock(f.path, async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  const child = launch(f);
  try {
    expect(await child.exited).toBe(75);
    expect(existsSync(f.ready)).toBe(false);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    expect(await new Response(child.stderr).text()).toContain('held by pid');
  } finally {
    release.resolve(undefined);
    await holding;
    await settle(child, f);
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  it('withdraws a queued executable on native ' + signal + ' before payload entry', async () => {
    const f = createFixture();
    writePayload(f);
    const entered = Promise.withResolvers<undefined>(),
      release = Promise.withResolvers<undefined>();
    const holding = holdLock(f.path, async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const child = launch(f, 30);
    try {
      await until(
        () =>
          existsSync(f.path + '.queue') &&
          readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid))),
      );
      child.kill(signal);
      await until(() => child.exitCode !== null);
      expect(await child.exited).toBe(signal === 'SIGINT' ? 130 : 143);
      expect(existsSync(f.ready)).toBe(false);
      expect(readdirSync(f.path + '.queue')).toEqual([]);
      expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
    } finally {
      release.resolve(undefined);
      await holding;
      await settle(child, f);
    }
  });

it('defers holder-only termination through real payload exit and retains the first repeated signal', async () => {
  const f = createFixture();
  writePayload(f);
  const child = launch(f);
  try {
    await until(() => existsSync(f.ready));
    child.kill('SIGTERM');
    await Bun.sleep(70);
    expect(child.exitCode).toBe(null);
    expect(existsSync(f.signals)).toBe(false);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
    child.kill('SIGINT');
    await Bun.sleep(40);
    expect(child.exitCode).toBe(null);
    expect(existsSync(f.signals)).toBe(false);
    writeFileSync(f.release, 'release');
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(143);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
  } finally {
    await settle(child, f);
  }
});

it('inherits external process-group signals while retaining native ownership until the child ends', async () => {
  const f = createFixture();
  writePayload(f);
  const child = launch(f, 0, true);
  try {
    await until(() => existsSync(f.ready));
    process.kill(-child.pid, 'SIGTERM');
    await until(() => existsSync(f.signals));
    expect(readFileSync(f.signals, 'utf8')).toBe('SIGTERM' + String.fromCharCode(10));
    expect(child.exitCode).toBe(null);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
    writeFileSync(f.release, 'release');
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(143);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
  } finally {
    await settle(child, f);
  }
});

for (const mode of ['absent', 'not-executable'] as const)
  it('classifies an actual ' + mode + ' payload without holding the mutex afterward', () => {
    const f = createFixture();
    if (mode === 'not-executable')
      writeFileSync(f.payload, 'plain non-executable', { mode: 0o600 });
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        helper,
        f.path,
        'ops',
        'lock',
        'run',
        '--',
        f.payload,
      ],
      { cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
    );
    expect(child.exitCode).toBe(mode === 'absent' ? 127 : 126);
    expect(child.stderr.toString()).toContain('foreground payload could not start');
    expect(existsSync(f.path + '.d')).toBe(false);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
  });

it('describes the actual earlier queue label and PID without claiming a holder', async () => {
  const f = createFixture();
  writePayload(f);
  mkdirSync(f.path + '.queue');
  const name = '1000000000000000000-' + String(process.pid),
    newline = String.fromCharCode(10);
  const fields = [
    'pid ' + String(process.pid),
    'label earlier lane',
    'started legacy fixture',
    'deadline ' + String(Math.floor(Date.now() / 1000) + 1000),
    'command fixture',
  ];
  writeFileSync(join(f.path + '.queue', name), fields.join(newline) + newline);
  const child = launch(f);
  try {
    expect(await child.exited).toBe(75);
    expect(existsSync(f.ready)).toBe(false);
    expect(await new Response(child.stderr).text()).toBe(
      'heavy lock: gave up after 0s behind 1 tickets: earlier lane (pid ' +
        String(process.pid) +
        ')' +
        newline,
    );
    expect(readdirSync(f.path + '.queue')).toEqual([name]);
    expect(existsSync(f.path + '.d')).toBe(false);
  } finally {
    await settle(child, f);
  }
});
