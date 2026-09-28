import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openReadOnlyConnection } from './db';
import { runMigrations } from './migrate';
import { previewOrganizationSelection } from './organization-selection-preview';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

/** The read-only dry run of task 2.4's organization selection. */
describe('previewOrganizationSelection', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-selection-preview-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDatabase(path);
    try {
      for (const id of ['u-none', 'u-one', 'u-two']) {
        db.run('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, 1)', [
          id,
          id,
          'x',
        ]);
      }
      db.run(
        "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
      );
      for (const [org, user, role] of [
        ['org-a', 'u-one', 'member'],
        ['org-a', 'u-two', 'super_admin'],
        ['org-b', 'u-two', 'viewer'],
      ]) {
        db.run(
          'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
          [org, user, role],
        );
      }
      db.run('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const preview = () => {
    const connection = openReadOnlyConnection(path);
    try {
      return previewOrganizationSelection(connection.db);
    } finally {
      connection.close();
    }
  };

  it('reports zero, one and several memberships, choosing for nobody', () => {
    expect(preview()).toEqual({
      marker: 'pre_activation',
      users: [
        { userId: 'u-none', status: 'onboarding_required' },
        {
          userId: 'u-one',
          status: 'selection_required',
          candidates: [{ organizationId: 'org-a', role: 'member' }],
        },
        {
          userId: 'u-two',
          status: 'selection_required',
          candidates: [
            { organizationId: 'org-a', role: 'super_admin' },
            { organizationId: 'org-b', role: 'viewer' },
          ],
        },
      ],
    });
  });

  it('leaves the database file byte for byte as it was', () => {
    const before = readFileSync(path);
    preview();
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it('fails on a missing file and on a broken marker', () => {
    expect(() => openReadOnlyConnection(join(dir, 'absent.db'))).toThrow();
    const db = openDatabase(path);
    try {
      db.run('DROP TRIGGER organization_activation_no_delete');
      db.run('DELETE FROM organization_activation');
    } finally {
      db.close();
    }
    expect(() => preview()).toThrow();
  });

  it('fails on a malformed membership role', () => {
    const db = openDatabase(path);
    try {
      // The column's CHECK would refuse it; corrupt trusted state is the point.
      db.run('PRAGMA ignore_check_constraints = ON');
      db.run("UPDATE organization_membership SET role = 'owner' WHERE user_id = 'u-one'");
    } finally {
      db.close();
    }
    expect(() => preview()).toThrow('malformed role');
  });
});
