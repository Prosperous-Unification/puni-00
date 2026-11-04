import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import { registryHistorySha256 } from './registry-history';
import { RegistryIndexPublication } from './registry-index-authority.fixture';
import type { RegistryInventory } from './registry-inventory';
import type { EnvironmentHistory } from './registry-journal';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryConsumer,
  type RegistryJournal,
  type RegistryJournalPorts,
} from './registry-journal';
import { parseReaderConfiguration, type RegistryReaderConfiguration } from './registry-reader';

export const registryHistoryEnvironments = ['history-old', 'history-new'] as const;

/** Fixed two-environment fixture catalog for independent newest-ten and rollback-history evidence. The one global host covers both distinct Compose roots; every environment has its own complete history source. */
export function createRegistryRetentionReaders(primary: RegistryReaderConfiguration) {
  const identity = type({ registryUrl: 'string', docker: 'unknown', host: 'unknown' }).assert(
    primary.input,
  );
  const configurations = [primary];
  for (const environment of registryHistoryEnvironments) {
    const root = '/root/task8-fixture/' + environment;
    for (const role of ['consumer', 'history'] as const) {
      configurations.push(
        parseReaderConfiguration({
          ...primary,
          id: environment + '-' + role,
          kind: 'compose',
          source: '/etc/puni/registry-' + environment + '-' + role + '.json',
          role,
          input:
            role === 'history'
              ? {}
              : {
                  scope: {
                    registryId: primary.registryId,
                    owner: 'operator',
                    product: 'native-index',
                    environment,
                    target: 'compose:' + root,
                  },
                  root,
                  ...identity,
                },
        }),
      );
    }
  }
  const sources: RegistryConsumer[] = configurations.map((configuration) => ({
    id: configuration.id,
    owner: 'operator',
    environment:
      configuration.id === primary.id
        ? null
        : (registryHistoryEnvironments.find((environment) =>
            configuration.id.startsWith(environment + '-'),
          ) ??
          (() => {
            throw new Error('Unknown fixed history reader');
          })()),
    ...(configuration.kind === 'compose' && configuration.role === 'consumer'
      ? { hostSourceId: primary.id }
      : {}),
    kind: configuration.kind,
    source: configuration.source,
    role: configuration.role,
    configurationSha256: createHash('sha256').update(JSON.stringify(configuration)).digest('hex'),
  }));
  return { configurations, sources };
}

/** Fixed fixture promotion through the existing authority, preserving its original timestamps and immutable publication bundle. */
export async function promoteRegistryRetentionCandidate(input: {
  directory: string;
  candidate: string;
  environment: (typeof registryHistoryEnvironments)[number];
  firstInstallAt: string;
  ports: RegistryJournalPorts;
}) {
  const invoke = (request: unknown) =>
    executeRegistryCommand(input.directory, request, input.ports);
  let state = (await invoke({ command: 'read' })).state;
  if (!state.environments.some((environment) => environment.environment === input.environment)) {
    state = (
      await invoke({
        command: 'enroll-environment',
        expectedRevision: state.revision,
        operationId: 'enroll-' + input.environment,
        owner: 'operator',
        environment: input.environment,
        product: 'native-index',
        history: { state: 'first-install', at: input.firstInstallAt },
      })
    ).state;
  }
  const environment = state.environments.find(
    (environment) => environment.environment === input.environment,
  );
  if (environment === undefined) throw new Error('Acknowledged history environment is absent');
  const operationId = 'promote-' + input.candidate;
  const begun = await invoke({
    command: 'begin-deployment',
    expectedRevision: state.revision,
    operationId,
    owner: 'operator',
    environment: input.environment,
    candidate: input.candidate,
    current: environment.releases.at(0) ?? null,
  });
  if (begun.token === undefined) throw new Error('History promotion lacks authority capability');
  return (
    await invoke({
      command: 'finish-deployment',
      expectedRevision: begun.state.revision,
      operationId,
      owner: 'operator',
      token: begun.token,
      outcome: 'promoted',
      reconciled: true,
    })
  ).state;
}

