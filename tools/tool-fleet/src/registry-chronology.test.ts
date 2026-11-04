import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  executeRegistryCommand,
  type RegistryJournalPorts,
  type RegistryMaintenanceJournal,
  runRegistryMaintenance,
} from './registry-journal';
import { requireRejection } from './registry-rejection.fixture';

const GiB = 1024 ** 3;
const standard = '2026-11-01T00:00:00.000Z';
const boundary = '9999-12-31T23:59:59.999Z';
const expanded = '+010000-01-01T00:00:00.000Z';
const negative = '-000001-01-01T00:00:00.000Z';
const earlierNegative = '-000002-01-01T00:00:00.000Z';
const digest = `sha256:${'1'.repeat(64)}`;
const operationId = 'publication-clock';
const uuid = '11111111-1111-4111-8111-111111111111';

async function createJournal(at = standard) {
  const directory = await scratchAsync('registry-chronology-');
  await chmod(directory, 0o700);
  const clock = { at, pressure: false };
  const ports: RegistryJournalPorts = {
    now: () => clock.at,
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
        usedBytes: clock.pressure ? 46 * GiB : GiB,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      }),
  };
  await executeRegistryCommand(
    directory,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'clock-proof',
        storageId: 'clock-store',
        owners: ['owner'],
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  return { directory, clock, ports };
}

type JournalFixture = Awaited<ReturnType<typeof createJournal>>;
function reserve(proof: JournalFixture) {
  return executeRegistryCommand(
    proof.directory,
    {
      command: 'reserve-publication',
      expectedRevision: 0,
      operationId,
      owner: 'owner',
      product: 'proof',
      roots: [digest],
      references: [{ repository: 'proof/app', digest }],
      envelope: { bytes: 1, inodes: 1 },
    },
    proof.ports,
  );
}

for (const branch of ['publication', 'pressure', 'maintenance'] as const) {
  for (const [name, initial, current] of [
    ['ordinary', '2026-11-01T00:00:00.001Z', standard],
    ['expanded-boundary', expanded, boundary],
    ['negative-expanded', negative, earlierNegative],
  ] as const) {
    test(`chronology ${branch} rejects ${name} clock reversal before acknowledgement`, async () => {
      const proof = await createJournal(initial);
      if (branch === 'maintenance')
        await executeRegistryCommand(
          proof.directory,
          { command: 'upgrade-maintenance' },
          proof.ports,
        );
      const path = join(proof.directory, 'journal.json');
      const before = await readFile(path, 'utf8');
      proof.clock.at = current;
      proof.clock.pressure = branch === 'pressure';
      let entered = 0;
      let token: string | undefined;
      const attempt =
        branch === 'publication'
          ? reserve(proof).then((receipt) => {
              token = receipt.token;
            })
          : branch === 'pressure'
            ? executeRegistryCommand(proof.directory, { command: 'check-capacity' }, proof.ports)
            : runRegistryMaintenance(
                proof.directory,
                {
                  operationId: 'maintenance-clock',
                  owner: 'owner',
                  kind: 'backup',
                  recover: false,
                },
                proof.ports,
                () => {
                  entered++;
                  return Promise.reject(new Error('Unexpected maintenance callback'));
                },
              );
      const refused = await requireRejection(attempt);
      expect(refused.throwCause).toThrow('Server receipt clock moved backwards');
      expect(token).toBeUndefined();
      expect(entered).toBe(0);
      expect(await readFile(path, 'utf8')).toBe(before);
      const stored = (
        await executeRegistryCommand(proof.directory, { command: 'read' }, proof.ports)
      ).state;
      expect(stored.updatedAt).toBe(initial);
      expect(stored.revision).toBe(branch === 'maintenance' ? 1 : 0);
      expect(stored.reservations).toEqual([]);
      expect(stored.publication).toBeNull();
      expect(stored.maintenance).toBeNull();
      expect(stored.measurement).toBeNull();
    });
  }

  for (const [name, initial, current] of [
    ['ordinary-advance', standard, '2026-11-01T00:00:00.001Z'],
    ['equal', standard, standard],
    ['expanded-boundary', boundary, expanded],
    ['positive-expanded', expanded, '+010001-01-01T00:00:00.000Z'],
    ['negative-expanded', earlierNegative, negative],
  ] as const) {
    test(`chronology ${branch} accepts ${name} receipts without rewriting ISO strings`, async () => {
      const proof = await createJournal(initial);
      if (branch === 'maintenance')
        await executeRegistryCommand(
          proof.directory,
          { command: 'upgrade-maintenance' },
          proof.ports,
        );
      proof.clock.at = current;
      proof.clock.pressure = branch === 'pressure';
      if (branch === 'publication') {
        const receipt = await reserve(proof);
        expect(receipt.token).toBeDefined();
        expect(receipt.state.reservations).toHaveLength(1);
        expect(receipt.state.bundles[0]?.receipt.at).toBe(current);
      } else if (branch === 'pressure') {
        const receipt = await executeRegistryCommand(
          proof.directory,
          { command: 'check-capacity' },
          proof.ports,
        );
        expect(receipt.state.fenced).toBe(true);
        expect(receipt.state.measurement?.at).toBe(current);
      } else {
        const stop = new Error('Observed admitted maintenance callback');
        let entered = 0;
        const refused = await requireRejection(
          runRegistryMaintenance(
            proof.directory,
            { operationId: 'maintenance-clock', owner: 'owner', kind: 'backup', recover: false },
            proof.ports,
            (session) => {
              entered++;
              expect(session.read().maintenance?.operationId).toBe('maintenance-clock');
              expect(session.read().updatedAt).toBe(current);
              return Promise.reject(stop);
            },
          ),
        );
        expect(refused.cause).toBe(stop);
        expect(entered).toBe(1);
      }
      const stored = (
        await executeRegistryCommand(proof.directory, { command: 'read' }, proof.ports)
      ).state;
      expect(stored.updatedAt).toBe(current);
      expect(stored.revision).toBe(branch === 'maintenance' ? 3 : 1);
    });
  }
}

