import { createHash, randomBytes } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { expect, spyOn, test } from 'bun:test';

import {
  openRegistryPressureSource,
  type RegistryPressureSource,
  RegistrySourceCleanupError,
} from './registry-pressure-source';

async function expectFailure(work: Promise<unknown>, message: string | RegExp): Promise<void> {
  const failure = await work.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('expected a rejection');
  expect(failure.message).toMatch(message);
}

const timeout = { state: 'unavailable', reason: 'source-timeout', code: 'deadline' } as const;
const refused = { state: 'unavailable', reason: 'source-refused', code: 'refused' } as const;
const unsuccessful = {
  state: 'unavailable',
  reason: 'source-command-failed',
  code: 'ssh-exit',
} as const;
const largeStatus = { state: 'invalid-status', code: 'status-too-large' } as const;
const largeStderr = {
  state: 'unavailable',
  reason: 'source-command-failed',
  code: 'stderr-too-large',
} as const;
const policy = {
  cwd: '/',
  env: { LANG: 'C', LC_ALL: 'C' },
  stdin: 'ignore',
  stdout: 'pipe',
  stderr: 'pipe',
  detached: true,
} as const;

type Child = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;

async function withExchange(
  script: string,
  use: (source: RegistryPressureSource, spawned: Promise<Child>) => Promise<void>,
  decorate: (child: Child) => void = () => undefined,
  mode = 0o400,
): Promise<void> {
  const parent = await mkdtemp('/tmp/puni-registry-status-');
  const directory = parent + '/source';
  const path = parent + '/identity';
  const key = randomBytes(32);
  const keyHeader = Buffer.from('0000000b7373682d6564323535313900000020', 'hex');
  const publicKey = 'ssh-ed25519 ' + Buffer.concat([keyHeader, randomBytes(32)]).toString('base64');
  const enrollment = {
    schemaVersion: 1,
    protocol: 'registry-pressure-status/1',
    target: {
      machineId: 'a'.repeat(32),
      registryId: 'fixture-registry',
      storageId: 'fixture-storage',
      registryPath: '/srv/registry',
    },
    peer: { address: '192.168.10.20', port: 2222, user: 'registry_source', hostKey: publicKey },
    identity: { path, sha256: createHash('sha256').update(key).digest('hex'), publicKey },
  };
  await mkdir(directory, { mode: 0o700 });
  await writeFile(path, key, { mode: 0o400 });
  await chmod(path, mode);
  const launch = Bun.spawn;
  const launched = Promise.withResolvers<Child>();
  const children: { child: Child; exited: Promise<number> }[] = [];
  const spawn = spyOn(Bun, 'spawn').mockImplementation(((
    argv: string[],
    options: typeof policy,
  ) => {
    expect(argv).toEqual([
      '/usr/bin/ssh',
      '-F',
      '/dev/null',
      '-T',
      '-n',
      '-o',
      'BatchMode=yes',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'IdentityAgent=none',
      '-o',
      'AddKeysToAgent=no',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'UserKnownHostsFile=' + directory + '/known_hosts',
      '-o',
      'GlobalKnownHostsFile=/dev/null',
      '-o',
      'HostKeyAlias=puni-registry-pressure-source',
      '-o',
      'CheckHostIP=no',
      '-o',
      'VerifyHostKeyDNS=no',
      '-o',
      'UpdateHostKeys=no',
      '-o',
      'HostKeyAlgorithms=ssh-ed25519',
      '-o',
      'PubkeyAcceptedAlgorithms=ssh-ed25519',
      '-o',
      'PreferredAuthentications=publickey',
      '-o',
      'PasswordAuthentication=no',
      '-o',
      'KbdInteractiveAuthentication=no',
      '-o',
      'GSSAPIAuthentication=no',
      '-o',
      'HostbasedAuthentication=no',
      '-o',
      'ProxyCommand=none',
      '-o',
      'ProxyJump=none',
      '-o',
      'CanonicalizeHostname=no',
      '-o',
      'ControlMaster=no',
      '-o',
      'ControlPersist=no',
      '-o',
      'ControlPath=none',
      '-o',
      'ForwardAgent=no',
      '-o',
      'ClearAllForwardings=yes',
      '-o',
      'PermitLocalCommand=no',
      '-o',
      'KnownHostsCommand=none',
      '-o',
      'NumberOfPasswordPrompts=0',
      '-o',
      'ConnectionAttempts=1',
      '-o',
      'ConnectTimeout=3',
      '-i',
      path,
      '-p',
      '2222',
      '--',
      'registry_source@192.168.10.20',
      'registry-pressure-status-v1',
    ]);
    expect(options).toEqual(policy);
    const child = launch([process.execPath, '-e', script], policy);
    children.push({ child, exited: child.exited });
    decorate(child);
    launched.resolve(child);
    return child;
  }) as typeof Bun.spawn);
  try {
    const source = await openRegistryPressureSource(enrollment, directory);
    await use(source, launched.promise);
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally {
    spawn.mockRestore();
    for (const { child, exited } of children) {
      if (child.exitCode === null && child.signalCode === null) {
        process.kill(-child.pid, 'SIGKILL');
      }
      await exited;
    }
    await rm(parent, { recursive: true });
  }
}

function read(source: RegistryPressureSource, milliseconds = 2500) {
  return source.read(new AbortController().signal, performance.now() + milliseconds);
}

function groupGone(child: Child) {
  try {
    process.kill(-child.pid, 0);
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ESRCH') return;
    throw cause;
  }
  throw new Error('fixture group remains alive');
}

const hold = 'await Bun.sleep(10000);';

test('receives original binary bytes only after EOF and exit zero', () =>
  withExchange(
    'await Bun.write(Bun.stdout, new Uint8Array([123,125])); await Bun.sleep(20); await Bun.write(Bun.stdout, new Uint8Array([10,255,0]));',
    async (source, spawned) => {
      expect(await read(source)).toEqual({
        state: 'received',
        bytes: Uint8Array.of(123, 125, 10, 255, 0),
      });
      expect(await (await spawned).exited).toBe(0);
      await source.close();
    },
  ));

test('admits an owner-only read/write identity', () =>
  withExchange(
    'process.exit(0)',
    async (source) => {
      expect(await read(source)).toEqual({ state: 'received', bytes: new Uint8Array() });
      await source.close();
    },
    undefined,
    0o600,
  ));

for (const [code, expected] of [
  [1, unsuccessful],
  [77, refused],
  [255, unsuccessful],
] as const) {
  test('discards a valid-looking prefix on exit ' + String(code), () =>
    withExchange(
      "await Bun.write(Bun.stdout, '{}\\n'); await Bun.write(Bun.stderr, 'private fixture diagnostic'); process.exit(" +
        String(code) +
        ')',
      async (source) => {
        const reply = await read(source);
        expect(reply).toEqual(expected);
        expect(JSON.stringify(reply)).not.toContain('private fixture diagnostic');
        await source.close();
      },
    ),
  );
}

test('drains concurrent streams at exact stdout and stderr limits', () =>
  withExchange(
    'await Promise.all([Bun.write(Bun.stdout, new Uint8Array(65537).fill(218)), Bun.write(Bun.stderr, new Uint8Array(4096).fill(219))]);',
    async (source) => {
      expect(await read(source)).toEqual({
        state: 'received',
        bytes: new Uint8Array(65537).fill(218),
      });
      await source.close();
    },
  ));

for (const [name, output, length, expected] of [
  ['stdout', 'stdout', 65538, largeStatus],
  ['stderr', 'stderr', 4097, largeStderr],
] as const) {
  test('terminates and reaps the owned fixture on ' + name + ' overflow', () =>
    withExchange(
      'await Bun.write(Bun.' + output + ', new Uint8Array(' + String(length) + ')); ' + hold,
      async (source, spawned) => {
        expect(await read(source)).toEqual(expected);
        const child = await spawned;
        expect(child.signalCode).toBe('SIGKILL');
        groupGone(child);
        await source.close();
      },
    ),
  );
}

test('blocked acquisition uses the original deadline and reaps the owned fixture', () =>
  withExchange(hold, async (source, spawned) => {
    const kill = spyOn(process, 'kill');
    try {
      const start = performance.now();
      const outcome = await source.read(new AbortController().signal, start + 1200);
      expect(outcome).toEqual(timeout);
      expect(performance.now() - start).toBeLessThan(750);
      const child = await spawned;
      expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
      expect(child.signalCode).toBe('SIGKILL');
      groupGone(child);
      await source.close();
    } finally {
      kill.mockRestore();
    }
  }));

test('a busy read refuses overlapping read and close, then caller abort reaps the group', () =>
  withExchange(hold, async (source, spawned) => {
    const caller = new AbortController();
    const active = source.read(caller.signal, performance.now() + 3500);
    const failure = active.catch((cause: unknown) => cause);
    const child = await spawned;
    try {
      await expectFailure(read(source), /busy/);
      await expectFailure(source.close(), /busy/);
    } finally {
      caller.abort('private fixture abort reason');
    }
    expect(await failure).toBeInstanceOf(DOMException);
    expect(await failure).toHaveProperty('name', 'AbortError');
    expect(String(await failure)).not.toContain('private fixture abort reason');
    expect(child.signalCode).toBe('SIGKILL');
    groupGone(child);
    await source.close();
  }));

test('known stdout overflow survives unresolved original-deadline exit settlement', () => {
  const settlement = Promise.withResolvers<number>();
  return withExchange(
    'await Bun.write(Bun.stdout, new Uint8Array(65538)); ' + hold,
    async (source, spawned) => {
      try {
        const deadline = performance.now() + 1300;
        const failure = await source
          .read(new AbortController().signal, deadline)
          .catch((cause: unknown) => cause);
        expect(performance.now()).toBeLessThan(deadline + 500);
        expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
        expect(failure).toHaveProperty('outcome', largeStatus);
        const child = await spawned;
        expect(child.signalCode).toBe('SIGKILL');
        groupGone(child);
        await expectFailure(read(source), /fault/);
        await expectFailure(source.close(), /unresolved/);
      } finally {
        settlement.resolve(137);
      }
      await Bun.sleep(20);
      await expectFailure(read(source), /fault/);
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'exited', { value: settlement.promise });
    },
  );
});

