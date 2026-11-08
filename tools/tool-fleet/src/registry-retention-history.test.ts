import { chmod } from 'node:fs/promises';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { registryHistorySha256 } from './registry-history';
import { RegistryIndexPublication } from './registry-index-authority.fixture';
import { requireRegistryHistoryCensus } from './registry-maintenance-history.native';
import {
  assertConsumerUniverse,
  executeRegistryCommand,
  type RegistryJournal,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import { planRetirement } from './registry-policy';
import { parseReaderConfiguration, verifyDockerSourceCoverage } from './registry-reader';
import {
  createRegistryRetentionReaders,
  promoteRegistryRetentionCandidate,
  requireRegistryPromotedHistoryInventory,
  requireRegistryRetentionHistory,
} from './registry-retention-history.fixture';
const primary = () =>
  parseReaderConfiguration({
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'native-registry',
    id: 'fixture-host',
    kind: 'docker-host',
    source: '/etc/puni/registry-fixture-reader.json',
    role: 'consumer',
    artifact: {
      path: '/usr/local/libexec/puni-registry-maintenance/consumer.js',
      sha256: 'a'.repeat(64),
    },
    input: {
      registryId: 'native-registry',
      registryUrl: 'http://127.0.0.1:5051',
      docker: {
        path: '/usr/local/libexec/puni-registry-maintenance/synthetic-docker',
        sha256: 'b'.repeat(64),
      },
      host: {
        machineId: 'c'.repeat(32),
        catalog: { path: '/etc/puni/registry-fixture-catalog.json', sha256: 'd'.repeat(64) },
      },
    },
  });
test('history fixture enrolls two independently scoped consumers and complete history readers', () => {
  const readers = createRegistryRetentionReaders(primary());
  assertConsumerUniverse(
    { schemaVersion: 1, registryId: 'native-registry', sources: readers.sources },
    readers.sources,
    'native-registry',
  );
  verifyDockerSourceCoverage(
    readers.sources,
    new Map(readers.configurations.map((c) => [c.id, c])),
    'native-registry',
  );
  expect(readers.sources).toHaveLength(5);
  expect(readers.sources.filter((s) => s.kind === 'docker-host').map((s) => s.environment)).toEqual(
    [null],
  );
  for (const environment of ['history-old', 'history-new']) {
    const scoped = readers.sources.filter((s) => s.environment === environment);
    expect(scoped.map((s) => s.role).sort()).toEqual(['consumer', 'history']);
    const consumer = scoped.find((s) => s.role === 'consumer');
    expect(consumer?.hostSourceId).toBe('fixture-host');
    const configuration = readers.configurations.find((c) => c.id === consumer?.id);
    expect(configuration?.input).toMatchObject({
      root: '/root/task8-fixture/' + environment,
      scope: { environment, product: 'native-index' },
    });
  }
});
test('bounded history fixture accepts release14 and refuses release15', () => {
  const receipt = {
    revision: 14,
    operationId: 'release14',
    root: 'sha256:' + 'a'.repeat(64),
    manifests: ['a', 'b', 'c'].map((c) => 'sha256:' + c.repeat(64)),
    blobs: ['d', 'e', 'f', '0'].map((c) => 'sha256:' + c.repeat(64)),
  };
  expect(() => RegistryIndexPublication.assert(receipt)).not.toThrow();
  expect(() => RegistryIndexPublication.assert({ ...receipt, revision: 15 })).toThrow();
});
// Actual journal/flock/authority transitions; registry bytes, capacity and external reader observations are modeled here. Native fixture separately supplies them.
test('fourteen real authority promotions preserve strictly ordered original receipts and two complete histories', async () => {
  const directory = await scratchAsync('task8-history-authority-');
  await chmod(directory, 0o700);
  const GiB = 1024 ** 3;
  const firstInstallAt = '2026-10-25T00:00:00.000Z';
  let at = firstInstallAt;
  let observed: RegistryJournal | undefined;
  const readers = createRegistryRetentionReaders(primary());
  const ports: RegistryJournalPorts = {
    now: () => at,
    verifyConsumers: () => invokeRegistryCallback(() => undefined),
    verifyImages: () => invokeRegistryCallback(() => undefined),
    measureJournal: () =>
      invokeRegistryCallback(() => ({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 0,
        totalInodes: 100000,
        usedInodes: 10,
      })),
    measureRegistry: () =>
      invokeRegistryCallback(() => ({
        maximumBytes: GiB,
        usableBytes: GiB,
        usedBytes: 0,
        totalInodes: 100000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      })),
    collectConsumers: (sources, revision) =>
      invokeRegistryCallback(() =>
        sources.map((source) => {
          const environment = observed?.environments.find(
            (e) => e.environment === source.environment,
          );
          const releases = environment?.releases ?? [];
          const bundles = releases.map((id) => {
            const bundle = observed?.bundles.find((b) => b.operationId === id);
            if (bundle === undefined) throw new Error('Missing fixture acknowledged bundle');
            return bundle;
          });
          const currentReferences = bundles[0]?.references ?? [];
          return {
            id: source.id,
            source: source.source,
            role: source.role,
            revision,
            sourceRevision: 'fixture-acknowledged-history',
            references: currentReferences,
            currentReferences,
            ...(source.role === 'history'
              ? {
                  historySha256: registryHistorySha256(bundles),
                  history:
                    releases.length === 0
                      ? { state: 'first-install' as const, at: firstInstallAt }
                      : { state: 'successful' as const, complete: true as const, releases },
                }
              : {}),
          };
        }),
      ),
  };
  const invoke = async (request: unknown) => {
    const response = await executeRegistryCommand(directory, request, ports);
    observed = response.state;
    return response;
  };
  await invoke({
    command: 'initialize',
    enrollment: {
      registryId: 'native-registry',
      storageId: 'fixture',
      owners: ['operator'],
      registryPath: '/registry',
      rootPath: '/',
      maximumBytes: GiB,
      journalMaximumBytes: GiB,
    },
  });
  await invoke({
    command: 'enroll-consumers',
    operationId: 'readers',
    owner: 'operator',
    expectedRevision: (await invoke({ command: 'read' })).state.revision,
    sources: readers.sources,
  });
  for (let revision = 1; revision <= 14; revision++) {
    const operationId = 'release-' + String(revision);
    const digest = 'sha256:' + revision.toString(16).padStart(64, '0');
    const reserved = await invoke({
      command: 'reserve-publication',
      operationId,
      owner: 'operator',
      expectedRevision: (await invoke({ command: 'read' })).state.revision,
      product: 'native-index',
      roots: [digest],
      references: [{ repository: 'retained/index', digest }],
      envelope: { bytes: 1024, inodes: 10 },
    });
    if (reserved.token === undefined) throw new Error('Missing publication capability');
    await invoke({
      command: 'finish-publication',
      operationId,
      owner: 'operator',
      expectedRevision: reserved.state.revision,
      token: reserved.token,
      outcome: 'completed',
      reconciled: true,
    });
  }
  for (let revision = 1; revision <= 14; revision++) {
    at = new Date(Date.parse(firstInstallAt) + revision * 1000).toISOString();
    observed = await promoteRegistryRetentionCandidate({
      directory,
      candidate: 'release-' + String(revision),
      environment: revision <= 3 ? 'history-old' : 'history-new',
      firstInstallAt,
      ports,
    });
  }
  const final = (await invoke({ command: 'read' })).state;
  expect(final.bundles.filter((bundle) => bundle.receipt.state === 'promoted')).toHaveLength(14);
  expect(final.environments.find((e) => e.environment === 'history-old')?.releases).toEqual([
    'release-3',
    'release-2',
    'release-1',
  ]);
  expect(final.environments.find((e) => e.environment === 'history-new')?.releases).toEqual(
    Array.from({ length: 11 }, (_, i) => 'release-' + String(14 - i)),
  );
  const operations = Array.from({ length: 14 }, (_, i) => 'release-' + String(i + 1));
  expect(() => {
    requireRegistryRetentionHistory(final, operations);
  }).not.toThrow();
  const tied = structuredClone(final);
  const oldest = tied.bundles.find((bundle) => bundle.operationId === 'release-1');
  const second = tied.bundles.find((bundle) => bundle.operationId === 'release-2');
  if (oldest === undefined || second === undefined)
    throw new Error('Missing ordered proof bundles');
  second.receipt.at = oldest.receipt.at;
  expect(() => {
    requireRegistryRetentionHistory(tied, operations);
  }).toThrow();
  const incomplete = structuredClone(final);
  const oldHistory = incomplete.environments.find(
    (environment) => environment.environment === 'history-old',
  );
  if (oldHistory === undefined) throw new Error('Missing old history');
  oldHistory.releases.pop();
  expect(() => {
    requireRegistryRetentionHistory(incomplete, operations);
  }).toThrow();
  expect(() => {
    requireRegistryRetentionHistory(final, operations.slice(1));
  }).toThrow();
  const thirteen = structuredClone(final);
  thirteen.bundles = thirteen.bundles.filter((bundle) => bundle.operationId !== 'release-14');
  const shorter = thirteen.environments.find(
    (environment) => environment.environment === 'history-new',
  );
  if (shorter === undefined) throw new Error('Missing shorter modeled history');
  shorter.releases.shift();
  expect(() => {
    requireRegistryRetentionHistory(thirteen, operations.slice(0, 13));
  }).toThrow();
  const complete = {
    journal: final,
    uploads: [],
    partialOperations: [],
    neverUploaded: [],
    unreferencedContent: [],
  };
  expect(() => {
    requireRegistryPromotedHistoryInventory(complete);
  }).not.toThrow();
  for (const fault of [
    'upload',
    'unpromoted',
    'reservation',
    'deployment',
    'partial',
    'never-uploaded',
    'unreferenced',
    'publication',
    'count',
  ] as const) {
    const changed = structuredClone(complete);
    if (fault === 'upload') changed.uploads.push({} as never);
    if (fault === 'unpromoted') changed.journal.bundles[0].receipt.state = 'completed';
    if (fault === 'reservation') changed.journal.reservations.push({} as never);
    if (fault === 'deployment') changed.journal.deployments[0].phase = 'protected';
    if (fault === 'partial') changed.partialOperations.push('release-1' as never);
    if (fault === 'never-uploaded') changed.neverUploaded.push({} as never);
    if (fault === 'unreferenced') changed.unreferencedContent.push({} as never);
    if (fault === 'publication') changed.journal.publication = {} as never;
    if (fault === 'count') changed.journal.bundles.pop();
    expect(() => {
      requireRegistryPromotedHistoryInventory(changed);
    }).toThrow();
  }
  const plan = planRetirement({
    now: at,
    mode: 'nightly',
    capacity: {
      maximumBytes: GiB,
      usableBytes: GiB,
      usedBytes: 14 * 1024,
      totalInodes: 100000,
      usedInodes: 140,
      rootFreeBytes: 30 * GiB,
    },
    graph: {
      complete: true,
      nodes: final.bundles.map((bundle) => ({
        digest: bundle.roots[0],
        bytes: 1024,
        inodes: 1,
        dependencies: [],
      })),
    },
    bundles: final.bundles,
    protections: final.environments.map((environment) => ({
      owner: environment.environment,
      reason: 'current-consumer',
      roots:
        final.bundles.find((bundle) => bundle.operationId === environment.releases[0])?.roots ?? [],
    })),
    registeredEnvironments: final.environments.map((environment) => environment.environment),
    histories: final.environments.map((environment) => ({
      environment: environment.environment,
      state: 'successful',
      complete: true,
      releases: environment.releases,
    })),
  });
  expect(plan.retireOperations).toEqual(['release-4']);
  const stamps = Array.from(
    { length: 14 },
    (_, i) => final.bundles.find((b) => b.operationId === 'release-' + String(i + 1))?.receipt.at,
  );
  expect(stamps).toEqual(
    Array.from({ length: 14 }, (_, i) =>
      new Date(Date.parse(firstInstallAt) + (i + 1) * 1000).toISOString(),
    ),
  );
}, 20000);
test('history native caller requires exactly one actual LF census receipt', () => {
  const line = 'task8-history-census:all-promoted-no-staging';
  expect(() => {
    requireRegistryHistoryCensus('other\n' + line + '\n');
  }).not.toThrow();
  expect(() => {
    requireRegistryHistoryCensus('other\n');
  }).toThrow('Native history pre-effect census receipt is absent or duplicated');
  expect(() => {
    requireRegistryHistoryCensus(line + '\n' + line + '\n');
  }).toThrow('Native history pre-effect census receipt is absent or duplicated');
});

for (const [fault, stderr] of [
  ['prefix', 'prefix-task8-history-census:all-promoted-no-staging\n'],
  ['suffix', 'task8-history-census:all-promoted-no-staging-suffix\n'],
  ['CRLF', 'task8-history-census:all-promoted-no-staging\r\n'],
] as const) {
  test('history census refuses nonexact ' + fault + ' receipt text', () => {
    expect(() => {
      requireRegistryHistoryCensus(stderr);
    }).toThrow('Native history pre-effect census receipt is absent or duplicated');
  });
}
test('history census retains the original final-line-without-LF admission', () => {
  expect(() => {
    requireRegistryHistoryCensus('task8-history-census:all-promoted-no-staging');
  }).not.toThrow();
});
