import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { settleRegistryClientFixture } from './registry-client-completion.fixture';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryJournalPorts,
  type RegistryMaintenanceSession,
} from './registry-journal';
import { maintainRegistry, type RegistryMaintenanceRuntime } from './registry-maintenance';
import { requireRejection } from './registry-rejection.fixture';
import { readRegistryBytes } from './registry-stream';
import { discardRegistryUploads } from './registry-upload-census';

function parseFixtureJournal(serialized: string) {
  const journal = parseRegistryCommandResponse({ state: JSON.parse(serialized) as unknown }).state;
  if (journal.schemaVersion !== 4) throw new Error('Expected actual maintenance fixture journal');
  return journal;
}
const RootObservation = type({ effects: 'number.integer >= 0', message: 'string', '+': 'reject' });
const GiB = 1024 ** 3;
async function fixture(
  fault: 'none' | 'backup' | 'verify' | 'writer' | 'preflight' | 'client' | 'client-settlement',
) {
  const directory = await scratchAsync('registry-maintenance-');
  const journalPath = join(directory, 'journal');
  const registryPath = join(directory, 'registry');
  await mkdir(journalPath, { mode: 0o700 });
  await mkdir(join(registryPath, 'docker/registry/v2/repositories'), { recursive: true });
  await mkdir(join(registryPath, 'docker/registry/v2/blobs/sha256'), { recursive: true });
  const calls: string[] = [];
  const ports: RegistryJournalPorts = {
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
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
    verifyConsumers: () => Promise.resolve(),
    collectConsumers: (sources, revision) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'observed',
          references: [],
        })),
      ),
  };
  await executeRegistryCommand(
    journalPath,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
        storageId: 'proof',
        owners: ['owner'],
        registryPath,
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  await executeRegistryCommand(journalPath, { command: 'upgrade-maintenance' }, ports);
  const state = (await executeRegistryCommand(journalPath, { command: 'read' }, ports)).state;
  state.consumers.push({
    id: 'host',
    owner: 'owner',
    environment: null,
    kind: 'docker-host',
    source: '/owned/host.json',
    configurationSha256: 'a'.repeat(64),
    role: 'consumer',
  });
  await writeFile(join(journalPath, 'journal.json'), JSON.stringify(state));
  await chmod(join(journalPath, 'journal.json'), 0o600);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ repositories: [] }),
  });
  const identity = {
    registryId: 'proof',
    storageId: 'proof',
    node: 'fixture',
    pvcUid: 'owned',
    mountIdentity: 'owned',
    distributionDigest: 'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
    binarySha256: '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37',
  };
  const runtime: RegistryMaintenanceRuntime = {
    inspect: () => Promise.resolve('prior-state'),
    fence: () => {
      calls.push('fence');
      return Promise.resolve('fresh-controller-barrier');
    },
    assertStopped: () => {
      calls.push('stopped');
      return fault === 'writer' ? Promise.reject(new Error('surviving writer')) : Promise.resolve();
    },
    identify: () => Promise.resolve(identity),
    open: () => {
      calls.push('open');
      return Promise.resolve({
        endpoint: { url: server.url.toString() },
        close: () => {
          calls.push('close');
          return Promise.resolve();
        },
      });
    },
    discardUploads: async (session) => {
      const state = session.read();
      return discardRegistryUploads(state, new AbortController().signal);
    },
    collect: () => {
      calls.push('gc');
      return Promise.resolve();
    },
    verifyImages: async (authority, inventory) => {
      calls.push('client');
      if (fault === 'client') throw new Error('client pull failed');
      if (fault !== 'client-settlement') await settleRegistryClientFixture(authority, inventory);
    },
    restoreService: () => {
      calls.push('restore');
      return Promise.resolve();
    },
  };
  const backup = {
    prepare: () => {
      calls.push('preflight');
      return fault === 'preflight'
        ? Promise.reject(new Error('Backup preflight failed'))
        : Promise.resolve();
    },
    snapshot: async (source: { journalRevision: number; censusSha256: string }) => {
      calls.push('backup');
      if (fault === 'backup') throw new Error('corrupted backup');
      const bytes = await readFile(join(journalPath, 'journal.json'));
      return {
        snapshotId: 'a'.repeat(64),
        verifiedAt: new Date().toISOString(),
        registryId: 'proof',
        storageId: 'proof',
        registryPath,
        journalPath,
        journalRevision: source.journalRevision,
        journalSha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
        censusSha256: source.censusSha256,
        bytes: bytes.length,
      };
    },
    verify: () => {
      calls.push('verify');
      return fault === 'verify'
        ? Promise.reject(new Error('backup verification failed'))
        : Promise.resolve();
    },
  };
  return { journalPath, ports, runtime, backup, calls, server };
}
for (const fault of [
  'none',
  'backup',
  'verify',
  'writer',
  'preflight',
  'client',
  'client-settlement',
] as const) {
  test(`backup lifecycle ${fault} retains authority fence and only restores on verified success`, async () => {
    const proof = await fixture(fault);
    try {
      const pending = maintainRegistry({
        directory: proof.journalPath,
        operationId: 'backup',
        owner: 'owner',
        kind: 'backup',
        ports: proof.ports,
        runtime: proof.runtime,
        backup: proof.backup,
      });
      if (fault === 'none') await pending;
      else {
        let refused = false;
        try {
          await pending;
        } catch (cause) {
          refused = true;
          expect(cause instanceof Error ? cause.message : '').toContain(
            fault === 'preflight'
              ? 'Backup preflight failed'
              : fault === 'backup'
                ? 'corrupted backup'
                : fault === 'verify'
                  ? 'backup verification failed'
                  : fault === 'client'
                    ? 'client pull failed'
                    : fault === 'client-settlement'
                      ? 'client completion'
                      : 'surviving writer',
          );
        }
        expect(refused).toBe(true);
      }
      const state = (
        await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
      ).state;
      expect(state.fenced).toBe(true);
      expect(proof.calls.includes('restore')).toBe(fault === 'none');
      expect(state.maintenance === null).toBe(fault === 'none');
      if (fault === 'writer') expect(proof.calls.includes('backup')).toBe(false);
      if (fault === 'preflight') expect(proof.calls.includes('fence')).toBe(false);
    } finally {
      await proof.server.stop(true);
    }
  });
}

