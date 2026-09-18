import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import { copyImage } from './platform-registry';

const manifestType = 'application/vnd.docker.distribution.manifest.v2+json';

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** An in-memory Distribution v2 subset: blobs, monolithic uploads and manifests. */
function fakeRegistry(options: { readonly rewriteManifestDigest?: boolean } = {}) {
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
        blobs.set(digest, new Uint8Array(await request.arrayBuffer()));
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
      expect(copyImage({ url: source.url }, { url: target.url }, 'wbs/be-01', '1')).rejects.toThrow(
        /does not match its digest/,
      );
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
      expect(copyImage({ url: source.url }, { url: target.url }, 'wbs/be-01', '1')).rejects.toThrow(
        /Target stored wbs\/be-01:1 as sha256:0+/,
      );
    } finally {
      await source.server.stop(true);
      await target.server.stop(true);
    }
  });
});
