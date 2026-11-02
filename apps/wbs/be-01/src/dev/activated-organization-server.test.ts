import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it } from 'bun:test';

import { TEST_MACHINE_GRANT_ENV } from '../testing/machine-grant-fixture';

const SERVER = resolve(import.meta.dir, 'activated-organization-server.ts');
const REPO_ROOT = resolve(import.meta.dir, '../../../../..');
const MCP_MAIN = 'apps/wbs/mcp-01/src/main.ts';
const DASH = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
const APP_ORIGIN = 'http://localhost:7400';

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A fresh `TMPDIR` for the child, so what it leaves behind is all that is in it. */
function childTmpdir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-activated-server-test-'));
  scratch.push(directory);
  return directory;
}

function spawnServer(port: number, temp: string, mcpUrl = 'http://127.0.0.1:7302/mcp') {
  return Bun.spawn(
    [
      process.execPath,
      SERVER,
      '--port',
      String(port),
      '--gw-url',
      'http://gw.invalid',
      '--app-origin',
      APP_ORIGIN,
      '--mcp-url',
      mcpUrl,
    ],
    {
      cwd: REPO_ROOT,
      env: { PATH: process.env['PATH'] ?? '', TMPDIR: temp },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

/**
 * A non-loopback IPv4 address of this host, to show the server is not on it.
 *
 * @throws when the host has none, rather than skipping the check.
 */
function externalAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    const found = addresses?.find((each) => each.family === 'IPv4' && !each.internal);
    if (found !== undefined) return found.address;
  }
  throw new Error('no non-loopback IPv4 address to probe the listener from');
}

/** Reads `reader` to its end, discarding what it reads. */
async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  while (!(await reader.read()).done);
}

/** The banner's listener origin, read from stdout as the process prints it. */
async function bannerOrigin(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let seen = '';
  // Read on after the banner: a reader that stopped would close the pipe under be-01's log.
  const reader = stdout.getReader();
  for (;;) {
    const read = await reader.read();
    if (read.done) break;
    const chunk = read.value;
    seen += decoder.decode(chunk);
    const banner = /activated organization server \(development only\): (http:\/\/[^;]+);/.exec(
      seen,
    );
    if (banner?.[1] !== undefined) {
      void drain(reader);
      return banner[1];
    }
  }
  throw new Error(`the server exited without its banner: ${seen.slice(-2000)}`);
}

/**
 * The committed dev server must keep booting as the schema and the routes
 * move: an organization it inserts by hand that the store no longer accepts
 * fails here, not on a developer's laptop.
 */
it('serves the owner an activated organization on loopback and cleans up on SIGTERM', async () => {
  const temp = childTmpdir();
  const child = spawnServer(0, temp);
  try {
    const origin = await bannerOrigin(child.stdout);
    expect(new URL(origin).hostname).toBe('127.0.0.1');
    // Proof: with the loopback `startListener` removed from the server, this
    // fetch answered 200 on the host's LAN address; watched 2026-10-24.
    const external = `http://${externalAddress()}:${new URL(origin).port}/health`;
    let reachedExternally = true;
    try {
      await fetch(external);
    } catch {
      reachedExternally = false;
    }
    expect(reachedExternally).toBe(false);

    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct-horse' }),
    });
    const { token } = (await login.json()) as { token: string };
    expect(login.status).toBe(200);

    const selected = await fetch(`${origin}/api/organization/active`, {
      method: 'POST',
      headers: {
        origin: APP_ORIGIN,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'org-local' }),
    });
    expect(selected.status).toBe(200);
    const organizationCookie = (selected.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(organizationCookie).toStartWith('__Host-wbs_organization=');

    const people = await fetch(`${origin}/api/people`, {
      headers: { cookie: `__Host-wbs_access=${token}; ${organizationCookie}` },
    });
    expect(people.status).toBe(200);
  } finally {
    child.kill('SIGTERM');
  }
  expect(await child.exited).toBe(0);
  expect(readdirSync(temp)).toEqual([]);
}, 30_000);

/** A port nothing listens on right now, for a process that must know its URL before it binds. */
async function freePort(): Promise<number> {
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const { port } = probe;
  await probe.stop(true);
  if (port === undefined) throw new Error('the probe listener has no port');
  return port;
}

