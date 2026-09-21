import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import { McpSessionStore } from './session-store';

const KEY = Buffer.alloc(32, 7);
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mcp-session-store-'));
  roots.push(root);
  const path = join(root, 'sessions.sqlite');
  const store = new McpSessionStore(path, [KEY]);
  const now = 1_000_000;
  store.createFamily(
    {
      familyId: 'family-1',
      clientId: 'client-1',
      subject: 'subject-1',
      scope: 'wbs:read',
      upstreamAccessToken: 'upstream-access-secret',
      upstreamRefreshToken: 'upstream-refresh-secret',
      upstreamExpiresAt: now + 60_000,
      idleExpiresAt: now + 120_000,
      absoluteExpiresAt: now + 240_000,
    },
    'session-1',
    now + 60_000,
    'mcp-refresh-secret',
  );
  return { now, path, store };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    for (const name of ['sessions.sqlite-wal', 'sessions.sqlite-shm', 'sessions.sqlite']) {
      const path = join(root, name);
      if (existsSync(path)) unlinkSync(path);
    }
    rmdirSync(root);
  }
});

describe('McpSessionStore', () => {
  // Proof: storing any credential without digesting or encrypting it makes its
  // byte sequence appear in the main database or WAL assertion below.
  it('persists only digests and authenticated ciphertext in the main file and WAL', () => {
    const { path, store } = fixture();
    const bytes = [
      readFileSync(path),
      ...(existsSync(`${path}-wal`) ? [readFileSync(`${path}-wal`)] : []),
    ];
    for (const body of bytes) {
      expect(body.includes(Buffer.from('upstream-access-secret'))).toBeFalse();
      expect(body.includes(Buffer.from('upstream-refresh-secret'))).toBeFalse();
      expect(body.includes(Buffer.from('mcp-refresh-secret'))).toBeFalse();
    }
    expect(store.familyForSession('session-1', 1_000_000)?.upstreamAccessToken).toBe(
      'upstream-access-secret',
    );
    store.close();
  });

  // Proof: accepting unreadable SQLite bytes lets this constructor return
  // instead of naming MCP_STORE_PATH as the corrupt startup boundary.
  it('fails startup for a corrupt store and names MCP_STORE_PATH', () => {
    const root = mkdtempSync(join(tmpdir(), 'mcp-session-store-'));
    roots.push(root);
    const path = join(root, 'sessions.sqlite');
    writeFileSync(path, 'not a sqlite database');
    expect(() => new McpSessionStore(path, [KEY])).toThrow(/MCP_STORE_PATH.*corrupt/);
  });

  it('survives a process-style close and reopen', () => {
    const { now, path, store } = fixture();
    store.close();
    const reopened = new McpSessionStore(path, [KEY]);
    expect(reopened.familyForSession('session-1', now)?.subject).toBe('subject-1');
    reopened.close();
  });

  // Proof: removing the consumed-token reuse branch leaves session-1 live.
  it('revokes every family session when a consumed refresh token is reused', () => {
    const { now, store } = fixture();
    expect(
      store.consumeRefresh(
        'mcp-refresh-secret',
        'client-1',
        'successor',
        'session-2',
        now + 60_000,
        now + 120_000,
        now,
      ).outcome,
    ).toBe('ok');
    expect(
      store.consumeRefresh(
        'mcp-refresh-secret',
        'client-1',
        'other',
        'session-3',
        now + 60_000,
        now + 120_000,
        now,
      ).outcome,
    ).toBe('reuse');
    expect(store.familyForSession('session-1', now)).toBeNull();
    expect(store.familyForSession('session-2', now)).toBeNull();
    store.close();
  });

  // Proof: checking reuse before client binding lets another client revoke
  // the rightful client's entire family with an already-consumed token.
  it('checks client binding before replay revocation', () => {
    const { now, store } = fixture();
    expect(
      store.consumeRefresh(
        'mcp-refresh-secret',
        'client-1',
        'successor',
        'session-2',
        now + 60_000,
        now + 120_000,
        now,
      ).outcome,
    ).toBe('ok');
    expect(
      store.consumeRefresh(
        'mcp-refresh-secret',
        'client-2',
        'unused',
        'session-3',
        now + 60_000,
        now + 120_000,
        now,
      ).outcome,
    ).toBe('invalid');
    expect(store.familyForSession('session-2', now)?.familyId).toBe('family-1');
    store.close();
  });

  // Proof: decrypting inside consumeRefresh's transaction rolls this revocation
  // back with the thrown authentication error.
  it('commits revocation when consume finds tampered ciphertext', () => {
    const { now, path, store } = fixture();
    const db = new Database(path);
    const row = db.query('SELECT upstream_access_ct AS value FROM mcp_family').get() as {
      value: Uint8Array;
    };
    const tampered = Buffer.from(row.value);
    tampered[0] = 99;
    db.query('UPDATE mcp_family SET upstream_access_ct = ?').run(tampered);
    db.close();
    expect(() =>
      store.consumeRefresh(
        'mcp-refresh-secret',
        'client-1',
        'successor',
        'session-2',
        now + 60_000,
        now + 120_000,
        now,
      ),
    ).toThrow(/authenticated decryption/);
    const inspect = new Database(path);
    expect(
      (inspect.query('SELECT revoked_at FROM mcp_family').get() as { revoked_at: number | null })
        .revoked_at,
    ).not.toBeNull();
    inspect.close();
    store.close();
  });

  // Proof: replacing the compare-and-swap UPDATE with an unconditional update
  // makes both connections acquire the lease.
  it('lets exactly one of two connections acquire an upstream refresh lease', () => {
    const { now, path, store } = fixture();
    const other = new McpSessionStore(path, [KEY]);
    const attempts = [
      { owner: 'owner-a', store },
      { owner: 'owner-b', store: other },
    ].map(({ owner, store: connection }) => ({
      connection,
      owner,
      lease: connection.acquireRefreshLease('family-1', 0, owner, now, now + 5_000),
    }));
    let providerCalls = 0;
    for (const attempt of attempts) {
      if (attempt.lease === null) continue;
      providerCalls += 1;
      expect(
        attempt.connection.finishRefreshLease(
          'family-1',
          attempt.owner,
          'refreshed-access',
          'rotated-refresh',
          now + 300_000,
          now,
        ),
      ).toBeTrue();
    }
    expect(providerCalls).toBe(1);
    expect(other.family('family-1')?.upstreamAccessToken).toBe('refreshed-access');
    other.close();
    store.close();
  });

  // Proof: skipping version/AES-GCM authentication returns attacker-modified
  // provider credentials instead of revoking the family.
  it('revokes a family when ciphertext is tampered or has an unknown version', () => {
    const { now, path, store } = fixture();
    const db = new Database(path);
    const row = db.query('SELECT upstream_access_ct AS value FROM mcp_family').get() as {
      value: Uint8Array;
    };
    const tampered = Buffer.from(row.value);
    tampered[0] = 99;
    db.query('UPDATE mcp_family SET upstream_access_ct = ?').run(tampered);
    db.close();
    expect(() => store.familyForSession('session-1', now)).toThrow(/authenticated decryption/);
    const inspect = new Database(path);
    expect(
      (inspect.query('SELECT revoked_at FROM mcp_family').get() as { revoked_at: number | null })
        .revoked_at,
    ).not.toBeNull();
    expect(
      (inspect.query('SELECT COUNT(*) AS count FROM mcp_session').get() as { count: number }).count,
    ).toBe(0);
    inspect.close();
    store.close();
  });
});
