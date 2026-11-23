import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { reserveLog } from '../resources/hold-log';
import {
  createDecision,
  formatIdentity,
  readDecision,
  readHold,
  releaseHold,
} from '../resources/hold-token';
import { identifySelf } from '../resources/process-identity';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const helper = join(import.meta.dir, 'testing/holder.test.fixture.ts');
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni durable holder '));
  roots.push(root);
  return {
    root,
    path: join(root, 'mutex'),
    holdFile: join(root, 'hold'),
    record: join(root, 'observed'),
  };
}
function launch(
  f: ReturnType<typeof createFixture>,
  failure = false,
  pollSeconds = 1,
  releaseBeforeCallback = false,
  observeRetention = false,
  requestedHoldFile?: string,
) {
  const log = reserveLog(f.holdFile);
  captureInput('holder-launch-input', {
    request: { path: f.path, holdFile: f.holdFile, pollSeconds },
    controller: log.controller,
    log: { path: log.path, device: log.device, inode: log.inode },
    failure,
    releaseBeforeCallback,
    observeRetention,
  });
  try {
    return Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        helper,
        f.path,
        f.holdFile,
        f.record,
        String(log.controller.pid),
        log.controller.boot,
        log.controller.start,
        String(pollSeconds),
      ],
      {
        env: {
          ...process.env,
          PUNI_HOLDER_REPORT_FAIL: failure ? '1' : '0',
          PUNI_HOLDER_OBSERVE_RETENTION: observeRetention ? '1' : '0',
          PUNI_HOLDER_REQUEST_HOLD_FILE: requestedHoldFile,
          PUNI_HOLDER_RELEASE_BEFORE_CALLBACK: releaseBeforeCallback ? '1' : '0',
        },
        cwd: f.root,
        stdin: 'ignore',
        stdout: log.descriptor,
        stderr: log.descriptor,
      },
    );
  } finally {
    log.closeDescriptor();
  }
}
async function until(observe: () => boolean) {
  const end = performance.now() + 4000;
  while (!observe()) {
    if (performance.now() >= end) throw new Error('durable native owner did not converge');
    await Bun.sleep(10);
  }
}
async function cleanup(child: ReturnType<typeof launch>) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await until(() => child.exitCode !== null || child.signalCode !== null);
  await child.exited;
}
async function holdLock<T>(path: string, work: () => Promise<T>) {
  const library = await import('@shared/heavy-lock');
  return await library.holdLock(path, work);
}

it('publishes complete child identity and readiness only inside admitted native ownership', async () => {
  const f = createFixture(),
    child = launch(f);
  try {
    await until(() => existsSync(f.holdFile + '.ready') || child.exitCode !== null);
    const hold = readHold(f.holdFile),
      ready = readDecision(f.holdFile + '.ready');
    expect(hold?.identity.pid).toBe(child.pid);
    expect(ready?.identity).toEqual(hold?.identity);
    expect(readFileSync(f.path + '.d/holder', 'utf8').trim()).toBe(String(child.pid));
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    if (hold === undefined) throw new Error('complete hold token missing');
    releaseHold(hold);
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(0);
    expect(readDecision(f.holdFile + '.ready')?.kind).toBe('ready');
    expect(readDecision(f.holdFile + '.ready')?.identity).toEqual(hold.identity);
    expect(existsSync(f.path + '.d')).toBe(false);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
  } finally {
    await cleanup(child);
  }
});

it('publishes no readiness while queued and enters only after the actual earlier holder releases', async () => {
  const f = createFixture(),
    entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const holding = holdLock(f.path, async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  const child = launch(f);
  try {
    await until(
      () =>
        child.exitCode !== null ||
        existsSync(f.holdFile + '.ready') ||
        (existsSync(f.path + '.queue') &&
          readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid)))),
    );
    captureInput('residual-queued-fence', {
      pid: child.pid,
      ready: existsSync(f.holdFile + '.ready'),
      hold: readHold(f.holdFile),
      queue: existsSync(f.path + '.queue')
        ? { kind: 'present', entries: readdirSync(f.path + '.queue') }
        : { kind: 'absent' },
    });
    expect(readHold(f.holdFile)?.identity.pid).toBe(child.pid);
    expect(existsSync(f.holdFile + '.ready')).toBe(false);
    release.resolve(undefined);
    await holding;
    await until(() => existsSync(f.holdFile + '.ready'));
    const hold = readHold(f.holdFile);
    if (hold === undefined) throw new Error('admitted hold token missing');
    releaseHold(hold);
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(0);
  } finally {
    release.resolve(undefined);
    await holding;
    await cleanup(child);
  }
});