async function createPublishedJournal() {
  const proof = await createJournal();
  const reserved = await reserve(proof);
  await executeRegistryCommand(
    proof.directory,
    {
      command: 'finish-publication',
      expectedRevision: 1,
      operationId,
      owner: 'owner',
      token: reserved.token,
      outcome: 'completed',
      reconciled: true,
    },
    proof.ports,
  );
  const upgraded = await executeRegistryCommand(
    proof.directory,
    { command: 'upgrade-maintenance' },
    proof.ports,
  );
  if (upgraded.state.schemaVersion !== 4) throw new Error('Expected schema4 fixture');
  return { ...proof, journal: upgraded.state };
}

type CanonicalFixture = Awaited<ReturnType<typeof createPublishedJournal>>;
function read(proof: CanonicalFixture) {
  return executeRegistryCommand(proof.directory, { command: 'read' }, proof.ports);
}
async function store(proof: CanonicalFixture) {
  await writeFile(join(proof.directory, 'journal.json'), JSON.stringify(proof.journal));
}

function setLineage(
  journal: RegistryMaintenanceJournal,
  branch: 'backup' | 'retirement' | 'deployment',
  first: string,
  second: string,
) {
  journal.updatedAt = second;
  if (branch === 'backup') {
    journal.closedOperations = ['backup-proof'];
    journal.maintenanceEvidence = {
      operationId: 'backup-proof',
      runtime: null,
      plan: null,
      backup: null,
      backupCensusSha256: null,
      backupAttempts: [
        {
          id: uuid,
          operationId: 'backup-proof',
          action: 'backup-preflight',
          configurationSha256: 'a'.repeat(64),
          snapshotHost: journal.enrollment.registryId,
          utsHostname: `prb-${uuid}`,
          guardian: {
            pid: 123,
            startTicks: '1',
            pidNamespace: 'pid:[1]',
            bootId: uuid,
            machineId: 'b'.repeat(32),
          },
          tokenSha256: 'c'.repeat(64),
          journalRevision: 3,
          createdAt: first,
          state: 'settled',
          settlementSha256: 'd'.repeat(64),
        },
      ],
      backupReconciliation: null,
      backupReconciliations: [],
      uploadsVerified: null,
      retained: [],
      deletions: [],
      recovery: null,
    };
  } else if (branch === 'retirement') {
    const bundle = journal.bundles.find((bundle) => bundle.operationId === operationId);
    if (bundle === undefined) throw new Error('Missing real completed publication');
    bundle.receipt.at = first;
    journal.closedOperations = ['retire-proof'];
    journal.retirements = [
      {
        operationId: 'retire-proof',
        operations: [operationId],
        planSha256: 'a'.repeat(64),
        retireBlobs: [],
        neverUploaded: [],
        uploadsSha256: 'b'.repeat(64),
        snapshotId: 'c'.repeat(64),
        at: second,
        deletions: [],
      },
    ];
  } else {
    journal.environments = [
      {
        environment: 'proof',
        owner: 'owner',
        product: 'proof',
        protectionId: 'protection',
        enrolledAt: standard,
        genesisAt: standard,
        retiredAt: standard,
        releases: [],
      },
    ];
    journal.closedOperations = ['deploy-proof'];
    journal.deployments = [
      {
        operationId: 'deploy-proof',
        owner: 'owner',
        token: uuid,
        environment: 'proof',
        candidate: operationId,
        current: null,
        recovers: null,
        reconciledBy: null,
        inventory: [],
        references: [{ repository: 'proof/app', digest }],
        phase: 'promoted',
        events: [
          { phase: 'protected', at: first },
          { phase: 'promoted', at: second },
        ],
        startedAt: first,
        finishedAt: second,
      },
    ];
  }
}