test('failed pre-backup maintenance resumes its same durable operation after the dependency recovers', async () => {
  const proof = await fixture('preflight');
  try {
    let refused = false;
    try {
      await maintainRegistry({
        directory: proof.journalPath,
        operationId: 'retry',
        owner: 'owner',
        kind: 'backup',
        ports: proof.ports,
        runtime: proof.runtime,
        backup: proof.backup,
      });
    } catch (cause) {
      refused = true;
      expect((cause as Error).message).toBe('Backup preflight failed');
    }
    expect(refused).toBe(true);
    proof.backup.prepare = () => Promise.resolve();
    await maintainRegistry({
      directory: proof.journalPath,
      operationId: 'retry',
      owner: 'owner',
      kind: 'backup',
      recover: true,
      ports: proof.ports,
      runtime: proof.runtime,
      backup: proof.backup,
    });
    const state = (
      await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
    ).state;
    expect(state).toMatchObject({ fenced: true, maintenance: null });
    expect(proof.calls.filter((call) => call === 'fence')).toHaveLength(1);
  } finally {
    await proof.server.stop(true);
  }
});

for (const writer of ['absent', 'surviving'] as const) {
  test(`maintenance with unavailable readonly ACK requires independent writer ${writer}`, async () => {
    const proof = await fixture('none');
    try {
      await maintainRegistry({
        directory: proof.journalPath,
        operationId: 'prior-verified-backup',
        owner: 'owner',
        kind: 'backup',
        ports: proof.ports,
        runtime: proof.runtime,
        backup: proof.backup,
      });
      const prior = (
        await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
      ).state;
      if (prior.schemaVersion !== 4) throw new Error('Expected upgraded prior journal');
      expect(prior.lastVerifiedBackup).not.toBeNull();
      proof.calls.length = 0;
      let confirmations = 0;
      let snapshots = 0;
      const noSpace = Object.assign(new Error('modeled registry ACK ENOSPC'), { code: 'ENOSPC' });
      const surviving = new Error('modeled surviving writer');
      const stoppedAfterVerification = new Error('owned fixture stops before service restoration');
      const pressure: RegistryJournalPorts = {
        ...proof.ports,
        measureRegistry: async (enrollment) => {
          const capacity = await proof.ports.measureRegistry(enrollment);
          return { ...capacity, usedBytes: capacity.maximumBytes };
        },
        permit: {
          isFresh: () => Promise.resolve(false),
          prepare: () => Promise.reject(new Error('Unexpected writable prepare')),
          publish: () => Promise.reject(new Error('Unexpected writable publish')),
          revoke: () => Promise.resolve(),
          confirmReadonly: () => {
            confirmations++;
            return Promise.reject(noSpace);
          },
        },
      };
      const pending = maintainRegistry({
        directory: proof.journalPath,
        operationId: 'full-registry-backup',
        owner: 'owner',
        kind: 'backup',
        ports: pressure,
        runtime: {
          ...proof.runtime,
          assertStopped: () => {
            proof.calls.push('independent-stop');
            return writer === 'surviving' ? Promise.reject(surviving) : Promise.resolve();
          },
          restoreService: () => Promise.reject(stoppedAfterVerification),
        },
        backup: {
          ...proof.backup,
          snapshot: async (source, authority) => {
            snapshots++;
            expect(proof.calls).toContain('independent-stop');
            expect(authority.read().fenced).toBe(true);
            const canonical = parseFixtureJournal(
              await readFile(join(proof.journalPath, 'journal.json'), 'utf8'),
            ) as { revision: number; fenced: boolean };
            expect(canonical.fenced).toBe(true);
            expect(canonical.revision).toBe(authority.read().revision);
            await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports).then(
              () => {
                throw new Error('Competing command acquired held journal');
              },
              (cause: unknown) => {
                expect(cause).toBeInstanceOf(Error);
                if (!(cause instanceof Error)) throw cause;
                expect(cause.message).toContain('busy');
              },
            );
            return { ...(await proof.backup.snapshot(source)), snapshotId: 'b'.repeat(64) };
          },
        },
      });
      await pending.then(
        () => {
          throw new Error('Expected controlled maintenance refusal');
        },
        (cause: unknown) => {
          expect(cause).toBe(writer === 'surviving' ? surviving : stoppedAfterVerification);
        },
      );
      expect(confirmations).toBe(0);
      expect(snapshots).toBe(writer === 'surviving' ? 0 : 1);
      expect(proof.calls).not.toContain('restore');
      if (writer === 'surviving') {
        expect(proof.calls).not.toContain('open');
        expect(proof.calls).not.toContain('backup');
        expect(proof.calls).not.toContain('verify');
      }
      const failed = (
        await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
      ).state;
      if (failed.schemaVersion !== 4) throw new Error('Expected actual maintenance journal');
      expect(failed.fenced).toBe(true);
      if (writer === 'surviving')
        expect(failed.lastVerifiedBackup).toEqual(prior.lastVerifiedBackup);
      else {
        if (failed.maintenanceEvidence === null)
          throw new Error('Missing new verified backup evidence');
        expect(failed.lastVerifiedBackup).toEqual(failed.maintenanceEvidence.backup);
        expect(failed.lastVerifiedBackup?.snapshotId).toBe('b'.repeat(64));
      }
      expect(failed.maintenance).toMatchObject({
        operationId: 'full-registry-backup',
        phase: 'failed',
        resumePhase: writer === 'surviving' ? 'fenced' : 'verified',
      });
      expect(failed.schemaVersion).toBe(4);
      expect(failed.maintenanceEvidence?.backup?.snapshotId).toBe(
        writer === 'surviving' ? undefined : 'b'.repeat(64),
      );
    } finally {
      await proof.server.stop(true);
    }
  });
}

