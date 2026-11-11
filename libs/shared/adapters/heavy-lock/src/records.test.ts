import * as filesystem from 'node:fs';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it, spyOn } from 'bun:test';

import { readStatus, renderStatus } from './records';

const roots: string[] = [];
const now = 1800000010n;
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni compatible lock records '));
  roots.push(root);
  return {
    root,
    path: join(root, 'mutex'),
    record: join(root, 'mutex.d'),
    queue: join(root, 'mutex.queue'),
  };
}
function writeHolder(fixture: ReturnType<typeof createFixture>, pid: string, label?: string) {
  mkdirSync(fixture.record);
  writeFileSync(join(fixture.record, 'holder'), pid);
  if (label !== undefined) writeFileSync(join(fixture.record, 'label'), label);
}
function writeTicket(
  fixture: ReturnType<typeof createFixture>,
  name: string,
  label: string,
  deadline: string,
) {
  mkdirSync(fixture.queue, { recursive: true });
  writeFileSync(
    join(fixture.queue, name),
    'pid ' +
      name.split('-')[1] +
      '\nlabel ' +
      label +
      '\nstarted 2027-01-15T08:00:00Z\ndeadline ' +
      deadline +
      '\ncommand original\nlabel forged\ndeadline 1\n',
  );
}

it('reports an unprovisioned lock without creating mutex record or queue files', () => {
  const fixture = createFixture(),
    status = readStatus(fixture.path, now);
  expect(status).toEqual({ holder: { kind: 'none' }, waiters: [] });
  expect(renderStatus(status)).toBe('heavy lock: holder none\n');
  expect(existsSync(fixture.path)).toBe(false);
  expect(existsSync(fixture.record)).toBe(false);
  expect(existsSync(fixture.queue)).toBe(false);
});

for (const contents of [undefined, '', '\n\n'])
  it('models the missing or empty holder publication phase ' + JSON.stringify(contents), () => {
    const fixture = createFixture();
    mkdirSync(fixture.record);
    if (contents !== undefined) writeFileSync(join(fixture.record, 'holder'), contents);
    const status = readStatus(fixture.path, now);
    expect(status.holder).toEqual({ kind: 'claiming' });
    expect(renderStatus(status)).toBe('heavy lock: holder claiming\n');
  });

it('reports holder text observationally and applies legacy trailing-LF normalization', () => {
  const fixture = createFixture();
  writeHolder(fixture, 'not-a-pid\n\n', 'a lane with spaces\n\n');
  const status = readStatus(fixture.path, now);
  expect(status.holder).toEqual({
    kind: 'recorded',
    pidText: 'not-a-pid',
    label: { kind: 'named', text: 'a lane with spaces' },
  });
  expect(renderStatus(status)).toBe('heavy lock: holder pid not-a-pid label a lane with spaces\n');
});

it('distinguishes an absent pre-queue label from a present empty label', () => {
  const fixture = createFixture();
  writeHolder(fixture, '123\n');
  expect(readStatus(fixture.path, now).holder).toEqual({
    kind: 'recorded',
    pidText: '123',
    label: { kind: 'pre-queue' },
  });
  expect(renderStatus(readStatus(fixture.path, now))).toBe(
    'heavy lock: holder pid 123 label unlabeled (pre-queue holder)\n',
  );
  writeFileSync(join(fixture.record, 'label'), '\n');
  expect(readStatus(fixture.path, now).holder).toEqual({
    kind: 'recorded',
    pidText: '123',
    label: { kind: 'named', text: '' },
  });
});

it('reads sorted positional tickets without trusting command text or reclaiming dead entries', () => {
  const fixture = createFixture();
  writeTicket(fixture, '1800000001000000000-2147483647', 'second', '1800000009');
  writeTicket(fixture, '1800000000000000000-12345', 'first', '1800000015');
  writeFileSync(join(fixture.queue, '.draft-incomplete'), '');
  const status = readStatus(fixture.path, now);
  expect(status.waiters).toEqual([
    {
      name: '1800000000000000000-12345',
      pidText: '12345',
      label: 'first',
      ageSeconds: 10n,
      budget: { kind: 'left', seconds: 5n },
    },
    {
      name: '1800000001000000000-2147483647',
      pidText: '2147483647',
      label: 'second',
      ageSeconds: 9n,
      budget: { kind: 'expired' },
    },
  ]);
  expect(renderStatus(status)).toBe(
    'heavy lock: holder none\nheavy lock: waiter pid 12345 label first age 10s budget 5s left\nheavy lock: waiter pid 2147483647 label second age 9s budget expired\n',
  );
  expect(existsSync(join(fixture.queue, '1800000001000000000-2147483647'))).toBe(true);
  expect(existsSync(join(fixture.queue, '.draft-incomplete'))).toBe(true);
  expect(existsSync(fixture.path)).toBe(false);
});

