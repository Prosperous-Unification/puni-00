import { expect, test } from 'bun:test';

import {
  prepareRegistryBackupAttempt,
  readRegistryBackupGuardian,
  requireRegistryBackupAttempt,
} from './registry-backup-attempt';

const current = {
  operationId: 'backup-operation',
  token: '11111111-1111-4111-8111-111111111111',
  action: 'backup-snapshot' as const,
  configurationSha256: 'a'.repeat(64),
  registryId: 'stable-registry',
  guardian: {
    pid: 42,
    startTicks: '12345',
    pidNamespace: 'pid:[4026531836]',
    bootId: '22222222-2222-4222-8222-222222222222',
    machineId: 'b'.repeat(32),
  },
  journalRevision: 9,
};
const prepare = () => prepareRegistryBackupAttempt({ ...current, now: '2026-10-26T00:00:00.000Z' });

test('authority creates a fresh public attempt identity with stable snapshot host', () => {
  const first = prepare();
  const second = prepare();
  expect(first.id).not.toBe(second.id);
  expect(first.utsHostname).toBe(`prb-${first.id}`);
  expect(first.snapshotHost).toBe('stable-registry');
  expect(first.snapshotHost).not.toBe(first.utsHostname);
  expect(JSON.stringify(first)).not.toContain(current.token);
  expect(() => {
    requireRegistryBackupAttempt(first, current);
  }).not.toThrow();
});

for (const fault of [
  'operation',
  'token',
  'action',
  'configuration',
  'registry',
  'pid',
  'start',
  'boot',
  'machine',
  'pid-namespace',
  'revision',
  'namespace',
  'settled',
  'reconciled',
  'settlement',
] as const) {
  test(`backup attempt refuses ${fault} replay or mismatched lineage`, () => {
    const attempt = prepare();
    if (fault === 'operation') attempt.operationId = 'foreign';
    if (fault === 'token') attempt.tokenSha256 = 'c'.repeat(64);
    if (fault === 'action') attempt.action = 'backup-restore';
    if (fault === 'configuration') attempt.configurationSha256 = 'c'.repeat(64);
    if (fault === 'registry') attempt.snapshotHost = 'foreign';
    if (fault === 'pid') attempt.guardian.pid++;
    if (fault === 'start') attempt.guardian.startTicks = '12346';
    if (fault === 'boot') attempt.guardian.bootId = '33333333-3333-4333-8333-333333333333';
    if (fault === 'machine') attempt.guardian.machineId = 'c'.repeat(32);
    if (fault === 'pid-namespace') attempt.guardian.pidNamespace = 'pid:[4026532000]';
    if (fault === 'revision') attempt.journalRevision--;
    if (fault === 'namespace') attempt.utsHostname = 'prb-33333333-3333-4333-8333-333333333333';
    if (fault === 'settled' || fault === 'reconciled') attempt.state = fault;
    if (fault === 'settlement') attempt.settlementSha256 = 'd'.repeat(64);
    expect(() => {
      requireRegistryBackupAttempt(attempt, current);
    }).toThrow();
  });
}

const createGuardianFiles = (pid = 42) =>
  new Map([
    [
      `/proc/${String(pid)}/stat`,
      `${String(pid)} (fixture guardian) S ${Array<string>(18).fill('0').join(' ')} 12345 0\n`,
    ],
    [`/proc/${String(pid)}/status`, 'Uid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\n'],
    ['/proc/sys/kernel/random/boot_id', current.guardian.bootId + '\n'],
    ['/proc/self', String(process.pid)],
    ['/proc/self/ns/pid', current.guardian.pidNamespace],
    ['/etc/machine-id', current.guardian.machineId + '\n'],
  ]);

test('guardian kernel observations match exact root identity', async () => {
  const fixture = createGuardianReader(createGuardianFiles());
  expect(await readRegistryBackupGuardian(42, fixture.read)).toEqual(current.guardian);
  expect(fixture.reads).toHaveLength(12);
});

