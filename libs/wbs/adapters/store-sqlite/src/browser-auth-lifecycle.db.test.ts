import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VerifiedOrganizationCredential } from '@wbs/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { BrowserLifecycleRefusedError, SqliteBrowserAuthLifecycle } from './browser-auth-lifecycle';
import { SqliteBrowserCredentialRevocations } from './browser-credential-revocations';
import { openConnection, openReadOnlyConnection } from './db';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const PREVIOUS = '20261001010000_add_browser_credential_revocations';
const first: VerifiedOrganizationCredential = {
  kind: 'oidc',
  userId: 'ada',
  digest: 'a'.repeat(64),
  expiresAt: 2_000_000_000_000,
};
const second: VerifiedOrganizationCredential = { ...first, digest: 'b'.repeat(64) };
let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-browser-lifecycle-'));
  path = join(folder, 'test.db');
  runMigrations(path, MIGRATIONS);
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

async function failureOf(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
    return null;
  } catch (cause) {
    return cause;
  }
}

test('open, replace and historical close are durable across connections', async () => {
  const firstConnection = openConnection(path);
  const secondConnection = openConnection(path);
  try {
    const writer = new SqliteBrowserAuthLifecycle(firstConnection.db, new WriteCoordinator());
    const closer = new SqliteBrowserAuthLifecycle(secondConnection.db, new WriteCoordinator());
    const revoked = new SqliteBrowserCredentialRevocations(
      secondConnection.db,
      new WriteCoordinator(),
    );
    expect(await writer.open('opaque-session', first)).toBe(1);
    expect(await closer.generation('opaque-session')).toEqual({ generation: 1, current: first });
    await closer.proveAssociation('opaque-session', { kind: 'oidc', digest: first.digest });
    expect(await writer.replace('opaque-session', 1, first, second, 1234)).toBe(2);
    expect(await revoked.isRevoked(first)).toBe(true);
    expect(await revoked.isRevoked(second)).toBe(false);
    expect(await closer.close('opaque-session', { kind: 'oidc', digest: first.digest }, 1235)).toBe(
      'closed',
    );
    expect(await revoked.isRevoked(second)).toBe(true);
    expect(await closer.close('opaque-session', { kind: 'oidc', digest: first.digest }, 9999)).toBe(
      'already_closed',
    );
    expect(await failureOf(() => closer.generation('opaque-session'))).toBeInstanceOf(Error);
    const lifecycleRows = firstConnection.db.all<{ session_digest: string }>(
      sql`SELECT session_digest FROM browser_auth_lifecycle`,
    );
    expect(lifecycleRows).toHaveLength(1);
    expect(lifecycleRows[0].session_digest).toMatch(/^[0-9a-f]{64}$/);
  } finally {
    firstConnection.close();
    secondConnection.close();
  }
});

test('generation CAS loses after closure or another replacement without revoking unrelated credentials', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    const revoked = new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator());
    const third = { ...first, digest: 'c'.repeat(64) };
    const independent = { ...first, digest: 'd'.repeat(64) };
    await lifecycle.open('one', first);
    await lifecycle.open('independent', independent);
    expect(
      await failureOf(() =>
        lifecycle.proveAssociation('independent', { kind: 'oidc', digest: first.digest }),
      ),
    ).toBeInstanceOf(BrowserLifecycleRefusedError);
    expect(await lifecycle.replace('one', 1, first, second, 2)).toBe(2);
    expect(await failureOf(() => lifecycle.replace('one', 1, first, third, 3))).toBeInstanceOf(
      Error,
    );
    expect(await revoked.isRevoked(third)).toBe(false);
    expect(await lifecycle.close('one', { kind: 'oidc', digest: first.digest }, 4)).toBe('closed');
    expect(await failureOf(() => lifecycle.replace('one', 2, second, third, 5))).toBeInstanceOf(
      Error,
    );
    expect(await revoked.isRevoked(independent)).toBe(false);
    expect(
      await failureOf(() =>
        lifecycle.close('independent', { kind: 'oidc', digest: first.digest }, 6),
      ),
    ).toBeInstanceOf(Error);
    expect(await lifecycle.generation('independent')).toEqual({
      generation: 1,
      current: independent,
    });
  } finally {
    connection.close();
  }
});

