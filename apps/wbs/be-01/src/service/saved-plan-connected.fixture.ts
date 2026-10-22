import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LivePlanRead } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { createLivePlanStore } from '@wbs/store-sqlite/chain-snapshot';
import { openDatabase, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';

/** Real migrated persistence fixture; the returned observation outlives every SQLite connection and file. */
export async function captureSavedConnectedFixture(
  mode: 'isolated' | 'shared',
): Promise<Extract<LivePlanRead, { kind: 'connected' }>> {
  const folder = mkdtempSync(join(tmpdir(), 'saved-connected-'));
  try {
    const path = await openSpaceDatabase(folder);
    seedDependencyAuthority(path);
    const client = openDatabase(path);
    try {
      client.run("UPDATE organization_activation SET state='activated', activated_at=1");
      client.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
      );
      client.run('UPDATE organization SET shared_people=? WHERE id=?', [
        mode === 'shared' ? 1 : 0,
        'org-a',
      ]);
      client.run(
        "UPDATE project SET estimate_rounding='exact',start_date='2026-10-05' WHERE id='a1'",
      );
      client.run(
        "UPDATE project SET estimate_rounding='exact',start_date='2026-10-06' WHERE id='a2'",
      );
      client.run(
        "INSERT INTO work_item(id,project_id,position,name,hold) VALUES('a','a1',10,'Alpha work',null),('h','a1',20,'Held cause','on_hold'),('b','a2',10,'Beta work',null)",
      );
      client.run(
        "INSERT INTO step(id,project_id,name,code,position) VALUES('design','a1','Design','design',10),('test','a1','Test','test',20),('build','a2','Build','build',10)",
      );
      client.run(
        "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('a','design',0.5,0.5,0.5),('a','test',1,1,1),('b','build',0.75,0.75,0.75)",
      );
      client.run(
        "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES('ab','org-a','a1','a2','a','b','node','node','design','build','FS'),('ba','org-a','a2','a1','b','a','node','node','build','test','FS'),('hb','org-a','a1','a2','h','b','whole','node',null,'build','FS')",
      );
    } finally {
      client.close();
    }
    const observed = await createLivePlanStore({
      kind: 'owned',
      openConnection: () => openReadOnlyConnection(path),
      schedulerOf: () => fastScheduler,
    }).read('a1', {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
    });
    if (observed.kind !== 'connected')
      throw new Error(`expected connected fixture, received ${observed.kind}`);
    return observed;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
