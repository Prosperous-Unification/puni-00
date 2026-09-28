import type { WorkItemStatus } from '@wbs/domain';
import { inMemoryCommandJournal } from '@wbs/store-memory/command-journal-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import type { Project, ProjectStore, StepProgressStore } from '../index';
import type { AvailableWorkItemService as WorkItemService } from '../testing/available-work-item-service';
import { inMemoryServices } from '../testing/harness';

const OWNER = 'owner-account';
const DEV = 'step-dev';
const QA = 'step-qa';

let projects: ProjectStore;
let progress: StepProgressStore;
let service: WorkItemService;
let projectId: string;
let entries = 0;

async function newProject(withSteps: boolean): Promise<string> {
  const project: Project = projectRow({ id: crypto.randomUUID(), ownerId: OWNER });
  await projects.create(
    project,
    withSteps
      ? [
          {
            id: DEV,
            projectId: project.id,
            name: 'Dev',
            position: 10,
            code: 'dev',
            allowancePercent: 0,
          },
          {
            id: QA,
            projectId: project.id,
            name: 'QA',
            position: 20,
            code: 'qa',
            allowancePercent: 0,
          },
        ]
      : [],
    { at: 1, by: OWNER },
  );
  return project.id;
}

beforeEach(async () => {
  const store = inMemoryCommandJournal();
  entries = 0;
  const harness = inMemoryServices({
    journal: {
      ...store,
      async append(entry, event) {
        entries += 1;
        await store.append(entry, event);
      },
    },
  });
  ({ projects, progress } = harness.stores);
  service = harness.service;
  projectId = await newProject(true);
});

