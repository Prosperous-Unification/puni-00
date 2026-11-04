import { mkdtemp, readFile, rm } from 'node:fs/promises';

import { type } from 'arktype';

import { uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import { writeRegistryIndexFixture } from './registry-index.fixture';
import { collectRegistryInventory } from './registry-inventory';
import {
  executeRegistryCommand,
  type RegistryJournalPorts,
  type RegistryMaintenanceSession,
} from './registry-journal';
import type { RegistryMaintenanceRuntime } from './registry-maintenance';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { publishArtifacts } from './registry-publication';

/** Fixed two-publication fixture seed; the expired image must have a single tagged revision. */
export async function writeRegistryDeletionFixture(
  directory: string,
): Promise<[RegistryArtifact, RegistryArtifact]> {
  const expired = await writeRegistryIndexFixture(directory, 1);
  const protectedIndex = await writeRegistryIndexFixture(directory, 2);
  const manifest = expired.contents.find(
    (content) => content.mediaType === 'application/vnd.oci.image.manifest.v1+json',
  );
  if (manifest === undefined) throw new Error('Fixed deletion seed lacks its platform manifest');
  const closure = new Set([manifest.digest, ...manifest.dependencies]);
  return [
    {
      repository: 'retained/expired',
      reference: 'expired',
      digest: manifest.digest,
      contents: expired.contents.filter((content) => closure.has(content.digest)),
    },
    protectedIndex,
  ];
}

/** Fixed public identities only; capabilities remain in the actual owner/journal. */
export const RegistryDeletionPublication = type({
  kind: "'expired'|'protected'",
  operationId: 'string > 0',
  repository: "'retained/expired'|'retained/index'",
  root: /^sha256:[a-f0-9]{64}$/,
  manifests: type(/^sha256:[a-f0-9]{64}$/)
    .array()
    .atLeastLength(1)
    .atMostLength(3),
  blobs: type(/^sha256:[a-f0-9]{64}$/)
    .array()
    .atLeastLength(3)
    .atMostLength(4),
  '+': 'reject',
});

/** Actual managed publication using the fixed seed; no promotion/environment history is manufactured. */
export async function publishRegistryDeletionFixture(
  kind: 'expired' | 'protected',
  installed: RegistryMaintenanceInstallation,
  ports: RegistryJournalPorts,
): Promise<typeof RegistryDeletionPublication.infer> {
  const directory = await mkdtemp('/tmp/task8-deletion-publication-');
  try {
    const artifacts = await writeRegistryDeletionFixture(directory);
    const artifact = artifacts[kind === 'expired' ? 0 : 1];
    const receipt = await publishArtifacts(
      {
        registryId: installed.registryId,
        owner: 'operator',
        product: 'native-index',
        requiredRepositories: [artifact.repository],
      },
      [artifact],
      (request) => executeRegistryCommand(installed.journalPath, request, ports),
      async (content, ownership) => {
        await uploadArtifact({ url: 'http://127.0.0.1:5052' }, content, ownership);
      },
    );
    return RegistryDeletionPublication.assert({
      kind,
      operationId: receipt.operationId,
      repository: artifact.repository,
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

/** The canonical image protection explicitly retains the index closure, independently of deployment history. */
export async function protectRegistryDeletionFixture(
  installed: RegistryMaintenanceInstallation,
  ports: RegistryJournalPorts,
): Promise<void> {
  const receipt = RegistryDeletionPublication.assert(
    JSON.parse(await readFile('/etc/puni/registry-deletion-protected.json', 'utf8')),
  );
  // Proof: kind/repository/root/count removals permit their invalid modeled canonical protection requests.
  if (
    receipt.kind !== 'protected' ||
    receipt.repository !== 'retained/index' ||
    receipt.manifests.length !== 3 ||
    !receipt.manifests.includes(receipt.root)
  )
    throw new Error('Protected deletion fixture receipt differs');
  const journal = (await executeRegistryCommand(installed.journalPath, { command: 'read' }, ports))
    .state;
  await executeRegistryCommand(
    installed.journalPath,
    {
      command: 'acquire-protection',
      expectedRevision: journal.revision,
      operationId: 'native-deletion-protection',
      owner: 'operator',
      roots: [receipt.root],
      references: [{ repository: receipt.repository, digest: receipt.root }],
      reason: 'explicit-native-protected-index',
    },
    ports,
  );
}

/** Fixed exact retained-census categories only; this never converts a failed owner to success. */
export function describeRegistryDeletionFailure(
  cause: unknown,
): 'missing-child-revision' | 'missing-manifest-content' | 'missing-dependency' | 'unknown' {
  // Proof: error-shape/aggregate/exact-message removals mislabel untrusted or unrelated failures as retained-census evidence.
  if (!(cause instanceof Error) || cause instanceof AggregateError) return 'unknown';
  if (cause.message === 'Missing child manifest revision') return 'missing-child-revision';
  if (cause.message === 'Missing stored manifest content') return 'missing-manifest-content';
  if (cause.message === 'Missing or unsupported registry dependency') return 'missing-dependency';
  return 'unknown';
}

/** The held failed retirement remains failed; only the exact pre-API dangling-tag refusal is reported after its readonly server closes. */
export async function requireRegistryPartialCensus(input: {
  session: RegistryMaintenanceSession;
  runtime: RegistryMaintenanceRuntime;
  ports: RegistryJournalPorts;
}): Promise<never> {
  const evidence = input.session.read().maintenanceEvidence;
  // Proof (fixture): removing the evidence refusal reaches modeled fence, census and reporting with no maintenance evidence.
  if (evidence === null) throw new Error('Missing partial census maintenance evidence');
  await input.session.record({ ...evidence, runtime: await input.runtime.fence(input.session) });
  await input.runtime.assertStopped(input.session);
  const identity = await input.runtime.identify(input.session);
  const server = await input.runtime.open(input.session, 'readonly');
  const census = await collectRegistryInventory({
    journal: input.session.read(),
    identity,
    endpoint: server.endpoint,
    consumers: input.ports,
  }).then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  try {
    // Proof (fixture): removing this awaited close reports the partial-state marker before the modeled server closes.
    await server.close();
  } catch (cause) {
    // Proof (fixture): removing preservation returns only the close failure instead of the original census plus cleanup failures.
    if (!census.ok)
      // Boundary: the original census is primary; the caught cleanup/report failure remains in errors[1].
      throw new AggregateError([census.cause, cause], 'Partial census cleanup failed', {
        // eslint-disable-next-line preserve-caught-error
        cause: census.cause,
      });
    throw cause;
  }
  // Proof (fixture): removing the unexpected-success refusal rejects with undefined instead of a required Error.
  if (census.ok) throw new Error('Partial census unexpectedly succeeded');
  // Proof (fixture): each error-shape, aggregate and exact-message removal falsely emits the marker for its unrelated input.
  if (
    census.cause instanceof Error &&
    !(census.cause instanceof AggregateError) &&
    census.cause.message === 'Current tag omits required manifest revision'
  ) {
    try {
      console.error('task8-partial-census:current-tag-without-revision');
    } catch (cause) {
      // Proof (fixture): reporter-preservation removal loses the original census error.
      // Boundary: the original census is primary; the caught cleanup/report failure remains in errors[1].
      throw new AggregateError([census.cause, cause], 'Partial census observation failed', {
        // eslint-disable-next-line preserve-caught-error
        cause: census.cause,
      });
    }
  }
  throw census.cause;
}
