import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { verifyContent } from './registry-artifact';
import { settleRegistryClientFixture } from './registry-client-completion.fixture';
import { writeRegistryDeletionFixture } from './registry-deletion.fixture';
import { maintainRegistry, type RegistryMaintenanceRuntime } from './registry-maintenance';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
import { discardRegistryUploads } from './registry-upload-census';

const GiB = 1024 ** 3;
async function createFixture() {
  let at = new Date(Date.now() - 8 * 86400000).toISOString();
  const directory = await scratchAsync('registry-maintenance-delete-status-');
  const journalPath = join(directory, 'journal');
  const registryPath = join(directory, 'registry');
  await mkdir(journalPath, { mode: 0o700 });
  await mkdir(join(registryPath, 'docker/registry/v2/repositories'), { recursive: true });
  await mkdir(join(registryPath, 'docker/registry/v2/blobs/sha256'), { recursive: true });
  const calls: string[] = [];
  const ports: RegistryJournalPorts = {
    now: () => at,
    verifyImages: () => Promise.resolve(),
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: 50 * GiB,
        usableBytes: 50 * GiB,
        usedBytes: GiB,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      }),
    verifyConsumers: () => Promise.resolve(),
    collectConsumers: (sources, revision) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'observed',
          references: [],
        })),
      ),
  };
  await executeRegistryCommand(
    journalPath,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
        storageId: 'proof',
        owners: ['owner'],
        registryPath,
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  const state = (await executeRegistryCommand(journalPath, { command: 'read' }, ports)).state;
  state.consumers.push({
    id: 'host',
    owner: 'owner',
    environment: null,
    kind: 'docker-host',
    source: '/owned/host.json',
    configurationSha256: 'a'.repeat(64),
    role: 'consumer',
  });
  await writeFile(join(journalPath, 'journal.json'), JSON.stringify(state));
  await chmod(join(journalPath, 'journal.json'), 0o600);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ repositories: [] }),
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
  const runtime: RegistryMaintenanceRuntime = {
    inspect: () => Promise.resolve('prior-state'),
    fence: () => {
      calls.push('fence');
      return Promise.resolve('fresh-controller-barrier');
    },
    assertStopped: () => {
      calls.push('stopped');
      return Promise.resolve();
    },
    identify: () => Promise.resolve(identity),
    open: () => {
      calls.push('open');
      return Promise.resolve({
        endpoint: { url: server.url.toString() },
        close: () => {
          calls.push('close');
          return Promise.resolve();
        },
      });
    },
    discardUploads: async (session) => {
      const state = session.read();
      return discardRegistryUploads(state, new AbortController().signal);
    },
    collect: () => {
      calls.push('gc');
      return Promise.resolve();
    },
    verifyImages: settleRegistryClientFixture,
    restoreService: () => {
      calls.push('restore');
      return Promise.resolve();
    },
  };
  const backup = {
    prepare: () => {
      calls.push('preflight');
      return Promise.resolve();
    },
    snapshot: async (source: { journalRevision: number; censusSha256: string }) => {
      calls.push('backup');
      const bytes = await readFile(join(journalPath, 'journal.json'));
      return {
        snapshotId: 'a'.repeat(64),
        verifiedAt: new Date().toISOString(),
        registryId: 'proof',
        storageId: 'proof',
        registryPath,
        journalPath,
        journalRevision: source.journalRevision,
        journalSha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
        censusSha256: source.censusSha256,
        bytes: bytes.length,
      };
    },
    verify: () => {
      calls.push('verify');
      return Promise.resolve();
    },
  };
  return {
    journalPath,
    registryPath,
    directory,
    ports,
    runtime,
    backup,
    calls,
    server,
    advance: () => {
      at = new Date().toISOString();
    },
  };
}

