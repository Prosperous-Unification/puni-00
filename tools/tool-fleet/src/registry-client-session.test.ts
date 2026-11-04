import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { createRegistryClientCompletion } from './registry-client-completion';
import { requireRegistryClientRestoration } from './registry-client-evidence';
import { createRegistryClientLineageFixture } from './registry-client-lineage.fixture';
import type { RegistryClientPullPlan } from './registry-client-plan';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryJournalPorts,
  type RegistryMaintenanceSession,
  runRegistryMaintenance,
} from './registry-journal';
import { requireRejection } from './registry-rejection.fixture';

const GiB = 1024 ** 3;
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
};
async function fixture() {
  const directory = await scratchAsync('registry-client-session-');
  await chmod(directory, 0o700);
  await executeRegistryCommand(
    directory,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
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
const owned = { operationId: 'client', owner: 'operator', kind: 'backup' as const, recover: false };
async function prepare(session: RegistryMaintenanceSession, directory: string) {
  let evidence = session.read().maintenanceEvidence;
  if (evidence === null) throw new Error('Missing fixture evidence');
  await session.record({ ...evidence, runtime: 'observed' });
  await session.advance('reconciled');
  await session.advance('fenced');
  await session.advance('stopped');
  evidence = session.read().maintenanceEvidence;
  if (evidence === null) throw new Error('Missing fixture evidence');
  await session.record({
    ...evidence,
    backup: {
      snapshotId: 'a'.repeat(64),
      verifiedAt: new Date().toISOString(),
      registryId: 'proof',
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
}
function completion(session: RegistryMaintenanceSession) {
  const current = session.read();
  const plan: RegistryClientPullPlan = {
    binding: {
      journalRevision: current.revision,
      storageId: current.enrollment.storageId,
      registryPath: current.enrollment.registryPath,
      censusSha256: 'c'.repeat(64),
      filesystem: '1:2',
    },
    revisions: [],
    pulls: [],
  };
  const receipt = createRegistryClientCompletion(
    plan,
    {
      operationId: 'client',
      registryId: 'proof',
      snapshotId: 'a'.repeat(64),
      scope: 'current',
    },
    new Date().toISOString(),
  );
  return { plan, receipt };
}
async function within(
  run: (session: RegistryMaintenanceSession, directory: string) => Promise<void>,
) {
  const directory = await fixture();
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, ports, async (session) => {
          await prepare(session, directory);
          await run(session, directory);
          throw new Error('preserve fenced evidence');
        }),
      )
    ).throwCause,
  ).toThrow('preserve fenced evidence');
  return directory;
}
test('client terminal settlement persists exact completion before acknowledgement under the held lock', async () => {
  const directory = await within(async (session, directory) => {
    const proof = completion(session);
    const revision = session.read().revision;
    await session.settleClient(proof.receipt, proof.plan);
    expect(session.read().revision).toBe(revision + 1);
    const stored = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(join(directory, 'journal.json'), 'utf8')) as unknown,
    }).state;
    expect(stored).toEqual(session.read());
    if (stored.schemaVersion !== 4) throw new Error('Missing schema4 fixture');
    expect(stored.maintenanceEvidence?.client).toEqual(proof.receipt);
    expect(
      (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
        .throwCause,
    ).toThrow('busy');
  });
  expect((await executeRegistryCommand(directory, { command: 'read' }, ports)).state.fenced).toBe(
    true,
  );
});
for (const fault of ['invent', 'erase', 'replace'] as const)
  test('generic evidence cannot ' + fault + ' client completion', async () => {
    await within(async (session) => {
      const proof = completion(session);
      if (fault !== 'invent') await session.settleClient(proof.receipt, proof.plan);
      const evidence = session.read().maintenanceEvidence;
      if (evidence === null) throw new Error('Missing fixture evidence');
      if (fault === 'erase') delete evidence.client;
      else
        evidence.client = {
          ...proof.receipt,
          ...(fault === 'replace' ? { censusSha256: 'd'.repeat(64) } : {}),
        };
      expect((await requireRejection(session.record(evidence))).throwCause).toThrow(
        'client completion',
      );
    });
  });
for (const fault of [
  'revision',
  'store',
  'path',
  'retained',
  'snapshot',
  'scope',
  'expired',
] as const)
  test('session refuses client completion with changed ' + fault, async () => {
    await within(async (session) => {
      const proof = completion(session);
      if (fault === 'revision')
        proof.plan = {
          ...proof.plan,
          binding: {
            ...proof.plan.binding,
            journalRevision: proof.plan.binding.journalRevision - 1,
          },
        };
      if (fault === 'store')
        proof.plan = { ...proof.plan, binding: { ...proof.plan.binding, storageId: 'foreign' } };
      if (fault === 'path')
        proof.plan = {
          ...proof.plan,
          binding: { ...proof.plan.binding, registryPath: '/foreign' },
        };
      if (fault === 'retained')
        proof.plan.revisions.push({ repository: 'unverified', digest: 'sha256:' + 'd'.repeat(64) });
      if (fault === 'snapshot') proof.receipt.snapshotId = 'd'.repeat(64);
      if (fault === 'scope') proof.receipt.scope = 'recovery';
      if (fault === 'expired')
        proof.receipt.completedAt = new Date(Date.now() - 300001).toISOString();
      if (['revision', 'store', 'path'].includes(fault))
        proof.receipt = createRegistryClientCompletion(
          proof.plan,
          {
            operationId: 'client',
            registryId: 'proof',
            snapshotId: 'a'.repeat(64),
            scope: 'current',
          },
          new Date().toISOString(),
        );
      const revision = session.read().revision;
      expect(
        (await requireRejection(session.settleClient(proof.receipt, proof.plan))).throwCause,
      ).toThrow(
        ['revision', 'store', 'path'].includes(fault)
          ? 'plan differs from current authority'
          : fault === 'scope'
            ? 'durable recovery lineage'
            : undefined,
      );
      expect(session.read().revision).toBe(revision);
      expect(session.read().maintenanceEvidence?.client).toBeUndefined();
    });
  });
