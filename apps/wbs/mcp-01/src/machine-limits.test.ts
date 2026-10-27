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
import { BeCallTimedOut, type FetchLike } from './wbs-client';

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
  /** Grant requests that reached be-01. */
  readonly asked: () => number;
  /** What the unexpected tool failure reporter was handed. */
  readonly reported: unknown[];
}

interface WorldOptions {
  /** be-01 answers grant requests after this many milliseconds, so requests overlap. */
  readonly grantDelayMs?: number;
  /** be-01 answers every grant request 503. */
  readonly unavailable?: boolean;
  /** be-01 never answers the first tool call. */
  readonly hangFirstCall?: boolean;
  /** How long a tool call waits for be-01. */
  readonly beCallTimeoutMs?: number;
}

function world(
  valid: readonly Credential[],
  rates: MachineLimitRates = M10_LIMITS,
  options: WorldOptions = {},
): World {
  const clock = { now: NOW };
  const byKey = new Map(valid.map((held) => [held.key, held]));
  let served = 0;
  let asked = 0;
  const reported: unknown[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    if (new URL(url).pathname === '/internal/mcp/machine-grants') {
      asked += 1;
      if (options.grantDelayMs !== undefined) await Bun.sleep(options.grantDelayMs);
      if (options.unavailable === true)
        return Response.json({ error: 'unavailable' }, { status: 503 });
      const body = JSON.parse(init.body ?? '{}') as { credential: { key: string } };
      const held = byKey.get(body.credential.key);
      return held === undefined
        ? Response.json({ error: 'unknown_identity' }, { status: 401 })
        : Response.json({
            grant: `grant-${held.id}`,
            credentialId: held.id,
            personId: 'claire',
            organizationId: held.organizationId,
            scopes: ['read', 'write'],
            expiresAt: Math.floor(clock.now / 1000) + TTL + 60,
            runId: null,
          });
    }
    served += 1;
    if (options.hangFirstCall === true && served === 1)
      return await new Promise<never>(() => undefined);
    return Response.json({ projects: [] });
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
          reported.push(cause);
          return { sentence: 'mcp-01 failed unexpectedly', occurrenceId: 'occurrence' };
        },
        ...(options.beCallTimeoutMs === undefined
          ? {}
          : { beCallTimeoutMs: options.beCallTimeoutMs }),
      }),
    CONFIG,
    oauth,
    {},
    oauth,
  );
  return { clock, oauth, handle, served: () => served, asked: () => asked, reported };
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

  it("a failure gives the address's issuance token back", async () => {
    const held = credential();
    const { oauth } = world([held], {
      ...M10_LIMITS,
      failuresPerSource: { burst: 1_000, perSecond: 1 },
      issuancesPerSource: { burst: 10, perSecond: 0.001 },
    });
    for (let attempt = 0; attempt < 20; attempt += 1)
      expect((await issue(oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR)).status).toBe(401);
    expect((await issue(oauth, held.key, ORCHESTRATOR)).status).toBe(200);
  });

  it('gives every token back when be-01 is unavailable', async () => {
    const { oauth } = world([], M10_LIMITS, { unavailable: true });
    for (let attempt = 0; attempt < 120; attempt += 1)
      expect((await issue(oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR)).status).toBe(503);
  });

  it('answers a stranger 401, never 429, for a credential whose issuances are spent', async () => {
    const held = credential();
    const { oauth } = world([held]);
    for (let run = 0; run < 100; run += 1)
      expect((await issue(oauth, held.key, `192.0.2.${String(run)}`)).status).toBe(200);
    await expectRateLimited(await issue(oauth, held.key, '192.0.2.200'));
    expect((await issue(oauth, wrongKeyFor(held.id), STRANGER)).status).toBe(401);
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

describe('concurrent token requests', () => {
  const PENDING_CAP = M10_LIMITS.pendingIssuancesPerSource;

  it('lets at least 30 and at most 30 plus the pending cap of 100 concurrent wrong keys from one source reach be-01, then closes', async () => {
    const world_ = world([], M10_LIMITS, { grantDelayMs: 5 });
    const answers = await Promise.all(
      Array.from({ length: 100 }, () =>
        issue(world_.oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR),
      ),
    );
    expect(world_.asked()).toBeGreaterThanOrEqual(30);
    expect(world_.asked()).toBeLessThanOrEqual(30 + PENDING_CAP);
    expect(answers.filter((answer) => answer.status === 401)).toHaveLength(world_.asked());
    await expectRateLimited(await issue(world_.oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR));
  });

  it('lets at most 30 plus the pending cap of 500 concurrent wrong keys from one source reach be-01', async () => {
    const world_ = world([], M10_LIMITS, { grantDelayMs: 5 });
    await Promise.all(
      Array.from({ length: 500 }, () =>
        issue(world_.oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR),
      ),
    );
    expect(world_.asked()).toBeGreaterThanOrEqual(30);
    expect(world_.asked()).toBeLessThanOrEqual(30 + PENDING_CAP);
  });

  it('holds a source to the pending cap while be-01 is slow, even once its issuances refill', async () => {
    const world_ = world([], M10_LIMITS, { grantDelayMs: 100 });
    const wave = () =>
      Array.from({ length: PENDING_CAP }, () =>
        issue(world_.oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR),
      );
    const first = wave();
    await Bun.sleep(10);
    // A minute later the issuance bucket is full again, and no failure has been counted yet.
    world_.clock.now += 60_000;
    const second = await Promise.all(wave());
    await Promise.all(first);
    expect(world_.asked()).toBe(PENDING_CAP);
    expect(second.map((answer) => answer.status)).toEqual(second.map(() => 429));
    expect(second[0]?.headers.get('retry-after')).toBe('1');
  });

  it('holds a source to the design failure rate over ten minutes of concurrent wrong keys', async () => {
    const world_ = world([], M10_LIMITS, { grantDelayMs: 2 });
    const wave = () =>
      Promise.all(
        Array.from({ length: PENDING_CAP + 20 }, () =>
          issue(world_.oauth, wrongKeyFor(randomUUID()), ORCHESTRATOR),
        ),
      );
    const seconds = 600;
    for (let elapsed = 0; elapsed < seconds; elapsed += 10) {
      await wave();
      world_.clock.now += 10_000;
    }
    // 30 a minute after a first burst of 30, each reopening at most one pending cap early:
    // at least the rate, at most the burst, the rate and one cap of overshoot.
    const rate = M10_LIMITS.failuresPerSource.perSecond * seconds;
    expect(world_.asked()).toBeGreaterThanOrEqual(rate);
    expect(world_.asked()).toBeLessThanOrEqual(30 + rate + PENDING_CAP);
  }, 60_000);

  it('admits 100 concurrent issuances of distinct credentials from one source', async () => {
    const pool = Array.from({ length: 100 }, () => credential());
    const world_ = world(pool, M10_LIMITS, { grantDelayMs: 5 });
    const answers = await Promise.all(
      pool.map((held) => issue(world_.oauth, held.key, ORCHESTRATOR)),
    );
    expect(answers.map((answer) => answer.status)).toEqual(pool.map(() => 200));
  });

  it('admits 100 concurrent issuances of one credential from one source', async () => {
    const held = credential();
    const world_ = world([held], M10_LIMITS, { grantDelayMs: 5 });
    const answers = await Promise.all(
      Array.from({ length: 100 }, () => issue(world_.oauth, held.key, ORCHESTRATOR)),
    );
    expect(answers.map((answer) => answer.status)).toEqual(answers.map(() => 200));
  });

  it('lets exactly the burst of 300 concurrent issuances for one credential from one source reach be-01', async () => {
    const held = credential();
    const world_ = world([held], M10_LIMITS, { grantDelayMs: 5 });
    const answers = await Promise.all(
      Array.from({ length: 300 }, () => issue(world_.oauth, held.key, ORCHESTRATOR)),
    );
    expect(world_.asked()).toBe(100);
    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(100);
    expect(answers.filter((answer) => answer.status === 429)).toHaveLength(200);
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

describe('a be-01 call that never answers', () => {
  it('frees the in-flight slot of a call be-01 never answers, after the timeout', async () => {
    const held = credential();
    const world_ = world(
      [held],
      { ...M10_LIMITS, callsInFlightPerOrganization: 1 },
      {
        hangFirstCall: true,
        beCallTimeoutMs: 50,
      },
    );
    const token = await tokenFor(world_, held);
    expect((await callTools(world_, token, 1)).texts).toEqual([
      'getApiProjects could not be called: mcp-01 failed unexpectedly. Reference occurrence.',
    ]);
    // Reported as a fault of the deployment, never the caller's 401.
    expect(world_.reported).toHaveLength(1);
    expect(world_.reported[0]).toBeInstanceOf(BeCallTimedOut);
    expect((await callTools(world_, token, 1)).texts).toEqual(['ok']);
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
