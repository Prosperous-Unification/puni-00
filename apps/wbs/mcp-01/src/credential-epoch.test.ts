import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserOidcClient } from '@wbs/auth';
import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import type { McpConfig } from './config';
import { advanceCredentialEpoch, McpStoreInUse } from './credential-epoch';
import { McpOAuthServer } from './oauth';
import type { ConsentOrganizations, OrganizationAuthority } from './organization-authority';
import { McpSessionStore } from './session-store';
import { MCP_STORE_MIGRATIONS, McpStoreRefused, migrateMcpStore } from './store-migrations';
import { UpstreamRejected } from './wbs-client';

/**
 * Task 6.5: the credential epoch advance that retires every pre-activation MCP credential,
 * its operator CLI, and mcp-01's refusal of older-epoch codes, sessions and refresh tokens.
 */
const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
};
const BASE = 'https://dev.wbs.bulletpoints.club/mcp/oauth';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(43);
const KEY = randomBytes(32);
const SIGNING = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLI = join(import.meta.dir, 'credential-epoch-cli.ts');
const ACTIVATED_ONE: ConsentOrganizations = {
  kind: 'activated',
  userId: 'u-ada',
  memberships: [{ organizationId: 'org-a', name: 'Acme', role: 'member', agents: [] }],
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function storePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-credential-epoch-'));
  roots.push(root);
  return join(root, 'sessions.sqlite');
}

function withDb<T>(path: string, use: (db: Database) => T): T {
  const db = new Database(path, { strict: true });
  try {
    return use(db);
  } finally {
    db.close();
  }
}

/** Another writer moving the durable epoch, as a process that missed the drain would see it. */
function raiseEpoch(path: string, epoch = 1): void {
  withDb(path, (db) => db.run('UPDATE mcp_credential_epoch SET epoch = ?', [epoch]));
}

function storeState(path: string) {
  return withDb(path, (db) => ({
    epoch: db.query<{ epoch: number }, []>('SELECT epoch FROM mcp_credential_epoch').get()?.epoch,
    unrevokedEpochZero: db
      .query<{ n: number }, []>(
        'SELECT COUNT(*) AS n FROM mcp_family WHERE credential_epoch = 0 AND revoked_at IS NULL',
      )
      .get()?.n,
    families: db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM mcp_family').get()?.n,
    sessions: db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM mcp_session').get()?.n,
  }));
}

interface Upstream {
  readonly expiresIn?: number;
  readonly refresh?: BrowserOidcClient['refresh'];
}

function server(
  store: McpSessionStore,
  consent?: ConsentOrganizations,
  upstream: Upstream = {},
  ends: { credentialId: string; familyId: string }[] = [],
  config: McpConfig = CONFIG,
): McpOAuthServer {
  let counter = 0;
  const organizations: OrganizationAuthority | undefined =
    consent === undefined
      ? undefined
      : {
          organizationsFor: () => Promise.resolve(consent),
          mintConsentCredential: () => Promise.resolve({ kind: 'minted' }),
          reportConsentEnded: (ended) => {
            ends.push(ended);
            return Promise.resolve('acknowledged');
          },
          delegationFor: () => Promise.resolve({ kind: 'issued', token: 'signed-delegation' }),
          readRefreshAuthority: (authority) =>
            Promise.resolve({
              outcome: 'admitted',
              authority,
              facts: { enforced: [], policy: null, lifecycle: null },
            }),
        };
  return new McpOAuthServer(
    config,
    {
      authorizationUrl: (input) =>
        Promise.resolve(new URL(`https://idp.example/authorize?state=${input.state}`)),
      exchange: () =>
        Promise.resolve({
          accessToken: 'upstream-token',
          refreshToken: 'up-refresh',
          expiresIn: upstream.expiresIn ?? 600,
        }),
      refresh:
        upstream.refresh ??
        (() => Promise.resolve({ accessToken: 'refreshed-upstream', expiresIn: 600 })),
      revoke: () => Promise.resolve(),
    },
    {
      groupPrefix: 'dev',
      random: () => `${randomBytes(4).toString('hex')}-${String((counter += 1))}`,
      signingKeys: { privateKey: SIGNING.privateKey, publicKey: SIGNING.publicKey },
      store,
      verifyUpstream: (token) =>
        token === 'upstream-token' || token === 'refreshed-upstream'
          ? Promise.resolve({
              iss: 'https://idp.example/',
              sub: 'auth0|ada',
              wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
            })
          : Promise.reject(new Error('not an upstream token')),
      ...(organizations === undefined
        ? {}
        : {
            organizations,
            reportFault: (fault) => {
              throw fault;
            },
          }),
    },
  );
}

