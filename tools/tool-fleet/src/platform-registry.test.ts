import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import { copyImage, copyImages } from './platform-registry';
import { readPublicationEnrollment } from './registry-enrollment';

/** Await `promise` and return its rejection, so assertions after it observe the settled state. */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('Expected the operation to reject');
}

const manifestType = 'application/vnd.docker.distribution.manifest.v2+json';

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** An in-memory Distribution v2 subset: blobs, monolithic uploads and manifests. */
function fakeRegistry(
  options: { readonly rewriteManifestDigest?: boolean; readonly corruptStoredBlob?: boolean } = {},
) {
  const blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  const manifests = new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>();
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const blob = /^\/v2\/(.+)\/blobs\/(sha256:[0-9a-f]+)$/.exec(url.pathname);
      if (blob?.[2] !== undefined) {
        const bytes = blobs.get(blob[2]);
        if (bytes === undefined) return new Response(null, { status: 404 });
        return new Response(request.method === 'HEAD' ? null : bytes, { status: 200 });
      }
      if (/^\/v2\/.+\/blobs\/uploads\/$/.test(url.pathname) && request.method === 'POST') {
        return new Response(null, {
          status: 202,
          headers: { location: `${url.pathname}upload-1` },
        });
      }
      if (url.pathname.endsWith('/blobs/uploads/upload-1') && request.method === 'PUT') {
        const digest = url.searchParams.get('digest') ?? '';
        blobs.set(
          digest,
          options.corruptStoredBlob === true
            ? new TextEncoder().encode('corrupt stored bytes')
            : new Uint8Array(await request.arrayBuffer()),
        );
        return new Response(null, { status: 201 });
      }
      const manifest = /^\/v2\/(.+)\/manifests\/(.+)$/.exec(url.pathname);
      if (manifest?.[2] !== undefined) {
        if (request.method === 'PUT') {
          const bytes = new Uint8Array(await request.arrayBuffer());
          const type = request.headers.get('content-type') ?? '';
          manifests.set(manifest[2], { bytes, type });
          manifests.set(digestOf(bytes), { bytes, type });
          const reported =
            options.rewriteManifestDigest === true ? `sha256:${'0'.repeat(64)}` : digestOf(bytes);
          return new Response(null, {
            status: 201,
            headers: { 'docker-content-digest': reported },
          });
        }
        const stored = manifests.get(manifest[2]);
        if (stored === undefined) return new Response(null, { status: 404 });
        return new Response(stored.bytes, { headers: { 'content-type': stored.type } });
      }
      return new Response(null, { status: 404 });
    },
  });
  return { blobs, manifests, server, url: `http://127.0.0.1:${String(server.port)}` };
}

function seedImage(registry: ReturnType<typeof fakeRegistry>) {
  const config = new TextEncoder().encode('{"architecture":"amd64"}');
  const layer = new TextEncoder().encode('layer-bytes');
  registry.blobs.set(digestOf(config), config);
  registry.blobs.set(digestOf(layer), layer);
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: manifestType,
      config: {
        mediaType: 'application/vnd.docker.container.image.v1+json',
        digest: digestOf(config),
        size: config.length,
      },
      layers: [
        {
          mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
          digest: digestOf(layer),
          size: layer.length,
        },
      ],
    }),
  );
  registry.manifests.set('1', { bytes: manifest, type: manifestType });
  return { layerDigest: digestOf(layer), manifestDigest: digestOf(manifest) };
}

describe('copyImage', () => {
  it('copies a tagged image and keeps its manifest digest', async () => {
    const source = fakeRegistry();
    const target = fakeRegistry();
    try {
      const { manifestDigest } = seedImage(source);
      const copied = await copyImage({ url: source.url }, { url: target.url }, 'wbs/be-01', '1');
      expect(copied).toEqual({ digest: manifestDigest, uploadedBlobs: 2 });
      expect(target.manifests.has(manifestDigest)).toBe(true);
      expect(
        (await copyImage({ url: source.url }, { url: target.url }, 'wbs/be-01', '1')).uploadedBlobs,
      ).toBe(0);
    } finally {
      await source.server.stop(true);
      await target.server.stop(true);
    }
  });

  it('refuses a source blob whose bytes differ from its digest', async () => {
    const source = fakeRegistry();
    const target = fakeRegistry();
    try {
      const { layerDigest } = seedImage(source);
      source.blobs.set(layerDigest, new TextEncoder().encode('corrupted'));
      expect(
        (await rejectionOf(copyImage({ url: source.url }, { url: target.url }, 'wbs/be-01', '1')))
          .message,
      ).toMatch(/does not match its digest/);
      expect(target.blobs.has(layerDigest)).toBe(false);
    } finally {
      await source.server.stop(true);
      await target.server.stop(true);
    }
  });

  it('refuses a target that stores the manifest under another digest', async () => {
    const source = fakeRegistry();
    const target = fakeRegistry({ rewriteManifestDigest: true });
    try {
      seedImage(source);
      expect(
        (await rejectionOf(copyImage({ url: source.url }, { url: target.url }, 'wbs/be-01', '1')))
          .message,
      ).toMatch(/Target stored wbs\/be-01:1 as sha256:0+/);
    } finally {
      await source.server.stop(true);
      await target.server.stop(true);
    }
  });
});

