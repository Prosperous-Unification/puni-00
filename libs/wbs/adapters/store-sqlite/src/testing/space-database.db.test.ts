import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { openDatabase } from '../db';
import { openSpaceDatabase } from './space-database';

it('seeds explicit current parents and actual package creator grants while retaining preactivation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'current-space-database-'));
  try {
    const path = await openSpaceDatabase(directory),
      sqlite = openDatabase(path);
    try {
      expect(sqlite.query('SELECT state,activated_at FROM organization_activation').all()).toEqual([
        { state: 'pre_activation', activated_at: null },
      ]);
      expect(sqlite.query('SELECT id,organization_id FROM project ORDER BY id').all()).toEqual([
        { id: 'fixture-parent-org-a', organization_id: 'org-a' },
        { id: 'fixture-parent-org-b', organization_id: 'org-b' },
      ]);
      expect(
        sqlite.query('SELECT id,project_id,created_by FROM work_package ORDER BY id').all(),
      ).toEqual(
        ['a1', 'a2', 'a3', 'a4', 'b1'].map((id) => ({
          id,
          project_id: id === 'b1' ? 'fixture-parent-org-b' : 'fixture-parent-org-a',
          created_by: 'ada',
        })),
      );
      expect(
        sqlite
          .query(
            "SELECT scope_id,subject_id,role_id,origin FROM access_grant WHERE scope_kind='work_package' ORDER BY scope_id",
          )
          .all(),
      ).toEqual(
        ['a1', 'a2', 'a3', 'a4', 'b1'].map((scope_id) => ({
          scope_id,
          subject_id: 'ada',
          role_id: 'package-manager',
          origin: 'creation',
        })),
      );
      expect(
        sqlite
          .query(
            "SELECT actor_id,action,subject_kind FROM organization_audit WHERE action='access_granted'",
          )
          .all(),
      ).toEqual(
        Array.from({ length: 5 }, () => ({
          actor_id: 'ada',
          action: 'access_granted',
          subject_kind: 'access_grant',
        })),
      );
    } finally {
      sqlite.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