async function handled(oauth: McpOAuthServer, request: Request): Promise<Response> {
  const response = await oauth.response(request);
  if (response === undefined) throw new Error(`${request.url} was not handled`);
  return response;
}

/** Registers, authorizes and returns the callback's redirect. */
async function consent(oauth: McpOAuthServer): Promise<{ clientId: string; callback: URL }> {
  const registered = await handled(
    oauth,
    new Request(`${BASE}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' }),
    }),
  );
  const clientId = ((await registered.json()) as { client_id: string }).client_id;
  const authorize = new URL(`${BASE}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: CALLBACK,
    response_type: 'code',
    scope: 'wbs:read wbs:write',
    state: 'client-state',
  }).toString();
  const started = await handled(oauth, new Request(authorize));
  const cookie = started.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  const state = new URL(started.headers.get('location') ?? 'https://invalid').searchParams.get(
    'state',
  );
  const callback = await handled(
    oauth,
    new Request(`${BASE}/callback?code=upstream&state=${String(state)}`, { headers: { cookie } }),
  );
  expect(callback.status).toBe(302);
  return { clientId, callback: new URL(callback.headers.get('location') ?? 'https://invalid') };
}

async function exchangeCode(
  oauth: McpOAuthServer,
  clientId: string,
  code: string,
): Promise<Response> {
  return await handled(
    oauth,
    new Request(`${BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: VERIFIER,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK,
      }),
    }),
  );
}

async function refreshGrant(
  oauth: McpOAuthServer,
  clientId: string,
  refreshToken: string,
): Promise<Response> {
  return await handled(
    oauth,
    new Request(`${BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }),
  );
}

interface Credentials {
  readonly clientId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sessionId: string;
}

/**
 * A complete consent and code exchange: one family, one session, one refresh token. The
 * session id is read from the token rather than resolved, so no upstream refresh happens here.
 */
async function connect(oauth: McpOAuthServer): Promise<Credentials> {
  const { clientId, callback } = await consent(oauth);
  const token = await exchangeCode(oauth, clientId, callback.searchParams.get('code') ?? '');
  expect(token.status).toBe(200);
  const body = (await token.json()) as { access_token: string; refresh_token: string };
  const claims = JSON.parse(
    Buffer.from(body.access_token.split('.')[1] ?? '', 'base64url').toString(),
  ) as { jti: string };
  return {
    clientId,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    sessionId: claims.jti,
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => 'resolved',
    (cause: unknown) => cause,
  );
}

