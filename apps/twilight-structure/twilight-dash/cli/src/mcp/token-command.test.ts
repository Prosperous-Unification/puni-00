import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, test } from 'bun:test';

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
  // Static labels: a `%p` label would print the fake key into the test name.
  test.each([
    ['no credential', []],
    ['two credentials', ['--key-file', keyPath, '--assertion-file', keyPath]],
    ['a repeated flag', ['--key-file', keyPath, '--key-file', keyPath]],
    ['a valueless flag', ['--key-file']],
    ['an unknown flag', ['--key-file', keyPath, '--key', KEY]],
  ])('refuses %s', async (_label, flags) => {
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
    ).toContain('--key-file: the key file must be owned by this user with mode 0600');
    expect(helper.requests).toEqual([]);
  });

  test('refuses a key file that holds no wbs_mk_ key, never echoing it', async () => {
    const helper = scripted([{ at: 0, answer: issued }]);
    const path = writeKey('wrong.key', 'sk-not-a-wbs-key-but-secret');
    const refusal = helper.run(['--key-file', path]);
    expect(await rejection(refusal)).toBe('--key-file: the key file holds no wbs_mk_ API key');
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

describe('a misused flag never echoes its value', () => {
  const ENTRYPOINT = join(import.meta.dir, '../entrypoint.ts');
  const JWT = `eyJhbGciOiJSUzI1NiJ9.${'p'.repeat(40)}.${'s'.repeat(40)}`;

  async function entrypoint(flags: readonly string[]): Promise<{ code: number; stderr: string }> {
    const child = Bun.spawn(
      [process.execPath, ENTRYPOINT, 'mcp', 'token', '--resource', RESOURCE, ...flags],
      { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stdout).toBe('');
    return { code, stderr };
  }

  test.each([
    ['a key given to --key-file', '--key-file', KEY, 'error: --key-file names a file, not a key\n'],
    [
      'a token given to --assertion-file',
      '--assertion-file',
      JWT,
      'error: --assertion-file names a file, not a token\n',
    ],
    [
      'a secret that is no file, given to --key-file',
      '--key-file',
      'sk-pasted-secret-value',
      'error: --key-file: the key file does not exist [ENOENT]\n',
    ],
    [
      'a secret that is no file, given to --assertion-file',
      '--assertion-file',
      'sk-pasted-secret-value',
      'error: --assertion-file: the workload token file cannot be read [ENOENT]\n',
    ],
  ])('%s', async (_label, flag, value, expected) => {
    // Proof: rethrowing readOwnerOnly's refusal as is made the third case print "config_absent:
    // no configuration at sk-pasted-secret-value", and naming the path in the assertion
    // reader's refusal made the fourth print it; without the shape check in `presentationOf`
    // the first two got the file refusals instead (2026-10-27).
    const refused = await entrypoint([flag, value]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toBe(expected);
    expect(refused.stderr).not.toContain(value);
  });
});

describe('a redirect of the token request', () => {
  const servers: Bun.Server<undefined>[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) void server.stop(true);
  });

  test('is never followed: no request reaches the other origin, and the refusal names it', async () => {
    const elsewhere: string[] = [];
    const other = Bun.serve({
      port: 0,
      fetch: async (request) => {
        elsewhere.push(await request.text());
        return issued();
      },
    });
    servers.push(other);
    const endpoint = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(null, {
          status: 307,
          headers: { location: `http://localhost:${String(other.port)}/steal` },
        }),
    });
    servers.push(endpoint);
    const assertionPath = join(scratch, 'redirected-token');
    writeFileSync(assertionPath, 'workload.assertion.jwt');
    const printed: string[] = [];
    const refusal = runMcpCommand(
      [
        'token',
        '--resource',
        `http://127.0.0.1:${String(endpoint.port)}/mcp`,
        '--assertion-file',
        assertionPath,
      ],
      {
        send: (input, init) => fetch(input, init),
        monotonic: { now: () => 0 },
        sleep: () => Promise.reject(new Error('no sleep')),
        environment: {},
        write: (text) => printed.push(text),
      },
    );
    // Proof: following the redirect (no `redirect: 'manual'`, no 3xx check) made the helper
    // print the other origin's token instead of this refusal (2026-10-27).
    expect(await rejection(refusal)).toBe(
      'the MCP token endpoint answered a redirect (HTTP 307); a token request is never redirected',
    );
    expect(elsewhere).toEqual([]);
    expect(printed).toEqual([]);
  });
});
