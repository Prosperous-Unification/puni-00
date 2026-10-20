import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ClaimRepository } from './claim';
import { type Connection, openConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { runMigrations } from './migrate';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let connection: Connection;
let store: ClaimRepository;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-db-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, folder);
  connection = openConnection(path);
  for (const statement of [
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','u','x',1)",
    "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1),('q','Other','u',0,1)",
    "INSERT INTO step (id,project_id,name,position) VALUES ('dev','p','Dev',1),('qa','p','QA',2),('foreign','q','Foreign',1)",
    "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('root','p','Root',1,0),('free','p','Free',2,0)",
    "INSERT INTO work_item (id,project_id,parent_id,name,position,revision) VALUES ('leaf','p','root','Leaf',1,0)",
    "INSERT INTO person (id,name) VALUES ('claire','claire'),('worker','worker')",
  ])
    connection.db.run(statement);
  store = new ClaimRepository(connection.db, OPEN);
});

afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

const insert = (
  id: string,
  workItem: string,
  step: string | null,
  extra: { run?: string | null; parent?: string | null; person?: string } = {},
) =>
  connection.db.run(
    sql`INSERT INTO claim (id,work_item_id,step_id,person_id,run_id,parent_claim_id,created_by) VALUES (${id},${workItem},${step},${extra.person ?? 'claire'},${extra.run ?? null},${extra.parent ?? null},'u')`,
  );
/** The database's own message under drizzle's query wrapper. */
function causeOf(write: () => unknown): string {
  try {
    write();
  } catch (error) {
    return error instanceof Error ? String(error.cause) : String(error);
  }
  throw new Error('the write did not throw');
}
const ids = () =>
  connection.db.all<{ id: string }>('SELECT id FROM claim ORDER BY id').map(({ id }) => id);

// Proof (migration.sql): each clause below removed from a copy of the migration
// made its named case here stop throwing; watched 2026-10-19.
describe('the claim table', () => {
  it('holds one claim per step of a work item', () => {
    insert('a', 'leaf', 'dev');
    expect(() => insert('b', 'leaf', 'dev')).toThrow();
    insert('c', 'leaf', 'qa');
  });

  it('holds one subtree claim per work item, nulls notwithstanding', () => {
    insert('a', 'root', null);
    expect(() => insert('b', 'root', null)).toThrow();
  });

  it('bounds the run to 1 to 256 characters', () => {
    insert('a', 'leaf', 'dev', { run: 'r'.repeat(256) });
    expect(() => insert('b', 'leaf', 'qa', { run: 'r'.repeat(257) })).toThrow();
    expect(() => insert('c', 'leaf', 'qa', { run: '' })).toThrow();
  });

  it('refuses a step of another project, on insert and on update', () => {
    expect(causeOf(() => insert('a', 'leaf', 'foreign'))).toContain('claim step project mismatch');
    insert('b', 'leaf', 'dev');
    expect(
      causeOf(() => connection.db.run("UPDATE claim SET step_id='foreign' WHERE id='b'")),
    ).toContain('claim step project mismatch');
  });

  it('refuses a claim that is its own parent', () => {
    expect(() => insert('a', 'leaf', 'dev', { parent: 'a' })).toThrow();
  });

  it('cascades a deleted work item and a released parent to their delegated claims', () => {
    insert('parent', 'root', null);
    insert('child', 'leaf', 'dev', { parent: 'parent', person: 'worker' });
    insert('free', 'free', 'dev');
    connection.db.run("DELETE FROM claim WHERE id='parent'");
    expect(ids()).toEqual(['free']);
    connection.db.run("DELETE FROM work_item WHERE id='free'");
    expect(ids()).toEqual([]);
  });
});

