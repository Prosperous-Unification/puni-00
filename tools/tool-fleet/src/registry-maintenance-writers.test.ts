import { chmod, mkdir, open, readFile, statfs, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { readRegistryWriters } from './registry-maintenance-writers';
import { completeRegistryOperation } from './registry-operation-completion';
import { requireRejection } from './registry-rejection.fixture';

async function fixture() {
  const directory = await scratchAsync('registry-writer-census-');
  const storage = join(directory, 'storage');
  await mkdir(storage);
  const proc = join(directory, 'proc');
  await mkdir(join(proc, '42/fd'), { recursive: true });
  await mkdir(join(proc, '42/fdinfo'));
  const descriptor = await open(storage, 'r');
  // Use the kernel's descriptor mount ID so this modeled /proc stays truthful on any scratch filesystem.
  const mount = await completeRegistryOperation(
    async () => {
      const information = await readFile('/proc/self/fdinfo/' + String(descriptor.fd), 'utf8');
      const mountId = /^mnt_id:\s+([1-9][0-9]*)$/m.exec(information)?.at(1);
      if (mountId === undefined) throw new Error('Missing fixture storage mount ID');
      const selected = (await readFile('/proc/self/mountinfo', 'utf8'))
        .split('\n')
        .find((line) => line.split(' ')[0] === mountId);
      if (selected === undefined) throw new Error('Missing fixture storage mount');
      return selected;
    },
    () => descriptor.close(),
  );
  await mkdir(join(proc, 'self'));
  await writeFile(join(proc, 'self/mountinfo'), mount + '\n');
  await writeFile(join(proc, '42/mountinfo'), mount + '\n');
  await writeFile(join(proc, '42/maps'), '');
  await symlink('/usr/bin/true', join(proc, '42/exe'));
  const blob = join(storage, 'content');
  await writeFile(blob, 'fixture');
  await symlink(blob, join(proc, '42/fd/5'));
  await writeFile(join(proc, '42/fdinfo/5'), 'flags:\t0100000\n');
  return { directory, storage, proc };
}
test('actual writer census distinguishes read-only descriptor from writable descriptor', async () => {
  const proof = await fixture();
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
  await writeFile(join(proof.proc, '42/fdinfo/5'), 'flags:\t0100002\n');
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([
    { pid: 42, reason: 'writable-descriptor' },
  ]);
});
test('auditor selects the descriptor mount among covered duplicate mountpoints', async () => {
  const proof = await fixture();
  const visible = (await readFile(join(proof.proc, 'self/mountinfo'), 'utf8')).trim().split(' ');
  const covered = [...visible];
  covered[0] = String(BigInt(visible[0]) + 1000000n);
  covered[3] = '/covered';
  visible[5] = 'rw';
  await writeFile(
    join(proof.proc, 'self/mountinfo'),
    [covered.join(' '), visible.join(' ')].join('\n') + '\n',
  );
  await writeFile(join(proof.proc, '42/mountinfo'), visible.join(' ') + '\n');
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
});
for (const fault of [
  'normal',
  'absent',
  'unreadable',
  'missing',
  'malformed',
  'multiline',
  'close',
  'both',
] as const) {
  test(`storage descriptor mount observation and cleanup: ${fault}`, async () => {
    const proof = await fixture();
    // Only this owned subprocess's exact storage descriptor observation/close is faulted;
    // opening, stat, kernel descriptor lifetime and the process census remain real.
    const script = `
      import * as filesystem from 'node:fs/promises';
      import { mock } from 'bun:test';
      const original = { ...filesystem };
      const storage = ${JSON.stringify(proof.storage)};
      const proc = ${JSON.stringify(proof.proc)};
      const fault = ${JSON.stringify(fault)};
      const primary = new Error('owned mount observation failure');
      const closing = new Error('owned mount close failure');
      let descriptor;
      let closed = false;
      let scanned = false;
      await mock.module('node:fs/promises', () => ({
        ...original,
        async open(path, ...arguments_) {
          const opened = await original.open(path, ...arguments_);
          if (path !== storage) return opened;
          descriptor = opened.fd;
          return {
            fd: opened.fd,
            stat: opened.stat.bind(opened),
            async close() {
              await opened.close();
              closed = true;
              if (fault === 'close' || fault === 'both') throw closing;
            },
          };
        },
        async readFile(path, ...arguments_) {
          if (path === '/proc/self/fdinfo/' + String(descriptor)) {
            if (fault === 'both') throw primary;
            if (fault === 'absent' || fault === 'unreadable')
              throw Object.assign(new Error('owned descriptor observation unavailable'), {
                code: fault === 'absent' ? 'ENOENT' : 'EACCES',
              });
            if (fault === 'missing') return 'flags: 0100000';
            if (fault === 'malformed') return 'mnt_id: invalid';
            if (fault === 'multiline')
              return (await original.readFile(path, ...arguments_)).replace(
                'mnt_id:' + String.fromCharCode(9), 'mnt_id:' + String.fromCharCode(10),
              );
          }
          return await original.readFile(path, ...arguments_);
        },
        async readdir(path, ...arguments_) {
          if (path === proc) {
            if (!closed) throw new Error('Census started before storage descriptor close');
            scanned = true;
          }
          return await original.readdir(path, ...arguments_);
        },
      }));
      const { readRegistryWriters } = await import(${JSON.stringify(new URL('./registry-maintenance-writers.ts', import.meta.url).href)});
      const describe = (cause) => cause === primary ? 'observation' : cause === closing ? 'close' :
        cause instanceof Error && 'code' in cause ? cause.code :
        cause instanceof Error && cause.message === 'Missing registry storage descriptor mount ID' ? 'mount-id' :
        String(cause);
      let completion;
      try {
        const writers = await readRegistryWriters(storage, '/fixed/registry', proc);
        completion = { kind: 'completed', writers };
      } catch (cause) {
        completion = {
          kind: 'failed',
          failures: cause instanceof AggregateError ? cause.errors.map(describe) : [describe(cause)],
          rootCause: cause instanceof AggregateError ? describe(cause.cause) : null,
        };
      }
      let descriptorClosed = false;
      try {
        await original.stat('/proc/self/fd/' + String(descriptor));
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
        descriptorClosed = true;
      }
      console.log(JSON.stringify({ completion, scanned, descriptorClosed }));
    `;
    const child = Bun.spawn([process.execPath, '--eval', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    const failures =
      fault === 'both'
        ? ['observation', 'close']
        : fault === 'absent'
          ? ['ENOENT']
          : fault === 'unreadable'
            ? ['EACCES']
            : fault === 'close'
              ? ['close']
              : ['mount-id'];
    expect(JSON.parse(stdout)).toEqual({
      completion:
        fault === 'normal'
          ? { kind: 'completed', writers: [] }
          : {
              kind: 'failed',
              failures,
              rootCause: fault === 'both' ? 'observation' : null,
            },
      scanned: fault === 'normal',
      descriptorClosed: true,
    });
  });
}
for (const fault of [
  'absent',
  'unreadable',
  'malformed-id',
  'missing-id',
  'wrong-path',
  'wrong-device',
] as const) {
  test(`auditor refuses ${fault} storage mount observation`, async () => {
    const proof = await fixture();
    const path = join(proof.proc, 'self/mountinfo');
    if (fault === 'absent') await unlink(path);
    else if (fault === 'unreadable') await chmod(path, 0);
    else {
      const mount = (await readFile(path, 'utf8')).trim().split(' ');
      if (fault === 'malformed-id') mount[0] = 'invalid';
      else if (fault === 'missing-id') mount[0] = String(BigInt(mount[0]) + 1000000n);
      else if (fault === 'wrong-path') mount[4] = '/unrelated-storage';
      else mount[2] = '0:0';
      await writeFile(path, mount.join(' ') + '\n');
    }
    await completeRegistryOperation(
      async () => {
        const refused = await requireRejection(
          readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
        );
        if (fault === 'absent' || fault === 'unreadable')
          expect(refused.cause).toMatchObject({ code: fault === 'absent' ? 'ENOENT' : 'EACCES' });
        else expect(refused.throwCause).toThrow();
      },
      () => (fault === 'unreadable' ? chmod(path, 0o600) : Promise.resolve()),
    );
  });
}
for (const fault of ['absent', 'unreadable'] as const) {
  test(`writer census refuses ${fault} flags for a still-present descriptor`, async () => {
    const proof = await fixture();
    const path = join(proof.proc, '42/fdinfo/5');
    if (fault === 'absent') await unlink(path);
    else await chmod(path, 0);
    const refused = await requireRejection(
      readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
    );
    expect(refused.throwCause).toThrow('process writer census is incomplete');
    if (!(refused.cause instanceof Error))
      throw new Error('Missing descriptor observation failure');
    expect(refused.cause.cause).toMatchObject({ code: fault === 'absent' ? 'ENOENT' : 'EACCES' });
    if (fault === 'unreadable') await chmod(path, 0o600);
  });
}
test('writer census detects writable filesystem alias even without an open content descriptor', async () => {
  const proof = await fixture();
  const mount = (await readFile(join(proof.proc, '42/mountinfo'), 'utf8')).trim().split(' ');
  mount[0] = '900';
  mount[3] = '/contents';
  mount[4] = '/var/lib/registry';
  // Explicit modeled alias capability; ambient sandbox root may be read-only.
  mount[5] = 'rw';
  await writeFile(join(proof.proc, '42/mountinfo'), mount.join(' ') + '\n');
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([
    { pid: 42, reason: 'writable-mount-alias' },
  ]);
});

for (const threads of [2, 1, undefined]) {
  test(`dead leader requires a proven single dead thread group: Threads=${String(threads)}`, async () => {
    const proof = await fixture();
    await unlink(join(proof.proc, '42/exe'));
    await writeFile(
      join(proof.proc, '42/status'),
      `State:\tZ (zombie)\n${threads === undefined ? '' : `Threads:\t${String(threads)}\n`}`,
    );
    await mkdir(join(proof.proc, '42/task/42'), { recursive: true });
    if (threads === 2) await mkdir(join(proof.proc, '42/task/43'));
    if (threads === 1)
      expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
    else
      expect(
        (await requireRejection(readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)))
          .throwCause,
      ).toThrow('writer census is incomplete');
  });
}
test('single-thread zombie count cannot override contradictory task census', async () => {
  const proof = await fixture();
  await unlink(join(proof.proc, '42/exe'));
  await writeFile(join(proof.proc, '42/status'), 'State:\tZ (zombie)\nThreads:\t1\n');
  await mkdir(join(proof.proc, '42/task/43'), { recursive: true });
  expect(
    (await requireRejection(readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)))
      .throwCause,
  ).toThrow('writer census is incomplete');
});

for (const boundary of ['root', 'cwd'] as const) {
  for (const fault of ['absent', 'unreadable'] as const) {
    test(`empty process mount view refuses ${fault} ${boundary} evidence`, async () => {
      const proof = await fixture();
      await writeFile(join(proof.proc, '42/mountinfo'), '');
      await writeFile(join(proof.proc, '42/status'), unprivileged + 'Threads:\t1\n');
      for (const name of ['root', 'cwd']) {
        if (name !== boundary) await symlink(proof.directory, join(proof.proc, '42', name));
      }
      const blocked = join(proof.directory, 'blocked');
      await mkdir(join(blocked, 'target'), { recursive: true });
      if (fault === 'unreadable') {
        await symlink(join(blocked, 'target'), join(proof.proc, '42', boundary));
        await chmod(blocked, 0);
      }
      await completeRegistryOperation(
        async () => {
          const refused = await requireRejection(
            readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
          );
          expect(refused.throwCause).toThrow('writer census is incomplete');
          if (!(refused.cause instanceof Error)) throw new Error('Missing root observation cause');
          expect(refused.cause.cause).toMatchObject({
            code: fault === 'absent' ? 'ENOENT' : 'EACCES',
          });
        },
        () => chmod(blocked, 0o755),
      );
    });
  }
}
test('malformed process mount ID cannot establish writer absence', async () => {
  const proof = await fixture();
  const path = join(proof.proc, '42/mountinfo');
  const mount = (await readFile(path, 'utf8')).trim().split(' ');
  mount[0] = 'invalid';
  await writeFile(path, mount.join(' ') + '\n');
  const refused = await requireRejection(
    readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
  );
  expect(refused.throwCause).toThrow('writer census is incomplete');
  if (!(refused.cause instanceof Error)) throw new Error('Missing malformed process mount cause');
  expect(refused.cause.cause).toMatchObject({ message: 'Incomplete process mount observation' });
});
for (const serialized of ['\n', 'incomplete mount row\n']) {
  test(`malformed nonempty process mount view is never an isolated empty view: ${JSON.stringify(serialized)}`, async () => {
    const proof = await fixture();
    await writeFile(join(proof.proc, '42/mountinfo'), serialized);
    const refused = await requireRejection(
      readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
    );
    expect(refused.throwCause).toThrow('writer census is incomplete');
    if (!(refused.cause instanceof Error)) throw new Error('Missing malformed mount cause');
    expect(refused.cause.cause).toMatchObject({ message: 'Incomplete process mount observation' });
  });
}
test('an empty auditor mount view cannot establish the registry namespace', async () => {
  const proof = await fixture();
  await writeFile(join(proof.proc, 'self/mountinfo'), '');
  expect(
    (await requireRejection(readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)))
      .throwCause,
  ).toThrow('Incomplete process mount observation');
});

