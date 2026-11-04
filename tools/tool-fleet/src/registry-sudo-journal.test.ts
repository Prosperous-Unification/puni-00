import { chmod, lstat, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryJournal,
  type RegistryJournalPorts,
  runRegistryMaintenance,
} from './registry-journal';

const GiB = 1024 ** 3;
const ports: RegistryJournalPorts = {
  measureJournal: () =>
    Promise.resolve({
      usableBytes: GiB,
      allocationUnitBytes: 4096,
      usedBytes: 4096,
      totalInodes: 10000,
      usedInodes: 10,
    }),
  measureRegistry: () =>
    Promise.resolve({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    }),
};

/** A resolved operation must fail its refusal test even when Bun's async matcher declarations return void. */
async function requireFailure(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('Expected operation to refuse');
}

/** Real authority writes and ordinary files drive the actual scanner; privilege and sudo execution are outside this boundary test. */
async function fixture() {
  const directory = await scratchAsync('registry-sudo-journal-');
  await chmod(directory, 0o700);
  await executeRegistryCommand(
    directory,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'sudo-journal',
        storageId: 'owned-volume',
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
        owners: ['operator'],
      },
    },
    ports,
  );
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  const retainedFailure = await requireFailure(
    runRegistryMaintenance(
      directory,
      { operationId: 'native-control', owner: 'operator', kind: 'backup', recover: false },
      ports,
      () => Promise.reject(new Error('Retain owned logging-test operation')),
    ),
  );
  expect(retainedFailure.message).toBe('Retain owned logging-test operation');
  const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  if (state.schemaVersion !== 4 || state.maintenance === null)
    throw new Error('Missing real authority fixture operation');
  const logDirectory = directory + '/logs';
  await mkdir(logDirectory, { mode: 0o700 });
  await writeFile(logDirectory + '/stdout', 'owned harmless output', { mode: 0o600 });
  const source = await readFile(
    new URL('./registry-maintenance-sudo.native.ts', import.meta.url),
    'utf8',
  );
  const anchor = source.indexOf("'Interposed input started a privileged effect'");
  const start = source.indexOf('        const state =', anchor);
  const end = source.indexOf('        checks += 3;', start);
  if (anchor < 0 || start < anchor || end < start)
    throw new Error('Missing actual sudo logging evidence scanner');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(start, end));
  let enumerations = 0;
  // Boundary: the actual scanner runs against owned ordinary files with real filesystem, gzip and canonical parser dependencies; no privileged process is reachable.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const invoke = new Function(
    'readFile',
    'lstat',
    'readdir',
    'gunzipSync',
    'parseRegistryCommandResponse',
    'directory',
    'logDirectory',
    'return (async () => {' + body + '; return "verified"; })();',
  ) as (...dependencies: unknown[]) => Promise<unknown>;
  return {
    directory,
    logDirectory,
    state,
    token: state.maintenance.token,
    enumerations: () => enumerations,
    write: (journal: unknown) =>
      writeFile(directory + '/journal.json', JSON.stringify(journal), { mode: 0o600 }),
    run: () =>
      invoke(
        readFile,
        lstat,
        async (path: string) => {
          enumerations++;
          return readdir(path);
        },
        gunzipSync,
        parseRegistryCommandResponse,
        directory,
        logDirectory,
      ),
  };
}

test('actual logging scanner accepts the complete canonical failed-operation journal', async () => {
  const proof = await fixture();
  expect(await proof.run()).toBe('verified');
  expect(proof.enumerations()).toBe(1);
});

const malformed: readonly [string, (state: RegistryJournal) => unknown][] = [
  ['token-only envelope', (state) => ({ maintenance: state.maintenance })],
  ['wrong revision', (state) => ({ ...state, revision: '1' })],
  ['unknown schema', (state) => ({ ...state, schemaVersion: 999 })],
  ['foreign field', (state) => ({ ...state, unexpected: true })],
  [
    'non-UUID token',
    (state) => ({ ...state, maintenance: { ...state.maintenance, token: 'x'.repeat(36) } }),
  ],
  [
    'wrong UUID version',
    (state) => ({
      ...state,
      maintenance: { ...state.maintenance, token: '11111111-1111-1111-8111-111111111111' },
    }),
  ],
  ['inconsistent fence', (state) => ({ ...state, fenceReason: null })],
  ['unfenced recovery', (state) => ({ ...state, fenced: false, fenceReason: null })],
  [
    'foreign evidence owner',
    (state) => ({
      ...state,
      maintenanceEvidence: {
        ...('maintenanceEvidence' in state ? state.maintenanceEvidence : null),
        operationId: 'foreign',
      },
    }),
  ],
];

for (const [name, change] of malformed)
  test('actual logging scanner refuses ' + name + ' before reading logs', async () => {
    const proof = await fixture();
    await proof.write(change(proof.state));
    await requireFailure(proof.run());
    expect(proof.enumerations()).toBe(0);
  });

for (const compression of ['plain', 'gzip'] as const)
  test(
    'actual logging scanner refuses a leaked canonical token in ' + compression + ' logs',
    async () => {
      const proof = await fixture();
      const bytes = Buffer.from('prefix ' + proof.token + ' suffix');
      await writeFile(
        proof.logDirectory + '/stdout',
        compression === 'gzip' ? gzipSync(bytes) : bytes,
      );
      const refusal = await requireFailure(proof.run());
      expect(refusal.message).toBe('Operation token reached sudo input logging');
    },
  );

test('actual logging scanner refuses an absent maintenance owner before reading logs', async () => {
  const proof = await fixture();
  await proof.write({ ...proof.state, maintenance: null, maintenanceEvidence: null });
  await requireFailure(proof.run());
  expect(proof.enumerations()).toBe(0);
});

for (const fault of ['missing', 'unreadable', 'malformed'] as const)
  test('actual logging scanner refuses ' + fault + ' journal before reading logs', async () => {
    const proof = await fixture();
    const path = proof.directory + '/journal.json';
    if (fault === 'missing') await unlink(path);
    else if (fault === 'unreadable') await chmod(path, 0);
    else await writeFile(path, '{"maintenance":');
    try {
      await requireFailure(proof.run());
      expect(proof.enumerations()).toBe(0);
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o600);
    }
  });
