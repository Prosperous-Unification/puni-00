import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryOperation } from './registry-operation-completion';
import { requireRejection } from './registry-rejection.fixture';

for (const fault of [
  'none',
  'machine',
  'identity',
  'bytes',
  'inodes',
  'device',
  'inode',
  'root-reserve',
  'barrier',
  'cancel',
] as const)
  test(
    'actual client custody refuses changed admission before publishing or launching: ' + fault,
    async () => {
      const source = await readFile(
        new URL('./registry-client-custody.ts', import.meta.url),
        'utf8',
      );
      const start = source.indexOf('export async function runRegistryClientCustody(');
      if (start < 0) throw new Error('Missing production custody function');
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        source.slice(start).replace('export async function', 'async function'),
      );
      const client = {
        scratch: {
          path: '/scratch',
          receiptPath: '/receipt',
          storageId: 'scratch',
          maximumBytes: 1000,
          maximumInodes: 100,
        },
      };
      const controller = new AbortController();
      const stopped = new Error('fresh writer barrier failed'),
        cancelled = new Error('custody cancelled');
      const effects = { executed: false, closed: false };
      // Execute the actual admission shell; filesystem/kernel/store and canonical parsing
      // are external ports here. Native fixtures and the real store tests cover those effects.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'requireRegistryClientInstallation',
        'RegistryBackupReceipt',
        'readRegistryBackupGuardian',
        'describeRegistryClientAttempt',
        'openRegistryClientAttemptStore',
        'completeRegistryOperation',
        'runRegistryClientAttempt',
        'admitBuilderScratch',
        'lstat',
        'measureFilesystem',
        'input',
        body + '; return runRegistryClientCustody(input);',
      ) as (...ports: unknown[]) => Promise<string>;
      const pending = invoke(
        () => client,
        { assert: () => ({ snapshotId: 'snapshot' }) },
        () => Promise.resolve({ machineId: fault === 'machine' ? 'foreign' : 'machine' }),
        () => ({}),
        () =>
          Promise.resolve({
            identity: { device: '1', inode: '2' },
            close: () =>
              invokeRegistryCallback(() => {
                effects.closed = true;
              }),
          }),
        completeRegistryOperation,
        async (input: { admit: () => Promise<void>; execute: () => Promise<string> }) => {
          await input.admit();
          return input.execute();
        },
        () =>
          Promise.resolve({
            identity: fault === 'identity' ? 'foreign' : 'scratch',
            maximumBytes: fault === 'bytes' ? 1001 : 1000,
            totalInodes: fault === 'inodes' ? 101 : 100,
          }),
        () =>
          Promise.resolve({ dev: fault === 'device' ? 3n : 1n, ino: fault === 'inode' ? 3n : 2n }),
        () =>
          invokeRegistryCallback(() => {
            if (fault === 'cancel') controller.abort(cancelled);
            return {
              availableBytes: fault === 'root-reserve' ? 20 * 1024 ** 3 - 1 : 20 * 1024 ** 3,
            };
          }),
        {
          installed: {
            machineId: 'machine',
            journalPath: '/journal',
            ordinary: { path: '/source' },
            recovery: { state: 'unenrolled' },
          },
          journal: { maintenanceEvidence: { backup: {} } },
          request: { operationId: 'maintain', token: 'token' },
          scope: 'current',
          plan: {},
          allocationUnitBytes: 4096,
          signal: controller.signal,
          beforeLaunch: () =>
            invokeRegistryCallback(() => {
              if (fault === 'barrier') throw stopped;
            }),
          execute: () =>
            invokeRegistryCallback(() => {
              effects.executed = true;
              return 'terminal';
            }),
        },
      );
      if (fault === 'none') expect(await pending).toBe('terminal');
      else {
        const rejected = await requireRejection(pending);
        if (fault === 'barrier') expect(rejected.cause).toBe(stopped);
        if (fault === 'cancel') expect(rejected.cause).toBe(cancelled);
      }
      expect(effects).toEqual({ executed: fault === 'none', closed: fault !== 'machine' });
    },
  );