async function runCli(path: string | undefined, args: readonly string[] = []) {
  const env: Record<string, string> = { PATH: process.env['PATH'] ?? '' };
  if (path !== undefined) env['MCP_STORE_PATH'] = path;
  // A scratch cwd: Bun loads `.env` from the working directory, and a developer's
  // `apps/wbs/mcp-01/.env` (written by `tools/dev/setup.ts`) would set MCP_STORE_PATH.
  // Proof: 2026-10-22, with the worktree's cwd and that file present, `refuses without
  // MCP_STORE_PATH or with unknown arguments` failed (SQLITE_CANTOPEN instead of the usage error).
  const cwd = mkdtempSync(join(tmpdir(), 'mcp-credential-epoch-cli-'));
  roots.push(cwd);
  const child = Bun.spawn(['bun', CLI, ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/** A store holding a pre-activation legacy family and a bound one, both with live sessions. */
async function preActivationStore(): Promise<{
  path: string;
  legacy: Credentials;
  bound: Credentials;
}> {
  const path = storePath();
  const store = new McpSessionStore(path, [KEY]);
  try {
    const legacy = await connect(server(store));
    const bound = await connect(server(store, ACTIVATED_ONE));
    return { path, legacy, bound };
  } finally {
    store.close();
  }
}

describe('credential epoch advance', () => {
  it('revokes every pre-activation family and session', async () => {
    const { path } = await preActivationStore();
    withDb(path, (db) => {
      db.run('UPDATE mcp_family SET revoked_at = 1 WHERE organization_id IS NOT NULL');
      db.run(
        'DELETE FROM mcp_session WHERE family_id IN (SELECT family_id FROM mcp_family WHERE revoked_at IS NOT NULL)',
      );
    });
    const before = storeState(path);
    expect(before).toEqual({ epoch: 0, unrevokedEpochZero: 1, families: 2, sessions: 1 });

    expect(advanceCredentialEpoch(path, 1_234, false)).toEqual({
      outcome: 'planned',
      from: 0,
      to: 1,
      revokedFamilies: 1,
      removedSessions: 1,
    });
    expect(storeState(path)).toEqual(before);

    expect(advanceCredentialEpoch(path, 1_234, true)).toEqual({
      outcome: 'advanced',
      from: 0,
      to: 1,
      revokedFamilies: 1,
      removedSessions: 1,
    });
    expect(storeState(path)).toEqual({ epoch: 1, unrevokedEpochZero: 0, families: 2, sessions: 0 });
    // The already-revoked family keeps its own revocation instant.
    expect(
      withDb(path, (db) =>
        db.query('SELECT organization_id, revoked_at FROM mcp_family ORDER BY revoked_at').all(),
      ),
    ).toEqual([
      { organization_id: 'org-a', revoked_at: 1 },
      { organization_id: null, revoked_at: 1_234 },
    ]);
    expect(advanceCredentialEpoch(path, 9_999, true)).toEqual({
      outcome: 'already_activated',
      epoch: 1,
    });
  });

  it('reports a consent family retired by the epoch advance, or by another writer', async () => {
    for (const retire of ['cli', 'raised'] as const) {
      const path = storePath();
      const store = new McpSessionStore(path, [KEY]);
      const now = Date.now();
      store.recordPendingConsent('family-claire', 'credential-claire', now + 300_000);
      store.createFamily(
        {
          familyId: 'family-claire',
          clientId: 'client-1',
          subject: 'auth0|ada',
          scope: 'wbs:read',
          upstreamAccessToken: 'upstream-token',
          upstreamExpiresAt: now + 600_000,
          idleExpiresAt: now + 600_000,
          absoluteExpiresAt: now + 600_000,
          binding: { organizationId: 'org-a', userId: 'u-ada', issuer: 'https://idp.example/' },
          consent: { personId: 'p-claire', credentialId: 'credential-claire' },
        },
        'session-claire',
        now + 600_000,
        'refresh-claire',
        now,
      );
      store.close();
      if (retire === 'cli') advanceCredentialEpoch(path, now, true);
      else raiseEpoch(path);
      const reopened = new McpSessionStore(path, [KEY]);
      const ends: { credentialId: string; familyId: string }[] = [];
      expect(await server(reopened, ACTIVATED_ONE, {}, ends).reportEndedConsents()).toBe(1);
      expect({ retire, ends }).toEqual({
        retire,
        ends: [{ credentialId: 'credential-claire', familyId: 'family-claire' }],
      });
      reopened.close();
    }
  });

  it('refuses while this process has the store open, and changes nothing', async () => {
    const { path } = await preActivationStore();
    const before = storeState(path);
    const live = new McpSessionStore(path, [KEY]);
    try {
      expect(() => advanceCredentialEpoch(path, 1_234, true)).toThrow(McpStoreInUse);
    } finally {
      live.close();
    }
    expect(storeState(path)).toEqual(before);
  });

  it('refuses a store that is not in WAL mode', async () => {
    const { path } = await preActivationStore();
    withDb(path, (db) => db.run('PRAGMA journal_mode = DELETE'));
    expect(() => advanceCredentialEpoch(path, 1_234, true)).toThrow(/not wal/);
    expect(storeState(path).epoch).toBe(0);
  });

  it('refuses a store this release has not migrated', () => {
    const path = storePath();
    withDb(path, (db) => {
      db.run('PRAGMA journal_mode = WAL');
      migrateMcpStore(db, true, MCP_STORE_MIGRATIONS.slice(0, 2));
    });
    expect(() => advanceCredentialEpoch(path, 1_234, true)).toThrow(/applied 2 of 4 migrations/);
    expect(storeState(path).epoch).toBe(0);
  });

  it('refuses an epoch it does not know', async () => {
    const { path } = await preActivationStore();
    raiseEpoch(path, 2);
    expect(() => advanceCredentialEpoch(path, 1_234, true)).toThrow(McpStoreRefused);
    expect(() => advanceCredentialEpoch(path, 1_234, true)).toThrow(/epoch 2 is not 0 or 1/);
    expect(storeState(path)).toMatchObject({ epoch: 2, unrevokedEpochZero: 2 });
  });
});

describe('credential-epoch-cli.ts', () => {
  it('dry-runs, applies once, then reports the activated epoch as a no-op', async () => {
    const { path } = await preActivationStore();
    const dry = await runCli(path);
    expect(dry.exitCode).toBe(0);
    expect(JSON.parse(dry.stdout)).toEqual({
      outcome: 'planned',
      from: 0,
      to: 1,
      revokedFamilies: 2,
      removedSessions: 2,
    });
    expect(storeState(path).epoch).toBe(0);

    const applied = await runCli(path, ['--apply']);
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ outcome: 'advanced', revokedFamilies: 2 });
    expect(storeState(path)).toEqual({ epoch: 1, unrevokedEpochZero: 0, families: 2, sessions: 0 });

    const again = await runCli(path, ['--apply']);
    expect(again.exitCode).toBe(0);
    expect(JSON.parse(again.stdout)).toEqual({ outcome: 'already_activated', epoch: 1 });
  });

  it('refuses while an mcp-01 process has the store open', async () => {
    const { path } = await preActivationStore();
    const holder = Bun.spawn(
      [
        'bun',
        '-e',
        `const { McpSessionStore } = await import(${JSON.stringify(join(import.meta.dir, 'session-store.ts'))});
         new McpSessionStore(process.env.MCP_STORE_PATH, [Buffer.from(process.env.KEY, 'base64')]);
         console.log('open');
         await Bun.sleep(30_000);`,
      ],
      {
        env: { PATH: process.env['PATH'] ?? '', MCP_STORE_PATH: path, KEY: KEY.toString('base64') },
        stdout: 'pipe',
        stderr: 'inherit',
      },
    );
    try {
      const reader = holder.stdout.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('open');
      const refused = await runCli(path, ['--apply']);
      expect(refused.exitCode).toBe(3);
      expect(JSON.parse(refused.stderr)).toMatchObject({ refusal: 'store_in_use' });
      expect(storeState(path)).toMatchObject({ epoch: 0, unrevokedEpochZero: 2 });
    } finally {
      holder.kill();
      await holder.exited;
    }
    expect((await runCli(path, ['--apply'])).exitCode).toBe(0);
  });

  it('refuses an absent store without creating it', async () => {
    const path = storePath();
    const refused = await runCli(path, ['--apply']);
    expect(refused.exitCode).toBe(1);
    expect(existsSync(path)).toBe(false);
  });

  it('refuses without MCP_STORE_PATH or with unknown arguments', async () => {
    const { path } = await preActivationStore();
    expect((await runCli(undefined)).stderr).toContain('MCP_STORE_PATH must be set');
    const unknown = await runCli(path, ['--force']);
    expect(unknown.exitCode).toBe(1);
    expect(storeState(path).epoch).toBe(0);
  });
});

describe('pre-activation access, refresh and code refusal', () => {
  it('refuses access and refresh after the epoch advance, and an old code after a reopen', async () => {
    const path = storePath();
    const before = new McpSessionStore(path, [KEY]);
    const legacyServer = server(before);
    const legacy = await connect(legacyServer);
    const pending = await consent(legacyServer);
    before.close();

    expect(advanceCredentialEpoch(path, Date.now(), true)).toMatchObject({ outcome: 'advanced' });

    const after = new McpSessionStore(path, [KEY]);
    try {
      const restarted = server(after, ACTIVATED_ONE);
      expect(await rejection(restarted.callerSessionFor(legacy.accessToken))).toBeInstanceOf(Error);
      expect(
        await rejection(restarted.bearerFor(legacy.sessionId, 'upstream-token', ['read'])),
      ).toBeInstanceOf(UpstreamRejected);
      const refreshed = await refreshGrant(restarted, legacy.clientId, legacy.refreshToken);
      expect(refreshed.status).toBe(400);
      expect(await refreshed.json()).toEqual({ error: 'invalid_grant' });
      // The code was issued before the restart; codes live only in the process that issued them.
      const exchanged = await exchangeCode(
        restarted,
        pending.clientId,
        pending.callback.searchParams.get('code') ?? '',
      );
      expect(exchanged.status).toBe(400);
      expect(await exchanged.json()).toEqual({ error: 'invalid_grant' });
      // A fresh consent at epoch 1 binds the organization and works.
      const fresh = await connect(restarted);
      expect((await restarted.callerSessionFor(fresh.accessToken)).mcpSessionId).toBe(
        fresh.sessionId,
      );
      expect(await restarted.bearerFor(fresh.sessionId, 'upstream-token', ['read'])).toBe(
        'signed-delegation',
      );
    } finally {
      after.close();
    }
  });

  it('forgets a code issued before a store reopen at the same epoch', async () => {
    const path = storePath();
    const before = new McpSessionStore(path, [KEY]);
    const pending = await consent(server(before));
    before.close();
    const after = new McpSessionStore(path, [KEY]);
    try {
      const exchanged = await exchangeCode(
        server(after),
        pending.clientId,
        pending.callback.searchParams.get('code') ?? '',
      );
      expect(exchanged.status).toBe(400);
      expect(await exchanged.json()).toEqual({ error: 'invalid_grant' });
    } finally {
      after.close();
    }
  });

  it('refuses an older-epoch session at every use', async () => {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    try {
      const oauth = server(store);
      const legacy = await connect(oauth);
      expect((await oauth.callerSessionFor(legacy.accessToken)).upstreamToken).toBe(
        'upstream-token',
      );
      raiseEpoch(path);
      expect(await rejection(oauth.callerSessionFor(legacy.accessToken))).toBeInstanceOf(Error);
      expect(await rejection(oauth.verify(legacy.accessToken))).toBeInstanceOf(Error);
      expect(
        await rejection(oauth.bearerFor(legacy.sessionId, 'upstream-token', ['read'])),
      ).toBeInstanceOf(UpstreamRejected);
    } finally {
      store.close();
    }
  });

  it('refuses an older-epoch refresh before any provider work', async () => {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    let providerRefreshes = 0;
    try {
      const oauth = server(store, undefined, {
        expiresIn: 60,
        refresh: () => {
          providerRefreshes += 1;
          return Promise.resolve({ accessToken: 'refreshed-upstream', expiresIn: 600 });
        },
      });
      const legacy = await connect(oauth);
      raiseEpoch(path);
      const refreshed = await refreshGrant(oauth, legacy.clientId, legacy.refreshToken);
      expect(refreshed.status).toBe(400);
      expect(await refreshed.json()).toEqual({ error: 'invalid_grant' });
      expect(providerRefreshes).toBe(0);
    } finally {
      store.close();
    }
  });

  it('refuses a refresh whose epoch advanced during the provider refresh', async () => {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    let isAdvancing = false;
    try {
      const oauth = server(store, undefined, {
        expiresIn: 60,
        refresh: () => {
          if (isAdvancing) raiseEpoch(path);
          return Promise.resolve({ accessToken: 'refreshed-upstream', expiresIn: 600 });
        },
      });
      const legacy = await connect(oauth);
      isAdvancing = true;
      const refreshed = await refreshGrant(oauth, legacy.clientId, legacy.refreshToken);
      expect(refreshed.status).toBe(400);
      expect(await refreshed.json()).toEqual({ error: 'invalid_grant' });
    } finally {
      store.close();
    }
  });

  it('refuses a code issued before the epoch advanced', async () => {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    try {
      const oauth = server(store, ACTIVATED_ONE);
      const { clientId, callback } = await consent(oauth);
      raiseEpoch(path);
      const exchanged = await exchangeCode(
        oauth,
        clientId,
        callback.searchParams.get('code') ?? '',
      );
      expect(exchanged.status).toBe(400);
      expect(await exchanged.json()).toEqual({ error: 'invalid_grant' });
      expect(storeState(path).families).toBe(0);
    } finally {
      store.close();
    }
  });

  it('refuses an unbound consent between the epoch advance and activation', async () => {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    raiseEpoch(path);
    const store = new McpSessionStore(path, [KEY]);
    try {
      const { callback } = await consent(server(store, { kind: 'pre_activation' }));
      expect(callback.searchParams.get('error')).toBe('temporarily_unavailable');
      expect(callback.searchParams.get('code')).toBeNull();
    } finally {
      store.close();
    }
  });

  it('refuses consent without organization authority once another writer advanced the epoch', async () => {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    try {
      const oauth = server(store);
      raiseEpoch(path);
      const { callback } = await consent(oauth);
      expect(callback.searchParams.get('error')).toBe('temporarily_unavailable');
      expect(callback.searchParams.get('code')).toBeNull();
    } finally {
      store.close();
    }
  });

  it('never forwards a sessionless token after activation', async () => {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    const store = new McpSessionStore(path, [KEY]);
    try {
      const before = server(store, ACTIVATED_ONE);
      // Before activation a sessionless upstream caller keeps today's forwarding.
      expect(await before.bearerFor(null, 'upstream-token', ['read'])).toBe('upstream-token');
      raiseEpoch(path);
      expect(await rejection(before.bearerFor(null, 'upstream-token', ['read']))).toBeInstanceOf(
        Error,
      );
    } finally {
      store.close();
    }
  });

  it('keeps forwarding in gateway mode after activation', async () => {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    raiseEpoch(path);
    const store = new McpSessionStore(path, [KEY]);
    try {
      const gateway = server(store, ACTIVATED_ONE, {}, [], {
        ...CONFIG,
        MCP_AUTH_MODE: 'gateway',
        MCP_TRUSTED_GATEWAY: 'true',
      });
      // The gateway verified the token; mcp-01 forwards it as before (M11, M13).
      expect(await gateway.bearerFor(null, 'gateway-token', ['read'])).toBe('gateway-token');
    } finally {
      store.close();
    }
  });

  it('refuses to start at the activated epoch without organization authority', () => {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    raiseEpoch(path);
    const store = new McpSessionStore(path, [KEY]);
    try {
      expect(() => server(store)).toThrow(/needs INTERNAL_AUTH_SECRET/);
      expect(() => server(store, ACTIVATED_ONE)).not.toThrow();
    } finally {
      store.close();
    }
  });
});
