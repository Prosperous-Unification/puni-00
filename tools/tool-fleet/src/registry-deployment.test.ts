import { chmod, readFile, unlink, writeFile } from 'node:fs/promises';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { registryHistorySha256 } from './registry-history';
import {
  executeRegistryCommand,
  type RegistryConsumer,
  type RegistryJournal,
} from './registry-managed-journal';

const GiB = 1024 ** 3;
const candidate = `sha256:${'a'.repeat(64)}`;
const previous = `sha256:${'b'.repeat(64)}`;
const historyEvidence = (releases: readonly string[]) =>
  registryHistorySha256(
    releases.map((operationId) => ({
      operationId,
      references: [
        { repository: 'wbs/backend', digest: operationId === 'previous' ? previous : candidate },
      ],
      receipt: { state: 'promoted', at: '2026-10-25T12:00:00.000Z' },
    })),
  );
async function fixture(withConsumers = true) {
  const directory = await scratchAsync('registry-deployment-');
  await chmod(directory, 0o700);
  const observed: string[] = [];
  let bootstrapped = false;
  const ports = {
    verifyConsumers: () => Promise.resolve(),
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 0,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: GiB,
        usableBytes: GiB,
        usedBytes: 0,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      }),
    verifyImages: (_enrollment: unknown, references: readonly { digest: string }[]) => {
      observed.push(...references.map((reference) => reference.digest));
      return Promise.resolve();
    },
    collectConsumers: (sources: readonly RegistryConsumer[], revision: number) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          ...(source.role === 'history' ? { historySha256: historyEvidence(['previous']) } : {}),
          ...(source.role === 'history'
            ? {
                historySha256: historyEvidence(
                  source.environment === 'bootstrap' && !bootstrapped ? [] : ['previous'],
                ),
                history:
                  source.environment === 'bootstrap' && !bootstrapped
                    ? { state: 'first-install', at: '2026-10-25T12:00:00.000Z' }
                    : { state: 'successful', complete: true, releases: ['previous'] },
              }
            : {}),
          currentReferences:
            source.environment === 'bootstrap' && !bootstrapped
              ? []
              : [{ repository: 'wbs/backend', digest: previous }],
          revision,
          sourceRevision: 'configured-source-revision',
          references: [],
        })),
      ),
    now: () => '2026-10-25T12:00:00.000Z',
  };
  const invoke = (request: unknown) => executeRegistryCommand(directory, request, ports);
  await invoke({
    command: 'initialize',
    enrollment: {
      registryId: 'proof',
      storageId: 'proof',
      owners: ['publisher', 'deploy', 'other'],
      registryPath: '/registry',
      rootPath: '/',
      maximumBytes: GiB,
      journalMaximumBytes: GiB,
    },
  });
  const send = async (request: Record<string, unknown>) => {
    if (request['command'] === 'enroll-consumers') {
      const declared = request['sources'] as RegistryConsumer[];
      const sources: RegistryConsumer[] = [
        ...declared,
        {
          id: 'bootstrap-history',
          owner: 'deploy',
          environment: 'bootstrap',
          kind: 'recovery',
          source: '/trusted/bootstrap.json',
          configurationSha256: 'a'.repeat(64),
          role: 'history',
        },
      ];
      request = {
        ...request,
        sources: [
          ...sources,
          ...sources
            .filter(
              (source, index) =>
                source.role === 'history' &&
                sources.findIndex((candidate) => candidate.environment === source.environment) ===
                  index &&
                !sources.some(
                  (candidate) =>
                    candidate.environment === source.environment && candidate.role === 'consumer',
                ),
            )
            .map((source) => ({
              ...source,
              id: `${source.id}-actual`,
              source: `${source.source}.actual`,
              role: 'consumer',
              kind: 'kubernetes',
            })),
        ],
      };
    }
    const response = await invoke({
      ...request,
      expectedRevision: (await invoke({ command: 'read' })).state.revision,
    });
    if (request['command'] === 'enroll-consumers') {
      await send({
        command: 'enroll-environment',
        operationId: 'bootstrap-environment',
        owner: 'deploy',
        environment: 'bootstrap',
        product: 'wbs',
        history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
      });
      const bootstrap = await send({
        command: 'begin-deployment',
        operationId: 'bootstrap-deploy',
        owner: 'deploy',
        environment: 'bootstrap',
        candidate: 'previous',
        current: null,
      });
      await send({
        command: 'finish-deployment',
        operationId: 'bootstrap-deploy',
        owner: 'deploy',
        token: bootstrap.token,
        outcome: 'promoted',
        reconciled: true,
      });
      bootstrapped = true;
      await send({
        command: 'retire-environment',
        operationId: 'bootstrap-retire',
        owner: 'deploy',
        environment: 'bootstrap',
      });
    }
    return response;
  };
  for (const [operationId, digest] of [
    ['previous', previous],
    ['candidate', candidate],
  ]) {
    const reserved = await send({
      command: 'reserve-publication',
      operationId,
      owner: 'publisher',
      product: 'wbs',
      roots: [digest],
      references: [{ repository: 'wbs/backend', digest }],
      envelope: { bytes: 1, inodes: 1 },
    });
    await send({
      command: 'finish-publication',
      operationId,
      owner: 'publisher',
      token: reserved.token,
      outcome: 'completed',
      reconciled: true,
    });
  }
  if (withConsumers)
    await send({
      command: 'enroll-consumers',
      operationId: 'enroll-sources',
      owner: 'deploy',
      sources: [
        {
          id: 'prod',
          owner: 'deploy',
          environment: 'prod',
          kind: 'kubernetes',
          source: '/trusted/prod.json',
          configurationSha256: 'a'.repeat(64),
          role: 'history',
        },
      ],
    });
  return { directory, ports, observed, invoke, send };
}

