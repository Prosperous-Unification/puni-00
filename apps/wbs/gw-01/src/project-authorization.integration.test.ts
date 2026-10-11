import { afterEach, describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';

import { buildApp, type SocketCredential } from './app';
import type { ProjectAccessVerdict } from './service/project-access';

const JWT_KEY = 'k'.repeat(32);
const INTERNAL_SECRET = 's'.repeat(32);
const APP_ORIGIN = 'https://wbs.test';
const key = new TextEncoder().encode(JWT_KEY);

const OWN = crypto.randomUUID();
const FOREIGN = crypto.randomUUID();
const own = `project:${OWN}`;
const foreign = `project:${FOREIGN}`;

interface Frame {
  type?: string;
  code?: string;
  subscription?: string;
  reason?: string;
  seq?: number;
  users?: string[];
  replayed?: Record<string, number>;
}

/**
 * be-01's answer, keyed by the socket's own access token: what each principal
 * may read right now. Tests change it to model removal from an organization.
 */
class AccessTable {
  readonly readable = new Map<string, Set<string>>();
  readonly credentials: SocketCredential[] = [];
  outage: Error | null = null;
  unauthenticated = new Set<string>();

  grant(token: string, ...projectIds: string[]): void {
    this.readable.set(token, new Set(projectIds));
  }

  revoke(token: string, projectId: string): void {
    this.readable.get(token)?.delete(projectId);
  }

  readonly adapter = (credential: SocketCredential) => {
    this.credentials.push(credential);
    if (credential.kind !== 'cookie') throw new Error('test sockets authenticate by cookie');
    return (projectId: string): Promise<ProjectAccessVerdict> => {
      if (this.outage !== null) return Promise.reject(this.outage);
      if (this.unauthenticated.has(credential.accessToken))
        return Promise.resolve('unauthenticated');
      return Promise.resolve(
        this.readable.get(credential.accessToken)?.has(projectId) === true ? 'granted' : 'denied',
      );
    };
  };
}

let stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.map((stop) => stop()));
  stops = [];
});

function start(
  table: AccessTable,
  resume: (points: Record<string, number>) => Promise<unknown> = () => Promise.resolve({}),
) {
  const resumed: Record<string, number>[] = [];
  const app = buildApp({
    beUrl: 'http://be.invalid',
    internalAuthSecret: INTERNAL_SECRET,
    jwtKey: JWT_KEY,
    appOrigin: APP_ORIGIN,
    projectAccess: table.adapter,
    lease: {
      timers: {
        nowMs: () => Date.now(),
        schedule: (ms, fire) => {
          const handle = setTimeout(fire, ms);
          return () => {
            clearTimeout(handle);
          };
        },
      },
      renewMs: 40,
      checkDeadlineMs: 200,
    },
    fetchImpl: async (url, init) => {
      if (!url.endsWith('/internal/resume') || typeof init?.body !== 'string')
        throw new Error(`unexpected backend request ${url}`);
      const points = (JSON.parse(init.body) as { resume_points: Record<string, number> })
        .resume_points;
      resumed.push(points);
      return Response.json(await resume(points));
    },
  });
  app.listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not start');
  stops.push(async () => {
    await app.stop();
  });
  return { port, resumed };
}