it('uploads the exact pinned OCI export and verifies its complete target closure', async () => {
  const { inspectOciArchive } = await import('./registry-artifact');
  const { uploadArtifact } = await import('./platform-registry');
  const target = fakeRegistry();
  try {
    const artifact = await inspectOciArchive(
      new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
      'proof',
      'v1',
    );
    await uploadArtifact({ url: target.url }, artifact);
    expect(
      target.manifests.has(
        'sha256:27ddb6fd651405cb8f8b78089a405d330cff8e3154dde0b8bd90febfcd95d7ed',
      ),
    ).toBe(true);
    expect(target.blobs.size).toBe(2);
  } finally {
    await target.server.stop(true);
  }
});

it('managed writer refuses an upload continuation outside the enrolled endpoint', async () => {
  const { inspectOciArchive } = await import('./registry-artifact');
  const { uploadArtifact } = await import('./platform-registry');
  let escaped = 0;
  const elsewhere = Bun.serve({
    port: 0,
    fetch() {
      escaped += 1;
      return new Response(null, { status: 201 });
    },
  });
  const target = Bun.serve({
    port: 0,
    fetch() {
      return new Response(null, {
        status: 202,
        headers: { location: `http://127.0.0.1:${String(elsewhere.port)}/escape` },
      });
    },
  });
  try {
    const artifact = await inspectOciArchive(
      new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
      'proof',
      'v1',
    );
    expect(
      (
        await rejectionOf(
          uploadArtifact(
            {
              url: `http://127.0.0.1:${String(target.port)}`,
              username: 'fixture',
              password: 'fixture',
            },
            artifact,
          ),
        )
      ).message,
    ).toMatch(/outside/);
    expect(escaped).toBe(0);
  } finally {
    await target.stop(true);
    await elsewhere.stop(true);
  }
});

it('copy refuses missing managed admission before POST', async () => {
  const source = fakeRegistry();
  const target = fakeRegistry();
  const selected = process.env['REGISTRY_PUBLICATION_ENROLLMENT'];
  try {
    seedImage(source);
    process.env['REGISTRY_PUBLICATION_ENROLLMENT'] = '/absent-task5-managed-enrollment';
    await rejectionOf(
      copyImages({ url: source.url }, { url: target.url }, [
        { repository: 'wbs/be-01', reference: '1' },
      ]),
    );
    expect(target.blobs.size).toBe(0);
    expect(target.manifests.size).toBe(0);
  } finally {
    if (selected === undefined) delete process.env['REGISTRY_PUBLICATION_ENROLLMENT'];
    else process.env['REGISTRY_PUBLICATION_ENROLLMENT'] = selected;
    await source.server.stop(true);
    await target.server.stop(true);
  }
});
it('managed writer rejects rewritten manifest receipts and cross-origin HTTP redirects', async () => {
  const { inspectOciArchive } = await import('./registry-artifact');
  const { uploadArtifact } = await import('./platform-registry');
  const artifact = await inspectOciArchive(
    new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
    'proof',
    'v1',
  );
  const rewritten = fakeRegistry({ rewriteManifestDigest: true });
  let escaped = 0;
  const elsewhere = Bun.serve({
    port: 0,
    fetch() {
      escaped += 1;
      return new Response(null, { status: 201 });
    },
  });
  const redirect = Bun.serve({
    port: 0,
    fetch() {
      return Response.redirect(`http://127.0.0.1:${String(elsewhere.port)}/escaped`);
    },
  });
  try {
    expect((await rejectionOf(uploadArtifact({ url: rewritten.url }, artifact))).message).toContain(
      'admitted digest',
    );
    await rejectionOf(
      uploadArtifact({ url: `http://127.0.0.1:${String(redirect.port)}` }, artifact),
    );
    expect(escaped).toBe(0);
  } finally {
    await rewritten.server.stop(true);
    await elsewhere.stop(true);
    await redirect.stop(true);
  }
});

it('managed writer refuses corrupt target content before completing its receipt', async () => {
  const { inspectOciArchive } = await import('./registry-artifact');
  const { uploadArtifact } = await import('./platform-registry');
  const target = fakeRegistry({ corruptStoredBlob: true });
  try {
    const artifact = await inspectOciArchive(
      new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
      'proof',
      'v1',
    );
    expect((await rejectionOf(uploadArtifact({ url: target.url }, artifact))).message).toContain(
      'admitted closure',
    );
  } finally {
    await target.server.stop(true);
  }
});

for (const fault of ['missing catalog', 'unreadable catalog', 'malformed catalog']) {
  it(`managed copy refuses ${fault} before HTTP effects`, async () => {
    let reads = 0;
    const read = () => {
      reads++;
      return fault === 'malformed catalog'
        ? Promise.resolve({ invalid: true })
        : Promise.reject(new Error(fault));
    };
    await rejectionOf(
      copyImages(
        { url: 'http://127.0.0.1:1' },
        { url: 'http://127.0.0.1:1' },
        [{ repository: 'proof', reference: '1' }],
        (registry) => readPublicationEnrollment(registry, {}, read),
      ),
    );
    expect(reads).toBe(1);
  });
}