for (const changed of ['hold', 'readiness', 'readiness absence'] as const)
  it('retains actual ownership when ' + changed + ' evidence becomes unconfirmed', async () => {
    const f = createFixture(),
      child = launch(f);
    try {
      await until(() => existsSync(f.holdFile + '.ready'));
      if (changed === 'readiness absence') unlinkSync(f.holdFile + '.ready');
      else writeFileSync(changed === 'hold' ? f.holdFile : f.holdFile + '.ready', 'foreign');
      await until(
        () => existsSync(f.record) && readFileSync(f.record, 'utf8').includes('unconfirmed'),
      );
      expect(child.exitCode).toBe(null);
      expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
      child.kill('SIGTERM');
      await until(() => child.exitCode !== null);
      expect(await child.exited).toBe(70);
      if (changed === 'readiness absence') expect(existsSync(f.holdFile + '.ready')).toBe(false);
      else
        expect(readFileSync(changed === 'hold' ? f.holdFile : f.holdFile + '.ready', 'utf8')).toBe(
          'foreign',
        );
    } finally {
      await cleanup(child);
    }
  });

it('refuses preexisting readiness without overwriting it or entering the queue', async () => {
  const f = createFixture();
  writeFileSync(f.holdFile + '.ready', 'foreign', { mode: 0o600 });
  const child = launch(f);
  try {
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(70);
    expect(readFileSync(f.holdFile + '.log', 'utf8')).toEndWith('error: holder operation failed\n');
    expect(readFileSync(f.holdFile + '.ready', 'utf8')).toBe('foreign');
    expect(existsSync(f.path + '.queue')).toBe(false);
  } finally {
    await cleanup(child);
  }
});

it('keeps a known hold through admission output failure and settles only after authorized release', async () => {
  const f = createFixture(),
    child = launch(f, true);
  try {
    await until(
      () =>
        child.exitCode !== null ||
        (existsSync(f.record) && readFileSync(f.record, 'utf8').includes('unconfirmed')),
    );
    expect(child.exitCode).toBe(null);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
    const hold = readHold(f.holdFile);
    if (hold === undefined) throw new Error('owned token missing after diagnostic failure');
    releaseHold(hold);
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(70);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
  } finally {
    await cleanup(child);
  }
});

it('preserves a controller cancellation tombstone and child identity before queue entry', async () => {
  const f = createFixture(),
    cancelled = createDecision(f.holdFile + '.ready', 'cancelled', identifySelf()),
    child = launch(f);
  try {
    await until(() => child.exitCode !== null);
    expect(await child.exited).toBe(143);
    expect(existsSync(f.path)).toBe(false);
    expect(existsSync(f.path + '.queue')).toBe(false);
    expect(readDecision(cancelled.path)).toEqual(cancelled);
    const own = readHold(f.holdFile);
    expect(own?.identity.pid).toBe(child.pid);
    if (own === undefined) throw new Error('cancelled child identity was lost');
    releaseHold(own);
    releaseHold(cancelled);
  } finally {
    await cleanup(child);
  }
});
it('withdraws a five-second queued poll promptly through its immutable controller decision', async () => {
  const f = createFixture(),
    entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const holding = holdLock(f.path, async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  const child = launch(f, false, 5);
  try {
    await until(
      () =>
        existsSync(f.path + '.queue') &&
        readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid))),
    );
    const cancelled = createDecision(f.holdFile + '.ready', 'cancelled', identifySelf());
    await Bun.sleep(300);
    captureInput('residual-queued-cancel', {
      cancelled,
      pid: child.pid,
      exitCode: child.exitCode,
      queue: readdirSync(f.path + '.queue'),
    });
    expect(child.exitCode).toBe(143);
    expect(await child.exited).toBe(143);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    expect(readDecision(cancelled.path)).toEqual(cancelled);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
    const own = readHold(f.holdFile);
    expect(own?.identity.pid).toBe(child.pid);
    if (own === undefined) throw new Error('queued child identity was lost');
    releaseHold(own);
    releaseHold(cancelled);
  } finally {
    release.resolve(undefined);
    await holding;
    await cleanup(child);
  }
});
for (const failure of ['readiness', 'hold unreadable', 'hold mismatch'] as const)
  it(
    'settles retained ' + failure + ' failure after verified authorized token removal',
    async () => {
      const f = createFixture(),
        child = launch(f);
      try {
        await until(() => existsSync(f.holdFile + '.ready'));
        const own = readHold(f.holdFile);
        if (own === undefined) throw new Error('admitted token missing');
        if (failure === 'readiness') writeFileSync(f.holdFile + '.ready', 'foreign');
        else if (failure === 'hold unreadable') chmodSync(f.holdFile, 0);
        else writeFileSync(f.holdFile, 'foreign');
        await until(
          () => existsSync(f.record) && readFileSync(f.record, 'utf8').includes('unconfirmed'),
        );
        expect(child.exitCode).toBe(null);
        expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
        if (failure === 'readiness') releaseHold(own);
        else unlinkSync(f.holdFile);
        await until(() => child.exitCode !== null);
        expect(await child.exited).toBe(70);
        expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
        if (failure === 'readiness')
          expect(readFileSync(f.holdFile + '.ready', 'utf8')).toBe('foreign');
      } finally {
        await cleanup(child);
      }
    },
  );

