import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { basicCredentialsOf, Concealed } from './token-request';

/** The two RFC 7591 methods a confidential consent client authenticates with. */
export type ConfidentialMethod = 'client_secret_basic' | 'client_secret_post';

/**
 * How a dynamically registered consent client authenticates at the token endpoint
 * (`wbs-mcp-agent-surface` M17): a public client (`none`) by its `client_id` alone, a
 * confidential one by the secret its registration answer carried once, of which only the
 * SHA-256 is kept.
 */
export type ClientAuthentication =
  | { readonly method: 'none' }
  | { readonly method: ConfidentialMethod; readonly secretSha256: string };

/** Bytes of entropy in each issued `client_secret`. */
const CLIENT_SECRET_BYTES = 32;

/** Whether `method` is a `token_endpoint_auth_method` dynamic registration accepts. */
export function isRegistrableMethod(method: unknown): method is ClientAuthentication['method'] {
  return method === 'none' || method === 'client_secret_basic' || method === 'client_secret_post';
}

/** A fresh `client_secret` for `method`, and the authentication a client registered with it keeps. */
export function issueClientSecret(method: ConfidentialMethod): {
  readonly secret: string;
  readonly authentication: ClientAuthentication;
} {
  const secret = randomBytes(CLIENT_SECRET_BYTES).toString('base64url');
  return { secret, authentication: { method, secretSha256: secretSha256Of(secret) } };
}

function secretSha256Of(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * The client authentication one consent-grant token request presented (RFC 6749 §2.3.1): a
 * Basic header, a body `client_secret`, or neither. The secret is {@link Concealed}.
 */
export interface PresentedClient {
  readonly clientId: string | undefined;
  readonly method: ClientAuthentication['method'];
  readonly secret: Concealed | undefined;
}

/**
 * Reads the client authentication of an `authorization_code` or `refresh_token` request,
 * reading no store. A repeated or file `client_id` or `client_secret`, Basic beside a body
 * secret, and a Basic user unlike the body `client_id` are `invalid_request` (RFC 6749 §2.3); an
 * `Authorization` header that is not well-formed Basic and any `client_assertion` are
 * `invalid_client`, because no consent client authenticates that way.
 *
 * The Basic parts are not form-decoded, as for the machine grants: an issued `client_id` and
 * `client_secret` hold only base64url characters, which encode as themselves.
 */
export function presentedClientOf(
  form: FormData,
  authorization: string | null,
): PresentedClient | 'invalid_request' | 'invalid_client' {
  const bodyClientId = singleField(form, 'client_id');
  const bodySecret = singleField(form, 'client_secret');
  // Proof: 2026-10-31, with this refusal removed `refuses two methods, a repeated field and a
  // Basic user unlike the body client_id invalid_request` (consent-client.test.ts) read the
  // repeated client_id as no refusal.
  if (bodyClientId === null || bodySecret === null) return 'invalid_request';
  // Proof: 2026-10-31, with this refusal removed `refuses a client_assertion and a non-Basic
  // Authorization header invalid_client` (consent-client.test.ts) read the assertion as no
  // authentication at all.
  if (form.has('client_assertion') || form.has('client_assertion_type')) return 'invalid_client';
  if (authorization !== null) {
    const basic = basicCredentialsOf(authorization);
    // Proof: 2026-10-31, ignoring a malformed header made `refuses a client_assertion and a
    // non-Basic Authorization header invalid_client` (consent-client.test.ts) read it as `none`.
    if (basic === 'malformed') return 'invalid_client';
    // Proof: 2026-10-31, with this refusal removed `refuses two methods, a repeated field and a
    // Basic user unlike the body client_id invalid_request` (consent-client.test.ts) took Basic.
    if (bodySecret !== undefined) return 'invalid_request';
    const clientId = basic.user === '' ? bodyClientId : basic.user;
    // Proof: 2026-10-31, with this refusal removed the same test took the Basic user.
    if (bodyClientId !== undefined && clientId !== bodyClientId) return 'invalid_request';
    return { clientId, method: 'client_secret_basic', secret: new Concealed(basic.password) };
  }
  if (bodySecret !== undefined)
    return {
      clientId: bodyClientId,
      method: 'client_secret_post',
      secret: new Concealed(bodySecret),
    };
  return { clientId: bodyClientId, method: 'none', secret: undefined };
}

/**
 * Whether `presented` authenticates a client registered with `registered`: the same method, and
 * for a confidential client a secret whose SHA-256 equals the kept one, compared in constant
 * time. A public client that presents any secret, and a confidential client presenting its
 * secret by the other method, fail.
 */
export function authenticatesClient(
  registered: ClientAuthentication,
  presented: PresentedClient,
): boolean {
  // Proof: 2026-10-31, comparing only the secret made `refuses a secret sent by the method it was
  // not registered with` (oauth.test.ts) answer 200 for the Basic client's secret in the body.
  if (presented.method !== registered.method) return false;
  if (registered.method === 'none') return true;
  if (presented.secret === undefined) return false;
  const received = Buffer.from(secretSha256Of(presented.secret.reveal()), 'hex');
  const expected = Buffer.from(registered.secretSha256, 'hex');
  // Proof: 2026-10-31, returning `true` here made `refuses a confidential client's code without
  // its secret or with a wrong one, and burns it` (oauth.test.ts) answer 200 for the wrong secret.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** The one text value of `name`, `undefined` when absent, or `null` when repeated or a file. */
function singleField(form: FormData, name: string): string | undefined | null {
  const values = form.getAll(name);
  if (values.length === 0) return undefined;
  const [value] = values;
  return values.length === 1 && typeof value === 'string' ? value : null;
}
