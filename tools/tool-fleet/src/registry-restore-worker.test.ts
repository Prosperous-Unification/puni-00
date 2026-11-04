import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { RegistryRecoveryPreparation } from './registry-maintenance-state';
import {
  describeRegistryPopulationFailure,
  observeRegistryPopulationOutput,
} from './registry-population-diagnostics.fixture';

/** Actual native worker caller with modeled admission/worker/capture ports; no subprocess, root filesystem, or provider is invoked. */
async function createFixture(fault = 'none') {
  const source = await readFile(
    new URL('./registry-maintenance-host.native.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async function backupWorker()');
  const end = source.indexOf('\nlet populationBoundary:', start);
  if (start < 0 || end < 0) throw new Error('Missing exact worker caller');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(start, end));
  const calls: string[] = [];
  const output: string[] = [];
  const causes: unknown[] = [];
  const diagnostics: string[] = [];
  const reporterFailure = new Error('private reporter failure');
  let escaped: unknown;
  const lineages: unknown[] = [];
  const admissionFailure = new Error('private admission failure');
  const processPort = { pid: 42, ppid: 40, execPath: '/bun', exitCode: 0 };
  const preparation = {
    state: 'prepared',
    operationId: 'operation',
    snapshotId: 'a'.repeat(64),
    previousStorageId: 'old',
    previousRegistryPath: '/var/lib/puni-registry/registry/contents',
    storageId: 'new',
    registryPath: '/var/lib/puni-registry/recovery/registry/contents',
    maximumBytes: 1024,
    canonicalJournalPath: '/var/lib/puni-registry/journal/contents',
    stagedJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
    stagedJournalStorageId: 'staged',
    stagedJournalMaximumBytes: 1024,
    node: 'node',
    pvcUid: 'pvc',
    mountIdentity: 'mount',
    distributionDigest: 'sha256:' + 'b'.repeat(64),
    binarySha256: 'c'.repeat(64),
    preparedAt: '2026-10-29T00:00:00.000Z',
  };
  const authority = {
    authorityDescriptor: 3,
    journal: {
      maintenance: fault === 'missing-owner' ? null : { operationId: 'operation' },
      maintenanceEvidence: {
        backup:
          fault === 'missing-backup'
            ? null
            : {
                snapshotId: 'a'.repeat(64),
                registryPath: '/var/lib/puni-registry/registry/contents',
                journalPath: '/var/lib/puni-registry/journal/contents',
              },
        recovery:
          fault === 'missing-preparation'
            ? null
            : fault === 'malformed-preparation'
              ? '{}'
              : JSON.stringify(preparation),
      },
    },
  };
  let current: (() => unknown) | undefined;
  let beforeAdmission: unknown;
  let captures = 0;
  // Boundary: only the extracted actual caller runs; all external effects are explicit modeled ports.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const invoke = new Function(
    'readFile',
    'home',
    'mkdir',
    'process',
    'writeFile',
    'rename',
    'runRegistryBackupWorkerMain',
    'admitRegistryBackup',
    'openRegistryBackupVersions',
    'createRegistryLocalLockVersions',
    'directory',
    'backupFaultModes',
    'bundle',
    'observeRegistryBackupTerminal',
    'interruptRegistryRestoreFixture',
    'RegistryRecoveryPreparation',
    'console',
    'appendFile',
    'findRegistryBackupStage',
    'RegistryMaintenanceRefusal',
    'describeRegistryPopulationFailure',
    body + '; return backupWorker();',
  ) as (...ports: unknown[]) => Promise<void>;
  const command =
    '/bun\0/proof.js\0' +
    (fault === 'ordinary'
      ? 'prove-tag-recovery\0'
      : fault === 'suffix'
        ? 'prove-restore-kill\0extra\0'
        : 'prove-restore-kill\0');
  await invoke(
    (path: string) =>
      Promise.resolve(
        path.endsWith('/admission')
          ? 'production'
          : path === '/proc/1/cmdline'
            ? command
            : '42 (bun) ' + ['S', ...Array<string>(18).fill('0'), '123'].join(' '),
      ),
    '/fixture',
    () => Promise.resolve(),
    processPort,
    (path: string, bytes: string) => {
      if (path === '/fixture/restore-worker-failure.json') {
        if (fault === 'diagnostic-failure') return Promise.reject(reporterFailure);
        diagnostics.push(bytes);
      }
      return Promise.resolve();
    },
    () => Promise.resolve(),
    async (admit: (request: unknown, authority: unknown) => Promise<void>) => {
      calls.push('worker');
      if (fault !== 'missing-admission') await admit({}, authority);
      if (current !== undefined) lineages.push(current());
      return 'verified';
    },
    (_request: unknown, observed: unknown) => {
      expect(observed).toBe(authority);
      calls.push('admission');
      return fault === 'admission-refused' ? Promise.reject(admissionFailure) : Promise.resolve();
    },
    () => Promise.resolve(),
    () => ({}),
    '/canonical',
    new Map(),
    '/proof.js',
    (run: () => Promise<string>) => run(),
    async (input: { run: () => Promise<string>; current: () => unknown }) => {
      captures++;
      calls.push('capture');
      if (fault === 'capture-failure' || fault === 'diagnostic-failure') throw admissionFailure;
      current = input.current;
      try {
        current();
      } catch (cause) {
        beforeAdmission = cause;
      }
      return input.run();
    },
    RegistryRecoveryPreparation,
    { log: (line: string) => output.push(line) },
    () => Promise.resolve(),
    (cause: unknown) => {
      causes.push(cause);
      return 'modeled';
    },
    class Refusal extends Error {},
    describeRegistryPopulationFailure,
  ).catch((cause: unknown) => {
    escaped = cause;
  });
  return {
    calls,
    diagnostics,
    reporterFailure,
    escaped,
    captures,
    output,
    causes,
    lineages,
    beforeAdmission,
    admissionFailure,
    exitCode: processPort.exitCode,
  };
}

