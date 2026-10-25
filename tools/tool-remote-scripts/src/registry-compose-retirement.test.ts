import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  advanceRegistryHistory,
  protectDeployment,
  type RegistryHistory,
} from '@tools/registry-publication';
import {
  assertConsumerUniverse,
  executeRegistryCommand,
  type RegistryConsumer,
  type RegistryJournalPorts,
} from '@tools/registry-publication';
import { expect, it } from 'bun:test';

import { readComposeHistory } from './registry-compose-reader';
import { readComposeSource } from './registry-compose-source';
import { dockerOwnershipFixture } from './registry-docker.fixture';
import { scanDockerConsumers } from './registry-docker-consumers';

it('retires one same-host environment through actual owner readers while the other shared owner remains protected', async () => {
  const fixture = await dockerOwnershipFixture();
  const at = '2026-10-25T12:00:00.000Z';
  const digest = `sha256:${'a'.repeat(64)}`;
  const references = ['be', 'gw', 'fe', 'mcp'].map((tier) => ({
    repository: `wbs-${tier}-01`,
    digest,
  }));
  const image = (tier: string) => `registry.test/wbs-${tier}-01@${digest}`;
  const histories = new Map<string, RegistryHistory>();
  const sourceOf = (name: string) => fixture.source(name);
  const pathOf = (name: string) => join(sourceOf(name).root, 'state/be.json');
  const scopeOf = (name: string) => {
    const scope = sourceOf(name).scope;
    return {
      registryId: scope.registryId,
      product: scope.product,
      environment: scope.environment,
      target: scope.target,
    };
  };
  for (const name of ['a', 'b']) {
    const history: RegistryHistory = {
      ...scopeOf(name),
      schemaVersion: 1,
      source: pathOf(name),
      genesis: { at, sourceRevision: 'explicit-fixture-genesis' },
      authorityRevision: 0,
      releases: [],
      promotion: null,
    };
    histories.set(name, history);
    await writeFile(
      pathOf(name),
      JSON.stringify({
        tier: 'be',
        activeColor: 'blue',
        lastDeployedSha: null,
        registry: { schemaVersion: 1, history, operation: null },
      }),
    );
  }
  const sources: RegistryConsumer[] = [
    {
      id: 'host',
      owner: 'host-owner',
      environment: null,
      kind: 'docker-host',
      source: join(fixture.root, 'host.json'),
      configurationSha256: 'a'.repeat(64),
      role: 'consumer',
    },
    ...['a', 'b'].flatMap((environment) => [
      {
        id: `history-${environment}`,
        owner: `operator-${environment}`,
        environment,
        kind: 'recovery' as const,
        source: join(fixture.root, `history-${environment}.json`),
        configurationSha256: 'b'.repeat(64),
        role: 'history' as const,
      },
      {
        id: `actual-${environment}`,
        owner: `operator-${environment}`,
        environment,
        kind: 'compose' as const,
        hostSourceId: 'host',
        source: join(fixture.root, `actual-${environment}.json`),
        configurationSha256: 'c'.repeat(64),
        role: 'consumer' as const,
      },
    ]),
  ];
  let omitHost = false;
  const ports: RegistryJournalPorts = {
    now: () => at,
    verifyConsumers: (registered) =>
      Promise.resolve().then(() => {
        assertConsumerUniverse(
          { schemaVersion: 1, registryId: 'proof', sources },
          registered,
          'proof',
        );
      }),
    verifyImages: () => Promise.resolve(),
    measureJournal: () =>
      Promise.resolve({
        usableBytes: 1024 ** 3,
        usedBytes: 0,
        allocationUnitBytes: 4096,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: 1024 ** 3,
        usableBytes: 1024 ** 3,
        usedBytes: 0,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * 1024 ** 3,
      }),
    collectConsumers: async (registered, revision) => {
      const reports = [];
      for (const source of registered) {
        if (source.id === 'host' && omitHost) continue;
        const observed =
          source.environment === null
            ? await scanDockerConsumers(fixture.global, fixture.read)
            : source.role === 'history'
              ? await readComposeHistory(
                  { scope: scopeOf(source.environment), source: sourceOf(source.environment) },
                  fixture.read,
                )
              : await readComposeSource(sourceOf(source.environment), fixture.read);
        reports.push({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: observed.sourceRevision,
          references: observed.references,
          ...('history' in observed
            ? {
                history: observed.history,
                historySha256: observed.historySha256,
                currentReferences: observed.currentReferences,
              }
            : {}),
        });
      }
      return reports;
    },
  };
  const journal = join(fixture.root, 'journal');
  await mkdir(journal, { mode: 0o700 });
  const invoke = (request: unknown) => executeRegistryCommand(journal, request, ports);
  const send = async (request: Record<string, unknown>) =>
    invoke({ ...request, expectedRevision: (await invoke({ command: 'read' })).state.revision });
  await invoke({
    command: 'initialize',
    enrollment: {
      registryId: 'proof',
      storageId: 'fixture',
      owners: ['publisher', 'host-owner', 'operator-a', 'operator-b'],
      registryPath: '/unused',
      rootPath: '/',
      maximumBytes: 1024 ** 3,
      journalMaximumBytes: 1024 ** 3,
    },
  });
  const reserved = await send({
    command: 'reserve-publication',
    operationId: 'shared',
    owner: 'publisher',
    product: 'wbs',
    roots: [digest],
    references,
    envelope: { bytes: 1, inodes: 1 },
  });
  await send({
    command: 'finish-publication',
    operationId: 'shared',
    owner: 'publisher',
    token: reserved.token,
    outcome: 'completed',
    reconciled: true,
  });
  await send({ command: 'enroll-consumers', operationId: 'sources', owner: 'host-owner', sources });
  const enroll = (name: string) =>
    send({
      command: 'enroll-environment',
      operationId: `environment-${name}`,
      owner: `operator-${name}`,
      environment: name,
      product: 'wbs',
      history: { state: 'first-install', at },
    });
  const live = [];
  for (const name of ['a', 'b']) {
    if (name === 'b') {
      const original = await readFile(pathOf('b'), 'utf8');
      await writeFile(pathOf('b'), await readFile(pathOf('a'), 'utf8'));
      await expectRejection(enroll('b'));
      await writeFile(pathOf('b'), original);
      expect((await readComposeSource(sourceOf('b'), fixture.read)).references).toEqual([]);
    }
    await enroll(name);
    const source = sourceOf(name);
    const publication = {
      registryId: 'proof',
      operationId: 'shared',
      owner: 'publisher',
      product: 'wbs',
      roots: [digest],
      references,
      receipt: { state: 'completed', at },
    };
    const session = await protectDeployment(
      {
        ...source.scope,
        registryUrl: 'https://registry.test',
        sshHost: 'unused',
        requiredRepositories: references.map((reference) => reference.repository),
        publicationReceiptPath: '/unused',
      },
      publication,
      references.map((reference) => `registry.test/${reference.repository}@${digest}`),
      null,
      `deploy-${name}`,
      invoke,
    );
    const history = histories.get(name);
    if (history === undefined) throw new Error('Missing fixture history');
    const operation = {
      operationId: `deploy-${name}`,
      sha: 'fixture',
      current: null,
      images: { be: image('be'), gw: image('gw'), fe: image('fe') },
      references: session.references,
      phase: 'protected',
    };
    await writeFile(
      pathOf(name),
      JSON.stringify({
        tier: 'be',
        activeColor: 'blue',
        lastDeployedSha: 'fixture',
        registry: { schemaVersion: 1, history, operation },
      }),
    );
    live.push(
      fixture.container(name, 'be', 'blue', image('be'), true),
      fixture.container(name, 'gw', 'green', image('gw'), false),
    );
    await fixture.set(live);
    const promoted = await session.finish('promoted');
    if (promoted === undefined) throw new Error('Missing promotion evidence');
    const advanced = advanceRegistryHistory(history, promoted);
    histories.set(name, advanced);
    await writeFile(
      pathOf(name),
      JSON.stringify({
        tier: 'be',
        activeColor: 'blue',
        lastDeployedSha: 'fixture',
        registry: {
          schemaVersion: 1,
          history: advanced,
          operation: { ...operation, phase: 'promoted' },
        },
      }),
    );
  }
  const retire = () =>
    send({
      command: 'retire-environment',
      operationId: 'retire-a',
      owner: 'operator-a',
      environment: 'a',
    });
  await fixture.set(live.filter((container) => container.name.startsWith('/b-')));
  const desired = join(sourceOf('a').root, 'compose/be-01-green.yml');
  await writeFile(desired, `services:\n  candidate:\n    image: ${image('be')}\n`);
  await expectRejection(retire(), 'references remain');
  await unlink(desired);
  await fixture.set([
    ...live.filter((container) => container.name.startsWith('/b-')),
    fixture.container('a', 'be', 'green', image('be'), false),
  ]);
  await expectRejection(retire(), 'references remain');
  await fixture.set(live.filter((container) => container.name.startsWith('/b-')));
  omitHost = true;
  await expectRejection(retire(), 'inventory');
  omitHost = false;
  await retire();
  const state = (await invoke({ command: 'read' })).state;
  expect(state.protections.some((protection) => protection.operationId === 'environment-a')).toBe(
    false,
  );
  expect(
    state.protections.some(
      (protection) =>
        protection.operationId === 'environment-b' && protection.roots.includes(digest),
    ),
  ).toBe(true);
  const retained = await readComposeHistory(
    { scope: scopeOf('a'), source: sourceOf('a') },
    fixture.read,
  );
  expect(retained.history).toEqual({ state: 'successful', complete: true, releases: ['shared'] });
  expect(retained.references).toEqual([]);
  expect(
    (await scanDockerConsumers(fixture.global, fixture.read)).references
      .map((reference) => reference.repository)
      .sort(),
  ).toEqual(['wbs-be-01', 'wbs-gw-01']);
}, 30000);

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
