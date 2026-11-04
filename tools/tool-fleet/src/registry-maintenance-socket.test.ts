import { closeSync, openSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { createMaintenanceSocketPair } from './registry-maintenance-socket';
import { requireRejection } from './registry-rejection.fixture';

// These exercise Linux ancillary descriptors and current kernel credentials locally; sudo/root authentication is a separate namespace proof.
test('socketpair carries bounded packets with current kernel credentials and exactly the sent descriptor', async () => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) throw new Error('Native Linux identity required');
  const pair = createMaintenanceSocketPair();
  const directory = await mkdtemp('/tmp/task8-socket-');
  const descriptor = openSync(directory + '/owned', 'wx+', 0o600);
  try {
    await pair.parent.send(Buffer.from('owned packet'), [descriptor]);
    const packet = await pair.helper.receive(AbortSignal.timeout(1000));
    if (packet === null) throw new Error('Missing native packet');
    try {
      expect(packet.bytes.toString()).toBe('owned packet');
      expect(packet.credentials).toEqual({ pid: process.pid, uid, gid });
      expect(packet.descriptors).toHaveLength(1);
      expect(
        await readFile(`/proc/self/fdinfo/${String(packet.descriptors[0])}`, 'utf8'),
      ).toContain('flags:');
    } finally {
      for (const received of packet.descriptors) closeSync(received);
    }
    pair.parent.close();
    expect(await pair.helper.receive(AbortSignal.timeout(1000))).toBeNull();
  } finally {
    pair.parent.close();
    pair.helper.close();
    closeSync(descriptor);
    await rm(directory, { recursive: true });
  }
});

test('ancillary truncation refuses and closes every descriptor delivered by the kernel', async () => {
  const pair = createMaintenanceSocketPair();
  const descriptor = openSync('/dev/null', 'r');
  try {
    const before = (await readdir('/proc/self/fd')).length;
    await pair.parent.send(
      Buffer.from('oversized rights'),
      Array.from({ length: 200 }, () => descriptor),
    );
    expect(
      (await requireRejection(pair.helper.receive(AbortSignal.timeout(1000)))).throwCause,
    ).toThrow();
    expect((await readdir('/proc/self/fd')).length).toBe(before);
  } finally {
    pair.parent.close();
    pair.helper.close();
    closeSync(descriptor);
  }
});

test('packet overflow and blocked receive refuse within the independent deadline', async () => {
  const pair = createMaintenanceSocketPair();
  try {
    expect((await requireRejection(pair.parent.send(Buffer.alloc(32769)))).throwCause).toThrow();
    expect(
      (await requireRejection(pair.helper.receive(AbortSignal.timeout(30)))).throwCause,
    ).toThrow();
  } finally {
    pair.parent.close();
    pair.helper.close();
  }
});

test('queued SCM_RIGHTS keeps the same existing flock after the original descriptor closes', async () => {
  const { dlopen } = await import('bun:ffi');
  const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
  const directory = await mkdtemp('/tmp/task8-socket-lock-');
  const original = openSync(directory + '/authority.lock', 'wx+', 0o600);
  const contender = openSync(directory + '/authority.lock', 'r+');
  const pair = createMaintenanceSocketPair();
  let originalClosed = false;
  try {
    expect(native.symbols.flock(original, 2 | 4)).toBe(0);
    await pair.parent.send(Buffer.from('same description'), [original]);
    closeSync(original);
    originalClosed = true;
    expect(native.symbols.flock(contender, 2 | 4)).toBe(-1);
    const packet = await pair.helper.receive(AbortSignal.timeout(1000));
    if (packet?.descriptors.length !== 1) throw new Error('Missing transferred lock');
    try {
      expect(native.symbols.flock(contender, 2 | 4)).toBe(-1);
      const info = await readFile(`/proc/self/fdinfo/${String(packet.descriptors[0])}`, 'utf8');
      expect(info).toContain('FLOCK  ADVISORY  WRITE');
      const flags = /^flags:\s+(\d+)$/m.exec(info);
      if (flags === null) throw new Error('Missing transferred descriptor flags');
      expect(parseInt(flags[1], 8) & 0o2000000).toBe(0o2000000);
    } finally {
      closeSync(packet.descriptors[0]);
    }
    expect(native.symbols.flock(contender, 2 | 4)).toBe(0);
  } finally {
    if (!originalClosed) closeSync(original);
    closeSync(contender);
    pair.parent.close();
    pair.helper.close();
    native.close();
    await rm(directory, { recursive: true });
  }
});
