import { describe, expect, test } from 'bun:test';

import { mcpEndpointOf, urlOf } from './machine-token';
import { WorkloadJwtBearerProvider } from './workload-provider';

/**
 * The provider's own rules against fakes; its SDK behaviour against the real stack is in
 * `mcp-token.boot.test.ts`. The `429` is answered as mcp-01's M10 refusal is
 * (`machineRefusal` in `apps/wbs/mcp-01/src/oauth.ts`).
 */
const ENDPOINT = mcpEndpointOf('https://wbs.example/mcp');

function provider(clock: { now: number }, sleeps: number[] = []) {
  return new WorkloadJwtBearerProvider({
    endpoint: ENDPOINT,
    credentialId: 'credential-1',
    readAssertion: () => Promise.resolve('workload.jwt'),
    run: 'run-1',
    monotonic: { now: () => clock.now },
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });
}

const rateLimited = (seconds: string): Response =>
  Response.json(
    { error: 'invalid_request', error_description: 'rate_limited' },
    { status: 429, headers: { 'retry-after': seconds } },
  );

describe('WorkloadJwtBearerProvider', () => {
  test('stamps the client information with the issuer and authenticates no client', async () => {
    const instance = provider({ now: 0 });
    expect(instance.clientInformation()).toEqual({
      client_id: 'credential-1',
      issuer: 'https://wbs.example/mcp/oauth',
    });
    const headers = new Headers();
    const form = await instance.prepareTokenRequest();
    instance.addClientAuthentication();
    expect([...headers]).toEqual([]);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: 'workload.jwt',
      resource: 'https://wbs.example/mcp',
      wbs_run: 'run-1',
    });
  });

  test('serves its token until 5 minutes before exp, or half its lifetime for a short one', () => {
    const clock = { now: 0 };
    const instance = provider(clock);
    instance.saveTokens({ access_token: 'long', token_type: 'Bearer', expires_in: 3_600 });
    clock.now = 3_299_999;
    expect(instance.tokens()?.access_token).toBe('long');
    clock.now = 3_300_000;
    expect(instance.tokens()).toBeUndefined();
    instance.saveTokens({ access_token: 'short', token_type: 'Bearer', expires_in: 240 });
    clock.now += 119_999;
    expect(instance.tokens()?.access_token).toBe('short');
    clock.now += 1;
    expect(instance.tokens()).toBeUndefined();
  });

  test('drops its token when the SDK asks for a new one, or invalidates it', async () => {
    const instance = provider({ now: 0 });
    instance.saveTokens({ access_token: 'first', token_type: 'Bearer', expires_in: 3_600 });
    await instance.prepareTokenRequest();
    expect(instance.tokens()).toBeUndefined();
    instance.saveTokens({ access_token: 'second', token_type: 'Bearer', expires_in: 3_600 });
    instance.invalidateCredentials('tokens');
    expect(instance.tokens()).toBeUndefined();
  });

  test('refuses a token without expires_in', () => {
    expect(() => {
      provider({ now: 0 }).saveTokens({ access_token: 'x', token_type: 'Bearer' });
    }).toThrow('without expires_in');
  });

  test('waits a token endpoint Retry-After, capped at 60 s, and retries once', async () => {
    const sleeps: number[] = [];
    const instance = provider({ now: 0 }, sleeps);
    const answers = [rateLimited('90'), rateLimited('90'), Response.json({})];
    const sent: string[] = [];
    const send = instance.tokenFetch((input) => {
      sent.push(urlOf(input));
      return Promise.resolve(answers.shift() ?? Response.json({}));
    });
    const answer = await send(ENDPOINT.tokenUrl, { method: 'POST' });
    expect(answer.status).toBe(429);
    expect(sleeps).toEqual([60_000]);
    expect(sent).toEqual([ENDPOINT.tokenUrl, ENDPOINT.tokenUrl]);
  });

  test('passes a 429 from /mcp through untouched', async () => {
    const sleeps: number[] = [];
    const instance = provider({ now: 0 }, sleeps);
    const send = instance.tokenFetch(() => Promise.resolve(rateLimited('5')));
    expect((await send('https://wbs.example/mcp', { method: 'POST' })).status).toBe(429);
    expect(sleeps).toEqual([]);
  });
});