test('zero exit alone waits for complete EOF and cancels both held readers at cutoff', () => {
  let cancellations = 0;
  return withExchange(
    'process.exit(0);',
    async (source, spawned) => {
      const reading = read(source, 1200);
      const child = await spawned;
      expect(await child.exited).toBe(0);
      expect(await reading).toEqual(timeout);
      expect(cancellations).toBe(2);
      await source.close();
    },
    (child) => {
      for (const name of ['stdout', 'stderr'] as const) {
        Object.defineProperty(child, name, {
          value: new ReadableStream<Uint8Array>({
            cancel() {
              cancellations += 1;
            },
          }),
        });
      }
    },
  );
});

test('unsettled reader cancellation preserves timeout and faults the actor', () => {
  const settlement = Promise.withResolvers<undefined>();
  return withExchange(
    hold,
    async (source, spawned) => {
      try {
        const deadline = performance.now() + 1150;
        const failure = await source
          .read(new AbortController().signal, deadline)
          .catch((cause: unknown) => cause);
        expect(performance.now()).toBeLessThan(deadline + 500);
        expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
        expect(failure).toHaveProperty('outcome', timeout);
        expect((await spawned).signalCode).toBe('SIGKILL');
        await expectFailure(source.close(), /unresolved/);
      } finally {
        settlement.resolve(undefined);
      }
      await Bun.sleep(20);
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'stderr', {
        value: new ReadableStream<Uint8Array>({
          cancel() {
            return settlement.promise;
          },
        }),
      });
    },
  );
});

