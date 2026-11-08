import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
const GiB = 1024 ** 3;
const enrollment = {
  registryId: 'maintenance',
  storageId: 'volume',
  owners: ['operator'],
  registryPath: '/registry',
  rootPath: '/',
  maximumBytes: 50 * GiB,
  journalMaximumBytes: GiB,
};
const ports: RegistryJournalPorts = {
  measureJournal: () =>
    Promise.resolve().then(() => ({
      usableBytes: GiB,
      allocationUnitBytes: 4096,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
    })),
  measureRegistry: () =>
    Promise.resolve().then(() => ({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    })),
};
async function fixture() {
  const directory = await scratchAsync('registry-maintenance-authority-');
  await chmod(directory, 0o700);
  await executeRegistryCommand(directory, { command: 'initialize', enrollment }, ports);
  return directory;
}
test('explicit maintenance upgrade preserves legacy obligations and creates a fenced evidence boundary', async () => {
  const directory = await fixture();
  const before = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  const upgraded = await executeRegistryCommand(
    directory,
    { command: 'upgrade-maintenance' },
    ports,
  );
  expect(upgraded.state).toMatchObject({
    ...before,
    schemaVersion: 4,
    publicationEvidence: [],
    revision: before.revision + 1,
    updatedAt: upgraded.state.updatedAt,
    fenced: true,
    fenceReason: 'maintenance-upgrade',
    maintenanceEvidence: null,
    lastVerifiedBackup: null,
  });
});
test('active legacy maintenance cannot invent evidence during upgrade', async () => {
  const directory = await fixture();
  await executeRegistryCommand(
    directory,
    {
      command: 'begin-maintenance',
      kind: 'retirement',
      operationId: 'legacy',
      owner: 'operator',
      expectedRevision: 0,
    },
    ports,
  );
  await requireRefusal(
    executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports),
    'legacy maintenance',
  );
  expect(
    (await executeRegistryCommand(directory, { command: 'read' }, ports)).state.schemaVersion,
  ).toBe(3);
});
test('schema4 rejects missing evidence fields and generic phase-only maintenance', async () => {
  const directory = await fixture();
  const upgraded = await executeRegistryCommand(
    directory,
    { command: 'upgrade-maintenance' },
    ports,
  );
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'begin-maintenance',
        kind: 'retirement',
        operationId: 'bypass',
        owner: 'operator',
        expectedRevision: upgraded.state.revision,
      },
      ports,
    ),
    'session',
  );
  const path = join(directory, 'journal.json');
  const stored = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  delete stored['maintenanceEvidence'];
  await writeFile(path, JSON.stringify(stored));
  await requireRefusal(executeRegistryCommand(directory, { command: 'read' }, ports), 'Malformed');
});
test('session holds existing authority lock and failure retains ownership and fence', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'retire', owner: 'operator', kind: 'retirement', recover: false },
      ports,
      async (session) => {
        await requireRefusal(executeRegistryCommand(directory, { command: 'read' }, ports), 'busy');
        expect(session.read().fenced).toBe(true);
        throw new Error('injected retained pull failure');
      },
    ),
    'injected retained pull failure',
  );
  const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  expect(state).toMatchObject({
    fenced: true,
    maintenance: { phase: 'failed', resumePhase: 'acquired', operationId: 'retire' },
  });
});
test('session refuses phase evidence omissions and never clears a failed fence', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'retire', owner: 'operator', kind: 'retirement', recover: false },
      ports,
      async (session) => {
        await session.advance('reconciled');
      },
    ),
    'runtime evidence',
  );
  expect((await executeRegistryCommand(directory, { command: 'read' }, ports)).state.fenced).toBe(
    true,
  );
});
test('session persists independent fence without requesting a registry readonly acknowledgement', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  let confirmations = 0;
  const fullRegistry = {
    ...ports,
    permit: {
      isFresh: () => Promise.resolve().then(() => false),
      prepare: () =>
        Promise.resolve().then(() => {
          throw new Error('unexpected prepare');
        }),
      publish: () =>
        Promise.resolve().then(() => {
          throw new Error('unexpected publish');
        }),
      revoke: () => Promise.resolve(),
      confirmReadonly: () =>
        Promise.resolve().then(() => {
          confirmations++;
          throw new Error('registry ENOSPC');
        }),
    },
  };
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'backup', owner: 'operator', kind: 'backup', recover: false },
      fullRegistry,
      (session) =>
        Promise.resolve().then(() => {
          expect(session.read().fenced).toBe(true);
          throw new Error('stop after independently established fence');
        }),
    ),
    'independently',
  );
  expect(confirmations).toBe(0);
});
test('killed session releases kernel lock but preserves recovery ownership against competing processes', async () => {
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  const marker = join(directory, 'session-started');
  const source = `import { runRegistryMaintenance } from './registry-managed-journal';
    import { writeFile } from 'node:fs/promises';
    const capacities = await Bun.stdin.json();
    const ports = { measureJournal: () => Promise.resolve(capacities.journal), measureRegistry: () => Promise.resolve(capacities.registry) };
    await runRegistryMaintenance(process.argv[1], { operationId: 'crashed', owner: 'operator', kind: 'retirement', recover: false }, ports, async () => {
      await writeFile(process.argv[2], 'held');
      await Bun.sleep(30000);
    });`;
  // The evaluated program is constant; measured capacity travels only through the owned stdin pipe.
  const child = Bun.spawn([process.execPath, '-e', source, directory, marker], {
    cwd: import.meta.dir,
    stdin: Buffer.from(
      JSON.stringify({
        journal: await ports.measureJournal(enrollment),
        registry: await ports.measureRegistry(enrollment),
      }),
    ),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    // Proof: a 1500 ms child startup fails the former one-second wait; five seconds preserves all seven lock/recovery assertions.
    for (let attempt = 0; attempt < 500; attempt++) {
      if (await Bun.file(marker).exists()) break;
      await Bun.sleep(10);
    }
    expect(await Bun.file(marker).text()).toBe('held');
    const contender = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { executeRegistryCommand } from './registry-managed-journal'; await executeRegistryCommand(process.argv[1], {command:'read'}, {measureJournal:async()=>{throw Error('unexpected')},measureRegistry:async()=>{throw Error('unexpected')}});`,
        directory,
      ],
      { cwd: import.meta.dir, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await contender.exited).not.toBe(0);
    expect(await new Response(contender.stderr).text()).toContain('busy');
    child.kill('SIGKILL');
    expect(await child.exited).not.toBe(0);
    const crashed = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
    expect(crashed).toMatchObject({
      fenced: true,
      maintenance: { operationId: 'crashed', phase: 'acquired' },
    });
    const { runRegistryMaintenance } = await import('./registry-managed-journal');
    await requireRefusal(
      runRegistryMaintenance(
        directory,
        { operationId: 'crashed', owner: 'operator', kind: 'retirement', recover: true },
        ports,
        (session) =>
          Promise.resolve().then(() => {
            expect(session.read().maintenance?.token).not.toBe(crashed.maintenance?.token);
            throw new Error('recovery independently fenced');
          }),
      ),
      'independently fenced',
    );
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  }
});
test('genuine prior schema3 writer fixture upgrades without changing any obligation or receipt', async () => {
  const directory = await fixture();
  const prior = JSON.parse(
    await readFile(new URL('./fixtures/registry-schema3.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  await writeFile(join(directory, 'journal.json'), JSON.stringify(prior));
  const upgraded = (
    await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports)
  ).state;
  expect(upgraded).toMatchObject({
    ...prior,
    schemaVersion: 4,
    publicationEvidence: [],
    revision: 4,
    updatedAt: upgraded.updatedAt,
    fenced: true,
    fenceReason: 'maintenance-upgrade',
    maintenanceVerified: false,
    maintenanceEvidence: null,
    lastVerifiedBackup: null,
  });
});
test('session gives native helpers the same held open-file-description lock', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'fd-proof', owner: 'operator', kind: 'backup', recover: false },
      ports,
      async (session) => {
        expect(typeof session.authorityDescriptor).toBe('number');
        const child = Bun.spawn(
          [
            process.execPath,
            '-e',
            `import { readFile } from 'node:fs/promises'; console.log(await readFile('/proc/self/fdinfo/3','utf8')); await Bun.sleep(200);`,
          ],
          { stdio: ['ignore', 'pipe', 'pipe', session.authorityDescriptor] },
        );
        const output = await new Response(child.stdout).text();
        expect(await child.exited).toBe(0);
        expect(output).toMatch(/FLOCK\s+ADVISORY\s+WRITE/);
        await new Response(child.stderr).text();
        throw new Error('lock descriptor verified');
      },
    ),
    'lock descriptor verified',
  );
});
async function requireRefusal(pending: Promise<unknown>, expected: string): Promise<void> {
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    expect(cause.message).toContain(expected);
    return;
  }
  throw new Error('Expected production path to refuse');
}
test('schema4 read refuses maintenance evidence that belongs to another operation', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'owned', owner: 'operator', kind: 'backup', recover: false },
      ports,
      () => Promise.reject(new Error('injected stop')),
    ),
    'injected stop',
  );
  const path = join(directory, 'journal.json');
  const stored = JSON.parse(await readFile(path, 'utf8')) as {
    maintenanceEvidence: {
      operationId: string;
    };
  };
  stored.maintenanceEvidence.operationId = 'foreign';
  await writeFile(path, JSON.stringify(stored));
  await requireRefusal(
    executeRegistryCommand(directory, { command: 'read' }, ports),
    'maintenance evidence ownership',
  );
});
test('retirement receipt cannot precede exact deletion reconciliation', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'early', owner: 'operator', kind: 'retirement', recover: false },
      ports,
      async (session) => {
        await session.retire({} as never);
      },
    ),
    'reconciled deletion',
  );
  const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  expect(state).toMatchObject({ fenced: true, retirements: [], maintenance: { phase: 'failed' } });
});
test('recovery rebind refuses caller-only identity without the trusted server verifier', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'recover', owner: 'operator', kind: 'restore', recover: false },
      ports,
      async (session) => {
        await session.restore();
      },
    ),
    'server recovery verifier',
  );
  const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  expect(state.enrollment).toEqual(enrollment);
  expect(state).toMatchObject({ fenced: true, maintenance: { phase: 'failed' } });
});
test('unverified recovery text cannot bypass pending deletion reconciliation', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'pending', owner: 'operator', kind: 'retirement', recover: false },
      ports,
      async (session) => {
        const initial = session.read().maintenanceEvidence;
        if (initial === null) throw new Error('Missing fixture evidence');
        await session.record({ ...initial, runtime: 'observed' });
        await session.advance('reconciled');
        await session.advance('fenced');
        await session.advance('stopped');
        await session.record({
          ...initial,
          runtime: 'observed',
          backup: {
            snapshotId: 'a'.repeat(64),
            verifiedAt: new Date().toISOString(),
            registryId: enrollment.registryId,
            storageId: enrollment.storageId,
            registryPath: enrollment.registryPath,
            journalPath: directory,
            journalRevision: session.read().revision,
            journalSha256: 'b'.repeat(64),
            censusSha256: 'c'.repeat(64),
            bytes: 1,
          },
          plan: '{}',
          deletions: [
            {
              repository: 'owned/image',
              digest: 'sha256:' + 'd'.repeat(64),
              tags: [],
              state: 'pending',
            },
          ],
          recovery: 'unverified',
        });
        await session.advance('backed-up');
        await session.advance('deleting');
        await session.advance('collected');
      },
    ),
    'Incomplete manifest deletion reconciliation',
  );
});
for (const change of ['clear', 'replace'] as const) {
  test(`verified operation backup cannot ${change} its recovery lineage`, async () => {
    const { runRegistryMaintenance } = await import('./registry-managed-journal');
    const directory = await fixture();
    await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
    await requireRefusal(
      runRegistryMaintenance(
        directory,
        { operationId: 'backup-lineage', owner: 'operator', kind: 'backup', recover: false },
        ports,
        async (session) => {
          const initial = session.read().maintenanceEvidence;
          if (initial === null) throw new Error('Missing fixture evidence');
          const backup = {
            snapshotId: 'a'.repeat(64),
            verifiedAt: new Date().toISOString(),
            registryId: enrollment.registryId,
            storageId: enrollment.storageId,
            registryPath: enrollment.registryPath,
            journalPath: directory,
            journalRevision: session.read().revision,
            journalSha256: 'b'.repeat(64),
            censusSha256: 'c'.repeat(64),
            bytes: 1,
          };
          await session.record({ ...initial, backup });
          await session.record({
            ...initial,
            backup: change === 'clear' ? null : { ...backup, snapshotId: 'd'.repeat(64) },
          });
        },
      ),
      'Cannot replace verified maintenance backup',
    );
    const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
    expect(state).toMatchObject({
      lastVerifiedBackup: { snapshotId: 'a'.repeat(64) },
      fenced: true,
    });
  });
}
test('eventual retirement receipt and failure replacement must fit before destructive phase', async () => {
  const { runRegistryMaintenance } = await import('./registry-managed-journal');
  const directory = await fixture();
  const initial = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  const digests = Array.from(
    { length: 250 },
    (_, index) => `sha256:${index.toString(16).padStart(64, '0')}`,
  );
  initial.bundles.push({
    operationId: 'old',
    owner: 'operator',
    product: 'old',
    roots: [digests[0]],
    references: [{ repository: 'old/image', digest: digests[0] }],
    receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' },
  });
  await writeFile(join(directory, 'journal.json'), JSON.stringify(initial));
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  let limited = false;
  let destructiveReached = false;
  const bounded: RegistryJournalPorts = {
    ...ports,
    measureJournal: () =>
      invokeRegistryCallback(() => ({
        usableBytes: limited ? 180000 : GiB,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
        totalInodes: 10000,
        usedInodes: 10,
      })),
  };
  await requireRefusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'bounded-retire', owner: 'operator', kind: 'retirement', recover: false },
      bounded,
      async (session) => {
        const first = session.read().maintenanceEvidence;
        if (first === null) throw new Error('Missing evidence');
        await session.record({ ...first, runtime: 'owned fixture barrier' });
        await session.advance('reconciled');
        await session.advance('fenced');
        await session.advance('stopped');
        const state = session.read();
        const evidence = state.maintenanceEvidence;
        if (evidence === null) throw new Error('Missing evidence');
        await session.record({
          ...evidence,
          backup: {
            snapshotId: 'a'.repeat(64),
            verifiedAt: new Date().toISOString(),
            registryId: state.enrollment.registryId,
            storageId: state.enrollment.storageId,
            registryPath: state.enrollment.registryPath,
            journalPath: directory,
            journalRevision: state.revision,
            journalSha256: 'b'.repeat(64),
            censusSha256: 'c'.repeat(64),
            bytes: 1000,
          },
        });
        await session.advance('backed-up');
        // Trusted planner/backup/runtime are fixtures here: this isolates the real authority's serialized footprint admission before any external callback.
        const plan = {
          schemaVersion: 1 as const,
          binding: {
            journalRevision: session.read().revision,
            obligationsSha256: 'a'.repeat(64),
            censusSha256: 'b'.repeat(64),
            filesystem: 'owned',
            identity: {
              registryId: 'maintenance',
              storageId: 'volume',
              node: 'owned',
              pvcUid: 'owned',
              mountIdentity: 'owned',
              distributionDigest: 'sha256:' + 'c'.repeat(64),
              binarySha256: 'd'.repeat(64),
            },
          },
          options: {
            now: new Date().toISOString(),
            mode: 'nightly' as const,
            capacity: await ports.measureRegistry(state.enrollment),
          },
          retireRevisions: [{ repository: 'old/image', digest: digests[0] }],
          retireBlobs: digests,
          retireUploads: [],
          neverUploaded: [],
          policy: {
            retireOperations: ['old'],
            retireDigests: digests,
            retained: [],
            estimatedReclaimableBytes: 100,
            estimatedReclaimableInodes: 1,
            protectedBytes: 0,
            protectedOwners: [],
            unmetBytes: 0,
            unmetInodes: 0,
            targetReached: true,
          },
        };
        const current = session.read().maintenanceEvidence;
        if (current === null) throw new Error('Missing evidence');
        await session.record({
          ...current,
          plan: JSON.stringify(plan),
          deletions: [{ repository: 'old/image', digest: digests[0], tags: [], state: 'pending' }],
        });
        limited = true;
        await session.prepareRetirement(plan);
        await session.advance('deleting');
        destructiveReached = true;
        throw new Error('Destructive callback was reached without eventual receipt capacity');
      },
    ),
    'Insufficient journal capacity',
  );
  expect(destructiveReached).toBe(false);
  const failed = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  expect(failed).toMatchObject({
    fenced: true,
    retirements: [],
    maintenance: { phase: 'failed', resumePhase: 'backed-up' },
  });
});
test('repeated exact retirement receipts preserve original provenance and restore clears only its operation plus snapshot lineage', async () => {
  const { projectRegistryRecovery } = await import('./registry-managed-journal');
  const directory = await fixture();
  const state = (await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports))
    .state;
  if (state.schemaVersion !== 4) throw new Error('Missing schema4');
  const references = [1, 2, 3].map((index) => ({
    repository: 'old/image',
    digest: 'sha256:' + String(index).repeat(64),
  }));
  state.bundles.push({
    operationId: 'old',
    owner: 'operator',
    product: 'old',
    roots: references.map((reference) => reference.digest),
    references,
    receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' },
  });
  state.closedOperations.push('before', 'later');
  state.maintenance = {
    operationId: 'recover',
    owner: 'operator',
    token: '00000000-0000-4000-8000-000000000001',
    kind: 'retirement',
    phase: 'failed',
    resumePhase: 'deleting',
    failure: 'owned fixture failure',
  };
  state.maintenanceEvidence = {
    operationId: 'recover',
    runtime: 'fixture',
    plan: '{}',
    retained: [],
    deletions: [],
    recovery: null,
    uploadsVerified: 'e'.repeat(64),
    backupCensusSha256: 'c'.repeat(64),
    backupAttempts: [],
    backupReconciliation: null,
    backupReconciliations: [],
    backup: {
      snapshotId: 'b'.repeat(64),
      verifiedAt: state.updatedAt,
      registryId: state.enrollment.registryId,
      storageId: state.enrollment.storageId,
      registryPath: state.enrollment.registryPath,
      journalPath: directory,
      journalRevision: state.revision,
      journalSha256: 'a'.repeat(64),
      censusSha256: 'c'.repeat(64),
      bytes: 1000,
    },
  };
  state.retirements = ['before', 'recover', 'later'].map((operationId, index) => ({
    operationId,
    operations: ['old'],
    planSha256: 'd'.repeat(64),
    snapshotId: 'b'.repeat(64),
    uploadsSha256: 'e'.repeat(64),
    retireBlobs: [references[index].digest],
    neverUploaded: [],
    at: state.updatedAt,
    deletions: [{ ...references[index], tags: [] }],
  }));
  await writeFile(join(directory, 'journal.json'), JSON.stringify(state));
  const read = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  if (read.schemaVersion !== 4) throw new Error('Missing schema4');
  const target = {
    registryPath: '/new/owned/registry',
    storageId: 'new-owned',
    maximumBytes: state.enrollment.maximumBytes,
  };
  const restored = projectRegistryRecovery(read, target);
  expect(restored.retirements.map((receipt) => receipt.operationId)).toEqual(['before', 'later']);
  expect(restored.bundles).toEqual(read.bundles);
  expect(restored.protections).toEqual(read.protections);
  expect(restored.environments).toEqual(read.environments);
  const backup = read.maintenanceEvidence?.backup;
  if (backup === null || backup === undefined) throw new Error('Missing backup');
  backup.snapshotId = 'f'.repeat(64);
  expect(projectRegistryRecovery(read, target).retirements).toEqual(read.retirements);
});