for (const [branch, message] of [
  ['backup', 'Inconsistent durable backup attempt lineage'],
  ['retirement', 'Invalid retired publication provenance'],
  ['deployment', 'Invalid deployment event history'],
] as const) {
  for (const [name, first, second] of [
    ['ordinary', '2026-11-01T00:00:00.001Z', standard],
    ...(branch === 'backup'
      ? []
      : [
          ['expanded-boundary', expanded, boundary],
          ['negative-expanded', negative, earlierNegative],
        ]),
  ]) {
    test(`chronology canonical ${branch} rejects ${name} lineage reversal`, async () => {
      const proof = await createPublishedJournal();
      setLineage(proof.journal, branch, first, second);
      await store(proof);
      const bytes = await readFile(join(proof.directory, 'journal.json'), 'utf8');
      const refused = await requireRejection(read(proof));
      expect(refused.throwCause).toThrow(message);
      expect(await readFile(join(proof.directory, 'journal.json'), 'utf8')).toBe(bytes);
    });
  }
  for (const [name, first, second] of [
    ['equal', standard, standard],
    ['expanded-boundary', boundary, expanded],
    ...(branch === 'backup'
      ? []
      : [
          ['positive-expanded', expanded, '+010001-01-01T00:00:00.000Z'],
          ['negative-expanded', earlierNegative, negative],
        ]),
  ]) {
    test(`chronology canonical ${branch} accepts ${name} lineage`, async () => {
      const proof = await createPublishedJournal();
      setLineage(proof.journal, branch, first, second);
      await store(proof);
      expect((await read(proof)).state).toEqual(proof.journal);
    });
  }
}

test('chronology canonical backup preserves its narrower createdAt schema', async () => {
  const proof = await createPublishedJournal();
  setLineage(proof.journal, 'backup', expanded, '+010001-01-01T00:00:00.000Z');
  await store(proof);
  const refused = await requireRejection(read(proof));
  expect(refused.throwCause).toThrow('maintenanceEvidence.backupAttempts[0].createdAt');
});

