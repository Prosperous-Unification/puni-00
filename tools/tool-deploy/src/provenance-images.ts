import { registryImageReader } from './k8s/registry';
import type { ReleaseImage } from './provenance';

const AUTHORITY =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*|\[[0-9a-fA-F:]+\])(?::[0-9]+)?(?![\s\S])/;
const REPOSITORY =
  /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*(?![\s\S])/;

function parseAuthority(authority: string, boundary: string): string {
  // Proof: disabling authority syntax validation admitted the credentialed userinfo REGISTRY fixture.
  if (!AUTHORITY.test(authority)) throw new Error(`Invalid ${boundary} authority`);
  const hostname = authority.split(':')[0];
  const scheme = hostname === '127.0.0.1' || hostname === 'localhost' ? 'http' : 'https';
  const origin = `${scheme}://${authority}`;
  // Proof: bypassing URL validation let the invalid-port reference fixture access credentials.
  if (!URL.canParse(origin)) throw new Error(`Invalid ${boundary} authority`);
  return new URL(origin).host;
}

function parseReference(reference: string): string {
  const slash = reference.indexOf('/');
  const separator = reference.lastIndexOf('@');
  const repository = reference.slice(slash + 1, separator);
  // Proof: disabling reference syntax validation let malformed-reference fixtures access credentials.
  if (
    slash <= 0 ||
    !REPOSITORY.test(repository) ||
    !/^sha256:[0-9a-f]{64}(?![\s\S])/.test(reference.slice(separator + 1))
  ) {
    throw new Error('Invalid selected image reference');
  }
  return parseAuthority(reference.slice(0, slash), 'selected image reference');
}

function readCredentials(environment: Readonly<Record<string, string | undefined>>): string | null {
  const combined = environment['PUNI_REGISTRY_AUTH'];
  const user = environment['REGISTRY_USER'];
  const password = environment['REGISTRY_PASS'];
  // Proof: disabling mechanism exclusivity admitted the ambiguous provided-credentials fixtures.
  if (combined !== undefined && (user !== undefined || password !== undefined)) {
    throw new Error('Ambiguous registry credentials');
  }
  if (combined !== undefined) {
    // Proof: disabling combined syntax validation admitted empty, missing-half and newline credentials.
    if (!/^[^:\p{Cc}]+:[^\p{Cc}]+(?![\s\S])/u.test(combined)) {
      throw new Error('Malformed registry credentials');
    }
    return combined;
  }
  if (user === undefined && password === undefined) return null;
  // Proof: disabling pair syntax validation admitted incomplete and malformed provided credentials.
  if (
    user === undefined ||
    password === undefined ||
    !/^[^:\p{Cc}]+(?![\s\S])/u.test(user) ||
    !/^[^\p{Cc}]+(?![\s\S])/u.test(password)
  ) {
    throw new Error('Malformed registry credentials');
  }
  return `${user}:${password}`;
}

/**
 * Verifies every selected image's digest-linked config and application revision within one
 * 60s budget. Anonymous reads are supported. Provided credentials require an explicit publisher
 * REGISTRY (authority with optional namespace), and every selected authority is checked before
 * the first authenticated request. Credential values and malformed references stay out of errors.
 * @throws for empty selections, malformed configuration, authority mismatches, unverifiable
 * metadata, missing/different application revisions, or exhausted observation time.
 */
export async function verifyImageProvenance(
  revision: string,
  images: readonly ReleaseImage[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<
  readonly { readonly role: string; readonly reference: string; readonly configDigest: string }[]
> {
  const deadline = performance.now() + 60_000;
  // Proof: disabling selection validation admitted the empty-selected-image fixture.
  if (images.length === 0) throw new Error('Image provenance requires a nonempty selection');
  const authorities = images.map((image) => parseReference(image.reference));
  const credentials = readCredentials(environment);
  if (credentials !== null) {
    const configured = environment['REGISTRY'];
    // Proof: removing explicit binding validation changed missing REGISTRY refusal into an unmodeled TypeError.
    if (configured === undefined || configured.length === 0) {
      throw new Error('Registry credentials require explicit REGISTRY authority');
    }
    const slash = configured.indexOf('/');
    const namespace = slash === -1 ? undefined : configured.slice(slash + 1);
    // Proof: disabling namespace validation admitted the matching-host query-bearing namespace fixture.
    if (namespace !== undefined && !REPOSITORY.test(namespace))
      throw new Error('Invalid REGISTRY namespace');
    const authority = parseAuthority(
      slash === -1 ? configured : configured.slice(0, slash),
      'REGISTRY',
    );
    // Proof: disabling full-list authority binding sent an authenticated request in the authority-mismatch fixture.
    if (authorities.some((selected) => selected !== authority)) {
      throw new Error('Selected image authority differs from credential-bound REGISTRY authority');
    }
  }
  const readImage = registryImageReader(credentials);
  const verified: {
    readonly role: string;
    readonly reference: string;
    readonly configDigest: string;
  }[] = [];
  for (const image of images) {
    const remaining = Math.ceil(deadline - performance.now());
    // Proof: replacing the remaining budget with a fresh 60s admitted the three-image deadline fixture.
    const config = await readImage(image.reference, remaining);
    // Proof: disabling revision equality admitted missing and mismatched frontend revision fixtures.
    if (config.revision !== revision)
      throw new Error(`Selected image ${image.role} application revision differs from deployment`);
    verified.push({
      role: image.role,
      reference: image.reference,
      configDigest: config.configDigest,
    });
  }
  return verified;
}
