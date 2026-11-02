import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';

import { newMachineKey } from '@wbs/core';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import type { McpConfig } from './config';
import { mcpFetchHandler } from './http';
import { machineGrantClient } from './machine-grant-client';
import { M10_LIMITS, type MachineLimits, MachineTrafficLimits } from './machine-limits';
import { McpOAuthServer } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import { CLIENT_CREDENTIALS_GRANT } from './token-request';
import type { FetchLike } from './wbs-client';

/**
 * M10's in-flight tool calls per organization, shared by every request of a replica, against a
 * model with `fc.asyncModelRun`. The real path runs: `/mcp` requests of one to four concurrent
 * `tools/call` messages, for two organizations, each call held at be-01 until a command ends it
 * with a success, a 500 or a thrown fetch, in any order the commands draw.
 *
 * States: per organization, the calls be-01 holds. Events: a request arrives (its calls are
 * admitted while slots are free, the rest limited), a held call ends (its slot is freed once
 * the tool call returns, whatever the outcome). Invariants, at every step:
 * - be-01 never holds more than the limit for one organization;
 * - a request's admitted calls are exactly the free slots it met, the rest `too_many_in_flight`;
 * - one organization's calls never take another's slots;
 * - a single limited call is HTTP 429; a batch answers each call.
 *
 * Proof: each of five sabotages failed this property at seed 20261027 (counterexamples in
 * verify.md, section 4): `count > limit` in `InFlightCounter.acquire`; a release that deletes
 * the key's whole count; one counter for every organization (`machine-limits.ts`); the release
 * run before the call (`server.ts`); the release skipped for a failed call. Rewatched with
 * admission/release barriers on 2026-10-29 at the same seed; all five faults still failed.
 * A 25 ms be-01 body delay reproduces the old expected-3/received-2 failure on the reported
 * command sequence and passes with the barriers. Counts remain backend observations; the
 * barriers observe the real admission and `finally` release, never supply or alter them.
 */
const MCP_URL = 'https://wbs.example/mcp';
const OAUTH = 'https://wbs.example/mcp/oauth';
const SECRET = randomBytes(32).toString('base64url');
const NOW = 1_793_000_000_000;
const TTL = 12 * 60 * 60;
const LIMIT = 3;
const CONFIG = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: MCP_URL,
  MCP_TRUSTED_PROXY_HOPS: 1,
  WBS_API_URL: 'https://be.example',
  MCP_BE_INTERNAL_SECRET: SECRET,
} satisfies McpConfig;
const TOOLS = toolsFromDocument(readDocument());
const SIGNING = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ORGANIZATIONS = ['org-a', 'org-b'] as const;
type Organization = (typeof ORGANIZATIONS)[number];
type Outcome = 'ok' | 'fail' | 'throw';
const LIMITED = 'getApiProjects could not be called: too_many_in_flight (429). Retry after 1 s.';

interface HeldCall {
  readonly organization: Organization;
  readonly end: (outcome: Outcome) => void;
}

interface SentRequest {
  readonly organization: Organization;
  readonly count: number;
  readonly admitted: number;
  remaining: number;
  readonly answer: Promise<{ status: number; texts: string[] }>;
}

interface Model {
  readonly inFlight: Record<Organization, number>;
}

interface World {
  readonly progress: CallProgress;
  readonly held: HeldCall[];
  readonly sent: SentRequest[];
  readonly tokens: Record<Organization, string>;
  readonly handle: (request: Request) => Promise<Response>;
}

const reached = { limited: 0, failedEnd: 0, thrownEnd: 0, single429: 0, crossOrg: 0 };