it('requires explicit environment history and protects candidate and rollback before deployment', async () => {
  const { send, invoke, observed } = await fixture();
  await requireRefusal(
    send({
      command: 'begin-deployment',
      operationId: 'deploy-1',
      owner: 'deploy',
      environment: 'prod',
      candidate: 'candidate',
      current: 'previous',
    }),
    'environment',
  );
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const begun = await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  expect(begun.token).toBeDefined();
  const persisted = (await invoke({ command: 'read' })).state;
  expect(
    persisted.protections.find((protection) => protection.operationId === 'deploy-1')?.roots.sort(),
  ).toEqual([candidate, previous]);
  expect(observed).toContain(candidate);
  expect(observed).toContain(previous);
});

it('promotes completed images without upload capacity and derives unique current-first history', async () => {
  const { send, ports, invoke } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  ports.measureRegistry = () => Promise.reject(new Error('upload capacity unavailable'));
  ports.now = () => '2026-10-25T12:05:00.000Z';
  for (const [operationId, target, current] of [
    ['deploy-1', 'candidate', 'previous'],
    ['rollback-1', 'previous', 'candidate'],
    ['deploy-2', 'candidate', 'previous'],
  ]) {
    const begun = await send({
      command: 'begin-deployment',
      operationId,
      owner: 'deploy',
      environment: 'prod',
      candidate: target,
      current,
    });
    const completed = await send({
      command: 'finish-deployment',
      operationId,
      owner: 'deploy',
      token: begun.token,
      outcome: 'promoted',
      reconciled: true,
    });
    const history = [
      ...completed.state.environments.find((environment) => environment.environment === 'prod')!
        .releases,
    ];
    const currentReferences = completed.state.bundles.find(
      (bundle) => bundle.operationId === history[0],
    )?.references;
    Object.assign(ports, {
      collectConsumers: (sources: readonly RegistryConsumer[], revision: number) =>
        Promise.resolve(
          sources.map((source) => ({
            id: source.id,
            source: source.source,
            role: source.role,
            revision,
            sourceRevision: 'persisted-promotion',
            references: [],
            currentReferences,
            ...(source.role === 'history'
              ? {
                  historySha256: registryHistorySha256(
                    history.map((operationId) =>
                      completed.state.bundles.find((bundle) => bundle.operationId === operationId)!,
                    ),
                  ),
                  history: { state: 'successful', complete: true, releases: history },
                }
              : {}),
          })),
        ),
    });
  }
  const state = (await invoke({ command: 'read' })).state;
  expect(state.publication).toBeNull();
  expect(state.reservations).toEqual([]);
  // This durable environment contract feeds the independent retention policy.
  expect(
    state.environments.find((environment) => environment.environment === 'prod')!.releases,
  ).toEqual(['candidate', 'previous']);
  expect(state.deployments.filter((deployment) => deployment.environment === 'prod')).toHaveLength(
    3,
  );
  expect(state.bundles.find((bundle) => bundle.operationId === 'previous')?.receipt.at).toBe(
    '2026-10-25T12:00:00.000Z',
  );
  expect(state.bundles.find((bundle) => bundle.operationId === 'candidate')?.receipt.state).toBe(
    'promoted',
  );
});

