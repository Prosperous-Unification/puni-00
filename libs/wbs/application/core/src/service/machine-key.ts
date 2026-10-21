/** The fixed prefix of every WBS API key (`wbs-machine-credentials` A14, A22). */
export const MACHINE_KEY_PREFIX = 'wbs_mk_';

/**
 * A whole API key: the prefix, the credential's lowercase UUID, one `.`, and
 * 43 base64url characters carrying 256 random bits.
 */
const MACHINE_KEY =
  /^wbs_mk_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

/** An API key as presented, parsed once at the boundary (A22). */
export interface MachineKey {
  readonly credentialId: string;
  readonly secret: string;
}

/**
 * The API key in `token`, `malformed` for a token that carries the prefix but
 * not the whole grammar, or null for a token that is no API key at all (and
 * goes on to the other verifiers). Reads nothing.
 *
 * Proof: with a token failing the grammar parsed as a key anyway, `refuses a
 * malformed key unknown_identity before any read` in
 * `machine-credential.controller.db.test.ts` failed: the malformed keys
 * reached the (renamed-away) credential table; watched 2026-10-22.
 */
export function parseMachineKey(token: string): MachineKey | 'malformed' | null {
  if (!token.startsWith(MACHINE_KEY_PREFIX)) return null;
  const parsed = MACHINE_KEY.exec(token);
  const credentialId = parsed?.[1];
  const secret = parsed?.[2];
  if (credentialId === undefined || secret === undefined) return 'malformed';
  return { credentialId, secret };
}

/** A fresh API key for `credentialId`, and the secret in it whose digest storage holds. */
export function newMachineKey(credentialId: string): {
  readonly key: string;
  readonly secret: string;
} {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  const secret = base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return { key: `${MACHINE_KEY_PREFIX}${credentialId}.${secret}`, secret };
}

/** The lowercase hex SHA-256 of an API key's secret: the only form storage ever holds. */
export async function digestMachineSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