async function tokenFor(username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(`user-${username}`)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

async function connect(port: number, token: string, organizationCookie = 'org-a') {
  const socket = new WebSocket(`ws://localhost:${String(port)}/ws`, {
    headers: {
      cookie: `__Host-wbs_access=${token}; __Host-wbs_organization=${organizationCookie}`,
      origin: APP_ORIGIN,
    },
  });
  const received: Frame[] = [];
  let closed: { code: number; reason: string } | null = null;
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    received.push(JSON.parse(event.data) as Frame);
  });
  socket.addEventListener('close', (event) => {
    closed = { code: event.code, reason: event.reason };
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
  return {
    socket,
    received,
    closed: () => closed,
    send: (frame: unknown) => {
      socket.send(JSON.stringify(frame));
    },
  };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

async function push(port: number, subscription: string): Promise<number> {
  const response = await fetch(`http://localhost:${String(port)}/internal/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-auth': INTERNAL_SECRET },
    body: JSON.stringify({ subscription, seq: 1, message: { type: 'tree_replaced' } }),
  });
  return ((await response.json()) as { delivered_to_sockets: number }).delivered_to_sockets;
}

const deliveries = (received: Frame[], subscription: string) =>
  received.filter((frame) => frame.subscription === subscription && frame.seq !== undefined);

describe('gw-01 authorizes project subscriptions against be-01', () => {
  it('asks with the socket’s own credential and organization binding', async () => {
    const table = new AccessTable();
    const { port } = start(table);
    const ada = await tokenFor('ada');
    table.grant(ada, OWN);
    const client = await connect(port, ada, 'org-a-binding');
    client.send({ type: 'subscribe', subscription: own });
    await settle();

    expect(table.credentials).toEqual([
      { kind: 'cookie', accessToken: ada, organizationCookie: 'org-a-binding' },
    ]);
    expect(await push(port, own)).toBe(1);
  });

  it('refuses a project the principal cannot read', async () => {
    const table = new AccessTable();
    const { port } = start(table);
    const [mallory, grace] = await Promise.all([tokenFor('mallory'), tokenFor('grace')]);
    table.grant(mallory, OWN);
    table.grant(grace, FOREIGN);
    const member = await connect(port, grace);
    member.send({ type: 'subscribe', subscription: foreign });
    const outsider = await connect(port, mallory);
    outsider.send({ type: 'subscribe', subscription: foreign });
    await until(
      () => outsider.received.some((frame) => frame.code === 'unknown_subscription'),
      'the refusal',
    );

    expect(outsider.received.filter((frame) => frame.type === 'error')).toEqual([
      { type: 'error', code: 'unknown_subscription', subscription: foreign },
    ]);
    // Only the member receives the foreign project's events.
    expect(await push(port, foreign)).toBe(1);
    await settle();
    expect(deliveries(outsider.received, foreign)).toEqual([]);
    // And the outsider is in no roster for it: the member never sees mallory.
    expect(
      member.received.filter((frame) => frame.type === 'presence').flatMap((f) => f.users ?? []),
    ).not.toContain('mallory');
  });

  it('refuses resume points for a project the socket may not read', async () => {
    const table = new AccessTable();
    const { port, resumed } = start(table, (points) =>
      Promise.resolve(
        Object.fromEntries(
          Object.keys(points).map((subscription) => [
            subscription,
            { status: 'replaying', events: [{ seq: 4, message: { type: 'tree_replaced' } }] },
          ]),
        ),
      ),
    );
    const mallory = await tokenFor('mallory');
    table.grant(mallory, OWN);
    const client = await connect(port, mallory);
    client.send({ type: 'resume', resume_points: { [own]: 3, [foreign]: 3, 'internal:x': 3 } });
    await until(() => client.received.some((frame) => frame.type === 'resume_ack'), 'resume_ack');

    expect(resumed).toEqual([{ [own]: 3 }]);
    expect(client.received.filter((frame) => frame.type === 'resume_denied')).toEqual([
      { type: 'resume_denied', subscription: foreign, reason: 'forbidden' },
      { type: 'resume_denied', subscription: 'internal:x', reason: 'forbidden' },
    ]);
    expect(deliveries(client.received, foreign)).toEqual([]);
    expect(client.received.at(-1)).toEqual({ type: 'resume_ack', replayed: { [own]: 1 } });
  });

  it('withholds replay when access is lost while be-01 reads it', async () => {
    const table = new AccessTable();
    const ada = await tokenFor('ada');
    table.grant(ada, OWN);
    const { port } = start(table, () => {
      // Removed from the organization while the log was being read.
      table.revoke(ada, OWN);
      return Promise.resolve({
        [own]: { status: 'replaying', events: [{ seq: 4, message: { type: 'tree_replaced' } }] },
      });
    });
    const client = await connect(port, ada);
    client.send({ type: 'resume', resume_points: { [own]: 3 } });
    await until(() => client.received.some((frame) => frame.type === 'resume_ack'), 'resume_ack');

    expect(deliveries(client.received, own)).toEqual([]);
    expect(client.received.filter((frame) => frame.type?.startsWith('resume'))).toEqual([
      { type: 'resume_denied', subscription: own, reason: 'forbidden' },
      { type: 'resume_ack', replayed: {} },
    ]);
  });

  it('drops a removed member’s live subscription when its lease is renewed', async () => {
    const table = new AccessTable();
    const { port } = start(table);
    const [ada, grace] = await Promise.all([tokenFor('ada'), tokenFor('grace')]);
    table.grant(ada, OWN);
    table.grant(grace, OWN);
    const removed = await connect(port, ada);
    removed.send({ type: 'subscribe', subscription: own });
    const colleague = await connect(port, grace);
    colleague.send({ type: 'subscribe', subscription: own });
    await settle();
    expect(await push(port, own)).toBe(2);

    table.revoke(ada, OWN);
    await until(
      () => removed.received.some((frame) => frame.code === 'subscription_revoked'),
      'the revocation',
    );

    expect(removed.received.filter((frame) => frame.type === 'error')).toEqual([
      { type: 'error', code: 'subscription_revoked', subscription: own },
    ]);
    expect(await push(port, own)).toBe(1);
    const roster = () => colleague.received.filter((frame) => frame.type === 'presence').at(-1);
    await until(() => roster()?.users?.includes('ada') === false, 'ada leaving the roster');
    expect(roster()?.users).toEqual(['grace']);
    // The socket stays open for whatever it may still read.
    expect(removed.closed()).toBeNull();
  });

  it('closes the socket when be-01 cannot answer, and grants nothing', async () => {
    const table = new AccessTable();
    const { port } = start(table);
    const ada = await tokenFor('ada');
    table.grant(ada, OWN);
    table.outage = new Error('be-01 unreachable');
    const client = await connect(port, ada);
    client.send({ type: 'subscribe', subscription: own });
    await until(() => client.closed() !== null, 'the close');

    expect(client.closed()).toEqual({ code: 1013, reason: 'project access unavailable' });
    expect(await push(port, own)).toBe(0);
  });

  it('closes the socket when its credential no longer proves anyone', async () => {
    const table = new AccessTable();
    const { port } = start(table);
    const ada = await tokenFor('ada');
    table.grant(ada, OWN);
    const client = await connect(port, ada);
    client.send({ type: 'subscribe', subscription: own });
    await settle();
    table.unauthenticated.add(ada);
    await until(() => client.closed() !== null, 'the close');

    expect(client.closed()).toEqual({ code: 1008, reason: 'unauthenticated' });
    expect(await push(port, own)).toBe(0);
  });
});
