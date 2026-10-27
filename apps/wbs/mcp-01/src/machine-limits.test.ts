import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { newMachineKey } from '@wbs/core';
import { describe, expect, it } from 'bun:test';

import type { McpConfig } from './config';
import { mcpFetchHandler } from './http';
import { machineGrantClient } from './machine-grant-client';
import { M10_LIMITS, type MachineLimitRates, MachineTrafficLimits } from './machine-limits';
import { mcpOAuthFromEnv, McpOAuthServer } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import { CLIENT_CREDENTIALS_GRANT } from './token-request';
import type { FetchLike } from './wbs-client';

/**
 * M10's limits through the real token endpoint and `/mcp`, against a fake be-01 that knows
 * which keys are valid. Every request comes through one proxy (`MCP_TRUSTED_PROXY_HOPS=1`), so
 * the source is the last `X-Forwarded-For` entry.
 */
const MCP_URL = 'https://wbs.example/mcp';
const OAUTH = 'https://wbs.example/mcp/oauth';
const SECRET = randomBytes(32).toString('base64url');
const NOW = 1_793_000_000_000;
const TTL = 12 * 60 * 60;
const CONFIG = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: MCP_URL,
  MCP_TRUSTED_PROXY_HOPS: 1,
  WBS_API_URL: 'https://be.example',
  MCP_BE_INTERNAL_SECRET: SECRET,
} satisfies McpConfig;
const TOOLS = toolsFromDocument(readDocument());
const SIGNING = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ORCHESTRATOR = '203.0.113.5';
const STRANGER = '198.51.100.66';

interface Credential {
  readonly id: string;
  readonly key: string;
  readonly organizationId: string;
}

function credential(organizationId = 'org-a'): Credential {
  const id = randomUUID();
  return { id, key: newMachineKey(id).key, organizationId };
}

/** A key with `owner`'s public id and a secret be-01 has never issued. */
function wrongKeyFor(owner: string): string {
  return newMachineKey(owner).key;
}

interface World {
  readonly clock: { now: number };
  readonly oauth: McpOAuthServer;
  readonly handle: (request: Request) => Promise<Response>;
  /** Tool calls be-01 has served. */
  readonly served: () => number;
}

function world(valid: readonly Credential[], rates: MachineLimitRates = M10_LIMITS): World {
  const clock = { now: NOW };
  const byKey = new Map(valid.map((held) => [held.key, held]));
  let served = 0;
  const fetchImpl: FetchLike = (url, init) => {
    if (new URL(url).pathname === '/internal/mcp/machine-grants') {
      const body = JSON.parse(init.body ?? '{}') as { credential: { key: string } };
      const held = byKey.get(body.credential.key);
      return Promise.resolve(
        held === undefined
          ? Response.json({ error: 'unknown_identity' }, { status: 401 })
          : Response.json({
              grant: `grant-${held.id}`,
              credentialId: held.id,
              personId: 'claire',
              organizationId: held.organizationId,
              scopes: ['read', 'write'],
              expiresAt: Math.floor(clock.now / 1000) + TTL + 60,
              runId: null,
            }),
      );
    }
    served += 1;
    return Promise.resolve(Response.json({ projects: [] }));
  };
  const oauth = new McpOAuthServer(
    CONFIG,
    {
      authorizationUrl: () => Promise.reject(new Error('unused')),
      exchange: () => Promise.reject(new Error('unused')),
      refresh: () => Promise.reject(new Error('unused')),
      revoke: () => Promise.resolve(),
    },
    {
      now: () => clock.now,
      signingKeys: { privateKey: SIGNING.privateKey, publicKey: SIGNING.publicKey },
      machineGrants: {
        client: machineGrantClient(CONFIG, fetchImpl),
        secret: SECRET,
        tokenTtlSeconds: TTL,
        jitter: () => 0,
        limit: new MachineTrafficLimits(() => clock.now, rates),
        reportFault: (fault) => {
          throw fault;
        },
      },
    },
  );
  const handle = mcpFetchHandler(
    () =>
      createServer({
        tools: TOOLS,
        config: CONFIG,
        fetchImpl,
        reportUnexpectedToolFailure: (cause) => {
          throw cause instanceof Error ? cause : new Error(String(cause));
        },
      }),
    CONFIG,
    oauth,
    {},
    oauth,
  );
  return { clock, oauth, handle, served: () => served };
}

