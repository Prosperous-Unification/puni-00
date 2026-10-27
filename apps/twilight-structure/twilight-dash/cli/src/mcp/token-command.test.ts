import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { urlOf } from './machine-token';
import { runMcpCommand } from './token-command';

/**
 * `mcp token` against a fake token endpoint, for what the real stack
 * (`mcp-token.boot.test.ts`) cannot produce on demand: a `429` with a chosen `Retry-After` at a
 * chosen moment of the helper's budget. The fake answers as mcp-01's M10 refusal does
 * (`machineRefusal` in `apps/wbs/mcp-01/src/oauth.ts`): `429`,
 * `{"error":"invalid_request","error_description":"rate_limited"}` and `Retry-After` in seconds.
 */
const RESOURCE = 'https://wbs.example/mcp';
const TOKEN_URL = 'https://wbs.example/mcp/oauth/token';
const KEY = `wbs_mk_0b9f6c1e-4a1d-4c5e-9a7b-3f2e1d0c9b8a.${'k'.repeat(43)}`;

/** The message `pending` rejects with; fails the test when it resolves. */
async function rejection(pending: Promise<unknown>): Promise<string> {
  const outcome = await pending.then(
    () => new Error('resolved, but a refusal was expected'),
    (cause: unknown) => cause,
  );
  if (!(outcome instanceof Error) || outcome.message === 'resolved, but a refusal was expected')
    throw new Error(`expected a refusal, got ${String(outcome)}`);
  return outcome.message;
}

const scratch = mkdtempSync(join(tmpdir(), 'dash-mcp-token-unit-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function writeKey(name: string, bytes: string, mode = 0o600): string {
  const path = join(scratch, name);
  writeFileSync(path, bytes, { mode });
  chmodSync(path, mode);
  return path;
}
const keyPath = writeKey('agent.key', `${KEY}\n`);

function rateLimited(retryAfter: string | null): Response {
  return Response.json(
    { error: 'invalid_request', error_description: 'rate_limited' },
    { status: 429, headers: retryAfter === null ? {} : { 'retry-after': retryAfter } },
  );
}
const issued = (): Response =>
  Response.json({ access_token: 'issued-token', token_type: 'Bearer', expires_in: 43_200 });

/**
 * A helper run against scripted answers. The fake clock reads `at` milliseconds into the run
 * when each answer is given; `sleep` advances it.
 */
function scripted(answers: { at: number; answer: () => Response }[]) {
  let now = 0;
  const requests: { url: string; form: URLSearchParams; authorization: string | null }[] = [];
  const sleeps: number[] = [];
  const printed: string[] = [];
  const run = (flags: readonly string[] = ['--key-file', keyPath]): Promise<unknown> =>
    runMcpCommand(['token', '--resource', RESOURCE, ...flags], {
      send: (input, init) => {
        const headers = new Headers(init?.headers);
        requests.push({
          url: urlOf(input),
          form: new URLSearchParams(init?.body as URLSearchParams),
          authorization: headers.get('authorization'),
        });
        const next = answers.at(requests.length - 1);
        if (next === undefined) return Promise.reject(new Error('no answer scripted'));
        now = Math.max(now, next.at);
        return Promise.resolve(next.answer());
      },
      monotonic: { now: () => now },
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
        return Promise.resolve();
      },
      environment: {},
      write: (text) => printed.push(text),
    });
  return { run, requests, sleeps, printed };
}

