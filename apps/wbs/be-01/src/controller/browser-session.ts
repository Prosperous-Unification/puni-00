import { createHash } from 'node:crypto';

import type { TokenStore } from '@wbs/auth';
import type { BrowserAuthLifecycle, SqliteBrowserCredentialRevocations } from '@wbs/store-sqlite';
import { BrowserLifecycleRefusedError } from '@wbs/store-sqlite';

import type { RequestMetadata } from '../http/endpoint';
import { cookieValue } from '../middleware/authenticated';
import type { VerifiedNativeBrowserCredential } from '../runtime/organization-credential';

/** One explicitly enabled browser authority shared by issuance and logout. */
export interface BrowserSessionAuthority {
  readonly lifecycle?: BrowserAuthLifecycle;
  readonly tokens?: TokenStore;
  readonly revokeProvider?: (refreshToken: string) => Promise<void>;
  readonly revocations: Pick<SqliteBrowserCredentialRevocations, 'revoke'>;
  readonly verifyNativeBrowserCredential: (
    token: string,
  ) => Promise<VerifiedNativeBrowserCredential | null>;
}

export type BrowserPredecessor =
  | { readonly kind: 'none' }
  | { readonly kind: 'native'; readonly credential: VerifiedNativeBrowserCredential }
  | { readonly kind: 'oidc'; readonly correlation: string; readonly digest: string };

export function credentialDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function correlationOf(request: RequestMetadata): string | null {
  return cookieValue(request.headers.get('cookie') ?? undefined, '__Host-wbs_session');
}

export function accessOf(request: RequestMetadata): string | null {
  return cookieValue(request.headers.get('cookie') ?? undefined, '__Host-wbs_access');
}

export function invalidBrowserCarriers(request: RequestMetadata): boolean {
  const seen = new Set<string>();
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const sent = part.trimStart();
    const separator = sent.indexOf('=');
    const name = separator < 0 ? sent : sent.slice(0, separator);
    const carrier = name.trimEnd();
    if (carrier !== '__Host-wbs_session' && carrier !== '__Host-wbs_access') continue;
    // Proof: accepting a second same-named access cookie made mounted
    // duplicate-carrier refresh return 204 instead of 401 (0/1, 2026-10-01).
    if (name !== carrier || separator < 0 || seen.has(carrier)) return true;
    seen.add(carrier);
    try {
      if (decodeURIComponent(sent.slice(separator + 1)).length === 0) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Read-only proof before new-account creation or replacement issuance. */
export async function proveBrowserPredecessor(
  request: RequestMetadata,
  authority: BrowserSessionAuthority,
  appOrigin: string,
): Promise<BrowserPredecessor | null> {
  if (invalidBrowserCarriers(request) || request.headers.has('x-wbs-token')) return null;
  const correlation = correlationOf(request);
  const cookieAccess = accessOf(request);
  const authorization = request.headers.get('authorization');
  // Proof: the mounted native Bearer predecessor account-switch login with
  // organization/UI cookies returned 401 while all Cookie headers were
  // treated as identity carriers (0/1, 2026-10-01).
  if (
    authorization !== null &&
    (cookieAccess !== null ||
      correlation !== null ||
      !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))
  )
    return null;
  const access = authorization === null ? cookieAccess : authorization.slice(7);
  if (correlation === null && access === null) return { kind: 'none' };
  // OIDC callback is a state-bound GET browser navigation and has no Origin;
  // unsafe password issuance and any Bearer proof require the exact origin.
  if (
    (request.method !== 'GET' || authorization !== null) &&
    request.headers.get('origin') !== appOrigin
  )
    return null;
  if (access === null) return null;
  if (correlation !== null) {
    if (authority.lifecycle === undefined) return null;
    if ((await authority.verifyNativeBrowserCredential(access)) !== null) return null;
    const digest = credentialDigest(access);
    try {
      await authority.lifecycle.proveAssociation(correlation, { kind: 'oidc', digest });
    } catch (cause) {
      if (cause instanceof BrowserLifecycleRefusedError) return null;
      throw cause;
    }
    return { kind: 'oidc', correlation, digest };
  }
  const native = await authority.verifyNativeBrowserCredential(access);
  return native === null ? null : { kind: 'native', credential: native };
}

/** Denies the proved predecessor before a replacement credential is exposed. */
export async function retireBrowserPredecessor(
  predecessor: BrowserPredecessor,
  authority: BrowserSessionAuthority,
  now: number,
): Promise<void> {
  if (predecessor.kind === 'none') return;
  if (predecessor.kind === 'native') {
    await authority.revocations.revoke(predecessor.credential, now);
    return;
  }
  if (authority.lifecycle === undefined)
    throw new Error('proved OIDC predecessor has no lifecycle authority');
  await authority.lifecycle.close(
    predecessor.correlation,
    { kind: 'oidc', digest: predecessor.digest },
    now,
  );
  if (authority.tokens === undefined || authority.revokeProvider === undefined)
    throw new Error('proved OIDC predecessor lacks local refresh authority');
  const record = authority.tokens.read(predecessor.correlation);
  authority.tokens.delete(predecessor.correlation);
  if (record !== null) await authority.revokeProvider(record.refreshToken);
}
