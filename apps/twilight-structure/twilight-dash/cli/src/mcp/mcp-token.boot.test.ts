import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { mcpEndpointOf, urlOf } from './machine-token';
import { startWbsMcpStack, type WbsMcpStack } from './testing/wbs-mcp-stack';
import { runMcpCommand } from './token-command';
import { WorkloadJwtBearerProvider } from './workload-provider';

/**
 * Task 2.4 of `wbs-mcp-agent-surface` against WBS's real machine token path: be-01's composed
 * grant route and mcp-01's production entrypoint, each in its own process
 * ({@link startWbsMcpStack}), over loopback HTTP. The tests share one stack and run in order.
 */
setDefaultTimeout(60_000);

const ENTRYPOINT = join(import.meta.dir, '../entrypoint.ts');
const SUBJECT = 'repo:puni/fleet:ref:refs/heads/main';
const realMonotonic = { now: () => performance.now() };

let stack: WbsMcpStack;
let scratch = '';
/** Every token request a helper run or a provider sent, with its answer's status. */
const tokenAnswers: number[] = [];

beforeAll(async () => {
  stack = await startWbsMcpStack();
  scratch = mkdtempSync(join(tmpdir(), 'dash-mcp-token-'));
  await stack.fixture('activate');
  // claire's `oidc` credential for the trusted issuer's SUBJECT.
  await stack.fixture('workload', { subject: SUBJECT });
});

afterAll(async () => {
  await stack.stop();
  rmSync(scratch, { recursive: true, force: true });
});

function tokenUrl(): string {
  return mcpEndpointOf(stack.resource).tokenUrl;
}

/** `fetch`, recording each token request's answer. */
async function send(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (urlOf(input) === tokenUrl()) tokenAnswers.push(response.status);
  return response;
}