const unprivileged =
  'Uid:\t59001\t59001\t59001\t59001\nCapInh:\t0000000000000000\n' +
  'CapPrm:\t0000000000000000\nCapEff:\t0000000000000000\n' +
  'CapBnd:\t000001ffffffffff\nCapAmb:\t0000000000000000\nNoNewPrivs:\t1\n';
async function createIsolatedView() {
  const proof = await fixture();
  // Model a distinct audited device using the real proc mount; native chroot proofs use enforced tmpfs storage.
  await writeFile(
    join(proof.proc, 'self/mountinfo'),
    await readFile('/proc/self/mountinfo', 'utf8'),
  );
  await writeFile(join(proof.proc, '42/mountinfo'), '');
  await symlink(proof.directory, join(proof.proc, '42/root'));
  await symlink(proof.directory, join(proof.proc, '42/cwd'));
  await writeFile(
    join(proof.proc, '42/status'),
    unprivileged + 'State:\tS (sleeping)\nThreads:\t1\n',
  );
  await mkdir(join(proof.proc, '42/task/42'), { recursive: true });
  return { ...proof, storage: '/proc' };
}
test('an isolated empty mount view still requires its complete one-task evidence', async () => {
  const proof = await createIsolatedView();
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
});
for (const fault of ['absent', 'unreadable', 'malformed', 'multiple', 'contradictory'] as const) {
  test(`isolated empty mount view refuses ${fault} task evidence`, async () => {
    const proof = await createIsolatedView();
    const status = join(proof.proc, '42/status');
    if (fault === 'absent') await unlink(status);
    else if (fault === 'unreadable') await chmod(status, 0);
    else if (fault === 'malformed')
      await writeFile(status, unprivileged + 'State:\tS (sleeping)\n');
    else if (fault === 'multiple') await writeFile(status, unprivileged + 'Threads:\t2\n');
    if (fault === 'contradictory') await mkdir(join(proof.proc, '42/task/43'));
    await completeRegistryOperation(
      async () => {
        const refused = await requireRejection(
          readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
        );
        expect(refused.throwCause).toThrow('writer census is incomplete');
        if (!(refused.cause instanceof Error)) throw new Error('Missing task observation cause');
        if (fault === 'absent' || fault === 'unreadable')
          expect(refused.cause.cause).toMatchObject({
            code: fault === 'absent' ? 'ENOENT' : 'EACCES',
          });
        else
          expect(refused.cause.cause).toMatchObject({
            message: 'Empty process mount visibility requires one observed thread',
          });
      },
      () => (fault === 'unreadable' ? chmod(status, 0o600) : Promise.resolve()),
    );
  });
}