for (const field of [
  'operationId',
  'registryId',
  'snapshotId',
  'storageId',
  'registryPath',
  'journalRevision',
  'completedAt',
  'backup-floor',
  'extended-future',
] as const)
  test('canonical read refuses corrupt durable client ' + field, async () => {
    const directory = await within(async (session) => {
      const proof = completion(session);
      await session.settleClient(proof.receipt, proof.plan);
    });
    const path = join(directory, 'journal.json');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(path, 'utf8')) as unknown,
    }).state;
    if (journal.schemaVersion !== 4 || journal.maintenanceEvidence?.client === undefined)
      throw new Error('Missing saved client proof');
    const receipt = journal.maintenanceEvidence.client;
    if (field === 'journalRevision') receipt[field] = journal.revision + 1;
    else if (field === 'backup-floor')
      receipt.journalRevision = journal.maintenanceEvidence.backup?.journalRevision ?? 0;
    else if (field === 'extended-future') receipt.completedAt = '+010000-01-01T00:00:00.000Z';
    else if (field === 'completedAt') receipt[field] = new Date(Date.now() + 60000).toISOString();
    else receipt[field] = field === 'registryPath' ? '/foreign' : 'd'.repeat(64);
    await writeFile(path, JSON.stringify(journal));
    expect(
      (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
        .throwCause,
    ).toThrow();
  });

test('unprepared phase cannot acknowledge client execution', async () => {
  const directory = await fixture();
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(directory, owned, ports, async (session) => {
          const proof = completion(session);
          await session.settleClient(proof.receipt, proof.plan);
        }),
      )
    ).throwCause,
  ).toThrow('stopped backed-up maintenance');
});

test('verified phase requires a durably acknowledged client completion', async () => {
  await within(async (session) => {
    expect((await requireRejection(session.advance('verified'))).throwCause).toThrow(
      'client completion',
    );
    expect(session.read().maintenance?.phase).toBe('backed-up');
  });
});

async function recover(session: RegistryMaintenanceSession, directory: string) {
  const preparation = {
    ...createRegistryClientLineageFixture().prepared,
    operationId: 'client',
    previousStorageId: 'volume',
    previousRegistryPath: '/registry',
    canonicalJournalPath: directory,
  };
  const evidence = session.read().maintenanceEvidence;
  if (evidence === null) throw new Error('Missing recovery fixture evidence');
  await session.record({ ...evidence, recovery: JSON.stringify(preparation) });
  const proof = completion(session);
  proof.plan = {
    ...proof.plan,
    binding: {
      ...proof.plan.binding,
      storageId: preparation.storageId,
      registryPath: preparation.registryPath,
    },
  };
  proof.receipt = createRegistryClientCompletion(
    proof.plan,
    {
      operationId: 'client',
      registryId: 'proof',
      snapshotId: preparation.snapshotId,
      scope: 'recovery',
    },
    new Date().toISOString(),
  );
  await session.settleClient(proof.receipt, proof.plan);
}
test('prepared recovery client settles its exact target but cannot authorize the previous serving store', async () => {
  await within(async (session, directory) => {
    await recover(session, directory);
    expect(session.read().maintenanceEvidence?.client?.scope).toBe('recovery');
    expect(() => {
      requireRegistryClientRestoration(session.read(), new Date().toISOString());
    }).toThrow('serving store');
  });
});
for (const field of [
  'operationId',
  'snapshotId',
  'previousStorageId',
  'previousRegistryPath',
] as const)
  test('canonical read refuses changed recovery client lineage ' + field, async () => {
    const directory = await within(recover);
    const path = join(directory, 'journal.json');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(path, 'utf8')) as unknown,
    }).state;
    if (
      journal.schemaVersion !== 4 ||
      journal.maintenanceEvidence?.recovery === null ||
      journal.maintenanceEvidence === null
    )
      throw new Error('Missing prepared recovery');
    const preparation = createRegistryClientLineageFixture().prepared;
    Object.assign(preparation, JSON.parse(journal.maintenanceEvidence.recovery) as unknown);
    preparation[field] = field === 'previousRegistryPath' ? '/foreign' : 'd'.repeat(64);
    journal.maintenanceEvidence.recovery = JSON.stringify(preparation);
    await writeFile(path, JSON.stringify(journal));
    expect(
      (await requireRejection(executeRegistryCommand(directory, { command: 'read' }, ports)))
        .throwCause,
    ).toThrow('recovery lineage');
  });
