import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import { invokeRegistryCallback } from './registry-callback';
import type { RegistryPublicationWrite } from './registry-publication-evidence';
import { requireRejection } from './registry-rejection.fixture';
async function fixture(foreignUuid = false) {
  const directory = await scratchAsync('registry-upload-owner-');
  const contents = [];
  for (const [name, bytes, isManifest, mediaType] of [
    ['config', 'owned config', false, 'application/vnd.oci.image.config.v1+json'],
    ['manifest', '{"owned":"manifest"}', true, 'application/vnd.oci.image.manifest.v1+json'],
  ] as const) {
    const path = join(directory, name);
    await writeFile(path, bytes);
    contents.push({
      path,
      offset: 0,
      digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      size: Buffer.byteLength(bytes),
      mediaType,
      isManifest,
      dependencies: [] as string[],
    });
  }
  contents[1].dependencies.push(contents[0].digest);
  const artifact: RegistryArtifact = {
    repository: 'owned/image',
    reference: 'candidate',
    digest: contents[1].digest,
    contents,
  };
  const uuid = '00000000-0000-4000-8000-000000000001';
  const events: string[] = [];
  const stored = new Map<string, Uint8Array>();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url);
      if (request.method === 'POST') {
        events.push('POST');
        return new Response(null, {
          status: 202,
          headers: {
            location: `/v2/owned/image/blobs/uploads/${uuid}?_state=fixture-private-continuation`,
            'docker-upload-uuid': foreignUuid ? '00000000-0000-4000-8000-000000000002' : uuid,
          },
        });
      }
      if (request.method === 'PUT') {
        events.push(path.pathname.includes('/manifests/') ? 'PUT-manifest' : 'PUT-blob');
        const bytes = new Uint8Array(await request.arrayBuffer());
        const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
        stored.set(digest, bytes);
        return new Response(null, { status: 201, headers: { 'docker-content-digest': digest } });
      }
      const digest = path.pathname.split('/').at(-1);
      const bytes = digest === undefined ? undefined : stored.get(digest);
      return bytes === undefined
        ? new Response(null, { status: 404 })
        : new Response(Buffer.from(bytes), { headers: { 'docker-content-digest': digest ?? '' } });
    },
  });
  return {
    artifact,
    uuid,
    events,
    server,
    endpoint: { url: server.url.toString().replace(/\/$/, '') },
  };
}
test('actual uploader durably acknowledges exact upload UUID and manifest intent before either body', async () => {
  const proof = await fixture();
  try {
    const writes: RegistryPublicationWrite[] = [];
    await uploadArtifact(proof.endpoint, proof.artifact, (write) =>
      invokeRegistryCallback(() => {
        writes.push(write);
        proof.events.push(`${write.phase}:${write.uploadId === null ? 'manifest' : 'blob'}`);
      }),
    );
    expect(proof.events).toEqual([
      'POST',
      'writing:blob',
      'PUT-blob',
      'stored:blob',
      'writing:manifest',
      'PUT-manifest',
      'stored:manifest',
    ]);
    expect(writes[0].uploadId).toBe(proof.uuid);
    expect(JSON.stringify(writes)).not.toContain('_state');
    expect(JSON.stringify(writes)).not.toContain('path');
  } finally {
    await proof.server.stop(true);
  }
});
test('failed durable UUID acknowledgement prevents sending the upload body', async () => {
  const proof = await fixture();
  try {
    expect(
      (
        await requireRejection(
          uploadArtifact(proof.endpoint, proof.artifact, () =>
            invokeRegistryCallback(() => {
              throw new Error('journal acknowledgement unavailable');
            }),
          ),
        )
      ).throwCause,
    ).toThrow('journal acknowledgement');
    expect(proof.events).toEqual(['POST']);
  } finally {
    await proof.server.stop(true);
  }
});
test('UUID/header continuation mismatch refuses before acknowledging ownership or sending content', async () => {
  const proof = await fixture(true);
  try {
    expect(
      (
        await requireRejection(
          uploadArtifact(proof.endpoint, proof.artifact, () =>
            invokeRegistryCallback(() => {
              throw new Error('must not record foreign UUID');
            }),
          ),
        )
      ).throwCause,
    ).toThrow('upload UUID');
    expect(proof.events).toEqual(['POST']);
  } finally {
    await proof.server.stop(true);
  }
});