it('preserves signed age and bigint deadline arithmetic for future or large observations', () => {
  const fixture = createFixture();
  writeTicket(fixture, '1800000020000000000-12345', 'future', '999999999999999999999999999');
  const status = readStatus(fixture.path, now);
  expect(status.waiters[0]).toMatchObject({
    ageSeconds: -10n,
    budget: { kind: 'left', seconds: 999999999999999998199999989n },
  });
});

it('skips a published ticket that vanished before its descriptor could open', () => {
  const fixture = createFixture(),
    name = '1800000000000000000-12345';
  writeTicket(fixture, name, 'gone', '1800000015');
  const target = join(fixture.queue, name),
    nativeOpen = filesystem.openSync;
  let injected = false;
  const changed = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    if (path === target) {
      injected = true;
      rmSync(target);
    }
    return nativeOpen(path, flags, mode);
  });
  try {
    expect(readStatus(fixture.path, now).waiters).toEqual([]);
    expect(injected).toBe(true);
  } finally {
    changed.mockRestore();
  }
});

it('reports none when the holder directory disappears while reading its fields', () => {
  const fixture = createFixture();
  writeHolder(fixture, '123\n', 'released\n');
  const target = join(fixture.record, 'label'),
    nativeOpen = filesystem.openSync;
  let injected = false;
  const changed = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    if (path === target) {
      injected = true;
      rmSync(fixture.record, { recursive: true });
    }
    return nativeOpen(path, flags, mode);
  });
  try {
    expect(readStatus(fixture.path, now).holder).toEqual({ kind: 'none' });
    expect(injected).toBe(true);
  } finally {
    changed.mockRestore();
  }
});

for (const field of ['holder', 'label', 'queue'] as const)
  it('refuses unreadable ' + field + ' state rather than reporting absence', () => {
    const fixture = createFixture();
    writeHolder(fixture, '123\n', 'present\n');
    writeTicket(fixture, '1800000000000000000-12345', 'queued', '1800000015');
    const target = field === 'queue' ? fixture.queue : join(fixture.record, field);
    chmodSync(target, 0o000);
    try {
      expect(() => readStatus(fixture.path, now)).toThrow('unreadable');
    } finally {
      chmodSync(target, field === 'queue' ? 0o700 : 0o600);
    }
  });

for (const field of ['holder', 'label'] as const)
  it('refuses a nonregular ' + field + ' before metadata acquisition', () => {
    const fixture = createFixture();
    writeHolder(fixture, '123\n', 'present\n');
    const target = join(fixture.record, field);
    rmSync(target);
    mkdirSync(target);
    expect(() => readStatus(fixture.path, now)).toThrow('regular file');
  });

for (const [name, body] of [
  ['note', 'pid 123\nlabel x\nstarted x\ndeadline 1\n'],
  ['1800000000000000000-12345', 'pid 12345\nno-label\nstarted x\ndeadline 1\n'],
  ['1800000000000000000-12345', 'pid 12345\nlabel x\nstarted x\ndeadline invalid\n'],
] as const)
  it(
    'refuses malformed published ticket ' +
      name +
      '/' +
      body.split('\n')[1] +
      '/' +
      body.split('\n')[3],
    () => {
      const fixture = createFixture();
      mkdirSync(fixture.queue);
      writeFileSync(join(fixture.queue, name), body);
      expect(() => readStatus(fixture.path, now)).toThrow(
        name === 'note' ? 'epoch/PID' : body.includes('no-label') ? 'no lane label' : 'deadline',
      );
    },
  );

for (const contents of [undefined, ''])
  it(
    'refuses an unreadable label during incomplete holder publication ' + JSON.stringify(contents),
    () => {
      const fixture = createFixture();
      mkdirSync(fixture.record);
      if (contents !== undefined) writeFileSync(join(fixture.record, 'holder'), contents);
      writeFileSync(join(fixture.record, 'label'), 'label');
      chmodSync(join(fixture.record, 'label'), 0o000);
      try {
        expect(() => readStatus(fixture.path, now)).toThrow('unreadable');
      } finally {
        chmodSync(join(fixture.record, 'label'), 0o600);
      }
    },
  );

for (const field of ['holder', 'label', 'record', 'queue'] as const)
  it('refuses a protocol symlink ' + field, () => {
    const fixture = createFixture();
    writeHolder(fixture, '123\n', 'lane\n');
    const target =
        field === 'record'
          ? fixture.record
          : field === 'queue'
            ? fixture.queue
            : join(fixture.record, field),
      destination = join(fixture.root, 'destination');
    if (field === 'record' || field === 'queue') {
      mkdirSync(destination);
      if (field === 'record') rmSync(target, { recursive: true });
    } else {
      writeFileSync(destination, '123\n');
      rmSync(target);
    }
    symlinkSync(destination, target);
    expect(() => readStatus(fixture.path, now)).toThrow();
  });
