import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * One agent process of the pool swarm rehearsal (`pool-swarm-rehearsal.ts`): an MCP client
 * that speaks Streamable HTTP to the `url` of its `<personId>.mcp.json`, as `twilight-dash pool
 * import` wrote it, and gets its `Authorization` header the way Claude Code does: by running the
 * config's `headersHelper` through `sh -c` and reading the JSON headers it prints. The helper
 * runs when the client connects, and again (then the request is sent once more) when `/mcp`
 * answers HTTP 401; never on an in-band tool error.
 *
 *     bun pool-swarm-agent.ts <personId>.mcp.json
 *
 * The driver sends one JSON command per stdin line and reads one JSON answer per stdout line,
 * each echoing the command's `seq`; every helper run and 401 is also printed as an event line
 * (`{"event":…}`). Commands:
 * - `tools`: the tool names `/mcp` lists;
 * - `claim` `{ projectId }`: reads the startable work and claims the first leaf it can, for its
 *   own person with `assign: true`, answering the claim (or every refusal it met);
 * - `heartbeat`: `postApiClaimsRenew`;
 * - `register_use` `{ projectId, workItemId, resourceId, units, run }`: reports the physical copy
 *   it made for the claim (`postApiProjectsByIdResourceUses`), responsible person itself;
 * - `release` `{ projectId, workItemId }`: releases its own claim on `workItemId`;
 * - `stop`: closes the client and exits 0.
 *
 * A tool call answers `{ outcome, text }`: `ok`, `tool_error:<code>`, `http_<status>` or
 * `helper_failed:<exit code>`. It never prints a key; it prints the bearer's `jti` only. Its
 * casts read JSON from the driver, its helper and mcp-01, all of the rehearsal's own processes.
 */
const configPath = process.argv.at(2);
if (configPath === undefined) throw new Error('usage: pool-swarm-agent.ts <personId>.mcp.json');
const personId = basename(configPath, '.mcp.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
  mcpServers: { wbs: { type: string; url: string; headersHelper: string } };
};
const { url, headersHelper } = config.mcpServers.wbs;

