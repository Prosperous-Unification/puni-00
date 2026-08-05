import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';

import { buildApp } from './app';

const JWT_KEY = 'k'.repeat(32);
const INTERNAL_SECRET = 's'.repeat(32);
const key = new TextEncoder().encode(JWT_KEY);

let port: number;
let stop: () => void;

beforeAll(() => {
  const app = buildApp({
    beUrl: 'http://be.invalid',
    internalAuthSecret: INTERNAL_SECRET,
    jwtKey: JWT_KEY,
  });
  app.listen(0);
  port = app.server?.port ?? 0;
  stop = () => {
    void app.stop();
  };
});

afterAll(() => {
  stop();
});

async function tokenFor(username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(`user-${username}`)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

/** A connected socket, subscribed to `subscription`, collecting what it receives. */
async function connect(username: string, subscription: string) {
  const token = await tokenFor(username);
  const socket = new WebSocket(`ws://localhost:${String(port)}/ws?token=${token}`);
  const received: unknown[] = [];
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    received.push(JSON.parse(event.data));
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve();
    });
    socket.addEventListener('error', () => {
      reject(new Error(`${username} could not connect`));
    });
  });
  socket.send(JSON.stringify({ type: 'subscribe', subscription }));
  return { socket, received };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

function push(subscription: string, message: unknown): Promise<Response> {
  return fetch(`http://localhost:${String(port)}/internal/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-auth': INTERNAL_SECRET },
    body: JSON.stringify({ subscription, seq: 1, message }),
  });
}

/**
 * The fan-out with real sockets rather than `app.handle`.
 *
 * be-01's half of the path — recording to the event log, then `PushClient` —
 * has its own tests; what those cannot show is that a socket which asked for a
 * project actually receives what arrives on `/internal/push`, and that one which
 * asked for a different project does not.
 */
describe('project events reach the sockets that asked for them', () => {
  it('delivers to every subscriber of that project and nobody else', async () => {
    const projectId = crypto.randomUUID();
    const subscription = `project:${projectId}`;
    const ada = await connect('ada', subscription);
    const grace = await connect('grace', subscription);
    const linus = await connect('linus', `project:${crypto.randomUUID()}`);
    await settle();

    const res = await push(subscription, {
      type: 'work_items_changed',
      workItems: [{ id: 'w1', number: '010', name: 'Strip' }],
    });

    expect(res.status).toBe(202);
    expect((await res.json()) as { delivered_to_sockets: number }).toEqual({
      delivered_to_sockets: 2,
    });
    await settle();

    const changed = (socket: { received: unknown[] }) =>
      socket.received.filter((m) => (m as { subscription?: string }).subscription === subscription);
    expect(changed(ada)).toHaveLength(1);
    expect(changed(grace)).toHaveLength(1);
    // The one watching another project must not see it — the subscription is a
    // filter, not a formality.
    expect(changed(linus)).toHaveLength(0);

    for (const s of [ada, grace, linus]) s.socket.close();
  });

  it('refuses a socket that asks for an unknown subscription', async () => {
    const stranger = await connect('mallory', 'internal:push');
    await settle();

    const errors = stranger.received.filter(
      (m) => (m as { code?: string }).code === 'unknown_subscription',
    );
    expect(errors).toHaveLength(1);

    // And it received nothing when that channel was pushed to. Asserted against
    // that subscription specifically: the socket is still a live connection and
    // still gets presence, which is not what this is about.
    await push('internal:push', { type: 'tree_replaced', workItems: [] });
    await settle();
    // `code === undefined` excludes the refusal frame, which names the same
    // subscription it is refusing — counting that as a delivery is how this
    // assertion first failed.
    expect(
      stranger.received.filter((m) => {
        const frame = m as { subscription?: string; code?: string };
        return frame.subscription === 'internal:push' && frame.code === undefined;
      }),
    ).toHaveLength(0);

    stranger.socket.close();
  });
});

describe('a closed socket leaves the subscription it joined', () => {
  it('is not counted in the fan-out after it disconnects', async () => {
    // codex, high. `close` removed the connection from presence and left it in
    // the subscription map, and every inbound message allocated a fresh wrapper
    // so there was nothing to remove it by. Each reconnect added another dead
    // socket, and `delivered_to_sockets` counted them all.
    const projectId = crypto.randomUUID();
    const subscription = `project:${projectId}`;

    const first = await connect('ada', subscription);
    await settle();
    first.socket.close();
    await settle();

    const second = await connect('ada', subscription);
    await settle();

    const res = await push(subscription, { type: 'tree_replaced', workItems: [] });
    expect((await res.json()) as { delivered_to_sockets: number }).toEqual({
      delivered_to_sockets: 1,
    });

    second.socket.close();
  });
});
