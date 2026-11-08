import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readSync,
  renameSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

type Fault =
  | 'none'
  | 'absent'
  | 'unreadable'
  | 'mode'
  | 'uid'
  | 'gid'
  | 'hardlink'
  | 'symlink'
  | 'oversized'
  | 'malformed'
  | 'operation'
  | 'snapshot'
  | 'unknown'
  | 'consumed-malformed'
  | 'write-noop'
  | 'write-fails'
  | 'sync-fails'
  | 'source'
  | 'target'
  | 'journal-source'
  | 'journal-target'
  | 'read-close'
  | 'write-close'
  | 'caller-uid'
  | 'caller-gid'
  | 'directory'
  | 'read-replaced'
  | 'consumed-group'
  | 'consumed-member'
  | 'write-replaced'
  | 'write-changed'
  | 'write-count'
  | 'write-other'
  | 'padded';
/** Actual state helper over real owned file descriptors; fixed-path routing, root process/UID/GID metadata and injected I/O outcomes are modeled. Hardlinks, symlinks, replacements and descriptor operations are real. */
async function createFixture(fault: Fault = 'none', consumed = false) {
  const directory = await mkdtemp(join(tmpdir(), 'registry-restore-fault-'));
  const path = join(directory, 'state.json');
  const expected = {
    operationId: 'restore-operation',
    snapshotId: 'a'.repeat(64),
    registryPath: '/var/lib/puni-registry/registry/contents',
    journalPath: '/var/lib/puni-registry/journal/contents',
    targetRegistryPath: '/var/lib/puni-registry/recovery/registry/contents',
    targetJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
  };
  const terminal = {
    worker: 42,
    pid: 73,
    startTicks: '1234',
    group: 42,
    exitCode: 137,
    signal: 'SIGKILL',
  };
  const record = {
    ...expected,
    state: consumed ? 'consumed' : 'armed',
    ...(consumed ? { terminal } : {}),
  };
  const admitted = {
    ...expected,
    ...(fault === 'source' ? { registryPath: '/different-source' } : {}),
    ...(fault === 'target' ? { targetRegistryPath: '/different-target' } : {}),
    ...(fault === 'journal-source' ? { journalPath: '/different-journal-source' } : {}),
    ...(fault === 'journal-target' ? { targetJournalPath: '/different-journal-target' } : {}),
  };
  const serialized =
    fault === 'malformed'
      ? '{'
      : JSON.stringify({
          ...record,
          ...(fault === 'consumed-group'
            ? { state: 'consumed', terminal: { ...terminal, group: 73 } }
            : {}),
          ...(fault === 'consumed-member'
            ? { state: 'consumed', terminal: { ...terminal, pid: 42 } }
            : {}),
          ...(fault === 'operation' ? { operationId: 'another-operation' } : {}),
          ...(fault === 'snapshot' ? { snapshotId: 'b'.repeat(64) } : {}),
          ...(fault === 'unknown' ? { state: 'unknown' } : {}),
          ...(fault === 'consumed-malformed' ? { state: 'consumed', terminal: null } : {}),
        }).padEnd(fault === 'oversized' ? 4097 : fault === 'padded' ? 2048 : 0, ' ');
  if (fault !== 'absent') await writeFile(path, serialized, { mode: 0o600 });
  if (fault === 'directory') {
    await rm(path);
    await mkdir(path);
  }
  if (fault === 'hardlink') await link(path, path + '.linked');
  if (fault === 'mode') await chmod(path, 0o644);
  if (fault === 'symlink') {
    await writeFile(path + '.real', serialized, { mode: 0o600 });
    await rm(path);
    await symlink(path + '.real', path);
  }
  const source = await readFile(
    new URL('./registry-restore-interruption.fixture.ts', import.meta.url),
    'utf8',
  );
  const transpiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    source.replace(/^import[\s\S]*?;\n/gm, '').replace(/export /g, '') +
      '\nreturn { inspectRegistryRestoreFault, consumeRegistryRestoreFault };',
  );
  const fixed = '/root/task8-fixture/restore-interruption.json';
  const route = (candidate: string) => {
    if (candidate !== fixed) throw new Error('Unexpected fixture path');
    return path;
  };
  const metadata = (status: ReturnType<typeof fstatSync>) =>
    Object.assign(status, {
      uid: fault === 'uid' ? 59001 : 0,
      gid: fault === 'gid' ? 59001 : 0,
    });
  const ioFailure = new Error('Modeled original descriptor I/O failure');
  const closeFailure = new Error('Modeled descriptor close failure');
  let writeAttempted = false;
  let writingDescriptor: number | undefined;
  let readReplaced = false;
  const descriptors = new Set<number>();
  let opens = 0;
  let closes = 0;
  interface StatePorts {
    inspectRegistryRestoreFault: (lineage: typeof expected) => {
      state: string;
      operationId: string;
      snapshotId: string;
      dev: number;
      ino: number;
      serialized: string;
      terminal?: typeof terminal;
    };
    consumeRegistryRestoreFault: (
      lineage: typeof expected,
      before: unknown,
      observed: typeof terminal,
    ) => void;
  }
  // Boundary: this exact local fixture body receives only controlled ports; no untrusted source is evaluated.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const compile = new Function(
    'constants',
    'closeSync',
    'fstatSync',
    'fsyncSync',
    'ftruncateSync',
    'lstatSync',
    'openSync',
    'readSync',
    'writeSync',
    'type',
    'process',
    transpiled,
  ) as (...ports: unknown[]) => StatePorts;
  const inspect = compile(
    constants,
    (fd: number) => {
      closes++;
      closeSync(fd);
      descriptors.delete(fd);
      if (fault === 'read-close' || (fault === 'write-close' && writeAttempted)) throw closeFailure;
    },
    (fd: number) => metadata(fstatSync(fd)),
    (fd: number) => {
      if (fault === 'sync-fails') throw new Error('Modeled sync failure');
      fsyncSync(fd);
    },
    ftruncateSync,
    (candidate: string) => metadata(lstatSync(route(candidate))),
    (candidate: string, flags: number) => {
      if (fault === 'unreadable')
        throw Object.assign(new Error('Private read denied'), { code: 'EACCES' });
      if (fault === 'write-replaced' && (flags & constants.O_RDWR) !== 0) {
        renameSync(path, path + '.old');
        writeFileSync(path, serialized, { mode: 0o600 });
      }
      const fd = openSync(route(candidate), flags);
      if ((flags & constants.O_RDWR) !== 0) writingDescriptor = fd;
      opens++;
      descriptors.add(fd);
      return fd;
    },
    (fd: number, bytes: Uint8Array, offset: number, length: number, position: number | null) => {
      if (fault === 'read-close') throw ioFailure;
      if (fault === 'read-replaced' && !readReplaced) {
        readReplaced = true;
        renameSync(path, path + '.old');
        writeFileSync(path, serialized, { mode: 0o600 });
      }
      if (fault === 'write-changed' && fd === writingDescriptor)
        writeFileSync(path, serialized.replace('restore-operation', 'foreign-operation'));
      return readSync(fd, bytes, offset, length, position);
    },
    (fd: number, bytes: Uint8Array, offset: number, length: number, position: number) => {
      writeAttempted = true;
      if (fault === 'write-close') throw ioFailure;
      if (fault === 'write-fails') throw new Error('Modeled write failure');
      if (fault === 'write-noop') return length;
      if (fault === 'write-other') {
        const changed = Buffer.from(
          Buffer.from(bytes).toString('utf8').replace('"pid":73', '"pid":74'),
        );
        return writeSync(fd, changed, offset, length, position);
      }
      if (fault === 'write-count') {
        writeSync(fd, bytes, offset, length, position);
        return 0;
      }
      return writeSync(fd, bytes, offset, length, position);
    },
    type,
    {
      pid: consumed ? 99 : 42,
      getuid: () => (fault === 'caller-uid' ? 59001 : 0),
      getgid: () => (fault === 'caller-gid' ? 59001 : 0),
    },
  );
  return {
    expected,
    terminal,
    serialized,
    path,
    ioFailure,
    closeFailure,
    inspect: () => inspect.inspectRegistryRestoreFault(admitted),
    consume: (before: unknown, observed = terminal) => {
      inspect.consumeRegistryRestoreFault(admitted, before, observed);
    },
    counts: () => ({ opens, closes }),
    close: async () => {
      // Independent owned-descriptor rescue also runs when a removed close check fails its assertion.
      for (const descriptor of descriptors) closeSync(descriptor);
      descriptors.clear();
      await rm(directory, { recursive: true });
    },
  };
}

