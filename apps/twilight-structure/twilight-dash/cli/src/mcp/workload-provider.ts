import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import type { Monotonic } from '../clock';
import {
  type AssertionReader,
  type FetchLike,
  JWT_BEARER_GRANT,
  type McpEndpoint,
  retryAfterSecondsOf,
  urlOf,
} from './machine-token';

/** M2: the provider keeps its token until 5 minutes before `exp`. */
const MOST_REFRESH_MARGIN_MS = 5 * 60 * 1_000;
/** M2: the SDK provider's cap on a token endpoint `Retry-After`. */
const MOST_RETRY_AFTER_MS = 60_000;

export interface WorkloadJwtBearerOptions {
  readonly endpoint: McpEndpoint;
  /** The `oidc` machine credential's id, which stamps the client information. */
  readonly credentialId: string;
  /** Called for every token request: a run outlives its first workload token. */
  readonly readAssertion: AssertionReader;
  /** `wbs_run` (M15), sent on every token request when set. */
  readonly run?: string;
  /** Measures the cached token's age; never a wall clock. */
  readonly monotonic: Monotonic;
  /** Waits out a token endpoint `Retry-After` in {@link WorkloadJwtBearerProvider.tokenFetch}. */
  readonly sleep: (milliseconds: number) => Promise<void>;
}

interface CachedToken {
  readonly tokens: OAuthTokens;
  readonly servedUntil: number;
}

/**
 * The MCP SDK client provider for a workload holding a Kubernetes or GitHub Actions token
 * (`wbs-mcp-agent-surface` M2): the RFC 7523 §2.1 JWT-bearer grant at WBS's mcp-01.
 *
 * - {@link clientInformation} is the credential id stamped with the authorization server's
 *   issuer, so the SDK never falls back to dynamic client registration (`auth.js` 295ff), which
 *   mcp-01 refuses for both machine grants.
 * - {@link addClientAuthentication} is a no-op: the assertion is the grant, no client
 *   authenticates, and no `client_id` is sent.
 * - {@link prepareTokenRequest} reads a **fresh** assertion each time (unlike the SDK's
 *   `StaticPrivateKeyJwtProvider`, which fixes it at construction) and adds `wbs_run`.
 * - The access token is cached in memory only, until 5 minutes before `exp` or half its
 *   lifetime before, whichever is sooner. It is dropped on any 401: the SDK transport calls
 *   `auth`, and so {@link prepareTokenRequest}, only after a 401 or when no token is served.
 *
 * Pass {@link tokenFetch} as the transport's `fetch` to honour a token endpoint `429`.
 */
export class WorkloadJwtBearerProvider implements OAuthClientProvider {
  #cached: CachedToken | undefined;

  public constructor(private readonly options: WorkloadJwtBearerOptions) {}

  public get redirectUrl(): undefined {
    return undefined;
  }

  public get clientMetadata(): OAuthClientMetadata {
    return { redirect_uris: [], grant_types: [JWT_BEARER_GRANT] };
  }

  public clientInformation(): OAuthClientInformationMixed {
    // Proof: returning undefined here made `connects and calls a tool without a dynamic
    // registration request` throw "OAuth client information must be saveable for dynamic
    // registration" (2026-10-27).
    return { client_id: this.options.credentialId, issuer: this.options.endpoint.issuer };
  }

  public tokens(): OAuthTokens | undefined {
    // Proof: serving the first token saved whatever was saved later made `re-fetches after a
    // 401` throw "Server returned 401 after successful authentication" (2026-10-27).
    const cached = this.#cached;
    if (cached === undefined) return undefined;
    // Proof: serving past `servedUntil` made `serves its token until 5 minutes before exp, or
    // half its lifetime for a short one` still see `long` at 3,300,000 ms (2026-10-27).
    if (this.options.monotonic.now() >= cached.servedUntil) {
      this.#cached = undefined;
      return undefined;
    }
    return cached.tokens;
  }

