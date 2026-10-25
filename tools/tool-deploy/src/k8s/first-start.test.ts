import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRegistryHistory } from '@tools/registry-publication';
import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { fixtureCutoverIdentity, fixtureDescriptor } from './cutover-replay.fixture';
import { executeRelease } from './execute';
import { FakeCluster, memoryJournal } from './fake-cluster';
import {
  type FirstStartEffects,
  type FirstStartJournal,
  firstStartJournal,
  type FirstStartRequest,
  type FirstStartState,
  inheritFirstStartHistory,
  initializeFirstStartHistory,
  parseFirstStartRequest,
  startCutover as nativeStartCutover,
} from './first-start';
import { sha256Of } from './migration-capture';
import { readReleaseHistory } from './registry-history-reader';

function startCutover(...args: Parameters<typeof nativeStartCutover>) {
  return nativeStartCutover(
    args[0],
    args[1],
    args[2],
    args[3],
    args[4] ?? (() => Promise.resolve(undefined)),
  );
}

function fixture(descriptor = fixtureDescriptor) {
  const original = fixtureCutoverIdentity();
  const descriptorBytes = JSON.stringify(descriptor);
  const identity = { ...original, descriptorBytes, descriptorSha256: sha256Of(descriptorBytes) };
  const exported = {
    path: '/export/wbs-export.sqlite',
    integrity: ['ok'],
    foreignKeyViolations: 0,
    migrations: ['m1'],
    counts: { project: 1 },
    known: { known: true },
    sha256: 'c'.repeat(64),
    ownerUid: 0,
    replay: {
      ...identity,
      version: 1,
      inventory: [{ kind: 'move_progress_v1', count: 1 }],
      capabilities: ['move_progress_v1'],
      exportSha256: 'c'.repeat(64),
    },
  };
  const restored = { ...exported, path: '/data/wbs.sqlite', ownerUid: 10001 };
  const request: FirstStartRequest = {
    environment: 'local',
    identity,
    exported,
    restored,
    cluster: { context: 'lab', uid: 'cluster' },
    namespaces: { app: 'wbs', backend: 'wbs-solver', appUid: 'app', backendUid: 'backend' },
    pvc: { name: 'wbs-data', uid: 'volume', path: '/data/wbs.sqlite' },
    restore: { name: 'wbs-cutover-restore', uid: 'restore' },
    flux: {
      namespace: 'flux-system',
      kustomization: 'wbs',
      gitRepository: 'wbs',
      desiredRevision: 'a'.repeat(40),
      previousRevision: 'b'.repeat(40),
    },
  };
  const calls: string[] = [];
  let stored: unknown = null;
  const journal: FirstStartJournal = {
    path: '/first-start.json',
    read: () => stored,
    write: (entry) => {
      calls.push(`persist:${entry.phase}`);
      stored = structuredClone(entry);
    },
  };
  const effects: FirstStartEffects = {
    installMutationGuard: () => undefined,
    admitSource: (request) => {
      const bytes = JSON.stringify({
        version: 1,
        requestSha256: sha256Of(JSON.stringify(request)),
        kuid: 'ks',
        guid: 'git',
        kSpec: JSON.stringify({
          interval: '10s',
          path: './clusters/local/wbs',
          prune: false,
          suspend: true,
          sourceRef: { kind: 'GitRepository', name: request.flux.gitRepository },
        }),
        gSpec: JSON.stringify({
          interval: '10s',
          url: 'http://fixture.invalid/repo',
          ref: { commit: request.flux.desiredRevision },
        }),
        artifact: JSON.stringify({
          revision: 'main@sha1:' + request.flux.desiredRevision,
          digest: 'sha256:' + 'd'.repeat(64),
          url: 'http://source/artifact',
          path: 'artifact.tar.gz',
        }),
        tree: 'c'.repeat(40),
        manifestSha256: 'd'.repeat(64),
        inventorySha256: 'e'.repeat(64),
      });
      return Promise.resolve({ bytes, sha256: sha256Of(bytes) });
    },
    assertTarget: () => {
      calls.push('target');
      return Promise.resolve();
    },
    readLease: () => Promise.resolve(null),
    createLease: async () => {
      await Promise.resolve();
      calls.push('lease');
    },
    takeoverLease: async () => {
      await Promise.resolve();
    },
    renewLease: async () => {
      await Promise.resolve();
    },
    parkLease: async () => {
      await Promise.resolve();
      calls.push('park');
    },
    releaseLease: async () => {
      await Promise.resolve();
      calls.push('release');
    },
    closeWrites: async () => {
      await Promise.resolve();
      calls.push('fence');
    },
    suspendFlux: async () => {
      await Promise.resolve();
      calls.push('suspend');
    },
    stopTiers: async () => {
      await Promise.resolve();
      calls.push('stop');
    },
    assertSafety: async () => {
      await Promise.resolve();
      calls.push('safety');
    },
    observeRestore: async () => {
      await Promise.resolve();
      calls.push('restore');
      return restored;
    },
    observePvc: async () => {
      await Promise.resolve();
      calls.push('actual');
      return { report: restored, activation: 'DISABLED' };
    },
    startTier: async (tier) => {
      await Promise.resolve();
      calls.push(`start:${tier}`);
    },
    verifyTiers: async () => {
      await Promise.resolve();
      calls.push('verify');
    },
    persistRelease: async () => {
      await Promise.resolve();
      calls.push('record');
    },
    currentRelease: () =>
      Promise.resolve({
        sourceSha: descriptor.sourceSha,
        images: descriptor.images,
      }),
    fluxSourceRevision: () => Promise.resolve(`main@sha1:${request.flux.desiredRevision}`),
    resumeSource: async () => {
      await Promise.resolve();
      calls.push('handoff');
    },
  };
  return {
    request,
    calls,
    effects,
    journal,
    stored: () => stored,
    replace: (entry: unknown) => {
      stored = entry;
    },
  };
}