function emit(line: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ personId, at: Date.now(), ...line })}\n`);
}

/** Thrown when the helper exits non-zero: Claude Code then has no header to send. */
class HelperFailed extends Error {
  constructor(readonly exitCode: number) {
    super(`headersHelper exited ${String(exitCode)}`);
  }
}

let headers: Record<string, string> | null = null;

/** The `jti` of the bearer in `authorization`, for the timeline; never the token. */
function jtiOf(authorization: string): string {
  const payload = authorization.replace(/^Bearer /, '').split('.')[1] ?? '';
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { jti?: unknown };
  return typeof claims.jti === 'string' ? claims.jti : 'none';
}

/** Runs the stored `headersHelper` as Claude Code does and keeps the headers it printed. */
async function runHelper(why: string): Promise<Record<string, string>> {
  const child = Bun.spawn(['sh', '-c', headersHelper], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    headers = null;
    emit({ event: 'helper_failed', why, exitCode, stderr: stderr.trim().slice(0, 400) });
    throw new HelperFailed(exitCode);
  }
  const printed = JSON.parse(stdout) as Record<string, string | undefined>;
  const authorization = printed['Authorization'];
  if (authorization === undefined) throw new Error('the headersHelper printed no Authorization');
  headers = { Authorization: authorization };
  emit({ event: 'helper_issued', why, jti: jtiOf(authorization) });
  return headers;
}

/** `fetch` with the helper's headers; a 401 re-runs the helper and sends the request once more. */
async function helperFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const send = (with_: Record<string, string>) => {
    const merged = new Headers(init?.headers);
    for (const [name, value] of Object.entries(with_)) merged.set(name, value);
    return fetch(input, { ...init, headers: merged });
  };
  const response = await send(headers ?? (await runHelper('connect')));
  if (response.status !== 401) return response;
  emit({ event: 'http_401', wwwAuthenticate: response.headers.get('www-authenticate') });
  return await send(await runHelper('after_401'));
}

let client: Client | null = null;

async function connected(): Promise<Client> {
  if (client !== null) return client;
  const fresh = new Client({ name: `pool-agent-${personId}`, version: '1.0.0' });
  await fresh.connect(new StreamableHTTPClientTransport(new URL(url), { fetch: helperFetch }));
  client = fresh;
  return fresh;
}

interface ToolAnswer {
  readonly outcome: string;
  readonly text: string;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
  try {
    const answered = (await (await connected()).callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: { type: string; text?: string }[];
    };
    const text = (answered.content ?? []).map((part) => part.text ?? '').join('\n');
    if (answered.isError !== true) return { outcome: 'ok', text };
    const code =
      /could not be called: ([a-z_]+)/.exec(text)?.[1] ?? /"error":"([a-z_]+)"/.exec(text)?.[1];
    return { outcome: `tool_error:${code ?? 'other'}`, text: text.slice(0, 400) };
  } catch (cause) {
    if (cause instanceof HelperFailed) {
      client = null;
      return { outcome: `helper_failed:${String(cause.exitCode)}`, text: cause.message };
    }
    const status = /HTTP (\d{3})|\b(4\d\d|5\d\d)\b/.exec(String(cause));
    client = null;
    return {
      outcome: `http_${status?.[1] ?? status?.[2] ?? 'thrown'}`,
      text: String(cause).slice(0, 400),
    };
  }
}

interface Startable {
  readonly leaves: readonly { readonly workItemId: string; readonly stepIds: readonly string[] }[];
}

async function claim(projectId: string): Promise<Record<string, unknown>> {
  const read = await callTool('getApiProjectsByIdStartable', { id: projectId });
  if (read.outcome !== 'ok') return { outcome: read.outcome, text: read.text };
  const startable = JSON.parse(read.text) as Startable;
  const refusals: string[] = [];
  for (const leaf of startable.leaves) {
    const answer = await callTool('postApiProjectsByIdCommands', {
      id: projectId,
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: leaf.workItemId,
          personId,
          steps: leaf.stepIds,
          assign: true,
        },
      ],
    });
    if (answer.outcome === 'ok') {
      const result = (
        JSON.parse(answer.text) as {
          results: { claimIds: string[]; acquired: { resourceId: string; units: number }[] }[];
        }
      ).results[0];
      return { outcome: 'ok', workItemId: leaf.workItemId, ...result, refusals };
    }
    refusals.push(answer.outcome);
    // Another agent won this leaf, or it does not fit what is free: try the next.
    if (!/already_claimed|resources_exhausted|claim_limit/.test(answer.outcome))
      return { outcome: answer.outcome, text: answer.text, refusals };
  }
  return { outcome: 'nothing_startable', refusals };
}

async function answer(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (command['op']) {
    case 'tools': {
      try {
        return {
          outcome: 'ok',
          tools: (await (await connected()).listTools()).tools.map((t) => t.name),
        };
      } catch (cause) {
        client = null;
        return { outcome: 'thrown', text: String(cause).slice(0, 400) };
      }
    }
    case 'claim':
      return await claim(String(command['projectId']));
    case 'heartbeat': {
      const renewed = await callTool('postApiClaimsRenew', {});
      return renewed.outcome === 'ok'
        ? { outcome: 'ok', ...(JSON.parse(renewed.text) as Record<string, unknown>) }
        : { ...renewed };
    }
    case 'register_use': {
      const registered = await callTool('postApiProjectsByIdResourceUses', {
        id: String(command['projectId']),
        requestId: crypto.randomUUID(),
        resourceId: String(command['resourceId']),
        workItemId: String(command['workItemId']),
        agentRun: String(command['run']),
        responsiblePersonId: personId,
        locator: `/scratch/${personId}/${String(command['workItemId'])}`,
        units: Number(command['units']),
      });
      if (registered.outcome !== 'ok') return { ...registered };
      const { use } = JSON.parse(registered.text) as { use: { id: string; state: string } };
      return { outcome: 'ok', useId: use.id, state: use.state };
    }
    case 'release': {
      const released = await callTool('postApiProjectsByIdCommands', {
        id: String(command['projectId']),
        commands: [
          { kind: 'releaseWorkItem', workItemId: String(command['workItemId']), personId },
        ],
      });
      return { ...released };
    }
    case 'stop':
      await client?.close();
      return { outcome: 'ok' };
    default:
      return { outcome: 'unknown_op' };
  }
}

for await (const line of console) {
  if (line.trim() === '') continue;
  const command = JSON.parse(line) as Record<string, unknown>;
  emit({ seq: command['seq'], op: command['op'], ...(await answer(command)) });
  if (command['op'] === 'stop') process.exit(0);
}
