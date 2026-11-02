import { closeSync, constants, openSync, readFileSync, writeSync } from 'node:fs';

import { parseSecretsOrThrow, type } from '@shared/validation';

import { ConfigurationRefusal, MachineKey, readOwnerOnly } from '../compute/configuration';

/** RFC 7523 §2.1's grant type: the workload token is the grant, and no client authenticates. */
export const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

/** `fetch` as the token requests use it; tests pass a recording or faked one. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** The URL a {@link FetchLike} call addresses. */
export function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** The longest `wbs_run` mcp-01 accepts (`wbs-mcp-agent-surface` M15). */
const MOST_RUN_CHARACTERS = 256;
/** A workload token is a JWT of a few KiB; anything larger is not one. */
const MOST_ASSERTION_BYTES = 64 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * One WBS MCP server as a machine client addresses it: the canonical resource, its
 * authorization server (`<resource>/oauth`, M2) and that server's token endpoint.
 */
export interface McpEndpoint {
  readonly resource: string;
  readonly issuer: string;
  readonly tokenUrl: string;
}

/**
 * The endpoint of the MCP resource `url`, derived as WBS's `mcpAuthorizationServerOf`
 * (`@wbs/contracts`, which Dash's product boundary does not reach) derives it: the origin and
 * path without a trailing slash, then `/oauth`. The SDK refuses a stamped issuer that differs from
 * the one mcp-01 advertises, so `mcp-token.boot.test.ts` pins the two together. The credential crosses the wire to it, so only `https:`
 * or loopback `http:` is accepted (as `report-capacity`'s `mcpResource`).
 * @throws when `url` is not an absolute URL, or is plain HTTP off loopback.
 */
export function mcpEndpointOf(url: string): McpEndpoint {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new Error('--resource must be an absolute URL', { cause });
  }
  // Proof: accepting any `http:` URL made `refuses a plain-HTTP resource off loopback` send the
  // key's request and print a token (2026-10-27).
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname))
  ) {
    throw new Error('--resource must be https, or http on loopback');
  }
  const resource = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
  // Proof: `${parsed.origin}/oauth` here made the SDK refuse the stamped client information
  // ("bound to authorization server …") in `connects and calls a tool without a dynamic
  // registration request` (2026-10-27).
  const issuer = `${resource}/oauth`;
  return { resource, issuer, tokenUrl: `${issuer}/token` };
}

/**
 * The run a token request opts into (`wbs_run`, M15): 1 to 256 characters, as mcp-01's parser
 * requires; be-01 also refuses a run shaped like a secret.
 * @throws when the value is empty or longer.
 */
export function runOf(value: string): string {
  if (value.length === 0 || value.length > MOST_RUN_CHARACTERS) {
    throw new Error(`--run must have 1 to ${String(MOST_RUN_CHARACTERS)} characters`);
  }
  return value;
}

/**
 * A `wbs_mk_` API key (`wbs-machine-credentials` A22) held in a private field: stringifying,
 * inspecting or serialising it prints `[credential]`, and only {@link ApiKey.basicAuthorization}
 * reveals it, for the one token request header.
 */
export class ApiKey {
  readonly #key: string;

  private constructor(key: string) {
    this.#key = key;
  }

  /**
   * The key in the owner-only file at `path`: the whole file, one trailing newline allowed.
   * Every refusal names `--key-file` and never the path: a key pasted where the path belongs
   * would otherwise be echoed on stderr.
   * @throws Error `--key-file: …` when the file is absent, unreadable, not owned by this user with
   * mode 0600, over 64 KiB, or holds no `wbs_mk_` key.
   */
  public static read(path: string): ApiKey {
    let bytes: string;
    try {
      bytes = readOwnerOnly(path);
    } catch (cause) {
      if (!(cause instanceof ConfigurationRefusal)) throw cause;
      // Proof: rethrowing readOwnerOnly's refusal made `a secret that is no file, given to
      // --key-file` print "config_absent: no configuration at sk-pasted-secret-value" (2026-10-27).
      throw new Error(`--key-file: ${KEY_FILE_REFUSALS[cause.reason]}`, { cause });
    }
    const key = bytes.replace(/\r?\n$/, '');
    // Proof: admitting any bytes made `refuses a key file that holds no wbs_mk_ key, never
    // echoing it` send them as the secret and print a token (2026-10-27).
    if (!MachineKey.test(key)) throw new Error('--key-file: the key file holds no wbs_mk_ API key');
    return new ApiKey(key);
  }