it('withdraws a ledger-authorized original token release during a five-second queue poll without admission or a synthetic cancellation', async () => {
  const f = createFixture(),
    entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const holding = holdLock(f.path, async () => {
    entered.resolve(undefined);
    await release.promise;
  });
  await entered.promise;
  const child = launch(f, false, 5);
  try {
    await until(
      () =>
        existsSync(f.path + '.queue') &&
        readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid))),
    );
    const token = readHold(f.holdFile);
    if (token === undefined) throw new Error('queued release token missing');
    releaseHold(token);
    await Bun.sleep(300);
    captureInput('residual-queued-token-release', {
      token,
      pid: child.pid,
      exitCode: child.exitCode,
    });
    expect(child.exitCode).toBe(0);
    expect(existsSync(f.record)).toBe(false);
    expect(existsSync(f.holdFile + '.ready')).toBe(false);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
  } finally {
    release.resolve(undefined);
    await holding;
    await cleanup(child);
  }
});
for (const queued of [false, true])
  it(
    'checks original token release immediately before Ready publication after ' +
      (queued ? 'a queued claim' : 'a free first claim'),
    async () => {
      const f = createFixture(),
        entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const holding = queued
        ? holdLock(f.path, async () => {
            entered.resolve(undefined);
            await release.promise;
          })
        : Promise.resolve();
      if (queued) await entered.promise;
      const child = launch(f, false, 1, true);
      try {
        if (queued)
          await until(
            () =>
              existsSync(f.path + '.queue') &&
              readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid))),
          );
        release.resolve(undefined);
        await holding;
        await until(() => child.exitCode !== null || existsSync(f.holdFile + '.ready'));
        captureInput('residual-before-ready', {
          exitCode: child.exitCode,
          ready: existsSync(f.holdFile + '.ready'),
        });
        expect(child.exitCode).toBe(0);
        expect(existsSync(f.record)).toBe(false);
        expect(existsSync(f.holdFile + '.ready')).toBe(false);
        expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
      } finally {
        release.resolve(undefined);
        await holding;
        await cleanup(child);
      }
    },
  );

for (const removeToken of [false, true])
  it(
    'withdraws queued Retired while preserving its exact helper witness ' + String(removeToken),
    async () => {
      const f = createFixture(),
        entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const holding = holdLock(f.path, async () => {
        entered.resolve(undefined);
        await release.promise;
      });
      await entered.promise;
      const child = launch(f, false, 5);
      try {
        await until(
          () =>
            existsSync(f.path + '.queue') &&
            readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid))),
        );
        const token = readHold(f.holdFile);
        if (token === undefined) throw new Error('queued helper token missing');
        const retired = createDecision(f.holdFile + '.ready', 'retired', token.identity);
        if (removeToken) releaseHold(token);
        await until(() => child.exitCode !== null);
        expect(await child.exited).toBe(0);
        expect(existsSync(f.record)).toBe(false);
        expect(readDecision(retired.path)).toEqual(retired);
        expect(readdirSync(f.path + '.queue')).toEqual([]);
        expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
      } finally {
        release.resolve(undefined);
        await holding;
        await cleanup(child);
      }
    },
  );

