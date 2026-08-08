import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Role, WorkItem } from '../repository';
import { openDrizzle } from '../repository/db';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { DrizzleEventLogRepo } from '../repository/event-log';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { RoleRepository } from '../repository/role';
import { UserRepository } from '../repository/user';
import { WorkItemRepository } from '../repository/work-item';
import { type RecordingBroadcaster, recordingBroadcaster } from '../testing/broadcast-fixture';
import type { Broadcaster } from './broadcast';
import { EventSequencer } from './event-sequencer';
import { GatewayBroadcaster } from './gateway-broadcaster';
import { ProjectService } from './project.service';
import { PushClient } from './push-client';
import { ReplayBuffer } from './replay-buffer';
import { ReplayOrchestrator } from './replay-orchestrator';
import { RoleService } from './role.service';

/**
 * The role service, against real SQLite.
 *
 * The refusals it answers are all decided by rows — a name the index refuses,
 * an estimate that would be deleted, an assignment whose absence would promote
 * somebody — so the stores under it are the real ones. An in-memory role store
 * would be a second implementation of the rules being asserted.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let db: ReturnType<typeof openDrizzle>;
let roles: RoleService;
let roleStore: RoleRepository;
let projectStore: ProjectRepository;
let estimates: EstimateRepository;
let directory: DirectoryRepository;
let broadcast: RecordingBroadcaster;
let projectId: string;
let ownerId: string;
let strangerId: string;
let devId: string;
let qaId: string;

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

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

const roleNamed = async (name: string): Promise<Role> => {
  const found = (await roleStore.listByProject(projectId)).find((each) => each.name === name);
  if (found === undefined) throw new Error(`no role called ${name}`);
  return found;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-role-service-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDrizzle(path);

  projectStore = new ProjectRepository(db);
  roleStore = new RoleRepository(db);
  estimates = new EstimateRepository(db);
  directory = new DirectoryRepository(db);
  broadcast = recordingBroadcaster();
  roles = new RoleService({ projects: projectStore, roles: roleStore, broadcast });

  const users = new UserRepository(db);
  ownerId = crypto.randomUUID();
  strangerId = crypto.randomUUID();
  await users.create({ id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 });
  await users.create({ id: strangerId, username: 'stranger', passwordHash: 'x', createdAt: 2 });

  const created = await new ProjectService({ projects: projectStore }).create('Shed', ownerId);
  projectId = created.project.id;
  devId = (await roleNamed('Dev')).id;
  qaId = (await roleNamed('QA')).id;

  const workItems = new WorkItemRepository(db);
  await workItems.insert(newItem('strip', 10, 'Strip'), []);
  await workItems.insert(newItem('sand', 20, 'Sand'), []);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('RoleService.add', () => {
  it('adds a role and announces it', async () => {
    const outcome = await roles.add(projectId, ownerId, 'Design');

    if (!outcome.ok) throw new Error(`add refused: ${outcome.reason}`);
    expect(outcome.result.name).toBe('Design');
    expect(outcome.result.projectId).toBe(projectId);
    // The very row that was written, not a shape that resembles it: the event
    // carrying a different id from the answer is the failure worth catching.
    expect(broadcast.published).toEqual([
      { projectId, event: { type: 'role_added', role: outcome.result } },
    ]);
  });

  it('trims the name, and refuses one that is only spaces', async () => {
    const trimmed = await roles.add(projectId, ownerId, '  Design  ');
    if (!trimmed.ok) throw new Error(`add refused: ${trimmed.reason}`);
    expect(trimmed.result.name).toBe('Design');
    expect(await roles.add(projectId, ownerId, '   ')).toEqual({
      ok: false,
      reason: 'name_required',
    });
    // The refused one announced nothing: there is nothing for anybody to reread.
    expect(broadcast.published).toHaveLength(1);
  });

  it('refuses a name the project already holds', async () => {
    expect(await roles.add(projectId, ownerId, 'QA')).toEqual({ ok: false, reason: 'taken' });
    expect(broadcast.published).toEqual([]);
  });

  it('refuses a project that is not there, and one the caller may not write to', async () => {
    expect(await roles.add(crypto.randomUUID(), ownerId, 'Design')).toEqual({
      ok: false,
      reason: 'not_found',
    });

    await projectStore.update(projectId, { restricted: true });
    expect(await roles.add(projectId, strangerId, 'Design')).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    // The owner of the restricted project still may.
    expect((await roles.add(projectId, ownerId, 'Design')).ok).toBe(true);
  });
});

describe('RoleService.rename', () => {
  it('renames a role and announces it', async () => {
    const outcome = await roles.rename(projectId, qaId, ownerId, 'Review');

    expect(outcome).toEqual({
      ok: true,
      result: { id: qaId, projectId, name: 'Review', position: 20 },
    });
    expect(broadcast.published).toEqual([
      {
        projectId,
        event: {
          type: 'role_renamed',
          role: { id: qaId, projectId, name: 'Review', position: 20 },
        },
      },
    ]);
  });

  it('refuses a name the project already holds', async () => {
    expect(await roles.rename(projectId, qaId, ownerId, 'Dev')).toEqual({
      ok: false,
      reason: 'taken',
    });
  });

  it('refuses a role that belongs to another project', async () => {
    const other = await new ProjectService({ projects: projectStore }).create('Roof', ownerId);
    const theirs = (await roleStore.listByProject(other.project.id)).at(0);
    if (theirs === undefined) throw new Error('the other project was created without roles');

    // Not found rather than forbidden: this project does not have that role,
    // and saying "you may not" would tell the caller it exists here.
    expect(await roles.rename(projectId, theirs.id, ownerId, 'Review')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await roleStore.findById(theirs.id)).toEqual(theirs);
  });
});

describe('RoleService.remove', () => {
  it('removes a role nothing points at, without asking again', async () => {
    const outcome = await roles.remove(projectId, qaId, ownerId, false);

    expect(outcome).toEqual({ ok: true });
    expect(await roleStore.findById(qaId)).toBeNull();
    expect(broadcast.published).toEqual([
      { projectId, event: { type: 'role_removed', roleId: qaId } },
    ]);
  });

  it('refuses a role that is used, counting what would go', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    await estimates.set({ workItemId: 'sand', roleId: qaId, ...DAYS });
    const ada = await directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, []);
    await directory.assign('strip', qaId, ada.id);
    await directory.assign('strip', devId, ada.id);

    const outcome = await roles.remove(projectId, qaId, ownerId, false);

    expect(outcome).toEqual({
      ok: false,
      reason: 'in_use',
      inUse: {
        estimates: 2,
        assignments: 1,
        assumedAssignees: [{ workItemId: 'strip', assumedNow: null, assumedAfter: ada.id }],
      },
    });
    expect(await roleStore.findById(qaId)).not.toBeNull();
    expect(broadcast.published).toEqual([]);
  });

  it('removes it on the second, explicit call', async () => {
    await estimates.set({ workItemId: 'strip', roleId: qaId, ...DAYS });
    expect(await roles.remove(projectId, qaId, ownerId, false)).toMatchObject({ reason: 'in_use' });

    const outcome = await roles.remove(projectId, qaId, ownerId, true);

    expect(outcome).toEqual({ ok: true });
    expect(await estimates.listByProject(projectId)).toEqual([]);
    expect(broadcast.published).toEqual([
      { projectId, event: { type: 'role_removed', roleId: qaId } },
    ]);
  });

  it('refuses a caller who may not write to the project, cascade or not', async () => {
    await projectStore.update(projectId, { restricted: true });

    expect(await roles.remove(projectId, qaId, strangerId, true)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await roleStore.findById(qaId)).not.toBeNull();
  });

  it('refuses a role that is not there', async () => {
    expect(await roles.remove(projectId, crypto.randomUUID(), ownerId, true)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('role events', () => {
  /** What the project's roles looked like at the moment each event was published. */
  function watchingBroadcaster(): { rolesAtPublish: string[][] } & Broadcaster {
    const rolesAtPublish: string[][] = [];
    return {
      rolesAtPublish,
      async publish(watched: string) {
        rolesAtPublish.push((await roleStore.listByProject(watched)).map((each) => each.name));
      },
      latestSeq: () => Promise.resolve(-1),
    };
  }

  it('records the event after the write, never before it', async () => {
    // The sequence-consistency rule, asserted where it is decided rather than
    // reasoned about: a reader that acts on the event — a client rereading the
    // project, the replay log recording it — must never see the project as it
    // was before the change. Reading the roles from inside `publish` is the
    // only moment that can tell the two orders apart.
    const watching = watchingBroadcaster();
    const service = new RoleService({
      projects: projectStore,
      roles: roleStore,
      broadcast: watching,
    });

    await service.add(projectId, ownerId, 'Design');
    await service.remove(projectId, qaId, ownerId, true);

    expect(watching.rolesAtPublish[0]).toContain('Design');
    expect(watching.rolesAtPublish[1]).not.toContain('QA');
  });

  it('replays a role event to a client that reconnects', async () => {
    const eventLog = new DrizzleEventLogRepo(db);
    const buffer = new ReplayBuffer({ maxPerSubscription: 100, maxAgeMs: 60_000 });
    const durable = new RoleService({
      projects: projectStore,
      roles: roleStore,
      broadcast: new GatewayBroadcaster({
        sequencer: new EventSequencer(eventLog),
        buffer,
        // Nowhere to push, deliberately: the replay must come from what was
        // recorded, not from a delivery that happened to succeed.
        push: new PushClient({ gwUrl: 'http://gw.invalid', secret: 's'.repeat(32) }),
        onPushFailed: () => undefined,
      }),
    });
    const subscription = `project:${projectId}`;

    await durable.add(projectId, ownerId, 'Design');
    const seenUpTo = await eventLog.latestSeq(subscription);
    await durable.remove(projectId, qaId, ownerId, true);

    const replayed = await new ReplayOrchestrator({ log: eventLog, buffer }).replay({
      [subscription]: seenUpTo,
    });

    expect(replayed[subscription]).toEqual({
      status: 'replaying',
      events: [{ seq: seenUpTo + 1, message: { type: 'role_removed', roleId: qaId } }],
    });
  });
});
