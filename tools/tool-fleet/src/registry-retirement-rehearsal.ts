import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { protectDeployment } from './registry-deployment';
import {
  advanceRegistryHistory,
  parseRegistryHistory,
  registryHistorySha256,
} from './registry-history';
import { kubernetesImageReferences } from './registry-kubernetes';
import {
  assertConsumerUniverse,
  executeRegistryCommand,
  type RegistryConsumer,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import {
  managedImageReferences,
  parseReaderConfiguration,
  runRegistryReader,
} from './registry-reader';

/** Real bundled owner reader plus durable authority proves retirement without erasing historical provenance. */
export async function rehearseRegistryRetirement(
  configurationPath: string,
  historyPath: string,
  regularPath: string,
): Promise<void> {
  const configuration = parseReaderConfiguration(
    JSON.parse(await readFile(configurationPath, 'utf8')) as unknown,
  );
  const original = await readFile(historyPath, 'utf8');
  const envelope = type({ registryHistory: 'unknown' })(JSON.parse(original) as unknown);
  if (envelope instanceof type.errors) throw new Error('Missing inherited owner history');
  const history = parseRegistryHistory(envelope.registryHistory, historyPath);
  const regular = type({
    schemaVersion: '4',
    state: { transactionId: 'string > 0' },
    registryHistory: 'unknown',
  })(JSON.parse(await readFile(regularPath, 'utf8')) as unknown);
  if (regular instanceof type.errors) throw new Error('Missing actual regular journal fixture');
  const first = history.releases.at(0);
  if (first === undefined) throw new Error('Retirement proof requires successful source evidence');
  const root = join(historyPath, '..', 'authority-proof');
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o700);
  const source = (
    id: string,
    environment: string,
    owner: string,
    role: 'history' | 'consumer',
  ): RegistryConsumer => ({
    id,
    environment,
    owner,
    role,
    kind: role === 'history' ? 'recovery' : 'kubernetes',
    source: id === configuration.id ? configuration.source : `/fixture/${id}.json`,
    configurationSha256: 'a'.repeat(64),
  });
  const sources = [
    source(configuration.id, history.environment, 'deploy', 'history'),
    source('actual', history.environment, 'deploy', 'consumer'),
    source('other-history', 'other', 'other', 'history'),
    source('other-actual', 'other', 'other', 'consumer'),
    source('bootstrap-history', 'bootstrap', 'deploy', 'history'),
    source('bootstrap-actual', 'bootstrap', 'deploy', 'consumer'),
  ];
  let bootstrapped = false;
  let omitActual = false;
  let resources: unknown[] = [];
  const capacity = {
    maximumBytes: 1024 ** 3,
    usableBytes: 1024 ** 3,
    usedBytes: 0,
    totalInodes: 100000,
    usedInodes: 10,
    rootFreeBytes: 30 * 1024 ** 3,
  };
  const ports: RegistryJournalPorts = {
    measureJournal: () =>
      Promise.resolve({
        usableBytes: 1024 ** 3,
        usedBytes: 0,
        totalInodes: 100000,
        usedInodes: 10,
        allocationUnitBytes: 4096,
      }),
    measureRegistry: () => Promise.resolve(capacity),
    verifyImages: () => Promise.resolve(),
    verifyConsumers: (registered) => {
      assertConsumerUniverse(
        { schemaVersion: 1, registryId: history.registryId, sources },
        registered,
        history.registryId,
      );
      return Promise.resolve();
    },
    now: () => first.receipt.at,
    collectConsumers: async (registered, revision) => {
      const reports = [];
      for (const source of registered) {
        if (omitActual && source.id === 'actual') continue;
        const identity = {
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'fixture-runtime-observation',
        };
        if (source.id === configuration.id) {
          const report = await runRegistryReader(configuration, revision);
          reports.push({
            ...identity,
            sourceRevision: report.sourceRevision,
            references: report.references,
            currentReferences: report.currentReferences,
            history: report.history,
            historySha256: report.historySha256,
          });
        } else if (source.role === 'history') {
          const empty = source.environment === 'bootstrap' && !bootstrapped;
          reports.push({
            ...identity,
            references: [],
            currentReferences: empty ? [] : first.references,
            historySha256: registryHistorySha256(empty ? [] : [first]),
            history: empty
              ? { state: 'first-install', at: first.receipt.at }
              : { state: 'successful', complete: true, releases: [first.operationId] },
          });
        } else
          reports.push({
            ...identity,
            references:
              source.id === 'actual'
                ? managedImageReferences(
                    kubernetesImageReferences(resources),
                    'https://registry.test',
                  )
                : [],
          });
      }
      return reports;
    },
  };
  const invoke = (request: unknown) => executeRegistryCommand(root, request, ports);
  const send = async (request: Record<string, unknown>) =>
    invoke({ ...request, expectedRevision: (await invoke({ command: 'read' })).state.revision });
  const refuse = async (work: () => Promise<unknown>, message: string) => {
    try {
      await work();
    } catch (cause) {
      if (!String(cause).includes(message)) throw cause;
      return;
    }
    throw new Error(`Expected retirement refusal: ${message}`);
  };
  try {
    await invoke({
      command: 'initialize',
      enrollment: {
        registryId: history.registryId,
        storageId: 'proof',
        owners: ['publisher', 'deploy', 'other'],
        registryPath: '/unused',
        rootPath: '/',
        maximumBytes: 1024 ** 3,
        journalMaximumBytes: 1024 ** 3,
      },
    });
    const publish = async (operationId: string, references: typeof first.references) => {
      const admitted = await send({
        command: 'reserve-publication',
        operationId,
        owner: 'publisher',
        product: history.product,
        roots: [...new Set(references.map((reference) => reference.digest))],
        references,
        envelope: { bytes: 1, inodes: 1 },
      });
      await send({
        command: 'finish-publication',
        operationId,
        owner: 'publisher',
        token: admitted.token,
        outcome: 'completed',
        reconciled: true,
      });
    };
    await publish(first.operationId, first.references);
    await send({ command: 'enroll-consumers', operationId: 'sources', owner: 'deploy', sources });
    await send({
      command: 'enroll-environment',
      operationId: 'bootstrap',
      owner: 'deploy',
      environment: 'bootstrap',
      product: history.product,
      history: { state: 'first-install', at: first.receipt.at },
    });
    const bootstrap = await send({
      command: 'begin-deployment',
      operationId: 'bootstrap-deploy',
      owner: 'deploy',
      environment: 'bootstrap',
      candidate: first.operationId,
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
    for (const [environment, owner] of [
      [history.environment, 'deploy'],
      ['other', 'other'],
    ])
      await send({
        command: 'enroll-environment',
        operationId: `environment-${environment}`,
        owner,
        environment,
        product: history.product,
        history: { state: 'successful', complete: true, releases: [first.operationId] },
      });
    const retire = () =>
      send({
        command: 'retire-environment',
        operationId: 'retire-target',
        owner: 'deploy',
        environment: history.environment,
      });
    resources = [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'scaled-zero' },
        spec: {
          replicas: 0,
          template: {
            spec: {
              containers: [
                {
                  name: 'app',
                  image: `registry.test/${first.references[0].repository}@${first.references[0].digest}`,
                },
              ],
            },
          },
        },
      },
    ];
    await refuse(retire, 'references remain');
    resources = [];
    omitActual = true;
    await refuse(retire, 'consumer inventory');
    omitActual = false;
    const next = first.references.map((reference) => ({
      ...reference,
      digest: `sha256:${'2'.repeat(64)}`,
    }));
    await publish('next', next);
    const enrollment = {
      registryId: history.registryId,
      registryUrl: 'https://registry.test',
      owner: 'deploy',
      product: history.product,
      environment: history.environment,
      target: history.target,
      sshHost: 'unused',
      requiredRepositories: next.map((reference) => reference.repository),
      publicationReceiptPath: '/unused',
    };
    const publication = {
      registryId: history.registryId,
      operationId: 'next',
      owner: 'publisher',
      product: history.product,
      roots: [...new Set(next.map((reference) => reference.digest))],
      references: next,
      receipt: { state: 'completed', at: first.receipt.at },
    };
    const image = (reference: { repository: string; digest: string }) =>
      `registry.test/${reference.repository}@${reference.digest}`;
    const deployment = await protectDeployment(
      enrollment,
      publication,
      next.map(image),
      first.references.map(image),
      regular.state.transactionId,
      invoke,
    );
    await refuse(retire, 'Unsettled');
    const receipt = await deployment.finish('promoted');
    if (receipt === undefined) throw new Error('Missing authenticated history receipt');
    await refuse(retire, 'history');
    const repaired = advanceRegistryHistory(history, receipt);
    const persist = async (nextHistory: unknown) =>
      writeFile(historyPath, JSON.stringify({ ...regular, registryHistory: nextHistory }));
    await persist(repaired);
    const altered = structuredClone(repaired);
    altered.releases[0].receipt.at = '2026-10-25T12:59:00.000Z';
    await persist(altered);
    await refuse(retire, 'history');
    const changed = structuredClone(repaired);
    changed.releases[1].references[0].digest = `sha256:${'f'.repeat(64)}`;
    await persist(changed);
    await refuse(retire, 'history');
    const reordered = structuredClone(repaired);
    reordered.releases[0].references.reverse();
    await persist(reordered);
    await retire();
    const state = (await invoke({ command: 'read' })).state;
    if (
      state.protections.some(
        (protection) => protection.operationId === `environment-${history.environment}`,
      ) ||
      !state.protections.some(
        (protection) =>
          protection.operationId === 'environment-other' &&
          protection.references.some(
            (reference) => reference.digest === first.references[0].digest,
          ),
      )
    )
      throw new Error('Retirement released shared owner or retained retired environment');
    const observed = await runRegistryReader(configuration, state.revision);
    if (
      observed.references.length !== 0 ||
      observed.history?.state !== 'successful' ||
      observed.history.releases.length !== 2 ||
      observed.historySha256 !== registryHistorySha256(repaired.releases)
    )
      throw new Error('Retirement erased history or ref ordering changed evidence');
    const onlyHistory = sources.filter((source) => source.role === 'history');
    let rejected = false;
    try {
      assertConsumerUniverse(
        { schemaVersion: 1, registryId: history.registryId, sources: onlyHistory },
        onlyHistory,
        history.registryId,
      );
    } catch (cause) {
      if (!String(cause).includes('actual consumer')) throw cause;
      rejected = true;
    }
    if (!rejected) throw new Error('History-only universe accepted');
    console.log(
      'real owner reader retirement, drift repair, receipt integrity and shared-owner protection passed',
    );
  } finally {
    await writeFile(historyPath, original);
  }
}
if (import.meta.main) {
  const configuration = Bun.argv.at(2);
  const history = Bun.argv.at(3);
  const regular = Bun.argv.at(4);
  if (configuration === undefined || history === undefined || regular === undefined)
    throw new Error('Expected pinned owner-reader configuration and inherited journal');
  await rehearseRegistryRetirement(configuration, history, regular);
}
