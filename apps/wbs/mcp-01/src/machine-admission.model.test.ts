import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { newMachineKey } from '@wbs/core';
import { afterAll, describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import type { McpConfig } from './config';
import { mcpFetchHandler } from './http';
import { machineGrantClient } from './machine-grant-client';
import { NO_MACHINE_LIMITS } from './machine-limits';
import { McpOAuthServer } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import { CLIENT_CREDENTIALS_GRANT } from './token-request';
import type { FetchLike } from './wbs-client';

/**
 * The per-replica refused set of `wbs-mcp-agent-surface` M3 against a model, with
 * `fc.asyncModelRun`: two replicas share one machine token, an admin revokes its credential at
 * any point, be-01 may fail a call with a secret or key fault, a JSON-RPC batch may be in
 * flight while the revocation commits, and the token may expire. The model is the design's
 * table, written out:
 * - an expired token, or one this replica has seen refused, is HTTP 401 and asks be-01 nothing;
 * - a secret fault is 502 and changes nothing; a key fault is 401 and changes nothing;
 * - each call be-01 serves after the revocation commits is `machine_credential_refused`, and
 *   then this replica, and only this one, refuses the token.
 *
 * Proof: each of five sabotages failed this property at seed 20261027: the refused-set check
 * skipped in `admitMachine` (oauth.ts); the set never filled (`credentialRefused()` dropped
 * on `unknown_identity`); a secret fault entered into it, and a key fault entered into it
 * (server.ts); one set shared by both replicas. An earlier draft drew the expiry as often as a
 * call, so most runs expired at once and the secret sabotage passed; calls are now weighted
 * eight to one. Watched 2026-10-27.
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
const CREDENTIAL = '0b7c2f8e-3a41-4c55-9f0e-1d2e3f405162';
const KEY = newMachineKey(CREDENTIAL).key;
const TOOLS = toolsFromDocument(readDocument());
const SIGNING = generateKeyPairSync('rsa', { modulusLength: 2048 });

type BeFault = 'none' | 'secret' | 'key';

interface Model {
  revoked: boolean;
  expired: boolean;
  readonly refusedOn: [boolean, boolean];
}

/** be-01 as the model sees it: revocation, a one-shot fault, and how many calls it served. */
interface Be {
  revoked: boolean;
  fault: BeFault;
  /** Served before a revocation commits inside the next batch; null when none is pending. */
  revokeAfter: number | null;
  served: number;
}

interface World {
  readonly be: Be;
  readonly clock: { now: number };
  readonly replicas: readonly ((request: Request) => Promise<Response>)[];
  readonly token: string;
}

const reached = { refusedCall: 0, refusedRequest: 0, secret: 0, key: 0, batchSplit: 0 };

function fetchFor(be: Be): FetchLike {
  return (url) => {
    if (new URL(url).pathname === '/internal/mcp/machine-grants')
      return Promise.resolve(
        Response.json({
          grant: 'grant-1',
          credentialId: CREDENTIAL,
          personId: 'claire',
          organizationId: 'org-a',
          scopes: ['read', 'write'],
          expiresAt: Math.floor(NOW / 1000) + TTL + 60,
          runId: null,
        }),
      );
    be.served += 1;
    if (be.fault !== 'none') {
      const fault = be.fault;
      be.fault = 'none';
      return Promise.resolve(
        Response.json(
          { error: fault === 'secret' ? 'internal_unauthorized' : 'unknown_grant_key' },
          { status: 401 },
        ),
      );
    }
    if (be.revokeAfter !== null) {
      if (be.revokeAfter === 0) {
        be.revoked = true;
        be.revokeAfter = null;
      } else be.revokeAfter -= 1;
    }
    return Promise.resolve(
      be.revoked
        ? Response.json({ error: 'unknown_identity' }, { status: 401 })
        : Response.json({ projects: [] }),
    );
  };
}

async function world(): Promise<World> {
  const be: Be = { revoked: false, fault: 'none', revokeAfter: null, served: 0 };
  const clock = { now: NOW };
  const fetchImpl = fetchFor(be);
  const replicas = [0, 1].map(() => {
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
          limit: NO_MACHINE_LIMITS,
          reportFault: () => undefined,
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
    return { oauth, handle };
  });
  const issued = await replicas[0]?.oauth.response(
    new Request(`${OAUTH}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${btoa(`${CREDENTIAL}:${KEY}`)}`,
      },
      body: new URLSearchParams({ resource: MCP_URL, grant_type: CLIENT_CREDENTIALS_GRANT }),
    }),
  );
  const token = ((await issued?.json()) as { access_token: string }).access_token;
  return { be, clock, replicas: replicas.map((replica) => replica.handle), token };
}