test('restore worker derives capture lineage only after actual admission callback', async () => {
  const proof = await createFixture();
  expect(proof.calls).toEqual(['capture', 'worker', 'admission']);
  expect(proof.beforeAdmission).toBeInstanceOf(Error);
  expect(proof.lineages).toEqual([
    {
      operationId: 'operation',
      snapshotId: 'a'.repeat(64),
      registryPath: '/var/lib/puni-registry/registry/contents',
      journalPath: '/var/lib/puni-registry/journal/contents',
      targetRegistryPath: '/var/lib/puni-registry/recovery/registry/contents',
      targetJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
    },
  ]);
  expect(proof.exitCode).toBe(0);
  expect(proof.output.map((line): unknown => JSON.parse(line))).toEqual([
    { kind: 'complete', receipt: 'verified' },
  ]);
});
for (const fault of ['ordinary', 'suffix'])
  test('restore worker preserves unselected mode ' + fault, async () => {
    const proof = await createFixture(fault);
    expect(proof.captures).toBe(0);
    expect(proof.calls).toEqual(['worker', 'admission']);
    expect(proof.exitCode).toBe(0);
  });
for (const fault of [
  'missing-admission',
  'missing-owner',
  'missing-backup',
  'missing-preparation',
  'malformed-preparation',
  'admission-refused',
])
  test('restore worker refuses missing admitted lineage ' + fault, async () => {
    const proof = await createFixture(fault);
    expect(proof.captures).toBe(1);
    expect(proof.lineages).toEqual([]);
    expect(proof.exitCode).toBe(1);
    expect(proof.causes).toHaveLength(1);
    if (fault === 'missing-owner') {
      // Diagnostic contract only: without this explicit check, traversal still refuses via TypeError.
      expect((proof.causes[0] as Error).message).toBe(
        'Restore fault requires admitted canonical recovery lineage',
      );
    }
    if (fault === 'admission-refused') expect(proof.causes[0]).toBe(proof.admissionFailure);
    expect(proof.output.join('')).not.toContain('private');
    expect(proof.output.map((line): unknown => JSON.parse(line))).toEqual([
      { kind: 'failed', code: 'effect-failed' },
    ]);
  });

test('failed restore worker exports only current fixed diagnostic metadata', async () => {
  const proof = await createFixture('capture-failure');
  expect(proof.escaped).toBeUndefined();
  expect(proof.causes).toEqual([proof.admissionFailure]);
  expect(proof.diagnostics).toHaveLength(1);
  const serialized: unknown = JSON.parse(proof.diagnostics[0] ?? 'null');
  expect(serialized).toMatchObject({ worker: 42 });
  if (
    typeof serialized !== 'object' ||
    serialized === null ||
    !('observation' in serialized) ||
    typeof serialized.observation !== 'string'
  )
    throw new Error('Missing fixed diagnostic observation');
  expect(observeRegistryPopulationOutput(serialized.observation).diagnostic).toBe('valid');
  expect(proof.diagnostics.join('')).not.toContain('private');
});

test('restore diagnostic write failure retains the original worker refusal', async () => {
  const proof = await createFixture('diagnostic-failure');
  expect(proof.escaped).toBeInstanceOf(AggregateError);
  expect((proof.escaped as AggregateError).errors).toEqual([
    proof.admissionFailure,
    proof.reporterFailure,
  ]);
  expect((proof.escaped as Error).cause).toBe(proof.admissionFailure);
  expect(proof.output).toEqual([]);
});
