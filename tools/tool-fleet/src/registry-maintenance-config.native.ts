import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import { collectRegistryInventory } from './registry-inventory';

const expectedBinary = '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37';
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const imageType = 'application/vnd.oci.image.manifest.v1+json';

/** Owned local fixture only. Requires the amd64 binary extracted from the exact pinned image; no Docker socket, production storage or credentials. */
async function proveConfiguration(binary: string): Promise<void> {
  if (hash(await readFile(binary)) !== expectedBinary)
    throw new Error('Native fixture binary differs from pinned image extraction');
  const available = await statfs('/tmp');
  if (available.bavail * available.bsize < 21 * 1024 ** 3)
    throw new Error('Native fixture root reserve before allocation');
  const directory = await mkdtemp('/tmp/task8-config-');
  const storage = join(directory, 'storage');
  await mkdir(storage);
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
    `version: 0.1\nlog:\n  level: info\nstorage:\n  filesystem:\n    rootdirectory: ${storage}\n  delete:\n    enabled: true\nhttp:\n  addr: 127.0.0.1:${String(port)}\n  secret: owned-task8-fixture\n`,
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
  const start = async (environment: Record<string, string>) => {
    child = Bun.spawn([binary, 'serve', configuration], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdout: log.fd,
      stderr: log.fd,
    });
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
    const manifests = parseAllDocuments(
      await readFile(
        new URL('../../../infra/platform/registry/base/registry.yaml', import.meta.url),
        'utf8',
      ),
    ).map((document): unknown => document.toJS() as unknown);
    const deployment = manifests.find(
      (manifest) =>
        typeof manifest === 'object' &&
        manifest !== null &&
        'kind' in manifest &&
        manifest.kind === 'Deployment',
    );
    const shape = type({
      kind: "'Deployment'",
      spec: {
        template: {
          spec: {
            containers: type({ env: type({ name: 'string', value: 'string' }).array() }).array(),
          },
        },
      },
    });
    const variables = shape.assert(deployment).spec.template.spec.containers.at(0)?.env;
    if (variables === undefined) throw new Error('Missing production registry environment');
    const environment = Object.fromEntries(
      variables
        .filter((variable) =>
          [
            'REGISTRY_STORAGE_DELETE_ENABLED',
            'REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING',
          ].includes(variable.name),
        )
        .map((variable) => [variable.name, variable.value]),
    );
    await start(environment);
    const config = await blob('proof/image', '{}', 'application/vnd.oci.image.config.v1+json');
    const layer = await blob(
      'proof/image',
      'owned layer',
      'application/vnd.oci.image.layer.v1.tar',
    );
    const protectedManifest = await manifest('proof/image', 'protected', {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
    });
    for (const suffix of [`manifests/${protectedManifest.digest}`, `blobs/${layer.digest}`]) {
      const response = await fetch(`${endpoint.url}/v2/proof/image/${suffix}`, {
        method: 'DELETE',
      });
      requireProof(response.status === 405, 'Ordinary endpoint accepted DELETE');
      await request(`/v2/proof/image/${suffix}`, { headers: { accept: imageType } });
    }
    await stop();
    requireProof(
      !(await readFile(join(directory, 'registry.log'), 'utf8')).includes('Starting upload purge'),
      'Age-only purger was armed',
    );
    await start({ ...environment, REGISTRY_STORAGE_DELETE_ENABLED: 'true' });
    requireProof(
      (
        await fetch(`${endpoint.url}/v2/proof/image/manifests/${protectedManifest.digest}`, {
          method: 'DELETE',
        })
      ).status === 202,
      'Removal witness did not enable manifest deletion',
    );
    requireProof(
      (
        await fetch(`${endpoint.url}/v2/proof/image/manifests/${protectedManifest.digest}`, {
          headers: { accept: imageType },
        })
      ).status === 404,
      'Removal witness retained deleted manifest',
    );
    await stop();
    requireProof(
      (
        await readdir(join(storage, 'docker/registry/v2/repositories/proof/image/_manifests'))
      ).includes('revisions'),
      'Native final-revision removal did not preserve manifest containers',
    );
    await start({ ...environment, REGISTRY_STORAGE_DELETE_ENABLED: 'true' });
    const catalog = type({ repositories: 'string[]' }).assert(
      await (await request('/v2/_catalog')).json(),
    );
    const tags = type({ name: 'string', tags: type('string[]').or('null') }).assert(
      await (await request('/v2/proof/image/tags/list')).json(),
    );
    requireProof(
      catalog.repositories.includes('proof/image') &&
        tags.name === 'proof/image' &&
        (tags.tags === null || tags.tags.length === 0),
      'Last deletion did not yield the exact known empty repository API state',
    );
    const partial = await manifest('proof/image', 'partial', {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
      annotations: { purpose: 'post-unlink failure' },
    });
    const current = join(
      storage,
      'docker/registry/v2/repositories/proof/image/_manifests/tags/partial/current/link',
    );
    await chmod(current, 0o000);
    const failedDelete = await fetch(`${endpoint.url}/v2/proof/image/manifests/${partial.digest}`, {
      method: 'DELETE',
    });
    requireProof(failedDelete.status === 500, 'Native post-unlink tag lookup did not fail');
    await chmod(current, 0o644);
    requireProof(
      !(await Bun.file(
        join(
          storage,
          'docker/registry/v2/repositories/proof/image/_manifests/revisions/sha256',
          partial.digest.slice(7),
          'link',
        ),
      ).exists()) && (await readFile(current, 'utf8')) === partial.digest,
      'Post-unlink fault did not leave a dangling current tag',
    );
    requireProof(
      (
        await fetch(`${endpoint.url}/v2/proof/image/manifests/${partial.digest}`, {
          method: 'DELETE',
        })
      ).status === 404,
      'Partial deletion retry did not expose the misleading404',
    );
    let refusal: unknown;
    try {
      await collectRegistryInventory({
        journal: {
          schemaVersion: 3,
          revision: 0,
          updatedAt: '2026-10-25T00:00:00.000Z',
          fenced: true,
          fenceReason: 'fixture',
          maintenanceVerified: false,
          measurement: null,
          enrollment: {
            registryId: 'native',
            storageId: 'owned',
            owners: ['owner'],
            registryPath: storage,
            rootPath: '/',
            maximumBytes: 256 * 1024 ** 2,
            journalMaximumBytes: 1024 ** 2,
          },
          protections: [],
          bundles: [
            {
              operationId: 'partial',
              owner: 'owner',
              product: 'proof',
              roots: [partial.digest],
              references: [{ repository: 'proof/image', digest: partial.digest }],
              receipt: { state: 'completed', at: '2026-10-25T00:00:00.000Z' },
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
              source: '/owned/host',
              configurationSha256: 'a'.repeat(64),
              role: 'consumer',
            },
          ],
        },
        identity: {
          registryId: 'native',
          storageId: 'owned',
          node: 'fixture',
          pvcUid: 'fixture',
          mountIdentity: 'fixture',
          distributionDigest:
            'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
          binarySha256: expectedBinary,
        },
        endpoint,
        consumers: {
          verifyConsumers: () => Promise.resolve(),
          collectConsumers: () =>
            Promise.resolve().then(() => [
              {
                id: 'host',
                source: '/owned/host',
                role: 'consumer',
                revision: 0,
                sourceRevision: 'owned-fixture',
                references: [],
              },
            ]),
        },
      });
    } catch (cause) {
      refusal = cause;
    }
    requireProof(
      refusal instanceof Error &&
        refusal.message.includes('Current tag omits required manifest revision'),
      'Strict census certified a partial native deletion',
    );
    await stop();
    // Remove the actual production object override, restoring Distribution's default.
    const unguarded = { ...environment };
    delete unguarded['REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING'];
    await start(unguarded);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        (await readFile(join(directory, 'registry.log'), 'utf8')).includes('Starting upload purge')
      )
        break;
      await Bun.sleep(10);
    }
    requireProof(
      (await readFile(join(directory, 'registry.log'), 'utf8')).includes('Starting upload purge'),
      'Removal witness failed to arm the default purger',
    );
    await stop();
    const bounds = await checkBounds();
    console.log(
      JSON.stringify({
        checks,
        binarySha256: expectedBinary,
        ...bounds,
        boundary:
          'actual pinned HTTP DELETE and purger scheduling; no elapsed age-purge deletion claimed',
      }),
    );
  } finally {
    if (child !== undefined) await stop();
    await log.close();
    await rm(directory, { recursive: true });
    console.log(JSON.stringify({ cleanup: directory, removed: true }));
  }
}

if (import.meta.main) {
  const binary = process.argv.at(2);
  if (binary === undefined || process.argv.length !== 3)
    throw new Error('Usage: registry-maintenance-config.native.ts <pinned-binary>');
  await proveConfiguration(binary);
}
