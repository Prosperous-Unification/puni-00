import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { readRegistryHttpObservationOutput } from './registry-http-observation.fixture';
import {
  prepareRegistryIndexReaders,
  refreshRegistryIndexHistory,
} from './registry-index-authority.fixture';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { parseRegistryCommandResponse } from './registry-managed-journal';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { RegistrySharedPublication } from './registry-shared-root.fixture';
import { readRegistryBytes } from './registry-stream';

type RunOwner = (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>;
type SharedTier = (typeof RegistrySharedPublication.infer)['tiers'][number];

/** Select only the two fixed shared-root retirement operations; every other mode remains outside this fixture branch. */
export function selectRegistrySharedRetirement(mode: string) {
  // Proof: swapped/missing selections fail the three fixed shared-owner dispatcher cases.
  return mode === 'shared-retire-first'
    ? 'native-shared-retire-first'
    : mode === 'shared-retire-second'
      ? 'native-shared-retire-second'
      : undefined;
}

/** Two actual partially retired bundles retain common root A, then a real capability release permits a separate fresh retirement of A. Only the post-publication authority clock advances eight days; original upload/promotion evidence stays untouched. Kubernetes/readers/provider admission remain synthetic. */
export async function proveRegistrySharedHost(run: RunOwner): Promise<void> {
  let stage: 'setup' | 'bootstrap' | 'publish' | 'promote' | 'retire' | 'retained' = 'setup';
  try {
    const { installed } = await prepareRegistryHostFixture();
    await prepareRegistryIndexReaders(installed);
    await writeFile('/root/task8-fixture/admission', 'fixture', { mode: 0o600 });
    const invoke = async (mode: string, expected: string) => {
      const completed = await run(mode);
      if (completed.code !== 0 || completed.stdout.trim() !== expected) {
        console.log(
          JSON.stringify({
            indexOwnerFailure: {
              mode,
              observation: observeRegistryPopulationOutput(completed.stderr),
            },
          }),
        );
        throw new Error('Shared owner stage failed');
      }
    };
    stage = 'bootstrap';
    await invoke('initialize', 'initialized');
    await invoke('backup', 'verified-native-backup');
    await writeFile(
      '/etc/puni/ordinary-writer.json',
      JSON.stringify({
        version: 0.1,
        log: { level: 'error' },
        storage: {
          filesystem: { rootdirectory: installed.ordinary.path },
          delete: { enabled: false },
          maintenance: { uploadpurging: { enabled: false } },
        },
        http: { addr: '127.0.0.1:5052', secret: 'owned-native-seed' },
      }),
      { mode: 0o644, flag: 'wx' },
    );
    const publications: (typeof RegistrySharedPublication.infer)[] = [];
    const guard = await startRegistryFixtureGuard(installed, {
      signal: new AbortController().signal,
      initialMode: 'readonly',
      interceptPermissionReads: false,
    });
    try {
      await invoke('index-reopen', 'population-writable-permitted');
      await guard.waitMode('writable');
      stage = 'publish';
      for (const release of ['old-one', 'old-two', 'current'] as const) {
        const published = await run('shared-publish-' + release);
        if (published.code !== 0)
          console.log(
            JSON.stringify({
              indexOwnerFailure: {
                mode: 'shared-publish-' + release,
                observation: observeRegistryPopulationOutput(published.stderr),
              },
            }),
          );
        const http = readRegistryHttpObservationOutput(published.stderr);
        console.log(JSON.stringify({ sharedPublicationHttp: { release, ...http } }));
        if (published.code !== 0 || http.state !== 'valid' || http.observation?.pending !== 0)
          throw new Error('Shared publication lacks successful complete HTTP evidence');
        const receipt = RegistrySharedPublication.assert(JSON.parse(published.stdout));
        if (receipt.release !== release) throw new Error('Shared publication identity differs');
        publications.push(receipt);
      }
      await writeFile('/etc/puni/registry-shared-publications.json', JSON.stringify(publications), {
        mode: 0o644,
        flag: 'wx',
      });
      stage = 'promote';
      await invoke('shared-protect', 'shared-current-promoted-and-root-protected');
      await refreshRegistryIndexHistory();
    } finally {
      await guard.close();
    }
    const first = publications.at(0),
      second = publications.at(1),
      current = publications.at(2);
    const common = first?.tiers.find((tier) => tier.repository === 'retained/common');
    const secondCommon = second?.tiers.find((tier) => tier.repository === 'retained/common');
    const uniques = [first, second].flatMap(
      (publication) =>
        publication?.tiers.filter((tier) => tier.repository === 'retained/unique') ?? [],
    );
    const retained = current?.tiers[0];
    if (
      first === undefined ||
      second === undefined ||
      current === undefined ||
      common === undefined ||
      retained === undefined ||
      uniques.length !== 2 ||
      secondCommon?.root !== common.root ||
      retained.repository !== 'retained/current'
    )
      throw new Error('Shared fixture lacks exact three original bundles');
    const readJournal = async () =>
      parseRegistryCommandResponse({
        state: JSON.parse(await readFile(installed.journalPath + '/journal.json', 'utf8')),
      } satisfies { state: unknown }).state;
    const before = await readJournal();
    if (
      before.bundles.length !== 3 ||
      before.publication !== null ||
      before.reservations.length !== 0
    )
      throw new Error('Shared fixture publication setup is incomplete');
    // Each separate owner instance starts at its supplied stamp; refresh only after the previous owner is terminal, preserving one advancing synthetic timeline.
    const advanceClock = () =>
      writeFile(
        '/etc/puni/registry-fixture-retirement-clock.json',
        JSON.stringify({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }),
        { mode: 0o644 },
      );
    let firstSnapshot: string | undefined;
    for (const epoch of ['first', 'second'] as const) {
      stage = 'retire';
      await advanceClock();
      await invoke('shared-retire-' + epoch, 'verified-native-retirement');
      const after = await readJournal();
      if (
        after.schemaVersion !== 4 ||
        after.maintenance !== null ||
        !after.fenced ||
        after.lastVerifiedBackup === null
      )
        throw new Error('Shared retirement lacks terminal verified fenced backup');
      if (
        JSON.stringify(after.bundles) !== JSON.stringify(before.bundles) ||
        JSON.stringify(after.environments) !== JSON.stringify(before.environments)
      )
        throw new Error('Shared retirement rewrote original provenance');
      const expected = epoch === 'first' ? uniques : [common];
      const retirement = after.retirements.find(
        (receipt) => receipt.operationId === 'native-shared-retire-' + epoch,
      );
      const revisions = expected
        .flatMap((tier) =>
          tier.manifests.map((digest) => ({ repository: tier.repository, digest })),
        )
        .sort(
          (a, b) => a.repository.localeCompare(b.repository) || a.digest.localeCompare(b.digest),
        );
      if (
        retirement === undefined ||
        JSON.stringify(retirement.operations.slice().sort()) !==
          JSON.stringify([first.operationId, second.operationId].sort()) ||
        JSON.stringify(
          retirement.deletions.map(({ repository, digest }) => ({ repository, digest })),
        ) !== JSON.stringify(revisions) ||
        retirement.snapshotId !== after.lastVerifiedBackup.snapshotId
      )
        throw new Error('Shared retirement does not bind exact fresh closure and original owners');
      if (epoch === 'first') firstSnapshot = retirement.snapshotId;
      else if (
        firstSnapshot === undefined ||
        firstSnapshot === retirement.snapshotId ||
        after.retirements.length !== 2
      )
        throw new Error('Second retirement reused earlier backup or lineage');
      stage = 'retained';
      const readonly = await startRegistryFixtureGuard(installed);
      try {
        await readonly.waitMode('readonly');
        await verifySharedTier(retained, true);
        await verifySharedTier(common, epoch === 'first');
        for (const tier of uniques) await verifySharedTier(tier, false);
        const surviving = new Set(
          [retained, ...(epoch === 'first' ? [common] : [])].flatMap((tier) => tier.blobs),
        );
        for (const tier of [...uniques, ...(epoch === 'second' ? [common] : [])])
          for (const digest of tier.blobs)
            if (!surviving.has(digest))
              await verifySharedContent(tier.repository, 'blobs', digest, false);
      } finally {
        await readonly.close();
      }
      console.log(
        JSON.stringify({
          sharedRetirement: {
            epoch,
            retiredRoots: epoch === 'first' ? 2 : 1,
            retiredManifests: revisions.length,
            originalOperations: 2,
            freshBackup: true,
            originalProvenanceUnchanged: true,
            currentRetained: true,
            sharedRootRetained: epoch === 'first',
          },
        }),
      );
      if (epoch === 'first') {
        await advanceClock();
        await invoke('shared-release', 'shared-root-protection-released');
      }
    }
    console.log(
      JSON.stringify({
        proof: 'managed-shared-root-repeat',
        publications: 3,
        retirementEpochs: 2,
        firstUniqueRoots: 2,
        secondResidualSharedRoot: 1,
        originalProvenanceUnchanged: true,
        currentAndSharedLayerRetained: true,
        clockScope:
          'eight-day synthetic post-publication authority time for both retirements and intervening protection release; original uploads/promotion/acquisition real',
        synthetic: 'Kubernetes/complete readers/local provider admission',
      }),
    );
  } catch (cause) {
    console.log(
      JSON.stringify({
        indexFailure: { stage, ...describeRegistryGuardObservationFailure(cause) },
      }),
    );
    throw cause;
  }
}

async function verifySharedTier(tier: SharedTier, present: boolean) {
  const response = await fetch('http://127.0.0.1:5052/v2/' + tier.repository + '/tags/list', {
    signal: AbortSignal.timeout(5000),
  });
  requireRegistrySharedTags(
    response.status,
    JSON.parse(
      new TextDecoder().decode(await readRegistryBytes(response.body, 4096, 'Shared tags')),
    ),
    tier.repository,
    present ? [tier.reference] : [],
  );
  for (const digest of tier.manifests)
    await verifySharedContent(tier.repository, 'manifests', digest, present);
  if (present)
    for (const digest of tier.blobs)
      await verifySharedContent(tier.repository, 'blobs', digest, true);
}
async function verifySharedContent(
  repository: string,
  kind: 'manifests' | 'blobs',
  digest: string,
  present: boolean,
) {
  const response = await fetch(
    'http://127.0.0.1:5052/v2/' + repository + '/' + kind + '/' + digest,
    {
      headers: {
        accept:
          'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json',
        'cache-control': 'no-cache',
      },
      signal: AbortSignal.timeout(5000),
    },
  );
  const bytes = await readRegistryBytes(response.body, 65536, 'Shared content');
  if (present) {
    if (
      response.status !== 200 ||
      response.headers.get('docker-content-digest') !== digest ||
      'sha256:' + createHash('sha256').update(bytes).digest('hex') !== digest
    )
      throw new Error('Shared retained bytes differ');
  } else {
    const failure = type({
      errors: type({ code: 'string', message: 'string', 'detail?': 'unknown' })
        .array()
        .atLeastLength(1),
    }).assert(JSON.parse(new TextDecoder().decode(bytes)));
    if (
      response.status !== 404 ||
      failure.errors.some(
        (error) => error.code !== (kind === 'manifests' ? 'MANIFEST_UNKNOWN' : 'BLOB_UNKNOWN'),
      )
    )
      throw new Error('Shared retired content absence is unproved');
  }
}

/** Exact pinned tags/list boundary: absent fields/errors never stand in for an empty repository, and retained tiers require their real tag. */
export function requireRegistrySharedTags(
  status: number,
  parsed: unknown,
  repository: SharedTier['repository'],
  expected: readonly string[],
): void {
  // Proof (fixture boundary): removing strict schema, status, name, or exact expected tags makes the null-tags test accept an extra field, HTTP404, foreign repository, or missing retained tag respectively.
  const listing = type({ name: 'string', tags: 'string[]|null', '+': 'reject' }).assert(parsed);
  if (
    status !== 200 ||
    listing.name !== repository ||
    JSON.stringify(listing.tags === null ? [] : listing.tags.sort()) !== JSON.stringify(expected)
  )
    throw new Error('Shared tags differ from exact retained tier');
}
