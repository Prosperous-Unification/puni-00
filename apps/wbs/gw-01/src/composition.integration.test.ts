import { afterEach, describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';

import { buildGateway } from './composition';
import { loadConfig } from './config';

const JWT_KEY = 'k'.repeat(32);
const INTERNAL_SECRET = 's'.repeat(32);
const APP_ORIGIN = 'https://wbs.test';
const OWN = crypto.randomUUID();
const FOREIGN = crypto.randomUUID();

/** The production configuration path in OIDC mode, with the provider stubbed out. */
function oidcConfig() {
  return (
    loadConfig as unknown as (
      env: Record<string, string>,
      oidcVerifierFromEnv: () => { verify(token: string): Promise<{ sub: string }> },
    ) => ReturnType<typeof loadConfig>
  )(
    {
      AUTH_AUDIENCE: 'wbs-api',
      AUTH_CLIENT_ID: 'client',
      AUTH_CLIENT_SECRET: 'secret',
      AUTH_ISSUER_DISCOVERY_URL: 'https://idp.invalid',
      AUTH_MODE: 'oidc',
      AUTH_REDIRECT_URI: `${APP_ORIGIN}/api/auth/okta/callback`,
      BE_URL: 'http://be.invalid',
      INTERNAL_AUTH_SECRET: INTERNAL_SECRET,
      JWT_SIGNING_KEY_CURRENT: JWT_KEY,
      LOG_LEVEL: 'info',
      PORT: '0',
    },
    () => ({ verify: () => Promise.reject(new Error('not an OIDC token')) }),
  );
}

let stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.map((stop) => stop()));
  stops = [];
});

/** be-01 as gw-01 sees it: OWN is readable with the right cookie, nothing else is. */
function startProduction(token: string) {
  const calls: { url: string; cookie: string | null; secret: string | null }[] = [];
  const app = buildGateway(oidcConfig(), (url, init) => {
    if (url.endsWith('/internal/gateway/dependency-admission'))
      return Promise.resolve(new Response(null, { status: 204 }));
    const headers = new Headers(init?.headers);
    calls.push({ url, cookie: headers.get('cookie'), secret: headers.get('x-internal-auth') });
    const proves = headers.get('cookie') === `__Host-wbs_access=${token}`;
    if (url.endsWith(`/projects/${OWN}/browser-access`) && proves)
      return Promise.resolve(new Response(null, { status: 204 }));
    if (url.includes('/browser-access'))
      return Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }));
    if (url.endsWith('/internal/resume'))
      return Promise.resolve(
        Response.json({ [`project:${OWN}`]: { status: 'denied', reason: 'out_of_range' } }),
      );
    return Promise.reject(new Error(`unexpected backend request ${url}`));
  });
  app.listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not start');
  stops.push(async () => {
    await app.stop();
  });
  return { port, calls };
}

async function connect(port: number, token: string) {
  const socket = new WebSocket(`ws://localhost:${String(port)}/ws`, {
    headers: { cookie: `__Host-wbs_access=${token}`, origin: APP_ORIGIN },
  });
  const received: { type?: string; code?: string; subscription?: string; reason?: string }[] = [];
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    received.push(JSON.parse(event.data) as (typeof received)[number]);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve();
    });
    socket.addEventListener('error', () => {
      reject(new Error('could not connect'));
    });
  });
  stops.push(() => {
    socket.close();
    return Promise.resolve();
  });
  return { socket, received };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function push(port: number, subscription: string): Promise<number> {
  const response = await fetch(`http://localhost:${String(port)}/internal/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-auth': INTERNAL_SECRET },
    body: JSON.stringify({ subscription, seq: 1, message: {} }),
  });
  return ((await response.json()) as { delivered_to_sockets: number }).delivered_to_sockets;
}

describe('the production gateway composition', () => {
  it('asks be-01 and refuses a foreign project', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ username: 'ada' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-ada')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(JWT_KEY));
    const { port, calls } = startProduction(token);
    const client = await connect(port, token);
    client.socket.send(JSON.stringify({ type: 'subscribe', subscription: `project:${FOREIGN}` }));
    client.socket.send(JSON.stringify({ type: 'subscribe', subscription: `project:${OWN}` }));
    await until(
      () => client.received.some((frame) => frame.code === 'unknown_subscription'),
      'the refusal',
    );
    await until(() => calls.length >= 2, 'both checks');

    expect(await push(port, `project:${FOREIGN}`)).toBe(0);
    expect(await push(port, `project:${OWN}`)).toBe(1);
    expect(calls.slice(0, 2)).toEqual([
      {
        url: `http://be.invalid/internal/gateway/projects/${FOREIGN}/browser-access`,
        cookie: `__Host-wbs_access=${token}`,
        secret: INTERNAL_SECRET,
      },
      {
        url: `http://be.invalid/internal/gateway/projects/${OWN}/browser-access`,
        cookie: `__Host-wbs_access=${token}`,
        secret: INTERNAL_SECRET,
      },
    ]);
  });

  it('resumes for the socket’s own principal through be-01', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ username: 'ada' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-ada')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(JWT_KEY));
    const { port, calls } = startProduction(token);
    const client = await connect(port, token);
    client.socket.send(
      JSON.stringify({ type: 'resume', resume_points: { [`project:${OWN}`]: 3 } }),
    );
    await until(() => client.received.some((frame) => frame.type === 'resume_ack'), 'resume_ack');

    expect(calls.filter((call) => call.url.endsWith('/internal/resume'))).toEqual([
      {
        url: 'http://be.invalid/internal/resume',
        cookie: `__Host-wbs_access=${token}`,
        secret: INTERNAL_SECRET,
      },
    ]);
  });
});