for (const growth of [false, true]) {
  test(`retirement persists measured bytes and inodes before restoration: ${growth ? 'growth' : 'reclaimed'}`, async () => {
    const proof = await fixture('none');
    const physical = { collected: false };
    const now = new Date(Date.now() + 1000).toISOString();
    const ports: RegistryJournalPorts = {
      ...proof.ports,
      now: () => now,
      measureRegistry: async (enrollment) => ({
        ...(await proof.ports.measureRegistry(enrollment)),
        usedBytes: physical.collected ? (growth ? GiB + 500 : GiB - 200) : GiB,
        usedInodes: physical.collected ? (growth ? 15 : 7) : 10,
      }),
    };
    try {
      await maintainRegistry({
        directory: proof.journalPath,
        operationId: 'measured-retirement',
        owner: 'owner',
        kind: 'retirement',
        ports,
        backup: proof.backup,
        runtime: {
          ...proof.runtime,
          collect: async (authority) => {
            const before = authority.read().maintenanceEvidence?.reclamation;
            expect(before?.before.usedBytes).toBe(GiB);
            expect(before?.after).toBeNull();
            physical.collected = true;
            await proof.runtime.collect(authority);
          },
          restoreService: async (authority) => {
            const persisted = parseFixtureJournal(
              await readFile(join(proof.journalPath, 'journal.json'), 'utf8'),
            );
            const receipt = persisted.maintenanceEvidence?.reclamation;
            if (receipt?.after == null || persisted.maintenanceEvidence?.plan == null)
              throw new Error('Missing persisted completed receipt');
            expect(receipt).toMatchObject({
              operationId: 'measured-retirement',
              storageId: 'proof',
              registryPath: authority.read().enrollment.registryPath,
              snapshotId: 'a'.repeat(64),
              before: { at: now, usedBytes: GiB, usedInodes: 10 },
              after: {
                at: now,
                usedBytes: growth ? GiB + 500 : GiB - 200,
                usedInodes: growth ? 15 : 7,
              },
              reclaimedBytes: growth ? -500 : 200,
              reclaimedInodes: growth ? -5 : 3,
            });
            expect(receipt.after.journalRevision).toBe(persisted.revision - 1);
            expect(receipt.before.journalRevision).toBeLessThan(receipt.after.journalRevision);
            expect(receipt.planSha256).toBe(
              new Bun.CryptoHasher('sha256')
                .update(persisted.maintenanceEvidence.plan)
                .digest('hex'),
            );
            await proof.runtime.restoreService(authority);
          },
        },
      });
      expect(physical.collected).toBe(true);
      const finished = (await executeRegistryCommand(proof.journalPath, { command: 'read' }, ports))
        .state;
      expect(finished.maintenance).toBeNull();
      expect(proof.calls.includes('restore')).toBe(true);
    } finally {
      await proof.server.stop(true);
    }
  });
}

