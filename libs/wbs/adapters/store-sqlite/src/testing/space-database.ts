import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { projectRow } from '@wbs/store-memory/project-fixture';

import { openDatabase, openDrizzle } from '../db';
import { OPEN } from '../gate';
import { runMigrations } from '../migrate';
import { ProjectRepository } from '../project';
import { UserRepository } from '../user';

export const MIGRATIONS_FOLDER = new URL(
  '../../../../../../apps/wbs/be-01/drizzle',
  import.meta.url,
).pathname;
const wrote: WriteStamp = { at: 1, by: 'ada' };

/**
 * Opens a migrated database holding organizations `org-a` (projects `a1`–`a4`)
 * and `org-b` (`b1`), authored by `ada`.
 */
export async function openSpaceDatabase(dir: string): Promise<string> {
  const path = join(dir, 'test.db');
  runMigrations(path, MIGRATIONS_FOLDER);
  const setup = openDatabase(path);
  try {
    setup.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
    setup.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
  } finally {
    setup.close();
  }
  const db = openDrizzle(path);
  await new UserRepository(db, OPEN).create(
    { id: 'ada', username: 'ada', passwordHash: 'x', createdAt: 1 },
    wrote,
  );
  const projects = new ProjectRepository(db, OPEN);
  for (const [id, organizationId] of [
    ['a1', 'org-a'],
    ['a2', 'org-a'],
    ['a3', 'org-a'],
    ['a4', 'org-a'],
    ['b1', 'org-b'],
  ] as const) {
    await projects.createInOrganization(
      projectRow({ id, name: id, ownerId: 'ada' }),
      [],
      wrote,
      organizationId,
    );
  }
  return path;
}
