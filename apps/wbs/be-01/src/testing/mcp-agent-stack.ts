import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mcpAuthorizationServerOf } from '@wbs/contracts';

import { importMachineGrantKeys } from '../runtime/machine-grant';
import type { HarnessMachineGrants, OrganizationHarness } from './organization-harness';

const REPO_ROOT = join(import.meta.dir, '../../../../..');
/** mcp-01 as `main.ts` composes it, bound to loopback; prints `{"port":N}` once serving. */
const MCP_ENTRYPOINT = 'apps/wbs/mcp-01/src/load/mcp-01-loopback.ts';
/**
 * The resource mcp-01 is configured as. Tokens name it as their audience and be-01's grant
 * route its authorization server; requests go to the loopback port, which neither checks.
 */
const PUBLIC_URL = 'https://wbs.example/mcp';

/**
 * One tool call's answer as an agent reads it, sorted by who answered:
 * - `be-01`: mcp-01 forwarded the call. A success carries be-01's body (a tool result carries
 *   no status, so `ok` stands for any 2xx); a refusal carries be-01's status and body, which
 *   mcp-01 prints verbatim after its `<tool> was refused: HTTP <status>` line (D7);
 * - `mcp-01`: mcp-01 answered the call itself, a tool error `<tool> could not be called:
 *   <code>`, such as `machine_credential_refused` for a revoked key's token;
 * - `http`: `/mcp` refused the request before any call, as an HTTP status.
 */
export type ToolAnswer =
  | { readonly via: 'be-01'; readonly ok: true; readonly body: unknown; readonly text: string }
  | {
      readonly via: 'be-01';
      readonly ok: false;
      readonly status: number;
      readonly body: unknown;
      readonly text: string;
    }
  | { readonly via: 'mcp-01'; readonly code: string; readonly text: string }
  | { readonly via: 'http'; readonly status: number; readonly text: string };

/** What the MCP SDK's `callTool` answers, as far as {@link toolAnswerOf} reads it. */
export interface CallToolOutcome {
  readonly isError?: boolean;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
}

/**
 * {@link ToolAnswer} of tool `name` from mcp-01's result, by the texts `wbs-client.ts` and
 * `server.ts` write.
 *
 * @throws when a success is neither JSON nor mcp-01's no-content line, or a tool error is
 *   neither a refusal by be-01 nor one of mcp-01's own: the test would otherwise compare
 *   against something it did not mean to read.
 */
export function toolAnswerOf(name: string, outcome: CallToolOutcome): ToolAnswer {
  const text = (outcome.content ?? []).map((part) => part.text ?? '').join('\n');
  const tool = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (outcome.isError !== true) {
    // Proof: with this line read as JSON, `reads mcp-01's no-content line as an empty
    // success` (mcp-agent-stack.test.ts) threw; watched 2026-10-29.
    if (new RegExp(`^${tool}: HTTP 2\\d\\d, no content\\.$`).test(text))
      return { via: 'be-01', ok: true, body: null, text };
    // Proof: with the parse replaced by the raw text, `refuses a success that is not JSON`
    // answered it as a body; watched 2026-10-29.
    return { via: 'be-01', ok: true, body: JSON.parse(text) as unknown, text };
  }
  const refused = new RegExp(`^${tool} was refused: HTTP (\\d{3})[^\\n]*(?:\\n([\\s\\S]*))?$`).exec(
    text,
  );
  if (refused !== null) {
    const rest = refused.at(2) ?? '';
    return {
      via: 'be-01',
      ok: false,
      status: Number(refused[1]),
      body: rest.startsWith('{') ? (JSON.parse(rest) as unknown) : rest,
      text,
    };
  }
  const own = new RegExp(`^${tool} could not be called: ([a-z_]+)`).exec(text);
  // Proof: with this refusal replaced by an `mcp-01` answer of code `unknown`, `refuses a tool
  // error it cannot attribute` answered it; watched 2026-10-29.
  if (own?.[1] === undefined) throw new Error(`an unattributable tool error from ${name}: ${text}`);
  return { via: 'mcp-01', code: own[1], text };
}

/** The token endpoint's answer to one machine token request. */
export interface TokenAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** One agent's MCP connection, with one access token as its Bearer. */
export interface McpAgentSession {
  call(name: string, input: Record<string, unknown>): Promise<ToolAnswer>;
  close(): Promise<void>;
}

/** be-01's harness behind a real mcp-01 process, as {@link startMcpAgentStack} starts them. */
export interface McpAgentStack {
  readonly h: OrganizationHarness;
  /**
   * A `client_credentials` request for the key at mcp-01's token endpoint, the key as HTTP
   * Basic password and its credential id as user, as `twilight-dash mcp token` sends it.
   */
  token(key: string): Promise<TokenAnswer>;
  /** {@link token}, answering the access token. @throws when the endpoint refuses. */
  accessTokenFor(key: string): Promise<string>;
  connect(accessToken: string): Promise<McpAgentSession>;
  /** Everything mcp-01 printed, for a failing test's message. */
  log(): string;
  stop(): Promise<void>;
}

