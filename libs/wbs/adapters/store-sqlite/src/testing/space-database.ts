import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';

import { openExistingConnection } from '../db';
import { OPEN } from '../gate';
import { runMigrations } from '../migrate';
import { UserRepository } from '../user';
import { WorkPackageRepository } from '../work-package';

export const MIGRATIONS_FOLDER = new URL(
  '../../../../../../apps/wbs/be-01/drizzle',
  import.meta.url,
).pathname;
const wrote: WriteStamp = { at: 1, by: 'ada' };

/**
 * Opens a migrated database holding organizations `org-a` (work packages `a1`–`a4`)
 * and `org-b` (`b1`), authored by `ada`, with an explicit fixture parent per
 * organization. Preactivation is retained for mode/rollback callers. Trusted
 * raw creation seeds real member grants; it does not claim request admission.
 * Its one seeding connection closes after every repository operation settles;
 * a paired operation/close failure retains both original unknown values.
 */
export async function openSpaceDatabase(dir: string): Promise<string> {
  const path = join(dir, 'test.db');
  runMigrations(path, MIGRATIONS_FOLDER);
  const connection = openExistingConnection(path);
  const db = connection.db;
  try {
    db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
    db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
    await new UserRepository(db, OPEN).create(
      { id: 'ada', username: 'ada', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    db.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1),('org-b','ada','member',1)",
    );
    db.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('fixture-parent-org-a','org-a','Fixture A',1,'ada'),('fixture-parent-org-b','org-b','Fixture B',1,'ada')",
    );
    const workPackages = new WorkPackageRepository(db, OPEN);
    for (const [id, organizationId, projectId] of [
      ['a1', 'org-a', 'fixture-parent-org-a'],
      ['a2', 'org-a', 'fixture-parent-org-a'],
      ['a3', 'org-a', 'fixture-parent-org-a'],
      ['a4', 'org-a', 'fixture-parent-org-a'],
      ['b1', 'org-b', 'fixture-parent-org-b'],
    ] as const) {
      await workPackages.createInOrganization(
        workPackageRow({ id, name: id, projectId }),
        [],
        wrote,
        organizationId,
        { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
      );
    }
  } catch (primary: unknown) {
    try {
      connection.close();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'space database seed and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
  connection.close();
  return path;
}
