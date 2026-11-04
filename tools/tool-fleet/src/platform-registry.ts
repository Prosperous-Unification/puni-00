import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { inspectOciArchive, type RegistryArtifact, verifyContent } from './registry-artifact';
import {
  admitExportScratch,
  checkExportScratch,
  connectRegistryAuthority,
  readPublicationEnrollment,
} from './registry-enrollment';
import { publishArtifacts, type RegistryUploadOwnership } from './registry-publication';
import { consumeRegistryStream, readRegistryBytes } from './registry-stream';

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
async function copyLegacyImage(
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
      uploadedBlobs += (await copyLegacyImage(source, target, repository, child.digest))
        .uploadedBlobs;
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

/** Managed HTTP rejects redirects and limits received error diagnostics to 64 KiB. */
export async function requestRegistry(
  endpoint: RegistryEndpoint,
  path: string,
  init: Omit<RequestInit, 'headers'> & { readonly headers?: Record<string, string> } = {},
) {
  // Proof: removing redirect refusal delivered the managed upload request to the foreign HTTP fixture.
  const response = await request(endpoint, path, { ...init, redirect: 'error' });
  if (!response.ok) {
    const diagnostic = await readRegistryBytes(response.body, 65536, 'Registry HTTP diagnostic');
    throw new Error(
      `Managed registry request failed with HTTP ${String(response.status)}: ${new TextDecoder().decode(diagnostic)}`,
    );
  }
  return response;
}

/** A blob-only repository has no manifest namespace. The caller must prove that physical/owned condition; only the pinned exact NAME_UNKNOWN response is accepted, never arbitrary 404/null/error. */
export async function requireRegistryUnknownRepository(
  endpoint: RegistryEndpoint,
  repository: string,
): Promise<void> {
  const response = await request(endpoint, `/v2/${repository}/tags/list?n=100`, {
    redirect: 'error',
  });
  const bytes = await readRegistryBytes(response.body, 65536, 'Registry absent manifest namespace');
  const absence = type({
    errors: type({
      code: "'NAME_UNKNOWN'",
      message: "'repository name not known to registry'",
      detail: { name: 'string', '+': 'reject' },
      '+': 'reject',
    })
      .array()
      .exactlyLength(1),
    '+': 'reject',
  }).assert(JSON.parse(new TextDecoder().decode(bytes)));
  // Proof: independent status/name removals admitted HTTP200 and foreign-repository responses (task8-removal-repository-{status,name}.log).
  if (
    response.status !== 404 ||
    response.headers.has('link') ||
    absence.errors[0]?.detail.name !== repository
  )
    throw new Error('Unproven absent registry manifest namespace');
}

/**
 * Stage source closure inside enforced scratch before target writes. Manifest streams are
 * cancelled above 4 MiB before decoding or traversing them; Content-Length is not trusted.
 */
export async function snapshotImage(
  source: RegistryEndpoint,
  directory: string,
  repository: string,
  reference: string,
): Promise<RegistryArtifact> {
  await mkdir(join(directory, 'blobs/sha256'), { recursive: true });
  const visited = new Set<string>();
  const visit = async (
    reference: string,
  ): Promise<{ digest: string; mediaType: string; size: number }> => {
    const response = await requireOk(
      await requestRegistry(source, `/v2/${repository}/manifests/${reference}`, {
        headers: { accept: manifestTypes.join(', ') },
      }),
      'Reading source image manifest',
    );
    const bytes = await readRegistryBytes(response.body, 4 * 1024 * 1024, 'Source manifest');
    const digest = sha256Digest(bytes);
    if (reference.startsWith('sha256:') && reference !== digest)
      throw new Error('Source manifest digest mismatch');
    const mediaType = response.headers.get('content-type');
    if (mediaType === null || !manifestTypes.includes(mediaType))
      throw new Error('Unsupported source image type');
    if (visited.has(digest)) return { digest, mediaType, size: bytes.length };
    visited.add(digest);
    await writeFile(join(directory, 'blobs/sha256', digest.slice(7)), bytes);
    const manifest: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (indexTypes.has(mediaType)) {
      for (const child of descriptorsOf(manifest, 'manifests')) await visit(child.digest);
    } else {
      const config: unknown =
        typeof manifest === 'object' && manifest !== null
          ? Reflect.get(manifest, 'config')
          : undefined;
      for (const blob of [
        ...descriptorsOf({ layers: [config] }, 'layers'),
        ...descriptorsOf(manifest, 'layers'),
      ]) {
        if (!/^sha256:[0-9a-f]{64}$/.test(blob.digest))
          throw new Error('Invalid source blob digest');
        const response = await requireOk(
          await requestRegistry(source, `/v2/${repository}/blobs/${blob.digest}`),
          'Reading source blob',
        );
        await Bun.write(join(directory, 'blobs/sha256', blob.digest.slice(7)), response);
      }
    }
    return { digest, mediaType, size: bytes.length };
  };
  const root = await visit(reference);
  await writeFile(
    join(directory, 'index.json'),
    JSON.stringify({ schemaVersion: 2, manifests: [root] }),
  );
  await writeFile(join(directory, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}');
  const archive = join(directory, 'image.tar');
  const tar = Bun.spawnSync([
    '/usr/bin/tar',
    '--format=ustar',
    '-cf',
    archive,
    '-C',
    directory,
    'index.json',
    'oci-layout',
    'blobs',
  ]);
  if (tar.exitCode !== 0)
    throw new Error(`Bounded import archive failed: ${tar.stderr.toString()}`);
  return inspectOciArchive(archive, repository, reference);
}

/** Copy all required product images under one admission; a subset cannot become a complete bundle. */
export async function copyImages(
  source: RegistryEndpoint,
  target: RegistryEndpoint,
  images: readonly { repository: string; reference: string }[],
  select: typeof readPublicationEnrollment = readPublicationEnrollment,
) {
  // Proof: removing managed admission selection copied blobs despite the selected missing enrollment.
  const enrollment = await select(target.url);
  if (enrollment === undefined) {
    const copied = [];
    for (const image of images)
      copied.push(await copyLegacyImage(source, target, image.repository, image.reference));
    return copied;
  }
  const repositories = images.map((image) => image.repository);
  if (
    new Set(repositories).size !== repositories.length ||
    repositories.length !== enrollment.requiredRepositories.length ||
    enrollment.requiredRepositories.some((repository) => !repositories.includes(repository))
  )
    throw new Error('Import omits required product repositories');
  const scratch = await admitExportScratch(enrollment);
  const directory = await mkdtemp(join(enrollment.builder.path, 'import-'));
  try {
    const artifacts: RegistryArtifact[] = [];
    for (const [index, image] of images.entries())
      artifacts.push(
        await snapshotImage(
          source,
          join(directory, String(index)),
          image.repository,
          image.reference,
        ),
      );
    await checkExportScratch(enrollment, scratch);
    const uploads = new Map<string, number>();
    const publication = await publishArtifacts(
      enrollment,
      artifacts,
      connectRegistryAuthority(enrollment),
      async (artifact, ownership) => {
        uploads.set(artifact.repository, await uploadArtifact(target, artifact, ownership));
      },
    );
    return artifacts.map((artifact) => {
      const uploadedBlobs = uploads.get(artifact.repository);
      if (uploadedBlobs === undefined) throw new Error('Completed import omitted upload receipt');
      return { digest: artifact.digest, uploadedBlobs, publication };
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}

/** Single-image compatibility entrypoint; managed multi-tier enrollment still requires its entire bundle. */
export async function copyImage(
  source: RegistryEndpoint,
  target: RegistryEndpoint,
  repository: string,
  reference: string,
  select: typeof readPublicationEnrollment = readPublicationEnrollment,
) {
  const copied = (await copyImages(source, target, [{ repository, reference }], select)).at(0);
  if (copied === undefined) throw new Error('Image copy omitted its receipt');
  return copied;
}

/**
 * Transfer the exact inspected archive byte ranges. Dependency-first manifest writes preserve
 * index closure. Every source range is rehashed before POST, then every target object is read
 * and hashed before the caller may claim a durable bundle receipt. Target responses are
 * cancelled as soon as they exceed the admitted content size.
 */
export async function uploadArtifact(
  target: RegistryEndpoint,
  artifact: RegistryArtifact,
  ownership?: RegistryUploadOwnership,
): Promise<number> {
  let uploadedBlobs = 0;
  for (const content of artifact.contents) {
    const bytes = await verifyContent(content);
    if (content.isManifest) {
      const reference = content.digest === artifact.digest ? artifact.reference : content.digest;
      await ownership?.({
        repository: artifact.repository,
        digest: content.digest,
        uploadId: null,
        phase: 'writing',
      });
      const stored = await requireOk(
        await requestRegistry(target, `/v2/${artifact.repository}/manifests/${reference}`, {
          method: 'PUT',
          body: bytes,
          headers: { 'content-type': content.mediaType },
        }),
        'Writing admitted manifest',
      );
      if (stored.headers.get('docker-content-digest') !== content.digest)
        // Proof: removing this refusal accepted the rewritten manifest receipt fixture.
        throw new Error('Target manifest differs from admitted digest');
      if (ownership !== undefined && stored.status !== 201)
        throw new Error('Manifest write did not confirm stored content');
      await ownership?.({
        repository: artifact.repository,
        digest: content.digest,
        uploadId: null,
        phase: 'stored',
      });
    } else {
      const upload = await requireOk(
        await requestRegistry(target, `/v2/${artifact.repository}/blobs/uploads/`, {
          method: 'POST',
        }),
        'Starting admitted blob upload',
      );
      const location = upload.headers.get('location');
      if (location === null) throw new Error('Admitted blob upload returned no location');
      const url = new URL(location, target.url);
      if (url.origin !== new URL(target.url).origin)
        // Proof: removing this refusal sent content to the foreign upload continuation fixture.
        throw new Error('Registry upload redirected outside enrolled authority');
      const uploadId = upload.headers.get('docker-upload-uuid');
      if (ownership !== undefined) {
        // Proof: failed durable UUID acknowledgement and UUID/Location mismatch both prevent the actual HTTP body in registry-upload-ownership.test.ts.
        if (
          upload.status !== 202 ||
          uploadId === null ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uploadId) ||
          url.pathname !== `/v2/${artifact.repository}/blobs/uploads/${uploadId}`
        )
          throw new Error('Registry upload UUID does not match exact continuation');
        await ownership({
          repository: artifact.repository,
          digest: content.digest,
          uploadId,
          phase: 'writing',
        });
      }
      url.searchParams.set('digest', content.digest);
      const completed = await requireOk(
        await requestRegistry(target, url.toString(), {
          method: 'PUT',
          body: bytes,
          headers: { 'content-type': 'application/octet-stream' },
        }),
        'Completing admitted blob upload',
      );
      if (ownership !== undefined) {
        if (
          completed.status !== 201 ||
          completed.headers.get('docker-content-digest') !== content.digest ||
          uploadId === null
        )
          throw new Error('Blob write did not confirm admitted stored content');
        await ownership({
          repository: artifact.repository,
          digest: content.digest,
          uploadId,
          phase: 'stored',
        });
      }
      uploadedBlobs += 1;
    }
  }
  for (const content of artifact.contents) {
    const response = await requireOk(
      await requestRegistry(
        target,
        `/v2/${artifact.repository}/${content.isManifest ? 'manifests' : 'blobs'}/${content.digest}`,
        { headers: { accept: manifestTypes.join(', ') } },
      ),
      'Verifying admitted content',
    );
    if (response.body === null) throw new Error('Target omitted admitted content');
    const hash = createHash('sha256');
    const size = await consumeRegistryStream(
      response.body,
      content.size,
      'Target admitted content',
      (bytes) => {
        hash.update(bytes);
      },
    );
    if (size !== content.size || `sha256:${hash.digest('hex')}` !== content.digest)
      // Proof: removing this refusal completed publication after the target corrupted stored blob bytes.
      throw new Error('Target content differs from admitted closure');
  }
  return uploadedBlobs;
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
  const references = images.map((image) => {
    const separator = image.lastIndexOf(':');
    if (separator <= 0) throw new Error(`${image} must be repository:tag`);
    return { repository: image.slice(0, separator), reference: image.slice(separator + 1) };
  });
  const copied = await copyImages(source, target, references);
  for (const [index, image] of images.entries()) {
    const receipt = copied.at(index);
    if (receipt === undefined) throw new Error('Image copy omitted its receipt');
    console.log(JSON.stringify({ image, ...receipt }));
  }
}
