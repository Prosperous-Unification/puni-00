import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { afterEach, expect, it } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { settleRegistryClientFixture } from './registry-client-completion.fixture';
import { registryHistorySha256 } from './registry-history';
import {
  assertRegistryPlan,
  collectRegistryInventory,
  planRegistryRetirement,
} from './registry-inventory';
import { maintainRegistry, type RegistryMaintenanceRuntime } from './registry-maintenance';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryConsumerReport,
  type RegistryJournal,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import { discardRegistryUploads, readRegistryUpload } from './registry-upload-census';
const hash = (bytes: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const imageType = 'application/vnd.oci.image.manifest.v1+json';
const indexType = 'application/vnd.oci.image.index.v1+json';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const directory = await scratchAsync('registry-inventory-');
  const base = join(directory, 'docker/registry/v2');
  const contents = new Map<string, string>();
  const revisions = new Map<string, Map<string, string>>();
  const tags = new Map<string, Map<string, string>>();
  const put = async (path: string, bytes: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  };
  const blobPath = (digest: string) =>
    join(base, 'blobs/sha256', digest.slice(7, 9), digest.slice(7), 'data');
  const revisionPath = (repository: string, digest: string) =>
    join(base, 'repositories', repository, '_manifests/revisions/sha256', digest.slice(7), 'link');
  const layerPath = (repository: string, digest: string) =>
    join(base, 'repositories', repository, '_layers/sha256', digest.slice(7), 'link');
  const blob = async (bytes: string) => {
    const digest = hash(bytes);
    contents.set(digest, bytes);
    await put(blobPath(digest), bytes);
    return {
      digest,
      size: Buffer.byteLength(bytes),
      mediaType: 'application/vnd.oci.image.layer.v1.tar',
    };
  };
  const layer = await blob('shared layer');
  const config = { ...(await blob('{}')), mediaType: 'application/vnd.oci.image.config.v1+json' };
  const manifest = async (repository: string, value: unknown, tag?: string) => {
    const bytes = JSON.stringify(value);
    const descriptor = await blob(bytes);
    const repositoryRevisions = revisions.get(repository) ?? new Map<string, string>();
    repositoryRevisions.set(descriptor.digest, bytes);
    revisions.set(repository, repositoryRevisions);
    await put(revisionPath(repository, descriptor.digest), descriptor.digest);
    for (const dependency of [config, layer])
      await put(layerPath(repository, dependency.digest), dependency.digest);
    if (tag !== undefined) {
      const repositoryTags = tags.get(repository) ?? new Map<string, string>();
      repositoryTags.set(tag, descriptor.digest);
      tags.set(repository, repositoryTags);
      await put(
        join(base, 'repositories', repository, '_manifests/tags', tag, 'current/link'),
        descriptor.digest,
      );
      await put(
        join(
          base,
          'repositories',
          repository,
          '_manifests/tags',
          tag,
          'index/sha256',
          descriptor.digest.slice(7),
          'link',
        ),
        descriptor.digest,
      );
    }
    return {
      ...descriptor,
      mediaType: (
        value as {
          mediaType: string;
        }
      ).mediaType,
    };
  };
  const child = await manifest('kept/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config,
    layers: [layer],
  });
  const index = await manifest(
    'kept/image',
    { schemaVersion: 2, mediaType: indexType, manifests: [child] },
    'current',
  );
  const old = await manifest(
    'old/image',
    {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
      annotations: { release: 'old' },
    },
    'old',
  );
  let fault = '';
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (fault === 'storage-drift' && url.pathname === '/v2/_catalog')
        await put(blobPath(hash('neworphan')), 'neworphan');
      if (url.pathname === '/v2/_catalog' && fault === 'valid-pagination') {
        return url.searchParams.has('last')
          ? Response.json({ repositories: ['old/image'] })
          : Response.json(
              { repositories: ['kept/image'] },
              { headers: { link: '</v2/_catalog?n=1&last=kept%2Fimage>; rel="next"' } },
            );
      }
      if (url.pathname === '/v2/_catalog')
        return Response.json(
          { repositories: fault === 'catalog' ? ['kept/image'] : [...revisions.keys()].sort() },
          fault === 'pagination' ? { headers: { link: '</v2/_catalog?n=1>; rel="next"' } } : {},
        );
      const route = /^\/v2\/(.+)\/(tags\/list|manifests\/(.+)|blobs\/(.+))$/.exec(url.pathname);
      if (route === null) return new Response('', { status: 404 });
      const repository = route[1];
      if (route[2] === 'tags/list')
        return Response.json({
          name: repository,
          tags: fault === 'tags' ? [] : [...(tags.get(repository)?.keys() ?? [])].sort(),
        });
      const manifestReference = route.at(3);
      const reference = manifestReference ?? route[4];
      const digest = tags.get(repository)?.get(reference) ?? reference;
      if (
        request.method === 'DELETE' &&
        manifestReference !== undefined &&
        revisions.get(repository)?.has(digest)
      ) {
        await rm(dirname(revisionPath(repository, digest)), { recursive: true });
        revisions.get(repository)?.delete(digest);
        for (const [tag, tagged] of tags.get(repository) ?? []) {
          if (tagged !== digest) continue;
          await rm(join(base, 'repositories', repository, '_manifests/tags', tag), {
            recursive: true,
          });
          tags.get(repository)?.delete(tag);
        }
        return new Response(null, { status: 202 });
      }
      const bytes =
        manifestReference === undefined
          ? contents.get(digest)
          : revisions.get(repository)?.get(digest);
      if (bytes === undefined || (fault === 'child-api' && digest === child.digest))
        return new Response('', { status: 404 });
      return new Response(
        (fault === 'api-corrupt' && !reference.startsWith('sha256:')) ||
          (fault === 'revision-corrupt' && reference.startsWith('sha256:'))
          ? 'corrupt'
          : bytes,
        {
          headers: {
            'content-type':
              manifestReference === undefined
                ? 'application/octet-stream'
                : (
                    JSON.parse(bytes) as {
                      mediaType: string;
                    }
                  ).mediaType,
            'docker-content-digest': digest,
          },
        },
      );
    },
  });
  cleanups.push(async () => {
    await server.stop(true);
  });
  const identity = {
    registryId: 'proof',
    storageId: 'proof',
    node: 'fixture',
    pvcUid: 'owned',
    mountIdentity: 'owned',
    distributionDigest: 'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
    binarySha256: '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37',
  };
  const journal: RegistryJournal = {
    schemaVersion: 3,
    revision: 2,
    updatedAt: '2026-10-01T00:00:00.000Z',
    fenced: false,
    fenceReason: null,
    maintenanceVerified: false,
    measurement: null,
    enrollment: {
      registryId: 'proof',
      storageId: 'proof',
      registryPath: directory,
      rootPath: '/',
      maximumBytes: 1024 ** 3,
      journalMaximumBytes: 1024 ** 3,
      owners: ['owner'],
    },
    protections: [
      {
        operationId: 'pin',
        owner: 'owner',
        token: '00000000-0000-4000-8000-000000000001',
        reason: 'keep',
        roots: [index.digest],
        references: [{ repository: 'kept/image', digest: index.digest }],
      },
    ],
    bundles: [
      {
        operationId: 'old',
        owner: 'owner',
        product: 'old',
        roots: [old.digest],
        references: [{ repository: 'old/image', digest: old.digest }],
        receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' },
      },
    ],
    reservations: [],
    publication: null,
    maintenance: null,
    closedOperations: [],
    environments: [],
    deployments: [],
    consumers: [
      {
        id: 'host',
        owner: 'owner',
        environment: null,
        kind: 'docker-host',
        source: '/owned/host.json',
        configurationSha256: 'a'.repeat(64),
        role: 'consumer',
      },
    ],
  };
  const reports: RegistryConsumerReport[] = [
    {
      id: 'host',
      source: '/owned/host.json',
      role: 'consumer',
      revision: 2,
      sourceRevision: 'actual',
      references: [],
    },
  ];
  const collect = () =>
    collectRegistryInventory({
      journal,
      identity,
      endpoint: { url: server.url.toString().replace(/\/$/, '') },
      consumers: {
        verifyConsumers: () => Promise.resolve(),
        collectConsumers: () => Promise.resolve(reports),
      },
    });
  const capacity = {
    maximumBytes: 1024 ** 3,
    usableBytes: 1024 ** 3,
    usedBytes: 100000,
    totalInodes: 10000,
    usedInodes: 100,
    rootFreeBytes: 30 * 1024 ** 3,
  };
  const plan = async () =>
    planRegistryRetirement(await collect(), {
      now: '2026-10-25T00:00:00.000Z',
      mode: 'nightly',
      capacity,
    });
  return {
    endpoint: { url: server.url.toString() },
    directory,
    base,
    contents,
    revisions,
    tags,
    put,
    blobPath,
    revisionPath,
    layerPath,
    manifest,
    layer,
    config,
    child,
    index,
    old,
    journal,
    reports,
    identity,
    collect,
    plan,
    capacity,
    setFault: (value: string) => {
      fault = value;
    },
  };
}
it('keeps untagged child of protected index', async () => {
  const proof = await fixture();
  const plan = await proof.plan();
  expect(plan.retireRevisions).toEqual([{ repository: 'old/image', digest: proof.old.digest }]);
  expect(plan.retireBlobs).toEqual([proof.old.digest]);
});
it('retains shared layer across repositories', async () => {
  const proof = await fixture();
  const inventory = await proof.collect();
  expect(inventory.graph.nodes.filter((node) => node.digest === proof.layer.digest)).toHaveLength(
    1,
  );
  expect((await proof.plan()).retireBlobs).not.toContain(proof.layer.digest);
});
it('unknown stored revision blocks retirement', async () => {
  const proof = await fixture();
  await proof.manifest('foreign/image', JSON.parse(proof.contents.get(proof.child.digest)!));
  await requireRefusal(proof.plan(), 'Unknown stored revision');
});
it('unsupported referrer blocks retirement', async () => {
  const proof = await fixture();
  const referrer = await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: proof.config,
    layers: [],
    subject: proof.child,
  });
  proof.journal.bundles[0].roots.push(referrer.digest);
  proof.journal.bundles[0].references.push({ repository: 'old/image', digest: referrer.digest });
  await requireRefusal(proof.collect(), 'Unsupported');
});
it.each(['catalog', 'tags', 'pagination', 'child-api', 'api-corrupt', 'revision-corrupt'])(
  'refuses incomplete or contradictory API census: %s',
  async (fault) => {
    const proof = await fixture();
    proof.setFault(fault);
    await requireRefusal(proof.collect());
  },
);
it('refuses omitted child manifest revision', async () => {
  const proof = await fixture();
  await unlink(proof.revisionPath('kept/image', proof.child.digest));
  await requireRefusal(proof.collect(), 'Missing child manifest revision');
});
it('refuses unreadable revision tree independently of catalog', async () => {
  const proof = await fixture();
  const path = join(proof.base, 'repositories/kept/image/_manifests/revisions');
  await chmod(path, 0);
  cleanups.push(() => chmod(path, 0o755));
  await requireRefusal(proof.collect());
});
it('refuses same-length physical layer corruption', async () => {
  const proof = await fixture();
  await writeFile(proof.blobPath(proof.layer.digest), 'broken layer');
  await requireRefusal(proof.collect(), 'digest');
});
it('refuses a missing required layer link', async () => {
  const proof = await fixture();
  await rm(dirname(proof.layerPath('old/image', proof.layer.digest)), { recursive: true });
  await requireRefusal(proof.collect(), 'Missing required repository layer link');
});
it('stale plan cannot execute with an unverified replacement census', async () => {
  const proof = await fixture();
  const plan = await proof.plan();
  assertRegistryPlan(plan, await proof.collect());
  expect(() => {
    assertRegistryPlan(plan, {} as never);
  }).toThrow('Stale');
});
it('stale plan cannot execute after changed node identity', async () => {
  const proof = await fixture();
  const plan = await proof.plan();
  proof.identity.node = 'replacement';
  const changed = await proof.collect();
  expect(() => {
    assertRegistryPlan(plan, changed);
  }).toThrow('Stale');
});
it('stale plan cannot execute after changed protection roots', async () => {
  const proof = await fixture();
  const plan = await proof.plan();
  proof.journal.protections[0].roots.push(proof.old.digest);
  proof.journal.protections[0].references.push({
    repository: 'old/image',
    digest: proof.old.digest,
  });
  const changed = await proof.collect();
  expect(() => {
    assertRegistryPlan(plan, changed);
  }).toThrow('Stale');
});
it('consumer roots protect exact repository revisions including history recovery references', async () => {
  const proof = await fixture();
  proof.reports[0].references = [{ repository: 'old/image', digest: proof.old.digest }];
  expect((await proof.plan()).retireRevisions).toEqual([]);
});
it('allows validated obsolete metadata and lists verified orphan content without inventing roots', async () => {
  const proof = await fixture();
  const obsolete = hash('obsolete');
  await proof.put(
    join(
      proof.base,
      'repositories/old/image/_manifests/tags/old/index/sha256',
      obsolete.slice(7),
      'link',
    ),
    obsolete,
  );
  await proof.put(proof.layerPath('old/image', obsolete), obsolete);
  const orphan = hash('orphan');
  await proof.put(proof.blobPath(orphan), 'orphan');
  const inventory = await proof.collect();
  expect(inventory.orphanBlobs).toContain(orphan);
  expect(inventory.graph.nodes.some((node) => node.digest === orphan)).toBe(false);
  await requireRefusal(proof.plan(), 'Unowned orphan');
});
it('retires a repository revision while the identical manifest remains required in another repository', async () => {
  const proof = await fixture();
  const alias = await proof.manifest(
    'old/image',
    JSON.parse(proof.contents.get(proof.child.digest)!),
  );
  proof.journal.bundles[0].roots.push(alias.digest);
  proof.journal.bundles[0].references.push({ repository: 'old/image', digest: alias.digest });
  const plan = await proof.plan();
  expect(plan.retireRevisions).toContainEqual({ repository: 'old/image', digest: alias.digest });
  expect(plan.retireBlobs).not.toContain(alias.digest);
});
it('refuses a mutated previously verified inventory', async () => {
  const proof = await fixture();
  const inventory = await proof.collect();
  inventory.graph.nodes[0].bytes = 0;
  expect(() =>
    planRegistryRetirement(inventory, {
      now: '2026-10-25T00:00:00.000Z',
      mode: 'nightly',
      capacity: proof.capacity,
    }),
  ).toThrow('Unverified');
});
it.each(['registryId', 'storageId', 'distributionDigest', 'binarySha256'])(
  'refuses malformed or foreign identity: %s',
  async (field) => {
    const proof = await fixture();
    Reflect.set(
      proof.identity,
      field,
      field === 'distributionDigest' ? `sha256:${'f'.repeat(64)}` : 'foreign',
    );
    await requireRefusal(proof.collect(), 'identity');
  },
);
it('refuses absent and stale consumer evidence', async () => {
  const proof = await fixture();
  proof.reports[0].revision = 1;
  await requireRefusal(proof.collect(), 'consumer');
  proof.reports.length = 0;
  await requireRefusal(proof.collect(), 'consumer');
});
it('refuses malformed links, missing current targets and unknown storage shapes', async () => {
  const proof = await fixture();
  const link = proof.revisionPath('old/image', proof.old.digest);
  const bytes = await readFile(link);
  await writeFile(link, proof.child.digest);
  await requireRefusal(proof.collect(), 'link digest');
  await writeFile(link, bytes);
  await proof.put(
    join(proof.base, 'repositories/old/image/_manifests/tags/old/current/link'),
    hash('missing'),
  );
  await requireRefusal(proof.collect(), 'Current tag');
  await proof.put(
    join(proof.base, 'repositories/old/image/_manifests/tags/old/current/link'),
    proof.old.digest,
  );
  await proof.put(join(proof.base, 'unknown'), 'unknown');
  await requireRefusal(proof.collect(), 'Unknown registry storage');
});
it('refuses missing dependency blobs and unsupported descriptors', async () => {
  const proof = await fixture();
  await rm(dirname(proof.blobPath(proof.layer.digest)), { recursive: true });
  await requireRefusal(proof.collect(), 'dependency');
  await proof.put(proof.blobPath(proof.layer.digest), 'shared layer');
  await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: proof.config,
    layers: [{ ...proof.layer, mediaType: 'foreign/type' }],
  });
  await requireRefusal(proof.collect(), 'Unsupported');
});
async function requireRefusal(pending: Promise<unknown>, message = '') {
  const failure = await pending.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain(message);
}
function addHistory(proof: Awaited<ReturnType<typeof fixture>>) {
  proof.journal.environments.push({
    environment: 'first',
    owner: 'owner',
    product: 'old',
    protectionId: 'environment',
    enrolledAt: '2026-10-01T00:00:00.000Z',
    genesisAt: '2026-10-01T00:00:00.000Z',
    retiredAt: null,
    releases: [],
  });
  for (const role of ['history', 'consumer'] as const) {
    proof.journal.consumers.push({
      id: role,
      owner: 'owner',
      environment: 'first',
      kind: 'private-product',
      source: `/owned/${role}.json`,
      configurationSha256: 'a'.repeat(64),
      role,
    });
    proof.reports.push({
      id: role,
      source: `/owned/${role}.json`,
      role,
      revision: 2,
      sourceRevision: 'actual',
      references: [],
      ...(role === 'history'
        ? {
            history: { state: 'first-install' as const, at: '2026-10-01T00:00:00.000Z' },
            historySha256: registryHistorySha256([]),
            currentReferences: [],
          }
        : {}),
    });
  }
  return proof.reports[1];
}
it('keeps recovery roots from history reports and rejects contradictory current evidence', async () => {
  const proof = await fixture();
  const history = addHistory(proof);
  history.references = [{ repository: 'old/image', digest: proof.old.digest }];
  expect((await proof.plan()).retireRevisions).toEqual([]);
  history.currentReferences = history.references;
  await requireRefusal(proof.collect(), 'current');
});
it('refuses incomplete active environment history and actual consumer coverage', async () => {
  const proof = await fixture();
  const history = addHistory(proof);
  history.historySha256 = 'b'.repeat(64);
  await requireRefusal(proof.collect(), 'history');
  history.historySha256 = registryHistorySha256([]);
  proof.journal.consumers.pop();
  proof.reports.pop();
  await requireRefusal(proof.collect(), 'actual');
});
it('refuses conflicting media types for shared content', async () => {
  const proof = await fixture();
  const conflict = await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: { ...proof.child, mediaType: 'application/vnd.oci.image.config.v1+json' },
    layers: [],
  });
  proof.journal.bundles[0].roots.push(conflict.digest);
  proof.journal.bundles[0].references.push({ repository: 'old/image', digest: conflict.digest });
  await proof.put(proof.layerPath('old/image', proof.child.digest), proof.child.digest);
  await requireRefusal(proof.collect(), 'Contradictory');
});
it('refuses a symlinked registry layout ancestor', async () => {
  const proof = await fixture();
  await rename(join(proof.directory, 'docker'), join(proof.directory, 'moved'));
  await symlink(join(proof.directory, 'moved'), join(proof.directory, 'docker'));
  await requireRefusal(proof.collect(), 'directory');
});
it('follows complete same-collection pagination and accepts capacity heartbeats without revision churn', async () => {
  const proof = await fixture();
  proof.setFault('valid-pagination');
  const plan = await proof.plan();
  proof.journal.updatedAt = '2026-10-25T00:00:00.000Z';
  assertRegistryPlan(plan, await proof.collect());
  proof.journal.revision++;
  proof.reports[0].revision++;
  const fresh = await proof.collect();
  expect(() => {
    assertRegistryPlan(plan, fresh);
  }).toThrow('Stale');
});
it('refuses descriptor size disagreement in an owned manifest', async () => {
  const proof = await fixture();
  const changed = await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: proof.config,
    layers: [{ ...proof.layer, size: proof.layer.size + 1 }],
  });
  proof.journal.bundles[0].roots.push(changed.digest);
  proof.journal.bundles[0].references.push({ repository: 'old/image', digest: changed.digest });
  await requireRefusal(proof.collect(), 'dependency');
});
it('refuses unsupported index children', async () => {
  const proof = await fixture();
  await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: indexType,
    manifests: [{ ...proof.child, mediaType: 'foreign/type' }],
  });
  await requireRefusal(proof.collect(), 'Unsupported');
});
it('refuses storage drift between the independent physical passes', async () => {
  const proof = await fixture();
  proof.setFault('storage-drift');
  await requireRefusal(proof.collect(), 'changed during census');
});
it('refuses missing and unreadable revision metadata as distinct physical faults', async () => {
  const proof = await fixture();
  const path = proof.revisionPath('old/image', proof.old.digest);
  await chmod(path, 0);
  cleanups.push(() => chmod(path, 0o644));
  await requireRefusal(proof.collect(), 'EACCES');
  await chmod(path, 0o644);
  await rm(join(proof.base, 'repositories/old/image/_manifests/revisions'), { recursive: true });
  await requireRefusal(proof.collect(), 'Current tag');
  cleanups.pop();
});
it('refuses oversized links, symlink leaves and unknown empty storage directories', async () => {
  const proof = await fixture();
  const path = proof.revisionPath('old/image', proof.old.digest);
  await writeFile(path, proof.old.digest + '\n');
  await requireRefusal(proof.collect(), 'Invalid registry file');
  await unlink(path);
  await symlink(proof.blobPath(proof.old.digest), path);
  await requireRefusal(proof.collect(), 'Unknown registry storage entry');
  await unlink(path);
  await writeFile(path, proof.old.digest);
  await mkdir(join(proof.base, 'unexpected'));
  await requireRefusal(proof.collect(), 'Unknown or incomplete');
});
it('refuses unresolved upload staging and incomplete image relationships', async () => {
  const proof = await fixture();
  const staging = join(
    proof.base,
    'repositories/old/image/_uploads/00000000-0000-4000-8000-000000000099/startedat',
  );
  await proof.put(staging, '2026-10-25');
  await requireRefusal(proof.collect(), 'Unowned registry upload');
  await rm(dirname(staging), { recursive: true });
  await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: proof.config,
  });
  await requireRefusal(proof.collect(), 'Unsupported registry image');
});
it('verified retirement receipts permit repeated census without erasing original bundle provenance', async () => {
  const run = await fixture();
  const provenance = structuredClone(run.journal.bundles);
  Object.assign(run.journal, {
    schemaVersion: 4,
    publicationEvidence: [],
    maintenanceEvidence: null,
    lastVerifiedBackup: null,
    closedOperations: ['maintenance-old'],
    retirements: [
      {
        operationId: 'maintenance-old',
        operations: ['old'],
        planSha256: 'a'.repeat(64),
        retireBlobs: [run.old.digest],
        neverUploaded: [],
        uploadsSha256: 'c'.repeat(64),
        snapshotId: 'b'.repeat(64),
        at: '2026-10-25T00:00:00.000Z',
        deletions: [{ repository: 'old/image', digest: run.old.digest, tags: ['old'] }],
      },
    ],
  });
  await unlink(run.revisionPath('old/image', run.old.digest));
  await rm(join(run.base, 'repositories/old/image/_manifests/tags/old'), { recursive: true });
  run.revisions.get('old/image')?.delete(run.old.digest);
  run.tags.get('old/image')?.delete('old');
  await run.collect();
  await run.collect();
  expect((await run.plan()).retireRevisions).toEqual([]);
  expect(run.journal.bundles).toEqual(provenance);
  run.reports[0].references = [{ repository: 'old/image', digest: run.old.digest }];
  await requireRefusal(run.collect(), 'Unknown required repository revision');
});
async function partialPublication() {
  const proof = await fixture();
  const first = await proof.manifest('partial/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: proof.config,
    layers: [proof.layer],
    annotations: { partial: 'first' },
  });
  const bytes = '{"partial":"config"}';
  const orphan = {
    digest: hash(bytes),
    size: Buffer.byteLength(bytes),
    mediaType: proof.config.mediaType,
  };
  await proof.put(proof.blobPath(orphan.digest), bytes);
  const missingBytes = JSON.stringify({
    schemaVersion: 2,
    mediaType: imageType,
    config: orphan,
    layers: [proof.layer],
  });
  const missing = { repository: 'partial/image', digest: hash(missingBytes) };
  const contents = [
    { ...proof.config, isManifest: false, dependencies: [] },
    { ...proof.layer, isManifest: false, dependencies: [] },
    { ...first, isManifest: true, dependencies: [proof.config.digest, proof.layer.digest] },
    { ...orphan, isManifest: false, dependencies: [] },
    {
      digest: missing.digest,
      size: Buffer.byteLength(missingBytes),
      mediaType: imageType,
      isManifest: true,
      dependencies: [orphan.digest, proof.layer.digest],
    },
  ].map((content) => ({ ...content, repository: 'partial/image' }));
  const evidence = {
    operationId: 'partial',
    declaredAt: '2026-10-01T00:00:00.000Z',
    contents,
    writes: contents
      .filter((content) => content.digest !== missing.digest)
      .map((content, index) => ({
        repository: content.repository,
        digest: content.digest,
        uploadId: content.isManifest ? null : `00000000-0000-4000-8000-00000000000${String(index)}`,
        phase: 'stored' as const,
        at: '2026-10-01T01:00:00.000Z',
      })),
  };
  proof.journal.bundles.push({
    operationId: 'partial',
    owner: 'owner',
    product: 'partial',
    roots: [first.digest, missing.digest],
    references: [{ repository: 'partial/image', digest: first.digest }, missing],
    receipt: { state: 'abandoned', at: '2026-10-02T00:00:00.000Z' },
  });
  Object.assign(proof.journal, {
    schemaVersion: 4,
    updatedAt: '2026-10-02T00:00:00.000Z',
    publicationEvidence: [evidence],
    maintenanceEvidence: null,
    lastVerifiedBackup: null,
    retirements: [],
  });
  return { ...proof, first, missing, orphan, evidence };
}
it('reconciled partial publication retires present revisions and owned orphan bytes without inventing its absent root', async () => {
  const proof = await partialPublication();
  const inventory = await proof.collect();
  const plan = await proof.plan();
  expect(inventory.graph.nodes.some((node) => node.digest === proof.missing.digest)).toBe(false);
  expect(plan.policy.retireOperations).toContain('partial');
  expect(plan.retireRevisions).toContainEqual({
    repository: 'partial/image',
    digest: proof.first.digest,
  });
  expect(plan.retireBlobs).toContain(proof.orphan.digest);
  expect(plan.retireBlobs).not.toContain(proof.layer.digest);
});
it('partial publication cannot excuse absent consumer/protected roots or a previously acknowledged manifest', async () => {
  const proof = await partialPublication();
  proof.reports[0].references = [proof.missing];
  await requireRefusal(proof.collect(), 'Unknown required repository revision');
  proof.reports[0].references = [];
  proof.evidence.writes.push({
    ...proof.missing,
    uploadId: null,
    phase: 'stored',
    at: '2026-10-01T01:00:00.000Z',
  });
  await requireRefusal(proof.collect(), 'Missing acknowledged stored');
});
it('young, unresolved and unowned partial content cannot authorize ordinary GC', async () => {
  const proof = await partialPublication();
  const bundle = proof.journal.bundles.find((bundle) => bundle.operationId === 'partial');
  if (bundle === undefined) throw new Error('missing fixture bundle');
  bundle.receipt.at = '2026-10-24T00:00:00.000Z';
  proof.journal.updatedAt = bundle.receipt.at;
  await requireRefusal(proof.plan(), 'Unreleased orphan');
  bundle.receipt.state = 'unfinished';
  proof.journal.publication = {
    operationId: 'partial',
    owner: 'owner',
    token: '00000000-0000-4000-8000-000000000001',
    phase: 'uploading',
  };
  proof.journal.reservations = [{ operationId: 'partial', bytes: 100000, inodes: 100 }];
  await requireRefusal(proof.collect(), 'Unknown required repository revision');
  proof.journal.publication = null;
  proof.journal.reservations = [];
  bundle.receipt.state = 'abandoned';
  bundle.receipt.at = '2026-10-02T00:00:00.000Z';
  proof.evidence.writes = proof.evidence.writes.filter(
    (write) => write.digest !== proof.orphan.digest,
  );
  await requireRefusal(proof.plan(), 'Unowned orphan');
});
async function ownedPartialStaging() {
  const proof = await partialPublication();
  const write = proof.evidence.writes.find((write) => write.digest === proof.orphan.digest);
  if (write === undefined) throw new Error('missing owned upload');
  if (write.uploadId === null) throw new Error('missing owned upload');
  Object.assign(write, { phase: 'writing' });
  await rm(dirname(proof.blobPath(proof.orphan.digest)), { recursive: true });
  const staging = join(proof.base, 'repositories/partial/image/_uploads', write.uploadId);
  const state = Buffer.alloc(108);
  state.write('sha\x03');
  state.writeBigUInt64BE(0n, 100);
  await proof.put(join(staging, 'data'), 'partial');
  await proof.put(join(staging, 'startedat'), '2026-10-01T01:00:00Z');
  await mkdir(join(staging, 'hashstates/sha256'), { recursive: true });
  await writeFile(join(staging, 'hashstates/sha256/0'), state);
  return { ...proof, staging, write, shaState: state };
}
it('censuses exact pre-body-owned partial staging and refuses unknown UUID, oversize and malformed SHA state', async () => {
  const proof = await ownedPartialStaging();
  const { staging, write, shaState: state } = proof;
  const plan = await proof.plan();
  expect(plan.retireUploads).toHaveLength(1);
  if (write.uploadId === null) throw new Error('Missing owned UUID');
  expect(plan.retireUploads[0]?.uploadId).toBe(write.uploadId);
  const saved = write.uploadId;
  write.uploadId = '00000000-0000-4000-8000-000000000099';
  await requireRefusal(proof.collect(), 'Unowned registry upload');
  write.uploadId = saved;
  await proof.put(join(staging, 'data'), 'x'.repeat(proof.orphan.size + 1));
  await requireRefusal(proof.collect(), 'upload exceeds declaration');
  await proof.put(join(staging, 'data'), 'partial');
  state.writeBigUInt64BE(1n, 100);
  await writeFile(join(staging, 'hashstates/sha256/0'), state);
  await requireRefusal(proof.collect(), 'Malformed upload SHA256 state');
});
it('refuses historical owner timestamps around a modeled staging start without rewriting stored evidence', async () => {
  const proof = await ownedPartialStaging();
  const actualStarted = await readFile(join(proof.staging, 'startedat'), 'utf8');
  const declaredWriteAt = proof.write.at;
  const declaredAt = proof.evidence.declaredAt;
  proof.evidence.declaredAt = new Date(
    Date.parse(declaredAt) - 8 * 24 * 60 * 60 * 1000,
  ).toISOString();
  proof.write.at = new Date(Date.parse(declaredWriteAt) - 8 * 24 * 60 * 60 * 1000).toISOString();
  await requireRefusal(proof.collect(), 'Registry upload start differs from pre-body ownership');
  proof.write.at = declaredWriteAt;
  proof.evidence.declaredAt = declaredAt;
  expect((await proof.plan()).retireUploads).toHaveLength(1);
  expect(await readFile(join(proof.staging, 'startedat'), 'utf8')).toBe(actualStarted);
});
it('fresh consumer shared-tier protection permits unique retirement and later surviving revisions remain eligible', async () => {
  const proof = await fixture();
  const bundle = proof.journal.bundles[0];
  bundle.roots.push(proof.index.digest);
  bundle.references.push({ repository: 'kept/image', digest: proof.index.digest });
  proof.reports[0].references = [{ repository: 'kept/image', digest: proof.index.digest }];
  const original = structuredClone(bundle);
  const first = await proof.plan();
  expect(first.retireRevisions).toEqual([{ repository: 'old/image', digest: proof.old.digest }]);
  expect(first.retireBlobs).toEqual([proof.old.digest]);
  Object.assign(proof.journal, {
    schemaVersion: 4,
    publicationEvidence: [],
    maintenanceEvidence: null,
    lastVerifiedBackup: null,
    closedOperations: ['retire-first'],
    retirements: [
      {
        operationId: 'retire-first',
        operations: ['old'],
        planSha256: 'a'.repeat(64),
        snapshotId: 'b'.repeat(64),
        uploadsSha256: 'c'.repeat(64),
        retireBlobs: [...first.retireBlobs],
        neverUploaded: [],
        at: '2026-10-25T00:00:00.000Z',
        deletions: [{ repository: 'old/image', digest: proof.old.digest, tags: ['old'] }],
      },
    ],
  });
  await unlink(proof.revisionPath('old/image', proof.old.digest));
  await rm(join(proof.base, 'repositories/old/image/_manifests/tags/old'), { recursive: true });
  await rm(dirname(proof.blobPath(proof.old.digest)), { recursive: true });
  proof.revisions.get('old/image')?.delete(proof.old.digest);
  proof.tags.get('old/image')?.delete('old');
  await proof.collect();
  await proof.collect();
  expect((await proof.plan()).retireRevisions).toEqual([]);
  proof.journal.protections = [];
  proof.reports[0].references = [];
  const second = await proof.plan();
  expect(second.policy.retireOperations).toEqual(['old']);
  expect(second.retireRevisions.map((reference) => reference.digest).sort()).toEqual(
    [proof.index.digest, proof.child.digest].sort(),
  );
  expect(bundle).toEqual(original);
});
async function plannedUploadDiscard() {
  const proof = await ownedPartialStaging();
  const plan = await proof.plan();
  Object.assign(proof.journal, {
    fenced: true,
    fenceReason: 'maintenance',
    maintenance: {
      operationId: 'discard',
      owner: 'owner',
      token: '00000000-0000-4000-8000-000000000001',
      kind: 'retirement',
      phase: 'deleting',
      resumePhase: 'deleting',
    },
    maintenanceEvidence: {
      operationId: 'discard',
      runtime: 'fixture-stopped',
      plan: JSON.stringify(plan),
      backup: {
        snapshotId: 'a'.repeat(64),
        verifiedAt: '2026-10-25T00:00:00.000Z',
        registryId: 'proof',
        storageId: 'proof',
        registryPath: proof.directory,
        journalPath: '/fixture/journal',
        journalRevision: 1,
        journalSha256: 'b'.repeat(64),
        censusSha256: plan.binding.censusSha256,
        bytes: 1000,
      },
      backupCensusSha256: plan.binding.censusSha256,
      backupAttempts: [],
      backupReconciliation: null,
      backupReconciliations: [],
      retained: [],
      deletions: [],
      uploadsVerified: null,
      recovery: null,
    },
  });
  const discard = () =>
    discardRegistryUploads(
      proof.journal,
      new AbortController().signal,
      Date.parse('2026-10-25T00:00:00.000Z'),
    );
  return { ...proof, plan, discard };
}
it('offline staging discard uses only the exact persisted eligible plan and refuses changed files before unlink', async () => {
  const proof = await plannedUploadDiscard();
  await proof.put(join(proof.staging, 'data'), 'changed');
  await requireRefusal(proof.discard(), 'differs from exact retirement plan');
  expect(await readFile(join(proof.staging, 'data'), 'utf8')).toBe('changed');
  await proof.put(join(proof.staging, 'data'), 'partial');
  const receipt = await proof.discard();
  expect(receipt).toMatch(/^[a-f0-9]{64}$/);
  expect(await Bun.file(join(proof.staging, 'data')).exists()).toBe(false);
  await requireRefusal(proof.discard(), 'ENOENT');
});
it('offline staging discard rechecks owner grace and completed upload intent instead of treating a plan as fresh observations', async () => {
  const proof = await plannedUploadDiscard();
  const bundle = proof.journal.bundles.find((bundle) => bundle.operationId === 'partial');
  if (bundle === undefined) throw new Error('Missing owner');
  bundle.receipt.at = '2026-10-24T00:00:00.000Z';
  await requireRefusal(proof.discard(), 'not reconciled and grace-eligible');
  expect(await Bun.file(join(proof.staging, 'data')).exists()).toBe(true);
  bundle.receipt.at = '2026-10-02T00:00:00.000Z';
  proof.write.phase = 'stored';
  await requireRefusal(
    readRegistryUpload(proof.journal, 'partial/image', proof.write.uploadId ?? ''),
    'contradictory completed write',
  );
});
it('two fresh authority retirements preserve shared-root residuals and immutable original publication provenance', async () => {
  const proof = await fixture();
  const journalPath = await scratchAsync('registry-shared-authority-');
  await chmod(journalPath, 0o700);
  const other = await proof.manifest(
    'other/image',
    {
      schemaVersion: 2,
      mediaType: imageType,
      config: proof.config,
      layers: [proof.layer],
      annotations: { unique: 'second' },
    },
    'second',
  );
  const current = await proof.manifest(
    'current/image',
    {
      schemaVersion: 2,
      mediaType: imageType,
      config: proof.config,
      layers: [proof.layer],
      annotations: { unique: 'current' },
    },
    'current',
  );
  let now = '2026-10-01T00:00:00.000Z';
  const ports: RegistryJournalPorts = {
    now: () => now,
    measureJournal: () =>
      invokeRegistryCallback(() => ({
        usableBytes: 1024 ** 3,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
        totalInodes: 100000,
        usedInodes: 10,
      })),
    measureRegistry: () => invokeRegistryCallback(() => proof.capacity),
    verifyConsumers: () => invokeRegistryCallback(() => undefined),
    verifyImages: () => invokeRegistryCallback(() => undefined),
    collectConsumers: async (sources, revision) => {
      const journal = parseRegistryCommandResponse({
        state: JSON.parse(await readFile(join(journalPath, 'journal.json'), 'utf8')) as unknown,
      }).state;
      const environment = journal.environments.find(
        (candidate) => candidate.environment === 'history-old',
      );
      const releases = environment?.releases ?? [];
      const bundles = releases.map((operationId) => {
        const bundle = journal.bundles.find((candidate) => candidate.operationId === operationId);
        if (bundle === undefined) throw new Error('Missing actual shared fixture history');
        return bundle;
      });
      const references = bundles[0]?.references ?? [];
      return sources.map((source) => ({
        id: source.id,
        source: source.source,
        role: source.role,
        revision,
        sourceRevision: 'modeled-local-reader',
        references,
        ...(source.role === 'history'
          ? {
              currentReferences: references,
              history:
                releases.length === 0
                  ? { state: 'first-install' as const, at: '2026-10-01T00:00:00.000Z' }
                  : { state: 'successful' as const, complete: true as const, releases },
              historySha256: registryHistorySha256(bundles),
            }
          : {}),
      }));
    },
  };
  const invoke = (request: unknown) => executeRegistryCommand(journalPath, request, ports);
  await invoke({ command: 'initialize', enrollment: proof.journal.enrollment });
  const sources = [
    ...proof.journal.consumers,
    {
      id: 'current-consumer',
      owner: 'owner',
      environment: 'history-old',
      kind: 'compose',
      hostSourceId: 'host',
      source: '/owned/current-consumer.json',
      configurationSha256: 'c'.repeat(64),
      role: 'consumer',
    },
    {
      id: 'history',
      owner: 'owner',
      environment: 'history-old',
      kind: 'compose',
      source: '/owned/history.json',
      configurationSha256: 'b'.repeat(64),
      role: 'history',
    },
  ];
  await invoke({
    command: 'enroll-consumers',
    expectedRevision: 0,
    operationId: 'enroll-shared',
    owner: 'owner',
    sources,
  });
  for (const [operationId, references] of [
    [
      'first',
      [
        { repository: 'kept/image', digest: proof.index.digest },
        { repository: 'old/image', digest: proof.old.digest },
      ],
    ],
    [
      'second',
      [
        { repository: 'kept/image', digest: proof.index.digest },
        { repository: 'other/image', digest: other.digest },
      ],
    ],
    ['current', [{ repository: 'current/image', digest: current.digest }]],
  ] as const) {
    const state = (await invoke({ command: 'read' })).state;
    const reserved = await invoke({
      command: 'reserve-publication',
      expectedRevision: state.revision,
      operationId,
      owner: 'owner',
      product: 'native-index',
      roots: references.map((reference) => reference.digest),
      references,
      envelope: { bytes: 1024, inodes: 10 },
    });
    if (reserved.token === undefined) throw new Error('Missing real publication capability');
    await invoke({
      command: 'finish-publication',
      expectedRevision: reserved.state.revision,
      operationId,
      owner: 'owner',
      token: reserved.token,
      outcome: 'completed',
      reconciled: true,
    });
  }
  let state = (await invoke({ command: 'read' })).state;
  await invoke({
    command: 'enroll-environment',
    expectedRevision: state.revision,
    operationId: 'shared-environment',
    owner: 'owner',
    environment: 'history-old',
    product: 'native-index',
    history: { state: 'first-install', at: now },
  });
  state = (await invoke({ command: 'read' })).state;
  const begun = await invoke({
    command: 'begin-deployment',
    expectedRevision: state.revision,
    operationId: 'promote-current',
    owner: 'owner',
    environment: 'history-old',
    candidate: 'current',
    current: null,
  });
  if (begun.token === undefined) throw new Error('Missing real deployment capability');
  await invoke({
    command: 'finish-deployment',
    expectedRevision: begun.state.revision,
    operationId: 'promote-current',
    owner: 'owner',
    token: begun.token,
    outcome: 'promoted',
    reconciled: true,
  });
  state = (await invoke({ command: 'read' })).state;
  const pinned = await invoke({
    command: 'acquire-protection',
    expectedRevision: state.revision,
    operationId: 'shared-pin',
    owner: 'owner',
    reason: 'independent-image',
    roots: [proof.index.digest],
    references: [{ repository: 'kept/image', digest: proof.index.digest }],
  });
  if (pinned.token === undefined) throw new Error('Missing real protection capability');
  await invoke({ command: 'upgrade-maintenance' });
  state = (await invoke({ command: 'read' })).state;
  const originalBundles = structuredClone(state.bundles);
  const originalHistory = structuredClone(state.environments);
  now = '2026-10-09T00:00:00.000Z';
  /** Fields consumed by this modeled runtime; the held production controller still owns full plan authorization. */
  const Plan = type({
    binding: { censusSha256: 'string' },
    retireRevisions: type({ repository: 'string', digest: 'string' }).array(),
    retireBlobs: 'string[]',
  });
  const plans: (typeof Plan.infer)[] = [];
  const runtime: RegistryMaintenanceRuntime = {
    inspect: () => invokeRegistryCallback(() => 'modeled-prior-state'),
    fence: () => invokeRegistryCallback(() => 'modeled-writer-barrier'),
    assertStopped: () => invokeRegistryCallback(() => undefined),
    identify: () => invokeRegistryCallback(() => proof.identity),
    open: (session, mode) =>
      invokeRegistryCallback(() => {
        if (mode === 'deletion') {
          const serialized = session.read().maintenanceEvidence?.plan;
          if (serialized === undefined || serialized === null)
            throw new Error('Missing exact real plan');
          plans.push(Plan.assert(JSON.parse(serialized)));
        }
        return { endpoint: proof.endpoint, close: () => invokeRegistryCallback(() => undefined) };
      }),
    discardUploads: async (session) =>
      discardRegistryUploads(session.read(), new AbortController().signal),
    collect: async (session) => {
      const serialized = session.read().maintenanceEvidence?.plan;
      if (serialized === undefined || serialized === null) throw new Error('Missing real GC plan');
      const plan = Plan.assert(JSON.parse(serialized));
      for (const digest of plan.retireBlobs) {
        await rm(dirname(proof.blobPath(digest)), { recursive: true });
        proof.contents.delete(digest);
      }
    },
    verifyImages: settleRegistryClientFixture,
    restoreService: () => invokeRegistryCallback(() => undefined),
  };
  let snapshots = 0;
  const backup = {
    prepare: () => invokeRegistryCallback(() => undefined),
    snapshot: async (source: { journalRevision: number; censusSha256: string }) => {
      snapshots++;
      const bytes = await readFile(join(journalPath, 'journal.json'));
      return {
        snapshotId: String(snapshots).repeat(64),
        verifiedAt: now,
        registryId: 'proof',
        storageId: 'proof',
        registryPath: proof.directory,
        journalPath,
        journalRevision: source.journalRevision,
        journalSha256: createHash('sha256').update(bytes).digest('hex'),
        censusSha256: source.censusSha256,
        bytes: bytes.length,
      };
    },
    verify: () => invokeRegistryCallback(() => undefined),
  };
  for (const operationId of ['retire-unique', 'retire-residual']) {
    await maintainRegistry({
      directory: journalPath,
      operationId,
      owner: 'owner',
      kind: 'retirement',
      ports,
      runtime,
      backup,
    });
    state = (await invoke({ command: 'read' })).state;
    expect(state.bundles).toEqual(originalBundles);
    expect(state.environments).toEqual(originalHistory);
    if (operationId === 'retire-unique') {
      expect(plans[0]?.retireRevisions).toEqual([
        { repository: 'old/image', digest: proof.old.digest },
        { repository: 'other/image', digest: other.digest },
      ]);
      expect(state.schemaVersion).toBe(4);
      if (state.schemaVersion !== 4) throw new Error('Missing schema4 receipts');
      expect(state.retirements[0]?.operations).toEqual(['first', 'second']);
      expect(proof.revisions.get('kept/image')?.has(proof.index.digest)).toBe(true);
      await invoke({
        command: 'release-protection',
        operationId: 'shared-pin',
        owner: 'owner',
        token: pinned.token,
        expectedRevision: state.revision,
        reconciled: true,
      });
    }
  }
  if (state.schemaVersion !== 4) throw new Error('Missing final schema4 receipts');
  expect(plans).toHaveLength(2);
  expect(plans[1]?.retireRevisions).toEqual(
    [
      { repository: 'kept/image', digest: proof.child.digest },
      { repository: 'kept/image', digest: proof.index.digest },
    ].sort((a, b) => a.digest.localeCompare(b.digest)),
  );
  expect(state.retirements.map((receipt) => receipt.operationId)).toEqual([
    'retire-unique',
    'retire-residual',
  ]);
  expect(state.retirements[1]?.operations).toEqual(['first', 'second']);
  expect(state.retirements.map((receipt) => receipt.snapshotId)).toEqual([
    '1'.repeat(64),
    '2'.repeat(64),
  ]);
  expect(plans[0]?.binding.censusSha256).not.toBe(plans[1]?.binding.censusSha256);
  expect(proof.contents.has(proof.layer.digest)).toBe(true);
  expect(proof.revisions.get('current/image')?.has(current.digest)).toBe(true);
});
