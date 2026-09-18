import { createHash } from 'node:crypto';

const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/**
 * A loopback registry v2 stand-in for tests: one image per name, published as an OCI index →
 * manifest → config chain whose config carries `WBS_SHA` = the given label (or none for `null`).
 * `lie` answers every digest with other bytes; `user` requires Basic auth.
 */
export function fakeRegistry(
  labels: Record<string, string | null>,
  options: { lie?: boolean; user?: string } = {},
): { ref: (name: string) => string; stop: () => Promise<void> } {
  const blobs = new Map<string, string>();
  const images: Record<string, string> = {};
  for (const [name, label] of Object.entries(labels)) {
    const config = JSON.stringify({
      config: { Labels: label === null ? null : { WBS_SHA: label } },
      // Distinct configs per name, so two images with one label keep distinct digests.
      name,
    });
    blobs.set(sha(config), config);
    const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: sha(config) } });
    blobs.set(sha(manifest), manifest);
    const index = JSON.stringify({
      manifests: [{ digest: sha(manifest), platform: { os: 'linux', architecture: 'amd64' } }],
    });
    blobs.set(sha(index), index);
    images[name] = sha(index);
  }
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      if (options.user !== undefined) {
        const expected = `Basic ${Buffer.from(options.user).toString('base64')}`;
        if (request.headers.get('authorization') !== expected) {
          return new Response('', { status: 401 });
        }
      }
      const digest = new URL(request.url).pathname.split('/').at(-1) ?? '';
      const body = blobs.get(digest);
      if (body === undefined) return new Response('', { status: 404 });
      return new Response(options.lie === true ? `${body} ` : body);
    },
  });
  return {
    ref: (name) => `127.0.0.1:${String(server.port)}/${name}@${images[name]}`,
    stop: () => server.stop(true),
  };
}