it('crashed deploy retains both releases and recovery-required is not a released protection', async () => {
  const { send, invoke } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const begun = await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  expect(
    (await invoke({ command: 'read' })).state.protections.find(
      (protection) => protection.operationId === 'deploy-1',
    )?.roots,
  ).toHaveLength(2);
  await send({
    command: 'finish-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    token: begun.token,
    outcome: 'recovery-required',
    reconciled: false,
  });
  expect(
    (await invoke({ command: 'read' })).state.protections.find(
      (protection) => protection.operationId === 'deploy-1',
    )?.roots,
  ).toHaveLength(2);
  await requireRefusal(
    send({
      command: 'release-protection',
      operationId: 'deploy-1',
      owner: 'deploy',
      token: begun.token,
      reconciled: true,
    }),
    'requires its lifecycle transition',
  );
});

it('refuses missing rollback content before recording deployment', async () => {
  const { send, invoke, ports } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  ports.verifyImages = (_enrollment, references) => {
    if (references.some((reference) => reference.digest === previous))
      return Promise.reject(new Error('rollback image unavailable'));
    return Promise.resolve();
  };
  await requireRefusal(
    send({
      command: 'begin-deployment',
      operationId: 'deploy-1',
      owner: 'deploy',
      environment: 'prod',
      candidate: 'candidate',
      current: 'previous',
    }),
    'rollback image unavailable',
  );
  expect(
    (await invoke({ command: 'read' })).state.protections.some(
      (protection) => protection.operationId === 'deploy-1',
    ),
  ).toBe(false);
});