async function issue(oauth: McpOAuthServer, key: string, forwardedFor: string): Promise<Response> {
  const id = key.slice('wbs_mk_'.length, key.indexOf('.'));
  const response = await oauth.response(
    new Request(`${OAUTH}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': forwardedFor,
        authorization: `Basic ${btoa(`${id}:${key}`)}`,
      },
      body: new URLSearchParams({ resource: MCP_URL, grant_type: CLIENT_CREDENTIALS_GRANT }),
    }),
  );
  if (response === undefined) throw new Error('not a token route');
  return response;
}

async function expectRateLimited(response: Response): Promise<void> {
  expect(response.status).toBe(429);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  expect(await response.json()).toEqual({
    error: 'invalid_request',
    error_description: 'rate_limited',
  });
}

async function tokenFor(world: World, held: Credential): Promise<string> {
  const response = await issue(world.oauth, held.key, ORCHESTRATOR);
  expect(response.status).toBe(200);
  return ((await response.json()) as { access_token: string }).access_token;
}

/** One HTTP request of `count` tool calls: its status, Retry-After and each call's text. */
async function callTools(
  world: World,
  token: string,
  count: number,
): Promise<{ status: number; retryAfter: string | null; texts: string[] }> {
  const messages = Array.from({ length: count }, (_, index) => ({
    jsonrpc: '2.0',
    id: index + 1,
    method: 'tools/call',
    params: { name: 'getApiProjects', arguments: {} },
  }));
  const response = await world.handle(
    new Request(MCP_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(count === 1 ? messages[0] : messages),
    }),
  );
  const retryAfter = response.headers.get('retry-after');
  if (response.status !== 200) return { status: response.status, retryAfter, texts: [] };
  const parsed = (await response.json()) as unknown;
  const replies = (Array.isArray(parsed) ? parsed : [parsed]) as {
    result: { isError?: boolean; content: { text: string }[] };
  }[];
  return {
    status: 200,
    retryAfter,
    texts: replies.map((reply) =>
      reply.result.isError === true ? reply.result.content.map((part) => part.text).join('') : 'ok',
    ),
  };
}

describe('failed authentications at the token endpoint', () => {
  it('counts a rotating spoofed first entry against the real address, and refuses after 30', async () => {
    const { oauth } = world([]);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const spoofed = `10.${String(attempt)}.0.1`;
      const response = await issue(oauth, wrongKeyFor(randomUUID()), `${spoofed}, ${ORCHESTRATOR}`);
      expect(response.status).toBe(401);
    }
    await expectRateLimited(
      await issue(oauth, wrongKeyFor(randomUUID()), `10.99.0.1, ${ORCHESTRATOR}`),
    );
    // Another real address is counted on its own.
    expect((await issue(oauth, wrongKeyFor(randomUUID()), STRANGER)).status).toBe(401);
  });

  it('refuses one client_id after 5 failures from one address, and only from that address', async () => {
    const { oauth } = world([]);
    const id = randomUUID();
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect((await issue(oauth, wrongKeyFor(id), STRANGER)).status).toBe(401);
    await expectRateLimited(await issue(oauth, wrongKeyFor(id), STRANGER));
    expect((await issue(oauth, wrongKeyFor(id), ORCHESTRATOR)).status).toBe(401);
  });

  it('counts a secret the parser refuses, never asking be-01, as a failure too', async () => {
    const { oauth } = world([]);
    const notAKey = async () =>
      await oauth.response(
        new Request(`${OAUTH}/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': STRANGER,
            authorization: `Basic ${btoa(`${randomUUID()}:not-a-key`)}`,
          },
          body: new URLSearchParams({ resource: MCP_URL, grant_type: CLIENT_CREDENTIALS_GRANT }),
        }),
      );
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await notAKey())?.status).toBe(401);
    const refused = await notAKey();
    if (refused === undefined) throw new Error('not a token route');
    await expectRateLimited(refused);
  });

  it("a stranger's wrong secrets do not lock out the credential", async () => {
    const held = credential();
    const { oauth } = world([held]);
    for (let attempt = 0; attempt < 100; attempt += 1)
      expect([401, 429]).toContain((await issue(oauth, wrongKeyFor(held.id), STRANGER)).status);
    expect((await issue(oauth, held.key, ORCHESTRATOR)).status).toBe(200);
  });

  it('lets the failures refill: one more is admitted after the Retry-After', async () => {
    const world_ = world([]);
    const id = randomUUID();
    for (let attempt = 0; attempt < 5; attempt += 1)
      await issue(world_.oauth, wrongKeyFor(id), STRANGER);
    const refused = await issue(world_.oauth, wrongKeyFor(id), STRANGER);
    expect(refused.status).toBe(429);
    world_.clock.now += Number(refused.headers.get('retry-after')) * 1_000;
    expect((await issue(world_.oauth, wrongKeyFor(id), STRANGER)).status).toBe(401);
  });
});

