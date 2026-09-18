import { createHash } from 'node:crypto';

/** The image config label Dagger stamps with the commit it built (`tool-dagger` `WBS_SHA`). */
export const REVISION_LABEL = 'WBS_SHA';

const REF = /^(?<host>[^/@]+)\/(?<name>[^@]+)@(?<digest>sha256:[0-9a-f]{64})$/;
const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/** Reads one digest-pinned image's `WBS_SHA` label, or `null` when the config has none. */
export type RevisionReader = (ref: string) => Promise<string | null>;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * A registry v2 reader. Loopback registries (the k3d lab, tests) use HTTP; every other host
 * HTTPS. `auth` is `user:password` for Basic auth (the self-hosted registry's htpasswd), or
 * `null`. Every fetched manifest and config is checked against the digest that named it, so a
 * registry cannot answer for one digest with another image's bytes.
 */
export function registryRevisionReader(auth: string | null): RevisionReader {
  const headers: Record<string, string> =
    auth === null ? {} : { authorization: `Basic ${Buffer.from(auth).toString('base64')}` };
  async function fetchVerified(url: string, digest: string, accept: string): Promise<Uint8Array> {
    const response = await fetch(url, {
      headers: { ...headers, accept },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`${url} answered HTTP ${String(response.status)}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== digest) throw new Error(`${url} returned bytes that are not ${digest}`);
    return bytes;
  }
  return async (ref) => {
    const match = REF.exec(ref)?.groups;
    if (match === undefined) throw new Error(`${ref} is not a registry/name@sha256 reference`);
    const { host, name, digest } = match;
    const hostname = host.split(':')[0];
    const scheme = hostname === '127.0.0.1' || hostname === 'localhost' ? 'http' : 'https';
    const base = `${scheme}://${host}/v2/${name}`;
    let manifest = JSON.parse(
      new TextDecoder().decode(await fetchVerified(`${base}/manifests/${digest}`, digest, ACCEPT)),
    ) as {
      manifests?: { digest: string; platform?: { os?: string; architecture?: string } }[];
      config?: { digest: string };
    };
    if (manifest.manifests !== undefined) {
      const amd64 = manifest.manifests.find(
        (each) => each.platform?.os === 'linux' && each.platform.architecture === 'amd64',
      );
      if (amd64 === undefined) throw new Error(`${ref} has no linux/amd64 image`);
      manifest = JSON.parse(
        new TextDecoder().decode(
          await fetchVerified(`${base}/manifests/${amd64.digest}`, amd64.digest, ACCEPT),
        ),
      ) as typeof manifest;
    }
    const config = manifest.config?.digest;
    if (config === undefined) throw new Error(`${ref} manifest names no config`);
    const parsed = JSON.parse(
      new TextDecoder().decode(await fetchVerified(`${base}/blobs/${config}`, config, '*/*')),
    ) as { config?: { Labels?: Record<string, string> | null } };
    return parsed.config?.Labels?.[REVISION_LABEL] ?? null;
  };
}

/**
 * Every tier image must carry the descriptor's source commit in its `WBS_SHA` label, read from
 * the registry by digest. This binds the digests themselves, not a claim about them, to the
 * commit admission certified.
 */
export async function assertImageRevisions(
  images: Readonly<Record<string, string>>,
  sourceSha: string,
  read: RevisionReader,
): Promise<void> {
  const problems: string[] = [];
  for (const [tier, ref] of Object.entries(images)) {
    const revision = await read(ref);
    // Proof: registry.test.ts `refuses an image built from another commit`; with this
    // comparison removed a gateway labelled 9999… passed for source aaaa….
    if (revision !== sourceSha) {
      problems.push(`${tier} ${ref} is labelled ${REVISION_LABEL}=${String(revision)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`images are not built from ${sourceSha}: ${problems.join('; ')}`);
  }
}
