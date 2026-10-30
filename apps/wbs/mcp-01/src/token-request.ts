import { parseMachineKey } from '@wbs/core/service/machine-key';
import { decodeProtectedHeader } from 'jose';

/** The OAuth client credentials grant (RFC 6749 §4.4), with a `wbs_mk_` key as the secret. */
export const CLIENT_CREDENTIALS_GRANT = 'client_credentials';

/** The RFC 7523 §2.1 JWT-bearer authorization grant, with a workload token as the assertion. */
export const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

/** The two grants that admit a machine credential (`wbs-mcp-agent-surface` M2). */
export type MachineGrantType = typeof CLIENT_CREDENTIALS_GRANT | typeof JWT_BEARER_GRANT;

/** Whether `grantType` names one of the {@link MachineGrantType} grants. */
export function isMachineGrantType(grantType: unknown): grantType is MachineGrantType {
  return grantType === CLIENT_CREDENTIALS_GRANT || grantType === JWT_BEARER_GRANT;
}

/** The scopes a machine token can carry, in canonical order; `wbs:editor` is consent-only. */
export const MACHINE_SCOPES = ['wbs:read', 'wbs:write'] as const;
export type MachineScope = (typeof MACHINE_SCOPES)[number];

/** `wbs_run`'s limit, equal to a command's `runId` limit (M15). */
/** The longest `client_id` read; a credential id is a 36-character UUID. */
const MOST_CHARACTERS_IN_A_CLIENT_ID = 256;
const MOST_CHARACTERS_IN_A_RUN = 256;
/** How much of an unsupported `typ` a refusal echoes, as be-01's grant route does. */
const MOST_ECHOED_TYP_CHARACTERS = 64;

const REDACTED = '[redacted]';

/**
 * A key or a workload assertion as one token request presented it. The value
 * lives in a private field, which no enumerating printer (`JSON.stringify`,
 * Node's and Bun's `inspect`, a structured logger) can reach; `String` and
 * `JSON.stringify` show `[redacted]`. Only {@link reveal} answers the value,
 * and its one caller sends it to be-01 (spec "Secrets never reach logs or
 * reports").
 */
export class Concealed {
  // Proof: with this a public field, `never prints the key or the assertion`
  // (token-request.test.ts) found the key in `inspect` and `Bun.inspect`;
  // watched 2026-10-27.
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }
}

interface RequestTerms {
  readonly kind: 'request';
  /** The `client_id` sent (Basic user or body), which must equal the credential's id. */
  readonly clientId: string | null;
  readonly scopes: readonly MachineScope[];
  /** The opted-in `wbs_run` (M15), or null: a run is never defaulted. */
  readonly run: string | null;
}

/** A machine token request, parsed once at the token endpoint. */
export type MachineTokenRequest =
  | (RequestTerms & {
      readonly grant: 'client_credentials';
      readonly key: Concealed;
      /** The credential id inside {@link key}, read without asking be-01. */
      readonly keyCredentialId: string;
    })
  | (RequestTerms & { readonly grant: 'jwt_bearer'; readonly assertion: Concealed });

/** The RFC 6749 §5.2 error a request is refused with before be-01 is asked. */
export interface TokenRequestRefusal {
  readonly kind: 'refused';
  readonly error:
    'invalid_request' | 'invalid_client' | 'invalid_grant' | 'invalid_target' | 'invalid_scope';
  readonly description?: string;
}

/** HTTP Basic client authentication: the user is the `client_id`, the password the key. */
interface BasicCredentials {
  readonly user: string;
  readonly password: string;
}

/**
 * Parses one machine grant token request (`wbs-mcp-agent-surface` M2), reading
 * nothing and asking nobody. In order:
 *
 * 1. Any parameter sent twice or as a file is `invalid_request`, but a second
 *    `resource` is `invalid_target` (RFC 6749 §3.2, RFC 8707).
 * 2. Client authentication: Basic, a body `client_secret` and a
 *    `client_assertion` are three methods; two at once are `invalid_request`
 *    (RFC 6749 §2.3), and so is a `client_id` sent both by Basic and in the
 *    body. WBS supports no assertion-based client authentication, so a
 *    `client_assertion` alone is `invalid_client`.
 *    - `client_credentials` needs the whole `wbs_mk_` key as the secret, else
 *      `invalid_client`; a `client_id`, when sent, must equal the key's id.
 *    - The JWT-bearer grant takes no client authentication: a secret is
 *      `invalid_request`, and a `client_id` is only carried, never looked up.
 * 3. `resource` must equal the canonical MCP resource, else `invalid_target`.
 * 4. `scope` defaults to `wbs:read wbs:write`; anything else is `invalid_scope`.
 * 5. `wbs_run`, when sent, has 1 to 256 characters, else `invalid_request`.
 * 6. The assertion must be present (`invalid_request`) and declare no `typ` or
 *    `JWT` in any case; anything else, ID-JAG and `at+jwt` included, is
 *    `invalid_grant` naming the `typ`.
 *
 * @param form the request body.
 * @param authorization the request's `Authorization` header.
 * @param resource the canonical `MCP_PUBLIC_URL` the token is for.
 * @throws when `grant_type` is no {@link MachineGrantType}: the caller dispatches on it first.
 */