describe('durable first cutover admission', () => {
  it('persists actual PVC replay and disabled authority before explicitly starting every tier', async () => {
    await Promise.resolve();
    const f = fixture();
    await startCutover(f.request, f.journal, f.effects);
    expect(f.calls.indexOf('persist:admitted')).toBeGreaterThan(f.calls.indexOf('actual'));
    expect(f.calls.indexOf('start:backend')).toBeGreaterThan(f.calls.indexOf('persist:admitted'));
    expect(f.calls.filter((c) => c.startsWith('start:'))).toEqual([
      'start:backend',
      'start:gateway',
      'start:frontend',
      'start:mcp',
    ]);
    expect(f.calls.indexOf('record')).toBeGreaterThan(f.calls.indexOf('verify'));
    expect(f.calls.indexOf('handoff')).toBeGreaterThan(f.calls.indexOf('persist:recorded'));
    expect(f.calls.at(-1)).toBe('persist:complete');
  });
  for (const fault of [
    'restore',
    'restore-evidence',
    'actual-bytes',
    'actual-replay',
    'enabled',
    'safety',
    'record',
    'revision',
    'handoff-fence',
  ] as const) {
    it(`refuses ${fault} and keeps the Lease, fence and Flux suspension`, async () => {
      await Promise.resolve();
      const f = fixture();
      if (fault === 'restore')
        f.effects.observeRestore = () =>
          Promise.resolve({ ...f.request.restored, counts: { project: 0 } });
      if (fault === 'actual-bytes')
        f.effects.observePvc = () =>
          Promise.resolve({
            report: { ...f.request.restored, sha256: 'd'.repeat(64) },
            activation: 'DISABLED',
          });
      if (fault === 'restore-evidence')
        f.effects.observeRestore = () =>
          Promise.resolve({ ...f.request.restored, replay: undefined });
      if (fault === 'actual-replay')
        f.effects.observePvc = () =>
          Promise.resolve({
            report: {
              ...f.request.restored,
              replay: {
                ...fixtureCutoverIdentity(),
                version: 1,
                inventory: [],
                capabilities: ['move_progress_v1'],
                exportSha256: f.request.exported.sha256,
              },
            },
            activation: 'DISABLED',
          });
      if (fault === 'enabled')
        f.effects.observePvc = () =>
          Promise.resolve({ report: f.request.restored, activation: 'ENABLED' });
      if (fault === 'safety')
        f.effects.assertSafety = async () => {
          await Promise.resolve();
          throw new Error('foreign PVC / active writer / open fence / active Flux');
        };
      if (fault === 'record') f.effects.currentRelease = () => Promise.resolve(null);
      if (fault === 'revision')
        f.effects.fluxSourceRevision = () => Promise.resolve('main@sha1:' + 'd'.repeat(40));
      if (fault === 'handoff-fence')
        f.effects.resumeSource = async () => {
          await Promise.resolve();
          f.effects.assertSafety = async () => {
            await Promise.resolve();
            throw new Error('open handoff fence');
          };
        };
      await refuse(startCutover(f.request, f.journal, f.effects));
      expect(f.calls).toContain('park');
      expect(f.calls).not.toContain('release');
      expect(f.calls.at(-1)).toBe('park');
      if (
        [
          'restore',
          'restore-evidence',
          'actual-bytes',
          'actual-replay',
          'enabled',
          'safety',
        ].includes(fault)
      )
        expect(f.calls.some((c) => c.startsWith('start:'))).toBe(false);
    });
  }
  it('rereads a persisted admission before scaling and refuses corruption', async () => {
    await Promise.resolve();
    const f = fixture();
    const write = f.journal.write.bind(f.journal);
    f.journal.write = (entry) => {
      write(entry);
      if (entry.phase === 'admitted') f.replace({ ...entry, receipt: null });
    };
    await refuse(startCutover(f.request, f.journal, f.effects));
    expect(f.calls.some((c) => c.startsWith('start:'))).toBe(false);
  });
  it('resumes partial scaling by stopping tiers and freshly observing the PVC', async () => {
    await Promise.resolve();
    const f = fixture();
    f.effects.startTier = async () => {
      await Promise.resolve();
      throw new Error('crash during scaling');
    };
    await refuse(startCutover(f.request, f.journal, f.effects));
    f.calls.length = 0;
    f.effects.startTier = async (tier) => {
      await Promise.resolve();
      f.calls.push(`start:${tier}`);
    };
    await startCutover(f.request, f.journal, f.effects);
    expect(f.calls.indexOf('actual')).toBeGreaterThan(f.calls.indexOf('stop'));
    expect(f.calls.indexOf('start:backend')).toBeGreaterThan(f.calls.indexOf('actual'));
  });
  it('refuses foreign resumed request and missing durable receipts before acquiring the Lease', async () => {
    await Promise.resolve();
    const f = fixture();
    await startCutover(f.request, f.journal, f.effects);
    f.calls.length = 0;
    await refuse(
      startCutover({ ...f.request, pvc: { ...f.request.pvc, uid: 'other' } }, f.journal, f.effects),
    );
    expect(f.calls).toEqual([]);
    const stored = f.stored() as object;
    f.replace({ ...stored, receipt: null });
    await refuse(startCutover(f.request, f.journal, f.effects));
  });
});