// Actual maintenance/journal/flock/census with physically seeded content; HTTP status, capacity,
// backup, consumers and image admission are modeled. Publication age advances from eight days
// earlier to now; this does not exercise a real publisher or elapsed grace.
for (const status of [500, 404, 200, 201]) {
  test(`actual maintenance keeps deletion pending after modeled HTTP${String(status)}`, async () => {
    const f = await createFixture();
    try {
      const [artifact] = await writeRegistryDeletionFixture(f.directory);
      const content = new Map<string, Uint8Array<ArrayBuffer>>();
      const put = async (relative: string, bytes: string | Uint8Array) => {
        const path = join(f.registryPath, 'docker/registry/v2', relative);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
      };
      for (const entry of artifact.contents) {
        const bytes = new Uint8Array(await (await verifyContent(entry)).arrayBuffer());
        content.set(entry.digest, bytes);
        const hex = entry.digest.slice(7);
        await put(`blobs/sha256/${hex.slice(0, 2)}/${hex}/data`, bytes);
        await put(
          `repositories/${artifact.repository}/${entry.isManifest ? '_manifests/revisions' : '_layers'}/sha256/${hex}/link`,
          entry.digest,
        );
      }
      await put(
        `repositories/${artifact.repository}/_manifests/tags/${artifact.reference}/current/link`,
        artifact.digest,
      );
      await put(
        `repositories/${artifact.repository}/_manifests/tags/${artifact.reference}/index/sha256/${artifact.digest.slice(7)}/link`,
        artifact.digest,
      );
      const state = (await executeRegistryCommand(f.journalPath, { command: 'read' }, f.ports))
        .state;
      const reserved = await executeRegistryCommand(
        f.journalPath,
        {
          command: 'reserve-publication',
          expectedRevision: state.revision,
          operationId: 'expired-publication',
          owner: 'owner',
          product: 'fixture',
          roots: [artifact.digest],
          references: [{ repository: artifact.repository, digest: artifact.digest }],
          envelope: { bytes: 1048576, inodes: 100 },
        },
        f.ports,
      );
      if (reserved.token === undefined) throw new Error('Missing actual publication capability');
      await executeRegistryCommand(
        f.journalPath,
        {
          command: 'finish-publication',
          expectedRevision: reserved.state.revision,
          operationId: 'expired-publication',
          owner: 'owner',
          token: reserved.token,
          outcome: 'completed',
          reconciled: true,
        },
        f.ports,
      );
      await executeRegistryCommand(f.journalPath, { command: 'upgrade-maintenance' }, f.ports);
      f.advance();
      let deletes = 0;
      f.server.reload({
        fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === '/v2/_catalog')
            return Response.json({ repositories: [artifact.repository] });
          if (path === `/v2/${artifact.repository}/tags/list`)
            return Response.json({ name: artifact.repository, tags: [artifact.reference] });
          if (
            request.method === 'DELETE' &&
            path === `/v2/${artifact.repository}/manifests/${artifact.digest}`
          ) {
            deletes++;
            return new Response('', { status });
          }
          const reference = path.split('/').at(-1);
          const digest = reference === artifact.reference ? artifact.digest : reference;
          const bytes = digest === undefined ? undefined : content.get(digest);
          if (digest === undefined || bytes === undefined)
            throw new Error('Unexpected modeled registry read');
          return new Response(bytes, {
            headers: {
              'content-type': 'application/vnd.oci.image.manifest.v1+json',
              'docker-content-digest': digest,
            },
          });
        },
      });
      let failure: unknown;
      try {
        await maintainRegistry({
          directory: f.journalPath,
          operationId: 'retire-status',
          owner: 'owner',
          kind: 'retirement',
          ports: f.ports,
          runtime: f.runtime,
          backup: f.backup,
        });
      } catch (cause) {
        failure = cause;
      }
      const final = (await executeRegistryCommand(f.journalPath, { command: 'read' }, f.ports))
        .state;
      if (final.schemaVersion !== 4) throw new Error('Missing upgraded maintenance fixture');
      console.log(
        JSON.stringify({
          status,
          deletes,
          phase: final.maintenance?.phase,
          deletionStates: final.maintenanceEvidence?.deletions.map((d) => d.state),
          failure: failure instanceof Error ? failure.message : 'unknown',
        }),
      );
      expect(deletes).toBe(1);
      expect(final.maintenanceEvidence?.deletions.map((d) => d.state)).toEqual(['pending']);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(
        status >= 400
          ? `Managed registry request failed with HTTP ${String(status)}: `
          : `Manifest deletion is unconfirmed (${String(status)})`,
      );
      expect(final.fenced).toBe(true);
      expect(final.retirements).toHaveLength(0);
      expect(f.calls.includes('gc')).toBe(false);
      expect(f.calls.includes('restore')).toBe(false);
    } finally {
      await f.server.stop(true);
    }
  });
}
