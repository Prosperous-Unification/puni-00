import type { WorkItemStatus } from '@wbs/domain';
import { inMemoryCommandJournal } from '@wbs/store-memory/command-journal-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import type { Project, ProjectStore, StepProgressStore } from '../index';
import { clockOf } from '../ports/clock';
import type { AvailableWorkItemService as WorkItemService } from '../testing/available-work-item-service';
import { inMemoryServices } from '../testing/harness';

const OWNER = 'owner-account';
const DEV = 'step-dev';
const QA = 'step-qa';

let projects: ProjectStore;
let harnessStores: ReturnType<typeof inMemoryServices>['stores'];
let progress: StepProgressStore;
let service: WorkItemService;
let projectId: string;
let entries = 0;
let lastPreconditions: unknown = null;

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
            estimateUnit: 'workdays' as const,
          },
          {
            id: QA,
            projectId: project.id,
            name: 'QA',
            position: 20,
            code: 'qa',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
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
        lastPreconditions = entry.preconditions;
        await store.append(entry, event);
      },
    },
  });
  ({ projects, progress } = harness.stores);
  harnessStores = harness.stores;
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
    expect(await rowOf('Strip')).toMatchObject({ readiness: 'draft', hold: 'blocked' });
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

describe('review follow-ups', () => {
  it('refuses an undo that would put a hold back on a row that has since gained a child', async () => {
    const strip = await add('Strip');
    await set(strip, 'on_hold');
    await set(strip, 'unknown');
    // Somebody else gives Strip its first child, so Strip is a parent now.
    const peer = await service.create(projectId, 'peer-account', {
      parentId: strip,
      afterId: null,
      name: 'Prime',
    });
    expect(peer.ok).toBe(true);

    expect(await service.undo(projectId, OWNER)).toMatchObject({
      ok: false,
      detail: 'that work item has children now, so it takes no readiness or hold.',
    });
    // The plan still reads: no statement landed on the parent.
    expect(await rowOf('Strip')).toMatchObject({ readiness: null, hold: null });
  });

  it('gives the parent a moved last child leaves the statements it agreed on', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    await set(strip, 'ready');
    expect((await service.move(strip, OWNER, { parentId: null, afterId: null })).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ readiness: 'ready', hold: null });
    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ readiness: null, status: 'ready' });
  });

  it('starts a held branch whose progress fold reads in progress but whose status does not', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    const sand = await add('Sand', branch);
    await set(strip, 'in_progress');
    await set(branch, 'on_hold');
    expect(await rowOf('Branch')).toMatchObject({ status: 'on_hold' });

    expect((await set(branch, 'in_progress')).ok).toBe(true);
    const after = await rows();
    // Sand leads Strip in tree order and is the only silent leaf.
    expect(after.get('Sand')).toMatchObject({ hold: null, progress: { [DEV]: 'in_progress' } });
    expect(sand).toBeDefined();
  });

  it('takes the hold off a done leaf when its branch is held', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    await add('Sand', branch);
    await set(strip, 'on_hold');
    await service.setProgress(strip, OWNER, DEV, 'done');
    await service.setProgress(strip, OWNER, QA, 'done');
    expect((await set(branch, 'blocked')).ok).toBe(true);
    expect(await rowOf('Strip')).toMatchObject({ status: 'done', hold: null });
  });

  it('guards the parent a last-child delete hands statements up to', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    await set(strip, 'ready');
    expect((await service.remove(strip, OWNER, 'cascade')).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ readiness: 'ready' });
    // The parent the statements went to is one the undo checks, so somebody
    // else's later edit to it makes the undo stale rather than overwritten.
    expect(JSON.stringify(lastPreconditions)).toContain(branch);
  });
});