export function parseMachineTokenRequest(
  form: FormData,
  authorization: string | null,
  resource: string,
): MachineTokenRequest | TokenRequestRefusal {
  const fields = new Map<string, string>();
  for (const name of new Set(form.keys())) {
    const values = form.getAll(name);
    // Proof: refusing only a second `resource` failed `refuses any repeated parameter or a file
    // value invalid_request` (token-request.test.ts); answering it invalid_request failed `refuses
    // a missing, foreign, non-canonical or repeated resource invalid_target`; watched 2026-10-27.
    if (values.length > 1)
      return refused(name === 'resource' ? 'invalid_target' : 'invalid_request');
    const [value] = values;
    // Proof: reading a file value as text failed `refuses any repeated parameter or a file value
    // invalid_request` (token-request.test.ts); watched 2026-10-27.
    if (typeof value !== 'string') return refused('invalid_request');
    fields.set(name, value);
  }
  const grantType = fields.get('grant_type');
  if (!isMachineGrantType(grantType))
    throw new Error('parseMachineTokenRequest needs a machine grant_type');

  const basic = authorization === null ? null : basicCredentialsOf(authorization);
  // Proof: ignoring a malformed header failed `refuses no secret, an empty Basic secret, a non-key
  // secret or a malformed Basic header invalid_client` (token-request.test.ts) (a body secret
  // beside it was admitted); watched 2026-10-27.
  if (basic === 'malformed') return refused('invalid_client');
  const bodySecret = fields.get('client_secret');
  const clientAssertion = fields.get('client_assertion') ?? fields.get('client_assertion_type');
  const methods = [basic, bodySecret, clientAssertion].filter(
    (method) => method !== undefined && method !== null,
  );
  // Proof: with this removed, `refuses two client authentication methods invalid_request`
  // (token-request.test.ts) admitted all three; watched 2026-10-27.
  if (methods.length > 1) return refused('invalid_request');
  // Proof: answering invalid_request here failed `refuses a lone client_assertion invalid_client…`
  // and `refuses a client_assertion invalid_client` (token-request.test.ts); watched 2026-10-27.
  if (clientAssertion !== undefined) return refused('invalid_client');
  const bodyClientId = fields.get('client_id');
  // Proof: reading an empty Basic user as a client_id made `reads a Basic header with an empty user
  // as sending no client_id` (token-request.test.ts) answer invalid_request; watched 2026-10-27.
  const basicClientId = basic === null || basic.user === '' ? undefined : basic.user;
  // Proof: with this removed, `refuses a client_id sent both by Basic and in the body
  // invalid_request` and the JWT-bearer twin (token-request.test.ts) admitted the request; watched
  // 2026-10-27.
  if (bodyClientId !== undefined && basicClientId !== undefined) return refused('invalid_request');
  const clientId = basicClientId ?? bodyClientId ?? null;
  // The id becomes a key of M10's per-`(client_id, source)` bucket, so its length is bounded
  // here, where it is first read (review of PR #765, S2).
  // Proof: with this check removed, `refuses a client_id over 256 characters invalid_request`
  // (token-request.test.ts) admitted 257; watched 2026-10-27.
  if (clientId !== null && clientId.length > MOST_CHARACTERS_IN_A_CLIENT_ID)
    return refused('invalid_request', 'client_id must have at most 256 characters');

  let secret: string | undefined;
  if (grantType === CLIENT_CREDENTIALS_GRANT) {
    secret = basic === null ? bodySecret : basic.password;
    // Proof: with this removed, `refuses no secret, an empty Basic secret…` (token-request.test.ts)
    // answered invalid_request; watched 2026-10-27.
    if (secret === undefined || secret === '') return refused('invalid_client');
    // Proof: with this branch removed, `refuses a Basic secret, a body secret and a client_id sent
    // twice invalid_request` (token-request.test.ts) admitted the Basic secret; watched 2026-10-27.
  } else if (bodySecret !== undefined || (basic !== null && basic.password !== '')) {
    return refused('invalid_request');
  }

  // Proof: with this removed, `refuses a missing, foreign, non-canonical or repeated resource
  // invalid_target` (token-request.test.ts) admitted the foreign resource; watched 2026-10-27.
  if (fields.get('resource') !== resource) return refused('invalid_target');
  const scopes = scopesOf(fields.get('scope'));
  if (scopes === null) return refused('invalid_scope');
  const run = fields.get('wbs_run') ?? null;
  // Proof: without the upper bound, `refuses an empty or over-long run invalid_request`
  // (token-request.test.ts) admitted 257 characters; watched 2026-10-27.
  if (run !== null && (run.length === 0 || run.length > MOST_CHARACTERS_IN_A_RUN))
    return refused('invalid_request', 'wbs_run must have 1 to 256 characters');

  if (secret !== undefined) {
    const key = parseMachineKey(secret);
    // Proof: admitting any secret failed `refuses no secret, an empty Basic secret, a non-key
    // secret…` (token-request.test.ts); watched 2026-10-27.
    if (key === null || key === 'malformed') return refused('invalid_client');
    // Proof: with this removed, `refuses a client_id other than the key’s id invalid_client`
    // (token-request.test.ts) admitted it; watched 2026-10-27.
    if (clientId !== null && clientId !== key.credentialId) return refused('invalid_client');
    return {
      kind: 'request',
      grant: 'client_credentials',
      key: new Concealed(secret),
      keyCredentialId: key.credentialId,
      clientId,
      scopes,
      run,
    };
  }
  const assertion = fields.get('assertion');
  // Proof: judging a missing or empty assertion by its header failed `refuses a missing or
  // empty assertion invalid_request` (token-request.test.ts) (invalid_grant); watched 2026-10-27.
  if (assertion === undefined || assertion === '') return refused('invalid_request');
  const typRefusal = assertionTypeRefusalOf(assertion);
  if (typRefusal !== null) return typRefusal;
  return {
    kind: 'request',
    grant: 'jwt_bearer',
    assertion: new Concealed(assertion),
    clientId,
    scopes,
    run,
  };
}

