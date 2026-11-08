import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRegistryHistory } from '@tools/registry-publication';
import { scratchSync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { fixtureCutoverIdentity, fixtureDescriptor } from './cutover-replay.fixture';
import {
  type FirstStartEffects,
  type FirstStartJournal,
  type FirstStartRequest,
  parseFirstStartState,
  startCutover,
} from './first-start';
import { sha256Of } from './migration-capture';
import {
  inheritFirstStartHistory,
  initializeFirstStartHistory,
  parseFirstStartGenesis,
  parseRegistryFirstStartState,
  registryFirstStartJournal,
} from './registry-first-start';
import { readReleaseHistory } from './registry-history-reader';

function fixture() {
  const identity = fixtureCutoverIdentity();
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
        sourceSha: fixtureDescriptor.sourceSha,
        images: fixtureDescriptor.images,
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

async function managedFixture(path: string) {
  const f = fixture();
  const completed = await startCutover(f.request, f.journal, f.effects);
  const scope = {
    registryId: 'proof',
    product: 'wbs',
    environment: 'prod',
    target: 'k8s:cluster/wbs/wbs-solver',
  };
  const references = [{ repository: 'wbs-be', digest: `sha256:${'1'.repeat(64)}` }];
  const completion = {
    ...scope,
    authorityRevision: 9,
    releases: [
      {
        operationId: 'candidate',
        references,
        receipt: { state: 'promoted' as const, at: '2026-10-25T12:01:00.000Z' },
      },
    ],
    promotion: {
      operationId: completed.transaction,
      candidate: 'candidate',
      at: '2026-10-25T12:01:00.000Z',
    },
  };
  const registryHistory = {
    ...completion,
    schemaVersion: 1 as const,
    source: path,
    genesis: { at: '2026-10-25T12:00:00.000Z', sourceRevision: 'observed-empty' },
  };
  const state = {
    ...completed,
    version: 3 as const,
    registry: { registryId: scope.registryId, operationId: completed.transaction, references },
    registryHistory,
  };
  return { ...f, state, scope, references, completion };
}

it('preserves explicit managed ownership while baseline refuses the managed writer version', async () => {
  const f = await managedFixture('/first-start.json');
  expect(() => parseFirstStartState(f.state, f.request)).toThrow('request or version');
  expect(parseRegistryFirstStartState(f.state, f.request, '/first-start.json').version).toBe(3);
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

for (const fault of [
  'version',
  'binding',
  'scope',
  'downgrade',
  'request',
  'receipt',
  'transaction',
  'replay',
  'activation',
  'source',
] as const) {
  it(`refuses managed first-start corruption before returning ownership: ${fault}`, async () => {
    const f = await managedFixture('/first-start.json');
    const state = structuredClone(f.state);
    if (fault === 'version') Object.assign(state, { version: 4 });
    if (fault === 'binding') state.registry.operationId = 'foreign';
    if (fault === 'scope') state.registryHistory.target = 'k8s:foreign/wbs/wbs-solver';
    if (fault === 'downgrade') Object.assign(state, { version: 2 });
    if (fault === 'request') state.requestSha256 = 'f'.repeat(64);
    if (fault === 'source') Object.assign(state, { source: null });
    if (state.receipt === null) throw new Error('fixture receipt missing');
    if (fault === 'receipt') state.receipt.sha256 = 'f'.repeat(64);
    if (['transaction', 'replay', 'activation'].includes(fault)) {
      const payload = JSON.parse(state.receipt.bytes) as {
        transaction: string;
        report: { replay: { inventory: unknown[] } };
        activation: string;
      };
      if (fault === 'transaction') payload.transaction = 'foreign';
      if (fault === 'replay') payload.report.replay.inventory = [];
      if (fault === 'activation') payload.activation = 'ENABLED';
      state.receipt.bytes = JSON.stringify(payload);
      state.receipt.sha256 = sha256Of(state.receipt.bytes);
    }
    expect(() => parseRegistryFirstStartState(state, f.request, '/first-start.json')).toThrow();
  });
}

it('transfers completed source history and refuses absent or unreadable transferred destinations', async () => {
  const root = scratchSync('first-start-transfer-');
  const source = join(root, 'first-start.json');
  const destination = join(root, 'release.json');
  const f = await managedFixture(source);
  try {
    writeFileSync(source, JSON.stringify(f.state));
    const sealed = readFileSync(source, 'utf8');
    await refuse(
      inheritFirstStartHistory(source, destination, () =>
        Promise.reject(new Error('authority unavailable')),
      ),
    );
    expect(existsSync(destination)).toBe(false);
    const verify = () => Promise.resolve(f.completion);
    await inheritFirstStartHistory(source, destination, verify);
    const bytes = readFileSync(destination, 'utf8');
    const input = {
      firstStartPath: source,
      releasePath: destination,
      registryUrl: 'https://registry.test',
      ...f.scope,
    };
    expect((await readReleaseHistory(input)).history).toEqual({
      state: 'successful',
      complete: true,
      releases: ['candidate'],
    });
    const history = parseRegistryHistory(
      (JSON.parse(bytes) as { registryHistory: unknown }).registryHistory,
      destination,
    );
    expect(history.inheritance).toEqual({
      source,
      sha256: sha256Of(sealed),
      operationId: f.state.transaction,
    });
    await inheritFirstStartHistory(source, destination, verify);
    expect(readFileSync(destination, 'utf8')).toBe(bytes);
    chmodSync(destination, 0o000);
    await refuse(readReleaseHistory(input));
    chmodSync(destination, 0o600);
    rmSync(destination);
    await refuse(readReleaseHistory(input));
    await inheritFirstStartHistory(source, destination, verify);
    expect(readFileSync(destination, 'utf8')).toBe(bytes);
    const transferred = JSON.parse(readFileSync(source, 'utf8')) as typeof f.state & {
      registryTransfer: { sourceBytes: string; sha256: string };
    };
    transferred.registryTransfer.sourceBytes = JSON.stringify({ ...f.state, registry: null });
    transferred.registryTransfer.sha256 = sha256Of(transferred.registryTransfer.sourceBytes);
    expect(() => parseRegistryFirstStartState(transferred, f.request, source)).toThrow(
      'source changed',
    );
    writeFileSync(source, JSON.stringify(transferred));
    await refuse(readReleaseHistory(input));
    expect(readFileSync(destination, 'utf8')).toBe(bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('refuses invalid managed genesis and oversized or unreadable owner state', () => {
  const root = scratchSync('first-start-owner-');
  const path = join(root, 'state.json');
  try {
    expect(registryFirstStartJournal(path).read()).toBeNull();
    writeFileSync(path, '{}' + ' '.repeat(4 * 1024 ** 2));
    expect(() => registryFirstStartJournal(path).read()).toThrow('unreadable');
    writeFileSync(path, '{}');
    chmodSync(path, 0o000);
    expect(() => registryFirstStartJournal(path).read()).toThrow('unreadable');
    expect(() => parseFirstStartGenesis({ version: 2, kind: 'registry-genesis' }, path)).toThrow(
      'Malformed',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

async function refuse(promise: Promise<unknown>): Promise<void> {
  const refusal = await promise.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
}

it('refuses invalid managed transfer envelopes and populated genesis', async () => {
  const f = await managedFixture('/first-start.json');
  for (const transfer of [
    {
      destination: '/first-start.json',
      sourceBytes: JSON.stringify(f.state),
      sha256: sha256Of(JSON.stringify(f.state)),
    },
    { destination: '/release.json', sourceBytes: JSON.stringify(f.state), sha256: 'f'.repeat(64) },
  ])
    expect(() =>
      parseRegistryFirstStartState(
        { ...f.state, registryTransfer: transfer },
        f.request,
        '/first-start.json',
      ),
    ).toThrow('transfer');
  expect(() =>
    parseFirstStartGenesis(
      { version: 3, kind: 'registry-genesis', registryHistory: f.state.registryHistory },
      '/first-start.json',
    ),
  ).toThrow('not empty');
  const root = scratchSync('first-start-write-bound-');
  const path = join(root, 'state.json');
  try {
    expect(() => {
      registryFirstStartJournal(path).write({
        ...f.state,
        requestBytes: 'x'.repeat(4 * 1024 ** 2),
      });
    }).toThrow('capacity');
    expect(existsSync(path)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('refuses unsupported owner version even without optional registry metadata', async () => {
  const f = fixture();
  const legacy = await startCutover(f.request, f.journal, f.effects);
  expect(() =>
    parseRegistryFirstStartState({ ...legacy, version: 4 }, f.request, '/first-start.json'),
  ).toThrow('request or version');
});

it('refuses a changed requested checksum before any source or receipt exists', () => {
  const f = fixture();
  const requested = {
    version: 2 as const,
    transaction: 'first-start-' + 'a'.repeat(16),
    requestBytes: JSON.stringify(f.request),
    requestSha256: 'f'.repeat(64),
    phase: 'requested' as const,
    receipt: null,
    source: null,
  };
  expect(() => parseFirstStartState(requested, f.request)).toThrow('request or version');
  expect(() => parseRegistryFirstStartState(requested, f.request, '/first-start.json')).toThrow(
    'request or version',
  );
});
