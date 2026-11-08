import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

/** Actual controller receipt/physical acceptance block with modeled process and filesystem observations. */
async function createFixture(fault = 'none') {
  const source = await readFile(
    new URL('./registry-maintenance-deletion.native.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf("    stage = 'physical-evidence';");
  const end = source.indexOf("    stage = 'protected-read';", start);
  if (start < 0 || end < 0) throw new Error('Missing physical controller block');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    'async function prove() {' + source.slice(start, end) + '}',
  );
  const terminal = {
    pid: 73,
    startTicks: '123',
    group: fault === 'foreign-group' ? 74 : 73,
    exitCode: fault === 'exit-zero' ? 0 : 137,
    signal: fault === 'signal' ? 'SIGTERM' : 'SIGKILL',
    groupAbsent: fault !== 'receipt-live',
  };
  const groupProbes: [number, number][] = [];
  const receipts: string[] = [],
    observations: string[] = [];
  const procFailure = Object.assign(new Error('private denied'), { code: 'EACCES' });
  const plainFailure = { code: fault === 'proc-plain' ? 'ENOENT' : 'ESRCH' };
  const digest = 'sha256:' + 'a'.repeat(64);
  const actions =
    'serve-readonly:entered\nserve-readonly:completed\n' +
    (fault === 'not-entered' ? '' : 'collect:entered\n') +
    (fault === 'completed' ? 'collect:completed\n' : '') +
    (fault === 'post-read' ? 'serve-readonly:entered\n' : '');
  // Boundary: only exact source block runs; process signal0 and filesystem results are modeled, never actual effects.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const invoke = new Function(
    'mode',
    'installed',
    'expired',
    'protectedIndex',
    'evidence',
    'journal',
    'actions',
    'retired',
    'http',
    'readFile',
    'lstat',
    'join',
    'type',
    'process',
    'console',
    `let stage=''; ${body}; return prove();`,
  ) as (...ports: unknown[]) => Promise<void>;
  const pending = invoke(
    'gc-kill',
    { ordinary: { path: '/old' } },
    { repository: 'expired', root: digest },
    {},
    { deletions: [{ state: fault === 'pending' ? 'pending' : 'verified' }] },
    {},
    actions,
    { stderr: '' },
    {
      observation: {
        events: [{ method: 'DELETE', path: 'manifest', status: fault === 'http' ? 404 : 202 }],
      },
    },
    (path: string) => {
      observations.push(path);
      if (path === '/root/task8-fixture/collection-interruption.log') {
        if (fault === 'missing')
          return Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' }));
        const line = JSON.stringify({ collectionInterruption: terminal }) + '\n';
        return Promise.resolve(
          fault === 'oversized' ? ' '.repeat(4097) : fault === 'duplicate' ? line.repeat(2) : line,
        );
      }
      if (path === '/proc/73/stat') {
        if (fault === 'proc-plain') {
          // Boundary: deliberately model a non-Error external rejection; production must not classify it as absence.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(plainFailure);
        }
        if (fault === 'proc-access') return Promise.reject(procFailure);
        if (fault === 'process-live') return Promise.resolve('present');
        return Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' }));
      }
      throw new Error('Unexpected receipt path');
    },
    () =>
      fault === 'revision-present'
        ? Promise.resolve({})
        : Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' })),
    join,
    type,
    {
      kill: (pid: number, signal: number) => {
        groupProbes.push([pid, signal]);
        observations.push('group');
        if (fault === 'group-live') return;
        if (fault === 'group-plain') {
          // Boundary: deliberately model a non-Error signal observation; it must never establish group absence.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw plainFailure;
        }
        if (fault === 'group-access') throw procFailure;
        throw Object.assign(new Error('absent'), { code: 'ESRCH' });
      },
    },
    { log: (line: string) => receipts.push(line) },
  );
  const rejected = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  return { receipts, observations, rejected, procFailure, plainFailure, groupProbes };
}

test('GC controller requires actual killed child and normal verified deletion', async () => {
  const proof = await createFixture();
  expect(proof.rejected).toBeUndefined();
  expect(proof.groupProbes).toEqual([[-73, 0]]);
  expect(proof.observations).toEqual([
    '/root/task8-fixture/collection-interruption.log',
    '/proc/73/stat',
    'group',
  ]);
  expect(proof.receipts.some((line) => line.includes('collectionKilledBeforeRecovery'))).toBe(true);
});
for (const fault of [
  'missing',
  'oversized',
  'duplicate',
  'exit-zero',
  'signal',
  'receipt-live',
  'foreign-group',
  'process-live',
  'proc-access',
  'proc-plain',
  'group-live',
  'group-access',
  'group-plain',
  'not-entered',
  'completed',
  'post-read',
  'pending',
  'http',
  'revision-present',
])
  test('GC controller refuses unproved actual interruption ' + fault, async () => {
    const proof = await createFixture(fault);
    if (fault.endsWith('-plain')) expect(proof.rejected).toBe(proof.plainFailure);
    else expect(proof.rejected).toBeInstanceOf(Error);
    expect(proof.receipts.some((line) => line.includes('collectionKilledBeforeRecovery'))).toBe(
      false,
    );
    if (fault === 'proc-access' || fault === 'group-access')
      expect(proof.rejected).toBe(proof.procFailure);
  });