for (const field of ['holder', 'label'] as const)
  it('refuses a nonregular label during incomplete publication ' + field, () => {
    const fixture = createFixture();
    mkdirSync(fixture.record);
    mkdirSync(join(fixture.record, field));
    expect(() => readStatus(fixture.path, now)).toThrow('regular file');
  });
it('refuses malformed published UTF8 rather than silently replacing its bytes', () => {
  const fixture = createFixture();
  writeHolder(fixture, '123\n', 'lane\n');
  writeFileSync(join(fixture.record, 'label'), new Uint8Array([0xe2, 0x82]));
  expect(() => readStatus(fixture.path, now)).toThrow('UTF8');
});
for (const pid of ['0', '2147483648'])
  it('refuses a published ticket PID outside the native range ' + pid, () => {
    const fixture = createFixture();
    writeTicket(fixture, '1800000000000000000-' + pid, 'lane', '1800000100');
    expect(() => readStatus(fixture.path, now)).toThrow('PID');
  });
it('preserves the metadata read failure and a close failure after closing the real descriptor', () => {
  const fixture = createFixture();
  writeHolder(fixture, '123\n', 'lane\n');
  const target = join(fixture.record, 'holder'),
    readFault = new Error('read failed'),
    closeFault = new Error('close failed'),
    nativeOpen = filesystem.openSync,
    nativeClose = filesystem.closeSync;
  let descriptor: number | undefined;
  const opening = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    const fd = nativeOpen(path, flags, mode);
    if (path === target) descriptor = fd;
    return fd;
  });
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
    expect(descriptor).toBeDefined();
    throw readFault;
  });
  const closing = spyOn(filesystem, 'closeSync').mockImplementation((fd) => {
    nativeClose(fd);
    if (fd === descriptor) throw closeFault;
  });
  try {
    let failure: unknown;
    try {
      readStatus(fixture.path, now);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    const errors: unknown[] = (failure as AggregateError).errors;
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).cause).toBe(readFault);
    expect(errors[1]).toBe(closeFault);
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    closing.mockRestore();
  }
});
it('propagates a metadata close failure after a successful read', () => {
  const fixture = createFixture();
  writeHolder(fixture, '123\n', 'lane\n');
  const fault = new Error('close failed'),
    nativeClose = filesystem.closeSync;
  const closing = spyOn(filesystem, 'closeSync').mockImplementation((fd) => {
    nativeClose(fd);
    throw fault;
  });
  try {
    expect(() => readStatus(fixture.path, now)).toThrow(fault);
  } finally {
    closing.mockRestore();
  }
});
it('treats a directory disappearing between lstat and readdir as an expected released observation', () => {
  const fixture = createFixture();
  mkdirSync(fixture.queue);
  const nativeRead = filesystem.readdirSync;
  let reached = false;
  // This production path calls readdirSync without options; other overloads are not exercised.
  const reading = spyOn(filesystem, 'readdirSync').mockImplementation(((
    path: filesystem.PathLike,
  ) => {
    if (path === fixture.queue) {
      reached = true;
      rmdirSync(fixture.queue);
    }
    return nativeRead(path);
  }) as typeof filesystem.readdirSync);
  try {
    expect(readStatus(fixture.path, now)).toEqual({ holder: { kind: 'none' }, waiters: [] });
    expect(reached).toBe(true);
  } finally {
    reading.mockRestore();
  }
});

it('refuses an unreadable parent before classifying a directory as absent', () => {
  const fixture = createFixture();
  chmodSync(fixture.root, 0o000);
  try {
    expect(() => readStatus(fixture.path, now)).toThrow('directory is unreadable');
  } finally {
    chmodSync(fixture.root, 0o700);
  }
});

it('refuses a readerless metadata FIFO before opening it can block', async () => {
  const fixture = createFixture();
  mkdirSync(fixture.record);
  const fifo = join(fixture.record, 'holder'),
    made = Bun.spawnSync(['/usr/bin/mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
  expect(made.exitCode, new TextDecoder().decode(made.stderr)).toBe(0);
  const entry = join(fixture.root, 'fifo-reader.ts');
  writeFileSync(
    entry,
    'import{readStatus}from ' +
      JSON.stringify(join(import.meta.dir, 'records.ts')) +
      ';try{readStatus(' +
      JSON.stringify(fixture.path) +
      ',1800000010n);process.exit(2);}catch(cause){if(!(cause instanceof Error)||!cause.message.includes("regular file"))throw cause;process.stdout.write("fifo refused");}',
  );
  const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }),
    timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 750);
  try {
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toBe('fifo refused');
    expect(await new Response(child.stderr).text()).toBe('');
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
  }
});