test('failed pipe cancellation after caller abort throws a cleanup error without a modeled reply', () =>
  withExchange(
    hold,
    async (source, spawned) => {
      const caller = new AbortController();
      const reading = source
        .read(caller.signal, performance.now() + 2200)
        .catch((cause: unknown) => cause);
      const child = await spawned;
      caller.abort('private fixture abort reason');
      const failure = await reading;
      expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
      expect(failure).toHaveProperty('outcome', undefined);
      expect(String(failure)).not.toContain('private fixture stream detail');
      expect(child.signalCode).toBe('SIGKILL');
      await expectFailure(source.close(), /unresolved/);
    },
    (child) => {
      Object.defineProperty(child, 'stderr', {
        value: new ReadableStream<Uint8Array>({
          cancel() {
            throw new Error('private fixture stream detail');
          },
        }),
      });
    },
  ));

test('process pipe setup failure still kills and accounts for the owned child', () =>
  withExchange(
    hold,
    async (source, spawned) => {
      const failure = await read(source).catch((cause: unknown) => cause);
      expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
      expect(failure).toHaveProperty('outcome', undefined);
      expect(String(failure)).not.toContain('private fixture pipe setup');
      const child = await spawned;
      expect(child.signalCode).toBe('SIGKILL');
      groupGone(child);
      await expectFailure(source.close(), /unresolved/);
    },
    (child) => {
      Object.defineProperty(child, 'stderr', {
        get() {
          throw new Error('private fixture pipe setup');
        },
      });
    },
  ));