it('requires an explicit fenced schema2 upgrade and rejects corrupt or absent legacy history', async () => {
  const { directory, invoke } = await fixture();
  const path = `${directory}/journal.json`;
  // Genuine BASE schema2 writer output; provenance and generation command are recorded in Task6's report.
  const legacy = JSON.parse(
    await readFile(new URL('./fixtures/registry-schema2.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  await writeFile(path, JSON.stringify(legacy));
  await requireRefusal(invoke({ command: 'read' }), 'registry journal');
  const upgraded = await invoke({ command: 'upgrade' });
  expect(upgraded.state.schemaVersion).toBe(3);
  expect(upgraded.state.fenced).toBe(true);
  expect(legacy['bundles']).toEqual(upgraded.state.bundles);
  expect(upgraded.state.environments).toEqual([]);
  await writeFile(path, JSON.stringify({ ...legacy, bundles: undefined }));
  await requireRefusal(invoke({ command: 'upgrade' }), 'legacy registry journal');
  await unlink(path);
  await requireRefusal(invoke({ command: 'upgrade' }), 'ENOENT');
});

it('refuses malformed durable deployment ownership and incomplete environment history', async () => {
  const { directory, send, invoke } = await fixture();
  await requireRefusal(
    send({
      command: 'enroll-environment',
      operationId: 'enroll-prod',
      owner: 'deploy',
      environment: 'prod',
      product: 'wbs',
    }),
    'history',
  );
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  const path = `${directory}/journal.json`;
  const valid = JSON.parse(await readFile(path, 'utf8')) as RegistryJournal;
  for (const change of [
    (state: typeof valid) => {
      state.environments.find((environment) => environment.environment === 'prod')!.releases = [];
    },
    (state: typeof valid) => {
      state.deployments.find((deployment) => deployment.environment === 'prod')!.token =
        crypto.randomUUID();
    },
    (state: typeof valid) => {
      state.deployments.find((deployment) => deployment.environment === 'prod')!.events[0].phase =
        'recovery-required';
    },
    (state: typeof valid) => {
      state.protections = state.protections.filter(
        (protection: { operationId: string }) => protection.operationId !== 'deploy-1',
      );
    },
  ]) {
    const corrupted = structuredClone(valid);
    change(corrupted);
    await writeFile(path, JSON.stringify(corrupted));
    await requireRefusal(invoke({ command: 'read' }), 'deployment');
  }
});

it('never fabricates promotion receipts when enrolling successful environment history', async () => {
  const { send, invoke } = await fixture();
  const before = (await invoke({ command: 'read' })).state.bundles;
  for (const releases of [['candidate'], ['absent']])
    await requireRefusal(
      send({
        command: 'enroll-environment',
        operationId: 'enroll-prod',
        owner: 'deploy',
        environment: 'prod',
        product: 'wbs',
        history: { state: 'successful', complete: true, releases },
      }),
    );
  expect((await invoke({ command: 'read' })).state.bundles).toEqual(before);
});

it('preserves recovery events after explicit reconciliation and rejects corrupted environment protection', async () => {
  const { send, invoke, directory } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const begun = await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  await send({
    command: 'finish-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    token: begun.token,
    outcome: 'recovery-required',
    reconciled: false,
  });
  await send({
    command: 'finish-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    token: begun.token,
    outcome: 'reconciled',
    reconciled: true,
  });
  const state = (await invoke({ command: 'read' })).state;
  expect(
    state.deployments
      .find((deployment) => deployment.environment === 'prod')!
      .events.map((event: { phase: string }) => event.phase),
  ).toEqual(['protected', 'recovery-required', 'reconciled']);
  const corrupted = structuredClone(state);
  corrupted.protections = [];
  await writeFile(`${directory}/journal.json`, JSON.stringify(corrupted));
  await requireRefusal(invoke({ command: 'read' }), 'environment');
});

it('retiring environment does not release another owner and refuses incomplete consumer inventory', async () => {
  const { send, invoke, ports } = await fixture(false);
  const sources = [
    {
      id: 'prod-workloads',
      owner: 'deploy',
      environment: 'prod',
      kind: 'kubernetes',
      source: '/trusted/prod-kubernetes.json',
      configurationSha256: 'a'.repeat(64),
      role: 'history',
    },
    {
      id: 'dev-workloads',
      owner: 'other',
      environment: 'dev',
      kind: 'kubernetes',
      source: '/trusted/dev-kubernetes.json',
      configurationSha256: 'a'.repeat(64),
      role: 'history',
    },
  ];
  await send({
    command: 'enroll-consumers',
    operationId: 'enroll-consumers',
    owner: 'deploy',
    sources,
  });
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-dev',
    owner: 'other',
    environment: 'dev',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  Object.assign(ports, { collectConsumers: () => Promise.resolve([]) });
  await requireRefusal(
    send({
      command: 'retire-environment',
      operationId: 'retire-prod',
      owner: 'deploy',
      environment: 'prod',
    }),
    'consumer',
  );
  Object.assign(ports, {
    collectConsumers: (enrolled: typeof sources, revision: number) =>
      Promise.resolve(
        enrolled.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          ...(source.role === 'history' ? { historySha256: historyEvidence(['previous']) } : {}),
          ...(source.role === 'history'
            ? { history: { state: 'successful', complete: true, releases: ['previous'] } }
            : {}),
          currentReferences: [{ repository: 'wbs/backend', digest: previous }],
          revision,
          sourceRevision: 'revision-1',
          references: [],
        })),
      ),
  });
  await send({
    command: 'retire-environment',
    operationId: 'retire-prod',
    owner: 'deploy',
    environment: 'prod',
  });
  const state = (await invoke({ command: 'read' })).state;
  expect(state.protections.some((protection) => protection.operationId === 'enroll-prod')).toBe(
    false,
  );
  expect(
    state.protections.find((protection) => protection.operationId === 'enroll-dev')?.roots,
  ).toEqual([previous]);
});

async function requireRefusal(promise: Promise<unknown>, expected?: string): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined) expect(String(refusal)).toContain(expected);
}

it('supports explicit first install and refuses unverified completion or unavailable image readers', async () => {
  const { send, invoke, ports } = await fixture();
  Object.assign(ports, {
    collectConsumers: (sources: readonly RegistryConsumer[], revision: number) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          ...(source.role === 'history' ? { historySha256: historyEvidence(['previous']) } : {}),
          revision,
          sourceRevision: 'initialized-empty',
          references: [],
          currentReferences: [],
          ...(source.role === 'history'
            ? {
                historySha256: historyEvidence([]),
                history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
              }
            : {}),
        })),
      ),
  });

  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
  });
  const begun = await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: null,
  });
  await requireRefusal(
    send({
      command: 'finish-deployment',
      operationId: 'deploy-1',
      owner: 'deploy',
      token: begun.token,
      outcome: 'promoted',
      reconciled: false,
    }),
    'reconciled',
  );
  await send({
    command: 'finish-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    token: begun.token,
    outcome: 'promoted',
    reconciled: true,
  });
  expect(
    (await invoke({ command: 'read' })).state.environments.find(
      (environment) => environment.environment === 'prod',
    )!.releases,
  ).toEqual(['candidate']);
  Object.assign(ports, {
    collectConsumers: (sources: readonly RegistryConsumer[], revision: number) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'persisted-promotion',
          references: [],
          currentReferences: [{ repository: 'wbs/backend', digest: candidate }],
          ...(source.role === 'history'
            ? {
                historySha256: historyEvidence(['candidate']),
                history: { state: 'successful', complete: true, releases: ['candidate'] },
              }
            : {}),
        })),
      ),
  });
  Object.assign(ports, { verifyImages: undefined });
  await requireRefusal(
    send({
      command: 'begin-deployment',
      operationId: 'deploy-2',
      owner: 'deploy',
      environment: 'prod',
      candidate: 'previous',
      current: 'candidate',
    }),
    'availability reader',
  );
});