test('two Bun processes capturing one generation publish exactly one successor', async () => {
  const seed = openConnection(path);
  try {
    await new SqliteBrowserAuthLifecycle(seed.db, new WriteCoordinator()).open('one', first);
  } finally {
    seed.close();
  }
  const racer = new URL('./testing/browser-lifecycle-racer.ts', import.meta.url).pathname;
  const children = [second.digest, 'c'.repeat(64)].map((digest) =>
    Bun.spawn({
      cmd: [process.execPath, racer, path, digest],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    }),
  );
  try {
    const readers = await Promise.all(
      children.map(async (child) => {
        const reader = child.stdout.getReader();
        const ready = await reader.read();
        expect(new TextDecoder().decode(ready.value)).toBe('ready\n');
        return reader;
      }),
    );
    await Promise.all(
      children.map(async (child) => {
        await child.stdin.write('go\n');
        await child.stdin.flush();
      }),
    );
    const outcomes = await Promise.all(
      children.map(async (child, index) => {
        const [exitCode, outcome, stderr] = await Promise.all([
          child.exited,
          readers[index].read(),
          new Response(child.stderr).text(),
        ]);
        expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
        return new TextDecoder().decode(outcome.value).trim();
      }),
    );
    expect(outcomes.sort()).toEqual(['lost', 'won']);
    const connection = openConnection(path);
    try {
      expect(
        connection.db.all<{ generation: number }>(
          sql`SELECT generation FROM browser_auth_lifecycle`,
        ),
      ).toEqual([{ generation: 2 }]);
      expect(connection.db.all(sql`SELECT * FROM browser_auth_association`)).toHaveLength(2);
      expect(connection.db.all(sql`SELECT * FROM browser_credential_revocations`)).toHaveLength(1);
    } finally {
      connection.close();
    }
  } finally {
    for (const child of children) child.kill();
  }
}, 30_000);

test('identical bytes and foreign user cannot become a successor', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    const revoked = new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
    expect(await failureOf(() => lifecycle.replace('one', 1, first, first, 2))).toBeInstanceOf(
      BrowserLifecycleRefusedError,
    );
    expect(
      await failureOf(() => lifecycle.replace('one', 1, first, { ...second, userId: 'bob' }, 2)),
    ).toBeInstanceOf(BrowserLifecycleRefusedError);
    expect(await lifecycle.generation('one')).toEqual({ generation: 1, current: first });
    expect(await revoked.isRevoked(first)).toBe(false);
  } finally {
    connection.close();
  }
});

test('replace refuses a predecessor independently revoked through B1', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    const revoked = new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
    await revoked.revoke(first, 1);
    expect(await failureOf(() => lifecycle.generation('one'))).toBeInstanceOf(
      BrowserLifecycleRefusedError,
    );
    expect(await failureOf(() => lifecycle.replace('one', 1, first, second, 2))).toBeInstanceOf(
      BrowserLifecycleRefusedError,
    );
    expect(await revoked.isRevoked(second)).toBe(false);
    expect(connection.db.all(sql`SELECT * FROM browser_auth_association`)).toHaveLength(1);
  } finally {
    connection.close();
  }
});

test('corrupt matching B1 revocation is a storage fault, not stale authentication', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    const revoked = new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
    await revoked.revoke(first, 1);
    connection.db.run(sql`PRAGMA ignore_check_constraints = ON`);
    connection.db.run(sql`UPDATE browser_credential_revocations SET revoked_at = 0.5`);
    const replaceFault = await failureOf(() => lifecycle.replace('one', 1, first, second, 2));
    expect(replaceFault).toBeInstanceOf(Error);
    expect(replaceFault).not.toBeInstanceOf(BrowserLifecycleRefusedError);
    const readFault = await failureOf(() => lifecycle.generation('one'));
    expect(readFault).toBeInstanceOf(Error);
    expect(readFault).not.toBeInstanceOf(BrowserLifecycleRefusedError);
  } finally {
    connection.close();
  }
});

test('open and successor replacement refuse valid previously revoked bytes', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    const revoked = new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator());
    await revoked.revoke(first, 1);
    expect(await failureOf(() => lifecycle.open('one', first))).toBeInstanceOf(
      BrowserLifecycleRefusedError,
    );
    await lifecycle.open('one', second);
    const third = { ...first, digest: 'c'.repeat(64) };
    await revoked.revoke(third, 2);
    expect(await failureOf(() => lifecycle.replace('one', 1, second, third, 3))).toBeInstanceOf(
      BrowserLifecycleRefusedError,
    );
    expect(await lifecycle.generation('one')).toEqual({ generation: 1, current: second });
  } finally {
    connection.close();
  }
});