test('waits for the owned exit after both pipes have closed', () =>
  withExchange(
    "import { closeSync } from 'node:fs'; await Bun.write(Bun.stdout, '{}'); closeSync(1); closeSync(2); await Bun.sleep(100); process.exit(1);",
    async (source) => {
      expect(await read(source)).toEqual(unsuccessful);
      await source.close();
    },
  ));

for (const name of ['stdout', 'stderr'] as const) {
  test('requires EOF of ' + name + ' independently of the other pipe and exit', () =>
    withExchange(
      'process.exit(0);',
      async (source) => {
        expect(await read(source, 1150)).toEqual(timeout);
        await source.close();
      },
      (child) => {
        Object.defineProperty(child, name, { value: new ReadableStream<Uint8Array>() });
      },
    ),
  );
}

test('starts both pipe reads before either is drained', () => {
  const stderrRequested = Promise.withResolvers<undefined>();
  return withExchange(
    'process.exit(0);',
    async (source) => {
      expect(await read(source, 1400)).toEqual({ state: 'received', bytes: Uint8Array.of(8) });
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'stdout', {
        value: new ReadableStream<Uint8Array>(
          {
            async pull(pipe) {
              await stderrRequested.promise;
              pipe.enqueue(Uint8Array.of(8));
              pipe.close();
            },
          },
          { highWaterMark: 0 },
        ),
      });
      Object.defineProperty(child, 'stderr', {
        value: new ReadableStream<Uint8Array>(
          {
            pull(pipe) {
              stderrRequested.resolve(undefined);
              pipe.close();
            },
          },
          { highWaterMark: 0 },
        ),
      });
    },
  );
});

test('checks monotonic cutoff even if EOF and exit callbacks outrun a delayed timer', () =>
  withExchange(
    'process.exit(0);',
    async (source) => {
      expect(await read(source, 1150)).toEqual(timeout);
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'exited', {
        value: child.exited.then((code) => {
          Bun.sleepSync(220);
          return code;
        }),
      });
    },
  ));

test('does not report clean shutdown when the owned group signal fails', () =>
  withExchange('await Bun.write(Bun.stdout, new Uint8Array(65538)); ' + hold, async (source) => {
    const kill = process.kill.bind(process);
    const spy = spyOn(process, 'kill').mockImplementation((pid, signal) => {
      const killed = kill(pid, signal);
      if (pid < 0 && signal === 'SIGKILL') {
        throw Object.assign(new Error('private fixture kill failure'), { code: 'EPERM' });
      }
      return killed;
    });
    try {
      const failure = await read(source).catch((cause: unknown) => cause);
      expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
      expect(failure).toHaveProperty('outcome', largeStatus);
      expect(String(failure)).not.toContain('private fixture kill failure');
      await expectFailure(source.close(), /unresolved/);
    } finally {
      spy.mockRestore();
    }
  }));

