import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

const SERVER = resolve(import.meta.dir, 'activated-organization-server.ts');
const REPO_ROOT = resolve(import.meta.dir, '../../../../..');
const APP_ORIGIN = 'http://localhost:7400';

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A fresh `TMPDIR` for the child, so what it leaves behind is all that is in it. */
function childTmpdir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-activated-server-test-'));
  scratch.push(directory);
  return directory;
}

function spawnServer(port: number, temp: string) {
  return Bun.spawn(
    [
      process.execPath,
      SERVER,
      '--port',
      String(port),
      '--gw-url',
      'http://gw.invalid',
      '--app-origin',
      APP_ORIGIN,
    ],
    {
      cwd: REPO_ROOT,
      env: { PATH: process.env['PATH'] ?? '', TMPDIR: temp },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

/**
 * A non-loopback IPv4 address of this host, to show the server is not on it.
 *
 * @throws when the host has none, rather than skipping the check.
 */
function externalAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    const found = addresses?.find((each) => each.family === 'IPv4' && !each.internal);
    if (found !== undefined) return found.address;
  }
  throw new Error('no non-loopback IPv4 address to probe the listener from');
}

/** The banner's listener origin, read from stdout as the process prints it. */
async function bannerOrigin(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let seen = '';
  for await (const chunk of stdout) {
    seen += decoder.decode(chunk);
    const banner = /activated organization server \(development only\): (http:\/\/[^;]+);/.exec(
      seen,
    );
    if (banner?.[1] !== undefined) return banner[1];
  }
  throw new Error(`the server exited without its banner: ${seen.slice(-2000)}`);
}

/**
 * The committed dev server must keep booting as the schema and the routes
 * move: an organization it inserts by hand that the store no longer accepts
 * fails here, not on a developer's laptop.
 */
it('serves the owner an activated organization on loopback and cleans up on SIGTERM', async () => {
  const temp = childTmpdir();
  const child = spawnServer(0, temp);
  try {
    const origin = await bannerOrigin(child.stdout);
    expect(new URL(origin).hostname).toBe('127.0.0.1');
    // Proof: with the loopback `startListener` removed from the server, this
    // fetch answered 200 on the host's LAN address; watched 2026-10-24.
    const external = `http://${externalAddress()}:${new URL(origin).port}/health`;
    let reachedExternally = true;
    try {
      await fetch(external);
    } catch {
      reachedExternally = false;
    }
    expect(reachedExternally).toBe(false);

    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct-horse' }),
    });
    const { token } = (await login.json()) as { token: string };
    expect(login.status).toBe(200);

    const selected = await fetch(`${origin}/api/organization/active`, {
      method: 'POST',
      headers: {
        origin: APP_ORIGIN,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'org-local' }),
    });
    expect(selected.status).toBe(200);
    const organizationCookie = (selected.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(organizationCookie).toStartWith('__Host-wbs_organization=');

    const people = await fetch(`${origin}/api/people`, {
      headers: { cookie: `__Host-wbs_access=${token}; ${organizationCookie}` },
    });
    expect(people.status).toBe(200);
  } finally {
    child.kill('SIGTERM');
  }
  expect(await child.exited).toBe(0);
  expect(readdirSync(temp)).toEqual([]);
}, 30_000);

it('deletes its database directory when it cannot start', async () => {
  const temp = childTmpdir();
  const occupied = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  try {
    const child = spawnServer(occupied.port ?? 0, temp);
    expect(await child.exited).not.toBe(0);
    expect(readdirSync(temp)).toEqual([]);
  } finally {
    await occupied.stop(true);
  }
}, 30_000);
