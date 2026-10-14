import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { StepBlockageRepository } from './step-blockage';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let connection: Connection;
let blockages: StepBlockageRepository;
const stamp = { at: 10, by: 'u' };

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-blockage-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  activateTestStepBlockages(path);
  connection = openConnection(path);
  connection.db.run(
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
  );
  connection.db.run(
    "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1),('foreign','Foreign','u',0,1)",
  );
  connection.db.run(
    "INSERT INTO step (id,project_id,name,position) VALUES ('dev','p','Dev',1),('qa','p','QA',2),('foreign','foreign','Other',1)",
  );
  connection.db.run(
    "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('a','p','A',1,0),('b','p','B',2,0)",
  );
  blockages = new StepBlockageRepository(connection.db, OPEN);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

const set = (workItemId: string, stepId: string, blockedAt = 100) =>
  blockages.set({ workItemId, stepId, blockedAt }, stamp);

describe('StepBlockageRepository', () => {
  it('reads sparse facts in step order and persists audit/revision updates', async () => {
    expect(await blockages.listByProject('p')).toEqual([]);
    expect(await set('a', 'qa')).toBe('written');
    await set('a', 'dev', 90);
    await set('b', 'dev', 80);
    expect(await blockages.listByProject('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', blockedAt: 90 },
      { workItemId: 'a', stepId: 'qa', blockedAt: 100 },
      { workItemId: 'b', stepId: 'dev', blockedAt: 80 },
    ]);
    expect(await blockages.listByWorkItems('p', ['b'])).toEqual([
      { workItemId: 'b', stepId: 'dev', blockedAt: 80 },
    ]);
    expect(await blockages.listByWorkItems('p', [])).toEqual([]);
    expect(await blockages.listByProject('foreign')).toEqual([]);
    await blockages.set({ workItemId: 'a', stepId: 'dev', blockedAt: 95 }, { at: 20, by: 'u' });
    expect(
      connection.db.get<{ created_at: number; updated_at: number; created_by: string }>(
        "SELECT created_at,updated_at,created_by FROM step_blockage WHERE work_item_id='a' AND step_id='dev'",
      ),
    ).toEqual({ created_at: 10, updated_at: 20, created_by: 'u' });
    expect(
      connection.db.get<{ revision: number }>("SELECT revision FROM work_item WHERE id='a'"),
    ).toEqual({
      revision: 3,
    });
  });

  it('removes only one pair and moves all facts with their timestamps', async () => {
    await set('a', 'dev', 1);
    await set('a', 'qa', 2);
    await set('b', 'dev', 3);
    await blockages.remove('a', 'dev', stamp);
    expect(await blockages.listByProject('p')).toEqual([
      { workItemId: 'a', stepId: 'qa', blockedAt: 2 },
      { workItemId: 'b', stepId: 'dev', blockedAt: 3 },
    ]);
    await blockages.moveAll('a', 'b', stamp);
    expect(await blockages.listByProject('p')).toEqual([
      { workItemId: 'b', stepId: 'dev', blockedAt: 3 },
      { workItemId: 'b', stepId: 'qa', blockedAt: 2 },
    ]);
    const before = connection.db.get<{ revision: number }>(
      "SELECT revision FROM work_item WHERE id='a'",
    );
    await blockages.moveAll('a', 'b', stamp);
    expect(
      connection.db.get<{ revision: number }>("SELECT revision FROM work_item WHERE id='a'"),
    ).toEqual(before);
  });

  it('refuses a colliding transfer atomically, preserving facts and revisions', async () => {
    await set('a', 'dev', 1);
    await set('a', 'qa', 2);
    await set('b', 'qa', 3);
    const before = await blockages.listByProject('p');
    const revisions = connection.db.all('SELECT id,revision FROM work_item ORDER BY id');
    expect(blockages.moveAll('a', 'b', stamp)).rejects.toThrow();
    expect(await blockages.listByProject('p')).toEqual(before);
    expect(connection.db.all('SELECT id,revision FROM work_item ORDER BY id')).toEqual(revisions);
  });

  it('refuses fractional writes and malformed stored timestamp reads', async () => {
    expect(set('a', 'dev', 1.5)).rejects.toThrow(/invalid blocked time/);
    await set('a', 'dev');
    connection.db.run('PRAGMA ignore_check_constraints = ON');
    connection.db.run('UPDATE step_blockage SET blocked_at = 1.5');
    expect(blockages.listByProject('p')).rejects.toThrow(/invalid blocked time/);
    expect(blockages.listByWorkItems('p', ['a'])).rejects.toThrow(/invalid blocked time/);
  });

  it('refuses corrupted owner/step membership and parent-owned facts on reads', async () => {
    await set('a', 'dev');
    connection.db.run('DROP TRIGGER step_blockage_owner_update');
    connection.db.run("UPDATE step_blockage SET step_id='foreign'");
    expect(blockages.listByProject('p')).rejects.toThrow(/invalid step reference/);
    connection.db.run("UPDATE step_blockage SET step_id='dev'");
    connection.db.run(
      "INSERT INTO work_item (id,project_id,parent_id,name,position,revision) VALUES ('child','p','a','Child',1,0)",
    );
    expect(blockages.listByProject('p')).rejects.toThrow(/not a leaf/);
  });

  it('refuses missing trusted owner and step references on reads', async () => {
    await set('a', 'dev');
    connection.db.run('DROP TRIGGER step_blockage_owner_update');
    connection.db.run('PRAGMA foreign_keys = OFF');
    connection.db.run("UPDATE step_blockage SET step_id='gone'");
    expect(blockages.listByProject('p')).rejects.toThrow(/invalid step reference/);
    connection.db.run("UPDATE step_blockage SET step_id='dev'");
    connection.db.run("DELETE FROM work_item WHERE id='a'");
    expect(blockages.listByProject('p')).rejects.toThrow(/invalid work-item reference/);
  });

  it('reports an unknown step and does not invent an absent owner', async () => {
    expect(await set('a', 'gone')).toBe('unknown_step');
    expect(set('gone', 'dev')).rejects.toThrow();
  });
});
