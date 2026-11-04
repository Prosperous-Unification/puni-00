import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { verifyContent } from './registry-artifact';
import { executeRegistryCommand } from './registry-journal';
import { requireRejection } from './registry-rejection.fixture';

// Builder changes that omit content, misdeclare its size/hash or change its physical bytes
// must fail the actual uploader verifier before any HTTP request can be attempted.
test('pressure upload artifact supplies an exact fixed OCI closure to the real verifier', async () => {
  const { writeRegistryPressureUpload } = await import('./registry-upload-pressure.fixture');
  const directory = await scratchAsync('registry-pressure-artifact-');
  const artifact = await writeRegistryPressureUpload(directory);
  expect(artifact.repository).toBe('pressure/full');
  expect(artifact.reference).toBe('candidate');
  expect(artifact.contents).toHaveLength(3);
  const verified = await Promise.all(
    artifact.contents.map((content) => verifyContent(content).then((blob) => blob.text())),
  );
  expect(verified[0]).toBe('{"task8":"full"}');
  expect(verified[1]).toBe('owned upload pressure layer');
  expect(artifact.contents[0].isManifest).toBe(false);
  expect(artifact.contents[1].isManifest).toBe(false);
  expect(artifact.contents[2].isManifest).toBe(true);
  expect(artifact.digest).toBe(artifact.contents[2].digest);
  expect(artifact.contents[2].dependencies).toEqual([
    artifact.contents[0].digest,
    artifact.contents[1].digest,
  ]);
  expect(JSON.parse(verified[2])).toEqual({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      digest: artifact.contents[0].digest,
      size: 16,
      mediaType: 'application/vnd.oci.image.config.v1+json',
    },
    layers: [
      {
        digest: artifact.contents[1].digest,
        size: 27,
        mediaType: 'application/vnd.oci.image.layer.v1.tar',
      },
    ],
  });
});

test('pressure upload artifact refuses occupied scratch without overwriting it', async () => {
  const { writeRegistryPressureUpload } = await import('./registry-upload-pressure.fixture');
  const directory = await scratchAsync('registry-pressure-occupied-');
  await writeFile(join(directory, 'pressure-config'), 'existing owned content');
  expect((await requireRejection(writeRegistryPressureUpload(directory))).throwCause).toThrow();
  expect(await readFile(join(directory, 'pressure-config'), 'utf8')).toBe('existing owned content');
  expect(await readdir(directory)).toEqual(['pressure-config']);
});

