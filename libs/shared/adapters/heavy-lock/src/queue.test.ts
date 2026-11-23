import * as filesystem from 'node:fs';
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

import { afterAll, expect, it, spyOn } from 'bun:test';

import { holdLock } from './native';
import { type QueueRuntime, runQueuedWork } from './queue';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni queued lock '));
  roots.push(root);
  const path = join(root, 'mutex'),
    controller = new AbortController();
  let elapsed = 0;
  const runtime: QueueRuntime = {
    pid: process.pid,
    signal: controller.signal,
    readEpoch: () => 1800000000000000000n,
    readElapsed: () => elapsed,
    isAlive: (pid) => pid === process.pid,
    wait: (seconds) => {
      elapsed += seconds;
      return Promise.resolve('elapsed');
    },
  };
  return {
    path,
    controller,
    runtime,
    request: {
      path,
      label: 'lane x',
      command: 'bun run original\nlabel forged',
      waitSeconds: 0,
      pollSeconds: 1,
    },
  };
}
function writeTicket(path: string, name: string, deadline = '1800000100') {
  mkdirSync(path + '.queue', { recursive: true });
  writeFileSync(
    join(path + '.queue', name),
    'pid ' +
      name.slice(20) +
      '\nlabel earlier\nstarted 2027-01-15T08:00:00Z\ndeadline ' +
      deadline +
      '\ncommand opaque\n',
  );
}

it('publishes complete legacy metadata before a zero-budget claim and removes its ticket before work', async () => {
  const f = createFixture();
  let entered = 0;
  const value = await runQueuedWork(
    f.request,
    async () => {
      entered++;
      expect(readFileSync(f.path + '.d/holder', 'utf8')).toBe(String(process.pid) + '\n');
      expect(readFileSync(f.path + '.d/label', 'utf8')).toBe('lane x\n');
      expect(readdirSync(f.path + '.queue')).toEqual([]);
      expect((await holdLock(f.path, () => Promise.resolve(0))).kind).toBe('busy');
      return 42;
    },
    f.runtime,
  );
  expect(value).toEqual({ kind: 'completed', value: 42, aheadAtArrival: 0 });
  expect(entered).toBe(1);
  expect(existsSync(f.path + '.d')).toBe(false);
  expect(readdirSync(f.path + '.queue')).toEqual([]);
  expect(existsSync(f.path)).toBe(true);
});
it('never jumps an earlier live ticket even when the kernel mutex is free', async () => {
  const f = createFixture();
  const name = '1799999999000000000-' + String(process.pid);
  writeTicket(f.path, name);
  let entered = false;
  expect(
    await runQueuedWork(
      f.request,
      () => {
        entered = true;
        return Promise.resolve();
      },
      f.runtime,
    ),
  ).toEqual({
    kind: 'refused',
    aheadAtArrival: 1,
    ahead: 1,
    waitedSeconds: 0,
    contention: {
      kind: 'tickets',
      tickets: [{ pidText: String(process.pid), label: { kind: 'named', text: 'earlier' } }],
    },
  });
  expect(entered).toBe(false);
  expect(readdirSync(f.path + '.queue')).toEqual([name]);
  expect(existsSync(f.path)).toBe(false);
});
it('retains first arrival count while a bounded waiter advances after the earlier ticket leaves', async () => {
  const f = createFixture(),
    name = '1799999999000000000-' + String(process.pid);
  writeTicket(f.path, name);
  const runtime = {
    ...f.runtime,
    wait: () => {
      rmSync(join(f.path + '.queue', name));
      return Promise.resolve('elapsed' as const);
    },
  };
  expect(
    await runQueuedWork({ ...f.request, waitSeconds: 5 }, () => Promise.resolve(1), runtime),
  ).toEqual({ kind: 'completed', value: 1, aheadAtArrival: 1 });
});
it('reclaims dead tickets and drafts before decoding their incomplete bodies', async () => {
  const f = createFixture();
  mkdirSync(f.path + '.queue');
  for (const name of ['1799999999000000000-2147483647', '.draft-1799999999000000000-2147483647'])
    writeFileSync(join(f.path + '.queue', name), 'partial');
  expect((await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).kind).toBe(
    'completed',
  );
  expect(readdirSync(f.path + '.queue')).toEqual([]);
});
it('reclaims a live ticket only strictly beyond its deadline plus sixty seconds', async () => {
  const f = createFixture(),
    name = '1799999999000000000-' + String(process.pid);
  writeTicket(f.path, name, '1799999940');
  expect((await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).kind).toBe(
    'refused',
  );
  expect(existsSync(join(f.path + '.queue', name))).toBe(true);
  writeTicket(f.path, name, '1799999939');
  expect((await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).kind).toBe(
    'completed',
  );
  expect(existsSync(join(f.path + '.queue', name))).toBe(false);
});
for (const holder of [undefined, '', String(process.pid)])
  it(
    'respects an incomplete or live pre-flock holder ' +
      (holder === String(process.pid) ? 'live' : String(holder)),
    async () => {
      const f = createFixture();
      mkdirSync(f.path + '.d');
      if (holder !== undefined) writeFileSync(f.path + '.d/holder', holder);
      let entered = false;
      expect(
        (
          await runQueuedWork(
            f.request,
            () => {
              entered = true;
              return Promise.resolve();
            },
            f.runtime,
          )
        ).kind,
      ).toBe('refused');
      expect(entered).toBe(false);
      expect(existsSync(f.path + '.d')).toBe(true);
    },
  );
