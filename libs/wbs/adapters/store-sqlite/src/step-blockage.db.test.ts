import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { type Connection, openConnection } from './db';
import { OPEN } from './gate';
import { openSqliteSource } from './source';
import { StepBlockageRepository } from './step-blockage';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedLegacyPackageParent, seedPackageParent } from './testing/legacy-package-parent';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

let directory: string;
let path: string;
let connection: Connection;
let opened: Connection | undefined;
let custody = { hasUnknownOwner: false };
let blockages: StepBlockageRepository;
const stamp = { at: 10, by: 'u' };

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-step-blockage-'));
  path = join(directory, 'plan.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  activateTestStepBlockages(path);
  seedLegacyPackageParent(path, 'org', 'project');
  seedPackageParent(path, 'org', 'other-project');
  custody.hasUnknownOwner = true;
  connection = openConnection(path);
  opened = connection;
  custody.hasUnknownOwner = false;
  connection.db.run(
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
  );
  connection.db.run(
    "INSERT INTO work_package (id,project_id,name,created_by,revision,created_at) VALUES ('p','project','Plan','u',0,1),('foreign','other-project','Foreign','u',0,1)",
  );
  expect(
    connection.db.all(
      'SELECT resource_id,organization_id FROM work_package_organization ORDER BY resource_id',
    ),
  ).toEqual([
    { resource_id: 'foreign', organization_id: 'org' },
    { resource_id: 'p', organization_id: 'org' },
  ]);
  for (const [id, name, project, workPackage, position] of [
    ['dev', 'Dev', 'project', 'p', 1],
    ['qa', 'QA', 'project', 'p', 2],
    ['foreign', 'Other', 'other-project', 'foreign', 1],
  ] as const) {
    connection.db.run(
      sql`INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES (${id},'org',${id},${name},'workdays',0,${position},'project',${project},'authored')`,
    );
    connection.db.run(
      sql`INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,position,origin) VALUES (${id + '-binding'},'org','project',${project},${id},${position},'authored')`,
    );
    connection.db.run(
      sql`INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES (${workPackage},${id},'workdays',0,0)`,
    );
  }
  connection.db.run(
    "INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES ('a','p','A',1,0),('b','p','B',2,0)",
  );
  blockages = new StepBlockageRepository(connection.db, OPEN);
});
afterEach(() => {
  opened?.close();
  opened = undefined;
  if (!custody.hasUnknownOwner) rmSync(directory, { recursive: true, force: true });
});

const set = (workItemId: string, stepId: string, blockedAt = 100) =>
  blockages.set({ workItemId, stepId, blockedAt }, stamp);

describe('StepBlockageRepository', () => {
  it('reads sparse facts in step order and persists audit/revision updates', async () => {
    expect(await blockages.listByWorkPackage('p')).toEqual([]);
    expect(await set('a', 'qa')).toBe('written');
    await set('a', 'dev', 90);
    await set('b', 'dev', 80);
    expect(await blockages.listByWorkPackage('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', blockedAt: 90 },
      { workItemId: 'a', stepId: 'qa', blockedAt: 100 },
      { workItemId: 'b', stepId: 'dev', blockedAt: 80 },
    ]);
    expect(await blockages.listByWorkItems('p', ['b'])).toEqual([
      { workItemId: 'b', stepId: 'dev', blockedAt: 80 },
    ]);
    expect(await blockages.listByWorkItems('p', [])).toEqual([]);
    expect(await blockages.listByWorkPackage('foreign')).toEqual([]);
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
    expect(await blockages.listByWorkPackage('p')).toEqual([
      { workItemId: 'a', stepId: 'qa', blockedAt: 2 },
      { workItemId: 'b', stepId: 'dev', blockedAt: 3 },
    ]);
    await blockages.moveAll('a', 'b', stamp);
    expect(await blockages.listByWorkPackage('p')).toEqual([
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
    const before = await blockages.listByWorkPackage('p');
    const revisions = connection.db.all('SELECT id,revision FROM work_item ORDER BY id');
    await rejects(blockages.moveAll('a', 'b', stamp));
    expect(await blockages.listByWorkPackage('p')).toEqual(before);
    expect(connection.db.all('SELECT id,revision FROM work_item ORDER BY id')).toEqual(revisions);
  });

  it('refuses fractional writes and malformed stored timestamp reads', async () => {
    await rejects(set('a', 'dev', 1.5), /invalid blocked time/);
    await set('a', 'dev');
    connection.db.run('PRAGMA ignore_check_constraints = ON');
    connection.db.run('UPDATE step_blockage SET blocked_at = 1.5');
    await rejects(blockages.listByWorkPackage('p'), /invalid blocked time/);
    await rejects(blockages.listByWorkItems('p', ['a']), /invalid blocked time/);
  });

  it('refuses corrupted owner/step membership and parent-owned facts on reads', async () => {
    await set('a', 'dev');
    connection.db.run('DROP TRIGGER step_blockage_owner_update');
    connection.db.run("UPDATE step_blockage SET step_id='foreign'");
    await rejects(
      blockages.listByWorkPackage('p'),
      /stored blockage is not leaf-resolved: step_not_resolved/,
    );
    connection.db.run("UPDATE step_blockage SET step_id='dev'");
    connection.db.run(
      "INSERT INTO work_item (id,work_package_id,parent_id,name,position,revision) VALUES ('child','p','a','Child',1,0)",
    );
    await rejects(blockages.listByWorkPackage('p'), /stored blockage names a parent work item/);
  });

  it('refuses missing trusted owner and step references on reads', async () => {
    await set('a', 'dev');
    connection.db.run('DROP TRIGGER step_blockage_owner_update');
    connection.db.run('PRAGMA foreign_keys = OFF');
    connection.db.run("UPDATE step_blockage SET step_id='gone'");
    await rejects(
      blockages.listByWorkPackage('p'),
      /stored blockage is not leaf-resolved: unknown_step/,
    );
    connection.db.run("UPDATE step_blockage SET step_id='dev'");
    connection.db.run("DELETE FROM work_item WHERE id='a'");
    await rejects(blockages.listByWorkPackage('p'), /invalid work-item reference/);
  });

  it('refuses unknown or unresolved steps through the Source without writing a blockage or revision', async () => {
    const source = openSqliteSource({
      dbPath: path,
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    });
    try {
      const write = (workItemId: string, stepId: string) =>
        source.stores.blockages.set({ workItemId, stepId, blockedAt: 10 }, stamp);
      const revisions = connection.db.all('SELECT id,revision FROM work_item ORDER BY id');
      expect(await write('a', 'gone')).toBe('unknown_step');
      expect(await write('a', 'foreign')).toBe('step_not_resolved');
      await rejects(write('gone', 'dev'), /step write work item is absent or inconsistent/);
      await rejects(write('gone', 'gone'), /step write work item is absent or inconsistent/);
      expect(connection.db.all('SELECT * FROM step_blockage')).toEqual([]);
      expect(connection.db.all('SELECT id,revision FROM work_item ORDER BY id')).toEqual(revisions);
      expect(await write('a', 'dev')).toBe('written');
      expect(await source.stores.blockages.listByWorkPackage('p')).toEqual([
        { workItemId: 'a', stepId: 'dev', blockedAt: 10 },
      ]);
    } finally {
      await source.close();
    }
  });
});