it('refuses malformed stale foreign or unavailable consumer reports and live references', async () => {
  const { send, invoke, ports } = await fixture(false);
  const source = {
    id: 'prod',
    owner: 'deploy',
    environment: 'prod',
    kind: 'kubernetes',
    source: '/trusted/prod.json',
    configurationSha256: 'a'.repeat(64),
    role: 'history',
  };
  await send({
    command: 'enroll-consumers',
    operationId: 'enroll-consumers',
    owner: 'deploy',
    sources: [source],
  });
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const revision = (await invoke({ command: 'read' })).state.revision;
  const report = {
    id: 'prod',
    source: source.source,
    role: source.role,
    ...(source.role === 'history'
      ? { history: { state: 'successful', complete: true, releases: ['previous'] } }
      : {}),
    currentReferences: [{ repository: 'wbs/backend', digest: previous }],
    revision,
    sourceRevision: 'cluster-uid/resource-version',
    references: [],
  };
  for (const reports of [
    null,
    [{ ...report, revision: revision - 1 }],
    [{ ...report, id: 'unknown' }],
    [{ ...report, source: '/foreign.json' }],
    [{ ...report, sourceRevision: '' }],
    [{ ...report, references: [{ repository: 'wbs/backend', digest: previous }] }],
  ]) {
    Object.assign(ports, { collectConsumers: () => Promise.resolve(reports) });
    await requireRefusal(
      send({
        command: 'retire-environment',
        operationId: 'retire-prod',
        owner: 'deploy',
        environment: 'prod',
      }),
    );
    expect(
      (await invoke({ command: 'read' })).state.protections.some(
        (protection) => protection.operationId === 'enroll-prod',
      ),
    ).toBe(true);
  }
  Object.assign(ports, {
    collectConsumers: () => Promise.reject(new Error('EACCES source inventory')),
  });
  await requireRefusal(
    send({
      command: 'retire-environment',
      operationId: 'retire-prod',
      owner: 'deploy',
      environment: 'prod',
    }),
    'EACCES',
  );
});

it('protects complete desired and observed consumer images before admitting deployment', async () => {
  const { send, invoke, ports, observed } = await fixture();
  const scaledToZero = `sha256:${'c'.repeat(64)}`;
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  Object.assign(ports, {
    collectConsumers: (sources: readonly RegistryConsumer[], revision: number) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          ...(source.role === 'history' ? { historySha256: historyEvidence(['previous']) } : {}),
          ...(source.role === 'history'
            ? { history: { state: 'successful', complete: true, releases: ['previous'] } }
            : {}),
          currentReferences: [{ repository: 'wbs/backend', digest: previous }],
          revision,
          sourceRevision: 'desired-commit-1',
          references: [{ repository: 'wbs/solver', digest: scaledToZero }],
        })),
      ),
  });
  await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  expect(
    (await invoke({ command: 'read' })).state.protections.find(
      (protection) => protection.operationId === 'deploy-1',
    )?.roots,
  ).toContain(scaledToZero);
  expect(observed).toContain(scaledToZero);
});