for (const stage of ['before', 'after'] as const) {
  for (const fault of [
    'failure',
    'slow',
    'maximum',
    'nan',
    'inodes',
    'usable',
    'total-inodes',
  ] as const) {
    test(`retirement ${stage} measurement ${fault} preserves durable fence before restoration`, async () => {
      const proof = await fixture('none');
      const physical = { collected: false, clock: Date.now() + 1000 };
      const ports: RegistryJournalPorts = {
        ...proof.ports,
        now: () => new Date(physical.clock).toISOString(),
        measureRegistry: async (enrollment) => {
          const capacity = await proof.ports.measureRegistry(enrollment);
          if (physical.collected !== (stage === 'after')) return capacity;
          if (fault === 'failure') throw new Error('measurement unavailable');
          if (fault === 'slow') physical.clock += 60001;
          return {
            ...capacity,
            ...(fault === 'maximum' ? { maximumBytes: capacity.maximumBytes + 1 } : {}),
            ...(fault === 'nan' ? { usedBytes: NaN } : {}),
            ...(fault === 'inodes' ? { usedInodes: capacity.totalInodes + 1 } : {}),
            ...(fault === 'usable'
              ? { usableBytes: stage === 'before' ? 0 : capacity.usableBytes - 1 }
              : {}),
            ...(fault === 'total-inodes'
              ? { totalInodes: stage === 'before' ? 0 : capacity.totalInodes - 1 }
              : {}),
          };
        },
      };
      try {
        const refused = await requireRejection(
          maintainRegistry({
            directory: proof.journalPath,
            operationId: 'measured-failure',
            owner: 'owner',
            kind: 'retirement',
            ports,
            backup: proof.backup,
            runtime: {
              ...proof.runtime,
              collect: async (authority) => {
                physical.collected = true;
                await proof.runtime.collect(authority);
              },
            },
          }),
        );
        expect(refused.cause).toBeInstanceOf(Error);
        expect(physical.collected).toBe(stage === 'after');
        expect(proof.calls.includes('restore')).toBe(false);
        const persisted = (
          await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
        ).state;
        expect(persisted.fenced).toBe(true);
        expect(persisted.maintenance?.phase).toBe('failed');
        expect(persisted.maintenance?.resumePhase).toBe(
          stage === 'after' ? 'collected' : 'backed-up',
        );
        if (persisted.schemaVersion !== 4) throw new Error('Expected maintenance journal');
        expect(persisted.maintenanceEvidence?.reclamation?.after).toBe(
          stage === 'after' ? null : undefined,
        );
      } finally {
        await proof.server.stop(true);
      }
    });
  }
}