/** `count` concurrent tool calls in one HTTP request: its status and each call's outcome. */
async function send(
  handle: (request: Request) => Promise<Response>,
  token: string,
  count: number,
): Promise<{ status: number; outcomes: ('ok' | 'refused')[] }> {
  const messages = Array.from({ length: count }, (_, index) => ({
    jsonrpc: '2.0',
    id: index + 1,
    method: 'tools/call',
    params: { name: 'getApiProjects', arguments: {} },
  }));
  const response = await handle(
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
  if (response.status !== 200) return { status: response.status, outcomes: [] };
  const parsed = (await response.json()) as unknown;
  const replies = (Array.isArray(parsed) ? parsed : [parsed]) as {
    result: { isError?: boolean; content: { text: string }[] };
  }[];
  return {
    status: 200,
    outcomes: replies.map((reply) => {
      const text = reply.result.content.map((part) => part.text).join('');
      if (reply.result.isError !== true) return 'ok';
      if (text.includes('machine_credential_refused')) return 'refused';
      throw new Error(`unexpected tool error: ${text}`);
    }),
  };
}

/** One HTTP request of `count` calls on replica `replica`, be-01 failing it with `fault`. */
class Call implements fc.AsyncCommand<Model, World> {
  constructor(
    readonly replica: 0 | 1,
    readonly count: number,
    readonly fault: BeFault,
    /** In a batch, the calls be-01 serves before the revocation commits; null for none. */
    readonly revokeAfter: number | null,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: World): Promise<void> {
    const servedBefore = real.be.served;
    const short = model.expired || model.refusedOn[this.replica];
    real.be.fault = this.fault;
    real.be.revokeAfter = short || model.revoked ? null : this.revokeAfter;
    const answer = await send(real.replicas[this.replica] ?? fail(), real.token, this.count);
    const asked = real.be.served - servedBefore;
    real.be.fault = 'none';
    real.be.revokeAfter = null;
    if (short) {
      if (model.refusedOn[this.replica]) reached.refusedRequest += 1;
      expect({ status: answer.status, asked }).toEqual({ status: 401, asked: 0 });
      return;
    }
    if (this.fault !== 'none') {
      reached[this.fault] += 1;
      expect(answer.status).toBe(this.fault === 'secret' ? 502 : 401);
      return;
    }
    expect(answer.status).toBe(200);
    const served = model.revoked ? 0 : Math.min(this.revokeAfter ?? this.count, this.count);
    const expected: ('ok' | 'refused')[] = [
      ...Array.from({ length: served }, () => 'ok' as const),
      ...Array.from({ length: this.count - served }, () => 'refused' as const),
    ];
    expect(answer.outcomes.toSorted()).toEqual(expected.toSorted());
    if (served < this.count) {
      if (served > 0) reached.batchSplit += 1;
      reached.refusedCall += 1;
      model.revoked = true;
      model.refusedOn[this.replica] = true;
    }
  }
  toString(): string {
    return `Call(${String(this.replica)}, ${String(this.count)}, ${this.fault}, ${String(this.revokeAfter)})`;
  }
}

class Revoke implements fc.AsyncCommand<Model, World> {
  check(model: Readonly<Model>): boolean {
    return !model.revoked;
  }
  run(model: Model, real: World): Promise<void> {
    real.be.revoked = true;
    model.revoked = true;
    return Promise.resolve();
  }
  toString(): string {
    return 'Revoke';
  }
}

class Expire implements fc.AsyncCommand<Model, World> {
  check(model: Readonly<Model>): boolean {
    return !model.expired;
  }
  run(model: Model, real: World): Promise<void> {
    real.clock.now = NOW + (TTL + 1) * 1000;
    model.expired = true;
    return Promise.resolve();
  }
  toString(): string {
    return 'Expire';
  }
}

function fail(): never {
  throw new Error('no such replica');
}

const call = fc
  .tuple(
    fc.constantFrom<0 | 1>(0, 1),
    fc.integer({ min: 1, max: 3 }),
    fc.constantFrom<BeFault>('none', 'none', 'none', 'secret', 'key'),
    fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
  )
  // A fault fails the request's one call; a batch meets no fault.
  .map(([replica, count, fault, revokeAfter]) =>
    fault === 'none'
      ? new Call(replica, count, fault, revokeAfter)
      : new Call(replica, 1, fault, null),
  );
// `fc.commands` draws its arbitraries uniformly, so calls are listed eight times: a revocation
// or the expiry then lands among calls rather than ending most runs early.
const commands = fc.commands(
  [...Array.from({ length: 8 }, () => call), fc.constant(new Revoke()), fc.constant(new Expire())],
  { maxCommands: 14, size: 'max' },
);

describe('the refused set across two replicas', () => {
  it('matches the model through revocations, faults, batches and expiry', async () => {
    await fc.assert(
      fc.asyncProperty(commands, async (sequence) => {
        const real = await world();
        await fc.asyncModelRun(
          () => ({
            model: {
              revoked: false,
              expired: false,
              refusedOn: [false, false] satisfies Model['refusedOn'],
            },
            real,
          }),
          sequence,
        );
      }),
      { numRuns: 100, seed: 20_261_027 },
    );
  });

  afterAll(() => {
    // Every branch of the model was exercised, so a passing run is not a vacuous one.
    for (const [branch, count] of Object.entries(reached))
      expect({ branch, reached: count > 0 }).toEqual({ branch, reached: true });
  });
});
