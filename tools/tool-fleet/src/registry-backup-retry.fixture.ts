import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import { openBackupSourceFixture } from './registry-backup-source.fixture';
import { createRegistryBackupStore } from './registry-backup-store';
import { installMaintenanceReaper } from './registry-maintenance-process';
import { readRegistryBytes } from './registry-stream';

const pin = '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Test-owned TLS relay only. Real Restic receives unchanged store arguments and the same held FD3. */
export async function relayOwnedRestic(input: {
  binary: string;
  certificate: string;
  stderr: string;
}) {
  if (hash(await readFile(input.binary)) !== pin) throw new Error('Owned Restic pin differs');
  const child = Bun.spawn([input.binary, '--cacert', input.certificate, ...process.argv.slice(2)], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 3],
  });
  const bounded = async (stream: ReadableStream<Uint8Array>, label: string) => {
    try {
      return await readRegistryBytes(stream, 65536, label);
    } catch (cause) {
      child.kill('SIGKILL');
      throw cause;
    }
  };
  const settled = await Promise.allSettled([
    child.exited,
    bounded(child.stdout, 'Owned Restic stdout'),
    bounded(child.stderr, 'Owned Restic stderr'),
  ]);
  for (const outcome of settled) if (outcome.status === 'rejected') throw outcome.reason;
  const [exit, stdout, stderr] = settled;
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw new Error('Missing owned relay completion');
  await appendFile(input.stderr, stderr.value);
  await Bun.write(Bun.stdout, stdout.value);
  await Bun.write(Bun.stderr, stderr.value);
  process.exitCode = exit.value;
}

/** Actual snapshot and verification; physical admission and effect persistence are explicitly modeled. */
async function snapshotOwnedRepository() {
  const input = type({ binary: 'string', repository: 'string' }).assert(
    JSON.parse(process.argv[2]),
  );
  installMaintenanceReaper();
  const fixture = await openBackupSourceFixture();
  try {
    await writeFile(join(fixture.source.registryPath, 'blob'), 'known ordinary retry witness body');
    const receipt = await createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      signal: new AbortController().signal,
      lifetime: 'worker',
      binary: input.binary,
      binarySha256: hash(await readFile(input.binary)),
      environment: {
        RESTIC_REPOSITORY: input.repository,
        RESTIC_PASSWORD: 'owned-disposable-retry-fixture',
        AWS_ACCESS_KEY_ID: 'owned-fixture-access',
        AWS_SECRET_ACCESS_KEY: 'owned-fixture-secret',
        AWS_DEFAULT_REGION: 'us-east-1',
      },
      sourceLimits: fixture.limits,
      admit: () => Promise.resolve(),
    }).snapshot(fixture.source, fixture.authority);
    console.log(JSON.stringify({ snapshotVerified: /^[a-f0-9]{64}$/.test(receipt.snapshotId) }));
  } finally {
    await fixture.close();
  }
}

