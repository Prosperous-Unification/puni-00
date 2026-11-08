import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import { uploadArtifact } from './platform-registry';
import { registryHistorySha256 } from './registry-history';
import { writeRegistryIndexFixture } from './registry-index.fixture';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryConsumer,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import { publishArtifacts } from './registry-publication';
import { parseReaderConfiguration, type RegistryReaderConfiguration } from './registry-reader';

const observations = '/etc/puni/registry-index-observations.json';
const journalPath = '/var/lib/puni-registry/journal/contents';
const environment = 'native-index';
const product = 'native-index';
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

/** Public content identities only; owner capabilities never leave the actual authority caller. */
export const RegistryIndexPublication = type({
  revision: '1|2|3|4|5|6|7|8|9|10|11|12|13|14',
  operationId: 'string > 0',
  root: /^sha256:[a-f0-9]{64}$/,
  manifests: type(/^sha256:[a-f0-9]{64}$/)
    .array()
    .exactlyLength(3),
  blobs: type(/^sha256:[a-f0-9]{64}$/)
    .array()
    .exactlyLength(4),
  '+': 'reject',
});

/** Actual schema4 producer, ownership callback and HTTP uploader; only deterministic image bytes are fixtures. */
export async function publishRegistryIndexFixture(
  revision: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14,
  installed: RegistryMaintenanceInstallation,
  ports: RegistryJournalPorts,
): Promise<typeof RegistryIndexPublication.infer> {
  const directory = await mkdtemp('/tmp/task8-index-publication-');
  try {
    const artifact = await writeRegistryIndexFixture(directory, revision);
    const receipt = await publishArtifacts(
      {
        registryId: installed.registryId,
        owner: 'operator',
        product,
        requiredRepositories: [artifact.repository],
      },
      [artifact],
      (request) => executeRegistryCommand(journalPath, request, ports),
      async (current, ownership) => {
        await uploadArtifact({ url: 'http://127.0.0.1:5052' }, current, ownership);
      },
    );
    return RegistryIndexPublication.assert({
      revision,
      operationId: receipt.operationId,
      root: artifact.digest,
      manifests: artifact.contents
        .filter((content) => content.isManifest)
        .map((content) => content.digest),
      blobs: artifact.contents
        .filter((content) => !content.isManifest)
        .map((content) => content.digest),
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}

/** Fixed synthetic reader configurations and their exact enrollment identities, kept together for production universe/coverage validation. */
export function createRegistryIndexReaders(primary: RegistryReaderConfiguration): {
  configurations: RegistryReaderConfiguration[];
  sources: RegistryConsumer[];
} {
  const historyPath = '/etc/puni/registry-index-history.json';
  const history = parseReaderConfiguration({
    ...primary,
    id: 'fixture-history',
    kind: 'compose',
    role: 'history',
    source: historyPath,
    input: {},
  });
  const identity = type({ registryUrl: 'string', docker: 'unknown', host: 'unknown' }).assert(
    primary.input,
  );
  const root = '/root/task8-fixture/index-compose';
  const consumer = parseReaderConfiguration({
    ...primary,
    id: 'fixture-index',
    kind: 'compose',
    role: 'consumer',
    source: '/etc/puni/registry-index-consumer.json',
    input: {
      scope: {
        registryId: primary.registryId,
        owner: 'operator',
        product,
        environment,
        target: 'compose:' + root,
      },
      root,
      registryUrl: identity.registryUrl,
      docker: identity.docker,
      host: identity.host,
    },
  });
  const configurations = [primary, consumer, history];
  const sources: RegistryConsumer[] = [];
  for (const configuration of configurations) {
    const serialized = JSON.stringify(configuration);
    sources.push({
      id: configuration.id,
      owner: 'operator',
      environment: configuration.kind === 'docker-host' ? null : environment,
      ...(configuration.kind === 'compose' && configuration.role === 'consumer'
        ? { hostSourceId: primary.id }
        : {}),
      kind: configuration.kind,
      source: configuration.source,
      role: configuration.role,
      configurationSha256: hash(serialized),
    });
  }
  return { configurations, sources };
}

/** Root-owned synthetic consumer/history source around real publication and deployment commands. It reports complete acknowledged history, never manufactures promotion receipts. */
export async function prepareRegistryIndexReaders(
  installed: RegistryMaintenanceInstallation,
): Promise<void> {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('Index readers require private root PID1');
  const path = '/usr/local/libexec/puni-registry-maintenance/consumer.js';
  const reader = `const request = JSON.parse(await Bun.stdin.text()); const observed = JSON.parse(await Bun.file('${observations}').text()); console.log(JSON.stringify({ protocol: request.protocol, registryId: request.registryId, id: request.id, source: request.source, revision: request.revision, role: request.role, sourceRevision: 'synthetic-index-history', references: observed.currentReferences, currentReferences: observed.currentReferences, ...(request.role === 'history' ? { history: observed.history, historySha256: observed.historySha256 } : {}) }));\n`;
  await writeFile(path, reader, { mode: 0o644 });
  const primaryPath = '/etc/puni/registry-fixture-reader.json';
  const primary = parseReaderConfiguration(JSON.parse(await readFile(primaryPath, 'utf8')));
  primary.artifact = { path, sha256: hash(reader) };
  const { configurations, sources } = createRegistryIndexReaders(primary);
  for (const configuration of configurations)
    await writeFile(configuration.source, JSON.stringify(configuration), { mode: 0o644 });
  await writeFile(
    '/etc/puni/registry-consumers.json',
    JSON.stringify({ schemaVersion: 1, registryId: installed.registryId, sources }),
    { mode: 0o644 },
  );
  await writeFile(
    observations,
    JSON.stringify({
      currentReferences: [],
      history: { state: 'first-install', at: new Date().toISOString() },
      historySha256: registryHistorySha256([]),
    }),
    { mode: 0o644, flag: 'wx' },
  );
}

/** Refresh the synthetic source only after the real authority durably acknowledges a promotion. */
export async function refreshRegistryIndexHistory(): Promise<void> {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('Index history requires private root PID1');
  const journal = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(journalPath + '/journal.json', 'utf8')),
  } satisfies { state: unknown }).state;
  const enrolled = journal.environments.find((candidate) => candidate.environment === environment);
  if (enrolled === undefined || enrolled.releases.length === 0)
    throw new Error('Missing actual acknowledged index promotion');
  const bundles = enrolled.releases.map((operationId) => {
    const bundle = journal.bundles.find((candidate) => candidate.operationId === operationId);
    if (bundle?.receipt.state !== 'promoted')
      throw new Error('Index promotion lacks durable bundle');
    return bundle;
  });
  const current = bundles.at(0);
  if (current === undefined) throw new Error('Missing index current release');
  await writeFile(
    observations,
    JSON.stringify({
      currentReferences: current.references,
      history: { state: 'successful', complete: true, releases: enrolled.releases },
      historySha256: registryHistorySha256(bundles),
    }),
    { mode: 0o644 },
  );
}

