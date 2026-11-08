import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEPENDENCY_SEMANTICS } from '@wbs/contracts';
import { openConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect, test } from 'bun:test';
import { SignJWT } from 'jose';

import { runMigrations } from '../../repository/migrate';
import { admitDependencyClient } from '../../runtime/dependency-client';
import { testApp } from '../../testing/app-fixture';

// Bun's header constructor overload is shadowed by this project's DOM library.
const CookieSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

const capable = {
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: [DEPENDENCY_SEMANTICS],
} as const;

test('internal gateway admission authenticates first and freshly refuses incompatible upgrades', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gateway-dependency-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, new URL('../../../drizzle', import.meta.url).pathname);
  const connection = openConnection(path);
  let inspections = 0;
  const app = testApp({
    admitDependencyClient: (claim) => {
      inspections += 1;
      return admitDependencyClient(connection.db, capable, claim);
    },
  });
  const request = (claim?: string, secret = 'x'.repeat(32)) =>
    app.handle(
      new Request('http://localhost/internal/gateway/dependency-admission', {
        method: 'POST',
        headers: {
          'x-internal-auth': secret,
          ...(claim === undefined ? {} : { 'X-WBS-Dependency-Semantics': claim }),
        },
      }),
    );
  // Proof: omitting this host reached the protected native boundary as missing with zero delegation; restored caller/kernel127 passed (2026-10-26).
  app.listen({ port: 0, hostname: '127.0.0.1' });
  const backendPort = app.server?.port;
  if (backendPort === undefined) throw new Error('backend did not listen');
  const gateway = Bun.spawn(
    [
      process.execPath,
      new URL('../../../../gw-01/src/testing/cross-project-delivery-gateway.ts', import.meta.url)
        .pathname,
      `http://localhost:${String(backendPort)}`,
      'k'.repeat(32),
      'x'.repeat(32),
    ],
    { stdout: 'pipe', stderr: 'inherit' },
  );
  const reader = gateway.stdout.getReader();
  const startup = await reader.read();
  reader.releaseLock();
  const address = JSON.parse(new TextDecoder().decode(startup.value)) as { port: number };
  const gatewayPort = address.port;
  const token = await new SignJWT({ username: 'ada' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('ada')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('k'.repeat(32)));
  const connect = () =>
    new Promise<WebSocket | null>((resolve) => {
      const socket = new CookieSocket(`ws://localhost:${String(gatewayPort)}/ws`, {
        headers: { origin: 'http://localhost', cookie: `__Host-wbs_access=${token}` },
      });
      socket.addEventListener(
        'message',
        () => {
          resolve(socket);
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          resolve(null);
        },
        { once: true },
      );
    });
  try {
    expect((await request(undefined, 'wrong')).status).toBe(401);
    expect(inspections).toBe(0);
    const legacy = await request();
    expect(legacy.status).toBe(204);
    expect(legacy.headers.get('cache-control')).toBe('no-store');
    const legacySocket = await connect();
    expect(legacySocket).not.toBeNull();
    legacySocket?.close();
    seedDependencyAuthority(path);
    expect(await connect()).toBeNull();
    for (const claim of [
      undefined,
      '',
      `${DEPENDENCY_SEMANTICS}, ${DEPENDENCY_SEMANTICS}`,
      DEPENDENCY_SEMANTICS.toUpperCase(),
    ]) {
      const refused = await request(claim);
      expect(refused.status).toBe(409);
      expect(refused.headers.get('cache-control')).toBe('no-store');
      expect(await refused.json()).toEqual({
        error: 'client_dependency_incompatible',
        required: DEPENDENCY_SEMANTICS,
      });
    }
    expect((await request(DEPENDENCY_SEMANTICS)).status).toBe(204);
    expect(inspections).toBe(9);
  } finally {
    gateway.kill();
    await gateway.exited;
    await app.stop();
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
