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

/** Digest-linked OCI metadata; a missing revision label remains an explicit null. */
export interface RegistryImage {
  revision: string | null;
  configDigest: string;
}

/** Resolves only digest-verified manifest, platform child and config bytes within the supplied budget. */
export type RegistryImageReader = (ref: string, timeoutMs?: number) => Promise<RegistryImage>;

/** Reads a pinned image's verified config identity within the observation's remaining deadline. */
export type ConfigDigestReader = (ref: string, timeoutMs: number) => Promise<string>;

/**
 * A registry v2 reader. Loopback registries (the k3d lab, tests) use HTTP; every other host
 * HTTPS. `auth` is `user:password` for Basic auth (the self-hosted registry's htpasswd), or
 * `null`. Every fetched manifest and config is checked against the digest that named it, so a
 * registry cannot answer for one digest with another image's bytes.
 */
export function registryImageReader(auth: string | null): RegistryImageReader {
  const headers: Record<string, string> =
    auth === null ? {} : { authorization: `Basic ${Buffer.from(auth).toString('base64')}` };
  async function fetchVerified(
    url: string,
    digest: string,
    accept: string,
    deadline: number,
  ): Promise<Uint8Array> {
    // Proof: malformed-child test refuses before a child request; removing syntax validation changes that boundary.
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('malformed registry digest');
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new Error('registry image deadline exceeded');
    const response = await fetch(url, {
      headers: { ...headers, accept },
      // Proof: replacing this bound with 60s admitted the delayed config-body fixture.
      signal: AbortSignal.timeout(remaining),
    });
    if (!response.ok) throw new Error(`${url} answered HTTP ${String(response.status)}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Proof: removing hash equality admits all three corrupted index/child/config fixtures.
    if (sha256(bytes) !== digest) throw new Error(`${url} returned bytes that are not ${digest}`);
    return bytes;
  }
  return async (ref, timeoutMs = 60_000) => {
    // Proof: invalid registry deadline cases refuse nonpositive, fractional and non-finite budgets.
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
      throw new Error('invalid registry image deadline');
    // Proof: giving each fetch a fresh budget admitted the delayed whole-chain fixture.
    const deadline = performance.now() + timeoutMs;
    const match = REF.exec(ref)?.groups;
    if (match === undefined) throw new Error(`${ref} is not a registry/name@sha256 reference`);
    const { host, name, digest } = match;
    const hostname = host.split(':')[0];
    const scheme = hostname === '127.0.0.1' || hostname === 'localhost' ? 'http' : 'https';
    const base = `${scheme}://${host}/v2/${name}`;
    // Boundary: registry JSON is digest-verified; malformed structure throws, and every descriptor
    // digest passes fetchVerified's syntax/hash checks before it can authorize a config identity.
    let manifest = JSON.parse(
      new TextDecoder().decode(
        await fetchVerified(`${base}/manifests/${digest}`, digest, ACCEPT, deadline),
      ),
    ) as {
      manifests?: { digest: string; platform?: { os?: string; architecture?: string } }[];
      config?: { digest: string };
    };
    if (manifest.manifests !== undefined) {
      const amd64 = manifest.manifests.find(
        (each) => each.platform?.os === 'linux' && each.platform.architecture === 'amd64',
      );
      if (amd64 === undefined) throw new Error(`${ref} has no linux/amd64 image`);
      // Boundary: the child bytes are digest-verified; its required config digest is validated below.
      manifest = JSON.parse(
        new TextDecoder().decode(
          await fetchVerified(`${base}/manifests/${amd64.digest}`, amd64.digest, ACCEPT, deadline),
        ),
      ) as typeof manifest;
    }
    const config = manifest.config?.digest;
    // Proof: removing descriptor validation changed missing/malformed-config refusal into a later fetch-boundary error.
    if (typeof config !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(config))
      throw new Error(`${ref} manifest names no valid config`);
    // Boundary: verified config JSON retains the existing revision-label admission contract;
    // a wrong/missing label refuses in assertImageRevisions, independently of config identity.
    const parsed = JSON.parse(
      new TextDecoder().decode(
        await fetchVerified(`${base}/blobs/${config}`, config, '*/*', deadline),
      ),
    ) as { config?: { Labels?: Record<string, string> | null } };
    return { revision: parsed.config?.Labels?.[REVISION_LABEL] ?? null, configDigest: config };
  };
}

/** Retains the revision-only descriptor admission API over the verified image metadata reader. */
export function registryRevisionReader(auth: string | null): RevisionReader {
  const read = registryImageReader(auth);
  return async (ref) => (await read(ref)).revision;
}

/** Shares registry verification between descriptor admission and runtime config identity. */
export function registryConfigDigestReader(auth: string | null): ConfigDigestReader {
  const read = registryImageReader(auth);
  return async (ref, timeoutMs) => (await read(ref, timeoutMs)).configDigest;
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