test('close refuses malformed historical expiry and impossible generation', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
    await lifecycle.replace('one', 1, first, second, 1);
    connection.db.run(sql`PRAGMA ignore_check_constraints = ON`);
    connection.db.run(sql`UPDATE browser_auth_association SET expires_at = -1
      WHERE credential_digest = ${first.digest}`);
    const malformedExpiry = await failureOf(() =>
      lifecycle.close('one', { kind: 'oidc', digest: first.digest }, 2),
    );
    expect(malformedExpiry).toBeInstanceOf(Error);
    expect(malformedExpiry).not.toBeInstanceOf(BrowserLifecycleRefusedError);
    const malformedProof = await failureOf(() =>
      lifecycle.proveAssociation('one', { kind: 'oidc', digest: first.digest }),
    );
    expect(malformedProof).toBeInstanceOf(Error);
    expect(malformedProof).not.toBeInstanceOf(BrowserLifecycleRefusedError);
    connection.db.run(sql`UPDATE browser_auth_association SET expires_at = ${first.expiresAt},
      generation = 99 WHERE credential_digest = ${first.digest}`);
    const impossibleGeneration = await failureOf(() =>
      lifecycle.close('one', { kind: 'oidc', digest: first.digest }, 2),
    );
    expect(impossibleGeneration).toBeInstanceOf(Error);
    expect(impossibleGeneration).not.toBeInstanceOf(BrowserLifecycleRefusedError);
    connection.db.run(sql`PRAGMA ignore_check_constraints = OFF`);
    expect(await lifecycle.generation('one')).toEqual({ generation: 2, current: second });
  } finally {
    connection.close();
  }
});

test('already-closed retry still reads B1 revocation authority', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
    await lifecycle.close('one', { kind: 'oidc', digest: first.digest }, 1);
    connection.db.run(sql`DROP TABLE browser_credential_revocations`);
    expect(
      await failureOf(() => lifecycle.close('one', { kind: 'oidc', digest: first.digest }, 2)),
    ).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
});

test('missing authority and failed writes throw without acknowledging a transition', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
    connection.db.run(sql`DROP TABLE browser_auth_association`);
    expect(await failureOf(() => lifecycle.generation('one'))).toBeInstanceOf(Error);
    expect(
      await failureOf(() => lifecycle.close('one', { kind: 'oidc', digest: first.digest }, 2)),
    ).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
  const readOnly = openReadOnlyConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(readOnly.db, new WriteCoordinator());
    expect(await failureOf(() => lifecycle.open('two', second))).toBeInstanceOf(Error);
  } finally {
    readOnly.close();
  }
});

test('absent correlation is typed refusal while malformed stored state is a server fault', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    expect(await failureOf(() => lifecycle.generation('absent'))).toBeInstanceOf(
      BrowserLifecycleRefusedError,
    );
    await lifecycle.open('one', first);
    connection.db.run(sql`PRAGMA ignore_check_constraints = ON`);
    connection.db.run(sql`UPDATE browser_auth_lifecycle SET state = 'nonsense'`);
    const fault = await failureOf(() => lifecycle.generation('one'));
    expect(fault).toBeInstanceOf(Error);
    expect(fault).not.toBeInstanceOf(BrowserLifecycleRefusedError);
  } finally {
    connection.close();
  }
});

test('rollback refuses retained lifecycle and association rows', async () => {
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    await lifecycle.open('one', first);
  } finally {
    connection.close();
  }
  expect(() => rollbackTo(path, MIGRATIONS, PREVIOUS)).toThrow();
  const retained = openConnection(path);
  try {
    expect(retained.db.all(sql`SELECT * FROM browser_auth_lifecycle`)).toHaveLength(1);
  } finally {
    retained.close();
  }
});

test('rollback independently refuses lifecycle-only and association-only residue', async () => {
  for (const retainedTable of ['browser_auth_lifecycle', 'browser_auth_association'] as const) {
    const dbPath = join(folder, `${retainedTable}.db`);
    runMigrations(dbPath, MIGRATIONS);
    const connection = openConnection(dbPath);
    try {
      const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
      await lifecycle.open(retainedTable, first);
      if (retainedTable === 'browser_auth_lifecycle') {
        connection.db.run(sql`DELETE FROM browser_auth_association`);
      } else {
        connection.db.run(sql`PRAGMA foreign_keys = OFF`);
        connection.db.run(sql`DELETE FROM browser_auth_lifecycle`);
      }
    } finally {
      connection.close();
    }
    expect(() => rollbackTo(dbPath, MIGRATIONS, PREVIOUS)).toThrow();
    const retained = openConnection(dbPath);
    try {
      expect(retained.db.all(sql`SELECT * FROM ${sql.raw(retainedTable)}`)).toHaveLength(1);
      expect(
        retained.db.all<{ name: string }>(
          sql`SELECT name FROM __drizzle_migrations WHERE name = '20261001020000_add_browser_auth_lifecycle'`,
        ),
      ).toHaveLength(1);
    } finally {
      retained.close();
    }
  }
});

test('rollback removes both empty lifecycle tables and their migration ledger entry', () => {
  expect(rollbackTo(path, MIGRATIONS, PREVIOUS)).toEqual([
    '20261001020000_add_browser_auth_lifecycle',
  ]);
  const connection = openConnection(path);
  try {
    expect(
      connection.db.all<{ name: string }>(sql`SELECT name FROM sqlite_master
        WHERE name IN ('browser_auth_lifecycle', 'browser_auth_association')`),
    ).toEqual([]);
  } finally {
    connection.close();
  }
});