function refused(error: TokenRequestRefusal['error'], description?: string): TokenRequestRefusal {
  return description === undefined
    ? { kind: 'refused', error }
    : { kind: 'refused', error, description };
}

/**
 * The Basic credentials of an `Authorization` header, or `malformed` for any
 * other scheme, base64 that is not strict or no `:`. A client that sent a
 * credential WBS cannot read failed client authentication (`invalid_client`).
 *
 * The parts are not form-decoded (RFC 6749 §2.3.1): a credential id and a
 * `wbs_mk_` key hold only unreserved characters, so their encoded form is
 * themselves, and a part carrying `%` or `+` is no key at all. The MCP SDK
 * does not encode them either.
 */
function basicCredentialsOf(authorization: string): BasicCredentials | 'malformed' {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (match?.[1] === undefined) return 'malformed';
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  // Proof: with this removed, `refuses a Basic header without a colon invalid_client`
  // (token-request.test.ts) answered invalid_request; watched 2026-10-27.
  if (colon < 0) return 'malformed';
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/** The requested scopes in canonical order, the default when absent, or null when refused. */
function scopesOf(scope: string | undefined): readonly MachineScope[] | null {
  // Proof: answering the default for every non-empty scope failed `refuses wbs:editor, an unknown
  // or empty scope invalid_scope` and `narrows to a requested subset…` (token-request.test.ts);
  // watched 2026-10-27.
  if (scope === undefined) return MACHINE_SCOPES;
  const requested = scope.split(' ');
  if (requested.some((value) => !(MACHINE_SCOPES as readonly string[]).includes(value)))
    return null;
  return MACHINE_SCOPES.filter((value) => requested.includes(value));
}

/** The refusal of an assertion whose header does not decode or declares an unsupported `typ`. */
function assertionTypeRefusalOf(assertion: string): TokenRequestRefusal | null {
  let typ: unknown;
  try {
    typ = decodeProtectedHeader(assertion).typ;
  } catch {
    return refused('invalid_grant', 'the assertion is not a JWT');
  }
  // Proof: admitting every typ failed `refuses an ID-JAG, an access token or any other typ
  // invalid_grant, naming it` (token-request.test.ts); watched 2026-10-27.
  if (typ === undefined || (typeof typ === 'string' && typ.toUpperCase() === 'JWT')) return null;
  // Proof: String(typ) here made `refuses a typ that is not text, naming it as JSON`
  // (token-request.test.ts) name [object Object]; watched 2026-10-27.
  const named = (typeof typ === 'string' ? typ : JSON.stringify(typ))
    .replace(/[^\x20-\x7e]/g, '?')
    // Proof: without the cap, `echoes at most 64 printable characters of a typ`
    // (token-request.test.ts) echoed all 101; watched 2026-10-27.
    .slice(0, MOST_ECHOED_TYP_CHARACTERS);
  return refused(
    'invalid_grant',
    `assertion typ "${named}" is not supported: only a workload JWT is, not an ID-JAG or an access token`,
  );
}