describe('ClaimRepository', () => {
  it('refuses a stored claim with no writing account', async () => {
    insert('a', 'leaf', 'dev');
    connection.db.run("UPDATE claim SET created_by=NULL WHERE id='a'");
    expect(await failureOf(store.listByProject('p'))).toContain('claim a has no writing account');
  });

  it('refuses a stamped read of a claim with no write instant', async () => {
    insert('a', 'leaf', 'dev');
    connection.db.run("UPDATE claim SET created_at=NULL WHERE id='a'");
    expect(await failureOf(store.listStampedByProject('p'))).toContain(
      'claim a has no write instant',
    );
    // The unstamped reads the claim rules use do not need the instant.
    expect(await store.listByProject('p')).toHaveLength(1);
  });

  it('answers the write instant of each claim', async () => {
    const claim = {
      id: 'a',
      workItemId: 'leaf',
      stepId: 'dev',
      personId: 'claire',
      runId: null,
      parentClaimId: null,
      accountId: 'u',
    };
    expect(await store.add([claim], [], { at: 7, by: 'u' })).toBe('written');
    expect(await store.listStampedByProject('p')).toEqual([{ ...claim, claimedAt: 7 }]);
  });

  it('writes the claim as its claimant’s account, whoever applies it', async () => {
    connection.db.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('admin','admin','x',1)",
    );
    const claim = {
      id: 'a',
      workItemId: 'leaf',
      stepId: 'dev',
      personId: 'claire',
      runId: null,
      parentClaimId: null,
      accountId: 'u',
    };
    expect(
      await store.add([claim], [{ workItemId: 'leaf', stepId: 'dev' }], { at: 5, by: 'admin' }),
    ).toBe('written');
    expect(await store.listByProject('p')).toEqual([claim]);
    expect(
      connection.db.get<{ revision: number }>("SELECT revision FROM work_item WHERE id='leaf'"),
    ).toEqual({ revision: 1 });
    expect(
      connection.db.get<{ state: string; stated_at: number }>(
        "SELECT state, stated_at FROM step_progress WHERE work_item_id='leaf' AND step_id='dev'",
      ),
    ).toEqual({ state: 'in_progress', stated_at: 5 });
  });

  it('removes delegated claims with their parent, and refuses a claim no longer stored', async () => {
    insert('parent', 'root', null);
    insert('child', 'leaf', 'dev', { parent: 'parent', person: 'worker' });
    const parent = (await store.listByProject('p')).find(({ id }) => id === 'parent');
    if (parent === undefined) throw new Error('the seeded claim is absent');
    await store.remove([parent], [], { at: 5, by: 'u' });
    expect(ids()).toEqual([]);
    expect(await failureOf(store.remove([parent], [], { at: 6, by: 'u' }))).toContain(
      'a claim to remove is not stored',
    );
  });

  // Proof: with `removePerson` reading the person's own claims alone, the
  // worker's leaf kept revision 0; watched 2026-10-20.
  it('moves the revision of a delegated claim’s work item when its superagent is removed', async () => {
    insert('parent', 'root', null);
    insert('child', 'leaf', 'dev', { parent: 'parent', person: 'worker' });
    const revisionOf = (id: string) =>
      connection.db.get<{ revision: number }>(sql`SELECT revision FROM work_item WHERE id = ${id}`)
        .revision;
    const removed = await new DirectoryRepository(connection.db, OPEN).removePerson(
      'claire',
      true,
      { at: 5, by: 'u' },
    );
    expect(removed).toMatchObject({ ok: true });
    expect(ids()).toEqual([]);
    expect(revisionOf('leaf')).toBe(1);
    expect(revisionOf('root')).toBe(1);
    expect(revisionOf('free')).toBe(0);
  });

  // Proof: the repository's identity reads answering null (slice 1's interim
  // port) failed the bound and pinned expectations here (watched 2026-10-20).
  it('reads the binding and the credential pin the directory holds', async () => {
    connection.db.run("UPDATE person SET account_id = 'u' WHERE id = 'claire'");
    connection.db.run(
      "INSERT INTO external_identity (id,user_id,issuer,subject,person_id,created_at) VALUES ('fleet','u','https://idp.test','m2m','claire',1)",
    );
    expect(await store.boundAccountOf('claire')).toBe('u');
    expect(await store.boundAccountOf('worker')).toBeNull();
    expect(await store.pinnedPersonOf({ issuer: 'https://idp.test', subject: 'm2m' })).toBe(
      'claire',
    );
    expect(await store.pinnedPersonOf({ issuer: 'https://idp.test', subject: 'other' })).toBeNull();
    expect(await store.pinnedPersonOf(null)).toBeNull();
  });
});

/** What a promise rejected with, as text; throws when it resolved. */
async function failureOf(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    return String(error);
  }
  throw new Error('the promise resolved');
}