for (const directoryFailure of [false, true]) {
  test(`reclamation acknowledgement ${directoryFailure ? 'directory' : 'file'} fsync failure cannot restore service`, async () => {
    const proof = await fixture('none');
    const failure = { injected: false };
    const ports: RegistryJournalPorts = {
      ...proof.ports,
      sync: async (descriptor) => {
        const stat = await descriptor.stat();
        if (!failure.injected && stat.isDirectory() === directoryFailure) {
          let serialized: string;
          if (directoryFailure)
            serialized = await readFile(join(proof.journalPath, 'journal.json'), 'utf8');
          else {
            serialized = await readFile(`/proc/self/fd/${String(descriptor.fd)}`, 'utf8');
          }
          const pending = parseFixtureJournal(serialized);
          if (pending.maintenanceEvidence?.reclamation?.after != null) {
            failure.injected = true;
            throw new Error('reclamation acknowledgement fsync failed');
          }
        }
        await descriptor.sync();
      },
    };
    try {
      const refused = await requireRejection(
        maintainRegistry({
          directory: proof.journalPath,
          operationId: 'sync-failure',
          owner: 'owner',
          kind: 'retirement',
          ports,
          runtime: proof.runtime,
          backup: proof.backup,
        }),
      );
      expect(refused.throwCause).toThrow('reclamation acknowledgement fsync failed');
      expect(failure.injected).toBe(true);
      expect(proof.calls.includes('restore')).toBe(false);
      const persisted = (
        await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
      ).state;
      expect(persisted.fenced).toBe(true);
      expect(persisted.maintenance?.phase).toBe('failed');
    } finally {
      await proof.server.stop(true);
    }
  });
}

test('generic evidence cannot invent or erase authority-measured reclamation', async () => {
  for (const erase of [false, true]) {
    const proof = await fixture('none');
    try {
      const refused = await requireRejection(
        maintainRegistry({
          directory: proof.journalPath,
          operationId: 'generic-record',
          owner: 'owner',
          kind: 'retirement',
          ports: proof.ports,
          backup: proof.backup,
          runtime: {
            ...proof.runtime,
            collect: async (authority) => {
              // Boundary: the actual callback receives the held session; its public runtime type intentionally hides mutation methods.
              const session = authority as RegistryMaintenanceSession;
              const evidence = session.read().maintenanceEvidence;
              if (evidence?.reclamation === undefined) throw new Error('Missing measured baseline');
              if (erase) delete evidence.reclamation;
              else evidence.reclamation.before.usedBytes = 1;
              await session.record(evidence);
            },
          },
        }),
      );
      expect(refused.throwCause).toThrow('Generic record cannot change measured reclamation');
      expect(proof.calls.includes('restore')).toBe(false);
    } finally {
      await proof.server.stop(true);
    }
  }
});

async function observeRootRestoration(journal: unknown, mode: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-reclamation-host.fixture.ts', import.meta.url).pathname,
      mode,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  await child.stdin.write(JSON.stringify({ state: journal }));
  await child.stdin.end();
  const [exit, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 65536, 'root restoration observation'),
    readRegistryBytes(child.stderr, 65536, 'root restoration errors'),
  ]);
  if (exit !== 0)
    throw new Error('Root restoration fixture failed: ' + new TextDecoder().decode(errors));
  expect(errors.byteLength).toBe(0);
  return RootObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}