it('binds the publication receipt and protects before desired revision changes', async () => {
  const { protectDeployment, verifyCompletedPublication } = await import('./registry-deployment');
  const { send, invoke } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const bundle = (await invoke({ command: 'read' })).state.bundles.find(
    (bundle) => bundle.operationId === 'candidate',
  );
  if (bundle === undefined) throw new Error('Fixture candidate missing');
  const enrollment = {
    registryId: 'proof',
    registryUrl: 'https://registry.test',
    owner: 'deploy',
    product: 'wbs',
    environment: 'prod',
    target: 'k8s:cluster/wbs/wbs-solver',
    sshHost: 'authority',
    requiredRepositories: ['wbs/backend'],
    publicationReceiptPath: '/publication.json',
  };
  expect(
    JSON.stringify(
      await verifyCompletedPublication(
        { ...enrollment, owner: 'publisher' },
        { registryId: 'proof', ...bundle },
        invoke,
      ),
    ),
  ).toBe(JSON.stringify({ registryId: 'proof', ...bundle }));
  await requireRefusal(
    verifyCompletedPublication(
      { ...enrollment, owner: 'publisher' },
      { registryId: 'proof', ...bundle, references: [] },
      invoke,
    ),
    'publication',
  );
  const images = [`registry.test/wbs/backend@${candidate}`];
  const outgoing = [`registry.test/wbs/backend@${previous}`];
  await requireRefusal(
    protectDeployment(
      enrollment,
      { registryId: 'foreign', ...bundle },
      images,
      outgoing,
      'deploy-1',
      invoke,
    ),
    'receipt',
  );
  const session = await protectDeployment(
    enrollment,
    { registryId: 'proof', ...bundle },
    images,
    outgoing,
    'deploy-1',
    invoke,
  );
  const beforeDesiredChange = (await invoke({ command: 'read' })).state;
  expect(
    beforeDesiredChange.protections.find((protection) => protection.operationId === 'deploy-1')
      ?.roots,
  ).toContain(candidate);
  const completion = await session.finish('promoted');
  expect(completion?.promotion.operationId).toBe('deploy-1');
  expect(completion?.releases.map((bundle) => bundle.operationId)).toEqual([
    'candidate',
    'previous',
  ]);
  expect(
    (await invoke({ command: 'read' })).state.environments.find(
      (environment) => environment.environment === 'prod',
    )!.releases,
  ).toEqual(['candidate', 'previous']);
  const resumed = await protectDeployment(
    enrollment,
    { registryId: 'proof', ...bundle },
    images,
    outgoing,
    'deploy-1',
    invoke,
  );
  expect(resumed.references).toEqual(session.references);
  await resumed.finish('promoted');
});

it('inherits recovery ownership without promoting failed candidates and atomically settles only verified recovery', async () => {
  const { send, invoke, ports } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const first = await send({
    command: 'begin-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  await send({
    command: 'finish-deployment',
    operationId: 'deploy-1',
    owner: 'deploy',
    token: first.token,
    outcome: 'recovery-required',
    reconciled: false,
  });
  Object.assign(ports, {
    collectConsumers: (sources: readonly RegistryConsumer[], revision: number) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          ...(source.role === 'history' ? { historySha256: historyEvidence(['previous']) } : {}),
          ...(source.role === 'history'
            ? { history: { state: 'successful', complete: true, releases: ['previous'] } }
            : {}),
          revision,
          sourceRevision: 'observed-interrupted-candidate',
          references: [{ repository: 'wbs/backend', digest: candidate }],
          currentReferences: [{ repository: 'wbs/backend', digest: candidate }],
        })),
      ),
  });
  const recovery = await send({
    command: 'begin-deployment',
    operationId: 'recovery-1',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'previous',
    current: 'candidate',
    recovers: 'deploy-1',
  });
  let state = (await invoke({ command: 'read' })).state;
  expect(
    state.protections.filter((protection) =>
      ['deploy-1', 'recovery-1'].includes(protection.operationId),
    ),
  ).toHaveLength(2);
  expect(state.bundles.find((bundle) => bundle.operationId === 'candidate')?.receipt.state).toBe(
    'completed',
  );
  await requireRefusal(
    send({
      command: 'begin-deployment',
      operationId: 'recovery-2',
      owner: 'deploy',
      environment: 'prod',
      candidate: 'previous',
      current: 'candidate',
      recovers: 'deploy-1',
    }),
    'recovery',
  );
  await send({
    command: 'finish-deployment',
    operationId: 'recovery-1',
    owner: 'deploy',
    token: recovery.token,
    outcome: 'promoted',
    reconciled: true,
  });
  state = (await invoke({ command: 'read' })).state;
  expect(
    state.protections.filter((protection) =>
      ['deploy-1', 'recovery-1'].includes(protection.operationId),
    ),
  ).toEqual([]);
  expect(
    state.environments.find((environment) => environment.environment === 'prod')!.releases,
  ).toEqual(['previous']);
  expect(state.deployments.find((deployment) => deployment.operationId === 'deploy-1')?.phase).toBe(
    'reconciled',
  );
});

