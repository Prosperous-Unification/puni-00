import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { prepareRegistryBackupAttempt } from './registry-backup-attempt';
import { invokeRegistryCallback } from './registry-callback';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryJournalPorts,
  runRegistryMaintenance,
} from './registry-journal';
import { createRegistryRecoveryVerifier } from './registry-maintenance-recovery';
import { requireRejection } from './registry-rejection.fixture';
const GiB = 1024 ** 3;
const guardian = {
  pid: 42,
  startTicks: '12345',
  pidNamespace: 'pid:[4026531836]',
  bootId: '11111111-1111-4111-8111-111111111111',
  machineId: 'a'.repeat(32),
};
const ports: RegistryJournalPorts = {
  measureJournal: () =>
    invokeRegistryCallback(() => ({
      usableBytes: GiB,
      allocationUnitBytes: 4096,
      usedBytes: 4096,
      totalInodes: 10000,
      usedInodes: 10,
    })),
  measureRegistry: () =>
    invokeRegistryCallback(() => ({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    })),
  describeBackupGuardian: () =>
    invokeRegistryCallback(() => ({
      guardian: structuredClone(guardian),
      configurationSha256: 'b'.repeat(64),
    })),
};
async function fixture() {
  const directory = await scratchAsync('registry-backup-session-');
  await chmod(directory, 0o700);
  await executeRegistryCommand(
    directory,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'backup',
        storageId: 'volume',
        owners: ['operator'],
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  return directory;
}
const owned = { operationId: 'backup', owner: 'operator', kind: 'backup' as const, recover: false };
test('backup preparation is durable before dispatch and failure retains its exact owner', async () => {
  const directory = await fixture();
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, ports, async (session) => {
          const attempt = await session.prepareBackup('backup-preflight', 42);
          const stored = parseRegistryCommandResponse({
            state: JSON.parse(await readFile(join(directory, 'journal.json'), 'utf8')) as unknown,
          }).state;
          if (stored.schemaVersion !== 4) throw new Error('Missing schema4');
          expect(stored.maintenanceEvidence?.backupAttempts).toEqual([attempt]);
          expect(stored.revision).toBe(attempt.journalRevision);
          expect(session.read()).toEqual(stored);
          expect(
            (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
              .throwCause,
          ).toThrow('busy');
          throw new Error('crash before request');
        }),
      )
    ).throwCause,
  ).toThrow('crash before request');
  const failed = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  expect(failed).toMatchObject({
    fenced: true,
    maintenance: { phase: 'failed' },
    maintenanceEvidence: { backupAttempts: [{ guardian, state: 'prepared' }] },
  });
});
for (const fault of ['invent', 'erase', 'replace'] as const) {
  test(`generic evidence record cannot ${fault} backup attempt ownership`, async () => {
    const directory = await fixture();
    expect(
      (
        await requireRejection(
          runRegistryMaintenance(directory, owned, ports, async (session) => {
            if (fault !== 'invent') await session.prepareBackup('backup-preflight', 42);
            const evidence = session.read().maintenanceEvidence;
            const owner = session.read().maintenance;
            if (evidence === null || owner === null) throw new Error('Missing owned evidence');
            if (fault === 'erase') evidence.backupAttempts = [];
            else
              evidence.backupAttempts = [
                prepareRegistryBackupAttempt({
                  operationId: owner.operationId,
                  token: owner.token,
                  action: 'backup-preflight',
                  configurationSha256: 'b'.repeat(64),
                  registryId: 'backup',
                  guardian,
                  journalRevision: session.read().revision + 1,
                  now: new Date().toISOString(),
                }),
              ];
            expect((await requireRejection(session.record(evidence))).throwCause).toThrow(
              'attempt evidence',
            );
            throw new Error('ownership mutation refused');
          }),
        )
      ).throwCause,
    ).toThrow('ownership mutation refused');
  });
}
test('unsettled attempt prevents a new worker nonce', async () => {
  const directory = await fixture();
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, ports, async (session) => {
          await session.prepareBackup('backup-preflight', 42);
          expect(
            (await requireRejection(session.prepareBackup('backup-preflight', 43))).throwCause,
          ).toThrow('unsettled');
          throw new Error('pending worker refused');
        }),
      )
    ).throwCause,
  ).toThrow('pending worker refused');
});
test('missing or mismatched trusted guardian observation refuses preparation', async () => {
  for (const missing of [true, false]) {
    const directory = await fixture();
    const selected = { ...ports, ...(missing ? { describeBackupGuardian: undefined } : {}) };
    expect(
      (
        await requireRejection(
          runRegistryMaintenance(directory, owned, selected, async (session) => {
            await session.prepareBackup('backup-preflight', missing ? 42 : 43);
          }),
        )
      ).throwCause,
    ).toThrow(missing ? 'trusted guardian observer' : 'authenticated root peer');
  }
});
test('terminal acknowledgement settles only its pending attempt and permits a fresh guardian', async () => {
  const directory = await fixture();
  const observed = {
    ...ports,
    describeBackupGuardian: (pid: number) =>
      invokeRegistryCallback(() => ({
        guardian: { ...guardian, pid },
        configurationSha256: 'b'.repeat(64),
      })),
  };
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, observed, async (session) => {
          const attempt = await session.prepareBackup('backup-preflight', 42);
          expect(
            (
              await requireRejection(
                session.settleBackup('00000000-0000-4000-8000-000000000000', 'verified'),
              )
            ).throwCause,
          ).toThrow('pending backup attempt');
          await session.settleBackup(attempt.id, 'verified');
          expect(session.read().maintenanceEvidence?.backupAttempts[0]).toMatchObject({
            state: 'settled',
            settlementSha256: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          });
          expect(
            (await requireRejection(session.settleBackup(attempt.id, 'verified'))).throwCause,
          ).toThrow('pending backup attempt');
          expect(
            (await requireRejection(session.prepareBackup('backup-snapshot', 42))).throwCause,
          ).toThrow('already owns');
          const next = await session.prepareBackup('backup-snapshot', 43);
          expect(next.id).not.toBe(attempt.id);
          throw new Error('retain second pending attempt');
        }),
      )
    ).throwCause,
  ).toThrow('retain second pending attempt');
});
test('reordered guardian fields cannot disguise duplicate durable process ownership', async () => {
  const directory = await fixture();
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, ports, async (session) => {
          await session.prepareBackup('backup-preflight', 42);
          throw new Error('retain pending attempt');
        }),
      )
    ).throwCause,
  ).toThrow('retain pending attempt');
  const path = join(directory, 'journal.json');
  const journal = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(path, 'utf8')) as unknown,
  }).state;
  if (journal.schemaVersion !== 4 || journal.maintenanceEvidence === null)
    throw new Error('Missing fixture backup evidence');
  const first = journal.maintenanceEvidence.backupAttempts[0];
  journal.maintenanceEvidence.backupAttempts.push({
    ...first,
    id: '00000000-0000-4000-8000-000000000002',
    utsHostname: 'prb-00000000-0000-4000-8000-000000000002',
    guardian: {
      pidNamespace: guardian.pidNamespace,
      machineId: guardian.machineId,
      bootId: guardian.bootId,
      startTicks: guardian.startTicks,
      pid: guardian.pid,
    },
  });
  await writeFile(path, JSON.stringify(journal));
  expect(
    (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
      .throwCause,
  ).toThrow('backup attempt guardian');
});
test('recovery verifier receives the live held session rather than a stale journal snapshot', async () => {
  const directory = await fixture();
  const recovery = createRegistryRecoveryVerifier({
    consumers: {},
    backup: {
      verify: () =>
        invokeRegistryCallback(() => {
          throw new Error('unexpected backup');
        }),
      restore: () =>
        invokeRegistryCallback(() => {
          throw new Error('unexpected restore');
        }),
    },
    runtime: {
      verifyImages: () =>
        invokeRegistryCallback(() => {
          throw new Error('unexpected client');
        }),
      assertStopped: async (authority) => {
        const before = authority.read().revision;
        await authority.prepareBackup('backup-verify', 42);
        expect(authority.read().revision).toBe(before + 1);
        const stored = parseRegistryCommandResponse({
          state: JSON.parse(await readFile(join(directory, 'journal.json'), 'utf8')) as unknown,
        }).state;
        expect(stored.revision).toBe(authority.read().revision);
        expect(
          (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
            .throwCause,
        ).toThrow('busy');
        throw new Error('live recovery session observed');
      },
      audit: () =>
        invokeRegistryCallback(() => {
          throw new Error('unexpected target');
        }),
      open: () =>
        invokeRegistryCallback(() => {
          throw new Error('unexpected server');
        }),
    },
  });
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, { ...ports, ...recovery }, async (session) => {
          const initial = session.read().maintenanceEvidence;
          if (initial === null) throw new Error('Missing fixture evidence');
          await session.record({ ...initial, runtime: 'fixture-observation' });
          await session.advance('reconciled');
          await session.advance('fenced');
          await session.advance('stopped');
          await session.record({
            ...session.read().maintenanceEvidence!,
            backup: {
              snapshotId: 'a'.repeat(64),
              verifiedAt: new Date().toISOString(),
              registryId: 'backup',
              storageId: 'volume',
              registryPath: '/registry',
              journalPath: directory,
              journalRevision: session.read().revision,
              journalSha256: 'b'.repeat(64),
              censusSha256: 'c'.repeat(64),
              bytes: 1,
            },
          });
          await session.advance('backed-up');
          await session.restore();
        }),
      )
    ).throwCause,
  ).toThrow('live recovery session observed');
});
test('exact lock reconciliation is reserved before effects and preserves a durable receipt before retry', async () => {
  const directory = await fixture();
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, ports, async (session) => {
          const attempt = await session.prepareBackup('backup-preflight', 42);
          await session.prepareBackupReconciliation();
          const reserved = session.read().maintenanceEvidence?.backupReconciliation;
          expect(reserved).toMatchObject({
            attemptIds: [attempt.id],
            journalRevision: session.read().revision,
          });
          const receipt = {
            operationId: 'backup',
            configurationSha256: 'b'.repeat(64),
            attemptIds: [attempt.id],
            removed: [],
            censusSha256: 'c'.repeat(64),
          };
          expect(
            (
              await requireRejection(
                session.reconcileBackups({
                  ...receipt,
                  attemptIds: ['00000000-0000-4000-8000-000000000000'],
                }),
              )
            ).throwCause,
          ).toThrow('pending');
          await session.reconcileBackups(receipt);
          expect(session.read().maintenanceEvidence?.backupAttempts[0]?.state).toBe('reconciled');
          expect(session.read().maintenanceEvidence?.backupReconciliations).toEqual([receipt]);
          expect(session.read().maintenanceEvidence?.backupReconciliation).toBeNull();
          expect((await requireRejection(session.reconcileBackups(receipt))).throwCause).toThrow(
            'pending',
          );
          throw new Error('reconciliation durably acknowledged');
        }),
      )
    ).throwCause,
  ).toThrow('reconciliation durably acknowledged');
});
for (const fault of [
  'missing-receipt',
  'foreign-operation',
  'foreign-configuration',
  'duplicate-attempt',
  'wrong-hash',
] as const) {
  test(`canonical read refuses corrupted reconciliation ${fault}`, async () => {
    const directory = await fixture();
    expect(
      (
        await requireRejection(
          runRegistryMaintenance(directory, owned, ports, async (session) => {
            const attempt = await session.prepareBackup('backup-preflight', 42);
            await session.prepareBackupReconciliation();
            await session.reconcileBackups({
              operationId: 'backup',
              configurationSha256: 'b'.repeat(64),
              attemptIds: [attempt.id],
              removed: [],
              censusSha256: 'c'.repeat(64),
            });
            throw new Error('retain acknowledged receipt');
          }),
        )
      ).throwCause,
    ).toThrow('retain acknowledged receipt');
    const path = join(directory, 'journal.json');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(path, 'utf8')) as unknown,
    }).state;
    if (journal.schemaVersion !== 4 || journal.maintenanceEvidence === null)
      throw new Error('Missing fixture backup evidence');
    const receipt = journal.maintenanceEvidence.backupReconciliations[0];
    if (fault === 'missing-receipt') journal.maintenanceEvidence.backupReconciliations = [];
    if (fault === 'foreign-operation') receipt.operationId = 'foreign';
    if (fault === 'foreign-configuration') receipt.configurationSha256 = 'd'.repeat(64);
    if (fault === 'duplicate-attempt') receipt.attemptIds.push(receipt.attemptIds[0]);
    if (fault === 'wrong-hash')
      journal.maintenanceEvidence.backupAttempts[0].settlementSha256 = 'd'.repeat(64);
    await writeFile(path, JSON.stringify(journal));
    expect(
      (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
        .throwCause,
    ).toThrow();
  });
}
test('reconciliation reserves terminal receipt growth before reaching a destructive callback', async () => {
  const directory = await fixture();
  let constrained = false;
  let dispatched = 0;
  const selected = {
    ...ports,
    measureJournal: async (enrollment: Parameters<RegistryJournalPorts['measureJournal']>[0]) => ({
      ...(await ports.measureJournal(enrollment)),
      usableBytes: constrained ? 112 * 1024 : GiB,
    }),
  };
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, selected, async (session) => {
          await session.prepareBackup('backup-preflight', 42);
          constrained = true;
          await session.prepareBackupReconciliation();
          dispatched++;
          throw new Error('destructive callback reached without future receipt capacity');
        }),
      )
    ).throwCause,
  ).toThrow('Insufficient journal capacity');
  expect(dispatched).toBe(0);
  const failed = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  expect(failed).toMatchObject({
    fenced: true,
    maintenance: { phase: 'failed' },
    maintenanceEvidence: { backupReconciliation: null, backupAttempts: [{ state: 'prepared' }] },
  });
});
for (const fault of ['invent-reservation', 'erase-reservation', 'replace-receipts'] as const) {
  test(`generic evidence recording refuses ${fault}`, async () => {
    const directory = await fixture();
    expect(
      (
        await requireRejection(
          runRegistryMaintenance(directory, owned, ports, async (session) => {
            const attempt = await session.prepareBackup('backup-preflight', 42);
            if (fault !== 'invent-reservation') await session.prepareBackupReconciliation();
            const evidence = session.read().maintenanceEvidence;
            if (evidence === null) throw new Error('Missing actual session evidence');
            if (fault === 'invent-reservation')
              evidence.backupReconciliation = {
                operationId: 'backup',
                configurationSha256: 'b'.repeat(64),
                attemptIds: [attempt.id],
                journalRevision: session.read().revision,
              };
            if (fault === 'erase-reservation') evidence.backupReconciliation = null;
            if (fault === 'replace-receipts')
              evidence.backupReconciliations = [
                {
                  operationId: 'backup',
                  configurationSha256: 'b'.repeat(64),
                  attemptIds: [attempt.id],
                  removed: [],
                  censusSha256: 'c'.repeat(64),
                },
              ];
            await session.record(evidence);
          }),
        )
      ).throwCause,
    ).toThrow('backup attempt');
  });
}