it('reclaims only the known files of a dead holder and retains unknown content as a refusal', async () => {
  const f = createFixture();
  mkdirSync(f.path + '.d');
  writeFileSync(f.path + '.d/holder', '2147483647\n');
  writeFileSync(f.path + '.d/label', 'dead\n');
  writeFileSync(f.path + '.d/operator-note', 'keep');
  expect(runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).rejects.toThrow();
  expect(readFileSync(f.path + '.d/operator-note', 'utf8')).toBe('keep');
  expect((await holdLock(f.path, () => Promise.resolve(1))).kind).toBe('owned');
});
it('refuses a malformed holder before entering work and leaves it intact', () => {
  const f = createFixture();
  mkdirSync(f.path + '.d');
  writeFileSync(f.path + '.d/holder', 'not-a-pid\n');
  expect(runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).rejects.toThrow('PID');
  expect(readFileSync(f.path + '.d/holder', 'utf8')).toBe('not-a-pid\n');
  return Promise.resolve();
});
it('cancels before publishing and while waiting without entering protected work', async () => {
  const f = createFixture();
  f.controller.abort();
  expect(await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).toEqual({
    kind: 'cancelled',
  });
  expect(existsSync(f.path + '.queue')).toBe(false);
  const g = createFixture(),
    name = '1799999999000000000-' + String(process.pid);
  writeTicket(g.path, name);
  const runtime = {
    ...g.runtime,
    wait: () => {
      g.controller.abort();
      return Promise.resolve('cancelled' as const);
    },
  };
  expect(
    await runQueuedWork({ ...g.request, waitSeconds: 30 }, () => Promise.resolve(1), runtime),
  ).toEqual({ kind: 'cancelled' });
  expect(readdirSync(g.path + '.queue')).toEqual([name]);
});
it('keeps the native lock and holder until active work settles after cancellation', async () => {
  const f = createFixture();
  let finish: () => void = () => {
    throw new Error('work not entered');
  };
  const work = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let entered: () => void = () => {
    throw new Error('entry not initialized');
  };
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let settled = false;
  const active = runQueuedWork(
    f.request,
    async () => {
      entered();
      await work;
      return 7;
    },
    f.runtime,
  ).finally(() => {
    settled = true;
  });
  await entry;
  f.controller.abort();
  await Bun.sleep(10);
  expect(settled).toBe(false);
  expect(existsSync(f.path + '.d/holder')).toBe(true);
  expect((await holdLock(f.path, () => Promise.resolve(0))).kind).toBe('busy');
  finish();
  expect(await active).toEqual({ kind: 'completed', value: 7, aheadAtArrival: 0 });
  expect((await holdLock(f.path, () => Promise.resolve(0))).kind).toBe('owned');
});
it('preserves the exact callback failure after record and queue cleanup', async () => {
  const f = createFixture(),
    fault = new Error('protected failure');
  expect(
    runQueuedWork(
      f.request,
      () => {
        throw fault;
      },
      f.runtime,
    ),
  ).rejects.toBe(fault);
  expect(existsSync(f.path + '.d')).toBe(false);
  expect(readdirSync(f.path + '.queue')).toEqual([]);
  expect((await holdLock(f.path, () => Promise.resolve(1))).kind).toBe('owned');
});
it('refuses a duplicate published ticket without overwriting or removing its bytes', () => {
  const f = createFixture(),
    name = '1800000000000000000-' + String(process.pid);
  writeTicket(f.path, name);
  const before = readFileSync(join(f.path + '.queue', name));
  expect(runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).rejects.toThrow();
  expect(readFileSync(join(f.path + '.queue', name))).toEqual(before);
  expect(readdirSync(f.path + '.queue')).toEqual([name]);
  return Promise.resolve();
});
it('refuses to claim when its published ticket disappeared during admission', () => {
  const f = createFixture();
  const runtime = {
    ...f.runtime,
    isAlive: (pid: number) => {
      rmSync(f.path + '.queue/1800000000000000000-' + String(process.pid));
      return pid === process.pid;
    },
  };
  let entered = false;
  expect(
    runQueuedWork(
      f.request,
      () => {
        entered = true;
        return Promise.resolve();
      },
      runtime,
    ),
  ).rejects.toThrow('own ticket');
  expect(entered).toBe(false);
  expect(existsSync(f.path)).toBe(false);
  return Promise.resolve();
});

