import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InvalidClientError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

import type { Monotonic } from '../clock';
import { ApiKeyClientProvider } from './api-key-provider';
import type { ApiKey, FetchLike, McpEndpoint } from './machine-token';

/**
 * How one WBS tool call ended, as mcp-01 reports it (`wbs-mcp-agent-surface` D7):
 * - `answered`: be-01 answered 2xx; `body` is its JSON, or null for no content;
 * - `refused`: be-01 refused with a 4xx; `error` is its code when the body names one;
 * - `not_called`: mcp-01 did not complete the call (`machine_credential_refused`,
 *   `rate_limited`, `invalid_token`, `server_error`, …), named by `reason`.
 */
export type ToolAnswer =
  | { readonly kind: 'answered'; readonly body: unknown }
  | {
      readonly kind: 'refused';
      readonly status: number;
      readonly error: string | null;
      readonly body: unknown;
    }
  | { readonly kind: 'not_called'; readonly reason: string };

/**
 * A tool call that did not reach an answer: the connection, the token endpoint or the call
 * failed, or timed out. The cause is the SDK's or the transport's error. A retry may succeed.
 */
export class WbsUnreachable extends Error {
  public constructor(tool: string, options: ErrorOptions) {
    super(`WBS did not answer ${tool}`, options);
    this.name = 'WbsUnreachable';
  }
}

/** WBS's agent surface as Dash calls it: one tool call at a time, by tool name. */
export interface WbsTools {
  /**
   * Calls tool `name` with `input` and reads mcp-01's answer. A key the token endpoint refuses
   * answers `not_called` `machine_credential_refused`, as mcp-01 does for a refused credential.
   * @throws WbsUnreachable when no answer arrived (the next call reconnects); a plain error on
   * an answer {@link toolAnswerOf} cannot attribute.
   */
  call(name: string, input: Readonly<Record<string, unknown>>): Promise<ToolAnswer>;
  close(): Promise<void>;
}

/** The part of the SDK's `callTool` result {@link toolAnswerOf} reads. */
export interface CallToolOutcome {
  readonly isError?: boolean;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
}

const escaped = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads mcp-01's text answer to one call of tool `name` (`apps/wbs/mcp-01/src/wbs-client.ts`
 * and `server.ts` write it): a success is be-01's JSON body or `<tool>: HTTP 2xx, no content.`;
 * a refusal is `<tool> was refused: HTTP <status> … from <route>.` followed by be-01's body; mcp-01's
 * own failure is `<tool> could not be called: <reason>…`.
 * @throws on a success that is not JSON, and on an error naming neither shape.
 */
export function toolAnswerOf(name: string, outcome: CallToolOutcome): ToolAnswer {
  const text = (outcome.content ?? []).map((part) => part.text ?? '').join('\n');
  const tool = escaped(name);
  if (outcome.isError !== true) {
    // Proof: reading this line as JSON made `reads mcp-01’s no-content line as an empty success`
    // (wbs-tools.test.ts) fail (2026-10-29).
    if (new RegExp(`^${tool}: HTTP 2\\d\\d, no content\\.$`).test(text))
      return { kind: 'answered', body: null };
    try {
      return { kind: 'answered', body: JSON.parse(text) as unknown };
    } catch (cause) {
      throw new Error(`${name} answered a success that is not JSON`, { cause });
    }
  }
  const refused = new RegExp(`^${tool} was refused: HTTP (\\d{3})[^\\n]*(?:\\n([\\s\\S]*))?$`).exec(
    text,
  );
  if (refused !== null) {
    const rest = refused.at(2) ?? '';
    let body: unknown = rest;
    if (rest.startsWith('{')) {
      try {
        body = JSON.parse(rest) as unknown;
      } catch (cause) {
        throw new Error(`${name} was refused with a body that is not JSON`, { cause });
      }
    }
    const error =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null;
    return { kind: 'refused', status: Number(refused[1]), error, body };
  }
  const own = new RegExp(`^${tool} could not be called: ([a-z_]+)`).exec(text);
  // Proof: answering it `not_called` made `refuses a tool error it cannot attribute`
  // (wbs-tools.test.ts) fail (2026-10-29).
  if (own?.[1] === undefined) throw new Error(`an unattributable tool error from ${name}`);
  return { kind: 'not_called', reason: own[1] };
}

export interface McpWbsToolsOptions {
  readonly endpoint: McpEndpoint;
  readonly key: ApiKey;
  readonly send: FetchLike;
  readonly monotonic: Monotonic;
  /** Each call's deadline, after which the SDK throws a timeout. */
  readonly timeoutMs: number;
  /** The MCP client name mcp-01 logs. */
  readonly clientName: string;
}

/**
 * {@link WbsTools} over WBS's MCP endpoint with an API key (`wbs-mcp-agent-surface` M9, M12):
 * a `client_credentials` token from {@link ApiKeyClientProvider}, renewed by the SDK on a 401,
 * then `tools/call`. The connection opens at the first call; a call that throws drops it, so the
 * next call reconnects. No request is ever redirected: the bearer or the key would go with it.
 */
export class McpWbsTools implements WbsTools {
  #client: Client | undefined;
  readonly #provider: ApiKeyClientProvider;

  public constructor(private readonly options: McpWbsToolsOptions) {
    this.#provider = new ApiKeyClientProvider({
      endpoint: options.endpoint,
      key: options.key,
      monotonic: options.monotonic,
    });
  }

  public async call(name: string, input: Readonly<Record<string, unknown>>): Promise<ToolAnswer> {
    let client = this.#client;
    let outcome: CallToolOutcome;
    try {
      client ??= await this.#connect();
      // The SDK's result type is wider than the text content mcp-01 answers; toolAnswerOf
      // reads it defensively and throws on anything it cannot attribute.
      outcome = (await client.callTool({ name, arguments: { ...input } }, undefined, {
        timeout: this.options.timeoutMs,
      })) as CallToolOutcome;
    } catch (cause) {
      this.#client = undefined;
      if (client !== undefined) await client.close();
      // The token endpoint refused the key itself (revoked, expired, unknown): mcp-01's in-band
      // answer for the same credential, so a caller reads one refusal whichever came first.
      // Proof: without it, `exits refused at once for a revoked key…`
      // (report-capacity.boot.test.ts) retried a cadence and ended `wbs_unavailable` (2026-10-29).
      if (cause instanceof InvalidClientError)
        return { kind: 'not_called', reason: 'machine_credential_refused' };
      throw new WbsUnreachable(name, { cause });
    }
    return toolAnswerOf(name, outcome);
  }

  public async close(): Promise<void> {
    const client = this.#client;
    this.#client = undefined;
    if (client !== undefined) await client.close();
  }

  async #connect(): Promise<Client> {
    const send = this.options.send;
    const transport = new StreamableHTTPClientTransport(new URL(this.options.endpoint.resource), {
      authProvider: this.#provider,
      // Proof: passing `init` unchanged made `calls a tool and never lets a request follow a
      // redirect` (wbs-tools.test.ts) see the SDK's default (2026-10-29).
      fetch: (input, init) => send(input, { ...init, redirect: 'manual' }),
    });
    const client = new Client({ name: this.options.clientName, version: '1.0.0' });
    await client.connect(transport);
    this.#client = client;
    return client;
  }
}
