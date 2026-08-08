import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import type { Project, Role, WorkItem } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { RoleRepository } from './role';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

/**
 * The role table's write path, against real SQLite.
 *
 * Real, and only real. Every claim here is one SQLite makes and no fixture
 * can: the unique index that refuses a second `Design`, the foreign key that
 * `estimate.role_id` has no cascade for, and the revision arithmetic that
 * happens inside the statement rather than in this process.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let roles: RoleRepository;
let projects: ProjectRepository;
let projectId: string;
let otherProjectId: string;
let devId: string;
let qaId: string;

const newProject = (ownerId: string, name: string): Project => ({
  id: crypto.randomUUID(),
  name,
  ownerId,
  restricted: false,
  estimateMethod: 'pert',
  startDate: null,
  revision: 0,
  createdAt: 1,
});

const newItem = (id: string, position: number, name: string): WorkItem => ({
  id,
  projectId,
  parentId: null,
  position,
  name,
  notes: '',
  frozenNumber: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
  revision: 0,
});

const revisionOf = async (id: string): Promise<number> => {
  const found = await projects.findById(id);
  if (found === null) throw new Error(`no project ${id}`);
  return found.revision;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-role-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  roles = new RoleRepository(db);
  projects = new ProjectRepository(db);

  const ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });

  const project = newProject(ownerId, 'Rewire the shed');
  projectId = project.id;
  devId = crypto.randomUUID();
  qaId = crypto.randomUUID();
  const starting: Role[] = [
    { id: devId, projectId, name: 'Dev' },
    { id: qaId, projectId, name: 'QA' },
  ];
  await projects.create(project, starting);

  const other = newProject(ownerId, 'Re-tile the roof');
  otherProjectId = other.id;
  await projects.create(other, [{ id: crypto.randomUUID(), projectId: other.id, name: 'Dev' }]);

  const workItems = new WorkItemRepository(db);
  await workItems.insert(newItem('strip', 10, 'Strip'), []);
  await workItems.insert(newItem('sand', 20, 'Sand'), []);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('RoleRepository', () => {
  it('adds a role and moves the project’s revision', async () => {
    const before = await revisionOf(projectId);

    const written = await roles.add({ id: 'design', projectId, name: 'Design' });

    expect(written).toEqual({ ok: true, role: { id: 'design', projectId, name: 'Design' } });
    // Membership, not order: role order is not a contract until `role.position`
    // exists, and asserting one here would invent it.
    const names = (await roles.listByProject(projectId)).map((each) => each.name);
    expect(names).toHaveLength(3);
    expect(names).toContain('Design');
    expect(await revisionOf(projectId)).toBe(before + 1);
  });

  it('refuses a name the project already holds, and leaves the roles as they were', async () => {
    const written = await roles.add({ id: 'second-qa', projectId, name: 'QA' });

    expect(written).toEqual({ ok: false, reason: 'taken' });
    expect(await roles.listByProject(projectId)).toHaveLength(2);
  });

  it('accepts in one project a name another project holds', async () => {
    const written = await roles.add({ id: 'other-qa', projectId: otherProjectId, name: 'QA' });

    expect(written.ok).toBe(true);
    const names = (await roles.listByProject(otherProjectId)).map((each) => each.name);
    expect(names).toHaveLength(2);
    expect(names).toContain('QA');
  });

  it('renames a role and moves the project’s revision', async () => {
    const before = await revisionOf(projectId);

    const written = await roles.rename(qaId, 'Review');

    expect(written).toEqual({ ok: true, role: { id: qaId, projectId, name: 'Review' } });
    expect(await revisionOf(projectId)).toBe(before + 1);
  });

  it('refuses a rename onto a name already in use, leaving both alone', async () => {
    const before = await revisionOf(projectId);

    const written = await roles.rename(qaId, 'Dev');

    expect(written).toEqual({ ok: false, reason: 'taken' });
    const names = (await roles.listByProject(projectId)).map((each) => each.name).sort();
    expect(names).toEqual(['Dev', 'QA']);
    // The refused write moved nothing, so nobody's precondition is defeated by
    // a request that changed nothing.
    expect(await revisionOf(projectId)).toBe(before);
  });

  it('reports a role that is gone rather than pretending to rename it', async () => {
    expect(await roles.rename('never-existed', 'Design')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await roles.findById('never-existed')).toBeNull();
  });

  it('finds a role by id, carrying the project it belongs to', async () => {
    expect(await roles.findById(qaId)).toEqual({ id: qaId, projectId, name: 'QA' });
  });
});