for (const fault of [
  'absent',
  'unreadable',
  'uid',
  'gid',
  'dead',
  'malformed',
  'pid-race',
  'boot-race',
  'namespace-race',
  'machine-race',
  'ancestor-proc',
] as const) {
  test(`guardian observation refuses ${fault}`, async () => {
    const files = createGuardianFiles();
    let observations = 0;
    await readRegistryBackupGuardian(42, (path) =>
      Promise.resolve().then(() => {
        const text = files.get(path);
        if (text === undefined) throw new Error('Missing fixture observation');
        if (path === '/proc/42/stat') {
          observations++;
          if (fault === 'absent') throw Object.assign(new Error('absent'), { code: 'ENOENT' });
          if (fault === 'unreadable')
            throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
          if (fault === 'dead') return text.replace(') S ', ') Z ');
          if (fault === 'malformed') return '42 incomplete';
          if (fault === 'pid-race' && observations > 1) return text.replace('12345', '67890');
        }
        if (path.endsWith('/status') && fault === 'uid')
          return text.replace('Uid:\t0', 'Uid:\t59001');
        if (path.endsWith('/status') && fault === 'gid')
          return text.replace('Gid:\t0', 'Gid:\t59001');
        if (path.endsWith('/boot_id') && fault === 'boot-race' && observations > 1)
          return '33333333-3333-4333-8333-333333333333\n';
        if (path === '/etc/machine-id' && fault === 'machine-race' && observations > 1)
          return 'c'.repeat(32) + '\n';
        if (path === '/proc/self' && fault === 'ancestor-proc') return String(process.pid + 1);
        if (path === '/proc/self/ns/pid' && fault === 'namespace-race' && observations > 1)
          return 'pid:[4026532000]';
        return text;
      }),
    ).then(
      () => {
        throw new Error('Invalid guardian observation unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });
}

/** Calls the production reader with modeled observations only; no kernel or root-process evidence is claimed. */
function createGuardianReader(files: Map<string, string>) {
  const reads: string[] = [];
  return {
    reads,
    read: (path: string): Promise<string> => {
      reads.push(path);
      const text = files.get(path);
      if (text === undefined)
        return Promise.reject(new Error('Unexpected modeled guardian observation'));
      return Promise.resolve(text);
    },
  };
}

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
  test('guardian input refuses invalid PID before observation: ' + String(pid), async () => {
    const fixture = createGuardianReader(createGuardianFiles(pid));
    const failure = await readRegistryBackupGuardian(pid, fixture.read).then(
      () => {
        throw new Error('Invalid guardian PID unexpectedly succeeded');
      },
      (cause: unknown) => cause,
    );
    expect(fixture.reads).toEqual([]);
    expect(failure).toEqual(new Error('Invalid root guardian PID'));
  });

for (const [name, path, padding] of [
  ['stat', '/proc/42/stat', 4097],
  ['status', '/proc/42/status', 65537],
  ['boot', '/proc/sys/kernel/random/boot_id', 38],
  ['machine', '/etc/machine-id', 34],
  ['namespace', '/proc/self/ns/pid', 27],
] as const)
  test('guardian input refuses oversized ' + name + ' observation', async () => {
    const files = createGuardianFiles();
    const text = files.get(path);
    if (text === undefined) throw new Error('Missing modeled raw guardian input');
    files.set(path, text + ' '.repeat(padding));
    await readRegistryBackupGuardian(42, createGuardianReader(files).read).then(
      () => {
        throw new Error('Oversized guardian input unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });

for (const fault of ['foreign-pid', 'missing-open', 'short-boundary', 'truncated'] as const)
  test('guardian input refuses malformed stat ' + fault, async () => {
    const files = createGuardianFiles();
    const text = files.get('/proc/42/stat');
    if (text === undefined) throw new Error('Missing modeled stat');
    const changed =
      fault === 'foreign-pid'
        ? text.replace(/^42 /, '43 ')
        : fault === 'missing-open'
          ? text.replace('42 (', '42 [')
          : fault === 'short-boundary'
            ? text.slice(text.indexOf(') '))
            : `42 (fixture guardian) S ${Array<string>(18).fill('0').join(' ')}\n`;
    files.set('/proc/42/stat', changed);
    await readRegistryBackupGuardian(42, createGuardianReader(files).read).then(
      () => {
        throw new Error('Malformed guardian stat unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });

for (const [name, path, value] of [
  ['start-zero', '/proc/42/stat', '0'],
  ['start-leading-zero', '/proc/42/stat', '01'],
  ['start-nondecimal', '/proc/42/stat', 'x'],
  ['namespace-zero', '/proc/self/ns/pid', 'pid:[0]'],
  ['boot-malformed', '/proc/sys/kernel/random/boot_id', 'g'.repeat(36)],
  ['machine-malformed', '/etc/machine-id', 'g'.repeat(32)],
] as const)
  test('guardian final schema refuses ' + name, async () => {
    const files = createGuardianFiles();
    const text = files.get(path);
    if (text === undefined) throw new Error('Missing modeled schema input');
    files.set(path, path.endsWith('/stat') ? text.replace('12345', value) : value);
    await readRegistryBackupGuardian(42, createGuardianReader(files).read).then(
      () => {
        throw new Error('Invalid guardian schema unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });

for (const code of ['ENOENT', 'EACCES'])
  test('guardian input preserves exact ' + code + ' dependency failure', async () => {
    const failure = Object.assign(new Error('Modeled guardian input failed'), { code });
    const fixture = createGuardianReader(createGuardianFiles());
    await readRegistryBackupGuardian(42, (path) =>
      path === '/proc/42/stat' ? Promise.reject(failure) : fixture.read(path),
    ).then(
      () => {
        throw new Error('Unavailable guardian dependency unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBe(failure);
      },
    );
  });

for (const pid of [2147483648, Number.MAX_SAFE_INTEGER])
  test(
    'attempt constructor refuses guardian PID beyond the live-reader bound: ' + String(pid),
    () => {
      expect(() => {
        prepareRegistryBackupAttempt({
          ...current,
          guardian: { ...current.guardian, pid },
          now: '2026-10-26T00:00:00.000Z',
        });
      }).toThrow();
    },
  );

test('attempt constructor preserves inclusive positive int32 PID endpoints', () => {
  for (const pid of [1, 2147483647])
    expect(
      prepareRegistryBackupAttempt({
        ...current,
        guardian: { ...current.guardian, pid },
        now: '2026-10-26T00:00:00.000Z',
      }).guardian.pid,
    ).toBe(pid);
});
