import type { DependencyEdge, PoolSizes, Schedule, ScheduledSlice, Slice } from '@wbs/domain';
import { schedule, sliceKey } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { WorkItem } from '../repository';
import { workItemRow } from '../testing/work-item-fixture';
import { rollUp } from './roll-up';

/**
 * What a slice nobody has estimated occupies, and what it still reports.
 *
 * It occupies nothing: an unknown length is drawn `ASSUMED_SLICE_WORKDAYS`
 * wide on the Gantt, and the schedule gives it zero time (OpenSpec
 * `unestimated-steps-take-no-schedule-time`). It still stays a dependency node
 * and still reports itself unestimated. The numbers are literals rather than
 * arithmetic on the constant, so moving the constant cannot move them.
 */

const DESIGN = 'step-design';
const DEV = 'step-dev';
const QA = 'step-qa';
const PLATFORM = 'team-platform';

let position = 0;
const item = (
  id: string,
  overrides: Partial<Pick<WorkItem, 'parentId' | 'maxParallel' | 'serviceTeamId'>> = {},
): WorkItem =>
  workItemRow({
    id,
    projectId: 'p1',
    position: (position += 10),
    name: id,
    ...overrides,
  });

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({
  predecessorId,
  successorId,
});

const slice = (
  workItemId: string,
  stepId: string,
  days: number | null,
  extra: Partial<Pick<Slice, 'personId' | 'width' | 'poolIds'>> = {},
): Slice => ({ workItemId, stepId, days, personId: null, width: 1, poolIds: [], ...extra });

/** One slice's schedule, or a throw — a missing key is a broken fixture, not a null. */
const planned = (found: Schedule, workItemId: string, stepId: string): ScheduledSlice => {
  const one = found.slices.get(sliceKey(workItemId, stepId));
  if (one === undefined) throw new Error(`no slice for ${workItemId}/${stepId}`);
  return one;
};

/** One work item's projection, or a throw — asserting on `undefined` asserts nothing. */
const projectionOf = (found: Schedule, id: string) => {
  const row = found.workItems.get(id);
  if (row === undefined) throw new Error(`${id} lost its schedule`);
  return row;
};

/** Every pair of one person's slices that share a day — empty is the whole promise. */
function overlaps(found: Schedule): string[] {
  const byPerson = new Map<string, ScheduledSlice[]>();
  for (const one of found.slices.values()) {
    if (one.personId === null) continue;
    byPerson.set(one.personId, [...(byPerson.get(one.personId) ?? []), one]);
  }
  const clashes: string[] = [];
  for (const [personId, own] of byPerson) {
    for (const left of own) {
      for (const right of own) {
        if (left === right) continue;
        if (left.earliestStart < right.earliestFinish && right.earliestStart < left.earliestFinish)
          clashes.push(
            `${personId}: ${left.workItemId}/${left.stepId ?? ''} and ${right.workItemId}/${right.stepId ?? ''}`,
          );
      }
    }
  }
  return clashes;
}

const pool = (size: number): PoolSizes => new Map([[PLATFORM, size]]);

