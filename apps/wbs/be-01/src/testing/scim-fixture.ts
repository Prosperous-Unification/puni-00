import { SignJWT } from 'jose';

import { DELEGATION_TOKEN_TYPE } from '../runtime/delegation';
import type { OrganizationHarness } from './organization-harness';

/** One enterprise connection a test seeds on a verified claim of its domain. */
export interface SeededConnection {
  readonly organizationId: string;
  readonly domain: string;
  readonly auth0Connection: string;
  readonly loginSlug: string;
  /** The super-admin whose routed link proved it; null leaves it unproven. */
  readonly provenBy: string | null;
}

/**
 * Seeds a verified domain claim and its enterprise connection through the
 * harness's second connection, as a super-admin's earlier acts would have.
 */
export function seedConnection(h: OrganizationHarness, seeded: SeededConnection): void {
  const claim = `claim-${seeded.loginSlug}`;
  h.sqlite.run(
    `INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at)
     VALUES (?, ?, ?, 'verified', ?, 1, 1)`,
    [claim, seeded.organizationId, seeded.domain, 'a'.repeat(64)],
  );
  h.sqlite.run(
    `INSERT INTO organization_sso_connection (id, organization_id, domain_claim_id, auth0_connection, strategy, login_slug, proven_at, proven_by, created_at)
     VALUES (?, ?, ?, ?, 'samlp', ?, ?, ?, 1)`,
    [
      `conn-${seeded.loginSlug}`,
      seeded.organizationId,
      claim,
      seeded.auth0Connection,
      seeded.loginSlug,
      seeded.provenBy === null ? null : 1,
      seeded.provenBy === null ? null : h.userId(seeded.provenBy),
    ],
  );
}

/** Maps `username` to an upstream pair, as a completed OIDC link would. */
export function mapUpstream(h: OrganizationHarness, username: string, subject: string): void {
  h.sqlite.run(
    'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
    [`map-${username}`, h.userId(username), 'https://idp.test', subject],
  );
}

/** An mcp-01 delegation for `username` to `organizationId`, as {@link mapUpstream} mapped them. */
export function delegationFor(
  h: OrganizationHarness,
  key: CryptoKey,
  username: string,
  organizationId: string,
  subject: string,
): Promise<string> {
  return new SignJWT({
    username,
    org: organizationId,
    client: 'client-1',
    grant: 'family-1',
    scope: 'read write',
    upstream_iss: 'https://idp.test',
    upstream_sub: subject,
  })
    .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
    .setIssuer('wbs')
    .setSubject(h.userId(username))
    .setAudience('wbs-be-01/via-mcp-01')
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(key);
}

/** One SCIM answer: status, headers and the exact body text. */
export interface ScimAnswer {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly body: unknown;
}

/**
 * Sends one SCIM request. `token` null sends no Authorization header; a
 * string body is sent verbatim, anything else as JSON, under `contentType`.
 */
export async function scim(
  h: OrganizationHarness,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  contentType = 'application/scim+json',
): Promise<ScimAnswer> {
  const response = await h.app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'content-type': contentType }),
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    body: text === '' ? null : (JSON.parse(text) as unknown),
  };
}

/** The SHA-256 hex the store keys a provisioning token by. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