it('refuses consumer universe enrollment without the installed registry-wide contract', async () => {
  const { send, ports } = await fixture(false);
  Object.assign(ports, { verifyConsumers: undefined });
  await requireRefusal(
    send({
      command: 'enroll-consumers',
      operationId: 'enroll',
      owner: 'deploy',
      sources: [
        {
          id: 'prod',
          owner: 'deploy',
          environment: 'prod',
          kind: 'kubernetes',
          source: '/trusted/prod.json',
          configurationSha256: 'a'.repeat(64),
          role: 'history',
        },
      ],
    }),
    'consumer universe',
  );
});

it('refuses claimed first-install or successful history without agreeing source-owned evidence', async () => {
  const { send } = await fixture();
  await requireRefusal(
    send({
      command: 'enroll-environment',
      operationId: 'false-first',
      owner: 'deploy',
      environment: 'prod',
      product: 'wbs',
      history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
    }),
    'history',
  );
});

it('blocks new deployment and retirement while a source has lost acknowledged promotion history', async () => {
  const { send, invoke } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'enroll-prod',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const begun = await send({
    command: 'begin-deployment',
    operationId: 'promote-new',
    owner: 'deploy',
    environment: 'prod',
    candidate: 'candidate',
    current: 'previous',
  });
  await send({
    command: 'finish-deployment',
    operationId: 'promote-new',
    owner: 'deploy',
    token: begun.token,
    outcome: 'promoted',
    reconciled: true,
  });
  await expectRejection(
    send({
      command: 'begin-deployment',
      operationId: 'rollback-stale-source',
      owner: 'deploy',
      environment: 'prod',
      candidate: 'previous',
      current: 'candidate',
    }),
    'history',
  );
  await expectRejection(
    send({
      command: 'retire-environment',
      operationId: 'retire-stale-source',
      owner: 'deploy',
      environment: 'prod',
    }),
    'history',
  );
  expect(
    (await invoke({ command: 'read' })).state.protections.some(
      (protection) => protection.operationId === 'enroll-prod',
    ),
  ).toBe(true);
});