describe('no read sees a parent holding a statement mid-write (Fable review, I1)', () => {
  /** Runs a plan read right after the store's own write, inside the service's act. */
  function readAfter(method: 'insert' | 'move'): { reads: string[] } {
    const seen = { reads: [] as string[] };
    const store = harnessStores.workItems;
    const original = store[method].bind(store) as (...args: unknown[]) => Promise<unknown>;
    (store as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      const written = await original(...args);
      try {
        await service.tree(projectId);
        seen.reads.push('ok');
      } catch (error) {
        seen.reads.push(error instanceof Error ? error.message : String(error));
      }
      return written;
    };
    return seen;
  }

  it('no read sees a parent holding a statement while a first child is created', async () => {
    const strip = await add('Strip');
    await set(strip, 'on_hold');
    const seen = readAfter('insert');
    await add('Prime', strip);
    expect(seen.reads).toEqual(['ok']);
  });

  it('no read sees a parent holding a statement while a row moves under a leaf', async () => {
    const strip = await add('Strip');
    const sand = await add('Sand');
    await set(strip, 'blocked');
    const seen = readAfter('move');
    expect((await service.move(sand, OWNER, { parentId: strip, afterId: null })).ok).toBe(true);
    expect(seen.reads).toEqual(['ok']);
  });

  it('no read sees a parent holding a statement while a move that emptied it is undone', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    await set(strip, 'on_hold');
    expect((await service.move(strip, OWNER, { parentId: null, afterId: null })).ok).toBe(true);
    expect(await rowOf('Branch')).toMatchObject({ hold: 'on_hold' });
    const seen = readAfter('move');
    expect((await service.undo(projectId, OWNER)).ok).toBe(true);
    expect(seen.reads).toEqual(['ok']);
    expect(await rowOf('Branch')).toMatchObject({ hold: null });
    expect(await rowOf('Strip')).toMatchObject({ hold: 'on_hold' });
  });
});

describe('an on-hold leaf takes no part in the schedule', () => {
  async function scheduleOf(name: string) {
    const tree = await service.tree(projectId);
    if (tree === null) throw new Error('project vanished');
    const found = tree.workItems.find((row) => row.name === name);
    if (found === undefined) throw new Error(`no row ${name}`);
    return { schedule: found.schedule, dates: found.dates, status: found.status };
  }

  it('arranges a plan holding an on-hold leaf, and leaves the held row where it was', async () => {
    const strip = await add('Strip');
    const sand = await add('Sand');
    const paint = await add('Paint');
    await service.setEstimate(strip, OWNER, DEV, { optimistic: 1, realistic: 1, pessimistic: 1 });
    await service.setEstimate(sand, OWNER, DEV, { optimistic: 2, realistic: 2, pessimistic: 2 });
    await service.setEstimate(paint, OWNER, DEV, { optimistic: 3, realistic: 3, pessimistic: 3 });
    await service.addDependency(strip, OWNER, sand);
    await set(paint, 'on_hold');
    const before = (await service.tree(projectId))?.workItems.find((row) => row.id === paint);

    expect(await service.arrangeBySchedule(projectId, OWNER)).toEqual({ ok: true, value: null });
    const after = (await service.tree(projectId))?.workItems.find((row) => row.id === paint);
    expect(after?.position).toBe(before?.position);
  });
  it('lets a successor start at day zero, and reports the held row with no schedule', async () => {
    const strip = await add('Strip');
    const sand = await add('Sand');
    await service.setEstimate(strip, OWNER, DEV, { optimistic: 5, realistic: 5, pessimistic: 5 });
    await service.setEstimate(sand, OWNER, DEV, { optimistic: 2, realistic: 2, pessimistic: 2 });
    expect((await service.addDependency(sand, OWNER, strip)).ok).toBe(true);
    expect((await scheduleOf('Sand')).schedule?.earliestStart).toBe(5);

    await set(strip, 'on_hold');

    expect(await scheduleOf('Strip')).toMatchObject({ schedule: null, dates: null });
    expect(await scheduleOf('Sand')).toMatchObject({ status: 'blocked_by_proxy' });
    expect((await scheduleOf('Sand')).schedule?.earliestStart).toBe(0);
  });

  it('keeps a blocked leaf in the schedule where the forecast puts it', async () => {
    const strip = await add('Strip');
    const sand = await add('Sand');
    await service.setEstimate(strip, OWNER, DEV, { optimistic: 5, realistic: 5, pessimistic: 5 });
    await service.setEstimate(sand, OWNER, DEV, { optimistic: 2, realistic: 2, pessimistic: 2 });
    await service.addDependency(sand, OWNER, strip);
    await set(strip, 'blocked');
    expect((await scheduleOf('Strip')).schedule?.earliestStart).toBe(0);
    expect((await scheduleOf('Sand')).schedule?.earliestStart).toBe(5);
  });

  it('brackets a parent by its unheld leaves, and gives a wholly held parent none', async () => {
    const branch = await add('Branch');
    const strip = await add('Strip', branch);
    const sand = await add('Sand', branch);
    await service.setEstimate(strip, OWNER, DEV, { optimistic: 3, realistic: 3, pessimistic: 3 });
    await service.setEstimate(sand, OWNER, DEV, { optimistic: 7, realistic: 7, pessimistic: 7 });
    await set(sand, 'on_hold');
    expect((await scheduleOf('Branch')).schedule?.earliestFinish).toBe(3);
    await set(strip, 'on_hold');
    expect(await scheduleOf('Branch')).toMatchObject({ schedule: null, dates: null });
  });
});

