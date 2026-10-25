import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { afterEach, expect, it } from 'bun:test';

import { registryHistorySha256 } from './registry-history';
import {
  assertRegistryPlan,
  collectRegistryInventory,
  planRegistryRetirement,
} from './registry-inventory';
import type { RegistryConsumerReport, RegistryJournal } from './registry-journal';

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
    return { ...descriptor, mediaType: (value as { mediaType: string }).mediaType };
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
                : (JSON.parse(bytes) as { mediaType: string }).mediaType,
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
  expect((await proof.plan()).retireBlobs).not.toContain(orphan);
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
  const staging = join(proof.base, 'repositories/old/image/_uploads/owned/startedat');
  await proof.put(staging, '2026-10-25');
  await requireRefusal(proof.collect(), 'unresolved upload');
  await rm(dirname(staging), { recursive: true });
  await proof.manifest('old/image', {
    schemaVersion: 2,
    mediaType: imageType,
    config: proof.config,
  });
  await requireRefusal(proof.collect(), 'Unsupported registry image');
});