it('raw schema3 publication stdin cannot mint promotion or release upload ownership', async () => {
  const { directory, send, invoke } = await fixture(false);
  const admission = await send({
    command: 'reserve-publication',
    operationId: 'raw-promote',
    owner: 'publisher',
    product: 'wbs',
    roots: [candidate],
    references: [{ repository: 'wbs/backend', digest: candidate }],
    envelope: { bytes: 1, inodes: 1 },
  });
  const request = {
    command: 'finish-publication',
    expectedRevision: admission.state.revision,
    operationId: 'raw-promote',
    owner: 'publisher',
    token: admission.token,
    outcome: 'promoted',
    reconciled: true,
  };
  const before = await readFile(`${directory}/journal.json`, 'utf8');
  await expectRejection(invoke(request), 'Malformed registry command');
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/registry-managed-journal-cli.ts`, directory],
    { stdin: new Response(JSON.stringify(request)), stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, diagnostic] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(code).not.toBe(0);
  expect(diagnostic).toContain('Malformed registry command');
  expect(await readFile(`${directory}/journal.json`, 'utf8')).toBe(before);
});

it('refuses first-install enrollment when its registered universe contains only historical evidence', async () => {
  const { invoke, send, ports } = await fixture(false);
  const sources = [
    {
      id: 'history-only',
      owner: 'deploy',
      environment: 'prod',
      kind: 'recovery',
      source: '/trusted/history-only.json',
      configurationSha256: 'a'.repeat(64),
      role: 'history',
    },
  ];
  await invoke({
    command: 'enroll-consumers',
    operationId: 'only-history',
    owner: 'deploy',
    expectedRevision: (await invoke({ command: 'read' })).state.revision,
    sources,
  });
  Object.assign(ports, {
    collectConsumers: (registered: readonly RegistryConsumer[], revision: number) =>
      Promise.resolve(
        registered.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'initialized-source',
          history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
          historySha256: registryHistorySha256([]),
          currentReferences: [],
          references: [],
        })),
      ),
  });
  await expectRejection(
    send({
      command: 'enroll-environment',
      operationId: 'unsafe-environment',
      owner: 'deploy',
      environment: 'prod',
      product: 'wbs',
      history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
    }),
    'actual consumer',
  );
  expect((await invoke({ command: 'read' })).state.environments).toEqual([]);
});

it('resumes only existing bound operations and returns promoted evidence without authority mutations', async () => {
  const { invoke, send, directory } = await fixture();
  await send({
    command: 'enroll-environment',
    operationId: 'environment',
    owner: 'deploy',
    environment: 'prod',
    product: 'wbs',
    history: { state: 'successful', complete: true, releases: ['previous'] },
  });
  const { executeRegistryLifecycle } = await import('./registry-lifecycle-cli');
  const state = (await invoke({ command: 'read' })).state;
  const bundle = state.bundles.find((bundle) => bundle.operationId === 'candidate')!;
  const enrollment = {
    registryId: 'proof',
    registryUrl: 'https://registry.test',
    owner: 'deploy',
    product: 'wbs',
    environment: 'prod',
    target: 'k8s:cluster/wbs/wbs-solver',
    sshHost: 'unused',
    requiredRepositories: ['wbs/backend'],
    publicationReceiptPath: '/unused',
  };
  const ports = {
    publication: () => Promise.reject(new Error('unused')),
    deployment: () => Promise.resolve(enrollment),
    environment: () => Promise.resolve(enrollment),
    publish: () => Promise.reject(new Error('unused')),
    authority: () => invoke,
  };
  const binding = {
    protocol: 'registry-lifecycle/1',
    target: enrollment.target,
    images: [`registry.test/wbs/backend@${candidate}`],
    currentImages: [`registry.test/wbs/backend@${previous}`],
    operationId: 'resume-proof',
    publication: { registryId: 'proof', ...bundle },
  };
  const before = await readFile(`${directory}/journal.json`, 'utf8');
  await requireRefusal(
    executeRegistryLifecycle({ ...binding, command: 'resume' }, ports),
    'existing',
  );
  expect(await readFile(`${directory}/journal.json`, 'utf8')).toBe(before);
  await executeRegistryLifecycle({ ...binding, command: 'protect' }, ports);
  expect(await executeRegistryLifecycle({ ...binding, command: 'resume' }, ports)).toMatchObject({
    phase: 'protected',
    receipt: null,
  });
  const protectedBytes = await readFile(`${directory}/journal.json`, 'utf8');
  for (const phase of ['promoted', 'reconciled'] as const) {
    const forged = JSON.parse(protectedBytes) as typeof state;
    const operation = forged.deployments.find((entry) => entry.operationId === binding.operationId);
    if (operation === undefined) throw new Error('Fixture operation missing');
    operation.phase = phase;
    const bytes = JSON.stringify(forged);
    await writeFile(`${directory}/journal.json`, bytes);
    await expectRejection(executeRegistryLifecycle({ ...binding, command: 'resume' }, ports));
    expect(await readFile(`${directory}/journal.json`, 'utf8')).toBe(bytes);
  }
  await writeFile(`${directory}/journal.json`, protectedBytes);
  await executeRegistryLifecycle({ ...binding, command: 'finish', outcome: 'promoted' }, ports);
  const completed = await readFile(`${directory}/journal.json`, 'utf8');
  expect(await executeRegistryLifecycle({ ...binding, command: 'resume' }, ports)).toMatchObject({
    phase: 'promoted',
    receipt: { promotion: { operationId: 'resume-proof' } },
  });
  for (const changed of [
    { operationId: 'foreign' },
    { images: [`registry.test/wbs/backend@${previous}`] },
    { currentImages: null },
    { recovers: 'foreign' },
  ])
    await expectRejection(
      executeRegistryLifecycle({ ...binding, command: 'resume', ...changed }, ports),
    );
  expect(await readFile(`${directory}/journal.json`, 'utf8')).toBe(completed);
});

it('accepts explicit registry-scope Docker census but never substitutes it for environment coverage', async () => {
  const { invoke } = await fixture(false);
  const source = {
    id: 'host',
    owner: 'deploy',
    environment: null,
    kind: 'docker-host',
    source: '/trusted/docker.json',
    configurationSha256: 'a'.repeat(64),
    role: 'consumer',
  };
  const enroll = (sources: unknown[]) =>
    invoke({
      command: 'enroll-consumers',
      expectedRevision: 4,
      operationId: 'sources',
      owner: 'deploy',
      sources,
    });
  for (const changed of [
    { ...source, environment: 'prod' },
    { ...source, role: 'history' },
    { ...source, kind: 'kubernetes' },
    { ...source, hostSourceId: 'self' },
  ])
    await expectRejection(enroll([changed]));
  const enrolled = await enroll([source]);
  expect(enrolled.state.consumers[0].environment).toBe(null);
  await requireRefusal(
    invoke({
      command: 'enroll-environment',
      expectedRevision: enrolled.state.revision,
      operationId: 'environment',
      owner: 'deploy',
      environment: 'prod',
      product: 'wbs',
      history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
    }),
    'actual consumer',
  );
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