/** Real deployment ownership/promote transitions; fixture source observations are explicitly separate and refreshed by root between calls. */
export async function promoteRegistryIndexFixture(
  revision: 2 | 3 | 4,
  ports: RegistryJournalPorts,
): Promise<void> {
  const publications = RegistryIndexPublication.array()
    .exactlyLength(4)
    .assert(JSON.parse(await readFile('/etc/puni/registry-index-publications.json', 'utf8')));
  const candidate = publications.find((publication) => publication.revision === revision);
  if (candidate === undefined) throw new Error('Missing exact index candidate');
  const invoke = (request: unknown) => executeRegistryCommand(journalPath, request, ports);
  let state = (await invoke({ command: 'read' })).state;
  if (revision === 2) {
    const observed = type({ history: { state: "'first-install'", at: 'string.date.iso' } }).assert(
      JSON.parse(await readFile(observations, 'utf8')),
    );
    state = (
      await invoke({
        command: 'enroll-environment',
        expectedRevision: state.revision,
        operationId: 'index-environment',
        owner: 'operator',
        environment,
        product,
        history: observed.history,
      })
    ).state;
  }
  const enrolled = state.environments.find((candidate) => candidate.environment === environment);
  if (enrolled === undefined) throw new Error('Index environment is absent');
  const operationId = 'index-promote-' + String(revision);
  const begun = await invoke({
    command: 'begin-deployment',
    expectedRevision: state.revision,
    operationId,
    owner: 'operator',
    environment,
    candidate: candidate.operationId,
    current: enrolled.releases.at(0) ?? null,
  });
  if (begun.token === undefined) throw new Error('Index deployment lacks capability');
  await invoke({
    command: 'finish-deployment',
    expectedRevision: begun.state.revision,
    operationId,
    owner: 'operator',
    token: begun.token,
    outcome: 'promoted',
    reconciled: true,
  });
}