describe('an unestimated slice takes no schedule time', () => {
  it('finishes where it starts', () => {
    const found = schedule([item('a')], [], [slice('a', DEV, null)]);

    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
  });

  it('an entirely unestimated predecessor does not delay its successor', () => {
    // `A` holds two steps and nobody has estimated either. It is still the
    // node `B` waits for, and it finishes where it starts, so `B` begins on
    // day zero and the project ends when `B`'s one estimated day does.
    const rows = [item('A'), item('B')];
    const slices = [
      slice('A', DEV, null),
      slice('A', QA, null),
      slice('B', DEV, 1),
      slice('B', QA, null),
    ];

    const found = schedule(rows, [edge('A', 'B')], slices);

    expect(planned(found, 'A', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(planned(found, 'A', QA)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(projectionOf(found, 'A')).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(projectionOf(found, 'B')).toMatchObject({ earliestStart: 0, earliestFinish: 1 });
  });

  it('still transmits a real floor through the unknown node', () => {
    // A zero-time node is still a node: `A` cannot start before day 5, so the
    // unknown `A` sits at 5 and `B` behind it starts at 5, not at 0.
    const found = schedule(
      [item('A'), item('B')],
      [edge('A', 'B')],
      [slice('A', DEV, null), slice('B', DEV, 1)],
      new Map([['A', 5]]),
    );

    expect(planned(found, 'A', DEV)).toMatchObject({ earliestStart: 5, earliestFinish: 5 });
    expect(projectionOf(found, 'B')).toMatchObject({ earliestStart: 5, earliestFinish: 6 });
  });

  it('an explicit zero is zero time and still estimated', () => {
    // `null` is nobody having looked and `0` is somebody saying this step
    // costs nothing. They share the arithmetic and differ in the report.
    const found = schedule(
      [item('A'), item('B')],
      [edge('A', 'B')],
      [slice('A', DEV, 0), slice('B', DEV, 1)],
    );

    expect(planned(found, 'A', DEV)).toMatchObject({
      earliestStart: 0,
      earliestFinish: 0,
      estimated: true,
    });
    expect(projectionOf(found, 'B').earliestStart).toBe(0);
  });

  it('unestimated slices for one person share an instant and push no estimated work', () => {
    // Nobody is occupied for zero days: two unknown slices assigned to `kat`
    // both stand at day zero, and `kat`'s estimated `c` is not queued behind
    // any visual span.
    const rows = [item('a'), item('b'), item('c')];
    const slices = [
      slice('a', DEV, null, { personId: 'kat' }),
      slice('b', DEV, null, { personId: 'kat' }),
      slice('c', DEV, 3, { personId: 'kat' }),
    ];

    const found = schedule(rows, [], slices);

    expect(overlaps(found)).toEqual([]);
    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(planned(found, 'b', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(planned(found, 'b', DEV).boundBy).not.toBe('person');
    expect(planned(found, 'c', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 3 });
  });

  it('an unestimated slice spends none of its team’s pool', () => {
    // One slot on `PLATFORM`, two unknown slices and one estimated one, all
    // labelled with it: the unknown pair take no slot, so the estimated `c`
    // starts on day zero rather than behind their drawings.
    const rows = [
      item('a', { serviceTeamId: PLATFORM }),
      item('b', { serviceTeamId: PLATFORM }),
      item('c', { serviceTeamId: PLATFORM }),
    ];
    const slices = [
      slice('a', DEV, null, { poolIds: [PLATFORM] }),
      slice('b', DEV, null, { poolIds: [PLATFORM] }),
      slice('c', DEV, 2, { poolIds: [PLATFORM] }),
    ];

    const found = schedule(rows, [], slices, undefined, pool(1));

    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(planned(found, 'b', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(planned(found, 'b', DEV).boundBy).not.toBe('capacity');
    expect(planned(found, 'c', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
  });

  it('a parent’s bounds ignore the placeholder of an unknown last step', () => {
    // `P` holds an estimated `a` and an unknown `b` after it. `P` ends when
    // `a` does; `b`'s two drawn workdays are not schedule time.
    const rows = [item('P'), item('a', { parentId: 'P' }), item('b', { parentId: 'P' })];
    const found = schedule(rows, [edge('a', 'b')], [slice('a', DEV, 3), slice('b', DEV, null)]);

    expect(projectionOf(found, 'b')).toMatchObject({ earliestStart: 3, earliestFinish: 3 });
    expect(projectionOf(found, 'P')).toMatchObject({ earliestStart: 0, earliestFinish: 3 });
  });
});

describe('an assumed duration is not an estimate', () => {
  it('an unestimated item still reports no estimate', () => {
    // The Gantt draws this slice with a placeholder span and it still has no
    // estimate: `estimated` is false, `duration` is the effort nobody supplied,
    // and the roll-up has no entry for the pair. The markdown export's Duration
    // column reads `duration`, so a `2` here would claim an estimate.
    const found = schedule([item('a')], [], [slice('a', DEV, null)]);

    expect(planned(found, 'a', DEV)).toMatchObject({
      estimated: false,
      duration: 0,
      effort: 0,
    });
    expect(projectionOf(found, 'a')).toMatchObject({ estimated: false, duration: 0 });
    expect(rollUp([item('a')], []).get('a')?.size ?? 0).toBe(0);
  });

  it('the anchor reach still means first estimated', () => {
    // The anchor is the first slice somebody estimated, not the first one in
    // step order: `A`'s unknown `Design` takes no time and is walked past, so
    // `B` waits for `A`'s `Dev` at day 4.
    const rows = [item('A'), item('B')];
    const slices = [
      slice('A', DESIGN, null),
      slice('A', DEV, 4),
      slice('A', QA, null),
      slice('B', DESIGN, 1),
    ];

    // **The reach is named, and it has to be since `dep-reach-whole-item`
    // (2026-08-30).** This case is about the anchor walk, and the anchor walk
    // is one arm of a project's choice rather than the engine's only rule. Left
    // on the default it would schedule `whole-item` and test the other rule.
    const found = schedule(rows, [edge('A', 'B')], slices, undefined, undefined, 'anchor-slice');

    expect(planned(found, 'A', DESIGN)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(planned(found, 'A', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 4 });
    expect(projectionOf(found, 'B').earliestStart).toBe(4);

    // The default reach waits for the last slice, estimated or not; the
    // unknown `QA` stands at `Dev`'s finish and adds nothing to it.
    const whole = schedule(rows, [edge('A', 'B')], slices);

    expect(planned(whole, 'A', QA)).toMatchObject({ earliestStart: 4, earliestFinish: 4 });
    expect(projectionOf(whole, 'B').earliestStart).toBe(4);
  });
});
