import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { mock } from 'bun:test';

import * as platform from './platform-registry';
import { settleRegistryClientFixture } from './registry-client-completion.fixture';
import * as inventory from './registry-inventory';
import * as host from './registry-maintenance-host';
import { RegistryMaintenanceEvidence, RegistryRecoveryReceipt } from './registry-maintenance-state';
import * as journal from './registry-managed-journal';

const scope = type
  .enumerated(
    'census',
    'deletion',
    'retained',
    'stage',
    'activate',
    'restore',
    'open-readonly',
    'open-deletion',
    'open-recovery',
  )
  .assert(process.argv.at(2));
const fault = type
  .enumerated(
    'both-error',
    'work-error',
    'cleanup-error',
    'success',
    'both-undefined',
    'both-null',
    'both-string',
    'both-aggregate',
    'work-undefined',
    'work-null',
    'work-string',
    'work-aggregate',
    'cleanup-undefined',
    'cleanup-null',
    'cleanup-string',
    'cleanup-aggregate',
    'syntax',
    'owner',
  )
  .assert(process.argv.at(3));
const primary: unknown = fault.endsWith('-undefined')
  ? undefined
  : fault.endsWith('-null')
    ? null
    : fault.endsWith('-string')
      ? 'operation sentinel'
      : fault.endsWith('-aggregate')
        ? new AggregateError(
            [new Error('nested first'), new Error('nested second')],
            'operation sentinel',
          )
        : new Error('operation sentinel');
const cleanup: unknown =
  fault === 'cleanup-undefined'
    ? undefined
    : fault === 'cleanup-null'
      ? null
      : fault === 'cleanup-string'
        ? 'cleanup sentinel'
        : fault === 'cleanup-aggregate'
          ? new AggregateError([new Error('nested cleanup')], 'cleanup sentinel')
          : new Error('cleanup sentinel');
const failsWork = !fault.startsWith('cleanup-') && fault !== 'success';
const failsClose = !fault.startsWith('work-') && fault !== 'success';
const directory = await mkdtemp('/tmp/task8-close-errors-');
const canonical = join(directory, 'canonical'),
  ordinary = join(directory, 'ordinary'),
  target = join(directory, 'target'),
  staged = join(directory, 'staged');
for (const path of [canonical, ordinary, target, staged]) await mkdir(path, { mode: 0o700 });
const ports: journal.RegistryJournalPorts = {
  measureJournal: () =>
    Promise.resolve({
      usableBytes: 1024 ** 3,
      allocationUnitBytes: 4096,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
    }),
  measureRegistry: () =>
    Promise.resolve({
      maximumBytes: 50 * 1024 ** 3,
      usableBytes: 50 * 1024 ** 3,
      usedBytes: 1024 ** 3,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * 1024 ** 3,
    }),
  verifyConsumers: () => Promise.resolve(),
  collectConsumers: () => Promise.resolve([]),
};
await journal.executeRegistryCommand(
  canonical,
  {
    command: 'initialize',
    enrollment: {
      registryId: 'fixture',
      storageId: 'old',
      owners: ['owner'],
      registryPath: ordinary,
      rootPath: '/',
      maximumBytes: 50 * 1024 ** 3,
      journalMaximumBytes: 1024 ** 3,
    },
  },
  ports,
);
await journal.executeRegistryCommand(canonical, { command: 'upgrade-maintenance' }, ports);
const snapshot = (await journal.executeRegistryCommand(canonical, { command: 'read' }, ports))
  .state;