for (const fault of [
  'version',
  'phase',
  'transaction',
  'request-digest',
  'receipt-digest',
  'receipt-transaction',
  'receipt-request',
  'receipt-report',
  'receipt-activation',
] as const) {
  it(`refuses sealed first-start progress corruption before Lease mutation: ${fault}`, async () => {
    const f = fixture();
    await startCutover(f.request, f.journal, f.effects);
    f.calls.length = 0;
    const stored = structuredClone(f.stored()) as FirstStartState;
    if (fault === 'version') Object.assign(stored, { version: 4 });
    if (fault === 'phase') Object.assign(stored, { phase: 'unknown' });
    if (fault === 'transaction') stored.transaction = 'first-start-' + 'd'.repeat(16);
    if (fault === 'request-digest') stored.requestSha256 = 'd'.repeat(64);
    if (stored.receipt === null) throw new Error('fixture lacks receipt');
    if (fault === 'receipt-digest') stored.receipt.sha256 = 'd'.repeat(64);
    if (fault.startsWith('receipt-') && fault !== 'receipt-digest') {
      const payload = JSON.parse(stored.receipt.bytes) as Record<string, unknown>;
      if (fault === 'receipt-transaction') payload['transaction'] = 'foreign';
      if (fault === 'receipt-request') payload['requestSha256'] = 'foreign';
      if (fault === 'receipt-report') payload['report'] = null;
      if (fault === 'receipt-activation') payload['activation'] = null;
      stored.receipt.bytes = JSON.stringify(payload);
      stored.receipt.sha256 = sha256Of(stored.receipt.bytes);
    }
    f.replace(stored);
    await refuse(startCutover(f.request, f.journal, f.effects));
    expect(f.calls).toEqual([]);
  });
}