test('preserves caller abort observed before a delayed acquisition timer', () =>
  withExchange(hold, async (source, spawned) => {
    const caller = new AbortController();
    const active = source
      .read(caller.signal, performance.now() + 1150)
      .catch((cause: unknown) => cause);
    const child = await spawned;
    caller.abort();
    Bun.sleepSync(220);
    const failure = await active;
    expect(failure).toBeInstanceOf(DOMException);
    expect(failure).toHaveProperty('name', 'AbortError');
    expect(child.signalCode).toBe('SIGKILL');
    groupGone(child);
    await source.close();
  }));

for (const [name, exit, when, expected] of [
  ['successful candidate and immediate release failure', 0, 0, undefined],
  ['reserved nonzero exit and immediate release failure', 77, 0, refused],
  ['successful candidate and release past the deadline', 0, 1250, timeout],
] as const) {
  test('preserves only eligible outcomes after ' + name, () =>
    withExchange(
      "await Bun.write(Bun.stdout, 'private candidate frame'); process.exit(" + String(exit) + ');',
      async (source) => {
        const failure = await read(source, 1150).catch((cause: unknown) => cause);
        expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
        expect(failure).toHaveProperty('outcome', expected);
        expect(JSON.stringify(failure)).not.toContain('private candidate frame');
        await expectFailure(
          source.read(new AbortController().signal, performance.now() + 2000),
          /fault/,
        );
        if (when === 0) await expectFailure(source.close(), /unresolved/);
        else await source.close();
      },
      (child) => {
        const stdout = child.stdout;
        const getReader = stdout.getReader.bind(stdout);
        Object.defineProperty(stdout, 'getReader', {
          value: () => {
            const reader = getReader();
            const release = reader.releaseLock.bind(reader);
            reader.releaseLock = () => {
              release();
              if (when > 0) Bun.sleepSync(when);
              else throw new Error('private fixture release failure');
            };
            return reader;
          },
        });
      },
    ),
  );
}

test('rechecks the original deadline at public frame receipt after cleanup has settled', () => {
  let isReleasing = false;
  let samples = 0;
  return withExchange(
    "await Bun.write(Bun.stdout, '{}');",
    async (source) => {
      const now = performance.now.bind(performance);
      const clock = spyOn(performance, 'now').mockImplementation(() => {
        // From release, final timer setup and observed settlement finish first. The caller's
        // own receipt then simulates a pause before it resumes.
        if (isReleasing && ++samples === 3) return now() + 3000;
        return now();
      });
      try {
        expect(await read(source)).toEqual(timeout);
        await source.close();
      } finally {
        clock.mockRestore();
      }
    },
    (child) => {
      const stdout = child.stdout;
      const getReader = stdout.getReader.bind(stdout);
      Object.defineProperty(stdout, 'getReader', {
        value: () => {
          const reader = getReader();
          const release = reader.releaseLock.bind(reader);
          reader.releaseLock = () => {
            release();
            isReleasing = true;
          };
          return reader;
        },
      });
    },
  );
});

test('reaps an active child despite an earlier shared abort listener stopping propagation', () =>
  withExchange(
    "await Bun.sleep(500); await Bun.write(Bun.stdout, 'fixture');",
    async (source, spawned) => {
      const caller = new AbortController();
      caller.signal.addEventListener(
        'abort',
        (event) => {
          event.stopImmediatePropagation();
        },
        { once: true },
      );
      const reading = source
        .read(caller.signal, performance.now() + 2500)
        .catch((cause: unknown) => cause);
      const child = await spawned;
      const interrupted = performance.now();
      caller.abort('private fixture abort reason');
      const outcome = await reading;
      expect(outcome).toBeInstanceOf(DOMException);
      expect(outcome).toHaveProperty('name', 'AbortError');
      expect(String(outcome)).not.toContain('private fixture abort reason');
      expect(performance.now() - interrupted).toBeLessThan(350);
      expect(child.signalCode).toBe('SIGKILL');
      groupGone(child);
      await source.close();
    },
  ));