describe('the attempt is the better witness (step-node-attempts D4)', () => {
  /** A fresh plan whose clock stamps `at`, in `zone`, holding one leaf `Strip`. */
  async function clockedLeaf(at: number, zone = 'UTC') {
    const plan = inMemoryServices({
      clock: clockOf({ now: () => at, newId: () => crypto.randomUUID() }),
    });
    const project: Project = projectRow({ id: crypto.randomUUID(), ownerId: OWNER });
    await plan.stores.projects.create(
      project,
      [
        {
          id: DEV,
          projectId: project.id,
          name: 'Dev',
          position: 10,
          code: 'dev',
          allowancePercent: 0,
          estimateUnit: 'workdays' as const,
        },
        {
          id: QA,
          projectId: project.id,
          name: 'QA',
          position: 20,
          code: 'qa',
          allowancePercent: 0,
          estimateUnit: 'workdays' as const,
        },
      ],
      { at: 1, by: OWNER },
    );
    if (zone !== 'UTC')
      await plan.stores.projects.setTimezone(project.id, zone, { at: 1, by: OWNER });
    const created = await plan.service.create(project.id, OWNER, {
      parentId: null,
      afterId: null,
      name: 'Strip',
    });
    if (!created.ok) throw new Error(`create failed: ${created.reason}`);
    const leaf = created.value.id;
    const attempt = async (
      stepId: string,
      attemptNumber: number,
      startedAt: number,
      endedAt: number | null,
    ) => {
      await plan.stores.attempts.restore(
        {
          workItemId: leaf,
          stepId,
          attemptNumber,
          startedAt,
          ...(endedAt === null
            ? { endedAt: null, outcome: null }
            : { endedAt, outcome: 'succeeded' as const }),
          executorPersonId: null,
          reference: null,
          note: null,
        },
        { at: 1, by: OWNER },
      );
    };
    const facts = async () => {
      const tree = await plan.service.tree(project.id);
      const row = tree?.workItems.find((each) => each.id === leaf);
      if (row === undefined) throw new Error('leaf vanished');
      return { factStart: row.factStart, factEnd: row.factEnd };
    };
    return { plan, leaf, attempt, facts };
  }

  it("done fills the fact end from the last attempt's end day in the project zone", async () => {
    const { plan, leaf, attempt, facts } = await clockedLeaf(
      Date.UTC(2026, 9, 11, 9, 0),
      'Europe/Kyiv',
    );
    await attempt(DEV, 1, Date.UTC(2026, 9, 8, 8, 0), Date.UTC(2026, 9, 8, 12, 0));
    // 22:30Z on the 9th is the 10th in Kyiv, and later than attempt 1's end.
    await attempt(QA, 1, Date.UTC(2026, 9, 9, 9, 0), Date.UTC(2026, 9, 9, 22, 30));
    expect((await plan.service.setStatus(leaf, OWNER, 'done')).ok).toBe(true);
    expect(await facts()).toEqual({ factStart: '2026-10-08', factEnd: '2026-10-10' });
  });

  it("in_progress fills the fact start from the first attempt's start day", async () => {
    const { plan, leaf, attempt, facts } = await clockedLeaf(Date.UTC(2026, 9, 11, 9, 0));
    await attempt(QA, 1, Date.UTC(2026, 9, 7, 8, 0), null);
    await attempt(DEV, 1, Date.UTC(2026, 9, 5, 23, 59), Date.UTC(2026, 9, 6, 1, 0));
    expect((await plan.service.setStatus(leaf, OWNER, 'in_progress')).ok).toBe(true);
    expect(await facts()).toEqual({ factStart: '2026-10-05', factEnd: null });
  });

  it('no attempt fills the day of the act, byte-identical to today', async () => {
    const { plan, leaf, facts } = await clockedLeaf(Date.UTC(2026, 8, 12, 23, 30));
    expect((await plan.service.setStatus(leaf, OWNER, 'done')).ok).toBe(true);
    // The fill a UTC project always wrote; the fact start stays empty as before.
    expect(await facts()).toEqual({ factStart: null, factEnd: '2026-09-12' });
  });

  it('a typed day is never overwritten, and an explicit on and factStart win', async () => {
    const { plan, leaf, attempt, facts } = await clockedLeaf(Date.UTC(2026, 9, 11, 9, 0));
    await attempt(DEV, 1, Date.UTC(2026, 9, 9, 8, 0), Date.UTC(2026, 9, 10, 2, 0));
    expect(
      (await plan.service.patch(leaf, OWNER, { factStart: '2026-10-01', factEnd: '2026-10-02' }))
        .ok,
    ).toBe(true);
    expect((await plan.service.setStatus(leaf, OWNER, 'done')).ok).toBe(true);
    expect(await facts()).toEqual({ factStart: '2026-10-01', factEnd: '2026-10-02' });

    const other = await clockedLeaf(Date.UTC(2026, 9, 11, 9, 0));
    await other.attempt(DEV, 1, Date.UTC(2026, 9, 9, 8, 0), Date.UTC(2026, 9, 10, 2, 0));
    expect(
      (await other.plan.service.setStatus(other.leaf, OWNER, 'done', '2026-10-11', '2026-10-03'))
        .ok,
    ).toBe(true);
    expect(await other.facts()).toEqual({ factStart: '2026-10-03', factEnd: '2026-10-11' });
  });

  it('Kyiv at 23:30Z fills the next day', async () => {
    const { plan, leaf, facts } = await clockedLeaf(Date.UTC(2026, 8, 12, 23, 30), 'Europe/Kyiv');
    expect((await plan.service.setStatus(leaf, OWNER, 'done')).ok).toBe(true);
    expect(await facts()).toEqual({ factStart: null, factEnd: '2026-09-13' });
  });

  it('the attempt is the better witness: a UTC Dev attempt across midnight', async () => {
    const { plan, leaf, attempt, facts } = await clockedLeaf(Date.UTC(2026, 9, 11, 12, 0));
    await attempt(DEV, 1, Date.UTC(2026, 9, 9, 8, 0), Date.UTC(2026, 9, 10, 2, 0));
    expect((await plan.service.setStatus(leaf, OWNER, 'done')).ok).toBe(true);
    expect(await facts()).toEqual({ factStart: '2026-10-09', factEnd: '2026-10-10' });
  });
});
