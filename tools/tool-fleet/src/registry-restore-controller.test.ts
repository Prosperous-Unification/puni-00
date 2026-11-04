import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

import {
  describeRegistryPopulationFailure,
  observeRegistryPopulationOutput,
} from './registry-population-diagnostics.fixture';
import type { inspectRegistryRestoreFault } from './registry-restore-interruption.fixture';

/** Actual fixed recovery controller block, with owned-state/owner/proc ports modeled; no process is signaled or spawned. */
async function createFixture(fault = 'none') {
  const source = await readFile(
    new URL('./registry-maintenance-deletion.native.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf("      if (mode === 'restore-kill') {");
  const end = source.indexOf("      stage = 'staged-recovery';", start);
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    'async function prove() {' + (start < 0 ? '' : source.slice(start, end)) + '}',
  );
  const calls: string[] = [],
    output: string[] = [];
  const backup = {
    snapshotId: 'a'.repeat(64),
    registryPath: '/var/lib/puni-registry/registry/contents',
    journalPath: '/var/lib/puni-registry/journal/contents',
  };
  const evidence = { operationId: 'operation', backup };
  const installed = {
    journalPath: '/var/lib/puni-registry/journal/contents',
    recovery: {
      state: fault === 'target' ? 'unenrolled' : 'enrolled',
      path: '/var/lib/puni-registry/recovery/registry/contents',
      stagedJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
    },
  };
  const lineage = {
    operationId: 'operation',
    snapshotId: 'a'.repeat(64),
    registryPath: '/var/lib/puni-registry/registry/contents',
    journalPath: '/var/lib/puni-registry/journal/contents',
    targetRegistryPath: '/var/lib/puni-registry/recovery/registry/contents',
    targetJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
  } as const;
  const terminal = {
    worker: 42,
    pid: 73,
    startTicks: '123',
    group: 42,
    exitCode: 137,
    signal: 'SIGKILL',
  } as const;
  const before: ReturnType<typeof inspectRegistryRestoreFault> = {
    dev: 2,
    ino: 7,
    serialized: 'armed',
    ...lineage,
    state: 'armed',
  };
  const consumed: ReturnType<typeof inspectRegistryRestoreFault> = {
    dev: 2,
    ino: fault === 'replaced' ? 8 : 7,
    serialized: 'consumed',
    ...lineage,
    state: fault === 'unconsumed' ? 'armed' : 'consumed',
    terminal,
  };
  const priorActions =
    'restore-service:entered\nrestore-service:completed\nserve-readonly:entered\n';
  const failed = {
    schemaVersion: fault === 'schema' ? 3 : 4,
    fenced: fault !== 'unfenced',
    maintenance: {
      operationId: fault === 'operation' ? 'foreign' : 'operation',
      phase: fault === 'phase' ? 'restored' : 'failed',
    },
    maintenanceEvidence: {
      backup: fault === 'backup' ? { ...backup, snapshotId: 'b'.repeat(64) } : backup,
    },
  };
  let inspections = 0;
  let reads = 0;
  let armed: unknown;
  const unknown = Object.assign(new Error('private denied'), { code: 'EPERM' });
  const plainFailure = { code: fault === 'proc-plain' ? 'ENOENT' : 'ESRCH' };
  // Boundary: execute the actual fixed controller slice with explicit modeled effects only.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const invoke = new Function(
    'mode',
    'installed',
    'evidence',
    'run',
    'readFile',
    'writeFile',
    'inspectRegistryRestoreFault',
    'parseRegistryCommandResponse',
    'type',
    'process',
    'console',
    'join',
    'censusActions',
    'readRegistryHttpObservationOutput',
    'observeRegistryPopulationOutput',
    'absent',
    `let stage=''; ${body}; return prove();`,
  ) as (...ports: unknown[]) => Promise<void>;
  const pending = invoke(
    'restore-kill',
    installed,
    evidence,
    (command: string) => {
      calls.push(command);
      return Promise.resolve({
        code: fault === 'owner-success' ? 0 : 1,
        stdout: '',
        stderr: 'fixed',
      });
    },
    (path: string) => {
      if (path === '/root/task8-fixture/restore-worker-failure.json') {
        if (fault === 'diagnostic-missing' || fault === 'diagnostic-access')
          return Promise.reject(
            Object.assign(new Error('private diagnostic unavailable'), {
              code: fault === 'diagnostic-missing' ? 'ENOENT' : 'EACCES',
            }),
          );
        const observation =
          'task8-population-diagnostic:' +
          JSON.stringify(
            describeRegistryPopulationFailure('retained', new Error('private observed failure')),
          ) +
          '\n';
        return Promise.resolve(
          fault === 'diagnostic-malformed'
            ? '{private'
            : (fault === 'diagnostic-oversized' ? ' '.repeat(4097) : '') +
                JSON.stringify({
                  ...(fault === 'diagnostic-extra' ? { unexpected: true } : {}),
                  worker: fault === 'diagnostic-worker' ? 99 : 42,
                  observation:
                    fault === 'diagnostic-invalid'
                      ? 'task8-population-diagnostic:{}\n'
                      : observation,
                }),
        );
      }
      if (path === '/root/task8-fixture/restore-interruption.log') {
        reads++;
        if (fault === 'missing-log')
          return Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        const receipt =
          JSON.stringify({
            restoreInterruption:
              fault === 'mismatched-log'
                ? { ...terminal, pid: 74 }
                : fault === 'extra-log'
                  ? { ...terminal, extra: true }
                  : terminal,
          }) + '\n';
        return Promise.resolve(
          fault === 'oversize-log'
            ? ' '.repeat(4097) + receipt
            : fault === 'multiline-log'
              ? receipt.replace('{', '{\n')
              : fault === 'duplicate-log'
                ? receipt.repeat(2)
                : receipt,
        );
      }
      if (path.startsWith('/proc/')) {
        calls.push(path);
        if (fault === 'proc-plain') {
          // Boundary: deliberately model a non-Error external rejection; production must not classify it as absence.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(plainFailure);
        }
        if (fault === 'proc-access') return Promise.reject(unknown);
        if (
          (fault === 'worker-live' && path === '/proc/42/stat') ||
          (fault === 'child-live' && path === '/proc/73/stat')
        )
          return Promise.resolve('still present');
        return Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' }));
      }
      if (path === '/var/lib/puni-registry/journal/contents/journal.json')
        return Promise.resolve(JSON.stringify(failed));
      if (path === '/root/task8-fixture/actions.log')
        return Promise.resolve(
          (fault === 'history' ? 'X' + priorActions.slice(1) : priorActions) +
            (fault === 'no-restore' ? '' : 'backup-restore:entered\n') +
            (fault === 'completed' ? 'backup-restore:completed\n' : '') +
            (fault === 'served' ? 'serve-recovery:entered\n' : '') +
            (fault === 'activated' ? 'restore-service:entered\n' : ''),
        );
      throw new Error('Unexpected modeled read');
    },
    (path: string, bytes: string, options: unknown) => {
      if (path.endsWith('restore-interruption.json')) {
        calls.push('arm');
        armed = JSON.parse(bytes);
        expect(options).toEqual({ mode: 0o600, flag: 'wx' });
      } else calls.push('clock');
      return Promise.resolve();
    },
    (
      expected: Parameters<typeof inspectRegistryRestoreFault>[0],
    ): ReturnType<typeof inspectRegistryRestoreFault> => {
      expect(expected).toEqual(lineage);
      inspections++;
      if (fault === 'state-read' && inspections === 2) throw unknown;
      return inspections === 1 ? before : consumed;
    },
    (input: unknown) => input,
    type,
    {
      kill: (pid: number, signal: number) => {
        calls.push('group');
        expect([pid, signal]).toEqual([-42, 0]);
        if (fault === 'group-live') return;
        if (fault === 'group-plain') {
          // Boundary: deliberately model a non-Error signal observation; it must never establish group absence.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw plainFailure;
        }
        if (fault === 'group-access') throw unknown;
        throw Object.assign(new Error('absent'), { code: 'ESRCH' });
      },
    },
    { log: (line: string) => output.push(line) },
    join,
    priorActions,
    () => ({
      state: fault === 'http-invalid' ? 'invalid' : 'valid',
      observation: { pending: 0, events: fault === 'http-contact' ? [{ method: 'GET' }] : [] },
    }),
    observeRegistryPopulationOutput,
    () => Promise.resolve(fault !== 'diagnostic-prior'),
  );
  const rejected = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  return { calls, output, rejected, armed, inspections, reads, unknown, plainFailure };
}

