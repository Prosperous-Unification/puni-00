import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import type { ProjectStore, WriteStamp } from '../../index';
import type { AvailableWorkItemService as WorkItemService } from '../../testing/available-work-item-service';
import type { RecordingBroadcaster } from '../../testing/broadcast-fixture';
import { inMemoryServices } from '../../testing/harness';

const OWNER = 'owner-account';
const PEER = 'peer-account';
const WROTE: WriteStamp = { at: 1, by: OWNER };
const DEV = 'step-dev';
const QA = 'step-qa';

let projects: ProjectStore;
let service: WorkItemService;
let broadcast: RecordingBroadcaster;
let projectId: string;

beforeEach(async () => {
  const harness = inMemoryServices();
  ({ projects } = harness.stores);
  ({ service, broadcast } = harness);
  projectId = crypto.randomUUID();
  await projects.create(
    projectRow({ id: projectId, ownerId: OWNER }),
    [
      { id: DEV, projectId, name: 'Dev', position: 10, allowancePercent: 0 },
      { id: QA, projectId, name: 'QA', position: 20, allowancePercent: 0 },
    ],
    WROTE,
  );
});

async function add(name: string, parentId: string | null = null): Promise<string> {
  const outcome = await service.create(projectId, OWNER, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.value.id;
}

async function estimate(id: string, stepId: string, days: number): Promise<void> {
  const outcome = await service.setEstimate(id, OWNER, stepId, {
    optimistic: days,
    realistic: days,
    pessimistic: days,
  });
  if (!outcome.ok) throw new Error(`estimate refused: ${outcome.reason}`);
}

async function allowance(percent: number, actorId = OWNER): Promise<void> {
  const outcome = await service.setStepAllowance(projectId, actorId, QA, percent);
  if (!outcome.ok) throw new Error(`allowance refused: ${outcome.reason}`);
}

async function qaAllowance(): Promise<number | undefined> {
  return (await projects.stepsOf(projectId)).find((step) => step.id === QA)?.allowancePercent;
}

async function finalsOf(id: string): Promise<Record<string, number>> {
  const tree = await service.tree(projectId);
  if (tree === null || 'kind' in tree) throw new Error('the plan read failed');
  const row = tree.workItems.find((each) => each.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row.finalDays;
}

async function qaSliceDays(id: string): Promise<number | null> {
  const input = await service.scheduleInput(projectId);
  if (input === null) throw new Error('no schedule input');
  const slice = input.slices.find((each) => each.workItemId === id && each.stepId === QA);
  if (slice === undefined) throw new Error(`no QA slice for ${id}`);
  return slice.days;
}

describe('a project step allowance', () => {
  it('charges each estimated leaf once and parents the sum, leaving raw points alone', async () => {
    const parent = await add('Release');
    const one = await add('One', parent);
    const two = await add('Two', parent);
    await estimate(one, QA, 2);
    await estimate(two, QA, 1.1);
    await estimate(two, DEV, 1.1);

    await allowance(30);

    expect((await finalsOf(one))[QA]).toBe(3);
    expect((await finalsOf(two))[QA]).toBe(2);
    expect((await finalsOf(two))[DEV]).toBe(2);
    expect((await finalsOf(parent))[QA]).toBe(5);
    const tree = await service.tree(projectId);
    if (tree === null || 'kind' in tree) throw new Error('the plan read failed');
    expect(tree.workItems.find((row) => row.id === one)?.estimates[QA]).toEqual({
      optimistic: 2,
      realistic: 2,
      pessimistic: 2,
    });
    expect(tree.steps.find((step) => step.id === QA)?.allowancePercent).toBe(30);
  });

  it('schedules charged effort, and the edit changes the canonical input', async () => {
    const leaf = await add('Leaf');
    await estimate(leaf, QA, 2);
    const before = await service.scheduleInput(projectId);
    if (before === null) throw new Error('no schedule input');

    await allowance(30);

    expect(await qaSliceDays(leaf)).toBe(3);
    const after = await service.scheduleInput(projectId);
    if (after === null) throw new Error('no schedule input');
    // What keys the optimized cache: an allowance edit is a different question,
    // so a row solved under the old policy is never read for the new one.
    expect(canonicalScheduleInput(after)).not.toBe(canonicalScheduleInput(before));
  });

  it('leaves an unknown estimate unknown and an explicit zero at zero', async () => {
    const unknown = await add('Unknown');
    const zero = await add('Zero');
    await estimate(zero, QA, 0);

    await allowance(1000);

    expect(await qaSliceDays(unknown)).toBeNull();
    expect(await qaSliceDays(zero)).toBe(0);
    expect((await finalsOf(unknown))[QA]).toBeUndefined();
    expect((await finalsOf(zero))[QA]).toBe(0);
  });

  it('announces the edited step', async () => {
    await allowance(12.5);

    expect(
      broadcast.published.some(
        (each) => each.event.type === 'step_updated' && each.event.step.allowancePercent === 12.5,
      ),
    ).toBe(true);
  });
});

describe('undoing a step allowance edit', () => {
  it('undoes an allowance edit in one step', async () => {
    await allowance(30);

    const undone = await service.undo(projectId, OWNER);

    expect(undone.ok).toBe(true);
    expect(await qaAllowance()).toBe(0);
    const redone = await service.redo(projectId, OWNER);
    expect(redone.ok).toBe(true);
    expect(await qaAllowance()).toBe(30);
  });

  /** Proof: see `set_step_allowance` in `WorkItemService.apply`. */
  it('refuses an allowance undo after somebody else changed it', async () => {
    await allowance(30);
    await allowance(50, PEER);

    const undone = await service.undo(projectId, OWNER);

    expect(undone).toMatchObject({
      ok: false,
      reason: 'stale_undo',
      detail: 'that step’s allowance has changed since then.',
    });
    expect(await qaAllowance()).toBe(50);
  });

  it('journals nothing for an edit that leaves the allowance where it was', async () => {
    await allowance(0);

    expect(await service.undo(projectId, OWNER)).toMatchObject({
      ok: false,
      reason: 'nothing_to_undo',
    });
  });

  it('refuses a step of another project as not found', async () => {
    const outcome = await service.setStepAllowance(projectId, OWNER, 'elsewhere', 30);

    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
  });
});