test('preserves an actual exit77 observed before a subsequent pipe fault', () =>
  withExchange(
    'process.exit(77);',
    async (source, spawned) => {
      const reading = read(source, 2500).catch((cause: unknown) => cause);
      expect(await (await spawned).exited).toBe(77);
      const failure = await reading;
      expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
      expect(failure).toHaveProperty('outcome', refused);
      expect(String(failure)).not.toContain('private fixture pipe error');
      await expectFailure(source.close(), /unresolved/);
    },
    (child) => {
      Object.defineProperty(child, 'stderr', {
        value: new ReadableStream<Uint8Array>({
          async start(pipe) {
            await child.exited;
            await Bun.sleep(25);
            pipe.error(new Error('private fixture pipe error'));
          },
        }),
      });
    },
  ));

for (const isCleanupFailure of [false, true]) {
  test(
    'retains controlled abort semantics after an independently observed exit77 with ' +
      (isCleanupFailure ? 'failed cleanup' : 'successful cleanup'),
    () =>
      withExchange(
        'process.exit(77);',
        async (source, spawned) => {
          const caller = new AbortController();
          const reading = source
            .read(caller.signal, performance.now() + 2500)
            .catch((cause: unknown) => cause);
          expect(await (await spawned).exited).toBe(77);
          await Bun.sleep(25);
          caller.abort('private fixture abort reason');
          const failure = await reading;
          if (isCleanupFailure) {
            expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
            expect(failure).toHaveProperty('outcome', refused);
            await expectFailure(source.close(), /unresolved/);
          } else {
            expect(failure).toBeInstanceOf(DOMException);
            expect(failure).toHaveProperty('name', 'AbortError');
            await source.close();
          }
          expect(String(failure)).not.toContain('private fixture abort reason');
        },
        (child) => {
          Object.defineProperty(child, 'stderr', {
            value: new ReadableStream<Uint8Array>({
              cancel() {
                if (isCleanupFailure) throw new Error('private fixture cancel failure');
              },
            }),
          });
        },
      ),
  );
}

test('disposes preflight and process abort subscriptions after settling the exchange', () =>
  withExchange('process.exit(0);', async (source) => {
    const caller = new AbortController();
    const observe = () => undefined;
    caller.signal.addEventListener('abort', observe, { once: true });
    const reply = await source.read(caller.signal, performance.now() + 2500);
    expect(reply).toEqual({ state: 'received', bytes: new Uint8Array() });
    expect(getEventListeners(caller.signal, 'abort')).toEqual([observe]);
    await source.close();
  }));

test('keeps an earlier abort primary when a later exit observation precedes pipe cancellation failure', () => {
  const caller = new AbortController();
  return withExchange(
    'process.exit(77);',
    async (source, spawned) => {
      const reading = source
        .read(caller.signal, performance.now() + 2500)
        .catch((cause: unknown) => cause);
      expect(await (await spawned).exited).toBe(77);
      const failure = await reading;
      expect(caller.signal.aborted).toBe(true);
      expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
      expect(failure).toHaveProperty('outcome', undefined);
      await expectFailure(source.close(), /unresolved/);
    },
    (child) => {
      void child.exited.then(() => {
        caller.abort('private fixture abort reason');
      });
      Object.defineProperty(child, 'stderr', {
        value: new ReadableStream<Uint8Array>({
          cancel() {
            throw new Error('private fixture cancel failure');
          },
        }),
      });
    },
  );
});

test('keeps the timeout primary when a delayed exit77 observation crosses cutoff', () =>
  withExchange(
    'process.exit(77);',
    async (source) => {
      expect(await read(source, 1150)).toEqual(timeout);
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'exited', {
        value: child.exited.then((code) => {
          Bun.sleepSync(220);
          return code;
        }),
      });
    },
  ));

test('returns an independently observed exit77 after a later cutoff and clean pipe cancellation', () =>
  withExchange(
    'process.exit(77);',
    async (source, spawned) => {
      const reading = read(source, 1200);
      expect(await (await spawned).exited).toBe(77);
      expect(await reading).toEqual(refused);
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'stderr', { value: new ReadableStream<Uint8Array>() });
    },
  ));