test('reads armed and historical consumed state from exact owned files', async () => {
  for (const consumed of [false, true]) {
    const proof = await createFixture('none', consumed);
    try {
      const state = proof.inspect();
      expect(state.state).toBe(consumed ? 'consumed' : 'armed');
      expect(state.operationId).toBe('restore-operation');
      expect(state.snapshotId).toBe('a'.repeat(64));
      expect(state.serialized).toBe(proof.serialized);
      expect(state.ino).toBe(lstatSync(proof.path).ino);
      if (consumed) expect(state.terminal).toEqual(proof.terminal);
      expect(proof.counts()).toEqual({ opens: 1, closes: 1 });
    } finally {
      await proof.close();
    }
  }
});

for (const fault of [
  'absent',
  'unreadable',
  'mode',
  'uid',
  'gid',
  'hardlink',
  'symlink',
  'oversized',
  'malformed',
  'operation',
  'snapshot',
  'unknown',
  'consumed-malformed',
  'source',
  'target',
  'journal-source',
  'journal-target',
] as const)
  test('refuses one-shot state ' + fault, async () => {
    const proof = await createFixture(fault);
    try {
      expect(() => proof.inspect()).toThrow();
      expect(proof.counts().closes).toBe(proof.counts().opens);
    } finally {
      await proof.close();
    }
  });