describe('a 429 on the headersHelper path', () => {
  test('with Retry-After: 30, 2 s into the run, waits 7 s and retries once', async () => {
    const helper = scripted([
      { at: 2_000, answer: () => rateLimited('30') },
      { at: 0, answer: issued },
    ]);
    await helper.run();
    // Proof: waiting the whole Retry-After (no budget cap) made this see [30000] (2026-10-27).
    expect(helper.sleeps).toEqual([7_000]);
    expect(helper.requests).toHaveLength(2);
    expect(helper.printed).toEqual(['{"Authorization":"Bearer issued-token"}\n']);
  });

  test('retried once and refused again exits non-zero', async () => {
    const helper = scripted([
      { at: 2_000, answer: () => rateLimited('30') },
      { at: 0, answer: () => rateLimited('30') },
      { at: 0, answer: issued },
    ]);
    expect(await rejection(helper.run())).toContain(
      'the MCP token endpoint refused: HTTP 429 invalid_request (rate_limited)',
    );
    expect(helper.requests).toHaveLength(2);
    expect(helper.printed).toEqual([]);
  });

  test('a 429 whose capped wait is zero or less is not retried', async () => {
    // 9 s into the run: 10 s − 1 s − 9 s leaves nothing.
    const helper = scripted([
      { at: 9_000, answer: () => rateLimited('30') },
      { at: 0, answer: issued },
    ]);
    expect(await rejection(helper.run())).toContain('HTTP 429 invalid_request');
    expect(helper.requests).toHaveLength(1);
    expect(helper.sleeps).toEqual([]);
    const late = scripted([
      { at: 9_500, answer: () => rateLimited('1') },
      { at: 0, answer: issued },
    ]);
    expect(await rejection(late.run())).toContain('HTTP 429 invalid_request');
    expect(late.requests).toHaveLength(1);
  });

  test('a 429 without a delay in seconds is not retried', async () => {
    const helper = scripted([
      { at: 0, answer: () => rateLimited(null) },
      { at: 0, answer: issued },
    ]);
    expect(await rejection(helper.run())).toContain('HTTP 429 invalid_request');
    expect(helper.requests).toHaveLength(1);
  });
});

describe('the token request', () => {
  test('client_credentials over HTTP Basic: the key id and the whole key, with wbs_run', async () => {
    const helper = scripted([{ at: 0, answer: issued }]);
    await helper.run(['--key-file', keyPath, '--run', 'run-1']);
    const request = helper.requests.at(0);
    expect(request?.url).toBe(TOKEN_URL);
    expect(Object.fromEntries(request?.form ?? [])).toEqual({
      resource: RESOURCE,
      grant_type: 'client_credentials',
      wbs_run: 'run-1',
    });
    expect(request?.authorization).toBe(
      `Basic ${btoa(`0b9f6c1e-4a1d-4c5e-9a7b-3f2e1d0c9b8a:${KEY}`)}`,
    );
  });

  test('the JWT-bearer grant rereads the assertion file on every run, with no client auth', async () => {
    const assertionPath = join(scratch, 'token');
    const helper = scripted([
      { at: 0, answer: issued },
      { at: 0, answer: issued },
    ]);
    writeFileSync(assertionPath, 'first.assertion.jwt\n');
    await helper.run(['--assertion-file', assertionPath]);
    writeFileSync(assertionPath, 'second.assertion.jwt\n');
    await helper.run(['--assertion-file', assertionPath]);
    expect(helper.requests.map(({ form }) => Object.fromEntries(form))).toEqual([
      {
        resource: RESOURCE,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: 'first.assertion.jwt',
      },
      {
        resource: RESOURCE,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: 'second.assertion.jwt',
      },
    ]);
    expect(helper.requests.map(({ authorization }) => authorization)).toEqual([null, null]);
  });

  test('a GitHub Actions token is fetched for the audience on every run', async () => {
    const seen: string[] = [];
    const printed: string[] = [];
    await runMcpCommand(
      [
        'token',
        '--resource',
        RESOURCE,
        '--github-actions-audience',
        'https://wbs.example/mcp/oauth',
      ],
      {
        send: (input, init) => {
          const url = urlOf(input);
          if (url.startsWith('https://actions.example/')) {
            seen.push(`${url} ${new Headers(init?.headers).get('authorization') ?? ''}`);
            return Promise.resolve(Response.json({ value: 'github.oidc.jwt' }));
          }
          seen.push(new URLSearchParams(init?.body as URLSearchParams).get('assertion') ?? '');
          return Promise.resolve(issued());
        },
        monotonic: { now: () => 0 },
        sleep: () => Promise.reject(new Error('no sleep')),
        environment: {
          ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/token?api-version=2.0',
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-request-token',
        },
        write: (text) => printed.push(text),
      },
    );
    expect(seen).toEqual([
      'https://actions.example/token?api-version=2.0&audience=https%3A%2F%2Fwbs.example%2Fmcp%2Foauth Bearer runner-request-token',
      'github.oidc.jwt',
    ]);
    expect(printed).toHaveLength(1);
  });

  test('refuses an unset ACTIONS_ID_TOKEN_REQUEST_TOKEN, naming it', async () => {
    const sent: unknown[] = [];
    expect(
      await rejection(
        runMcpCommand(['token', '--resource', RESOURCE, '--github-actions-audience', 'wbs'], {
          send: (input) => {
            sent.push(input);
            return Promise.reject(new Error('nothing is sent'));
          },
          monotonic: { now: () => 0 },
          sleep: () => Promise.resolve(),
          environment: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/token' },
          write: () => undefined,
        }),
      ),
    ).toContain('ACTIONS_ID_TOKEN_REQUEST_TOKEN is required');
    expect(sent).toEqual([]);
  });
});