/** One owner request on the dev server, with the owner's session and organization cookies. */
async function asOwner(
  origin: string,
  cookies: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const answered = await fetch(`${origin}${path}`, {
    method,
    headers: {
      origin: APP_ORIGIN,
      cookie: cookies,
      'X-WBS-Expected-Organization': 'org-local',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: answered.status, body: (await answered.json()) as unknown };
}

/**
 * `docs/local-dev.md` ("An activated organization"): an agent's key reaches the dev server
 * the way agents do, through a local mcp-01. The owner makes an agent person and its key
 * over HTTP, `twilight-dash mcp token` prints the header Claude Code's `headersHelper` reads,
 * and a tool call with it lists the organization's projects.
 */
it("issues an agent's key a token at the local mcp-01 and answers its tool call", async () => {
  const temp = childTmpdir();
  const mcpPort = await freePort();
  const mcpUrl = `http://127.0.0.1:${String(mcpPort)}/mcp`;
  const server = spawnServer(0, temp, mcpUrl);
  let mcp: ReturnType<typeof Bun.spawn> | undefined;
  try {
    const origin = await bannerOrigin(server.stdout);
    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct-horse' }),
    });
    const session = (await login.json()) as { token: string; user: { id: string } };
    const selected = await fetch(`${origin}/api/organization/active`, {
      method: 'POST',
      headers: {
        origin: APP_ORIGIN,
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'org-local' }),
    });
    const cookies = `__Host-wbs_access=${session.token}; ${(selected.headers.get('set-cookie') ?? '').split(';')[0] ?? ''}`;
    const owner = (method: string, path: string, body?: unknown) =>
      asOwner(origin, cookies, method, path, body);

    expect(await owner('POST', '/api/projects', { name: 'Local plan' })).toMatchObject({
      status: 200,
    });
    const made = await owner('POST', '/api/directory/commands', {
      commands: [{ kind: 'createPerson', name: 'claire', personKind: 'agent' }],
    });
    expect(made.status).toBe(200);
    const personId = (made.body as { results: { id: string }[] }).results[0]?.id ?? '';
    expect(
      await owner('POST', '/api/directory/commands', {
        commands: [{ kind: 'patchPerson', personId, patch: { accountId: session.user.id } }],
      }),
    ).toMatchObject({ status: 200 });
    const created = await owner('POST', '/api/organization/machine-credentials', {
      source: 'api_key',
      name: 'claire',
      personId,
    });
    expect(created.status).toBe(201);
    const keyFile = join(temp, 'claire.key');
    writeFileSync(keyFile, (created.body as { key: string }).key);
    chmodSync(keyFile, 0o600);

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    mcp = Bun.spawn([process.execPath, MCP_MAIN], {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env['PATH'] ?? '',
        PORT: String(mcpPort),
        MCP_AUTH_MODE: 'standalone',
        MCP_PUBLIC_URL: mcpUrl,
        MCP_TRUSTED_PROXY_HOPS: '0',
        WBS_API_URL: origin,
        MCP_BE_INTERNAL_SECRET: TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'],
        MCP_STORE_PATH: join(temp, 'mcp-session.sqlite'),
        MCP_STORE_KEY_CURRENT: randomBytes(32).toString('base64'),
        MCP_SIGNING_KEY_CURRENT: privateKey
          .export({ format: 'der', type: 'pkcs8' })
          .toString('base64'),
      },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    for (let attempt = 0; ; attempt += 1) {
      const metadata = await fetch(
        `http://127.0.0.1:${String(mcpPort)}/.well-known/oauth-protected-resource/mcp`,
      ).catch(() => null);
      if (metadata?.status === 200) break;
      if (attempt >= 200 || mcp.exitCode !== null) throw new Error('mcp-01 did not serve');
      await Bun.sleep(50);
    }

    // What Claude Code's `headersHelper` runs, as `docs/local-dev.md` writes it.
    const helper = Bun.spawnSync(
      [process.execPath, DASH, 'mcp', 'token', '--resource', mcpUrl, '--key-file', keyFile],
      { cwd: REPO_ROOT, env: { PATH: process.env['PATH'] ?? '' }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect({ exitCode: helper.exitCode, stderr: helper.stderr.toString() }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    const headers = JSON.parse(helper.stdout.toString()) as Record<string, string>;
    const client = new Client({ name: 'local-agent', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers } }),
    );
    try {
      const listed = (await client.callTool({ name: 'getApiProjects', arguments: {} })) as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(listed.isError).not.toBe(true);
      expect(listed.content[0]?.text).toContain('Local plan');
    } finally {
      await client.close();
    }
  } finally {
    mcp?.kill('SIGTERM');
    await mcp?.exited;
    server.kill('SIGTERM');
    await server.exited;
  }
}, 60_000);

it('deletes its database directory when it cannot start', async () => {
  const temp = childTmpdir();
  const occupied = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  try {
    const child = spawnServer(occupied.port ?? 0, temp);
    expect(await child.exited).not.toBe(0);
    expect(readdirSync(temp)).toEqual([]);
  } finally {
    await occupied.stop(true);
  }
}, 30_000);