function setReclamation(proof: CanonicalFixture, before: string, after: string | null, at: string) {
  const journal = proof.journal;
  journal.updatedAt = at;
  journal.revision = 10;
  journal.maintenance = {
    operationId: 'retirement-clock',
    owner: 'owner',
    token: uuid,
    kind: 'retirement',
    phase: 'collected',
    resumePhase: 'collected',
  };
  const backup = {
    snapshotId: 'a'.repeat(64),
    verifiedAt: standard,
    registryId: journal.enrollment.registryId,
    storageId: journal.enrollment.storageId,
    registryPath: journal.enrollment.registryPath,
    journalPath: proof.directory,
    journalRevision: 7,
    journalSha256: 'b'.repeat(64),
    censusSha256: 'c'.repeat(64),
    bytes: 100,
  };
  const measurement = (stamp: string, revision: number) => ({
    at: stamp,
    journalRevision: revision,
    maximumBytes: 50 * GiB,
    usableBytes: 50 * GiB,
    usedBytes: GiB,
    totalInodes: 10000,
    usedInodes: 10,
    rootFreeBytes: 30 * GiB,
  });
  const plan = '{}';
  journal.lastVerifiedBackup = backup;
  journal.maintenanceEvidence = {
    operationId: 'retirement-clock',
    runtime: null,
    plan,
    backup,
    backupCensusSha256: null,
    backupAttempts: [],
    backupReconciliation: null,
    backupReconciliations: [],
    uploadsVerified: null,
    retained: [],
    deletions: [],
    recovery: null,
    reclamation: {
      operationId: 'retirement-clock',
      storageId: journal.enrollment.storageId,
      registryPath: journal.enrollment.registryPath,
      snapshotId: backup.snapshotId,
      before: measurement(before, 8),
      ...(after === null
        ? { after: null, planSha256: null, reclaimedBytes: null, reclaimedInodes: null }
        : {
            after: measurement(after, 10),
            planSha256: createHash('sha256').update(plan).digest('hex'),
            reclaimedBytes: 0,
            reclaimedInodes: 0,
          }),
    },
  };
}

for (const [name, before, after, at, message] of [
  ['before-future-isolated', '2026-11-01T00:00:00.001Z', null, standard, 'differs from durable'],
  ['before-future-expanded', expanded, null, boundary, 'differs from durable'],
  [
    'after-order-isolated',
    '2026-11-01T00:00:00.001Z',
    standard,
    '2026-11-01T00:00:00.002Z',
    'inconsistent measurements',
  ],
  ['after-order-expanded', negative, earlierNegative, standard, 'inconsistent measurements'],
  [
    'after-future-isolated',
    standard,
    '2026-11-01T00:00:00.002Z',
    '2026-11-01T00:00:00.001Z',
    'inconsistent measurements',
  ],
  ['after-future-expanded', standard, expanded, boundary, 'inconsistent measurements'],
] as const) {
  test(`chronology canonical reclamation rejects ${name}`, async () => {
    const proof = await createPublishedJournal();
    setReclamation(proof, before, after, at);
    await store(proof);
    const bytes = await readFile(join(proof.directory, 'journal.json'), 'utf8');
    const refused = await requireRejection(read(proof));
    expect(refused.throwCause).toThrow(message);
    expect(await readFile(join(proof.directory, 'journal.json'), 'utf8')).toBe(bytes);
  });
}

for (const [name, before, after, at] of [
  ['equal', standard, standard, standard],
  ['before-only-boundary', boundary, null, expanded],
  ['expanded-boundary', boundary, expanded, expanded],
  ['positive-expanded', expanded, '+010001-01-01T00:00:00.000Z', '+010001-01-01T00:00:00.000Z'],
  ['negative-expanded', earlierNegative, negative, standard],
] as const) {
  test(`chronology canonical reclamation accepts ${name}`, async () => {
    const proof = await createPublishedJournal();
    setReclamation(proof, before, after, at);
    await store(proof);
    expect((await read(proof)).state).toEqual(proof.journal);
  });
}
