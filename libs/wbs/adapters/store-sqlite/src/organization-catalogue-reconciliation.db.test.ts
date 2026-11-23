import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { openExistingConnection } from './db';
import { preflightOrganizationOwnership } from './organization-ownership-preflight';
import { openSpaceDatabase } from './testing/space-database';

test('current ownership preflight accepts shared steps and reports missing package values, foreign definitions and foreign event aliases', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-catalogue-preflight-'));
  try {
    const path = await openSpaceDatabase(directory);
    const connection = openExistingConnection(path);
    try {
      const db = connection.db;
      db.run(
        "INSERT INTO work_item(id,work_package_id,name,position,revision) VALUES('one','a1','One',1,0),('two','a2','Two',1,0)",
      );
      db.run(
        "INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES ('shared','org-a','shared','Shared','workdays',0,1,'organization','org-a','authored'),('foreign','org-b','other','Other','workdays',0,1,'organization','org-b','authored')",
      );
      db.run(
        "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES('a1','shared','workdays',0,0),('a2','shared','workdays',0,0),('b1','foreign','workdays',0,0)",
      );
      db.run(
        "INSERT INTO actual(work_item_id,step_id,days,recorded_at) VALUES('one','shared',1,1),('two','shared',1,1)",
      );
      expect((await preflightOrganizationOwnership(db)).ownershipConflicts).toEqual([]);
      db.run("DELETE FROM work_package_step WHERE work_package_id='a2' AND step_id='shared'");
      // Model a damaged explicit pair which purports to authorize another organization’s definition.
      const trigger = db.get<{ sql: string } | undefined>(
        "SELECT sql FROM sqlite_schema WHERE name='work_package_step_scope_insert'",
      );
      if (!trigger) throw new Error('missing package step scope trigger');
      db.run('DROP TRIGGER work_package_step_scope_insert');
      db.run(
        "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES('a1','foreign','workdays',0,0)",
      );
      db.run(trigger.sql);
      db.run(
        "INSERT INTO actual(work_item_id,step_id,days,recorded_at) VALUES('one','foreign',1,1)",
      );
      db.run(
        "INSERT INTO step_identity_history(old_step_id,step_id,merged_at) VALUES('old-foreign','foreign',2)",
      );
      db.run(
        "INSERT INTO plan_event(id,work_package_id,user_id,kind,label,step_id,before,after,created_at) VALUES('foreign-event','a1','ada','test','Test','old-foreign','{}','{}',2),('deleted-event','a1','ada','test','Test','deleted','{}','{}',3)",
      );
      expect((await preflightOrganizationOwnership(db)).ownershipConflicts).toEqual([
        { kind: 'actual_step', id: 'one/foreign' },
        { kind: 'actual_step', id: 'two/shared' },
        { kind: 'plan_event_subject', id: 'foreign-event' },
      ]);
    } finally {
      connection.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