test('root restoration refuses missing stale or changed reclamation before trusted effects', async () => {
  const proof = await fixture('none');
  try {
    await maintainRegistry({
      directory: proof.journalPath,
      operationId: 'root-receipt',
      owner: 'owner',
      kind: 'retirement',
      ports: proof.ports,
      backup: proof.backup,
      runtime: {
        ...proof.runtime,
        restoreService: async () => {
          const persisted = parseFixtureJournal(
            await readFile(join(proof.journalPath, 'journal.json'), 'utf8'),
          );
          for (const mode of [
            'valid',
            'missing',
            'incomplete',
            'stale',
            'future',
            'revision',
            'operation',
            'store',
            'path',
            'capacity',
            'snapshot',
            'plan',
            'bytes',
            'inodes',
          ]) {
            const observed = await observeRootRestoration(persisted, mode);
            expect({ mode, ...observed }).toMatchObject({ effects: mode === 'valid' ? 1 : 0 });
            expect(observed.message === 'trusted-effect-boundary').toBe(mode === 'valid');
          }
        },
      },
    });
  } finally {
    await proof.server.stop(true);
  }
}, 20000);

for (const delayedPhase of ['collected', 'verified'] as const) {
  test(
    'retirement cannot restore after its acknowledged measurement expires at ' + delayedPhase,
    async () => {
      const proof = await fixture('none');
      const clock = { at: Date.now() + 1000, delayed: false };
      const ports: RegistryJournalPorts = {
        ...proof.ports,
        now: () => new Date(clock.at).toISOString(),
        sync: async (descriptor) => {
          if (!clock.delayed && (await descriptor.stat()).isFile()) {
            const pending = parseFixtureJournal(
              await readFile(`/proc/self/fd/${String(descriptor.fd)}`, 'utf8'),
            );
            if (
              pending.maintenance?.phase === delayedPhase &&
              pending.maintenanceEvidence?.reclamation?.after != null
            ) {
              clock.delayed = true;
              clock.at += 60001;
            }
          }
          await descriptor.sync();
        },
      };
      try {
        const refused = await requireRejection(
          maintainRegistry({
            directory: proof.journalPath,
            operationId: 'expired-restoration',
            owner: 'owner',
            kind: 'retirement',
            ports,
            runtime: proof.runtime,
            backup: proof.backup,
          }),
        );
        expect(refused.throwCause).toThrow('Stale reclamation measurement');
        expect(clock.delayed).toBe(true);
        expect(proof.calls.includes('restore')).toBe(false);
        const failed = (await executeRegistryCommand(proof.journalPath, { command: 'read' }, ports))
          .state;
        expect(failed.fenced).toBe(true);
        expect(failed.maintenance?.resumePhase).toBe(delayedPhase);
      } finally {
        await proof.server.stop(true);
      }
    },
  );
}

for (const field of [
  'operation',
  'snapshot',
  'store',
  'path',
  'before-revision',
  'before-future',
  'after-revision',
  'after-order',
  'after-time',
  'after-future',
  'maximum',
  'usable',
  'total-inodes',
  'bytes',
  'inodes',
  'plan',
] as const) {
  test('canonical journal read refuses corrupted reclamation ' + field, async () => {
    const proof = await fixture('none');
    try {
      await maintainRegistry({
        directory: proof.journalPath,
        operationId: 'persisted-lineage',
        owner: 'owner',
        kind: 'retirement',
        ports: proof.ports,
        runtime: proof.runtime,
        backup: proof.backup,
      });
      const path = join(proof.journalPath, 'journal.json');
      const changed = parseFixtureJournal(await readFile(path, 'utf8'));
      const receipt = changed.maintenanceEvidence?.reclamation;
      if (receipt?.after == null) throw new Error('Missing completed journal receipt');
      if (field === 'operation') receipt.operationId = 'foreign';
      if (field === 'snapshot') receipt.snapshotId = 'b'.repeat(64);
      if (field === 'store') receipt.storageId = 'foreign';
      if (field === 'path') receipt.registryPath = '/foreign';
      if (field === 'before-revision') receipt.before.journalRevision = changed.revision + 1;
      if (field === 'before-future')
        receipt.before.at = new Date(Date.parse(changed.updatedAt) + 1).toISOString();
      if (field === 'after-revision') receipt.after.journalRevision = changed.revision + 1;
      if (field === 'after-order') receipt.after.journalRevision = receipt.before.journalRevision;
      if (field === 'after-time')
        receipt.after.at = new Date(Date.parse(receipt.before.at) - 1).toISOString();
      if (field === 'after-future')
        receipt.after.at = new Date(Date.parse(changed.updatedAt) + 1).toISOString();
      if (field === 'maximum') receipt.after.maximumBytes++;
      if (field === 'usable') receipt.after.usableBytes++;
      if (field === 'total-inodes') receipt.after.totalInodes++;
      if (field === 'bytes') receipt.reclaimedBytes = 123;
      if (field === 'inodes') receipt.reclaimedInodes = 2;
      if (field === 'plan') receipt.planSha256 = 'c'.repeat(64);
      await writeFile(path, JSON.stringify(changed));
      const refused = await requireRejection(
        executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports),
      );
      expect(refused.throwCause).toThrow('Reclamation receipt');
    } finally {
      await proof.server.stop(true);
    }
  });
}

