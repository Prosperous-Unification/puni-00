import { expect, test } from 'bun:test';

import {
  requireRegistryBackupOrphan,
  requireRegistryBackupOwner,
} from './registry-backup-interruption.native';
import {
  hasRegistryBackupInterrupt,
  requireRegistryBackupFaultProcess,
} from './registry-backup-interruption.native';
import { observeRegistryBackupFixture } from './registry-backup-observation.fixture';
import { requireRegistryBackupTerminal } from './registry-backup-terminal.fixture';
const owned = { pid: 123, startTicks: '456', parent: 100, group: 123, command: '/pinned/worker\0' };
test('private backup signal identity binds every observed kernel field', () => {
  expect(() => {
    requireRegistryBackupFaultProcess({ ...owned }, owned);
  }).not.toThrow();
  for (const changed of [
    { pid: 124 },
    { startTicks: '457' },
    { parent: 101 },
    { group: 124 },
    { command: '/other/worker\0' },
  ])
    expect(() => {
      requireRegistryBackupFaultProcess({ ...owned, ...changed }, owned);
    }).toThrow();
});
test('stopped backup interrupt parser requires exact kernel pending state', () => {
  const status = (state: string, pending: string, shared: string) =>
    `State:\t${state} (stopped)\nSigPnd:\t${pending}\nShdPnd:\t${shared}\n`;
  expect(hasRegistryBackupInterrupt(status('T', '0000000000000000', '0000000000000002'))).toBe(
    true,
  );
  expect(hasRegistryBackupInterrupt(status('T', '0000000000000002', '0000000000000000'))).toBe(
    true,
  );
  expect(hasRegistryBackupInterrupt(status('T', '0000000000000000', '0000000000000000'))).toBe(
    false,
  );
  for (const malformed of [
    '',
    status('S', '0000000000000000', '0000000000000002'),
    status('T', 'bad', '0000000000000002'),
    status('T', '0000000000000000', 'bad'),
  ])
    expect(() => hasRegistryBackupInterrupt(malformed)).toThrow();
});
test('actual terminal receipt requires one exact new child after unchanged baseline', () => {
  const before = JSON.stringify({ worker: 100, pid: 101, exitCode: 0, signal: null }) + '\n';
  const record = { worker: 200, pid: 201, exitCode: 130, signal: null };
  const current = JSON.stringify(record) + '\n';
  expect(() => {
    requireRegistryBackupTerminal(before + current, before, 200, 201, 130);
  }).not.toThrow();
  expect(() => {
    requireRegistryBackupTerminal(
      before + JSON.stringify({ ...record, exitCode: 137, signal: 'SIGKILL' }) + '\n',
      before,
      200,
      201,
      137,
    );
  }).not.toThrow();
  for (const invalid of [
    before,
    before + current + current,
    before + current + '\n',
    before + JSON.stringify({ ...record, worker: 300 }) + '\n',
    before + JSON.stringify({ ...record, pid: 301 }) + '\n',
    before + JSON.stringify({ ...record, exitCode: 0 }) + '\n',
    before + JSON.stringify({ ...record, extra: true }) + '\n',
    current + before,
    'x'.repeat(4097),
    before.replace('100', '102') + current,
    before + ' '.repeat(4096) + current,
    before + JSON.stringify({ ...record, signal: 'SIGINT' }) + '\n',
  ])
    expect(() => {
      requireRegistryBackupTerminal(invalid, before, 200, 201, 130);
    }).toThrow();
});
test('only proven PID1 adoption preserves the exact backup worker identity', () => {
  expect(requireRegistryBackupOrphan({ ...owned, parent: 1 }, owned)).toEqual({
    ...owned,
    parent: 1,
  });
  for (const changed of [
    { parent: 2 },
    { startTicks: '457' },
    { pid: 124 },
    { group: 124 },
    { command: '/foreign\0' },
  ])
    expect(() => requireRegistryBackupOrphan({ ...owned, parent: 1, ...changed }, owned)).toThrow();
});
test('owner fault binds actual59001 identity and owned Popen start', () => {
  const status = 'Uid:\t59001\t59001\t59001\t59001\nGid:\t59001\t59001\t59001\t59001\n';
  const serialized = '123 (bun) ' + ['S', ...Array<string>(18).fill('1'), '456'].join(' ');
  const command =
    '/pinned/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0backup-interruption\0';
  // PID/start/UID boundary only: fixture executable is explicitly supplied by the actual reader through process.execPath.
  expect(() => {
    requireRegistryBackupOwner(
      status,
      serialized,
      process.execPath + command.slice('/pinned/bun'.length),
      123,
      '456',
    );
  }).not.toThrow();
  for (const changed of [
    { status: status.replace(/^Uid:.*$/m, 'Uid:\t0\t0\t0\t0') },
    { status: status.replace('Gid:\t59001', 'Gid:\t59002') },
    { serialized: serialized.replace('123 (', '124 (') },
    { serialized: serialized.replace(/456$/, '457') },
    { command: '/foreign\0' },
  ]) {
    const observed = {
      status,
      serialized,
      command: process.execPath + command.slice('/pinned/bun'.length),
      ...changed,
    };
    expect(() => {
      requireRegistryBackupOwner(
        observed.status,
        observed.serialized,
        observed.command,
        123,
        '456',
      );
    }).toThrow();
  }
});
test('exact orphan reap permits ECHILD only with observed absence and refuses unknown errno', async () => {
  for (const fault of ['ECHILD', 'EINVAL'] as const) {
    const observed = await observeRegistryBackupFixture({ family: 'reap', fault });
    if (observed.family !== 'reap') throw new Error('Missing exact reap observation');
    if (fault === 'ECHILD') {
      expect(observed).toMatchObject({ state: 'fulfilled', value: null });
      expect(observed.reads).toBe(2);
      expect(observed.errnoReads).toBe(1);
      expect(observed.groups).toEqual([[-123, 0]]);
    } else {
      expect(observed).toMatchObject({
        state: 'rejected',
        isError: true,
        message: 'Exact worker waitpid failed unexpectedly',
      });
      expect(observed.reads).toBe(1);
      expect(observed.errnoReads).toBe(1);
      expect(observed.groups).toEqual([]);
    }
    expect(observed.hasClosedHandle).toBe(true);
  }
});
for (const [fault, expected] of [
  [
    'pid-reused',
    {
      state: 'rejected',
      message: 'Worker PID reused before exact reap',
      isOriginalFailure: false,
      reads: 1,
      groups: [],
    },
  ],
  ['proc-absent', { state: 'fulfilled', value: null, reads: 1, groups: [[-123, 0]] }],
  ['proc-denied', { state: 'rejected', isOriginalFailure: true, reads: 1, groups: [] }],
  [
    'group-live',
    {
      state: 'rejected',
      message: 'Owned backup process group remains',
      reads: 2,
      groups: [[-123, 0]],
    },
  ],
  ['group-denied', { state: 'rejected', isOriginalFailure: true, reads: 2, groups: [[-123, 0]] }],
  [
    'null-errno',
    {
      state: 'rejected',
      message: 'Exact worker waitpid failed unexpectedly',
      errnoReads: 0,
      reads: 1,
      groups: [],
    },
  ],
] as const) {
  test('whole-module orphan reap ' + fault, async () => {
    const observed = await observeRegistryBackupFixture({ family: 'reap', fault });
    expect(observed).toMatchObject({ ...expected, family: 'reap', hasClosedHandle: true });
  });
}
test('forced restic terminal requires an actual SIGKILL outcome', () => {
  const serialized = JSON.stringify({ worker: 200, pid: 201, exitCode: 137, signal: null }) + '\n';
  expect(() => {
    requireRegistryBackupTerminal(serialized, '', 200, 201, 137);
  }).toThrow();
});
test('fixed terminal file refuses invalid metadata, unreadability, absence and growth', async () => {
  for (const fault of [
    'none',
    'file-type',
    'uid',
    'gid',
    'links',
    'mode',
    'size',
    'growth',
    'absent',
    'unreadable',
    'read-fails',
  ] as const) {
    const observed = await observeRegistryBackupFixture({ family: 'terminal-file', fault });
    if (observed.family !== 'terminal-file')
      throw new Error('Missing fixed terminal file observation');
    if (fault === 'none') expect(observed).toMatchObject({ state: 'fulfilled', value: 'x' });
    else if (fault === 'absent' || fault === 'unreadable' || fault === 'read-fails')
      expect(observed.isOriginalFailure).toBe(true);
    else expect(observed).toMatchObject({ state: 'rejected', isError: true });
    expect(observed.hasClosedDescriptor).toBe(fault !== 'absent' && fault !== 'unreadable');
  }
});
