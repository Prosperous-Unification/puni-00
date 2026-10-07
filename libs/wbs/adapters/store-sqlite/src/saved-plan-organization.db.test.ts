import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import type { SavedPlanWrite } from './saved-plan';
import { SavedPlanRepository } from './saved-plan';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const wrote: WriteStamp = { at: 1, by: 'owner' };

const record = (id: string): SavedPlanWrite => ({
  id,
  projectId: 'p1',
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
 * save does, and refuses to store a plan whose project has no owner.
 */
describe('a saved plan belongs to its project’s organization', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-organization-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const seed = openConnection(path);
    await new UserRepository(seed.db, OPEN).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    await new ProjectRepository(seed.db, OPEN).create(
      projectRow({ id: 'p1', name: 'Rewire the shed', ownerId: 'owner' }),
      [],
      wrote,
    );
    seed.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const raw = () => openDatabase(path);
  const plans = () => new SavedPlanRepository({ openConnection: () => openConnection(path) });
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

  it("maps a plan saved after activation to its project's organization", async () => {
    const db = raw();
    db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
    db.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES ('p1', 'org-a')",
    );
    db.close();
    activate();
    expect(await plans().write(record('sp-1'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    expect(rows('saved_plan_organization')).toEqual([
      { resource_id: 'sp-1', organization_id: 'org-a' },
    ]);
  });

  it('refuses a save after activation for a project without an owner', async () => {
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

  it('saves an unmapped project before activation, as the outgoing release does', async () => {
    expect(await plans().write(record('sp-1'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    expect(rows('saved_plan_organization')).toEqual([]);
  });

  it('reclassifies a removed actor inside the saved-plan save transaction', async () => {
    const db = raw();
    db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('sam', 'sam', 'x', 1)",
    );
    db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
    db.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES ('p1', 'org-a')",
    );
    db.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'sam', 'super_admin', 1)",
    );
    db.run('UPDATE project SET restricted = 1 WHERE id = ?', ['p1']);
    db.run("DELETE FROM organization_membership WHERE user_id = 'sam'");
    db.close();
    activate();
    expect(
      await plans().write(record('sp-1'), () => Promise.resolve(null), {
        organizationId: 'org-a',
        actorId: 'sam',
        operation: 'save',
      }),
    ).toEqual({ outcome: 'forbidden' });
    expect(rows('saved_plan')).toEqual([]);
    expect(rows('organization_audit')).toEqual([]);
    expect(await plans().write(record('sp-0'), () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    expect(
      await plans().renameTo('sp-0', 'No', {
        organizationId: 'org-a',
        actorId: 'sam',
        operation: 'rename',
      }),
    ).toBe('forbidden');
    expect(rows('saved_plan')).toMatchObject([{ id: 'sp-0', name: 'sp-0' }]);
  });

  it('refuses a scoped touch whose operation disagrees with the write', async () => {
    let failure: unknown;
    try {
      await plans().renameTo('sp-1', 'Renamed', {
        organizationId: 'org-a',
        actorId: 'owner',
        operation: 'delete',
      });
    } catch (caught) {
      failure = caught;
    }
    expect(String(failure)).toContain(
      'saved-plan touch operation disagrees with its authorization',
    );
    expect(rows('saved_plan')).toEqual([]);
  });
});
