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
    expect(rollbackTo(path, FOLDER, FREEZE)).toEqual([
      '20260929210000_add_shared_people_audit',
      '20260929200000_add_shared_people',
      '20260929180000_add_project_rank',
      '20260929100000_add_spaces',
      '20260928200000_add_work_item_status_facts',
      '20260928040000_add_email_challenge',
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
      '20260928010000_add_project_solution',
      '20260927220000_add_organization_audit',
      '20260927213000_add_typed_dependency',
    ]);
  });

  const member = (userId: string, role: string) =>
    raw((db) =>
      db.run(
        'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
        ['org-a', userId, role],
      ),
    );
  const edit = (actorId: string, name: string) =>
    new ProjectRepository(openDrizzle(path), OPEN).editInOrganization(
      'p1',
      { name },
      { at: 2, by: actorId },
      'org-a',
      { actorId, auditId: crypto.randomUUID() },
    );
  const state = () =>
    raw((db) => ({
      project: db.query('SELECT name, revision FROM project').get(),
      audits: db.query('SELECT actor_id, detail FROM organization_audit').all(),
    }));

  it('refuses an actor who is no longer a writing member', async () => {
    member('sam', 'viewer');
    const before = state();
    expect(await edit('sam', 'Taken')).toBe('forbidden');
    expect(await edit('nobody', 'Taken')).toBe('forbidden');
    expect(state()).toEqual(before);
  });

  it('refuses a non-creator admin of a restricted project', async () => {
    member('sam', 'admin');
    const before = state();
    expect(await edit('sam', 'Taken')).toBe('forbidden');
    expect(state()).toEqual(before);
  });

  it('audits a recovery the project became after the request read it', async () => {
    member('sam', 'super_admin');
    // The caller read the project while unrestricted; it is restricted now.
    expect(await edit('sam', 'Recovered')).toMatchObject({ name: 'Recovered', ownerId: 'ada' });
    expect(state().audits).toEqual([{ actor_id: 'sam', detail: '{"fields":["name"]}' }]);
  });

  it("writes the creator's own edit and an unrestricted project's edit without a record", async () => {
    member('ada', 'member');
    member('sam', 'super_admin');
    expect(await edit('ada', 'Mine')).toMatchObject({ name: 'Mine' });
    raw((db) => db.run('UPDATE project SET restricted = 0'));
    expect(await edit('sam', 'Open')).toMatchObject({ name: 'Open' });
    expect(state().audits).toEqual([]);
  });

  it('rolls the edit back when its audit record cannot be written', async () => {
    member('sam', 'super_admin');
    raw((db) =>
      db.run(
        "CREATE TRIGGER audit_refused BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit refused'); END",
      ),
    );
    const before = state();
    let failure: unknown;
    try {
      await edit('sam', 'Recovered');
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain('Failed query: insert into "organization_audit"');
    expect(state()).toEqual(before);
  });

  it('answers a project of another organization as absent, before any permission', async () => {
    raw((db) => {
      db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
    });
    member('sam', 'viewer');
    const answer = await new ProjectRepository(openDrizzle(path), OPEN).editInOrganization(
      'p1',
      { name: 'Taken' },
      { at: 2, by: 'sam' },
      'org-b',
      { actorId: 'sam', auditId: 'a1' },
    );
    expect(answer).toBeNull();
  });

  describe('admitting a write inside the unit of work', () => {
    const admit = (actorId: string, organizationId = 'org-a') =>
      new ProjectRepository(openDrizzle(path), OPEN).admitEditInOrganization(
        'p1',
        organizationId,
        actorId,
        { commands: ['patchWorkItem'] },
      );

    it('records one recovery by a super-admin of a restricted project, keeping its creator', async () => {
      member('sam', 'super_admin');
      expect(await admit('sam')).toBe('recovery');
      expect(state()).toEqual({
        project: { name: 'Plan', revision: 0 },
        audits: [{ actor_id: 'sam', detail: '{"commands":["patchWorkItem"]}' }],
      });
    });

    it('admits the creator and an unrestricted project without a record', async () => {
      member('ada', 'member');
      member('sam', 'member');
      expect(await admit('ada')).toBe('ordinary');
      raw((db) => db.run('UPDATE project SET restricted = 0'));
      expect(await admit('sam')).toBe('ordinary');
      expect(state().audits).toEqual([]);
    });

    it('refuses a viewer, a non-creator admin and a non-member, recording nothing', async () => {
      member('ada', 'viewer');
      member('sam', 'admin');
      expect(await admit('ada')).toBe('forbidden');
      expect(await admit('sam')).toBe('forbidden');
      expect(await admit('nobody')).toBe('forbidden');
      expect(state().audits).toEqual([]);
    });

    it('answers a project of another organization as absent, before any permission', async () => {
      raw((db) => {
        db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
      });
      member('sam', 'viewer');
      expect(await admit('sam', 'org-b')).toBeNull();
    });

    // Proof: skipping `recordRecovery` in `admitEditInOrganization` made the
    // first case of this block receive no audit (and this one resolve);
    // watched 2026-09-28.
    it('fails when its audit record cannot be written', async () => {
      member('sam', 'super_admin');
      raw((db) =>
        db.run(
          "CREATE TRIGGER audit_refused BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit refused'); END",
        ),
      );
      const failure = await admit('sam').then(
        () => null,
        (error: unknown) => error,
      );
      expect(String(failure)).toContain('Failed query: insert into "organization_audit"');
      expect(state().audits).toEqual([]);
    });
  });
});