for (const kind of ['ready', 'cancelled', 'retired'] as const)
  it('refuses a foreign tagged ' + kind + ' decision during queued admission', async () => {
    const f = createFixture(),
      entered = Promise.withResolvers<undefined>(),
      release = Promise.withResolvers<undefined>();
    const holding = holdLock(f.path, async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const child = launch(f, false, 5);
    try {
      await until(
        () =>
          existsSync(f.path + '.queue') &&
          readdirSync(f.path + '.queue').some((name) => name.endsWith('-' + String(child.pid))),
      );
      const token = readHold(f.holdFile);
      if (token === undefined) throw new Error('queued helper identity absent');
      const identity = kind === 'cancelled' ? identifySelf() : token.identity;
      const foreign = createDecision(f.holdFile + '.ready', kind, {
        ...identity,
        start: String(BigInt(identity.start) + 1n),
      });
      await until(() => child.exitCode !== null);
      expect(await child.exited).toBe(70);
      expect(readDecision(foreign.path)).toEqual(foreign);
      expect(readHold(f.holdFile)).toEqual(token);
      expect(existsSync(f.record)).toBe(false);
    } finally {
      release.resolve(undefined);
      await holding;
      await cleanup(child);
    }
  });

function captureInput(name: string, input: unknown): void {
  const directory = process.env['PUNI_HOLDER_R5_CAPTURE'];
  if (directory === undefined) return;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(directory, name + '.json'),
    JSON.stringify(
      input,
      (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
}
for (const changed of ['readiness absence', 'hold mismatch'] as const)
  it('keeps the real native holder through its retention poll after ' + changed, async () => {
    const f = createFixture(),
      child = launch(f, false, 1, false, true);
    try {
      await until(() => existsSync(f.holdFile + '.ready') || child.exitCode !== null);
      const hold = readHold(f.holdFile),
        ready = readDecision(f.holdFile + '.ready');
      if (hold === undefined || ready === undefined) throw new Error('live holder evidence absent');
      captureInput('holder-evidence-input', { hold, ready, mutex: f.path, changed });
      if (changed === 'readiness absence') unlinkSync(ready.path);
      else
        writeFileSync(
          hold.path,
          formatIdentity({ ...hold.identity, start: String(BigInt(hold.identity.start) + 1n) }),
        );
      await until(() => existsSync(f.record + '.retention-poll') || child.exitCode !== null);
      expect(child.exitCode).toBe(null);
      expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
      child.kill('SIGTERM');
      await until(() => child.exitCode !== null);
      expect(await child.exited).toBe(70);
    } finally {
      await cleanup(child);
    }
  });

it('refuses a holder request bound to a different inherited reserved generation', async () => {
  const f = createFixture(),
    other = join(f.root, 'other-hold'),
    child = launch(f, false, 1, false, false, other);
  try {
    await until(() => child.exitCode !== null || existsSync(other + '.ready'));
    captureInput('holder-reservation-input', {
      reserved: f.holdFile,
      requested: other,
      otherReady: existsSync(other + '.ready'),
      otherIdentity: readHold(other)?.identity ?? null,
    });
    expect(child.exitCode).toBe(70);
    expect(existsSync(other)).toBe(false);
  } finally {
    await cleanup(child);
  }
});

it('residual observes native first abort during admitted ownership', async () => {
  const f = createFixture();
  process.env['PUNI_HOLDER_ABORT_ON_ADMISSION'] = '1';
  let child;
  try {
    child = launch(f);
  } finally {
    delete process.env['PUNI_HOLDER_ABORT_ON_ADMISSION'];
  }
  try {
    await until(() => existsSync(f.record + '.abort-observed'));
    await Bun.sleep(150);
    captureInput('residual-holder-abort', {
      pid: child.pid,
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      receipt: readFileSync(f.record + '.abort-observed', 'utf8'),
    });
    expect(child.exitCode).toBe(130);
    expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('owned');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await child.exited;
  }
});
