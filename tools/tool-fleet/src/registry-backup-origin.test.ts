import { expect, test } from 'bun:test';

import { prepareRegistryBackupAttempt } from './registry-backup-attempt';
import { proveRegistryBackupOriginStopped } from './registry-backup-origin';
const attempt = prepareRegistryBackupAttempt({
  operationId: 'owned',
  token: '11111111-1111-4111-8111-111111111111',
  action: 'backup-snapshot',
  configurationSha256: 'a'.repeat(64),
  registryId: 'registry',
  journalRevision: 7,
  now: '2026-10-26T00:00:00.000Z',
  guardian: {
    pid: 42,
    startTicks: '100',
    pidNamespace: 'pid:[4026531836]',
    machineId: 'b'.repeat(32),
    bootId: '22222222-2222-4222-8222-222222222222',
  },
});
function createOriginFiles() {
  return new Map([
    ['/etc/machine-id', attempt.guardian.machineId + '\n'],
    ['/proc/sys/kernel/random/boot_id', attempt.guardian.bootId + '\n'],
    ['/proc/self/ns/pid', attempt.guardian.pidNamespace],
    ['/proc/self', String(process.pid)],
  ]);
}
test('only the exact absent guardian and lock process in the same boot/namespace/proc view prove stopped', async () => {
  const observations = createOriginFiles();
  await proveRegistryBackupOriginStopped(attempt, 43, (path) =>
    Promise.resolve().then(() => {
      const text = observations.get(path);
      if (text !== undefined) return text;
      throw Object.assign(new Error('missing process'), { code: 'ENOENT' });
    }),
  );
});
for (const fault of [
  'remote',
  'boot',
  'namespace',
  'ancestor-proc',
  'live-guardian',
  'live-lock',
  'unreadable-guardian',
  'unreadable-lock',
  'missing-machine',
  'malformed-boot',
  'pid-race',
  'origin-race',
] as const) {
  test(`local death proof refuses ${fault}`, async () => {
    const observations = createOriginFiles();
    let epochs = 0;
    const read = (path: string) =>
      Promise.resolve().then(() => {
        if (path === '/etc/machine-id') epochs++;
        if (fault === 'remote') observations.set('/etc/machine-id', 'c'.repeat(32));
        if (fault === 'boot' || (fault === 'origin-race' && epochs > 1))
          observations.set(
            '/proc/sys/kernel/random/boot_id',
            '33333333-3333-4333-8333-333333333333',
          );
        if (fault === 'namespace') observations.set('/proc/self/ns/pid', 'pid:[4026532000]');
        if (fault === 'ancestor-proc') observations.set('/proc/self', String(process.pid + 1));
        if (fault === 'missing-machine') observations.delete('/etc/machine-id');
        if (fault === 'malformed-boot')
          observations.set('/proc/sys/kernel/random/boot_id', 'malformed');
        if (
          (path === '/proc/42/stat' && fault === 'live-guardian') ||
          (path === '/proc/43/stat' &&
            (fault === 'live-lock' || (fault === 'pid-race' && epochs > 1)))
        )
          return 'live or reused process';
        if (
          (path === '/proc/42/stat' && fault === 'unreadable-guardian') ||
          (path === '/proc/43/stat' && fault === 'unreadable-lock')
        )
          throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
        const text = observations.get(path);
        if (text !== undefined) return text;
        throw Object.assign(new Error('missing process'), { code: 'ENOENT' });
      });
    await proveRegistryBackupOriginStopped(attempt, 43, read).then(
      () => {
        throw new Error('Unproved origin unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });
}

/** Actual production function with all origin/process reads modeled. A third epoch follows the two exact absent-process passes. */
function createOriginReader(fault: string, lockPid = 43, guardianPid = 42) {
  let epoch = 0;
  const failure = Object.assign(new Error('Modeled final origin unavailable'), {
    code: fault === 'machine-missing' ? 'ENOENT' : 'EACCES',
  });
  const reads: string[] = [];
  return {
    failure,
    reads,
    readEpoch: () => epoch,
    read: (path: string): Promise<string> => {
      reads.push(path);
      if (path === '/etc/machine-id') epoch++;
      if (path === `/proc/${String(guardianPid)}/stat` || path === `/proc/${String(lockPid)}/stat`)
        return Promise.reject(
          Object.assign(new Error('Modeled exact process absent'), { code: 'ENOENT' }),
        );
      if (path === '/etc/machine-id') {
        if (epoch === 3 && (fault === 'machine-missing' || fault === 'machine-unreadable'))
          return Promise.reject(failure);
        return Promise.resolve(
          epoch === 3 && fault === 'machine' ? 'c'.repeat(32) : attempt.guardian.machineId + '\n',
        );
      }
      if (path === '/proc/sys/kernel/random/boot_id')
        return Promise.resolve(
          epoch === 3 && fault === 'boot'
            ? '33333333-3333-4333-8333-333333333333'
            : attempt.guardian.bootId + '\n',
        );
      if (path === '/proc/self/ns/pid')
        return Promise.resolve(
          epoch === 3 && fault === 'namespace' ? 'pid:[4026532000]' : attempt.guardian.pidNamespace,
        );
      if (path === '/proc/self')
        return Promise.resolve(String(process.pid + (epoch === 3 && fault === 'proc' ? 1 : 0)));
      return Promise.reject(new Error('Unexpected modeled final-origin read'));
    },
  };
}

test('final origin verifies the third epoch after two exact absent-process passes', async () => {
  const fixture = createOriginReader('none');
  await proveRegistryBackupOriginStopped(attempt, 43, fixture.read);
  expect(fixture.readEpoch()).toBe(3);
  expect(fixture.reads.filter((path) => path.endsWith('/stat'))).toEqual([
    '/proc/42/stat',
    '/proc/43/stat',
    '/proc/42/stat',
    '/proc/43/stat',
  ]);
});

for (const fault of [
  'machine',
  'boot',
  'namespace',
  'proc',
  'machine-missing',
  'machine-unreadable',
])
  test('final origin refuses third-epoch ' + fault, async () => {
    const fixture = createOriginReader(fault);
    await proveRegistryBackupOriginStopped(attempt, 43, fixture.read).then(
      () => {
        throw new Error('Unverified final origin unexpectedly succeeded');
      },
      (cause: unknown) => {
        if (fault === 'machine-missing' || fault === 'machine-unreadable')
          expect(cause).toBe(fixture.failure);
        else expect(cause).toBeInstanceOf(Error);
      },
    );
    expect(fixture.readEpoch()).toBe(3);
  });

for (const pid of [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  2147483648,
  Number.MAX_SAFE_INTEGER,
])
  test('origin input refuses invalid lock PID before observation: ' + String(pid), async () => {
    const fixture = createOriginReader('none', pid);
    await proveRegistryBackupOriginStopped(attempt, pid, fixture.read).then(
      () => {
        throw new Error('Invalid origin lock PID unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('Invalid backup lock process identity'));
      },
    );
    expect(fixture.reads).toEqual([]);
  });

for (const pid of [2147483648, Number.MAX_SAFE_INTEGER])
  test(
    'origin refuses persisted guardian PID beyond the live-reader bound before reads: ' +
      String(pid),
    async () => {
      const invalid = structuredClone(attempt);
      invalid.guardian.pid = pid;
      const fixture = createOriginReader('none', 43, pid);
      const failure = await proveRegistryBackupOriginStopped(invalid, 43, fixture.read).then(
        () => {
          throw new Error('Unrepresentable persisted guardian falsely proved stopped');
        },
        (cause: unknown) => cause,
      );
      expect(fixture.reads).toEqual([]);
      expect(failure).toBeInstanceOf(Error);
    },
  );