describe('successful issuances', () => {
  it('one address issues 100 tokens for a pool of 100 within a minute', async () => {
    const pool = Array.from({ length: 101 }, () => credential());
    const { oauth } = world(pool);
    for (const held of pool.slice(0, 100))
      expect((await issue(oauth, held.key, ORCHESTRATOR)).status).toBe(200);
    // The 101st at the same instant exceeds the per-address burst.
    await expectRateLimited(await issue(oauth, pool[100]?.key ?? '', ORCHESTRATOR));
  });

  it('one credential issues 100 staggered tokens within a minute', async () => {
    const held = credential();
    const world_ = world([held]);
    for (let run = 0; run < 100; run += 1) {
      expect((await issue(world_.oauth, held.key, ORCHESTRATOR)).status).toBe(200);
      world_.clock.now += 590;
    }
  });

  it('refuses the 101st issuance of one credential at once, from any address', async () => {
    const held = credential();
    const { oauth } = world([held]);
    for (let run = 0; run < 100; run += 1)
      expect((await issue(oauth, held.key, `192.0.2.${String(run)}`)).status).toBe(200);
    await expectRateLimited(await issue(oauth, held.key, STRANGER));
  });
});

describe('tools/call on /mcp', () => {
  it('a batch of 30 calls runs 20 and limits 10', async () => {
    const held = credential();
    const world_ = world([held]);
    const answer = await callTools(world_, await tokenFor(world_, held), 30);
    expect(answer.status).toBe(200);
    expect(answer.texts.filter((text) => text === 'ok')).toHaveLength(20);
    const limited = answer.texts.filter((text) => text !== 'ok');
    expect(limited).toHaveLength(10);
    for (const text of limited)
      expect(text).toBe('getApiProjects could not be called: rate_limited (429). Retry after 1 s.');
    expect(world_.served()).toBe(20);
  });

  it('answers a single limited call 429 with Retry-After, and asks be-01 nothing', async () => {
    const held = credential();
    const world_ = world([held]);
    const token = await tokenFor(world_, held);
    expect((await callTools(world_, token, 20)).status).toBe(200);
    const served = world_.served();
    expect(await callTools(world_, token, 1)).toEqual({
      status: 429,
      retryAfter: '1',
      texts: [],
    });
    expect(world_.served()).toBe(served);
    world_.clock.now += 1_000;
    expect((await callTools(world_, token, 1)).texts).toEqual(['ok']);
  });

  it('limits calls per credential: another credential of the organization still runs', async () => {
    const first = credential();
    const second = credential();
    const world_ = world([first, second]);
    await callTools(world_, await tokenFor(world_, first), 20);
    expect((await callTools(world_, await tokenFor(world_, second), 1)).texts).toEqual(['ok']);
  });

  it('limits in-flight calls per organization and frees a slot when a call ends', async () => {
    const held = credential();
    const world_ = world([held], { ...M10_LIMITS, callsInFlightPerOrganization: 2 });
    // Each call holds its slot until be-01 answers; a batch of 3 runs concurrently, so the third
    // meets two calls in flight.
    const answer = await callTools(world_, await tokenFor(world_, held), 3);
    expect(answer.texts.toSorted()).toEqual([
      'getApiProjects could not be called: too_many_in_flight (429). Retry after 1 s.',
      'ok',
      'ok',
    ]);
    // Both slots were released once their calls ended.
    expect((await callTools(world_, await tokenFor(world_, held), 2)).texts).toEqual(['ok', 'ok']);
  });
});

describe('the production composition', () => {
  it("composes M10's limits from the environment", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-limits-env-'));
    try {
      const oauth = mcpOAuthFromEnv(
        CONFIG,
        {
          MCP_SIGNING_KEY_CURRENT: SIGNING.privateKey
            .export({ format: 'der', type: 'pkcs8' })
            .toString('base64'),
          MCP_STORE_KEY_CURRENT: randomBytes(32).toString('base64'),
          MCP_STORE_PATH: join(dir, 'store.sqlite'),
        },
        undefined,
        () => Promise.resolve(Response.json({ error: 'unknown_identity' }, { status: 401 })),
        () => undefined,
      );
      for (let attempt = 0; attempt < 30; attempt += 1)
        expect((await issue(oauth, wrongKeyFor(randomUUID()), STRANGER)).status).toBe(401);
      await expectRateLimited(await issue(oauth, wrongKeyFor(randomUUID()), STRANGER));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