test('restore controller binds consumed actual kill and absent group before allowing retry', async () => {
  const proof = await createFixture();
  expect(proof.rejected).toBeUndefined();
  expect(proof.calls).toEqual([
    'arm',
    'clock',
    'deletion-recover',
    '/proc/42/stat',
    '/proc/73/stat',
    'group',
  ]);
  expect(proof.armed).toMatchObject({
    state: 'armed',
    operationId: 'operation',
    snapshotId: 'a'.repeat(64),
  });
  expect(proof.inspections).toBe(2);
  expect(proof.output.some((line) => line.includes('restoreWorkerObservation'))).toBe(true);
  expect(proof.output.join('')).not.toContain('private');
  expect(proof.output.some((line) => line.includes('restoreKilledBeforeRetry'))).toBe(true);
});
for (const fault of [
  'diagnostic-prior',
  'diagnostic-missing',
  'diagnostic-access',
  'diagnostic-malformed',
  'diagnostic-oversized',
  'diagnostic-worker',
  'diagnostic-invalid',
  'diagnostic-extra',
  'target',
  'owner-success',
  'http-invalid',
  'http-contact',
  'unconsumed',
  'replaced',
  'state-read',
  'missing-log',
  'oversize-log',
  'duplicate-log',
  'multiline-log',
  'extra-log',
  'mismatched-log',
  'worker-live',
  'child-live',
  'proc-access',
  'proc-plain',
  'group-live',
  'group-access',
  'group-plain',
  'schema',
  'unfenced',
  'operation',
  'phase',
  'backup',
  'history',
  'no-restore',
  'completed',
  'served',
  'activated',
])
  test('restore controller refuses unproved interruption ' + fault, async () => {
    const proof = await createFixture(fault);
    if (fault.endsWith('-plain')) expect(proof.rejected).toBe(proof.plainFailure);
    else expect(proof.rejected).toBeInstanceOf(Error);
    expect(proof.output.some((line) => line.includes('restoreKilledBeforeRetry'))).toBe(false);
    if (['state-read', 'proc-access', 'group-access'].includes(fault))
      expect(proof.rejected).toBe(proof.unknown);
    if (
      [
        'diagnostic-missing',
        'diagnostic-access',
        'diagnostic-malformed',
        'diagnostic-oversized',
        'diagnostic-invalid',
      ].includes(fault)
    ) {
      expect(proof.rejected).toBeInstanceOf(AggregateError);
      const combined = proof.rejected as AggregateError;
      expect(combined.errors).toHaveLength(2);
      expect(combined.errors[0]).toBeInstanceOf(Error);
      expect((combined.errors[0] as Error).message).toBe('Restore interruption owner failed');
      expect(combined.cause).toBe(combined.errors[0]);
      expect(proof.output.some((line) => line.includes('restoreInterruptedOwner'))).toBe(true);
    }
    expect(proof.output.join('')).not.toContain('private');
  });
