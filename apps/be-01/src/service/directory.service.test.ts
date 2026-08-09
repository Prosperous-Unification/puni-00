import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Role, WorkItem } from '../repository';
import { openDrizzle } from '../repository/db';
import { DirectoryRepository } from '../repository/directory';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { RoleRepository } from '../repository/role';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { DirectoryService } from './directory.service';
import { ProjectService } from './project.service';

/**
 * The directory service, against real SQLite.
 *
 * Real stores for the same reason `role.service.test.ts` uses them: every
 * refusal here is decided by rows — the unique index behind a `taken`, the
 * assignments behind an `in_use`, the missing team row behind an
 * `unknown_team` — and an in-memory store answering them would be a second
 * implementation of the rules under test.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let db: ReturnType<typeof openDrizzle>;
let directory: DirectoryService;
let store: DirectoryRepository;
let projects: ProjectRepository;
let workItems: WorkItemRepository;
let roleStore: RoleRepository;
let projectId: string;
let ownerId: string;
let devId: string;

const newItem = (id: string, position: number, name: string, inProject = projectId): WorkItem => ({
  id,
  projectId: inProject,
  parentId: null,
  position,
  name,
  notes: '',
  frozenNumber: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
  revision: 0,
});

const roleNamed = async (name: string, inProject = projectId): Promise<Role> => {
  const found = (await roleStore.listByProject(inProject)).find((each) => each.name === name);
  if (found === undefined) throw new Error(`no role called ${name}`);
  return found;
};

/** The person by that name, or a throw, for the same reason. */
const personNamed = async (name: string): Promise<string> => {
  const found = (await store.listPeople()).find((each) => each.name === name);
  if (found === undefined) throw new Error(`no person called ${name}`);
  return found.id;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-directory-service-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDrizzle(path);

  projects = new ProjectRepository(db);
  store = new DirectoryRepository(db);
  workItems = new WorkItemRepository(db);
  roleStore = new RoleRepository(db);
  directory = new DirectoryService({ directory: store });

  ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });

  const created = await new ProjectService({ projects }).create('Rollout', ownerId);
  projectId = created.project.id;
  devId = (await roleNamed('Dev')).id;

  await workItems.insert(newItem('design', 10, 'Design'), []);
  await workItems.insert(newItem('build', 20, 'Build'), []);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('DirectoryService.renameTeam', () => {
  it('renames a team, trimming what it is given', async () => {
    const platform = await directory.addTeam('Platform');
    if (platform === null) throw new Error('the fixture team was refused');

    const outcome = await directory.renameTeam(platform.id, '  Payments  ');

    expect(outcome).toEqual({ ok: true, result: { id: platform.id, name: 'Payments' } });
    expect(await store.listTeams()).toEqual([{ id: platform.id, name: 'Payments' }]);
  });

  it('refuses a name of whitespace alone, and writes nothing', async () => {
    const platform = await directory.addTeam('Platform');
    if (platform === null) throw new Error('the fixture team was refused');

    expect(await directory.renameTeam(platform.id, '   ')).toEqual({
      ok: false,
      reason: 'name_required',
    });
    expect(await store.listTeams()).toEqual([{ id: platform.id, name: 'Platform' }]);
  });

  it('refuses a name another team holds, naming the survivor', async () => {
    await directory.addTeam('Platform');
    const payments = await directory.addTeam('Payments');
    if (payments === null) throw new Error('the fixture team was refused');

    // The survivor is `Platform` — the row that already holds the name keeps
    // it, and the refusal says so rather than leaving the caller to guess which
    // of the two names is now which.
    expect(await directory.renameTeam(payments.id, 'Platform')).toEqual({
      ok: false,
      reason: 'taken',
      name: 'Platform',
    });
    expect((await store.listTeams()).map((each) => each.name)).toEqual(['Payments', 'Platform']);
  });

  it('renaming a team to the name it already holds is not a collision', async () => {
    const platform = await directory.addTeam('Platform');
    if (platform === null) throw new Error('the fixture team was refused');

    expect(await directory.renameTeam(platform.id, 'Platform')).toEqual({
      ok: true,
      result: { id: platform.id, name: 'Platform' },
    });
  });

  it('refuses a team that is not there', async () => {
    expect(await directory.renameTeam(crypto.randomUUID(), 'Payments')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('DirectoryService.patchPerson', () => {
  /** `Kat`, in `Platform`, assigned to `Dev` on `design`. */
  async function katInPlatform(): Promise<{ katId: string; platformId: string }> {
    const platform = await directory.addTeam('Platform');
    if (platform === null) throw new Error('the fixture team was refused');
    const kat = await directory.addPerson('Kat', [platform.id]);
    if (kat === null) throw new Error('the fixture person was refused');
    await store.assign('design', devId, kat.id);
    return { katId: kat.id, platformId: platform.id };
  }

  it('renames a person, and every assignment still holds them', async () => {
    const { katId, platformId } = await katInPlatform();

    const outcome = await directory.patchPerson(katId, { name: '  Katrin  ' });

    expect(outcome).toEqual({
      ok: true,
      result: { id: katId, name: 'Katrin', teamIds: [platformId] },
    });
    expect(await store.assignmentsOf(['design'])).toEqual([
      { workItemId: 'design', roleId: devId, personId: katId },
    ]);
  });

  it('refuses a name another person holds, naming the survivor', async () => {
    const { katId } = await katInPlatform();
    const strip = await directory.addPerson('Strip', []);
    if (strip === null) throw new Error('the fixture person was refused');

    expect(await directory.patchPerson(strip.id, { name: 'Kat' })).toEqual({
      ok: false,
      reason: 'taken',
      name: 'Kat',
    });
    expect((await store.listPeople()).map((each) => each.name)).toEqual(['Kat', 'Strip']);
    expect(await personNamed('Kat')).toBe(katId);
  });

  it('replaces memberships in full', async () => {
    const { katId } = await katInPlatform();
    const payments = await directory.addTeam('Payments');
    const support = await directory.addTeam('Support');
    if (payments === null || support === null) throw new Error('a fixture team was refused');

    const outcome = await directory.patchPerson(katId, {
      teamIds: [payments.id, support.id],
    });

    if (!outcome.ok) throw new Error(`the patch was refused: ${outcome.reason}`);
    expect([...outcome.result.teamIds].sort()).toEqual([payments.id, support.id].sort());
    // In full: `Platform` is gone rather than kept alongside the two named.
    const stored = (await store.listPeople()).find((each) => each.id === katId);
    expect([...(stored?.teamIds ?? [])].sort()).toEqual([payments.id, support.id].sort());
  });

  it('collapses the same team named twice into one membership', async () => {
    const { katId } = await katInPlatform();
    const payments = await directory.addTeam('Payments');
    if (payments === null) throw new Error('the fixture team was refused');

    const outcome = await directory.patchPerson(katId, {
      teamIds: [payments.id, payments.id],
    });

    expect(outcome).toEqual({
      ok: true,
      result: { id: katId, name: 'Kat', teamIds: [payments.id] },
    });
  });

  it('leaves a person a free agent when the list is empty', async () => {
    const { katId } = await katInPlatform();

    expect(await directory.patchPerson(katId, { teamIds: [] })).toEqual({
      ok: true,
      result: { id: katId, name: 'Kat', teamIds: [] },
    });
  });

  it('refuses the whole patch for a team that is not there, rename included', async () => {
    // The one that decides the shape of the write: the validation has to run
    // before the name is written, **inside** the same transaction. A rename
    // that survived a refused patch would be the half-applied state the spec
    // says is not observable.
    const { katId, platformId } = await katInPlatform();

    const outcome = await directory.patchPerson(katId, {
      name: 'Katrin',
      teamIds: [crypto.randomUUID()],
    });

    expect(outcome).toEqual({ ok: false, reason: 'unknown_team' });
    expect(await store.listPeople()).toEqual([{ id: katId, name: 'Kat', teamIds: [platformId] }]);
  });

  it('refuses a patch naming neither a name nor memberships', async () => {
    const { katId } = await katInPlatform();

    expect(await directory.patchPerson(katId, {})).toEqual({
      ok: false,
      reason: 'nothing_to_change',
    });
  });

  it('refuses a name of whitespace alone, and a person that is not there', async () => {
    const { katId, platformId } = await katInPlatform();

    expect(await directory.patchPerson(katId, { name: '   ' })).toEqual({
      ok: false,
      reason: 'name_required',
    });
    expect(await directory.patchPerson(crypto.randomUUID(), { name: 'Katrin' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await store.listPeople()).toEqual([{ id: katId, name: 'Kat', teamIds: [platformId] }]);
  });
});
