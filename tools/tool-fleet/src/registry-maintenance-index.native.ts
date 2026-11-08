import { readFile, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import { readRegistryGuardDecisions } from './registry-guard-decision.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { readRegistryHttpObservationOutput } from './registry-http-observation.fixture';
import {
  prepareRegistryIndexReaders,
  refreshRegistryIndexHistory,
  RegistryIndexPublication,
} from './registry-index-authority.fixture';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { parseRegistryCommandResponse } from './registry-managed-journal';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryBytes } from './registry-stream';

const home = '/root/task8-fixture';
type RunOwner = (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Actual managed four-index lifecycle with current plus two prior acknowledged
 * promotions (not an independent current-plus-two versus newest-ten witness). Kubernetes and complete consumer/history observations are synthetic;
 * authority, physical census, root backup/delete/GC, and uncached pull stay native.
 * Retirement authority alone advances eight days; upload evidence is never rewritten. Guard cleanup and required diagnostics retain exact sole failures or ordered compound failures with the original cause.
 */
export async function proveRegistryIndexHost(
  run: RunOwner,
  pull: (root: string, configs: readonly string[]) => Promise<void>,
): Promise<void> {
  let stage: 'setup' | 'bootstrap' | 'publish' | 'promote' | 'retire' | 'retained' | 'docker' =
    'setup';
  try {
    const { installed } = await prepareRegistryHostFixture();
    await prepareRegistryIndexReaders(installed);
    await writeFile(home + '/admission', 'fixture', { mode: 0o600 });
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
        throw new Error('Index owner stage failed');
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
    const publications: (typeof RegistryIndexPublication.infer)[] = [];
    const guard = await startRegistryFixtureGuard(installed, {
      signal: new AbortController().signal,
      initialMode: 'readonly',
      interceptPermissionReads: false,
      decisions: true,
    });
    const failures: unknown[] = [];
    try {
      await invoke('index-reopen', 'population-writable-permitted');
      await guard.waitMode('writable');
      stage = 'publish';
      for (const revision of [1, 2, 3, 4]) {
        const published = await run('index-publish-' + String(revision));
        const receipt = readRegistryIndexPublication(revision, published);
        publications.push(receipt);
      }
      await writeFile('/etc/puni/registry-index-publications.json', JSON.stringify(publications), {
        mode: 0o644,
        flag: 'wx',
      });
      stage = 'promote';
      for (const revision of [2, 3, 4]) {
        await invoke('index-promote-' + String(revision), 'index-promoted');
        await refreshRegistryIndexHistory();
      }
      await verifyTags(['release-1', 'release-2', 'release-3', 'release-4']);
    } catch (cause) {
      // Proof: dropping the primary or mistaking a nullish rejection for success fails the actual index caller completion cases.
      failures.push(cause);
    }
    try {
      // Proof: skipping close leaves the real descriptor open and its private completion receipt absent.
      await guard.close();
      // Proof: skipping required parsing admits the empty trace in the isolated actual-caller trace case.
      const observation = readRegistryGuardDecisions(guard.readErrors());
      // Proof: skipping this required report loses the injected valid-report failure instead of refusing continuation.
      console.log(JSON.stringify({ guardDecisions: { valid: true, observation } }));
    } catch (cause) {
      // Proof: dropping cleanup/observation failure permits the next retirement stage in close/trace cases.
      failures.push(cause);
      try {
        console.log(JSON.stringify({ guardDecisions: { valid: false, observation: null } }));
      } catch (reporting) {
        // Proof: dropping required invalid-report failure masks it in the two/three-way completion cases.
        failures.push(reporting);
      }
    }
    // Proof: removing aggregation, reversing members or losing the original cause fails primary+close+report.
    if (failures.length > 1)
      throw new AggregateError(failures, 'Index publication and guard observation failed', {
        cause: failures[0],
      });
    // Proof: removing sole-failure refusal loses exact Error/AggregateError/nullish/string publication rejections.
    if (failures.length === 1) throw failures[0];
    const expired = publications.at(0);
    const current = publications.at(3);
    if (expired === undefined || current === undefined)
      throw new Error('Missing index lifecycle receipts');
    await writeFile(
      '/etc/puni/registry-fixture-retirement-clock.json',
      JSON.stringify({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }),
      { mode: 0o644, flag: 'wx' },
    );
    stage = 'retire';
    await invoke('retire', 'verified-native-retirement');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(installed.journalPath + '/journal.json', 'utf8')),
    } satisfies { state: unknown }).state;
    if (
      journal.schemaVersion !== 4 ||
      journal.maintenance !== null ||
      !journal.fenced ||
      journal.lastVerifiedBackup === null
    )
      throw new Error('Index retirement lacks terminal fenced backup');
    const retired = journal.retirements.find(
      (receipt) => receipt.operationId === 'native-host-retire',
    );
    if (
      retired === undefined ||
      JSON.stringify(retired.operations) !== JSON.stringify([expired.operationId]) ||
      retired.deletions.length !== 3 ||
      retired.deletions.some(
        (deletion) =>
          deletion.repository !== 'retained/index' || !expired.manifests.includes(deletion.digest),
      )
    )
      throw new Error('Index retirement does not bind exact expired closure');
    const history = journal.environments.find(
      (environment) => environment.environment === 'native-index',
    );
    if (
      history === undefined ||
      JSON.stringify(history.releases) !==
        JSON.stringify(
          publications
            .slice(1)
            .reverse()
            .map((publication) => publication.operationId),
        )
    )
      throw new Error('Current and two prior index history changed');
    stage = 'retained';
    const readonly = await startRegistryFixtureGuard(installed);
    try {
      await readonly.waitMode('readonly');
      await verifyTags(['release-2', 'release-3', 'release-4']);
      for (const publication of publications.slice(1)) {
        for (const digest of publication.manifests) await verifyPresent('manifests', digest);
        for (const digest of publication.blobs) await verifyPresent('blobs', digest);
      }
      const retainedDigests = new Set(
        publications
          .slice(1)
          .flatMap((publication) => [...publication.manifests, ...publication.blobs]),
      );
      for (const digest of expired.manifests) await verifyAbsent('manifests', digest);
      for (const digest of expired.blobs)
        if (!retainedDigests.has(digest)) await verifyAbsent('blobs', digest);
      stage = 'docker';
      await pull(current.root, current.blobs);
    } finally {
      await readonly.close();
    }
    console.log(
      JSON.stringify({
        proof: 'managed-index-retained-platforms',
        publications: 4,
        promoted: 3,
        retiredManifests: 3,
        untaggedChildrenRetained: 6,
        sharedLayerRetained: true,
        uncachedDockerPull: true,
        fenceRetained: true,
        synthetic: 'Kubernetes/consumer/history/provider and eight-day retirement authority clock',
      }),
    );
  } catch (cause) {
    const failures: unknown[] = [cause];
    try {
      console.log(
        JSON.stringify({
          indexFailure: { stage, ...describeRegistryGuardObservationFailure(cause) },
        }),
      );
    } catch (reporting) {
      // Proof: dropping outer diagnostic failure or its aggregate masks either member in primary+outer-report.
      failures.push(reporting);
    }
    if (failures.length > 1)
      throw new AggregateError(failures, 'Index lifecycle and reporting failed', { cause });
    throw cause;
  }
}

