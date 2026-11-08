import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  statfs,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { collectRegistryInventory, planRegistryRetirement } from './registry-inventory';
import type { RegistryJournal } from './registry-managed-journal';

const expectedBinary = '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37';
const distributionDigest =
  'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278';
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const imageType = 'application/vnd.oci.image.manifest.v1+json';
const indexType = 'application/vnd.oci.image.index.v1+json';

/** Owned local fixture only. Requires the amd64 binary extracted from the exact pinned image; no Docker socket, production storage or credentials. */
async function proveInventory(binary: string): Promise<void> {
  if (hash(await readFile(binary)) !== expectedBinary)
    throw new Error('Native fixture binary differs from pinned image extraction');
  const available = await statfs('/tmp');
  if (available.bavail * available.bsize < 21 * 1024 ** 3)
    throw new Error('Native fixture root reserve before allocation');
  const directory = await mkdtemp('/tmp/task7-census-');
  const storage = join(directory, 'storage');
  await mkdir(storage);
  const base = join(storage, 'docker/registry/v2');
  const listener = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('reserved'),
  });
  const port = listener.port;
  await listener.stop(true);
  if (port === undefined) throw new Error('Missing owned fixture port');
  const endpoint = { url: `http://127.0.0.1:${String(port)}` };
  const configuration = join(directory, 'registry.yml');
  await writeFile(
    configuration,
    `version: 0.1\nlog:\n  level: error\nstorage:\n  filesystem:\n    rootdirectory: ${storage}\n  delete:\n    enabled: true\n  maintenance:\n    uploadpurging:\n      enabled: false\nhttp:\n  addr: 127.0.0.1:${String(port)}\n  secret: owned-task7-fixture\n`,
  );
  const log = await open(join(directory, 'registry.log'), 'wx');
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let checks = 0;
  const requireProof = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const checkBounds = async () => {
    const measure = Bun.spawnSync(['/usr/bin/du', '-s', '-B1', directory]);
    if (measure.exitCode !== 0)
      throw new Error(`Fixture measurement failed: ${measure.stderr.toString()}`);
    const bytes = Number(measure.stdout.toString().split(/\s/)[0]);
    const reserve = await statfs('/tmp');
    if (
      !Number.isSafeInteger(bytes) ||
      bytes > 256 * 1024 ** 2 ||
      reserve.bavail * reserve.bsize < 20 * 1024 ** 3
    )
      throw new Error('Native fixture capacity bound');
    return { bytes, rootFreeBytes: reserve.bavail * reserve.bsize };
  };
  const stop = async () => {
    if (child === undefined) throw new Error('Missing owned registry process');
    child.kill('SIGTERM');
    const current = child;
    const timeout = setTimeout(() => {
      current.kill('SIGKILL');
    }, 5000);
    const code = await current.exited;
    clearTimeout(timeout);
    child = undefined;
    if (code !== 0 && code !== 143)
      throw new Error(`Owned registry shutdown failed: ${String(code)}`);
  };
  const start = async () => {
    child = Bun.spawn([binary, 'serve', configuration], { stdout: log.fd, stderr: log.fd });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error(`Registry startup failed: ${String(child.exitCode)}`);
      const response = await fetch(`${endpoint.url}/v2/`).catch((cause: unknown) => {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ECONNREFUSED') return null;
        throw cause;
      });
      if (response?.ok === true) return;
      await Bun.sleep(20);
    }
    throw new Error('Owned registry startup did not converge');
  };
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(new URL(path, endpoint.url), init);
    if (!response.ok)
      throw new Error(
        `Fixture request ${path}: ${String(response.status)} ${await response.text()}`,
      );
    return response;
  };
  const blob = async (repository: string, bytes: string, mediaType: string) => {
    const digest = `sha256:${hash(bytes)}`;
    const upload = await request(`/v2/${repository}/blobs/uploads/`, { method: 'POST' });
    const location = upload.headers.get('location');
    if (location === null) throw new Error('Missing fixture upload location');
    const url = new URL(location);
    url.searchParams.set('digest', digest);
    await request(url.href, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': 'application/octet-stream' },
    });
    return { digest, size: Buffer.byteLength(bytes), mediaType };
  };
  const manifest = async (
    repository: string,
    reference: string | undefined,
    value: { mediaType: string; [key: string]: unknown },
  ) => {
    const bytes = JSON.stringify(value);
    const digest = `sha256:${hash(bytes)}`;
    await request(`/v2/${repository}/manifests/${reference ?? digest}`, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': value.mediaType },
    });
    return { digest, size: Buffer.byteLength(bytes), mediaType: value.mediaType };
  };
  try {
    await start();
    const config = await blob('proof/image', '{}', 'application/vnd.oci.image.config.v1+json');
    const layer = await blob(
      'proof/image',
      'shared fixture layer',
      'application/vnd.oci.image.layer.v1.tar',
    );
    const obsoleteLayer = await blob(
      'proof/image',
      'obsolete fixture layer',
      'application/vnd.oci.image.layer.v1.tar',
    );
    const old = await manifest('proof/image', 'current', {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [obsoleteLayer],
    });
    const childManifest = await manifest('proof/image', undefined, {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
    });
    const indexValue = { schemaVersion: 2, mediaType: indexType, manifests: [childManifest] };
    const index = await manifest('proof/image', 'current', indexValue);
    for (let index = 0; index < 101; index++)
      await manifest('proof/image', `tag-${String(index).padStart(3, '0')}`, indexValue);
    await blob('other/image', '{}', config.mediaType);
    await blob('other/image', 'shared fixture layer', layer.mediaType);
    const other = await manifest('other/image', 'current', {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
    });
    const journal: RegistryJournal = {
      schemaVersion: 3,
      revision: 1,
      updatedAt: '2026-10-01T00:00:00.000Z',
      fenced: false,
      fenceReason: null,
      maintenanceVerified: false,
      measurement: null,
      enrollment: {
        registryId: 'native',
        storageId: 'owned',
        registryPath: storage,
        rootPath: '/',
        maximumBytes: 256 * 1024 ** 2,
        journalMaximumBytes: 1024 ** 2,
        owners: ['owner'],
      },
      protections: [
        {
          operationId: 'pin',
          owner: 'owner',
          token: '00000000-0000-4000-8000-000000000001',
          reason: 'fixture',
          roots: [index.digest],
          references: [{ repository: 'proof/image', digest: index.digest }],
        },
      ],
      bundles: [
        {
          operationId: 'old',
          owner: 'owner',
          product: 'fixture',
          roots: [old.digest, other.digest],
          references: [
            { repository: 'proof/image', digest: old.digest },
            { repository: 'other/image', digest: other.digest },
          ],
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
          id: 'fixture',
          owner: 'owner',
          environment: null,
          kind: 'docker-host',
          source: '/owned/fixture.json',
          configurationSha256: 'a'.repeat(64),
          role: 'consumer',
        },
      ],
    };
    for (let index = 0; index < 100; index++) {
      const repository = `catalog/repo-${String(index).padStart(3, '0')}`;
      await blob(repository, '{}', config.mediaType);
      const image = await manifest(repository, 'current', {
        schemaVersion: 2,
        mediaType: imageType,
        config,
        layers: [],
      });
      if (!journal.bundles[0].roots.includes(image.digest))
        journal.bundles[0].roots.push(image.digest);
      journal.bundles[0].references.push({ repository, digest: image.digest });
    }
    const collect = (registryEndpoint = endpoint) =>
      collectRegistryInventory({
        journal,
        endpoint: registryEndpoint,
        identity: {
          registryId: 'native',
          storageId: 'owned',
          node: 'owned-local',
          pvcUid: 'fixture-no-pvc',
          mountIdentity: storage,
          distributionDigest,
          binarySha256: expectedBinary,
        },
        consumers: {
          verifyConsumers: () => Promise.resolve(),
          collectConsumers: () =>
            Promise.resolve([
              {
                id: 'fixture',
                source: '/owned/fixture.json',
                revision: journal.revision,
                sourceRevision: 'synthetic',
                role: 'consumer',
                references: [],
              },
            ]),
        },
      });
    const inventory = await collect();
    const plan = planRegistryRetirement(inventory, {
      now: '2026-10-25T00:00:00.000Z',
      mode: 'nightly',
      capacity: {
        maximumBytes: 256 * 1024 ** 2,
        usableBytes: 256 * 1024 ** 2,
        usedBytes: 1024 ** 2,
        usedInodes: 100,
        totalInodes: 10000,
        rootFreeBytes: 30 * 1024 ** 3,
      },
    });
    requireProof(inventory.revisions.length === 104, 'Native complete revision count');
    requireProof(plan.retireRevisions.length === 102, 'Native repository-specific deletion count');
    requireProof(
      !plan.retireBlobs.includes(layer.digest) && !plan.retireBlobs.includes(childManifest.digest),
      'Native shared/untagged preservation',
    );
    const truncated = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(incoming) {
        const url = new URL(incoming.url);
        if (url.pathname === '/v2/proof/image/tags/list')
          return Response.json({ name: 'proof/image', tags: ['current'] });
        const response = await fetch(new URL(url.pathname + url.search, endpoint.url), {
          headers: incoming.headers,
        });
        const headers = new Headers(response.headers);
        const link = headers.get('link');
        if (link !== null) headers.set('link', link.replaceAll(endpoint.url, url.origin));
        return new Response(response.body, { status: response.status, headers });
      },
    });
    try {
      const refusal = await collect({ url: truncated.url.toString().replace(/\/$/, '') }).then(
        () => null,
        (cause: unknown) => cause,
      );
      requireProof(
        refusal instanceof Error && refusal.message.includes('tag census'),
        `Truncated native API census did not reach expected refusal: ${String(refusal)}`,
      );
    } finally {
      await truncated.stop(true);
    }
    const blobPath = join(
      base,
      'blobs/sha256',
      layer.digest.slice(7, 9),
      layer.digest.slice(7),
      'data',
    );
    const original = await readFile(blobPath);
    await writeFile(blobPath, Buffer.alloc(original.length, 120));
    const corruption = await collect().then(
      () => null,
      (cause: unknown) => cause,
    );
    requireProof(
      corruption instanceof Error && corruption.message.includes('digest'),
      'Corrupt native blob accepted',
    );
    await writeFile(blobPath, original);
    const layerPath = join(
      base,
      'repositories/proof/image/_layers/sha256',
      layer.digest.slice(7),
      'link',
    );
    const link = await readFile(layerPath);
    await unlink(layerPath);
    const missing = await collect().then(
      () => null,
      (cause: unknown) => cause,
    );
    requireProof(missing instanceof Error, 'Missing required native layer link accepted');
    await writeFile(layerPath, link);
    const revisionPath = join(
      base,
      'repositories/proof/image/_manifests/revisions/sha256',
      childManifest.digest.slice(7),
      'link',
    );
    const revision = await readFile(revisionPath);
    await unlink(revisionPath);
    const omitted = await collect().then(
      () => null,
      (cause: unknown) => cause,
    );
    requireProof(omitted instanceof Error, 'Missing native child revision accepted');
    await writeFile(revisionPath, revision);
    await request(`/v2/proof/image/manifests/${old.digest}`, { method: 'DELETE' });
    journal.bundles[0].roots = journal.bundles[0].roots.filter((digest) => digest !== old.digest);
    journal.bundles[0].references = journal.bundles[0].references.filter(
      (reference) => reference.digest !== old.digest,
    );
    journal.revision++;
    const beforeGc = await collect();
    requireProof(
      beforeGc.orphanBlobs.includes(old.digest),
      'Deleted revision content must remain orphan before GC',
    );
    await stop();
    const gc = Bun.spawnSync([binary, 'garbage-collect', configuration], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await writeFile(join(directory, 'gc.log'), Buffer.concat([gc.stdout, gc.stderr]));
    if (gc.exitCode !== 0) throw new Error(`Native GC failed: ${gc.stderr.toString()}`);
    await start();
    const afterGc = await collect();
    requireProof(
      afterGc.revisions.length === 103 && afterGc.orphanBlobs.length === 0,
      'Native post-GC census',
    );
    requireProof(
      (await readFile(
        join(
          base,
          'repositories/proof/image/_layers/sha256',
          obsoleteLayer.digest.slice(7),
          'link',
        ),
        'utf8',
      )) === obsoleteLayer.digest,
      'Expected obsolete layer link after GC',
    );
    requireProof(
      (await readFile(
        join(
          base,
          'repositories/proof/image/_manifests/tags/current/index/sha256',
          old.digest.slice(7),
          'link',
        ),
        'utf8',
      )) === old.digest,
      'Expected tag history link after native deletion',
    );
    const pull = await request(`/v2/proof/image/manifests/${childManifest.digest}`, {
      headers: { accept: imageType },
    });
    requireProof(
      `sha256:${hash(new Uint8Array(await pull.arrayBuffer()))}` === childManifest.digest,
      'Uncached native child pull',
    );
    const pulledLayer = await request(`/v2/other/image/blobs/${layer.digest}`);
    requireProof(
      `sha256:${hash(new Uint8Array(await pulledLayer.arrayBuffer()))}` === layer.digest,
      'Uncached shared blob pull',
    );
    await stop();
    const measurements = await checkBounds();
    await log.close();
    await rm(directory, { recursive: true });
    requireProof(!(await readdir('/tmp')).includes(directory.slice(5)), 'Fixture cleanup receipt');
    console.log(
      JSON.stringify({
        status: 'passed',
        distributionDigest,
        binarySha256: expectedBinary,
        checks,
        tags: 102,
        repositories: 102,
        revisionsBefore: 104,
        revisionsAfter: 103,
        ...measurements,
        cleanup: directory,
        consumerBoundary: 'synthetic complete source; no installed consumer authority claimed',
      }),
    );
  } catch (cause) {
    if (child !== undefined) await stop();
    await log.close();
    const measurements = await checkBounds();
    console.error(JSON.stringify({ retained: directory, ...measurements }));
    throw cause;
  }
}

if (import.meta.main) {
  const binary = process.argv.at(2);
  if (binary === undefined) throw new Error('Pass the pinned extracted Distribution binary path');
  await proveInventory(binary);
}