it('preserves both a partial draft write failure and its real descriptor close failure', async () => {
  const f = createFixture(),
    writeFault = new Error('draft write failed'),
    closeFault = new Error('draft close failed');
  const nativeWrite = filesystem.writeFileSync,
    nativeClose = filesystem.closeSync;
  let descriptor: number | undefined;
  const writing = spyOn(filesystem, 'writeFileSync').mockImplementation(
    (path, contents, options) => {
      if (typeof path === 'number') {
        descriptor = path;
        nativeWrite(path, 'partial');
        throw writeFault;
      }
      nativeWrite(path, contents, options);
    },
  );
  const closing = spyOn(filesystem, 'closeSync').mockImplementation((fd) => {
    nativeClose(fd);
    if (fd === descriptor) throw closeFault;
  });
  try {
    let failure: unknown;
    try {
      await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([writeFault, closeFault]);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    expect(existsSync(f.path)).toBe(false);
  } finally {
    writing.mockRestore();
    closing.mockRestore();
  }
});

it('rechecks its ticket inside native ownership before publishing a record', () => {
  const f = createFixture(),
    nativeOpen = filesystem.openSync;
  let removed = false,
    entered = false;
  const opening = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    const fd = nativeOpen(path, flags, mode);
    if (path === f.path) {
      rmSync(f.path + '.queue/1800000000000000000-' + String(process.pid));
      removed = true;
    }
    return fd;
  });
  try {
    expect(
      runQueuedWork(
        f.request,
        () => {
          entered = true;
          return Promise.resolve();
        },
        f.runtime,
      ),
    ).rejects.toThrow('own ticket');
    expect(removed).toBe(true);
    expect(entered).toBe(false);
    expect(existsSync(f.path + '.d')).toBe(false);
  } finally {
    opening.mockRestore();
  }
  return Promise.resolve();
});

