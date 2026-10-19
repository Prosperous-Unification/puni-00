import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openConnection } from '@wbs/store-sqlite/db';
import { DirectoryRepository } from '@wbs/store-sqlite/directory';
import { OPEN } from '@wbs/store-sqlite/gate';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const ISSUER = 'https://puni.eu.auth0.com/';
const FLEET = 'claire-m2m@clients';

let root: string;
let dbPath: string;

beforeEach(() => {
  seedStore(true);
});

/** A migrated store with two accounts, Dany's own sign-in and three agent persons. */
function seedStore(activated: boolean): void {
  root = mkdtempSync(join(tmpdir(), 'wbs-link-credential-'));
  dbPath = join(root, 'plan.db');
  runMigrations(dbPath, join(APP_ROOT, 'drizzle'));
  if (activated)
    sql(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  sql(
    `INSERT INTO users (id, username, password_hash, created_at, idp_issuer, idp_sub)
     VALUES ('dany-id', 'dany', NULL, 1, '${ISSUER}', 'google-oauth2|dany'),
            ('kat-id', 'kat', 'x', 1, NULL, NULL)`,
  );
  sql(
    `INSERT INTO external_identity (id, user_id, issuer, subject, created_at)
     VALUES ('dany-sign-in', 'dany-id', '${ISSUER}', 'google-oauth2|dany', 1)`,
  );
  sql(
    `INSERT INTO person (id, name, kind, account_id) VALUES
       ('claire', 'Claire', 'agent', 'dany-id'),
       ('loose', 'Loose', 'agent', NULL),
       ('kats-agent', 'Kat''s agent', 'agent', 'kat-id')`,
  );
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function sql(statement: string): void {
  const connection = openConnection(dbPath);
  try {
    connection.db.run(statement);
  } finally {
    connection.close();
  }
}

interface IdentityRow {
  user_id: string;
  issuer: string;
  subject: string;
  person_id: string | null;
  created_by: string | null;
}

/** Every credential row, every account and every membership: what a refusal must leave alone. */
function storeState(): { identities: IdentityRow[]; users: number; memberships: number } {
  const connection = openConnection(dbPath);
  try {
    return {
      identities: connection.db.all<IdentityRow>(
        'SELECT user_id, issuer, subject, person_id, created_by FROM external_identity ORDER BY subject',
      ),
      users: connection.db.get<{ n: number }>('SELECT count(*) AS n FROM users').n,
      memberships: connection.db.get<{ n: number }>(
        'SELECT count(*) AS n FROM organization_membership',
      ).n,
    };
  } finally {
    connection.close();
  }
}

async function cli(...args: string[]) {
  const child = Bun.spawn(
    [process.execPath, 'run', join(APP_ROOT, 'src', 'link-credential-cli.ts'), ...args],
    { cwd: APP_ROOT, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

const link = (...extra: string[]) =>
  cli(`--issuer=${ISSUER}`, `--subject=${FLEET}`, '--account=dany', ...extra);

async function pinOf(subject: string): Promise<string | null> {
  const connection = openConnection(dbPath);
  try {
    return await new DirectoryRepository(connection.db, OPEN).credentialPinOf(ISSUER, subject);
  } finally {
    connection.close();
  }
}

describe('link-credential-cli', () => {
  it('links a pair to an existing account pinned to its person, printing the row', async () => {
    const before = storeState();
    const linked = await link('--person=claire');

    expect(linked.stderr).toBe('');
    expect(linked.exitCode).toBe(0);
    expect(JSON.parse(linked.stdout)).toMatchObject({
      kind: 'linked',
      account: { id: 'dany-id', username: 'dany' },
      pair: { issuer: ISSUER, subject: FLEET },
      personId: 'claire',
    });
    const after = storeState();
    expect(after.identities).toContainEqual({
      user_id: 'dany-id',
      issuer: ISSUER,
      subject: FLEET,
      person_id: 'claire',
      created_by: 'dany-id',
    });
    // No account and no membership is created.
    expect([after.users, after.memberships]).toEqual([before.users, before.memberships]);
    expect(await pinOf(FLEET)).toBe('claire');
    expect(await pinOf('google-oauth2|dany')).toBeNull();
  }, 30_000);

  it('links an unpinned pair to an account named by its id, the --name value form', async () => {
    const linked = await cli('--issuer', ISSUER, '--subject', FLEET, '--account', 'dany-id');
    expect(linked.exitCode).toBe(0);
    expect(storeState().identities.find(({ subject }) => subject === FLEET)).toEqual({
      user_id: 'dany-id',
      issuer: ISSUER,
      subject: FLEET,
      person_id: null,
      created_by: 'dany-id',
    });
    expect(await pinOf(FLEET)).toBeNull();
  }, 30_000);

  it('refuses a second link of the same pair, naming the account', async () => {
    expect((await link('--person=claire')).exitCode).toBe(0);
    const linked = storeState();

    for (const account of ['dany', 'kat']) {
      const again = await cli(`--issuer=${ISSUER}`, `--subject=${FLEET}`, `--account=${account}`);
      expect(again.exitCode).not.toBe(0);
      expect(again.stderr).toContain(`is already linked to account dany (dany-id)`);
    }
    expect(storeState()).toEqual(linked);
  }, 30_000);

  it('refuses an account nobody holds, writing nothing', async () => {
    const before = storeState();
    const refused = await cli(`--issuer=${ISSUER}`, `--subject=${FLEET}`, '--account=nobody');
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('no account has the id or username nobody');
    expect(storeState()).toEqual(before);
  }, 30_000);

  it('refuses pinning to a person bound to another account or to none', async () => {
    const before = storeState();
    for (const [personId, says] of [
      ['kats-agent', 'person kats-agent is bound to account kat-id, not to dany'],
      ['loose', 'person loose is bound to no account, not to dany'],
      ['nobody', 'no person has the id nobody'],
    ] as const) {
      const refused = await link(`--person=${personId}`);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain(says);
    }
    expect(storeState()).toEqual(before);
  }, 30_000);

  it('refuses before organization activation, when logins would not read the link', async () => {
    rmSync(root, { recursive: true, force: true });
    seedStore(false);
    const before = storeState();
    const refused = await link('--person=claire');
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('organization isolation is not activated');
    expect(storeState()).toEqual(before);
  }, 30_000);

  it('unlinks the pair and leaves the account’s other credentials', async () => {
    expect((await link('--person=claire')).exitCode).toBe(0);
    const unlinked = await cli('--unlink', `--issuer=${ISSUER}`, `--subject=${FLEET}`);
    expect(unlinked.exitCode).toBe(0);
    expect(JSON.parse(unlinked.stdout)).toMatchObject({
      kind: 'unlinked',
      account: { id: 'dany-id' },
      personId: 'claire',
    });
    expect(storeState().identities.map(({ user_id, subject }) => ({ user_id, subject }))).toEqual([
      { user_id: 'dany-id', subject: 'google-oauth2|dany' },
    ]);

    const again = await cli('--unlink', `--issuer=${ISSUER}`, `--subject=${FLEET}`);
    expect(again.exitCode).not.toBe(0);
    expect(again.stderr).toContain('is not linked to any account');
  }, 30_000);

  it('refuses unlinking the account’s own sign-in', async () => {
    const before = storeState();
    const refused = await cli('--unlink', `--issuer=${ISSUER}`, '--subject=google-oauth2|dany');
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('is the sign-in of account dany (dany-id) itself');
    expect(storeState()).toEqual(before);
  }, 30_000);

  it('refuses malformed arguments and an absent store before writing anything', async () => {
    const before = storeState();
    for (const args of [
      [`--subject=${FLEET}`, '--account=dany'],
      [`--issuer=${ISSUER}`, `--subject=${FLEET}`],
      [`--issuer=${ISSUER}`, `--subject=${FLEET}`, '--account=dany', '--account=kat'],
      ['--unlink', `--issuer=${ISSUER}`, `--subject=${FLEET}`, '--account=dany'],
      [`--issuer=${ISSUER}`, `--subject=${FLEET}`, '--account=dany', '--role=admin'],
    ]) {
      const refused = await cli(...args);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('usage: link-credential-cli.ts');
    }
    expect(storeState()).toEqual(before);

    const absent = Bun.spawn(
      [process.execPath, 'run', join(APP_ROOT, 'src', 'link-credential-cli.ts')].concat([
        `--issuer=${ISSUER}`,
        `--subject=${FLEET}`,
        '--account=dany',
      ]),
      {
        cwd: APP_ROOT,
        env: { ...process.env, DB_PATH: join(root, 'absent.db') },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(await absent.exited).not.toBe(0);
  }, 60_000);
});