/**
 * Starts the agent path of `wbs-mcp-agent-surface` end to end for one test file: the harness
 * `open` composes, with machine grants under a per-run secret and grant key, served on a
 * loopback port; and mcp-01 (`mcp-01-loopback.ts`) in its own process in standalone mode in
 * front of it, with a throwaway session store. Agents then do what a fleet does: a machine
 * grant at the token endpoint, then tool calls on `/mcp` with the MCP SDK's client.
 *
 * @throws when mcp-01 exits or prints no port line; what started is stopped first.
 */
export async function startMcpAgentStack(
  open: (grants: HarnessMachineGrants) => OrganizationHarness,
): Promise<McpAgentStack> {
  // Generated per run, never a deployment's: be-01 and mcp-01 share the secret.
  const secret = randomBytes(32).toString('base64url');
  const h = open({
    secret,
    keys: await importMachineGrantKeys({
      current: randomBytes(32).toString('base64url'),
      previous: null,
    }),
    authorizationServer: mcpAuthorizationServerOf(PUBLIC_URL),
  });
  const backend = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      return await h.request(`${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        ...(request.method === 'GET' || request.method === 'HEAD'
          ? {}
          : { body: await request.arrayBuffer() }),
      });
    },
  });
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('PATH is required to start mcp-01');
  const storeDirectory = mkdtempSync(join(tmpdir(), 'wbs-mcp-agent-stack-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const mcp = Bun.spawn([process.execPath, MCP_ENTRYPOINT], {
    cwd: REPO_ROOT,
    env: {
      PATH: path,
      MCP_AUTH_MODE: 'standalone',
      MCP_PUBLIC_URL: PUBLIC_URL,
      MCP_TRUSTED_PROXY_HOPS: '0',
      WBS_API_URL: `http://127.0.0.1:${String(backend.port)}`,
      MCP_BE_INTERNAL_SECRET: secret,
      MCP_STORE_PATH: join(storeDirectory, 'mcp-session.sqlite'),
      MCP_STORE_KEY_CURRENT: randomBytes(32).toString('base64'),
      MCP_SIGNING_KEY_CURRENT: privateKey
        .export({ format: 'der', type: 'pkcs8' })
        .toString('base64'),
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let printed = '';
  const stop = async () => {
    mcp.kill('SIGTERM');
    await mcp.exited;
    await backend.stop(true);
    rmSync(storeDirectory, { recursive: true, force: true });
  };
  void (async () => {
    for await (const chunk of mcp.stderr) printed += new TextDecoder().decode(chunk);
  })();
  // Read on after the port line: a reader that stopped would close the pipe, and mcp-01's next
  // log line would kill it with EPIPE.
  const stdout = mcp.stdout.getReader();
  const port = await (async () => {
    for (;;) {
      const chunk = await stdout.read();
      if (chunk.done) return null;
      printed += new TextDecoder().decode(chunk.value);
      const line = /^\{"port":(\d+)\}$/m.exec(printed);
      if (line?.[1] !== undefined) return Number(line[1]);
    }
  })();
  void (async () => {
    for (;;) {
      const chunk = await stdout.read();
      if (chunk.done) return;
      printed += new TextDecoder().decode(chunk.value);
    }
  })();
  if (port === null) {
    await stop();
    throw new Error(`mcp-01 exited before serving:\n${printed}`);
  }
  const origin = `http://127.0.0.1:${String(port)}`;

  async function token(key: string): Promise<TokenAnswer> {
    const credentialId = key.slice('wbs_mk_'.length, key.indexOf('.'));
    const answered = await fetch(`${origin}/mcp/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${btoa(`${credentialId}:${key}`)}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', resource: PUBLIC_URL }),
      redirect: 'manual',
    });
    const text = await answered.text();
    // The token endpoint answers JSON, an error included (RFC 6749 §5.2).
    return { status: answered.status, body: JSON.parse(text) as unknown };
  }

  return {
    h,
    token,
    async accessTokenFor(key) {
      const answered = await token(key);
      const issued = answered.body as { access_token?: unknown };
      if (answered.status !== 200 || typeof issued.access_token !== 'string')
        throw new Error(`the token endpoint refused: ${JSON.stringify(answered)}`);
      return issued.access_token;
    },
    async connect(accessToken) {
      const client = new Client({ name: 'wbs-swarm-agent', version: '0.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
        }),
      );
      return {
        async call(name, input) {
          try {
            return toolAnswerOf(
              name,
              // The SDK answers a `CallToolResult`; the fields read are the ones it declares.
              (await client.callTool({ name, arguments: input })) as CallToolOutcome,
            );
          } catch (cause) {
            if (cause instanceof StreamableHTTPError && cause.code !== undefined)
              return { via: 'http', status: cause.code, text: cause.message };
            throw cause;
          }
        },
        close: () => client.close(),
      };
    },
    log: () => printed,
    stop,
  };
}