it('captures request and runtime functions before entering a caller supplied capability', async () => {
  const f = createFixture();
  const runtime = {
    ...f.runtime,
    readEpoch: () => {
      f.request.label = 'mutated';
      f.request.path = '/must-not-create';
      runtime.isAlive = () => {
        throw new Error('mutated capability called');
      };
      return 1800000000000000000n;
    },
  };
  expect(
    (
      await runQueuedWork(
        f.request,
        () => {
          expect(readFileSync(f.path + '.d/label', 'utf8')).toBe('lane x\n');
          return Promise.resolve(1);
        },
        runtime,
      )
    ).kind,
  ).toBe('completed');
});

it('attempts record and ticket cleanup independently and reports callback plus cleanup failures', async () => {
  const f = createFixture(),
    fault = new Error('callback failure'),
    unlinkFault = new Error('label unlink failure'),
    nativeUnlink = filesystem.unlinkSync;
  let attemptedHolder = false;
  const removing = spyOn(filesystem, 'unlinkSync').mockImplementation((path) => {
    if (path === f.path + '.d/label') throw unlinkFault;
    if (path === f.path + '.d/holder') attemptedHolder = true;
    nativeUnlink(path);
  });
  try {
    let failure: unknown;
    try {
      await runQueuedWork(
        f.request,
        () => {
          throw fault;
        },
        f.runtime,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(attemptedHolder).toBe(true);
    expect(failure).toBeInstanceOf(AggregateError);
    const errors: unknown[] = (failure as AggregateError).errors;
    expect(errors[0]).toBe(fault);
    expect(errors[1]).toBeInstanceOf(AggregateError);
    const cleanup = errors[1];
    if (!(cleanup instanceof AggregateError)) throw new Error('cleanup aggregate absent');
    const causes: unknown[] = cleanup.errors;
    expect(causes[0]).toBe(unlinkFault);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    expect((await holdLock(f.path, () => Promise.resolve(0))).kind).toBe('owned');
  } finally {
    removing.mockRestore();
  }
});

it('reclaims an interrupted dead draft whose command ends in partial UTF8', async () => {
  const f = createFixture();
  mkdirSync(f.path + '.queue');
  writeFileSync(
    f.path + '.queue/.draft-1799999999000000000-2147483647',
    new Uint8Array([112, 105, 100, 32, 0xe2, 0x82]),
  );
  expect((await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).kind).toBe(
    'completed',
  );
  expect(readdirSync(f.path + '.queue')).toEqual([]);
});

for (const holder of ['0', '2147483648'])
  it('refuses a holder PID outside the native range ' + holder, () => {
    const f = createFixture();
    mkdirSync(f.path + '.d');
    writeFileSync(f.path + '.d/holder', holder);
    expect(runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).rejects.toThrow('PID');
    return Promise.resolve();
  });
it('refuses an invalid queue stamp before creating filesystem state', () => {
  const f = createFixture();
  expect(
    runQueuedWork(f.request, () => Promise.resolve(1), {
      ...f.runtime,
      readEpoch: () => 180000000000000000n,
    }),
  ).rejects.toThrow('19 digits');
  expect(existsSync(f.path + '.queue')).toBe(false);
  return Promise.resolve();
});
for (const pid of [0, 2147483648, 1.5])
  it('refuses invalid caller PID ' + String(pid), () => {
    const f = createFixture();
    expect(
      runQueuedWork(f.request, () => Promise.resolve(1), { ...f.runtime, pid }),
    ).rejects.toThrow('PID');
    expect(existsSync(f.path + '.queue')).toBe(false);
    return Promise.resolve();
  });
it('uses its monotonic wait budget independently of repeated wall clock epochs', async () => {
  const f = createFixture(),
    name = '1799999999000000000-' + String(process.pid);
  writeTicket(f.path, name);
  let elapsed = 0,
    polls = 0;
  const completion = await runQueuedWork(
    { ...f.request, waitSeconds: 2 },
    () => Promise.resolve(1),
    {
      ...f.runtime,
      readElapsed: () => elapsed,
      wait: () => {
        elapsed++;
        polls++;
        return Promise.resolve('elapsed');
      },
    },
  );
  expect(completion).toEqual({
    kind: 'refused',
    aheadAtArrival: 1,
    ahead: 1,
    waitedSeconds: 2,
    contention: {
      kind: 'tickets',
      tickets: [{ pidText: String(process.pid), label: { kind: 'named', text: 'earlier' } }],
    },
  });
  expect(polls).toBe(2);
  expect(readdirSync(f.path + '.queue')).toEqual([name]);
});

it('cleans a partial holder publication before returning its exact write failure', async () => {
  const f = createFixture(),
    fault = new Error('holder write failed'),
    nativeWrite = filesystem.writeFileSync;
  let labelWritten = false,
    entered = false;
  const writing = spyOn(filesystem, 'writeFileSync').mockImplementation(
    (path, contents, options) => {
      if (path === f.path + '.d/label') labelWritten = true;
      if (path === f.path + '.d/holder') {
        expect(labelWritten).toBe(true);
        throw fault;
      }
      nativeWrite(path, contents, options);
    },
  );
  try {
    let failure: unknown;
    try {
      await runQueuedWork(
        f.request,
        () => {
          entered = true;
          return Promise.resolve(1);
        },
        f.runtime,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBe(fault);
    expect(entered).toBe(false);
    expect(existsSync(f.path + '.d')).toBe(false);
    expect(readdirSync(f.path + '.queue')).toEqual([]);
    expect((await holdLock(f.path, () => Promise.resolve(1))).kind).toBe('owned');
  } finally {
    writing.mockRestore();
  }
});
it('creates only a hidden draft before its first metadata byte is written', async () => {
  const f = createFixture(),
    nativeWrite = filesystem.writeFileSync;
  let reached = false;
  const writing = spyOn(filesystem, 'writeFileSync').mockImplementation(
    (path, contents, options) => {
      if (typeof path === 'number') {
        expect(readdirSync(f.path + '.queue')).toEqual([
          '.draft-1800000000000000000-' + String(process.pid),
        ]);
        reached = true;
      }
      nativeWrite(path, contents, options);
    },
  );
  try {
    expect((await runQueuedWork(f.request, () => Promise.resolve(1), f.runtime)).kind).toBe(
      'completed',
    );
    expect(reached).toBe(true);
  } finally {
    writing.mockRestore();
  }
});

for (const queued of [false, true])
  it(
    'exposes admission timing inside protected work before completion ' +
      (queued ? 'queued' : 'immediate'),
    async () => {
      const f = createFixture(),
        name = '1799999999000000000-' + String(process.pid);
      if (queued) writeTicket(f.path, name);
      let elapsed = 10.25;
      const runtime: QueueRuntime = {
        ...f.runtime,
        readElapsed: () => elapsed,
        wait: () => {
          elapsed += 2.875;
          rmSync(join(f.path + '.queue', name));
          return Promise.resolve('elapsed');
        },
      };
      const completion = await runQueuedWork(
        { ...f.request, waitSeconds: 10, pollSeconds: 2 },
        async (admission?: { readonly aheadAtArrival: number; readonly waitedSeconds: number }) => {
          expect(admission).toEqual({
            aheadAtArrival: queued ? 1 : 0,
            waitedSeconds: queued ? 2 : 0,
          });
          expect(readFileSync(f.path + '.d/holder', 'utf8')).toBe(String(process.pid) + '\n');
          expect((await holdLock(f.path, () => Promise.resolve())).kind).toBe('busy');
          return 42;
        },
        runtime,
      );
      expect(completion).toEqual({ kind: 'completed', value: 42, aheadAtArrival: queued ? 1 : 0 });
    },
  );