/** A fresh API key of `claire` in an owner-only file. */
async function keyFile(): Promise<{ path: string; id: string; key: string }> {
  const issued = await stack.fixture<{ id: string; key: string }>('api-key', {
    personId: 'claire',
  });
  const path = join(scratch, `${issued.id}.key`);
  writeFileSync(path, `${issued.key}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, ...issued };
}

/** One in-process helper run: the bearer it printed. */
async function helper(flags: readonly string[]): Promise<string> {
  const printed: string[] = [];
  await runMcpCommand(['token', '--resource', stack.resource, ...flags], {
    send,
    monotonic: { now: () => 0 },
    sleep: () => Promise.reject(new Error('no 429 is expected on this path')),
    environment: {},
    write: (text) => printed.push(text),
  });
  expect(printed).toHaveLength(1);
  const headers = JSON.parse(printed[0] ?? '') as { Authorization: string };
  expect(headers.Authorization).toStartWith('Bearer ');
  return headers.Authorization.slice('Bearer '.length);
}

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

/** One raw `tools/call` of `getApiProjects` at `/mcp` with `token`, as Claude Code sends it. */
async function callWith(token: string): Promise<{ status: number; body: string }> {
  const response = await fetch(stack.resource, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'getApiProjects', arguments: {} },
    }),
  });
  return { status: response.status, body: await response.text() };
}

describe('twilight-dash mcp token (headersHelper)', () => {
  test('a re-run 0.6 s after a 401 on the token it served issues a new token', async () => {
    const { path } = await keyFile();
    const before = tokenAnswers.length;
    const first = await helper(['--key-file', path]);
    expect(await callWith(first)).toMatchObject({ status: 200 });
    // A grant key rotation that dropped `_PREVIOUS` early: be-01 answers unknown_grant_key, and
    // mcp-01 answers HTTP 401, so Claude Code re-runs the helper.
    await stack.fixture('rotate-grant-key');
    expect(await callWith(first)).toMatchObject({ status: 401 });
    await Bun.sleep(600);
    const second = await helper(['--key-file', path]);
    // Proof: memoising the bearer in token-command.ts (a module-level variable printed once
    // set) made this re-run print the rejected token: `not.toBe(first)` failed (2026-10-27).
    // Each run still sends its request, so the answers below are checked too.
    expect(second).not.toBe(first);
    expect(tokenAnswers.slice(before)).toEqual([200, 200]);
    expect(await callWith(second)).toMatchObject({ status: 200 });
  });

  test('a rotated key (unknown_grant_key) recovers on the re-run, for a workload token too', async () => {
    const assertionPath = join(scratch, 'projected-token');
    const project = async (): Promise<void> => {
      const { assertion } = await stack.fixture<{ assertion: string }>('assertion', {
        subject: SUBJECT,
      });
      writeFileSync(assertionPath, assertion);
    };
    await project();
    const first = await helper(['--assertion-file', assertionPath]);
    expect(await callWith(first)).toMatchObject({ status: 200 });
    await stack.fixture('rotate-grant-key');
    const refused = await callWith(first);
    expect(refused).toMatchObject({ status: 401 });
    expect(JSON.parse(refused.body)).toEqual({ error: 'invalid_token' });
    // The kubelet rotates the projected token in place; the re-run reads the new one.
    await project();
    const second = await helper(['--assertion-file', assertionPath]);
    expect(second).not.toBe(first);
    expect(await callWith(second)).toMatchObject({ status: 200 });
  });

  test('a run is signed into the token as wbs_run', async () => {
    const { path } = await keyFile();
    const token = await helper(['--key-file', path, '--run', 'fleet-run-7']);
    expect(claimsOf(token)).toMatchObject({ token_use: 'machine', wbs_run: 'fleet-run-7' });
  });

  test('the entrypoint prints only the header map, and a refusal names no key', async () => {
    const { path, id, key } = await keyFile();
    const run = async (): Promise<{ code: number; stdout: string; stderr: string }> => {
      const child = Bun.spawn(
        [
          process.execPath,
          ENTRYPOINT,
          'mcp',
          'token',
          '--resource',
          stack.resource,
          '--key-file',
          path,
        ],
        { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code, stdout, stderr };
    };
    const issued = await run();
    expect(issued.code).toBe(0);
    expect(issued.stderr).toBe('');
    expect(Object.keys(JSON.parse(issued.stdout) as object)).toEqual(['Authorization']);
    await stack.fixture('revoke', { id });
    const refused = await run();
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toBe('error: the MCP token endpoint refused: HTTP 401 invalid_client\n');
    for (const printed of [issued.stdout, issued.stderr, refused.stdout, refused.stderr]) {
      expect(printed).not.toContain(key);
      expect(printed).not.toContain(key.slice(key.indexOf('.') + 1));
      expect(printed).not.toContain(btoa(`${id}:${key}`));
    }
  });

  test('100 staggered issuances on one credential within a minute all succeed under M10', async () => {
    const { path } = await keyFile();
    const before = tokenAnswers.length;
    const runs: Promise<string>[] = [];
    // 100 runs over 4 s: a staggered `claude -p` batch, each helper issuing once.
    for (let index = 0; index < 100; index += 1) {
      runs.push(helper(['--key-file', path, '--run', `batch-${String(index)}`]));
      await Bun.sleep(40);
    }
    const tokens = await Promise.all(runs);
    expect(new Set(tokens).size).toBe(100);
    // Proof: sending each run's token request twice in token-command.ts (a discarded first
    // issuance) drew M10's 429 within the batch: a helper reached its Retry-After wait, which
    // this test's `sleep` refuses ("no 429 is expected on this path") (2026-10-27).
    expect(tokenAnswers.slice(before).filter((status) => status !== 200)).toEqual([]);
    expect(tokenAnswers.length - before).toBe(100);
  });
});

describe('WorkloadJwtBearerProvider', () => {
  const sent: string[] = [];
  const recorded = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push(`${init?.method ?? 'GET'} ${urlOf(input)}`);
    return send(input, init);
  };

  async function connect(
    provider: WorkloadJwtBearerProvider,
  ): Promise<{ client: Client; close: () => Promise<void> }> {
    const transport = new StreamableHTTPClientTransport(new URL(stack.resource), {
      authProvider: provider,
      fetch: provider.tokenFetch(recorded),
    });
    const client = new Client({ name: 'dash-workload', version: '0.0.0' });
    await client.connect(transport);
    return { client, close: () => client.close() };
  }

  function provider(options: { lifetimeSeconds?: number } = {}) {
    const reads: string[] = [];
    const instance = new WorkloadJwtBearerProvider({
      endpoint: mcpEndpointOf(stack.resource),
      credentialId: 'workload-credential',
      readAssertion: async () => {
        const { assertion } = await stack.fixture<{ assertion: string }>('assertion', {
          subject: SUBJECT,
          ...(options.lifetimeSeconds === undefined
            ? {}
            : { lifetimeSeconds: options.lifetimeSeconds }),
        });
        reads.push(assertion);
        return assertion;
      },
      run: 'workload-run',
      monotonic: realMonotonic,
      sleep: () => Promise.reject(new Error('no 429 is expected on this path')),
    });
    return { instance, reads };
  }

  async function listProjects(client: Client): Promise<void> {
    const answer = (await client.callTool({ name: 'getApiProjects', arguments: {} })) as {
      isError?: boolean;
    };
    expect(answer.isError).not.toBe(true);
  }

  test('connects and calls a tool without a dynamic registration request', async () => {
    sent.length = 0;
    const { instance } = provider();
    const { client, close } = await connect(instance);
    await listProjects(client);
    // Proof: returning undefined from clientInformation() made connect throw "OAuth client
    // information must be saveable for dynamic registration": the SDK took the registration
    // branch (2026-10-27). Stamping `<origin>/oauth` instead of `<resource>/oauth` made it throw
    // "bound to authorization server …", pinning mcpEndpointOf's issuer to mcp-01's.
    expect(sent.filter((line) => line.endsWith('/register'))).toEqual([]);
    expect(sent.filter((line) => line === `POST ${tokenUrl()}`)).toHaveLength(1);
    expect(claimsOf(instance.tokens()?.access_token ?? '')).toMatchObject({
      token_use: 'machine',
      wbs_run: 'workload-run',
    });
    await close();
  });

  test('re-fetches after a 401', async () => {
    const { instance, reads } = provider();
    const { client, close } = await connect(instance);
    const first = instance.tokens()?.access_token;
    await stack.fixture('rotate-grant-key');
    // Proof: serving the first token from tokens() whatever was saved made this call throw
    // "Server returned 401 after successful authentication" (2026-10-27).
    await listProjects(client);
    expect(instance.tokens()?.access_token).not.toBe(first);
    expect(reads).toHaveLength(2);
    await close();
  });

  test('a run outlives its workload token', async () => {
    // The first token lives about 5 s: the assertion's 65 s less mcp-01's 60 s margin.
    const { instance, reads } = provider({ lifetimeSeconds: 65 });
    const { client, close } = await connect(instance);
    await listProjects(client);
    await Bun.sleep(6_000);
    // Proof: caching the first assertion in prepareTokenRequest made this call throw the SDK's
    // InvalidGrantError: the first assertion leaves no lifetime after mcp-01's 60 s margin
    // (2026-10-27).
    await listProjects(client);
    expect(new Set(reads).size).toBe(reads.length);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    await close();
  });
});