if (snapshot.schemaVersion !== 4) throw new Error('Expected complete schema4 fixture');
const current = structuredClone(snapshot);
current.revision = 10;
current.maintenance = {
  operationId: 'owned',
  owner: 'owner',
  token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  kind: scope === 'deletion' ? 'retirement' : 'backup',
  phase: scope === 'activate' || scope === 'stage' ? 'verified' : 'acquired',
  resumePhase: scope === 'activate' || scope === 'stage' ? 'verified' : 'acquired',
};
current.maintenanceEvidence = RegistryMaintenanceEvidence.assert({
  operationId: 'owned',
  runtime: null,
  plan: null,
  backup: null,
  backupCensusSha256: null,
  backupAttempts: [],
  backupReconciliation: null,
  backupReconciliations: [],
  uploadsVerified: null,
  retained: [],
  deletions: [],
  recovery: null,
});
const bytes = Buffer.from(JSON.stringify(snapshot));
const backup = {
  snapshotId: 'a'.repeat(64),
  verifiedAt: new Date().toISOString(),
  registryId: 'fixture',
  storageId: 'old',
  registryPath: ordinary,
  journalPath: canonical,
  journalRevision: snapshot.revision,
  journalSha256: createHash('sha256').update(bytes).digest('hex'),
  censusSha256: 'b'.repeat(64),
  bytes: bytes.length,
};
const identity = {
  registryId: 'fixture',
  storageId: 'new',
  node: 'fixture',
  pvcUid: 'fixture',
  mountIdentity: 'fixture',
  distributionDigest: 'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
  binarySha256: '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37',
};
const preparation = {
  state: 'prepared' as const,
  operationId: 'owned',
  snapshotId: backup.snapshotId,
  previousStorageId: 'old',
  previousRegistryPath: ordinary,
  storageId: 'new',
  registryPath: target,
  maximumBytes: current.enrollment.maximumBytes,
  canonicalJournalPath: canonical,
  stagedJournalPath: staged,
  stagedJournalStorageId: 'staged',
  stagedJournalMaximumBytes: current.enrollment.journalMaximumBytes,
  node: identity.node,
  pvcUid: identity.pvcUid,
  mountIdentity: identity.mountIdentity,
  distributionDigest: identity.distributionDigest,
  binarySha256: identity.binarySha256,
  preparedAt: new Date().toISOString(),
};
if (['stage', 'activate', 'restore'].includes(scope)) {
  current.maintenanceEvidence.backup = backup;
  current.maintenanceEvidence.recovery = JSON.stringify(
    scope === 'restore'
      ? preparation
      : {
          operationId: 'owned',
          snapshotId: backup.snapshotId,
          previousStorageId: 'old',
          previousRegistryPath: ordinary,
          storageId: 'new',
          registryPath: target,
          maximumBytes: current.enrollment.maximumBytes,
          canonicalJournalPath: canonical,
          stagedJournalPath: staged,
          stagedJournalRevision: snapshot.revision,
          stagedJournalSha256: backup.journalSha256,
          currentJournalRevision: 9,
          censusSha256: 'b'.repeat(64),
          verifiedAt: new Date().toISOString(),
          handoff: 'offline-exclusion-and-current-obligation-reconciliation-required',
        },
  );
  if (scope !== 'restore') {
    current.enrollment.storageId = 'new';
    current.enrollment.registryPath = target;
  }
}
let opens = 0,
  censuses = 0,
  closeCalls = 0,
  targetReached = false,
  restored = false;