async function add(name: string, parentId: string | null = null): Promise<string> {
  const outcome = await service.create(projectId, OWNER, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.value.id;
}

interface Row {
  status: WorkItemStatus;
  readiness: string | null;
  hold: string | null;
  factStart: string | null;
  factEnd: string | null;
  progress: Record<string, string>;
}

async function rows(): Promise<Map<string, Row>> {
  const tree = await service.tree(projectId);
  if (tree === null) throw new Error('project vanished');
  return new Map(
    tree.workItems.map((w) => [
      w.name,
      {
        status: w.status,
        readiness: w.readiness,
        hold: w.hold,
        factStart: w.factStart,
        factEnd: w.factEnd,
        progress: w.progress,
      },
    ]),
  );
}

async function rowOf(name: string): Promise<Row> {
  const found = (await rows()).get(name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
}

async function set(id: string, status: Parameters<WorkItemService['setStatus']>[2], on?: string) {
  return await service.setStatus(id, OWNER, status, on);
}

describe('readiness', () => {
  it('marks a leaf ready and resumes it from a hold to ready', async () => {
    const strip = await add('Strip');
    expect((await set(strip, 'ready')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ status: 'ready', readiness: 'ready' });

    expect((await set(strip, 'on_hold')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ status: 'on_hold', readiness: 'ready' });

    expect((await set(strip, 'ready')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ status: 'ready', hold: null });
  });

  it('refuses readiness once a step has spoken, and writes nothing', async () => {
    const strip = await add('Strip');
    await service.setProgress(strip, OWNER, DEV, 'in_progress');
    expect(await set(strip, 'draft')).toEqual({ ok: false, reason: 'readiness_after_progress' });
    expect(await rowOf('Strip')).toMatchObject({ readiness: null });
  });
});

describe('holds', () => {
  it('holds and blocks a leaf without touching its progress, readiness or facts', async () => {
    const strip = await add('Strip');
    await service.setProgress(strip, OWNER, DEV, 'in_progress');
    expect((await set(strip, 'blocked')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({
      status: 'blocked',
      hold: 'blocked',
      progress: { [DEV]: 'in_progress' },
    });
  });

  it('refuses a hold on a leaf reading done', async () => {
    const strip = await add('Strip');
    await set(strip, 'done', '2026-09-20');
    expect(await set(strip, 'on_hold')).toEqual({ ok: false, reason: 'cannot_hold_done' });
    expect(await rowOf('Strip')).toMatchObject({ status: 'done', hold: null });
  });

  it('holds every leaf beneath a parent, and one undo restores each prior hold', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    const sand = await add('Sand', branch);
    await add('Paint', branch);
    await set(strip, 'ready');
    await set(sand, 'blocked');

    expect((await set(branch, 'on_hold')).ok).toBe(true);
    const held = await rows();
    expect(['Branch', 'Strip', 'Sand', 'Paint'].map((name) => held.get(name)?.status)).toEqual([
      'on_hold',
      'on_hold',
      'on_hold',
      'on_hold',
    ]);

    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    const undone = await rows();
    expect(['Strip', 'Sand', 'Paint'].map((name) => undone.get(name)?.hold)).toEqual([
      null,
      'blocked',
      null,
    ]);
    expect(undone.get('Strip')?.readiness).toBe('ready');
  });

  it('writes nothing when a hold is already there', async () => {
    const strip = await add('Strip');
    await set(strip, 'on_hold');
    const before = entries;
    await set(strip, 'on_hold');
    expect(entries).toBe(before);
  });
});

describe('in progress', () => {
  it('starts the first silent step, fills an empty fact start and clears the hold', async () => {
    const strip = await add('Strip');
    await set(strip, 'on_hold');
    expect((await set(strip, 'in_progress', '2026-10-01')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({
      status: 'in_progress',
      hold: null,
      factStart: '2026-10-01',
      progress: { [DEV]: 'in_progress' },
    });
  });

  it('on a parent starts one leaf, preferring an unheld one, and clears only its hold', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    await add('Sand', branch);
    const paint = await add('Paint', branch);
    await set(strip, 'on_hold');
    await set(paint, 'blocked');

    expect((await set(branch, 'in_progress', '2026-10-01')).ok).toBe(true);
    const after = await rows();
    expect(after.get('Strip')).toMatchObject({ hold: 'on_hold', progress: {} });
    expect(after.get('Sand')).toMatchObject({
      progress: { [DEV]: 'in_progress' },
      factStart: '2026-10-01',
    });
    expect(after.get('Paint')).toMatchObject({ hold: 'blocked', progress: {} });
    expect(after.get('Branch')?.status).toBe('in_progress');

    const before = entries;
    await set(branch, 'in_progress');
    expect(entries).toBe(before);
  });

  it('on a parent whose every silent leaf is held starts the first held one and clears its hold', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    const sand = await add('Sand', branch);
    await set(strip, 'on_hold');
    await set(sand, 'blocked');
    expect((await set(branch, 'in_progress')).ok).toBe(true);
    const after = await rows();
    // A row created with no `afterId` goes first, so Sand leads Strip in tree order.
    expect(after.get('Sand')).toMatchObject({ hold: null, progress: { [DEV]: 'in_progress' } });
    expect(after.get('Strip')).toMatchObject({ hold: 'on_hold', progress: {} });
  });

  it('reopens a done leaf: its last step goes back to in progress and its fact end is cleared', async () => {
    const strip = await add('Strip');
    await service.patch(strip, OWNER, { factStart: '2026-09-01' });
    await set(strip, 'done', '2026-09-20');

    expect((await set(strip, 'in_progress')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({
      status: 'in_progress',
      progress: { [DEV]: 'done', [QA]: 'in_progress' },
      factStart: '2026-09-01',
      factEnd: null,
    });

    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({
      status: 'done',
      progress: { [DEV]: 'done', [QA]: 'done' },
      factEnd: '2026-09-20',
    });
  });

  it('reopens a done parent through its first leaf and clears the parent fact end too', async () => {
    const branch = await add('Branch');
    await add('Strip', branch);
    await add('Sand', branch);
    await set(branch, 'done', '2026-09-20');

    expect((await set(branch, 'in_progress')).ok).toBe(true);
    const after = await rows();
    expect(after.get('Branch')).toMatchObject({ status: 'in_progress', factEnd: null });
    // Sand leads Strip in tree order (created second, with no `afterId`).
    expect(after.get('Sand')).toMatchObject({
      progress: { [DEV]: 'done', [QA]: 'in_progress' },
      factEnd: null,
    });
    expect(after.get('Strip')).toMatchObject({ status: 'done', factEnd: '2026-09-20' });
  });
});

describe('a project with no steps', () => {
  it('refuses in progress and done with no_steps', async () => {
    projectId = await newProject(false);
    const strip = await add('Strip');
    expect(await set(strip, 'in_progress')).toEqual({ ok: false, reason: 'no_steps' });
    expect(await set(strip, 'done')).toEqual({ ok: false, reason: 'no_steps' });
    expect(await progress.listByProject(projectId)).toEqual([]);
  });
});

describe('unknown and done clear readiness and holds', () => {
  it('done clears a hold, and unknown clears both', async () => {
    const strip = await add('Strip');
    await set(strip, 'ready');
    await set(strip, 'blocked');
    await set(strip, 'done', '2026-09-20');
    expect(await rowOf('Strip')).toMatchObject({ status: 'done', hold: null, readiness: 'ready' });
    await set(strip, 'unknown');
    expect(await rowOf('Strip')).toMatchObject({ status: 'unknown', hold: null, readiness: null });
  });
});

describe('structural edits carry readiness and hold with the leaf', () => {
  it('hands a leaf’s readiness and hold down to its first child, and one undo hands them back', async () => {
    const strip = await add('Strip');
    await set(strip, 'ready');
    await set(strip, 'on_hold');
    await add('Prime', strip);

    const after = await rows();
    expect(after.get('Prime')).toMatchObject({ readiness: 'ready', hold: 'on_hold' });
    expect(after.get('Strip')).toMatchObject({ readiness: null, hold: null, status: 'on_hold' });

    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ readiness: 'ready', hold: 'on_hold' });
  });

  it('clears the readiness and hold of a leaf another row moves under, and one undo restores them', async () => {
    const strip = await add('Strip');
    const sand = await add('Sand');
    await set(strip, 'blocked');
    expect((await service.move(sand, OWNER, { parentId: strip, afterId: null })).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ hold: null });
    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ hold: 'blocked' });
  });

  it('gives a parent losing its last child the readiness and hold every former leaf agreed on', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    await set(strip, 'draft');
    await set(strip, 'blocked');
    expect((await service.remove(strip, OWNER, 'cascade')).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ readiness: 'draft', hold: 'blocked' });
    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ readiness: null, hold: null });
  });

  it('copies a readiness and never a hold', async () => {
    const strip = await add('Strip');
    await set(strip, 'ready');
    await set(strip, 'on_hold');
    expect((await service.duplicate(strip, OWNER)).ok).toBe(true);
    expect(await rowOf('Strip (copy)')).toMatchObject({ readiness: 'ready', hold: null });
  });

  it('gives it none where the former leaves disagreed', async () => {
    const branch = await add('Branch');
    const middle = await add('Middle', branch);
    const strip = await add('Strip', middle);
    await add('Sand', middle);
    await set(strip, 'on_hold');
    expect((await service.remove(middle, OWNER, 'cascade')).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ readiness: null, hold: null });
  });
});
