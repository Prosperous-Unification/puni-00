import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** One Distribution v2 registry reached with optional basic auth and a private CA. */
export interface RegistryEndpoint {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  readonly ca?: string;
}

const manifestTypes = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
];
const indexTypes = new Set(manifestTypes.slice(0, 2));

function sha256Digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function request(
  endpoint: RegistryEndpoint,
  path: string,
  init: Omit<RequestInit, 'headers'> & { readonly headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers };
  if (endpoint.username !== undefined) {
    const credential = `${endpoint.username}:${endpoint.password ?? ''}`;
    headers['authorization'] = `Basic ${Buffer.from(credential).toString('base64')}`;
  }
  const url = path.startsWith('http') ? path : `${endpoint.url}${path}`;
  return fetch(url, {
    ...init,
    headers,
    ...(endpoint.ca === undefined ? {} : { tls: { ca: endpoint.ca } }),
  });
}

async function requireOk(response: Response, action: string): Promise<Response> {
  if (!response.ok) {
    throw new Error(
      `${action} failed with HTTP ${String(response.status)}: ${await response.text()}`,
    );
  }
  return response;
}

interface Descriptor {
  readonly digest: string;
}

function descriptorsOf(manifest: unknown, key: 'manifests' | 'layers'): Descriptor[] {
  if (typeof manifest !== 'object' || manifest === null || !(key in manifest)) return [];
  const entries: unknown = Reflect.get(manifest, key);
  if (!Array.isArray(entries)) throw new Error(`Manifest ${key} is not a list`);
  return entries.map((entry: unknown) => {
    const digest: unknown =
      typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'digest') : undefined;
    if (typeof digest !== 'string') throw new Error(`Manifest ${key} entry has no digest`);
    return { digest };
  });
}

async function copyBlob(
  source: RegistryEndpoint,
  target: RegistryEndpoint,
  repository: string,
  digest: string,
): Promise<boolean> {
  const existing = await request(target, `/v2/${repository}/blobs/${digest}`, { method: 'HEAD' });
  if (existing.ok) return false;
  const response = await requireOk(
    await request(source, `/v2/${repository}/blobs/${digest}`),
    `Reading blob ${digest}`,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256Digest(bytes) !== digest) {
    // Proof: removing this comparison made the corrupted-source-blob negative resolve on 2026-09-18.
    throw new Error(`Source blob ${digest} does not match its digest`);
  }
  const upload = await requireOk(
    await request(target, `/v2/${repository}/blobs/uploads/`, { method: 'POST' }),
    `Starting upload of ${digest}`,
  );
  const location = upload.headers.get('location');
  if (location === null) throw new Error(`Upload of ${digest} returned no location`);
  const uploadUrl = new URL(location, target.url);
  uploadUrl.searchParams.set('digest', digest);
  await requireOk(
    await request(target, uploadUrl.toString(), {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': 'application/octet-stream' },
    }),
    `Completing upload of ${digest}`,
  );
  return true;
}

/**
 * Copy one image, by tag or digest, between registries without re-encoding it.
 *
 * The manifest bytes are copied verbatim, so the target digest equals the
 * source digest; indexes are copied child by child. Every blob is verified
 * against its digest before upload, and the target's reported manifest digest
 * must equal the source's. Any mismatch throws.
 */
export async function copyImage(
  source: RegistryEndpoint,
  target: RegistryEndpoint,
  repository: string,
  reference: string,
): Promise<{ readonly digest: string; readonly uploadedBlobs: number }> {
  const response = await requireOk(
    await request(source, `/v2/${repository}/manifests/${reference}`, {
      headers: { accept: manifestTypes.join(', ') },
    }),
    `Reading manifest ${repository}:${reference}`,
  );
  const mediaType = response.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256Digest(bytes);
  if (reference.startsWith('sha256:') && reference !== digest) {
    throw new Error(`Source manifest ${reference} does not match its digest`);
  }
  const manifest: unknown = JSON.parse(new TextDecoder().decode(bytes));
  let uploadedBlobs = 0;
  if (indexTypes.has(mediaType)) {
    for (const child of descriptorsOf(manifest, 'manifests')) {
      uploadedBlobs += (await copyImage(source, target, repository, child.digest)).uploadedBlobs;
    }
  } else {
    const config: unknown =
      typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'config') : null;
    const blobs = [
      ...descriptorsOf({ layers: [config] }, 'layers'),
      ...descriptorsOf(manifest, 'layers'),
    ];
    for (const blob of blobs) {
      if (await copyBlob(source, target, repository, blob.digest)) uploadedBlobs += 1;
    }
  }
  const stored = await requireOk(
    await request(target, `/v2/${repository}/manifests/${reference}`, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': mediaType },
    }),
    `Writing manifest ${repository}:${reference}`,
  );
  const storedDigest = stored.headers.get('docker-content-digest');
  if (storedDigest !== digest) {
    // Proof: removing this comparison made the rewritten-digest negative resolve on 2026-09-18.
    throw new Error(
      `Target stored ${repository}:${reference} as ${String(storedDigest)}, not ${digest}`,
    );
  }
  return { digest, uploadedBlobs };
}

function endpointFromEnv(prefix: string, url: string, ca: string | undefined): RegistryEndpoint {
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  return {
    url,
    ...(username === undefined ? {} : { username, password: password ?? '' }),
    ...(ca === undefined ? {} : { ca }),
  };
}

if (import.meta.main) {
  const [command, sourceUrl, targetUrl, ...images] = process.argv.slice(2);
  // A nonempty image list implies both URLs are present.
  if (command !== 'copy' || images.length === 0) {
    throw new Error(
      'Usage: platform-registry.ts copy <source-url> <target-url> <repository:tag>...',
    );
  }
  const caPath = process.env['TARGET_CA_FILE'];
  const target = endpointFromEnv(
    'TARGET',
    targetUrl,
    caPath === undefined ? undefined : await readFile(caPath, 'utf8'),
  );
  const source = endpointFromEnv('SOURCE', sourceUrl, undefined);
  for (const image of images) {
    const separator = image.lastIndexOf(':');
    if (separator <= 0) throw new Error(`${image} must be repository:tag`);
    const copied = await copyImage(
      source,
      target,
      image.slice(0, separator),
      image.slice(separator + 1),
    );
    console.log(JSON.stringify({ image, ...copied }));
  }
}