const lifetime = { closed: false };
const targetOpen = scope === 'deletion' ? 4 : scope === 'retained' ? 2 : 1;
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('owned socket'),
});
const closeStarted = Promise.withResolvers<undefined>();
const releaseClose = Promise.withResolvers<undefined>();
let observedClose: Promise<unknown> | undefined;
const close = () => {
  closeCalls++;
  closeStarted.resolve(undefined);
  const pending = (async () => {
    await releaseClose.promise;
    await server.stop(true);
    await writeFile(join(directory, 'closed'), 'closed');
    lifetime.closed = true;
    if (failsClose) throw cleanup;
  })();
  observedClose = pending.then(
    () => ({ state: 'closed' }),
    (cause: unknown) => ({ state: 'failed', cause }),
  );
  return pending;
};
const runtime = {
  inspect: () => Promise.resolve('prior'),
  fence: () => Promise.resolve('fenced'),
  assertStopped: () => Promise.resolve(),
  identify: () => Promise.resolve(identity),
  open: () => {
    opens++;
    if (opens === targetOpen) targetReached = true;
    return Promise.resolve({
      endpoint: { url: server.url.toString() },
      close: opens === targetOpen ? close : () => Promise.resolve(),
    });
  },
  discardUploads: () => Promise.resolve('c'.repeat(64)),
  collect: () => Promise.resolve(),
  verifyImages: settleRegistryClientFixture,
  restoreService: () => {
    restored = true;
    return Promise.resolve(undefined);
  },
};
// Boundary: the owning session methods/barriers and inventory/planning observations are modeled; these tests exercise real caller control flow, staged-file parsing/projection and gated file/socket cleanup, not durable authority or physical collection.
const authority = {
  authorityDescriptor: 3,
  settleClient: (receipt: Parameters<journal.RegistryMaintenanceSession['settleClient']>[0]) => {
    if (current.maintenanceEvidence === null) throw new Error('Missing modeled client owner');
    current.maintenanceEvidence.client = receipt;
    current.revision++;
    current.updatedAt = new Date().toISOString();
    return Promise.resolve();
  },
  read: () => structuredClone(current),
  record: (evidence: RegistryMaintenanceEvidence) => {
    current.maintenanceEvidence = evidence;
    current.revision++;
    current.updatedAt = new Date().toISOString();
    return Promise.resolve(undefined);
  },
  measureReclamation: async (stage: 'before' | 'after') => {
    const capacity = await ports.measureRegistry(current.enrollment);
    const evidence = current.maintenanceEvidence;
    if (evidence === null) throw new Error('Missing modeled measurement owner');
    current.revision++;
    current.updatedAt = new Date().toISOString();
    const measurement = { ...capacity, at: current.updatedAt, journalRevision: current.revision };
    if (stage === 'before')
      evidence.reclamation = {
        operationId: 'owned',
        storageId: current.enrollment.storageId,
        registryPath: current.enrollment.registryPath,
        snapshotId: backup.snapshotId,
        before: measurement,
        after: null,
        planSha256: null,
        reclaimedBytes: null,
        reclaimedInodes: null,
      };
    else {
      if (evidence.reclamation === undefined || evidence.plan === null)
        throw new Error('Missing modeled baseline or plan');
      evidence.reclamation = {
        ...evidence.reclamation,
        after: measurement,
        planSha256: createHash('sha256').update(evidence.plan).digest('hex'),
        reclaimedBytes: 0,
        reclaimedInodes: 0,
      };
    }
    return capacity;
  },
  advance: (phase: NonNullable<journal.RegistryJournal['maintenance']>['resumePhase']) => {
    if (current.maintenance === null) throw new Error('Missing fixture ownership');
    current.maintenance.phase = phase;
    current.maintenance.resumePhase = phase;
    current.revision++;
    current.updatedAt = new Date().toISOString();
    return Promise.resolve(undefined);
  },
  prepareRetirement: () => Promise.resolve(),
  retire: () => Promise.resolve(),
  restore: () => Promise.reject(new Error('Unexpected unprepared restore')),
  deferActivation: () => Promise.resolve(),
} as unknown as journal.RegistryMaintenanceSession;
await mock.module('./registry-managed-journal', () => ({
  ...journal,
  runRegistryMaintenance: (
    _directory: unknown,
    _options: unknown,
    _ports: unknown,
    operate: (session: journal.RegistryMaintenanceSession) => Promise<void>,
  ) => operate(authority),
}));
const revision = { repository: 'retired', digest: 'sha256:' + 'a'.repeat(64) };
await mock.module('./registry-inventory', () => ({
  ...inventory,
  collectRegistryInventory: () => {
    censuses++;
    if (scope !== 'deletion' && opens === targetOpen && failsWork) throw primary;
    return Promise.resolve({
      identity,
      journal: structuredClone(current),
      graph: { complete: true, nodes: [] },
      revisions: scope === 'deletion' && censuses <= 3 ? [revision] : [],
      tags: [],
      uploads: [],
      orphanBlobs: [],
      unreferencedContent: [],
      partialOperations: [],
      neverUploaded: [],
      protections: [],
      consumerReferences: [],
      binding: {
        journalRevision: current.revision,
        obligationsSha256: 'b'.repeat(64),
        censusSha256: 'b'.repeat(64),
        filesystem: 'fixture',
        identity,
      },
    });
  },
  planRegistryRetirement: () => ({ retireRevisions: [revision] }),
  assertRegistryPlan: () => undefined,
}));
await mock.module('./platform-registry', () => ({
  ...platform,
  requestRegistry: (_endpoint: unknown, _path: unknown, request: RequestInit) => {
    if (scope !== 'deletion' || request.method !== 'DELETE')
      throw new Error('Unexpected fixture HTTP request');
    if (failsWork) throw primary;
    return Promise.resolve(new Response(null, { status: 202 }));
  },
}));
await mock.module('./registry-maintenance-host', () => ({
  ...host,
  connectRegistryMaintenanceHost: (_authority: unknown, action: string) => {
    const expected =
      scope === 'open-deletion'
        ? 'serve-deletion'
        : scope === 'open-recovery'
          ? 'serve-recovery'
          : 'serve-readonly';
    if (action !== expected) throw new Error('Unexpected root action');
    targetReached = true;
    return Promise.resolve({
      get receipt() {
        if (failsWork && fault !== 'syntax' && fault !== 'owner') throw primary;
        return fault === 'syntax'
          ? '{'
          : JSON.stringify({ url: 'http://127.0.0.1:5051', authentication: 'operation-token' });
      },
      close,
    });
  },
}));
const backupPorts = {
  prepare: () => Promise.resolve(),
  snapshot: () => Promise.resolve(backup),
  verify: () => Promise.resolve(),
  restore: () => writeFile(join(staged, 'journal.json'), bytes),
};
let finished = false;
try {
  const maintenance = await import('./registry-maintenance');
  const invoke = async () => {
    if (scope.startsWith('open-')) {
      const { createRegistryMaintenanceRuntime } = await import('./registry-maintenance-runtime');
      const actual = createRegistryMaintenanceRuntime();
      const selected =
        fault === 'owner'
          ? { ...authority, read: () => ({ ...current, maintenance: null }) }
          : authority;
      const opened =
        scope === 'open-recovery'
          ? await actual.recovery.open(selected)
          : await actual.open(selected, scope === 'open-deletion' ? 'deletion' : 'readonly');
      if (closeCalls !== 0) throw new Error('Open closed before ownership transfer');
      await opened.close();
      return;
    }
    const input = {
      directory: canonical,
      operationId: 'owned',
      owner: 'owner',
      kind: scope === 'deletion' ? ('retirement' as const) : ('backup' as const),
      ports,
      runtime,
      backup: backupPorts,
    };
    if (scope === 'stage') return maintenance.stageRegistryRecovery(input);
    if (scope === 'activate')
      return maintenance.completeRegistryRecovery({
        ...input,
        assertDesired: () => Promise.resolve(),
      });
    if (scope === 'restore') {
      const { createRegistryRecoveryVerifier } = await import('./registry-maintenance-recovery');
      const oldDevice = (await lstat(ordinary)).dev;
      const verifier = createRegistryRecoveryVerifier({
        runtime: {
          verifyImages: (authority, inventory) =>
            settleRegistryClientFixture(authority, inventory, 'recovery'),
          assertStopped: () => Promise.resolve(),
          audit: () =>
            Promise.resolve({
              target: preparation,
              registryIdentityReceipt: 'registry',
              stagedJournalIdentityReceipt: 'staged',
              canonicalJournalIdentityReceipt: 'canonical',
            }),
          open: runtime.open,
        },
        backup: backupPorts,
        consumers: ports,
        measure: (path) =>
          Promise.resolve({
            device: oldDevice + (path === target ? 1 : path === staged ? 2 : 3),
            identity: path === target ? 'new' : path === staged ? 'staged' : 'canonical',
            maximumBytes:
              path === target
                ? current.enrollment.maximumBytes
                : current.enrollment.journalMaximumBytes,
            usableBytes: 1024 ** 3,
            allocationUnitBytes: 4096,
            usedBytes: 1000,
            availableBytes: 1024 ** 3 - 1000,
            reservedBytes: 0,
            totalInodes: 10000,
            usedInodes: 10,
          }),
      });
      if (verifier.recoverRegistry === undefined) throw new Error('Missing recovery fixture port');
      RegistryRecoveryReceipt.assert(await verifier.recoverRegistry(current, 3, authority));
      return;
    }
    return maintenance.maintainRegistry(input);
  };
  const pending = invoke().then(
    () => {
      finished = true;
      return { state: 'returned' as const };
    },
    (cause: unknown) => {
      finished = true;
      return { state: 'rejected' as const, cause };
    },
  );
  await Promise.race([closeStarted.promise, pending]);
  await Bun.sleep(0);
  const settledBeforeRelease = finished;
  releaseClose.resolve(undefined);
  const completion = await pending;
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  const members: unknown[] = cause instanceof AggregateError ? cause.errors : [];
  const observedPrimary = members[0];
  console.log(
    JSON.stringify({
      state: completion.state,
      targetReached,
      closeCalls,
      settledBeforeRelease,
      closed: lifetime.closed,
      marker: lifetime.closed ? await readFile(join(directory, 'closed'), 'utf8') : null,
      aggregate: cause instanceof AggregateError,
      members: members.length,
      primarySame: observedPrimary === primary,
      cleanupSame: members[1] === cleanup,
      causeOwn: cause instanceof Error && Object.hasOwn(cause, 'cause'),
      causeSame: cause instanceof Error && cause.cause === observedPrimary,
      singlePrimarySame: cause === primary,
      singleCleanupSame: cause === cleanup,
      primarySyntax: observedPrimary instanceof SyntaxError,
      primaryOwner:
        observedPrimary instanceof Error &&
        observedPrimary.message === 'Lost maintenance HTTP ownership',
      restored,
      message: cause instanceof Error ? cause.message : String(cause),
    }),
  );
} finally {
  releaseClose.resolve(undefined);
  if (observedClose !== undefined) await observedClose;
  await server.stop(true);
  await rm(directory, { recursive: true });
}