/** Fixed index fixture response boundary. Emit the existing bounded owner and HTTP observations before rejecting failure; absent or unfinished HTTP evidence cannot certify a successful owner. */
export function readRegistryIndexPublication(
  revision: number,
  published: Awaited<ReturnType<RunOwner>>,
  emit: (serialized: string) => void = console.log,
): typeof RegistryIndexPublication.infer {
  if (published.code !== 0) {
    emit(
      JSON.stringify({
        indexOwnerFailure: {
          mode: 'index-publish-' + String(revision),
          observation: observeRegistryPopulationOutput(published.stderr),
        },
      }),
    );
  }
  const http = readRegistryHttpObservationOutput(published.stderr);
  // Proof (fixture only): removing emission loses the required record on both successful and failed modeled owners.
  emit(JSON.stringify({ indexPublicationHttp: { revision, ...http } }));
  // Proof (fixture only): removing this refusal accepts failed owner output containing an otherwise valid receipt.
  if (published.code !== 0) throw new Error('Managed index publication failed');
  // Proof (fixture only): whole-check removal accepts absent HTTP evidence; pending-term removal separately accepts an unfinished request.
  if (http.state !== 'valid' || http.observation?.pending !== 0)
    throw new Error('Index HTTP observation is incomplete');
  const receipt = RegistryIndexPublication.assert(JSON.parse(published.stdout));
  if (receipt.revision !== revision) throw new Error('Index publication revision differs');
  return receipt;
}

async function request(path: string) {
  return fetch('http://127.0.0.1:5052/v2/retained/index/' + path, {
    headers: {
      accept: 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json',
      'cache-control': 'no-cache',
    },
    signal: AbortSignal.timeout(5000),
  });
}
export async function verifyTags(expected: string[]) {
  const response = await request('tags/list');
  const listing = type({ name: "'retained/index'", tags: 'string[]', '+': 'reject' }).assert(
    JSON.parse(
      new TextDecoder().decode(await readRegistryBytes(response.body, 4096, 'Owned index tags')),
    ),
  );
  if (response.status !== 200 || JSON.stringify(listing.tags.sort()) !== JSON.stringify(expected))
    throw new Error('Index tags include untracked or missing revisions');
}
export async function verifyPresent(kind: 'manifests' | 'blobs', digest: string) {
  const response = await request(kind + '/' + digest);
  const bytes = await readRegistryBytes(response.body, 65536, 'Owned retained index content');
  const { createHash } = await import('node:crypto');
  if (
    response.status !== 200 ||
    response.headers.get('docker-content-digest') !== digest ||
    'sha256:' + createHash('sha256').update(bytes).digest('hex') !== digest
  )
    throw new Error('Retained index content is absent or corrupt');
}
export async function verifyAbsent(kind: 'manifests' | 'blobs', digest: string) {
  const response = await request(kind + '/' + digest);
  const refusal = type({
    errors: type({ code: "'MANIFEST_UNKNOWN'|'BLOB_UNKNOWN'" }).array().exactlyLength(1),
  }).assert(
    JSON.parse(
      new TextDecoder().decode(
        await readRegistryBytes(response.body, 4096, 'Owned removed index content'),
      ),
    ),
  );
  if (
    response.status !== 404 ||
    refusal.errors[0]?.code !== (kind === 'manifests' ? 'MANIFEST_UNKNOWN' : 'BLOB_UNKNOWN')
  )
    throw new Error('Expired index content remains');
}