/** Fixture evidence must independently place old current plus two priors outside the newest ten, using untouched original promotion receipts. */
export function requireRegistryRetentionHistory(
  journal: RegistryJournal,
  operations: readonly string[],
): void {
  // Proof (fixture): removing the count admits a consistent thirteen-release history; removing strict order admits tied original promotion times.
  if (operations.length !== 14 || new Set(operations).size !== 14)
    throw new Error('History proof requires fourteen distinct acknowledged releases');
  let previous = Number.NEGATIVE_INFINITY;
  for (const operationId of operations) {
    const bundle = journal.bundles.find((bundle) => bundle.operationId === operationId);
    if (bundle?.product !== 'native-index' || bundle.receipt.state !== 'promoted')
      throw new Error('History proof lacks original promoted bundle');
    const at = Date.parse(bundle.receipt.at);
    if (!(at > previous)) throw new Error('Original promotion timestamps are not strictly ordered');
    previous = at;
  }
  if (journal.environments.length !== 2) throw new Error('History proof environment set differs');
  for (const environment of registryHistoryEnvironments) {
    const expected = (
      environment === 'history-old' ? operations.slice(0, 3) : operations.slice(3)
    ).toReversed();
    const actual = journal.environments.find((candidate) => candidate.environment === environment);
    // Proof (fixture): removal admits an old environment history missing its oldest required prior.
    if (actual === undefined || JSON.stringify(actual.releases) !== JSON.stringify(expected))
      throw new Error('Original acknowledged current and prior history differs');
  }
}

const retentionObservations = '/etc/puni/registry-retention-observations.json';
const retentionPublications = '/etc/puni/registry-retention-publications.json';
type References = RegistryJournal['bundles'][number]['references'];
interface RetentionReport {
  currentReferences: References;
  history?: typeof EnvironmentHistory.infer;
  historySha256?: string;
}

/** Synthetic reader observations are derived only from actual acknowledged journal bundles; the original complete history and timestamps remain untouched. */
export function createRegistryRetentionObservations(
  journal: RegistryJournal | undefined,
  firstInstallAt: string,
  hostId: string,
) {
  const reports: Record<string, RetentionReport> = {};
  const allCurrent: References = [];
  for (const environment of registryHistoryEnvironments) {
    const releases =
      journal?.environments.find((candidate) => candidate.environment === environment)?.releases ??
      [];
    const bundles = releases.map((operationId) => {
      const bundle = journal?.bundles.find((candidate) => candidate.operationId === operationId);
      if (bundle?.receipt.state !== 'promoted')
        throw new Error('Synthetic history lacks acknowledged original promotion');
      return bundle;
    });
    const currentReferences = bundles[0]?.references ?? [];
    allCurrent.push(...currentReferences);
    reports[environment + '-consumer'] = { currentReferences };
    reports[environment + '-history'] = {
      currentReferences,
      history:
        releases.length === 0
          ? { state: 'first-install', at: firstInstallAt }
          : { state: 'successful', complete: true, releases },
      historySha256: registryHistorySha256(bundles),
    };
  }
  reports[hostId] = { currentReferences: allCurrent };
  return { firstInstallAt, hostId, reports };
}

/** Root-only fixture installation of five explicitly synthetic sources; real authority enrollment validates their universe and coverage. */
export async function prepareRegistryRetentionReaders(): Promise<void> {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('Retention setup requires owned root PID1');
  const primary = parseReaderConfiguration(
    JSON.parse(await readFile('/etc/puni/registry-fixture-reader.json', 'utf8')),
  );
  const artifactPath = '/usr/local/libexec/puni-registry-maintenance/consumer.js';
  const script = `const request=JSON.parse(await Bun.stdin.text());const observed=JSON.parse(await Bun.file('${retentionObservations}').text());const report=observed.reports[request.id];if(report===undefined)throw new Error('Unknown fixed retention reader');console.log(JSON.stringify({protocol:request.protocol,registryId:request.registryId,id:request.id,source:request.source,revision:request.revision,role:request.role,sourceRevision:'synthetic-retention-history',references:report.currentReferences,...report}));\n`;
  await writeFile(artifactPath, script, { mode: 0o644 });
  primary.artifact = {
    path: artifactPath,
    sha256: createHash('sha256').update(script).digest('hex'),
  };
  const readers = createRegistryRetentionReaders(primary);
  for (const configuration of readers.configurations)
    await writeFile(configuration.source, JSON.stringify(configuration), { mode: 0o644 });
  await writeFile(
    '/etc/puni/registry-consumers.json',
    JSON.stringify({ schemaVersion: 1, registryId: primary.registryId, sources: readers.sources }),
    { mode: 0o644 },
  );
  await writeFile(
    retentionObservations,
    JSON.stringify(
      createRegistryRetentionObservations(undefined, new Date().toISOString(), primary.id),
    ),
    { mode: 0o644, flag: 'wx' },
  );
}