describe('refusals before any request', () => {
  test.each([
    [[]],
    [['--key-file', keyPath, '--assertion-file', keyPath]],
    [['--key-file', keyPath, '--key-file', keyPath]],
    [['--key-file']],
    [['--key-file', keyPath, '--key', KEY]],
  ])('refuses no credential or two, a repeated, valueless or unknown flag: %p', async (flags) => {
    const helper = scripted([{ at: 0, answer: issued }]);
    expect(await rejection(helper.run(flags))).toContain('usage: mcp token');
    expect(helper.requests).toEqual([]);
  });

  test('refuses a plain-HTTP resource off loopback', async () => {
    const helper = scripted([{ at: 0, answer: issued }]);
    expect(
      await rejection(
        runMcpCommand(['token', '--resource', 'http://wbs.example/mcp', '--key-file', keyPath], {
          send: (input) => {
            helper.requests.push({
              url: urlOf(input),
              form: new URLSearchParams(),
              authorization: null,
            });
            return Promise.resolve(issued());
          },
          monotonic: { now: () => 0 },
          sleep: () => Promise.resolve(),
          environment: {},
          write: () => undefined,
        }),
      ),
    ).toContain('--resource must be https, or http on loopback');
    expect(helper.requests).toEqual([]);
  });

  test('refuses a group-readable key file', async () => {
    const helper = scripted([{ at: 0, answer: issued }]);
    // Proof: skipping readOwnerOnly's mode check made this send the 0640 file's key
    // (2026-10-27).
    expect(
      await rejection(helper.run(['--key-file', writeKey('shared.key', KEY, 0o640)])),
    ).toContain('credential_not_owner_only');
    expect(helper.requests).toEqual([]);
  });

  test('refuses a key file that holds no wbs_mk_ key, never echoing it', async () => {
    const helper = scripted([{ at: 0, answer: issued }]);
    const path = writeKey('wrong.key', 'sk-not-a-wbs-key-but-secret');
    const refusal = helper.run(['--key-file', path]);
    expect(await rejection(refusal)).toContain(`${path} does not hold a wbs_mk_ API key`);
    expect(await rejection(refusal)).not.toContain('sk-not-a-wbs-key');
    expect(helper.requests).toEqual([]);
  });

  test('refuses an over-long run', async () => {
    const helper = scripted([{ at: 0, answer: issued }]);
    expect(
      await rejection(helper.run(['--key-file', keyPath, '--run', 'x'.repeat(257)])),
    ).toContain('--run must have 1 to 256 characters');
    expect(helper.requests).toEqual([]);
  });
});