  /**
   * `key` as an API key, for a key that arrived in a validated document (`pool import`).
   * @throws naming `where` and never the value, when it is no `wbs_mk_` key.
   */
  public static of(key: string, where: string): ApiKey {
    // Proof: admitting any value made `refuses a document whose key is no wbs_mk_ key, never
    // echoing it` (pool-import.test.ts) fail (2026-10-28).
    if (!MachineKey.test(key)) throw new Error(`${where} holds no wbs_mk_ API key`);
    return new ApiKey(key);
  }

  /** The credential id the key names: `wbs_mk_<id>.<secret>`. */
  public get credentialId(): string {
    return this.#key.slice('wbs_mk_'.length, this.#key.indexOf('.'));
  }

  /**
   * Writes the key, with one trailing newline, to a **new** file at `path` with mode 0600, as
   * {@link ApiKey.read} reads it back. It never follows a link and never replaces a file.
   * @throws the `open` error (`EEXIST`, `ENOENT`, …) when the file cannot be created.
   */
  public writeNew(path: string): void {
    const descriptor = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeSync(descriptor, `${this.#key}\n`);
    } finally {
      closeSync(descriptor);
    }
  }

  /**
   * HTTP Basic client authentication (`client_secret_basic`, the SDK's default): the key's own
   * id as the user, the whole key as the password. mcp-01 does not form-decode either part,
   * and both hold only unreserved characters.
   */
  public basicAuthorization(): string {
    return `Basic ${btoa(`${this.credentialId}:${this.#key}`)}`;
  }

  public toString(): string {
    return '[credential]';
  }

  public toJSON(): string {
    return '[credential]';
  }
}

/** What a `--key-file` refusal says for each of `readOwnerOnly`'s reasons; never the path. */
const KEY_FILE_REFUSALS: Record<ConfigurationRefusal['reason'], string> = {
  config_absent: 'the key file does not exist',
  config_unreadable: 'the key file cannot be read',
  credential_not_owner_only: 'the key file must be owned by this user with mode 0600',
  config_malformed: 'the key file is over 64 KiB',
  unsupported_measure: 'the key file cannot be read',
  provider_kind_not_available: 'the key file cannot be read',
  provider_not_implemented: 'the key file cannot be read',
};

/** Reads one workload token; every call reads afresh (M2: a run outlives its first token). */
export type AssertionReader = () => Promise<string>;

/**
 * Rereads the workload token at `path` on every call: a Kubernetes projected service-account
 * token, which the kubelet rotates in place. The file is not required to be owner-only: a
 * projected token is the pod's own and is mounted 0644 by default. Refusals name
 * `--assertion-file`, never the path, which could be a pasted token.
 */
export function assertionFileReader(path: string): AssertionReader {
  return () => {
    let bytes: string;
    try {
      bytes = readFileSync(path, 'utf8');
    } catch (cause) {
      // Proof: answering an unreadable file "holds no workload token" made `refuses an
      // unreadable assertion file apart from an empty or oversize one` fail; naming the path
      // here made `a secret that is no file, given to --assertion-file` print it (2026-10-27).
      return Promise.reject(
        new Error('--assertion-file: the workload token file cannot be read', { cause }),
      );
    }
    const assertion = bytes.trim();
    // Proof: comparing `assertion.length` made `…an empty or oversize one` admit 40,000
    // three-byte characters (120,000 bytes) (2026-10-27).
    if (assertion.length === 0 || Buffer.byteLength(assertion) > MOST_ASSERTION_BYTES) {
      return Promise.reject(
        new Error('--assertion-file: the file holds no workload token (empty or over 64 KiB)'),
      );
    }
    return Promise.resolve(assertion);
  };
}

const GitHubIdToken = type({ value: 'string > 0' });

/**
 * Fetches a fresh GitHub Actions OIDC token for `audience` on every call, from the runner's
 * `ACTIONS_ID_TOKEN_REQUEST_URL` with its `ACTIONS_ID_TOKEN_REQUEST_TOKEN` (a job needs
 * `permissions: id-token: write`). GitHub mints a new `jti` per fetch.
 * @throws naming the variable when either is unset; on a non-200 answer, naming its status.
 */