for (const boundary of ['root', 'cwd'] as const) {
  for (const fault of [
    'normal',
    'alias',
    'absent-id',
    'unreadable-id',
    'missing-id',
    'malformed-id',
    'multiline-id',
    'open',
    'stat',
    'close',
    'both-close',
    'read-and-close',
    'read-and-both-close',
    'stat-and-both-close',
    'second-open-and-close',
  ] as const) {
    test(`empty view holds kernel path identities and closes observations: ${boundary}/${fault}`, async () => {
      const proof = await createIsolatedView();
      // The modeled boundary changes only owned root/cwd fdinfo or resource failures.
      // Real opens, inode observations, descriptor lifetime and subsequent census remain active.
      const script = `
        import * as filesystem from 'node:fs/promises';
        import { mock } from 'bun:test';
        const original = { ...filesystem };
        const proc = ${JSON.stringify(proof.proc)};
        const boundary = ${JSON.stringify(boundary)};
        const fault = ${JSON.stringify(fault)};
        const observations = new Map();
        const failures = new Map();
        let scanned = false;
        const failure = (name) => {
          const cause = new Error(name);
          failures.set(cause, name);
          return cause;
        };
        await mock.module('node:fs/promises', () => ({
          ...original,
          async open(path, ...arguments_) {
            const name = path === proc + '/42/root' ? 'root' :
              path === proc + '/42/cwd' ? 'cwd' : undefined;
            if ((name === boundary && fault === 'open') ||
                (name === 'cwd' && fault === 'second-open-and-close')) throw failure(name + '-open');
            const opened = await original.open(path, ...arguments_);
            if (name === undefined) return opened;
            observations.set(name, { fd: opened.fd, closed: 0 });
            return {
              fd: opened.fd,
              async stat(...arguments_) {
                if (name === boundary && (fault === 'stat' || fault === 'stat-and-both-close'))
                  throw failure(name + '-stat');
                return await opened.stat(...arguments_);
              },
              async close() {
                await Bun.sleep(name === 'cwd' ? 30 : 10);
                await opened.close();
                observations.get(name).closed++;
                if (fault === 'both-close' || fault === 'read-and-both-close' ||
                    fault === 'stat-and-both-close' ||
                    (name === 'root' && fault === 'second-open-and-close') ||
                    (name === boundary && (fault === 'close' || fault === 'read-and-close')))
                  throw failure(name + '-close');
              },
            };
          },
          async readFile(path, ...arguments_) {
            const name = [...observations].find(([, observation]) =>
              path === '/proc/self/fdinfo/' + String(observation.fd))?.[0];
            if (name !== undefined) {
              if (observations.size !== 2) throw new Error('Path observation did not hold both descriptors');
              for (const observation of observations.values())
                await original.stat('/proc/self/fd/' + String(observation.fd));
              if (name === boundary) {
                if (fault === 'absent-id' || fault === 'unreadable-id')
                  throw Object.assign(failure(name + '-read'), {
                    code: fault === 'absent-id' ? 'ENOENT' : 'EACCES',
                  });
                if (fault === 'read-and-close' || fault === 'read-and-both-close') throw failure(name + '-read');
                if (fault === 'missing-id') return 'flags: 0100000';
                if (fault === 'malformed-id') return 'mnt_id: invalid';
                const information = await original.readFile(path, ...arguments_);
                if (fault === 'multiline-id')
                  return information.replace('mnt_id:' + String.fromCharCode(9),
                    'mnt_id:' + String.fromCharCode(10));
                if (fault === 'alias')
                  return information.replace(/(mnt_id:[ \\t]+)([1-9][0-9]*)/,
                    (_, prefix, id) => prefix + String(BigInt(id) + 1000000n));
                return information;
              }
            }
            return await original.readFile(path, ...arguments_);
          },
          async readdir(path, ...arguments_) {
            if (path === proc + '/42/fd') {
              for (const observation of observations.values()) {
                if (observation.closed !== 1) throw new Error('Path observation not closed before census');
                try {
                  await original.stat('/proc/self/fd/' + String(observation.fd));
                  throw new Error('Path descriptor remains open at census');
                } catch (cause) {
                  if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
                }
              }
              scanned = true;
            }
            return await original.readdir(path, ...arguments_);
          },
        }));
        const { readRegistryWriters } = await import(${JSON.stringify(new URL('./registry-maintenance-writers.ts', import.meta.url).href)});
        const describe = (cause) => {
          if (failures.has(cause)) return failures.get(cause);
          if (cause instanceof AggregateError)
            return { failures: cause.errors.map(describe), cause: describe(cause.cause) };
          if (cause instanceof Error && cause.message === 'Registry process writer census is incomplete')
            return describe(cause.cause);
          if (cause instanceof Error && cause.message === 'Missing empty-view descriptor mount ID') return 'mount-id';
          if (cause instanceof Error && cause.message === 'Empty process mount visibility retains unverified filesystem reachability')
            return 'reachability';
          return String(cause);
        };
        let completion;
        try {
          completion = { writers: await readRegistryWriters('/proc', '/fixed/registry', proc) };
        } catch (cause) {
          completion = { refused: describe(cause) };
        }
        const closed = [];
        for (const [name, observation] of observations) {
          let absent = false;
          try { await original.stat('/proc/self/fd/' + String(observation.fd)); }
          catch (cause) {
            if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
            absent = true;
          }
          closed.push({ name, count: observation.closed, absent });
        }
        console.log(JSON.stringify({ completion, scanned, closed }));
      `;
      const child = Bun.spawn([process.execPath, '--eval', script], {
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(10000),
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      const refused =
        fault === 'alias'
          ? 'reachability'
          : ['missing-id', 'malformed-id', 'multiline-id'].includes(fault)
            ? 'mount-id'
            : fault === 'read-and-both-close' || fault === 'stat-and-both-close'
              ? {
                  failures: [
                    {
                      failures: [
                        `${boundary}-${fault === 'stat-and-both-close' ? 'stat' : 'read'}`,
                        'cwd-close',
                      ],
                      cause: `${boundary}-${fault === 'stat-and-both-close' ? 'stat' : 'read'}`,
                    },
                    'root-close',
                  ],
                  cause: {
                    failures: [
                      `${boundary}-${fault === 'stat-and-both-close' ? 'stat' : 'read'}`,
                      'cwd-close',
                    ],
                    cause: `${boundary}-${fault === 'stat-and-both-close' ? 'stat' : 'read'}`,
                  },
                }
              : fault === 'second-open-and-close'
                ? { failures: ['cwd-open', 'root-close'], cause: 'cwd-open' }
                : fault === 'both-close'
                  ? { failures: ['cwd-close', 'root-close'], cause: 'cwd-close' }
                  : fault === 'read-and-close'
                    ? {
                        failures: [`${boundary}-read`, `${boundary}-close`],
                        cause: `${boundary}-read`,
                      }
                    : `${boundary}-${fault === 'absent-id' || fault === 'unreadable-id' ? 'read' : fault}`;
      expect(JSON.parse(stdout)).toEqual({
        completion: fault === 'normal' ? { writers: [] } : { refused },
        scanned: fault === 'normal',
        closed:
          fault === 'second-open-and-close'
            ? [{ name: 'root', count: 1, absent: true }]
            : fault === 'open'
              ? boundary === 'root'
                ? []
                : [{ name: 'root', count: 1, absent: true }]
              : [
                  { name: 'root', count: 1, absent: true },
                  { name: 'cwd', count: 1, absent: true },
                ],
      });
    });
  }
}

type RetainedDescriptor =
  'namespace' | 'pidfd' | 'eventfd' | 'regular' | 'pipe' | 'fifo' | 'socket';
async function withRetainedDescriptor(
  kind: RetainedDescriptor,
  directory: string,
  operate: (path: string) => Promise<void>,
) {
  const script = `
import os, socket, sys
kind, directory = sys.argv[1:]
if kind == 'namespace':
    descriptor = os.open('/proc/self/ns/user', os.O_RDONLY)
elif kind == 'pidfd':
    descriptor = os.pidfd_open(os.getpid())
elif kind == 'eventfd':
    descriptor = os.eventfd(0, os.EFD_CLOEXEC)
elif kind == 'regular':
    descriptor = os.open(directory + '/storage/content', os.O_RDONLY)
elif kind == 'pipe':
    descriptor, writer = os.pipe()
elif kind == 'fifo':
    path = directory + '/retained.fifo'
    os.mkfifo(path)
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
elif kind == 'socket':
    connection, peer = socket.socketpair()
    descriptor = connection.fileno()
else:
    raise RuntimeError('Unknown retained descriptor')
print('/proc/' + str(os.getpid()) + '/fd/' + str(descriptor), flush=True)
sys.stdin.readline()
`;
  const child = Bun.spawn(['python', '-c', script, kind, directory], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    signal: AbortSignal.timeout(10000),
  });
  const diagnostics = new Response(child.stderr).text();
  await completeRegistryOperation(
    async () => {
      const reader = child.stdout.getReader();
      const path = await completeRegistryOperation(
        async () => {
          let frame = '';
          while (!frame.includes('\n')) {
            const next = await reader.read();
            if (next.done) throw new Error('Retained descriptor producer exited before readiness');
            frame += new TextDecoder().decode(next.value);
          }
          if (!/^\/proc\/[1-9][0-9]*\/fd\/[0-9]+\n$/.test(frame))
            throw new Error('Malformed retained descriptor readiness');
          return frame.trim();
        },
        () => {
          reader.releaseLock();
          return Promise.resolve();
        },
      );
      await operate(path);
    },
    async () => {
      await child.stdin.end();
      const [code, stderr] = await Promise.all([child.exited, diagnostics]);
      if (code !== 0 || stderr !== '')
        throw new Error(`Retained descriptor producer failed (${String(code)}): ${stderr}`);
    },
  );
}
for (const [kind, filesystems] of [
  ['namespace', [0x6e736673n]],
  ['pidfd', [0x09041934n, 0x50494446n]],
  ['eventfd', [0x09041934n]],
] as const) {
  test(`empty view refuses actual retained ${kind} filesystem authority`, async () => {
    const proof = await createIsolatedView();
    await withRetainedDescriptor(kind, proof.directory, async (path) => {
      expect<readonly bigint[]>(filesystems).toContain((await statfs(path, { bigint: true })).type);
      await symlink(path, join(proof.proc, '42/fd/6'));
      const refused = await requireRejection(
        readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
      );
      expect(refused.throwCause).toThrow('writer census is incomplete');
      if (!(refused.cause instanceof Error)) throw new Error('Missing retained authority cause');
      expect(refused.cause.cause).toMatchObject({
        message: 'Empty process mount visibility retains opaque descriptor authority',
      });
    });
  });
  test(`nonempty view preserves actual retained ${kind} descriptor handling`, async () => {
    const proof = await createIsolatedView();
    await writeFile(
      join(proof.proc, '42/mountinfo'),
      await readFile(join(proof.proc, 'self/mountinfo'), 'utf8'),
    );
    await withRetainedDescriptor(kind, proof.directory, async (path) => {
      await symlink(path, join(proof.proc, '42/fd/6'));
      expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
    });
  });
}
for (const kind of ['regular', 'pipe', 'fifo', 'socket'] as const) {
  test(`empty view preserves actual harmless ${kind} descriptor`, async () => {
    const proof = await createIsolatedView();
    await withRetainedDescriptor(kind, proof.directory, async (path) => {
      await symlink(path, join(proof.proc, '42/fd/6'));
      expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
    });
  });
}

for (const fault of [
  'absent',
  'unreadable',
  'missing-type',
  'number-type',
  'zero-type',
  'negative-type',
  'overflow-type',
  'absent-observation',
  'null-observation',
  'disappeared',
  'unreadable-after-disappearance',
  'unreadable-confirmation',
] as const) {
  test(`empty view refuses unverified descriptor classification: ${fault}`, async () => {
    const proof = await createIsolatedView();
    const script = `
      import * as filesystem from 'node:fs/promises';
      import { mock } from 'bun:test';
      const original = { ...filesystem };
      const proc = ${JSON.stringify(proof.proc)};
      const fault = ${JSON.stringify(fault)};
      const path = proc + '/42/fd/5';
      let confirming = false;
      await mock.module('node:fs/promises', () => ({
        ...original,
        async statfs(observed, ...arguments_) {
          if (observed !== path) return await original.statfs(observed, ...arguments_);
          if (fault === 'disappeared' || fault === 'unreadable-after-disappearance')
            await original.unlink(path);
          if (['absent', 'unreadable', 'disappeared', 'unreadable-after-disappearance', 'unreadable-confirmation'].includes(fault)) {
            confirming = true;
            throw Object.assign(new Error('Modeled descriptor classification unavailable'), {
              code: fault === 'unreadable' || fault === 'unreadable-after-disappearance' ? 'EACCES' : 'ENOENT',
            });
          }
          if (fault === 'absent-observation') return undefined;
          if (fault === 'null-observation') return null;
          const observation = await original.statfs(observed, ...arguments_);
          if (fault === 'missing-type') delete observation.type;
          if (fault === 'number-type') observation.type = 1;
          if (fault === 'zero-type') observation.type = 0n;
          if (fault === 'negative-type') observation.type = -1n;
          if (fault === 'overflow-type') observation.type = 0x100000000n;
          return observation;
        },
        async lstat(observed, ...arguments_) {
          if (observed === path && confirming && fault === 'unreadable-confirmation')
            throw Object.assign(new Error('Modeled descriptor existence unreadable'), { code: 'EACCES' });
          return await original.lstat(observed, ...arguments_);
        },
      }));
      const { readRegistryWriters } = await import(${JSON.stringify(new URL('./registry-maintenance-writers.ts', import.meta.url).href)});
      let completion;
      try {
        completion = { writers: await readRegistryWriters('/proc', '/fixed/registry', proc) };
      } catch (cause) {
        const observation = cause instanceof Error ? cause.cause : cause;
        completion = { refused: observation instanceof Error && 'code' in observation ? observation.code :
          observation instanceof TypeError ? 'type-error' : observation instanceof Error ? observation.message : String(observation) };
      }
      console.log(JSON.stringify(completion));
    `;
    const child = Bun.spawn([process.execPath, '--eval', script], {
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(10000),
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(
      fault === 'disappeared'
        ? { writers: [] }
        : {
            refused:
              fault === 'absent'
                ? 'ENOENT'
                : fault === 'unreadable' ||
                    fault === 'unreadable-after-disappearance' ||
                    fault === 'unreadable-confirmation'
                  ? 'EACCES'
                  : fault === 'absent-observation' || fault === 'null-observation'
                    ? 'type-error'
                    : 'Incomplete process descriptor filesystem observation',
          },
    );
  });
}
