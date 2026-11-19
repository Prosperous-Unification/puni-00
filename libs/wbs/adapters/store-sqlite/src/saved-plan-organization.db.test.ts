import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import type { SavedPlanWrite } from './saved-plan';
import { SavedPlanRepository } from './saved-plan';
import { UserRepository } from './user';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const wrote: WriteStamp = { at: 1, by: 'owner' };

const record = (id: string): SavedPlanWrite => ({
  id,
  workPackageId: 'p1',
  name: id,
  createdBy: 'Ada Lovelace',
  createdById: null,
  createdAt: 1_756_000_123,
  input: { schemaVersion: 1, bytes: '{"schemaVersion":1}', sha256: 'a'.repeat(64) },
  schedule: { present: false, absentReason: 'pending' },
});

/**
 * The saved plan's organization mapping, written by the save itself (task
 * 3.6). Before activation the bridge trigger maps it; after activation the
 * save does, and refuses to store a plan whose work package has no owner.
 */
describe('a saved plan belongs to its work package’s organization', () => {
  let dir: string;
  let path: string;
  let birthAudit: readonly unknown[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-organization-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const seed = openConnection(path);
    const sqlite = openDatabase(path);
    try {
      sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1)");
      sqlite.run(
        "INSERT INTO project(id,organization_id,name,created_at) VALUES('parent-a','org-a','Parent A',1)",
      );
      await new UserRepository(seed.db, OPEN).create(
        { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
        wrote,
      );
      sqlite.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','owner','member',1)",
      );
      const created = await new WorkPackageRepository(seed.db, OPEN).createInOrganization(
        workPackageRow({ id: 'p1', name: 'Rewire the shed', projectId: 'parent-a' }),
        [],
        wrote,
        'org-a',
        { id: 'birth-grant', auditId: 'birth-audit' },
      );
      if (typeof created === 'string') throw Error('fixture birth refused: ' + created);
      expect(
        sqlite.query('SELECT id,scope_id,subject_id,role_id,origin FROM access_grant').all(),
      ).toEqual([
        {
          id: 'birth-grant',
          scope_id: 'p1',
          subject_id: 'owner',
          role_id: 'package-manager',
          origin: 'creation',
        },
      ]);
      expect(
        sqlite
          .query('SELECT id,actor_id,action,subject_id,created_at FROM organization_audit')
          .all(),
      ).toEqual([
        {
          id: 'birth-audit',
          actor_id: 'owner',
          action: 'access_granted',
          subject_id: 'birth-grant',
          created_at: 1,
        },
      ]);
      birthAudit = sqlite.query('SELECT * FROM organization_audit').all();
    } finally {
      sqlite.close();
      seed.close();
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const raw = () => openDatabase(path);
  const plans = () => new SavedPlanRepository({ openConnection: () => openConnection(path) });
  function removePackageMapping() {
    const db = raw();
    try {
      const selected: unknown = db
        .query<{ sql: unknown }, [string]>(
          "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
        )
        .get('work_package_organization_frozen_delete');
      if (
        typeof selected !== 'object' ||
        selected === null ||
        !('sql' in selected) ||
        typeof selected.sql !== 'string'
      )
        throw Error('fixture mapping trigger absent');
      const original = selected.sql;
      const failures: unknown[] = [];
      try {
        db.run('DROP TRIGGER work_package_organization_frozen_delete');
        db.run("DELETE FROM work_package_organization WHERE resource_id='p1'");
      } catch (failure: unknown) {
        failures.push(failure);
      }
      try {
        db.run(original);
        expect(
          db
            .query("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?")
            .get('work_package_organization_frozen_delete'),
        ).toEqual({ sql: original });
      } catch (failure: unknown) {
        failures.push(failure);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, 'fixture corruption and trigger restoration failed', {
          cause: failures[0],
        });
      expect(
        db.query("SELECT resource_id FROM work_package_organization WHERE resource_id='p1'").all(),
      ).toEqual([]);
    } finally {
      db.close();
    }
  }
  const activate = () => {
    const db = raw();
    db.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
    db.close();
  };
  const rows = (table: string) => {
    const db = raw();
    const found = db.query(`SELECT * FROM ${table}`).all();
    db.close();
    return found;
  };

  it("maps a plan saved after activation to its work package's organization", async () => {
    const db = raw();
    db.close();
    activate();
    expect(await plans().write(record('sp-1'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    expect(rows('saved_plan_organization')).toEqual([
      { resource_id: 'sp-1', organization_id: 'org-a' },
    ]);
  });

  it('refuses a save after activation for a work package without an owner', async () => {
    removePackageMapping();
    activate();
    let refused: unknown;
    try {
      await plans().write(record('sp-1'), () => Promise.resolve(null));
    } catch (error) {
      refused = error;
    }
    expect(String(refused)).toContain('has no organization after activation');
    expect(rows('saved_plan')).toEqual([]);
    expect(rows('saved_plan_organization')).toEqual([]);
  });

  it('saves an unmapped work package before activation, as the outgoing release does', async () => {
    removePackageMapping();
    expect(await plans().write(record('sp-1'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    expect(rows('saved_plan_organization')).toEqual([]);
  });

  it('refuses restricted save and touch without a named grant despite organization administration', async () => {
    const db = raw();
    db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('sam', 'sam', 'x', 1)",
    );
    db.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'sam', 'super_admin', 1)",
    );
    db.run("UPDATE work_package SET restricted = 1 WHERE id = 'p1'");
    db.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('sam-org','org-a','organization','org-a','user','sam','org-super-admin','route',1)",
    );
    db.close();
    activate();
    const scope = {
      principal: { id: 'sam' },
      organizationId: 'org-a',
      actorId: 'sam',
      role: 'member' as const,
    };
    expect(
      await plans().write(record('outside'), () => Promise.resolve(null), {
        ...scope,
        operation: 'save',
      }),
    ).toEqual({ outcome: 'forbidden', permission: 'package.write' });
    expect(rows('saved_plan')).toEqual([]);
    expect(await plans().write(record('original'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    const before = rows('saved_plan');
    expect(
      await plans().renameTo('original', 'Outside', { ...scope, operation: 'rename' }),
    ).toEqual({ outcome: 'forbidden', permission: 'package.write' });
    expect(await plans().deleteOf('original', { ...scope, operation: 'delete' })).toEqual({
      outcome: 'forbidden',
      permission: 'package.write',
    });
    expect(rows('saved_plan')).toEqual(before);
    expect(rows('organization_audit')).toEqual([...birthAudit]);
  });

  it('reclassifies a removed actor inside the saved-plan save transaction', async () => {
    const db = raw();
    db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('sam', 'sam', 'x', 1)",
    );
    db.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'sam', 'super_admin', 1)",
    );
    db.run('UPDATE work_package SET restricted = 1 WHERE id = ?', ['p1']);
    db.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('sam-package','org-a','work_package','p1','user','sam','package-manager','route',1)",
    );
    db.run("DELETE FROM organization_membership WHERE user_id = 'sam'");
    db.close();
    activate();
    expect(
      await plans().write(record('sp-1'), () => Promise.resolve(null), {
        principal: { id: 'sam' },
        organizationId: 'org-a',
        actorId: 'sam',

        operation: 'save',
      }),
    ).toEqual({ outcome: 'not_found' });
    expect(rows('saved_plan')).toEqual([]);
    expect(rows('organization_audit')).toEqual([...birthAudit]);
    expect(await plans().write(record('sp-0'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    expect(
      await plans().renameTo('sp-0', 'No', {
        principal: { id: 'sam' },
        organizationId: 'org-a',
        actorId: 'sam',

        operation: 'rename',
      }),
    ).toBe('no_such_plan');
    expect(rows('saved_plan')).toMatchObject([{ id: 'sp-0', name: 'sp-0' }]);
  });

  it('refuses a scoped touch whose operation disagrees with the write', async () => {
    let failure: unknown;
    try {
      await plans().renameTo('sp-1', 'Renamed', {
        principal: { id: 'owner' },
        organizationId: 'org-a',
        actorId: 'owner',

        operation: 'delete',
      });
    } catch (caught) {
      failure = caught;
    }
    expect(String(failure)).toContain(
      'saved-plan touch operation or actor disagrees with its authorization',
    );
    expect(rows('saved_plan')).toEqual([]);
  });
});