export function gitHubActionsReader(
  audience: string,
  environment: Readonly<Record<string, string | undefined>>,
  send: FetchLike,
): AssertionReader {
  const required = (name: string): string => {
    const value = environment[name];
    // Proof: defaulting an unset variable to '' made `refuses an unset
    // ACTIONS_ID_TOKEN_REQUEST_TOKEN, naming it` send a request (2026-10-27).
    if (value === undefined || value === '') {
      throw new Error(`${name} is required for --github-actions-audience`);
    }
    return value;
  };
  const requestUrl = new URL(required('ACTIONS_ID_TOKEN_REQUEST_URL'));
  const requestToken = required('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  requestUrl.searchParams.set('audience', audience);
  return async () => {
    const response = await send(requestUrl, {
      headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' },
    });
    // Proof: dropping this check made `refuses a GitHub Actions answer other than 200, naming
    // its status` resolve with the 403 body's value (2026-10-27).
    if (response.status !== 200) {
      throw new Error(`GitHub Actions refused the workload token: HTTP ${String(response.status)}`);
    }
    return parseSecretsOrThrow(GitHubIdToken, await response.json()).value;
  };
}

/** The token endpoint answered with an OAuth error other than a rate limit, or a 429 retried. */
export class TokenRefusal extends Error {
  public constructor(
    public readonly status: number,
    public readonly error: string,
    description: string | undefined,
  ) {
    super(
      `the MCP token endpoint refused: HTTP ${String(status)} ${error}${
        description === undefined ? '' : ` (${description.slice(0, 200)})`
      }`,
    );
    this.name = 'TokenRefusal';
  }
}

const OAuthError = type({ error: 'string > 0', 'error_description?': 'string' });

/**
 * The refusal in a non-200 token answer. The body is mcp-01's: an error code and a fixed
 * description, never an echo of the key or the assertion.
 * @throws when the body is not an OAuth error, naming the status only.
 */
export async function refusalOf(response: Response): Promise<TokenRefusal> {
  let body: unknown;
  try {
    body = await response.json();
    // Proof: returning a refusal coded `unknown` for an unparsable body made `names a proxy's
    // non-JSON 502 and a JSON answer without error by status only` resolve (2026-10-27).
  } catch (cause) {
    throw new Error(`the MCP token endpoint answered HTTP ${String(response.status)}, not JSON`, {
      cause,
    });
  }
  const parsed = OAuthError(body);
  // Proof: reading `error` unchecked made the same test resolve with a refusal coded
  // `undefined` (2026-10-27).
  if (parsed instanceof type.errors) {
    throw new Error(
      `the MCP token endpoint answered HTTP ${String(response.status)} without an OAuth error`,
    );
  }
  return new TokenRefusal(response.status, parsed.error, parsed.error_description);
}

/**
 * A `429`'s `Retry-After`, in whole seconds (RFC 9110 §10.2.3's delay form, which mcp-01 sends);
 * null when absent or in the HTTP-date form, which no WBS server sends.
 */
export function retryAfterSecondsOf(response: Response): number | null {
  const value = response.headers.get('retry-after');
  // Proof: reading any value with `Number` made `reads only the delay form of Retry-After` get
  // NaN for the HTTP date (2026-10-27).
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

/** A token endpoint's success answer, as `mcp token` and `pool import` read it. */
export const IssuedToken = type({ access_token: 'string > 0', token_type: /^[Bb]earer$/ });

/**
 * POSTs one token request to `tokenUrl`. A redirect is never followed: Bun re-sends a POST body,
 * the assertion included, to a 307's target, whatever its origin.
 * @throws when the endpoint answers a 3xx, naming its status.
 */
export async function postTokenRequest(
  send: FetchLike,
  tokenUrl: string,
  headers: Headers,
  form: URLSearchParams,
): Promise<Response> {
  const answer = await send(tokenUrl, { method: 'POST', headers, body: form, redirect: 'manual' });
  // Proof: following redirects (no `redirect: 'manual'`, no check) made `is never followed`
  // print the other origin's token instead of refusing (2026-10-27).
  if (answer.status >= 300 && answer.status < 400) {
    throw new Error(
      `the MCP token endpoint answered a redirect (HTTP ${String(answer.status)}); a token request is never redirected`,
    );
  }
  return answer;
}