async function world(): Promise<World> {
  const held: HeldCall[] = [];
  const progress = new CallProgress();
  const credentials = ORGANIZATIONS.map((organization) => {
    const id = randomUUID();
    return { id, key: newMachineKey(id).key, organization };
  });
  const fetchImpl: FetchLike = (url, init) => {
    if (new URL(url).pathname === '/internal/mcp/machine-grants') {
      const body = JSON.parse(init.body ?? '{}') as { credential: { key: string } };
      const owner = credentials.find((candidate) => candidate.key === body.credential.key);
      if (owner === undefined) throw new Error('unknown key');
      return Promise.resolve(
        Response.json({
          grant: `grant-${owner.organization}`,
          credentialId: owner.id,
          personId: 'claire',
          organizationId: owner.organization,
          scopes: ['read', 'write'],
          expiresAt: Math.floor(NOW / 1000) + TTL + 60,
          runId: null,
        }),
      );
    }
    const organization = init.headers['authorization'] === 'Bearer grant-org-a' ? 'org-a' : 'org-b';
    return new Promise((resolve, reject) => {
      held.push({
        organization,
        end: (outcome) => {
          if (outcome === 'throw') reject(new TypeError('fetch failed'));
          else
            resolve(
              outcome === 'ok'
                ? Response.json({ projects: [] })
                : Response.json({ error: 'internal' }, { status: 500 }),
            );
        },
      });
    });
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
      now: () => NOW,
      signingKeys: { privateKey: SIGNING.privateKey, publicKey: SIGNING.publicKey },
      machineGrants: {
        client: machineGrantClient(CONFIG, fetchImpl),
        secret: SECRET,
        tokenTtlSeconds: TTL,
        jitter: () => 0,
        limit: observeCalls(
          new MachineTrafficLimits(() => NOW, {
            ...M10_LIMITS,
            // The per-credential rate never refuses here: only the in-flight limit is modeled.
            callsPerCredential: { burst: 1_000_000, perSecond: 1_000_000 },
            callsInFlightPerOrganization: LIMIT,
          }),
          progress,
        ),
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
        reportUnexpectedToolFailure: () => ({
          sentence: 'mcp-01 failed unexpectedly',
          occurrenceId: 'occurrence',
        }),
      }),
    CONFIG,
    oauth,
    {},
    oauth,
  );
  const tokens = {} as Record<Organization, string>;
  for (const owner of credentials) {
    const response = await oauth.response(
      new Request(`${OAUTH}/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '203.0.113.5',
          authorization: `Basic ${btoa(`${owner.id}:${owner.key}`)}`,
        },
        body: new URLSearchParams({ resource: MCP_URL, grant_type: CLIENT_CREDENTIALS_GRANT }),
      }),
    );
    tokens[owner.organization] = (
      (await response?.json()) as { access_token: string }
    ).access_token;
  }
  return { held, sent: [], tokens, handle, progress };
}

async function callTools(
  handle: World['handle'],
  token: string,
  count: number,
): Promise<{ status: number; texts: string[] }> {
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
  if (response.status !== 200) return { status: response.status, texts: [] };
  const parsed = (await response.json()) as unknown;
  const replies = (Array.isArray(parsed) ? parsed : [parsed]) as {
    result: { isError?: boolean; content: { text: string }[] };
  }[];
  return {
    status: 200,
    texts: replies.map((reply) =>
      reply.result.isError === true ? reply.result.content.map((part) => part.text).join('') : 'ok',
    ),
  };
}

type CallEvent = 'admission' | 'release';

/**
 * Observes the real limit boundary, without supplying an admission or releasing a slot.
 * A response body may still be streaming after the fixture resolves its fetch, so ending a
 * held call waits for the production `finally`, including calls inside an unfinished batch.
 */
class CallProgress {
  readonly #counts: Record<CallEvent, number> = { admission: 0, release: 0 };
  readonly #observers = new Set<() => void>();

  countOf(event: CallEvent): number {
    return this.#counts[event];
  }

  advance(event: CallEvent): void {
    this.#counts[event] += 1;
    for (const observe of this.#observers) observe();
  }

  /** The bound detects a missing production transition; it never substitutes for one. */
  until(event: CallEvent, count: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const observe = () => {
        if (this.#counts[event] < count) return;
        clearTimeout(deadline);
        this.#observers.delete(observe);
        resolve();
      };
      // Proof: skipping the production release failed the model at seed 20261027 on this
      // missing release observation; see verify.md, launch gate repair.
      const deadline = setTimeout(() => {
        this.#observers.delete(observe);
        reject(
          new Error(`missing ${event} ${String(count)}; observed ${String(this.#counts[event])}`),
        );
      }, 1_000);
      this.#observers.add(observe);
      observe();
    });
  }
}

function observeCalls(limits: MachineLimits, progress: CallProgress): MachineLimits {
  return {
    reserveIssuance: (attempt) => limits.reserveIssuance(attempt),
    admitCall: (caller) => {
      const admission = limits.admitCall(caller);
      progress.advance('admission');
      if (admission.kind === 'limited') return admission;
      return {
        kind: 'admitted',
        release: () => {
          admission.release();
          progress.advance('release');
        },
      };
    },
  };
}

