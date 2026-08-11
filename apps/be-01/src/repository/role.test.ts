import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { personAdded } from '../testing/directory-fixture';
import { openDrizzle } from './db';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
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
let estimates: EstimateRepository;
let directory: DirectoryRepository;
let workItems: WorkItemRepository;
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
  priority: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
  revision: 0,
});

const revisionOf = async (id: string): Promise<number> => {
  const found = await projects.findById(id);
  if (found === null) throw new Error(`no project ${id}`);
  return found.revision;
};

const workItemRevisionOf = async (id: string): Promise<number> => {
  const found = await workItems.findById(id);
  if (found === null) throw new Error(`no work item ${id}`);
  return found.revision;
};

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-role-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  roles = new RoleRepository(db);
  projects = new ProjectRepository(db);
  estimates = new EstimateRepository(db);
  directory = new DirectoryRepository(db);
  workItems = new WorkItemRepository(db);

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
    { id: devId, projectId, name: 'Dev', position: 10 },
    { id: qaId, projectId, name: 'QA', position: 20 },
  ];
  await projects.create(project, starting);

  const other = newProject(ownerId, 'Re-tile the roof');
  otherProjectId = other.id;
  await projects.create(other, [
    { id: crypto.randomUUID(), projectId: other.id, name: 'Dev', position: 10 },
  ]);

  await workItems.insert(newItem('strip', 10, 'Strip'), []);
  await workItems.insert(newItem('sand', 20, 'Sand'), []);
  await workItems.insert(newItem('paint', 30, 'Paint'), []);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('RoleRepository', () => {
  it('adds a role and moves the project’s revision', async () => {
    const before = await revisionOf(projectId);

    const written = await roles.add({ id: 'design', projectId, name: 'Design' });

    expect(written).toEqual({
      ok: true,
      role: { id: 'design', projectId, name: 'Design', position: 30 },
    });
    const names = (await roles.listByProject(projectId)).map((each) => each.name);
    expect(names).toEqual(['Dev', 'QA', 'Design']);
    expect(await revisionOf(projectId)).toBe(before + 1);
  });

  it('reads a role added later last, however its name sorts', async () => {
    // The order cannot be inferred from the rows: SQLite answers
    // `WHERE project_id = ?` from `role_project_name`, so without an ORDER BY
    // these come back `Analysis, Dev, QA` — and role order is what a work
    // item's slices run in.
    await roles.add({ id: 'analysis', projectId, name: 'Analysis' });

    const names = (await roles.listByProject(projectId)).map((each) => each.name);

    expect(names).toEqual(['Dev', 'QA', 'Analysis']);
  });

  it('reads the same order through the project, which is where the schedule asks', async () => {
    await roles.add({ id: 'analysis-2', projectId, name: 'Analysis' });

    const names = (await projects.rolesOf(projectId)).map((each) => each.name);

    expect(names).toEqual(['Dev', 'QA', 'Analysis']);
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

    expect(written).toEqual({
      ok: true,
      role: { id: qaId, projectId, name: 'Review', position: 20 },
    });
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
    expect(await roles.findById(qaId)).toEqual({ id: qaId, projectId, name: 'QA', position: 20 });
  });

  it('counts the role’s estimates and hands back every assignment in the project', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    await estimates.set({ workItemId: 'sand', roleId: qaId, ...DAYS });
    await estimates.set({ workItemId: 'sand', roleId: devId, ...DAYS });
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, []),
    );
    await directory.assign('strip', devId, ada.id);
    await directory.assign('strip', qaId, ada.id);

    const usage = await roles.usageOf(projectId, qaId);

    expect(usage.estimates).toBe(2);
    // Both of the work item's assignments, not only the QA one: what `strip`
    // is assumed to be after QA goes depends on the Dev row staying.
    expect(usage.assignments).toHaveLength(2);
    expect(usage.assignments).toContainEqual({
      workItemId: 'strip',
      roleId: devId,
      personId: ada.id,
    });
  });

  it('removes the role’s estimates, its assignments and its row, and nothing else’s', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    await estimates.set({ workItemId: 'strip', roleId: devId, ...DAYS });
    await estimates.set({ workItemId: 'sand', roleId: qaId, ...DAYS });
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, []),
    );
    await directory.assign('strip', qaId, ada.id);
    await directory.assign('strip', devId, ada.id);

    const removed = await roles.remove(projectId, qaId, true);

    if (!removed.ok) throw new Error(`removal refused: ${removed.reason}`);
    expect(removed.removal.estimates).toBe(2);
    expect(removed.removal.assignments).toBe(1);
    expect([...removed.removal.workItemIds].sort()).toEqual(['sand', 'strip']);
    expect(await roles.findById(qaId)).toBeNull();
    // The other role's rows are the survivors that make the delete's WHERE
    // clause provable: narrowed to the work item alone it would take these too.
    expect(await estimates.listByProject(projectId)).toEqual([
      { workItemId: 'strip', roleId: devId, ...DAYS },
    ]);
    expect(await directory.assignmentsOf(['strip', 'sand'])).toEqual([
      { workItemId: 'strip', roleId: devId, personId: ada.id },
    ]);
    // A role of the same name in another project is not this project's business.
    expect(await roles.listByProject(otherProjectId)).toHaveLength(1);
  });

  it('moves the project and every work item that lost something, and nothing else', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, []),
    );
    await directory.assign('sand', qaId, ada.id);
    const projectBefore = await revisionOf(projectId);
    const stripBefore = await workItemRevisionOf('strip');
    const sandBefore = await workItemRevisionOf('sand');
    const paintBefore = await workItemRevisionOf('paint');

    await roles.remove(projectId, qaId, true);

    expect(await revisionOf(projectId)).toBe(projectBefore + 1);
    expect(await workItemRevisionOf('strip')).toBe(stripBefore + 1);
    expect(await workItemRevisionOf('sand')).toBe(sandBefore + 1);
    // Held nothing of that role's, so nobody's read of it differs and a
    // precondition on it must survive.
    expect(await workItemRevisionOf('paint')).toBe(paintBefore);
  });

  it('refuses an unconfirmed removal and deletes nothing, reporting what it read', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, []),
    );
    await directory.assign('strip', qaId, ada.id);
    const before = await revisionOf(projectId);

    const refused = await roles.remove(projectId, qaId, false);

    expect(refused).toEqual({
      ok: false,
      reason: 'in_use',
      // The whole project's assignments, so the caller can work out whose
      // assumed assignee moves — the `Dev` row is not there because nobody
      // holds it, and this is what the reading is made from.
      usage: {
        estimates: 1,
        assignments: [{ workItemId: 'strip', roleId: qaId, personId: ada.id }],
      },
    });
    expect(await roles.findById(qaId)).not.toBeNull();
    expect(await estimates.listByProject(projectId)).toHaveLength(1);
    expect(await revisionOf(projectId)).toBe(before);
  });

  it('reports a role that is already gone, moving nothing', async () => {
    await roles.remove(projectId, qaId, true);
    const after = await revisionOf(projectId);

    const second = await roles.remove(projectId, qaId, true);

    expect(second).toEqual({ ok: false, reason: 'not_found' });
    // The loser of two removals writes nothing at all, the project's revision
    // included: it removed nothing, so nobody's read of the project differs.
    expect(await revisionOf(projectId)).toBe(after);
  });

  it('reports another project’s role as not there, and leaves it alone', async () => {
    const theirs = (await roles.listByProject(otherProjectId)).at(0);
    if (theirs === undefined) throw new Error('the other project was created without roles');
    const before = await revisionOf(projectId);

    const refused = await roles.remove(projectId, theirs.id, true);

    expect(refused).toEqual({ ok: false, reason: 'not_found' });
    expect(await roles.findById(theirs.id)).toEqual(theirs);
    expect(await revisionOf(projectId)).toBe(before);
  });

  it('deletes an estimate written between the count and the confirmed removal', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    const counted = await roles.usageOf(projectId, qaId);
    expect(counted.estimates).toBe(1);

    // The race the confirmation opens: somebody estimates the doomed role on a
    // work item the counts never mentioned, between the refusal and the
    // confirmed delete. The transaction chooses what it deletes for itself, so
    // this is deleted with the rest rather than left pointing at a role that
    // has gone — which is a foreign key error, a 500, and a project nobody can
    // read afterwards.
    await estimates.set({ workItemId: 'paint', roleId: qaId, ...DAYS });
    const paintBefore = await workItemRevisionOf('paint');

    const removed = await roles.remove(projectId, qaId, true);

    if (!removed.ok) throw new Error(`removal refused: ${removed.reason}`);
    expect(removed.removal.estimates).toBe(2);
    expect(await estimates.listByProject(projectId)).toEqual([]);
    expect(await workItemRevisionOf('paint')).toBe(paintBefore + 1);
    expect(await roles.findById(qaId)).toBeNull();
  });
});