/** Actual root-action selection with modeled root/artifact/source ports and real ordinary effect persistence. */
async function observeProfileBinding(repository: string) {
  const { mock, spyOn } = await import('bun:test');
  const reservation = await import('./registry-backup-reservation');
  const store = await import('./registry-backup-store');
  const openReservation = reservation.openRegistryBackupReservation;
  const uid = process.getuid?.();
  if (uid === undefined || uid === 0) throw new Error('Ordinary profile fixture requires UID');
  const fixture = await openBackupSourceFixture();
  const directory = join(fixture.directory, 'backup-effects');
  await mkdir(directory, { mode: 0o700 });
  const statePath = join(directory, 'state.json');
  await writeFile(
    statePath,
    JSON.stringify({
      schemaVersion: 1,
      scope: 'effect-lineage-only',
      generation: 0,
      binding: null,
      snapshot: null,
      inspection: false,
      attempts: [],
      effects: [],
      closedOperationId: null,
    }) + '\n',
    { mode: 0o600 },
  );
  await writeFile(join(directory, 'state.lock'), '', { mode: 0o600 });
  const configuration = {
    repositoryId: 'f'.repeat(64),
    recoveryPins: [],
    sourceLimits: fixture.limits,
    binary: { path: '/root/.puni/tools/restic-0.19.1', sha256: pin },
    password: { path: '/root/.puni/registry/restic.password', sha256: 'a'.repeat(64) },
    environment: { RESTIC_REPOSITORY: repository },
  };
  const capacity = {
    usableBytes: 1073741824,
    allocationUnitBytes: 4096,
    usedBytes: 1024,
    totalInodes: 100000,
    usedInodes: 10,
  };
  const identity = spyOn(process, 'getuid').mockReturnValue(0);
  await mock.module('./registry-maintenance-installation', () => ({
    verifyRegistryHostArtifact: () => Promise.resolve(Buffer.from(JSON.stringify(configuration))),
    requireRegistryRecoveryInstallation: () => {
      throw new Error('Unexpected recovery');
    },
  }));
  await mock.module('./registry-backup-reservation', () => ({
    ...reservation,
    openRegistryBackupReservation: (
      input: Parameters<typeof reservation.openRegistryBackupReservation>[0],
    ) =>
      openReservation({
        ...input,
        uid,
        authorityUid: uid,
        requireLineage: () => Promise.resolve(),
        measure: () => Promise.resolve(capacity),
      }),
  }));
  await mock.module('./registry-backup-store', () => ({
    ...store,
    createRegistryBackupStore: () => ({
      inspectRepository: () => Promise.resolve(configuration.repositoryId),
      inspectRetention: () => Promise.resolve({}),
      prepare: () => Promise.resolve(),
    }),
  }));
  const { executeRegistryBackupAction } = await import('./registry-maintenance-backup');
  // Boundary: only unrelated root/source/artifact fields are modeled; production selection and ordinary durable reservation are real.
  const input = {
    action: 'backup-preflight',
    installed: {
      journalPath: fixture.source.journalPath,
      journalMaximumBytes: 1073741824,
      backupConfiguration: { sha256: 'b'.repeat(64) },
    },
    journal: {
      revision: 7,
      maintenance: { operationId: 'source-proof', token: 'owned-token' },
      enrollment: { registryId: 'proof', storageId: 'owned' },
      maintenanceEvidence: {
        backupAttempts: [
          {
            state: 'prepared',
            action: 'backup-preflight',
            journalRevision: 7,
            id: '00000000-0000-4000-8000-000000000001',
          },
        ],
      },
      lastVerifiedBackup: null,
    },
    descriptor: fixture.authority.authorityDescriptor,
    signal: new AbortController().signal,
    lifetime: 'worker',
    admit: () => Promise.resolve(),
    openVersions: () =>
      Promise.resolve({
        census: () => Promise.resolve([]),
        snapshotVersions: () => Promise.resolve([]),
        removeVersion: () => Promise.reject(new Error('Unexpected removal')),
      }),
  } as unknown as Parameters<typeof executeRegistryBackupAction>[0];
  try {
    await executeRegistryBackupAction(input);
    const before = await readFile(statePath, 'utf8');
    const persisted = type({ binding: { profileSha256: 'string' } }).assert(JSON.parse(before));
    configuration.environment.RESTIC_REPOSITORY = repository.startsWith('s3:')
      ? '/owned-local-repository'
      : 's3:https://fixture.invalid/owned-prefix';
    let driftRefused = false;
    try {
      await executeRegistryBackupAction(input);
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        cause.message !== 'Backup operation binding differs from durable authority'
      )
        throw cause;
      driftRefused = true;
    }
    console.log(
      JSON.stringify({
        profileSha256: persisted.binding.profileSha256,
        driftRefused,
        historyUnchanged: before === (await readFile(statePath, 'utf8')),
      }),
    );
  } finally {
    identity.mockRestore();
    await fixture.close();
  }
}

if (import.meta.main) {
  if (process.argv[2] === 'profile') await observeProfileBinding(process.argv[3]);
  else await snapshotOwnedRepository();
}