it('distinguishes absent durable files from malformed and unreadable state', () => {
  const root = scratchSync('first-start-file-');
  try {
    const path = join(root, 'state.json');
    const journal = firstStartJournal(path);
    expect(journal.read()).toBeNull();
    for (const bytes of ['null', 'not json']) {
      writeFileSync(path, bytes);
      expect(() => journal.read()).toThrow('unreadable or malformed');
    }
    writeFileSync(path, '{}');
    chmodSync(path, 0o000);
    expect(() => journal.read()).toThrow('unreadable or malformed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('refuses malformed operator input before creating Kubernetes effects', () => {
  const f = fixture();
  expect(parseFirstStartRequest(f.request)).toEqual(f.request);
  for (const raw of [
    null,
    [],
    {},
    { ...f.request, cluster: null },
    { ...f.request, namespaces: { ...f.request.namespaces, app: 'other' } },
    { ...f.request, pvc: { ...f.request.pvc, uid: '' } },
    { ...f.request, restored: null },
  ]) {
    expect(() => parseFirstStartRequest(raw)).toThrow();
  }
});

it('refuses a live foreign Lease before persisting state or fencing the cluster', async () => {
  const f = fixture();
  f.effects.readLease = () =>
    Promise.resolve({
      holder: 'foreign#live',
      renewedAtMs: Date.now(),
      durationSeconds: 20,
      parked: null,
      journal: '/foreign',
      version: '1',
    });
  await refuse(startCutover(f.request, f.journal, f.effects));
  expect(f.calls).toEqual(['target']);
});

it('stops mutations when its Lease renewal fails', async () => {
  const f = fixture();
  f.effects.renewLease = () => Promise.reject(new Error('Lease lost'));
  await refuse(startCutover(f.request, f.journal, f.effects));
  expect(f.calls).toEqual(['target', 'lease', 'persist:requested']);
});

it('serializes heartbeats and reclaims its own parked interrupted transaction', async () => {
  const f = fixture();
  f.effects.startTier = () => Promise.reject(new Error('crash'));
  await refuse(startCutover(f.request, f.journal, f.effects));
  const stored = f.stored() as FirstStartState;
  f.effects.readLease = () =>
    Promise.resolve({
      holder: `${stored.transaction}#old`,
      renewedAtMs: 0,
      durationSeconds: 20,
      parked: 'first-start-unresolved',
      journal: f.journal.path,
      version: '1',
    });
  f.effects.takeoverLease = () => {
    f.calls.push('takeover');
    return Promise.resolve();
  };
  f.effects.startTier = () => Promise.resolve();
  let concurrent = 0;
  let maximum = 0;
  f.effects.renewLease = async () => {
    concurrent++;
    maximum = Math.max(maximum, concurrent);
    await Bun.sleep(2);
    concurrent--;
  };
  await startCutover(f.request, f.journal, f.effects, 1);
  expect(maximum).toBe(1);
  expect(f.calls).toContain('takeover');
});

it('refuses a foreign target before acquiring a Lease or changing Flux, fence or tiers', async () => {
  const f = fixture();
  f.effects.assertTarget = () => Promise.reject(new Error('foreign cluster UID'));
  await refuse(startCutover(f.request, f.journal, f.effects));
  expect(f.calls).toEqual([]);
});

it('refuses a parked Lease when its durable transaction journal is missing', async () => {
  const f = fixture();
  f.effects.readLease = () =>
    Promise.resolve({
      holder: 'first-start-aaaaaaaaaaaaaaaa#old',
      renewedAtMs: 0,
      durationSeconds: 20,
      parked: 'first-start-unresolved',
      journal: f.journal.path,
      version: '1',
    });
  await refuse(startCutover(f.request, f.journal, f.effects));
  expect(f.calls).toEqual(['target']);
});

async function refuse(promise: Promise<unknown>): Promise<void> {
  const refusal = await promise.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
}

it('refuses tier scale when a delayed safety observation returns after heartbeat Lease loss', async () => {
  const f = fixture();
  let waiting = false;
  f.effects.renewLease = () =>
    waiting ? Promise.reject(new Error('Lease lost during safety')) : Promise.resolve();
  f.effects.assertSafety = async (_request, stopped) => {
    if (!stopped) {
      waiting = true;
      await Bun.sleep(15);
      f.calls.push('safety-returned-after-lease-loss');
    }
  };
  await refuse(startCutover(f.request, f.journal, f.effects, 1));
  expect(f.calls).toContain('safety-returned-after-lease-loss');
  expect(f.calls.some((call) => call.startsWith('start:'))).toBe(false);
});

for (const fault of [
  'source',
  'actual',
  'rollout',
  'record-readback',
  'source-revision',
] as const) {
  it(`refuses mutations after Lease loss during awaited ${fault} observation`, async () => {
    const f = fixture();
    let waiting = false;
    f.effects.renewLease = () =>
      waiting ? Promise.reject(new Error('Lease lost during observation')) : Promise.resolve();
    const delay = async () => {
      waiting = true;
      await Bun.sleep(15);
      f.calls.push('observation-returned-after-lease-loss');
    };
    if (fault === 'source') {
      const read = f.effects.admitSource.bind(f.effects);
      f.effects.admitSource = async (...args) => {
        await delay();
        return read(...args);
      };
    }
    if (fault === 'actual') {
      const read = f.effects.observePvc.bind(f.effects);
      f.effects.observePvc = async (...args) => {
        await delay();
        return read(...args);
      };
    }
    if (fault === 'rollout') {
      const read = f.effects.verifyTiers.bind(f.effects);
      f.effects.verifyTiers = async (...args) => {
        await delay();
        await read(...args);
      };
    }
    if (fault === 'record-readback') {
      const read = f.effects.currentRelease.bind(f.effects);
      f.effects.currentRelease = async () => {
        await delay();
        return read();
      };
    }
    if (fault === 'source-revision') {
      const read = f.effects.fluxSourceRevision.bind(f.effects);
      f.effects.fluxSourceRevision = async (...args) => {
        await delay();
        return read(...args);
      };
    }
    await refuse(startCutover(f.request, f.journal, f.effects, 1));
    const following = f.calls.slice(f.calls.indexOf('observation-returned-after-lease-loss') + 1);
    expect(
      following.some(
        (call) =>
          call.startsWith('start:') ||
          call.startsWith('persist:') ||
          ['record', 'resume', 'handoff', 'fence', 'suspend', 'park', 'release'].includes(call),
      ),
    ).toBe(false);
  });
}

it('refuses a queued renewal after the preceding heartbeat has lost its Lease', async () => {
  const f = fixture();
  let observing = false;
  let failed = false;
  let renewalsAfterLoss = 0;
  f.effects.assertSafety = async () => {
    observing = true;
    await Bun.sleep(4);
    observing = false;
  };
  f.effects.renewLease = async () => {
    if (failed) renewalsAfterLoss++;
    if (observing) {
      await Bun.sleep(12);
      failed = true;
      throw new Error('heartbeat renewal lost Lease');
    }
  };
  await refuse(startCutover(f.request, f.journal, f.effects, 1));
  expect(failed).toBe(true);
  expect(renewalsAfterLoss).toBe(0);
});

function managedFixture() {
  const f = fixture({
    ...fixtureDescriptor,
    images: {
      backend: fixtureDescriptor.images.backend,
      gateway: `registry.test/gw@sha256:${'1'.repeat(64)}`,
      frontend: `registry.test/fe@sha256:${'1'.repeat(64)}`,
      mcp: `registry.test/mcp@sha256:${'1'.repeat(64)}`,
    },
  });
  const scope = {
    registryId: 'proof',
    product: 'wbs',
    environment: 'prod',
    target: 'k8s:cluster/wbs/wbs-solver',
  };
  f.replace({
    version: 3,
    kind: 'registry-genesis',
    registryHistory: {
      ...scope,
      schemaVersion: 1,
      source: f.journal.path,
      genesis: { at: '2026-10-25T12:00:00.000Z', sourceRevision: 'observed-empty-source' },
      authorityRevision: 0,
      releases: [],
      promotion: null,
    },
  });
  const references = ['be', 'gw', 'fe', 'mcp'].map((repository) => ({
    repository,
    digest: `sha256:${'1'.repeat(64)}`,
  }));
  return {
    ...f,
    scope,
    references,
    completion: (operationId: string) => ({
      ...scope,
      authorityRevision: 9,
      releases: [
        {
          operationId: 'candidate',
          references,
          receipt: { state: 'promoted' as const, at: '2026-10-25T12:01:00.000Z' },
        },
      ],
      promotion: { operationId, candidate: 'candidate', at: '2026-10-25T12:01:00.000Z' },
    }),
  };
}
it('protects first-start before the Lease and promotes only after verified handoff', async () => {
  const f = managedFixture();
  const completed = await startCutover(
    f.request,
    f.journal,
    f.effects,
    3000,
    (_request, operationId) =>
      Promise.resolve().then(() => {
        f.calls.push('protect');
        return {
          operationId,
          registryId: 'proof',
          product: 'wbs',
          environment: 'prod',
          target: 'k8s:cluster/wbs/wbs-solver',
          references: [{ repository: 'wbs/backend', digest: `sha256:${'a'.repeat(64)}` }],
          finish: (outcome) =>
            Promise.resolve().then(() => {
              f.calls.push(`registry:${outcome}`);
              return f.completion(operationId);
            }),
        };
      }),
  );
  expect(f.calls[0]).toBe('protect');
  expect(f.calls.indexOf('protect')).toBeLessThan(f.calls.indexOf('lease'));
  expect(f.calls.indexOf('registry:promoted')).toBeGreaterThan(f.calls.indexOf('release'));
  expect(completed.version).toBe(3);
  expect(completed.registry?.operationId).toBe(completed.transaction);
  expect(completed.registryHistory?.releases[0].operationId).toBe('candidate');
});

it('retains interrupted first-start ownership and refuses erased or downgraded bindings before effects', async () => {
  for (const fault of ['interrupted', 'missing', 'downgrade', 'foreign', 'unselected']) {
    const f = managedFixture();
    const protect = (_request: FirstStartRequest, operationId: string) =>
      Promise.resolve().then(() => ({
        operationId,
        registryId: 'proof',
        product: 'wbs',
        environment: 'prod',
        target: 'k8s:cluster/wbs/wbs-solver',
        references: [{ repository: 'wbs/backend', digest: `sha256:${'a'.repeat(64)}` }],
        finish: () =>
          Promise.resolve().then(() => {
            f.calls.push('registry-finish');
            return undefined;
          }),
      }));
    f.effects.startTier = () =>
      Promise.resolve().then(() => {
        throw new Error('interrupted start');
      });
    await refuse(startCutover(f.request, f.journal, f.effects, 3000, protect));
    expect(f.calls).not.toContain('registry-finish');
    const stored = f.journal.read() as FirstStartState;
    expect(stored.registry?.operationId).toBe(stored.transaction);
    if (fault === 'interrupted') continue;
    if (fault === 'missing') delete stored.registry;
    if (fault === 'downgrade') {
      stored.version = 2;
      delete stored.registry;
    }
    if (fault === 'foreign' && stored.registry)
      stored.registry = { ...stored.registry, registryId: 'foreign' };
    f.calls.length = 0;
    await refuse(
      startCutover(
        f.request,
        f.journal,
        f.effects,
        3000,
        fault === 'unselected' ? () => Promise.resolve(undefined) : protect,
      ),
    );
    expect(f.calls).toEqual([]);
  }
});

it('initializes source-owned empty history explicitly and never overwrites existing or populated history', async () => {
  const root = scratchSync('first-start-genesis-');
  const path = join(root, 'first-start.json');
  const scope = {
    registryId: 'proof',
    product: 'wbs',
    environment: 'prod',
    target: 'k8s:cluster/wbs/wbs-solver',
  };
  try {
    await initializeFirstStartHistory(path, scope, () =>
      Promise.resolve({ sourceRevision: 'empty-cluster', images: [], hasReleaseEvidence: false }),
    );
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path, 'utf8');
    expect(
      parseRegistryHistory(
        (JSON.parse(bytes) as { registryHistory: unknown }).registryHistory,
        path,
      ).releases,
    ).toEqual([]);
    await refuse(
      initializeFirstStartHistory(path, scope, () =>
        Promise.resolve({ sourceRevision: 'empty-cluster', images: [], hasReleaseEvidence: false }),
      ),
    );
    expect(readFileSync(path, 'utf8')).toBe(bytes);
    const refused = join(root, 'existing-product.json');
    await refuse(
      initializeFirstStartHistory(refused, scope, () =>
        Promise.resolve({
          sourceRevision: 'existing-cluster',
          images: ['ghcr.io/old/product:1'],
          hasReleaseEvidence: true,
        }),
      ),
    );
    expect(existsSync(refused)).toBe(false);
    await refuse(
      initializeFirstStartHistory(refused, scope, () =>
        Promise.resolve({
          sourceRevision: 'old-release-record',
          images: [],
          hasReleaseEvidence: true,
        }),
      ),
    );
    expect(existsSync(refused)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('retries only history persistence after first-start authority promotion loses its local acknowledgement', async () => {
  const f = managedFixture();
  const write = f.journal.write.bind(f.journal);
  let lose = true;
  f.journal.write = (state) => {
    if (
      state.registryHistory?.promotion !== null &&
      state.registryHistory?.promotion !== undefined &&
      lose
    ) {
      lose = false;
      throw new Error('disk unavailable after authority promotion');
    }
    write(state);
  };
  const protect = (_request: FirstStartRequest, operationId: string) =>
    Promise.resolve({
      ...f.scope,
      operationId,
      references: f.references,
      finish: () => Promise.resolve(f.completion(operationId)),
    });
  await refuse(startCutover(f.request, f.journal, f.effects, 3000, protect));
  expect((f.journal.read() as FirstStartState).phase).toBe('complete');
  expect((f.journal.read() as FirstStartState).registryHistory?.releases).toEqual([]);
  f.calls.length = 0;
  const completed = await startCutover(f.request, f.journal, f.effects, 3000, protect);
  expect(completed.registryHistory?.releases[0].operationId).toBe('candidate');
  expect(f.calls).toEqual(['persist:complete']);
  const bytes = JSON.stringify(f.journal.read());
  await startCutover(f.request, f.journal, f.effects, 3000, protect);
  expect(JSON.stringify(f.journal.read())).toBe(bytes);
});

it('transfers completed first-start history only after authority verification and retries exact sealed inheritance', async () => {
  const f = managedFixture();
  const root = scratchSync('first-start-transfer-');
  const source = join(root, 'first-start.json');
  const destination = join(root, 'release.json');
  try {
    const completed = await startCutover(
      f.request,
      f.journal,
      f.effects,
      3000,
      (_request, operationId) =>
        Promise.resolve({
          ...f.scope,
          operationId,
          references: f.references,
          finish: () => Promise.resolve(f.completion(operationId)),
        }),
    );
    const stored = { ...completed, registryHistory: { ...completed.registryHistory, source } };
    writeFileSync(source, JSON.stringify(stored));
    const sealed = readFileSync(source, 'utf8');
    await expectRejection(
      inheritFirstStartHistory(source, destination, () =>
        Promise.reject(new Error('authority unavailable')),
      ),
    );
    expect(existsSync(destination)).toBe(false);
    const verify = () => Promise.resolve(f.completion(completed.transaction));
    await inheritFirstStartHistory(source, destination, verify);
    const input = {
      firstStartPath: source,
      releasePath: destination,
      registryUrl: 'https://registry.test',
      ...f.scope,
    };
    const observed = await readReleaseHistory(input);
    expect(observed.history).toEqual({
      state: 'successful',
      complete: true,
      releases: ['candidate'],
    });
    expect(observed.references).toEqual([]);
    expect(observed.currentReferences).toEqual(f.references);
    const old = {
      sourceSha: 'a'.repeat(40),
      images: {
        backend: `registry.test/be@sha256:${'1'.repeat(64)}`,
        gateway: `registry.test/gw@sha256:${'1'.repeat(64)}`,
        frontend: `registry.test/fe@sha256:${'1'.repeat(64)}`,
        mcp: `registry.test/mcp@sha256:${'1'.repeat(64)}`,
      },
    };
    const next = {
      sourceSha: 'b'.repeat(40),
      images: {
        backend: `registry.test/be@sha256:${'2'.repeat(64)}`,
        gateway: `registry.test/gw@sha256:${'2'.repeat(64)}`,
        frontend: `registry.test/fe@sha256:${'2'.repeat(64)}`,
        mcp: `registry.test/mcp@sha256:${'2'.repeat(64)}`,
      },
    };
    const desired = 'c'.repeat(40);
    const prior = 'd'.repeat(40);
    const fake = new FakeCluster(old, ['initial'], desired);
    fake.sourceImages.set(desired, next);
    fake.sourceImages.set(prior, old);
    for (const image of [old.images.backend, next.images.backend])
      fake.migrationsByImage.set(image, [
        { name: 'initial', hash: 'initial-hash', downSha256: 'initial-down' },
      ]);
    const observeCluster = fake.observeCluster.bind(fake);
    fake.observeCluster = async (request) => ({
      ...(await observeCluster(request)),
      uid: 'cluster',
    });
    const initialized = parseRegistryHistory(
      (JSON.parse(readFileSync(destination, 'utf8')) as { registryHistory: unknown })
        .registryHistory,
      destination,
    );
    const regular = Object.assign(memoryJournal(), {
      path: destination,
      readHistory: () => initialized,
    });
    await executeRelease(
      {
        environment: 'prod',
        cluster: { context: 'lab', uid: 'cluster' },
        namespaces: { app: 'wbs', backend: 'wbs-solver' },
        release: next,
        expectedCurrent: old,
        admission: { package: 'pkg@sha256:1', activation: 'act@sha256:1' },
        flux: {
          namespace: 'flux-system',
          kustomization: 'wbs',
          gitRepository: 'deploy',
          desiredRevision: desired,
          previousRevision: prior,
        },
        recovers: null,
      },
      regular,
      fake,
      () => undefined,
      {
        clock: fake.clock,
        sleep: (ms) => {
          fake.now += ms;
          return Promise.resolve();
        },
        heartbeatMs: 3600000,
        protectImages: (_request, operationId) =>
          Promise.resolve({
            ...f.scope,
            operationId,
            references: f.references.map((reference) => ({
              ...reference,
              digest: `sha256:${'2'.repeat(64)}`,
            })),
            finish: () =>
              Promise.resolve({
                ...f.scope,
                authorityRevision: 99,
                releases: [
                  {
                    operationId: 'next',
                    references: f.references.map((reference) => ({
                      ...reference,
                      digest: `sha256:${'2'.repeat(64)}`,
                    })),
                    receipt: { state: 'promoted', at: '2026-10-25T12:02:00.000Z' },
                  },
                  ...initialized.releases,
                ],
                promotion: { operationId, candidate: 'next', at: '2026-10-25T12:02:00.000Z' },
              }),
          }),
      },
    );
    const template = join(root, 'regular-template.json');
    writeFileSync(template, JSON.stringify(regular.read()));
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'registry-history-reader.ts')],
      outdir: root,
      target: 'bun',
      naming: 'reader.js',
    });
    expect(built.success).toBe(true);
    const artifact = join(root, 'reader.js');
    const configurationPath = join(root, 'reader.json');
    writeFileSync(
      configurationPath,
      JSON.stringify({
        schemaVersion: 1,
        protocol: 'registry-consumer/2',
        registryId: f.scope.registryId,
        id: 'target-history',
        kind: 'recovery',
        role: 'history',
        source: configurationPath,
        artifact: {
          path: artifact,
          sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'),
        },
        input,
      }),
    );
    const proof = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, '../../../tool-fleet/src/registry-retirement-rehearsal.ts'),
        configurationPath,
        destination,
        template,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      proof.exited,
      new Response(proof.stdout).text(),
      new Response(proof.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(stderr);
    expect(stdout.trim()).toBe(
      'real owner reader retirement, drift repair, receipt integrity and shared-owner protection passed',
    );

    const bytes = readFileSync(destination, 'utf8');
    rmSync(destination);
    await expectRejection(readReleaseHistory(input));
    await inheritFirstStartHistory(source, destination, verify);
    expect(readFileSync(destination, 'utf8')).toBe(bytes);
    const inherited = parseRegistryHistory(
      (JSON.parse(bytes) as { registryHistory: unknown }).registryHistory,
      destination,
    );
    expect(inherited.source).toBe(destination);
    expect(inherited.inheritance).toEqual({
      source,
      sha256: sha256Of(sealed),
      operationId: completed.transaction,
    });
    await inheritFirstStartHistory(source, destination, verify);
    expect(readFileSync(destination, 'utf8')).toBe(bytes);
    writeFileSync(source, JSON.stringify({ ...stored, phase: 'ready' }));
    await expectRejection(inheritFirstStartHistory(source, destination, verify));
    expect(readFileSync(destination, 'utf8')).toBe(bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);

it('refuses oversized first-start owner journal bytes', () => {
  const root = scratchSync('first-start-bound-');
  const path = join(root, 'state.json');
  writeFileSync(path, '{}' + ' '.repeat(4 * 1024 ** 2));
  expect(() => firstStartJournal(path).read()).toThrow('unreadable');
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}