/** Refresh only after the exact owner process has returned an acknowledged promotion; no live authority replacement or receipt rewrite. */
export async function refreshRegistryRetentionHistory(): Promise<void> {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('History refresh requires owned root PID1');
  const previous = type({ firstInstallAt: 'string.date.iso', hostId: 'string > 0' }).assert(
    JSON.parse(await readFile(retentionObservations, 'utf8')),
  );
  const journal = parseRegistryCommandResponse({
    state: JSON.parse(
      await readFile('/var/lib/puni-registry/journal/contents/journal.json', 'utf8'),
    ),
  } satisfies { state: unknown }).state;
  await writeFile(
    retentionObservations,
    JSON.stringify(
      createRegistryRetentionObservations(journal, previous.firstInstallAt, previous.hostId),
    ),
    { mode: 0o644 },
  );
}

/** Fixed owner-side selection of a published fixture revision; native ports retain their real clock and all promotion evidence comes from the authority. */
export async function promoteRegistryRetentionFixture(
  revision: (typeof RegistryIndexPublication.infer)['revision'],
  ports: RegistryJournalPorts,
): Promise<void> {
  const publications = RegistryIndexPublication.array()
    .atLeastLength(1)
    .atMostLength(14)
    .assert(JSON.parse(await readFile(retentionPublications, 'utf8')));
  const candidate = publications.find((publication) => publication.revision === revision);
  if (candidate === undefined) throw new Error('Requested retention publication is absent');
  const observed = type({ firstInstallAt: 'string.date.iso' }).assert(
    JSON.parse(await readFile(retentionObservations, 'utf8')),
  );
  await promoteRegistryRetentionCandidate({
    directory: '/var/lib/puni-registry/journal/contents',
    candidate: candidate.operationId,
    environment: revision <= 3 ? 'history-old' : 'history-new',
    firstInstallAt: observed.firstInstallAt,
    ports,
  });
}

/** This all-promoted proof has no staging or unfinished-publication grace obligation; the native caller supplies a complete physical/API census. */
export function requireRegistryPromotedHistoryInventory(
  inventory: Pick<
    RegistryInventory,
    'journal' | 'uploads' | 'partialOperations' | 'neverUploaded' | 'unreferencedContent'
  >,
): void {
  // Proof (fixture): independent predicate removals admit missing/unpromoted bundles, active publication/reservation/deployment, staged uploads, partial/never-uploaded or unreferenced content in the actual-authority test with modeled census inputs.
  if (
    inventory.journal.bundles.length !== 14 ||
    inventory.journal.bundles.some((bundle) => bundle.receipt.state !== 'promoted')
  )
    throw new Error('History proof requires fourteen promoted publications');
  if (inventory.journal.publication !== null || inventory.journal.reservations.length !== 0)
    throw new Error('History proof has an unfinished publication reservation');
  if (
    inventory.journal.deployments.some(
      (deployment) => deployment.phase !== 'promoted' || deployment.finishedAt === null,
    )
  )
    throw new Error('History proof has an unsettled deployment');
  if (
    inventory.uploads.length !== 0 ||
    inventory.partialOperations.length !== 0 ||
    inventory.neverUploaded.length !== 0 ||
    inventory.unreferencedContent.length !== 0
  )
    throw new Error('History proof has staging or unpromoted content');
}