function heldFor(real: World, organization: Organization): number {
  return real.held.filter((call) => call.organization === organization).length;
}

async function checkAnswered(request: SentRequest): Promise<void> {
  const answer = await request.answer;
  const limited = request.count - request.admitted;
  if (request.count === 1 && limited === 1) {
    reached.single429 += 1;
    expect(answer).toEqual({ status: 429, texts: [] });
    return;
  }
  expect(answer.status).toBe(200);
  expect(answer.texts.filter((text) => text === LIMITED)).toHaveLength(limited);
  expect(answer.texts).toHaveLength(request.count);
}

class Send implements fc.AsyncCommand<Model, World> {
  constructor(
    readonly organization: Organization,
    readonly count: number,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: World): Promise<void> {
    const other = ORGANIZATIONS.find((organization) => organization !== this.organization);
    if (other !== undefined && model.inFlight[other] === LIMIT) reached.crossOrg += 1;
    const admitted = Math.min(this.count, LIMIT - model.inFlight[this.organization]);
    if (admitted < this.count) reached.limited += 1;
    const entered = real.progress.countOf('admission') + this.count;
    const request: SentRequest = {
      organization: this.organization,
      count: this.count,
      admitted,
      remaining: admitted,
      answer: callTools(real.handle, real.tokens[this.organization], this.count),
    };
    await real.progress.until('admission', entered);
    expect(heldFor(real, this.organization)).toBe(model.inFlight[this.organization] + admitted);
    model.inFlight[this.organization] += admitted;
    if (admitted === 0) await checkAnswered(request);
    else real.sent.push(request);
  }
  toString(): string {
    return `Send(${this.organization}, ${String(this.count)})`;
  }
}

class End implements fc.AsyncCommand<Model, World> {
  constructor(
    readonly organization: Organization,
    readonly outcome: Outcome,
  ) {}
  check(model: Readonly<Model>): boolean {
    return model.inFlight[this.organization] > 0;
  }
  async run(model: Model, real: World): Promise<void> {
    const index = real.held.findIndex((call) => call.organization === this.organization);
    if (index < 0) throw new Error('the model holds a call be-01 does not');
    const [call] = real.held.splice(index, 1) as [HeldCall];
    if (this.outcome === 'fail') reached.failedEnd += 1;
    if (this.outcome === 'throw') reached.thrownEnd += 1;
    const released = real.progress.countOf('release') + 1;
    call.end(this.outcome);
    model.inFlight[this.organization] -= 1;
    // be-01's calls of one organization end oldest first, so this one is the oldest request's.
    const owner = real.sent.find(
      (request) => request.organization === this.organization && request.remaining > 0,
    );
    if (owner === undefined) throw new Error('no request owns the call');
    owner.remaining -= 1;
    await real.progress.until('release', released);
    if (owner.remaining === 0) {
      real.sent.splice(real.sent.indexOf(owner), 1);
      await checkAnswered(owner);
    }
  }
  toString(): string {
    return `End(${this.organization}, ${this.outcome})`;
  }
}

const organization = fc.constantFrom<Organization>(...ORGANIZATIONS);
const commands = fc.commands(
  [
    fc
      .tuple(organization, fc.integer({ min: 1, max: 4 }))
      .map(([held, count]) => new Send(held, count)),
    fc
      .tuple(organization, fc.constantFrom<Outcome>('ok', 'ok', 'fail', 'throw'))
      .map(([held, outcome]) => new End(held, outcome)),
  ],
  { maxCommands: 24, size: 'max' },
);

describe('in-flight tool calls per organization', () => {
  it('match the model through concurrent batches and calls ending in any order and any way', async () => {
    await fc.assert(
      fc.asyncProperty(commands, async (sequence) => {
        const real = await world();
        await fc.asyncModelRun(
          () => ({ model: { inFlight: { 'org-a': 0, 'org-b': 0 } }, real }),
          sequence,
        );
        for (const call of real.held.splice(0)) call.end('ok');
        await Promise.all(real.sent.map((request) => request.answer));
      }),
      { numRuns: 60, seed: 20261027 },
    );
    // Every branch the model names was reached, so no sabotage passes for want of a case.
    for (const [branch, count] of Object.entries(reached))
      expect({ branch, reached: count > 0 }).toEqual({ branch, reached: true });
  }, 60_000);
});
