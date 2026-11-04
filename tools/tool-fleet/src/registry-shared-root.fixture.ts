import { mkdtemp, readFile, rm } from 'node:fs/promises';

import { type } from 'arktype';

import { uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import { writeRegistryIndexFixture } from './registry-index.fixture';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-journal';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { publishArtifacts } from './registry-publication';

/** Fixed three-publication byte fixture for shared-root partial and repeated retirement; no registry or authority effect. */
export async function writeRegistrySharedRootFixture(
  directory: string,
  release: 'old-one' | 'old-two' | 'current',
): Promise<RegistryArtifact[]> {
  if (release === 'current')
    return [
      {
        ...(await writeRegistryIndexFixture(directory, 4)),
        repository: 'retained/current',
        reference: 'current',
      },
    ];
  const common = await writeRegistryIndexFixture(directory, 1);
  const unique = await writeRegistryIndexFixture(directory, release === 'old-one' ? 2 : 3);
  return [
    { ...common, repository: 'retained/common', reference: 'shared-root' },
    { ...unique, repository: 'retained/unique', reference: release },
  ];
}

/** Bounded public fixture receipt; authority capabilities remain only in the canonical journal and owner process. */
export const RegistrySharedPublication = type({
  release: "'old-one'|'old-two'|'current'",
  operationId: 'string > 0',
  tiers: type({
    repository: "'retained/common'|'retained/unique'|'retained/current'",
    reference: 'string > 0',
    root: /^sha256:[a-f0-9]{64}$/,
    manifests: type(/^sha256:[a-f0-9]{64}$/)
      .array()
      .exactlyLength(3),
    blobs: type(/^sha256:[a-f0-9]{64}$/)
      .array()
      .exactlyLength(4),
    '+': 'reject',
  })
    .array()
    .atLeastLength(1)
    .atMostLength(2),
  '+': 'reject',
});

const sharedPublications = '/etc/puni/registry-shared-publications.json';
const sharedJournal = '/var/lib/puni-registry/journal/contents';

/** Actual common managed publisher/ownership callback/uploader. Only the deterministic image bytes and fixed repositories are fixtures. */
export async function publishRegistrySharedFixture(
  release: (typeof RegistrySharedPublication.infer)['release'],
  installed: RegistryMaintenanceInstallation,
  ports: RegistryJournalPorts,
): Promise<typeof RegistrySharedPublication.infer> {
  const directory = await mkdtemp('/tmp/task8-shared-publication-');
  try {
    const artifacts = await writeRegistrySharedRootFixture(directory, release);
    const receipt = await publishArtifacts(
      {
        registryId: installed.registryId,
        owner: 'operator',
        product: 'native-index',
        requiredRepositories: artifacts.map((artifact) => artifact.repository),
      },
      artifacts,
      (request) => executeRegistryCommand(sharedJournal, request, ports),
      async (artifact, ownership) => {
        await uploadArtifact({ url: 'http://127.0.0.1:5052' }, artifact, ownership);
      },
    );
    return RegistrySharedPublication.assert({
      release,
      operationId: receipt.operationId,
      tiers: artifacts.map((artifact) => ({
        repository: artifact.repository,
        reference: artifact.reference,
        root: artifact.digest,
        manifests: artifact.contents
          .filter((content) => content.isManifest)
          .map((content) => content.digest),
        blobs: artifact.contents
          .filter((content) => !content.isManifest)
          .map((content) => content.digest),
      })),
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}

/** Three exact root-written public receipts; fixed owner actions cannot choose another candidate or repository. */
export async function readRegistrySharedPublications() {
  const publications = RegistrySharedPublication.array()
    .exactlyLength(3)
    .assert(JSON.parse(await readFile(sharedPublications, 'utf8')));
  if (
    JSON.stringify(publications.map((publication) => publication.release)) !==
    JSON.stringify(['old-one', 'old-two', 'current'])
  )
    throw new Error('Shared fixture publication order differs');
  return publications;
}

/** Promote the actual third publication and acquire an independent image protection, without fabricating deployment or token evidence. */
export async function protectRegistrySharedFixture(ports: RegistryJournalPorts): Promise<void> {
  const publications = await readRegistrySharedPublications();
  const current = publications.find((publication) => publication.release === 'current');
  const common = publications[0]?.tiers.find((tier) => tier.repository === 'retained/common');
  const second = publications[1]?.tiers.find((tier) => tier.repository === 'retained/common');
  if (current === undefined || common === undefined || second?.root !== common.root)
    throw new Error('Shared fixture lacks identical original common roots');
  const invoke = (request: unknown) => executeRegistryCommand(sharedJournal, request, ports);
  let state = (await invoke({ command: 'read' })).state;
  const first = type({ history: { state: "'first-install'", at: 'string.date.iso' } }).assert(
    JSON.parse(await readFile('/etc/puni/registry-index-observations.json', 'utf8')),
  );
  state = (
    await invoke({
      command: 'enroll-environment',
      expectedRevision: state.revision,
      operationId: 'shared-environment',
      owner: 'operator',
      environment: 'native-index',
      product: 'native-index',
      history: first.history,
    })
  ).state;
  const begun = await invoke({
    command: 'begin-deployment',
    expectedRevision: state.revision,
    operationId: 'shared-promote-current',
    owner: 'operator',
    environment: 'native-index',
    candidate: current.operationId,
    current: null,
  });
  if (begun.token === undefined) throw new Error('Shared promotion lacks authority capability');
  state = (
    await invoke({
      command: 'finish-deployment',
      expectedRevision: begun.state.revision,
      operationId: 'shared-promote-current',
      owner: 'operator',
      token: begun.token,
      outcome: 'promoted',
      reconciled: true,
    })
  ).state;
  const pinned = await invoke({
    command: 'acquire-protection',
    expectedRevision: state.revision,
    operationId: 'shared-root-protection',
    owner: 'operator',
    reason: 'independent-image',
    roots: [common.root],
    references: [{ repository: common.repository, digest: common.root }],
  });
  if (pinned.token === undefined)
    throw new Error('Shared image protection lacks authority capability');
}

/** Release only the independent protection owned by this fixture, using its current canonical capability. Environment/current protections are never released or rewritten. */
export async function releaseRegistrySharedFixture(ports: RegistryJournalPorts): Promise<void> {
  const state = (await executeRegistryCommand(sharedJournal, { command: 'read' }, ports)).state;
  const protection = state.protections.find(
    (protection) =>
      protection.operationId === 'shared-root-protection' && protection.owner === 'operator',
  );
  if (protection === undefined) throw new Error('Original shared-root protection is absent');
  await executeRegistryCommand(
    sharedJournal,
    {
      command: 'release-protection',
      operationId: protection.operationId,
      owner: 'operator',
      token: protection.token,
      expectedRevision: state.revision,
      reconciled: true,
    },
    ports,
  );
}