test('consumes one armed record after a killed member and reads historical lineage on retry', async () => {
  const proof = await createFixture();
  try {
    const before = proof.inspect();
    proof.consume(before);
    const after = proof.inspect();
    expect(after.state).toBe('consumed');
    expect(after.terminal).toEqual({
      worker: 42,
      pid: 73,
      startTicks: '1234',
      group: 42,
      exitCode: 137,
      signal: 'SIGKILL',
    });
    expect(after.ino).toBe(before.ino);
    expect(lstatSync(proof.path).mode & 0o7777).toBe(0o600);
    expect(() => {
      proof.consume(before);
    }).toThrow();
    expect(proof.counts().opens).toBe(proof.counts().closes);
  } finally {
    await proof.close();
  }
});

for (const fault of ['worker', 'pid', 'group', 'start', 'exit', 'signal'] as const)
  test('does not consume state for invalid terminal ' + fault, async () => {
    const proof = await createFixture();
    try {
      const before = proof.inspect();
      const terminal = {
        ...proof.terminal,
        ...(fault === 'worker' ? { worker: 99 } : {}),
        ...(fault === 'pid' ? { pid: 42 } : {}),
        ...(fault === 'group' ? { group: 73 } : {}),
        ...(fault === 'start' ? { startTicks: '0' } : {}),
        ...(fault === 'exit' ? { exitCode: 0 } : {}),
        ...(fault === 'signal' ? { signal: 'SIGTERM' } : {}),
      };
      expect(() => {
        proof.consume(before, terminal);
      }).toThrow();
      expect(await readFile(proof.path, 'utf8')).toBe(proof.serialized);
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });

for (const fault of ['replaced', 'changed'] as const)
  test('does not consume ' + fault + ' state after inspection', async () => {
    const proof = await createFixture();
    try {
      const before = proof.inspect();
      if (fault === 'replaced') {
        await rename(proof.path, proof.path + '.previous');
        await writeFile(proof.path, proof.serialized, { mode: 0o600 });
      } else await writeFile(proof.path, proof.serialized + '\n');
      expect(() => {
        proof.consume(before);
      }).toThrow();
      expect(proof.inspect().state).toBe('armed');
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });

for (const fault of ['write-noop', 'write-fails', 'sync-fails'] as const)
  test('does not claim consumed state when ' + fault, async () => {
    const proof = await createFixture(fault);
    try {
      const before = proof.inspect();
      expect(() => {
        proof.consume(before);
      }).toThrow();
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });

for (const fault of ['read-close', 'write-close'] as const)
  test('preserves original I/O failure alongside close failure ' + fault, async () => {
    const proof = await createFixture(fault);
    try {
      let cause: unknown;
      try {
        const before = proof.inspect();
        if (fault === 'write-close') proof.consume(before);
      } catch (failure) {
        cause = failure;
      }
      expect(cause).toBeInstanceOf(AggregateError);
      if (!(cause instanceof AggregateError))
        throw new Error('Expected original I/O and close failures');
      expect(cause.cause).toBe(proof.ioFailure);
      expect(cause.errors).toEqual([proof.ioFailure, proof.closeFailure]);
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });

for (const fault of ['caller-uid', 'caller-gid'] as const)
  test('refuses ' + fault + ' before opening trusted state', async () => {
    const proof = await createFixture(fault);
    try {
      expect(() => proof.inspect()).toThrow();
      expect(proof.counts()).toEqual({ opens: 0, closes: 0 });
    } finally {
      await proof.close();
    }
  });
for (const fault of ['directory', 'read-replaced', 'consumed-group', 'consumed-member'] as const)
  test('refuses state boundary ' + fault, async () => {
    const proof = await createFixture(fault);
    try {
      expect(() => proof.inspect()).toThrow();
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });
for (const fault of ['write-replaced', 'write-changed'] as const)
  test('does not overwrite substituted armed state ' + fault, async () => {
    const proof = await createFixture(fault);
    try {
      const before = proof.inspect();
      let cause: unknown;
      try {
        proof.consume(before);
      } catch (failure) {
        cause = failure;
      }
      const persisted: unknown = JSON.parse(await readFile(proof.path, 'utf8'));
      expect(persisted).toMatchObject({ state: 'armed' });
      expect(cause).toBeInstanceOf(Error);
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });
for (const fault of ['write-count', 'write-other'] as const)
  test('requires exact consumption I/O outcome ' + fault, async () => {
    const proof = await createFixture(fault);
    try {
      const before = proof.inspect();
      expect(() => {
        proof.consume(before);
      }).toThrow();
      expect(proof.counts().opens).toBe(proof.counts().closes);
    } finally {
      await proof.close();
    }
  });

test('does not open a symlink target before refusing state', async () => {
  const proof = await createFixture('symlink');
  try {
    let cause: unknown;
    try {
      proof.inspect();
    } catch (failure) {
      cause = failure;
    }
    expect(proof.counts().opens).toBe(0);
    expect(cause).toBeInstanceOf(Error);
  } finally {
    await proof.close();
  }
});

test('consumes a padded valid armed record without stale trailing bytes', async () => {
  const proof = await createFixture('padded');
  try {
    proof.consume(proof.inspect());
    const after = proof.inspect();
    expect(after.state).toBe('consumed');
    expect(after.serialized.length).toBeLessThan(2048);
    expect(proof.counts().opens).toBe(proof.counts().closes);
  } finally {
    await proof.close();
  }
});
