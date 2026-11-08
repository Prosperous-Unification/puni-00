import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  executeRegistryCommand,
  publishArtifacts,
  uploadArtifact,
} from '@tools/registry-publication';
import { mock } from 'bun:test';

// Isolated process: builder/SSH/archive acquisition, capacity/image-verifier ports,
// initial verified-fence setup and the HTTP server are fixtures. Dagger's caller,
// common publisher, schema4 authority persistence and HTTP uploader are production code.
const directory = await mkdtemp('/tmp/dagger-ownership-');
await chmod(directory, 0o700);
const journal = join(directory, 'journal');
await mkdir(journal, { mode: 0o700 });
const config = Buffer.from('{}');
const configDigest = 'sha256:' + createHash('sha256').update(config).digest('hex');
const manifest = Buffer.from(
  JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: configDigest,
      size: config.length,
    },
    layers: [],
  }),
);
const manifestDigest = 'sha256:' + createHash('sha256').update(manifest).digest('hex');
const contents = [
  {
    digest: configDigest,
    size: config.length,
    mediaType: 'application/vnd.oci.image.config.v1+json',
    dependencies: [],
    isManifest: false,
    path: join(directory, 'config'),
    offset: 0,
  },
  {
    digest: manifestDigest,
    size: manifest.length,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    dependencies: [configDigest],
    isManifest: true,
    path: join(directory, 'manifest'),
    offset: 0,
  },
];
await writeFile(contents[0].path, config);
await writeFile(contents[1].path, manifest);
const artifact = { repository: 'wbs-be-01', reference: 'owned', digest: manifestDigest, contents };
const capacity = {
  maximumBytes: 50 * 1024 ** 3,
  usableBytes: 50 * 1024 ** 3,
  usedBytes: 1024,
  totalInodes: 100000,
  usedInodes: 10,
  rootFreeBytes: 30 * 1024 ** 3,
};
const ports = {
  measureJournal: () =>
    Promise.resolve({
      usableBytes: 1024 ** 3,
      allocationUnitBytes: 4096,
      usedBytes: 1000,
      totalInodes: 100000,
      usedInodes: 1,
    }),
  measureRegistry: () => Promise.resolve(capacity),
  verifyImages: () => Promise.resolve(),
};
const invoke = (request: unknown) => executeRegistryCommand(journal, request, ports);
await invoke({
  command: 'initialize',
  enrollment: {
    registryId: 'owned',
    storageId: 'owned',
    registryPath: join(directory, 'registry'),
    rootPath: '/',
    maximumBytes: capacity.maximumBytes,
    journalMaximumBytes: 1024 ** 3,
    owners: ['publisher'],
  },
});
const state = (await invoke({ command: 'upgrade-maintenance' })).state;
state.fenced = false;
state.fenceReason = null;
state.maintenanceVerified = true;
await writeFile(join(journal, 'journal.json'), JSON.stringify(state), { mode: 0o600 });
const stored = new Map<string, Uint8Array<ArrayBuffer>>();
let bodies = 0;
const uuid = '00000000-0000-4000-8000-000000000001';
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST')
      return new Response(null, {
        status: 202,
        headers: { location: `/v2/wbs-be-01/blobs/uploads/${uuid}`, 'docker-upload-uuid': uuid },
      });
    if (request.method === 'PUT') {
      const current = (await invoke({ command: 'read' })).state;
      const digest = url.pathname.includes('/manifests/') ? manifestDigest : configDigest;
      if (
        current.schemaVersion !== 4 ||
        !current.publicationEvidence[0]?.writes.some(
          (write) => write.digest === digest && write.phase === 'writing',
        )
      )
        return new Response('body lacks durable ownership', { status: 409 });
      bodies++;
      stored.set(digest, new Uint8Array(await request.arrayBuffer()));
      return new Response(null, { status: 201, headers: { 'docker-content-digest': digest } });
    }
    const digest = url.pathname.split('/').at(-1);
    const bytes = digest === undefined ? undefined : stored.get(digest);
    return bytes === undefined
      ? new Response(null, { status: 404 })
      : new Response(bytes, { headers: { 'docker-content-digest': digest ?? '' } });
  },
});
await mock.module('@tools/registry-publication', () => ({
  admitExportScratch: () => Promise.resolve({}),
  checkExportScratch: () => Promise.resolve(),
  inspectOciArchive: () => Promise.resolve(artifact),
  connectRegistryAuthority: () => invoke,
  publishArtifacts,
  uploadArtifact,
}));
try {
  const { publishManagedRelease } = await import('./publish');
  const endpoint = { url: server.url.toString().replace(/\/$/, '') };
  await publishManagedRelease(
    {
      schemaVersion: 1,
      registryUrl: endpoint.url,
      registryId: 'owned',
      authorityMachineId: '0'.repeat(32),
      registryPath: '/fixture',
      journalPath: journal,
      sshHost: 'unused',
      owner: 'publisher',
      product: 'wbs',
      requiredRepositories: ['wbs-be-01'],
      builder: {
        uid: process.getuid?.() ?? -1,
        machineId: (await readFile('/etc/machine-id', 'utf8')).trim(),
        path: directory,
        receiptPath: '/substituted',
        maximumBytes: 1024 ** 2,
        maximumInodes: 1000,
        excludedFilesystems: [],
      },
    },
    endpoint,
    ['be'],
    'owned',
    () => Promise.resolve(),
  );
  const completed = (await invoke({ command: 'read' })).state;
  if (
    bodies !== 2 ||
    completed.schemaVersion !== 4 ||
    completed.bundles[0]?.receipt.state !== 'completed' ||
    completed.publicationEvidence[0]?.writes.some((write) => write.phase !== 'stored')
  )
    throw new Error('Dagger caller lost durable ownership');
  console.log('Dagger caller schema4 durable-before-body and stored acknowledgements: 2 bodies');
} finally {
  await server.stop(true);
  await rm(directory, { recursive: true });
}
