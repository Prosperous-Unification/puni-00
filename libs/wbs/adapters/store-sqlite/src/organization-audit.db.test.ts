import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { ProjectRepository } from './project';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const FREEZE = '20260927200000_freeze_organization_ownership';
const wrote: WriteStamp = { at: 1, by: 'ada' };

/**
 * `20260927220000_add_organization_audit` and the audited recovery write
 * (task 3.7): the table's own constraints, its rollback refusal, and the
 * recheck and audit record inside `recoverInOrganization`'s transaction.
 */
describe('the organization audit', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-organization-audit-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    raw((sqlite) =>
      sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"),
    );
    const db = openDrizzle(path);
    for (const id of ['ada', 'sam']) {
      await new UserRepository(db, OPEN).create(
        { id, username: id, passwordHash: 'x', createdAt: 1 },
        wrote,
      );
    }
    await new ProjectRepository(db, OPEN).createInOrganization(
      projectRow({ id: 'p1', name: 'Plan', ownerId: 'ada', restricted: true }),
      [],
      wrote,
      'org-a',
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function raw<T>(use: (db: ReturnType<typeof openDatabase>) => T): T {
    const db = openDatabase(path);
    try {
      return use(db);
    } finally {
      db.close();
    }
  }

  const insert = (action: string, kind: string, organizationId = 'org-a') =>
    raw((db) =>
      db.run(
        'INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [crypto.randomUUID(), organizationId, 'sam', action, kind, 'p1', '{}'],
      ),
    );

  it('refuses an unknown action or subject kind', () => {
    expect(() => insert('something_else', 'project')).toThrow();
    expect(() => insert('restricted_project_recovery', 'person')).toThrow();
    expect(() => insert('restricted_project_recovery', 'project')).not.toThrow();
  });

  it('refuses a record of no organization', () => {
    raw((db) => db.run('PRAGMA foreign_keys = ON'));
    expect(() => insert('restricted_project_recovery', 'project', 'org-nowhere')).toThrow();
  });

  it('refuses to roll back over a recorded act', () => {
    insert('restricted_project_recovery', 'project');
    expect(() => rollbackTo(path, FOLDER, FREEZE)).toThrow();
    expect(raw((db) => db.query('SELECT COUNT(*) AS n FROM organization_audit').get())).toEqual({
      n: 1,
    });
  });

  it('rolls back while nothing is recorded', () => {
    expect(rollbackTo(path, FOLDER, FREEZE)).toEqual(['20260927220000_add_organization_audit']);
  });

  it("refuses a recovery by an actor who is not the organization's super-admin", async () => {
    raw((db) =>
      db.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'sam', 'admin', 1)",
      ),
    );
    const projects = new ProjectRepository(openDrizzle(path), OPEN);
    expect(
      await projects.recoverInOrganization('p1', { name: 'Taken' }, wrote, 'org-a', {
        auditId: 'a1',
        actorId: 'sam',
      }),
    ).toBe('forbidden');
    expect(raw((db) => db.query('SELECT name FROM project').get())).toEqual({ name: 'Plan' });
    expect(raw((db) => db.query('SELECT COUNT(*) AS n FROM organization_audit').get())).toEqual({
      n: 0,
    });
  });
});