for (const field of ['revision', 'time'] as const) {
  test('canonical read refuses corrupted before-only measurement ' + field, async () => {
    const proof = await fixture('none');
    try {
      const refused = await requireRejection(
        maintainRegistry({
          directory: proof.journalPath,
          operationId: 'before-only',
          owner: 'owner',
          kind: 'retirement',
          ports: proof.ports,
          backup: proof.backup,
          runtime: {
            ...proof.runtime,
            collect: () => {
              throw new Error('stopped before collection');
            },
          },
        }),
      );
      expect(refused.throwCause).toThrow('stopped before collection');
      const path = join(proof.journalPath, 'journal.json');
      const changed = parseFixtureJournal(await readFile(path, 'utf8'));
      const receipt = changed.maintenanceEvidence?.reclamation;
      if (receipt?.after !== null) throw new Error('Expected incomplete baseline');
      if (field === 'revision') receipt.before.journalRevision = changed.revision + 1;
      else receipt.before.at = new Date(Date.parse(changed.updatedAt) + 1).toISOString();
      await writeFile(path, JSON.stringify(changed));
      const corrupted = await requireRejection(
        executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports),
      );
      expect(corrupted.throwCause).toThrow('Reclamation receipt differs');
    } finally {
      await proof.server.stop(true);
    }
  });
}

test('retirement cannot record its final measurement before offline collection', async () => {
  const proof = await fixture('none');
  try {
    const refused = await requireRejection(
      maintainRegistry({
        directory: proof.journalPath,
        operationId: 'early-measurement',
        owner: 'owner',
        kind: 'retirement',
        ports: proof.ports,
        backup: proof.backup,
        runtime: {
          ...proof.runtime,
          open: async (authority, mode) => {
            if (mode === 'deletion') {
              // Boundary: this deliberate misuse invokes the actual held authority API hidden from the runtime's narrower view.
              const session = authority as RegistryMaintenanceSession;
              await session.measureReclamation('after');
            }
            return proof.runtime.open(authority, mode);
          },
        },
      }),
    );
    expect(refused.throwCause).toThrow(
      'Reclamation measurement requires the exact retirement phase',
    );
    const failed = (
      await executeRegistryCommand(proof.journalPath, { command: 'read' }, proof.ports)
    ).state;
    if (failed.schemaVersion !== 4) throw new Error('Expected actual journal');
    expect(failed.maintenanceEvidence?.reclamation?.after).toBeNull();
    expect(proof.calls.includes('restore')).toBe(false);
  } finally {
    await proof.server.stop(true);
  }
});

test('retirement refuses replacing its measured baseline', async () => {
  const proof = await fixture('none');
  const duplicate = { attempted: false };
  try {
    const refused = await requireRejection(
      maintainRegistry({
        directory: proof.journalPath,
        operationId: 'duplicate-baseline',
        owner: 'owner',
        kind: 'retirement',
        ports: proof.ports,
        backup: proof.backup,
        runtime: {
          ...proof.runtime,
          open: async (authority, mode) => {
            if (
              !duplicate.attempted &&
              authority.read().maintenanceEvidence?.reclamation !== undefined
            ) {
              duplicate.attempted = true;
              // Boundary: intentionally call the actual authority method a second time in its nominal phase.
              const session = authority as RegistryMaintenanceSession;
              await session.measureReclamation('before');
            }
            return proof.runtime.open(authority, mode);
          },
        },
      }),
    );
    expect(refused.throwCause).toThrow(
      'Reclamation measurement has no matching incomplete baseline',
    );
    expect(duplicate.attempted).toBe(true);
    expect(proof.calls.includes('gc')).toBe(false);
    expect(proof.calls.includes('restore')).toBe(false);
  } finally {
    await proof.server.stop(true);
  }
});
