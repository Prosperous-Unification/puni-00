import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import type { Monotonic } from '../clock';
import type { ApiKey, McpEndpoint } from './machine-token';

/** M2: a cached token is served until 5 minutes before `exp`, or half its lifetime before. */
const MOST_REFRESH_MARGIN_MS = 5 * 60 * 1_000;

export interface ApiKeyClientOptions {
  readonly endpoint: McpEndpoint;
  readonly key: ApiKey;
  /** Measures the cached token's age; never a wall clock. */
  readonly monotonic: Monotonic;
}

interface CachedToken {
  readonly tokens: OAuthTokens;
  readonly servedUntil: number;
}

/**
 * The MCP SDK client provider for a Dash process holding a `wbs_mk_` API key
 * (`wbs-mcp-agent-surface` M1 (i), M12): the `client_credentials` grant at WBS's mcp-01, the key
 * sent as HTTP Basic by {@link ApiKey.basicAuthorization} and never otherwise revealed.
 *
 * - {@link clientInformation} is the key's credential id stamped with the authorization server's
 *   issuer, so the SDK never falls back to dynamic client registration, which mcp-01 refuses for
 *   machine grants.
 * - The access token is cached in memory only, until 5 minutes before `exp` or half its lifetime
 *   before, whichever is sooner, and dropped whenever the SDK asks for a new one (after a 401).
 */
export class ApiKeyClientProvider implements OAuthClientProvider {
  #cached: CachedToken | undefined;

  public constructor(private readonly options: ApiKeyClientOptions) {}

  public get redirectUrl(): undefined {
    return undefined;
  }

  public get clientMetadata(): OAuthClientMetadata {
    return { redirect_uris: [], grant_types: ['client_credentials'] };
  }

  public clientInformation(): OAuthClientInformationMixed {
    return { client_id: this.options.key.credentialId, issuer: this.options.endpoint.issuer };
  }

  public tokens(): OAuthTokens | undefined {
    const cached = this.#cached;
    if (cached === undefined) return undefined;
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
    if (lifetimeSeconds === undefined) {
      throw new Error('the MCP token endpoint issued a token without expires_in');
    }
    const lifetimeMs = lifetimeSeconds * 1_000;
    const margin = Math.min(MOST_REFRESH_MARGIN_MS, lifetimeMs / 2);
    this.#cached = { tokens, servedUntil: this.options.monotonic.now() + lifetimeMs - margin };
  }

  public redirectToAuthorization(): void {
    throw new Error('an API key client never redirects to an authorization page');
  }

  public saveCodeVerifier(): void {
    throw new Error('an API key client has no PKCE code verifier');
  }

  public codeVerifier(): string {
    throw new Error('an API key client has no PKCE code verifier');
  }

  /**
   * `client_secret_basic`, as `twilight-dash mcp token` sends it. A bound property, because the
   * SDK calls it detached from the provider.
   * Proof: as a method, `stores a report through the tool…` (report-capacity.boot.test.ts) ended
   * `wbs_unavailable`: the SDK's detached call threw a TypeError reading `this` (2026-10-29).
   */
  public readonly addClientAuthentication = (headers: Headers): void => {
    headers.set('authorization', this.options.key.basicAuthorization());
  };

  public prepareTokenRequest(): URLSearchParams {
    // Reached only through `auth`, after a 401 or with no token served.
    this.#cached = undefined;
    return new URLSearchParams({
      grant_type: 'client_credentials',
      resource: this.options.endpoint.resource,
    });
  }

  public invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): void {
    if (scope === 'all' || scope === 'tokens') this.#cached = undefined;
  }
}