  /**
   * Caches what the token endpoint issued.
   * @throws when it carries no `expires_in`: mcp-01 always sends one, and a token of unknown
   * lifetime could not be dropped before it expires.
   */
  public saveTokens(tokens: OAuthTokens): void {
    const lifetimeSeconds = tokens.expires_in;
    // Proof: admitting it made `refuses a token without expires_in` see no throw; the token
    // would then be served forever (2026-10-27).
    if (lifetimeSeconds === undefined) {
      throw new Error('the MCP token endpoint issued a token without expires_in');
    }
    const lifetimeMs = lifetimeSeconds * 1_000;
    // A margin of half the lifetime keeps a short token served: a workload token of a few
    // minutes caps the access token below the 5-minute margin (verify.md, slice 6 notes).
    // Proof: a flat 5-minute margin made `a run outlives its workload token` fail with
    // "Server returned 401 after successful authentication" (2026-10-27).
    const margin = Math.min(MOST_REFRESH_MARGIN_MS, lifetimeMs / 2);
    this.#cached = {
      tokens,
      servedUntil: this.options.monotonic.now() + lifetimeMs - margin,
    };
  }

  public redirectToAuthorization(): void {
    throw new Error('a workload never redirects to an authorization page');
  }

  public saveCodeVerifier(): void {
    throw new Error('a workload has no PKCE code verifier');
  }

  public codeVerifier(): string {
    throw new Error('a workload has no PKCE code verifier');
  }

  public addClientAuthentication(): void {
    // RFC 7523 §2.1: the assertion is the grant, and no client authenticates.
  }

  public async prepareTokenRequest(): Promise<URLSearchParams> {
    // Reached only through `auth`, after a 401 or with no token served: the cached one is
    // no longer usable.
    // Proof: not clearing it made `drops its token when the SDK asks for a new one` still serve
    // the first token (2026-10-27).
    this.#cached = undefined;
    const form = new URLSearchParams({
      grant_type: JWT_BEARER_GRANT,
      // Proof: caching the first assertion made `a run outlives its workload token` throw the
      // SDK's InvalidGrantError (2026-10-27).
      assertion: await this.options.readAssertion(),
      resource: this.options.endpoint.resource,
    });
    if (this.options.run !== undefined) form.set('wbs_run', this.options.run);
    return form;
  }

  public invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): void {
    // Proof: ignoring every scope made `drops its token when the SDK invalidates it` still
    // serve the token after invalidateCredentials('tokens') (2026-10-27).
    if (scope === 'all' || scope === 'tokens') this.#cached = undefined;
  }

  /**
   * `send` for the SDK transport, honouring a token endpoint `429`: it waits the `Retry-After`
   * seconds, capped at 60 s, and retries once (M2); a second `429`, or one without a delay,
   * reaches the SDK, which throws. A token request is never redirected: Bun would re-send its
   * body, the assertion included, to a 307's target, so the 3xx answer reaches the SDK, which
   * throws naming its status. Every other request passes through untouched.
   */
  public tokenFetch(send: FetchLike): FetchLike {
    return async (input, init) => {
      if (urlOf(input) !== this.options.endpoint.tokenUrl) return send(input, init);
      // Proof: passing `init` unchanged made `never follows a redirect of a token request` get
      // the other origin's 200 instead of the 307 (2026-10-27).
      const tokenInit: RequestInit = { ...init, redirect: 'manual' };
      const response = await send(input, tokenInit);
      if (response.status !== 429) return response;
      const retryAfter = retryAfterSecondsOf(response);
      if (retryAfter === null) return response;
      // Proof: dropping the cap made `waits a token endpoint Retry-After, capped at 60 s, and
      // retries once` sleep 90000 ms (2026-10-27).
      await this.options.sleep(Math.min(retryAfter * 1_000, MOST_RETRY_AFTER_MS));
      return send(input, tokenInit);
    };
  }
}