for (const refused of [false, true]) {
  test(
    'managed pressure client ' +
      (refused
        ? 'refuses admission before POST'
        : 'persists UUID before fill and failed ownership afterward'),
    async () => {
      const { createRegistryUploadPressure, publishRegistryPressureUpload } =
        await import('./registry-upload-pressure.fixture');
      const directory = await scratchAsync('registry-pressure-client-');
      const journal = await scratchAsync('registry-pressure-journal-');
      const GiB = 1024 ** 3;
      const ports = {
        now: () => '2026-10-31T00:00:00.000Z',
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
            usedBytes: (refused ? 45 : 1) * GiB,
            totalInodes: 100000,
            usedInodes: 1000,
            rootFreeBytes: 30 * GiB,
          }),
      };
      await executeRegistryCommand(
        journal,
        {
          command: 'initialize',
          enrollment: {
            registryId: 'upload-proof',
            storageId: 'fixture-volume',
            registryPath: '/registry',
            rootPath: '/',
            owners: ['operator'],
            maximumBytes: 50 * GiB,
            journalMaximumBytes: GiB,
          },
        },
        ports,
      );
      const upgraded = await executeRegistryCommand(
        journal,
        { command: 'upgrade-maintenance' },
        ports,
      );
      // Fixture input only: physical bootstrap/maintenance and capacity are modeled here;
      // every subsequent reservation, UUID acknowledgement and failure write is actual.
      await writeFile(
        join(journal, 'journal.json'),
        JSON.stringify({
          ...upgraded.state,
          fenced: false,
          fenceReason: null,
          maintenanceVerified: true,
        }) + '\n',
      );
      const config = Buffer.from('{"task8":"full"}');
      const configDigest = 'sha256:' + createHash('sha256').update(config).digest('hex');
      const uuid = 'aabbccdd-1234-4234-8234-aabbccddeeff';
      const effects: string[] = [];
      let beforeAllocation: Awaited<ReturnType<typeof executeRegistryCommand>>['state'] | undefined;
      const proxy = createRegistryUploadPressure(
        { digest: configDigest, size: 16 },
        async () => {
          const state = (await executeRegistryCommand(journal, { command: 'read' }, ports)).state;
          beforeAllocation = state;
          effects.push('fill-after-durable-UUID');
        },
        (incoming) => {
          effects.push(incoming.method);
          if (incoming.method === 'POST')
            return Promise.resolve(
              new Response(null, {
                status: 202,
                headers: {
                  location: '/v2/pressure/full/blobs/uploads/' + uuid,
                  'docker-upload-uuid': uuid,
                },
              }),
            );
          if (incoming.method !== 'PUT') throw new Error('Unexpected client request');
          return Promise.resolve(
            new Response(
              JSON.stringify({
                errors: [
                  {
                    code: 'UNKNOWN',
                    message: 'unknown error',
                    detail: {
                      Op: 'write',
                      Path:
                        '/var/lib/puni-registry/registry/contents/docker/registry/v2/repositories/pressure/full/_uploads/' +
                        uuid +
                        '/data',
                      Err: 28,
                    },
                  },
                ],
              }),
              { status: 500 },
            ),
          );
        },
      );
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: (incoming) => proxy.fetch(incoming),
        error: () => new Response('owned proxy refused', { status: 503 }),
      });
      try {
        const rejection = await requireRejection(
          publishRegistryPressureUpload({
            directory,
            journalPath: journal,
            registryId: 'upload-proof',
            endpoint: { url: server.url.origin },
            ports,
          }),
        );
        expect(rejection.throwCause).toThrow();
        const state = (await executeRegistryCommand(journal, { command: 'read' }, ports)).state;
        if (refused) {
          expect(effects).toEqual([]);
          expect(state.publication).toBeNull();
          expect(state.reservations).toEqual([]);
          expect(() => proxy.verify()).toThrow();
        } else {
          expect(rejection.throwCause).toThrow('Managed registry request failed with HTTP 500');
          expect(effects).toEqual(['POST', 'fill-after-durable-UUID', 'PUT']);
          if (beforeAllocation?.schemaVersion !== 4)
            throw new Error('Missing schema4 allocation snapshot');
          const selectedOperation = beforeAllocation.publication?.operationId;
          const evidence = beforeAllocation.publicationEvidence.find(
            (record) => record.operationId === selectedOperation,
          );
          expect(evidence?.writes).toEqual([
            {
              repository: 'pressure/full',
              digest: configDigest,
              uploadId: uuid,
              phase: 'writing',
              at: '2026-10-31T00:00:00.000Z',
            },
          ]);
          expect(beforeAllocation.publication?.phase).toBe('uploading');
          expect(beforeAllocation.reservations).toHaveLength(1);

          expect(proxy.verify()).toEqual({
            status: 500,
            bytes: 16,
            allocationBeforeBody: true,
            enospc: true,
          });
          expect(state.fenced).toBe(true);
          expect(state.fenceReason).toBe('publication-failed');
          expect(state.publication?.phase).toBe('failed');
          expect(state.publication?.failure).toContain('"Err":28');
          expect(state.reservations).toHaveLength(1);
          expect(state.bundles).toHaveLength(1);
          expect(state.bundles[0].receipt.state).toBe('unfinished');
        }
      } finally {
        await server.stop(true);
      }
    },
  );
}