for (const [code, candidate] of [
  [0, 'received candidate'],
  [1, 'command-failure candidate after exit 1'],
  [77, 'reserved refusal candidate'],
  [255, 'command-failure candidate after exit 255'],
] as const) {
  test('cancels a ' + candidate + ' during final subscription disposal before public receipt', () =>
    withExchange(
      "await Bun.write(Bun.stdout, 'fixture'); process.exit(" + String(code) + ');',
      async (source, spawned) => {
        const caller = new AbortController();
        const remove = caller.signal.removeEventListener.bind(caller.signal);
        let disposals = 0;
        const observer = spyOn(caller.signal, 'removeEventListener').mockImplementation(((
          name: string,
          listener: EventListenerOrEventListenerObject,
          options?: EventListenerOptions | boolean,
        ) => {
          remove(name, listener, options);
          disposals += 1;
          if (disposals === 2) caller.abort('private fixture abort reason');
        }) as typeof caller.signal.removeEventListener);
        try {
          const failure = await source
            .read(caller.signal, performance.now() + 2500)
            .catch((cause: unknown) => cause);
          expect(await (await spawned).exited).toBe(code);
          expect(caller.signal.aborted).toBe(true);
          expect(failure).toBeInstanceOf(DOMException);
          expect(failure).toHaveProperty('name', 'AbortError');
          expect(String(failure)).not.toContain('private fixture abort reason');
        } finally {
          observer.mockRestore();
          await source.close();
        }
      },
    ),
  );
}

for (const [pipe, bytes, expected] of [
  ['stdout', 65538, largeStatus],
  ['stderr', 4097, largeStderr],
] as const) {
  for (const exit of [77, 255]) {
    for (const failed of [false, true]) {
      test(
        'preserves ' +
          pipe +
          ' cap after actual exit ' +
          String(exit) +
          ' with ' +
          (failed ? 'failed cleanup' : 'clean cancellation'),
        () => {
          const caller = new AbortController();
          return withExchange(
            'process.exit(' + String(exit) + ');',
            async (source, spawned) => {
              const reading = source
                .read(caller.signal, performance.now() + 2500)
                .catch((cause: unknown) => cause);
              expect(await (await spawned).exited).toBe(exit);
              const reply = await reading;
              expect(caller.signal.aborted).toBe(true);
              if (failed) {
                expect(reply).toBeInstanceOf(RegistrySourceCleanupError);
                expect(reply).toHaveProperty('outcome', expected);
                expect(String(reply)).not.toContain('private fixture cancellation error');
                await expectFailure(source.close(), /unresolved/);
              } else {
                expect(reply).toEqual(expected);
                await source.close();
              }
            },
            (child) => {
              Object.defineProperty(child, pipe, {
                value: new ReadableStream<Uint8Array>({
                  async start(stream) {
                    await child.exited;
                    await Bun.sleep(20);
                    stream.enqueue(new Uint8Array(bytes));
                    stream.close();
                  },
                }),
              });
              Object.defineProperty(child, pipe === 'stdout' ? 'stderr' : 'stdout', {
                value: new ReadableStream<Uint8Array>({
                  cancel() {
                    caller.abort('private fixture late abort');
                    if (failed) throw new Error('private fixture cancellation error');
                  },
                }),
              });
            },
          );
        },
      );
    }
  }
}

test('preserves primary timeout when the caller aborts during pipe cancellation', () => {
  const caller = new AbortController();
  return withExchange(
    hold,
    async (source, spawned) => {
      expect(await source.read(caller.signal, performance.now() + 1200)).toEqual(timeout);
      expect(caller.signal.aborted).toBe(true);
      const child = await spawned;
      expect(child.signalCode).toBe('SIGKILL');
      groupGone(child);
      await source.close();
    },
    (child) => {
      Object.defineProperty(child, 'stderr', {
        value: new ReadableStream<Uint8Array>({
          cancel() {
            caller.abort('private fixture late abort');
          },
        }),
      });
    },
  );
});
