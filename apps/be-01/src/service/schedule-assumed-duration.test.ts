import { ASSUMED_SLICE_WORKDAYS } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { WorkItem } from '../repository';
import { rollUp } from './roll-up';
import type { DependencyEdge, PoolSizes, Schedule, ScheduledSlice, Slice } from './schedule';
import { schedule, sliceKey } from './schedule';

/**
 * What a slice nobody has estimated occupies, and what it still reports.
 *
 * Two claims, and the second is the risky one. The engine gives an unestimated
 * slice {@link ASSUMED_SLICE_WORKDAYS} workdays so that the **order** of a
 * half-estimated plan is believable — and nothing anywhere starts calling that
 * slice estimated. The numbers below are written as literals rather than as
 * arithmetic on the constant: a test that computes its expectation from the
 * thing under test moves with it and can never see it move.
 */

const DESIGN = 'role-design';
const DEV = 'role-dev';
const QA = 'role-qa';
const PLATFORM = 'team-platform';

let position = 0;
const item = (
  id: string,
  overrides: Partial<Pick<WorkItem, 'parentId' | 'maxParallel' | 'serviceTeamId'>> = {},
): WorkItem => ({
  id,
  projectId: 'p1',
  parentId: null,
  position: (position += 10),
  name: id,
  notes: '',
  frozenNumber: null,
  priority: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
  serviceId: null,
  maxParallel: 1,
  revision: 0,
  ...overrides,
});

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({
  predecessorId,
  successorId,
});

const slice = (
  workItemId: string,
  roleId: string,
  days: number | null,
  extra: Partial<Pick<Slice, 'personId' | 'width' | 'poolIds'>> = {},
): Slice => ({ workItemId, roleId, days, personId: null, width: 1, poolIds: [], ...extra });

/** One slice's schedule, or a throw — a missing key is a broken fixture, not a null. */
const planned = (found: Schedule, workItemId: string, roleId: string): ScheduledSlice => {
  const one = found.slices.get(sliceKey(workItemId, roleId));
  if (one === undefined) throw new Error(`no slice for ${workItemId}/${roleId}`);
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
          clashes.push(`${personId}: ${left.workItemId}/${left.roleId ?? ''} and ${right.workItemId}/${right.roleId ?? ''}`);
      }
    }
  }
  return clashes;
}

const pool = (size: number): PoolSizes => new Map([[PLATFORM, size]]);

describe('an unestimated slice takes its assumed duration', () => {
  it('is two workdays wide, and says so in its own dates', () => {
    const found = schedule([item('a')], [], [slice('a', DEV, null)]);

    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
    expect(ASSUMED_SLICE_WORKDAYS).toBe(2);
  });

  it('an entirely unestimated predecessor delays its successor', () => {
    // The change's headline, and the clearest demonstration of it. `A` holds
    // two steps and nobody has estimated either, so it runs 0→2→4 rather than
    // finishing where it starts; `B` waits for the finish it now has.
    //
    // Before this change every one of these numbers was 0: `A` was a work item
    // of no days, its anchor fell through to a finish that was its own start,
    // and `B` began on day zero beside the work it depends on.
    const rows = [item('A'), item('B')];
    const slices = [
      slice('A', DEV, null),
      slice('A', QA, null),
      slice('B', DEV, 1),
      slice('B', QA, null),
    ];

    const found = schedule(rows, [edge('A', 'B')], slices);

    expect(planned(found, 'A', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
    expect(planned(found, 'A', QA)).toMatchObject({ earliestStart: 2, earliestFinish: 4 });
    expect(projectionOf(found, 'A')).toMatchObject({ earliestStart: 0, earliestFinish: 4 });
    expect(projectionOf(found, 'B').earliestStart).toBe(4);
  });

  it('an explicit zero is still zero, because somebody said so', () => {
    // The distinction the whole change rests on, kept: `null` is nobody having
    // looked and `0` is somebody saying this step costs nothing. Only the first
    // gets an assumption.
    //
    // Proof: `durationOf` written as `slice.days ? … : ASSUMED_SLICE_WORKDAYS`
    // — the truthiness test instead of the null test — and this failed on
    // `expected 0 to be 2` for `A`'s own finish, an estimate of zero days
    // silently overruled; watched 2026-08-29.
    const found = schedule([item('A'), item('B')], [edge('A', 'B')], [
      slice('A', DEV, 0),
      slice('B', DEV, 1),
    ]);

    expect(planned(found, 'A', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 0 });
    expect(projectionOf(found, 'B').earliestStart).toBe(0);
  });

  it('two unestimated slices for one person do not overlap', () => {
    // D3: the assumption reaches leveling. A duration the dependency graph sees
    // and the resource model does not would draw one person doing two things at
    // once on exactly the rows nobody has sized.
    //
    // Proof: the assumed duration applied in `groupByWorkItem`'s offsets only
    // and `duration > 0` on the person floor left reading the raw
    // `slice.days ?? 0`, so an unestimated slice takes time but occupies
    // nobody — this failed on `expected [ 'kat: b/role-dev and a/role-dev',
    // 'kat: a/role-dev and b/role-dev' ] to equal []`; watched 2026-08-29.
    const rows = [item('a'), item('b')];
    const slices = [slice('a', DEV, null, { personId: 'kat' }), slice('b', DEV, null, { personId: 'kat' })];

    const found = schedule(rows, [], slices);

    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
    expect(planned(found, 'b', DEV)).toMatchObject({
      earliestStart: 2,
      earliestFinish: 4,
      boundBy: 'person',
    });
    expect(overlaps(found)).toEqual([]);
  });

  it('an unestimated slice spends its team’s pool', () => {
    // The same claim for the other resource. One slot on `PLATFORM`, three
    // unestimated slices labelled with it, nobody assigned: they queue rather
    // than all starting on day zero.
    const rows = [
      item('a', { serviceTeamId: PLATFORM }),
      item('b', { serviceTeamId: PLATFORM }),
      item('c', { serviceTeamId: PLATFORM }),
    ];
    const slices = [
      slice('a', DEV, null, { poolIds: [PLATFORM] }),
      slice('b', DEV, null, { poolIds: [PLATFORM] }),
      slice('c', DEV, null, { poolIds: [PLATFORM] }),
    ];

    const found = schedule(rows, [], slices, undefined, pool(1));

    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
    expect(planned(found, 'b', DEV)).toMatchObject({
      earliestStart: 2,
      earliestFinish: 4,
      boundBy: 'capacity',
    });
    expect(planned(found, 'c', DEV)).toMatchObject({ earliestStart: 4, earliestFinish: 6 });
  });

  it('a not-before floor still only ever pushes it later', () => {
    // The third constraint named in the spec. The assumption is a width, never
    // a pin: a slice told "not before day 5" starts on day 5 and runs two days
    // from there.
    const found = schedule(
      [item('a')],
      [],
      [slice('a', DEV, null)],
      new Map([['a', 5]]),
    );

    expect(planned(found, 'a', DEV)).toMatchObject({ earliestStart: 5, earliestFinish: 7 });
  });
});

describe('an assumed duration is not an estimate', () => {
  it('an unestimated item still reports no estimate', () => {
    // D2, the change's real risk, on every reporter be-01 owns. The slice has a
    // span now and it still has no estimate: `estimated` is false, the duration
    // it reports is the effort nobody supplied rather than the width it was
    // given, and the roll-up has no entry for the pair at all.
    //
    // `duration` and the span are allowed to disagree here, and that is the
    // point: `duration` is expected days, the span is where the schedule put
    // it, and this change moved the second without inventing the first. The
    // Duration column of the markdown export reads `duration`, so a `2` here
    // would be an export claiming somebody estimated two days.
    //
    // Proof: `estimated` written as `durationOf(slice) > 0` — the
    // "has a duration" predicate D2 names — and this failed on
    // `expected true to be false`, with the anchor test below and the
    // end-column marker in `wbs-table.test.tsx` going red beside it; watched
    // 2026-08-29.
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
    // The specific trap D2 names. `A`'s `Design` is unestimated and now has a
    // span, so "the first slice with a duration" and "the first slice somebody
    // estimated" have stopped being the same slice. The anchor is still the
    // second: `B` waits for `A`'s `Dev` at day 6, not for the assumed `Design`
    // finish at day 2.
    //
    // Proof: the anchor's `slice.days !== null` replaced by
    // `offsets[at + 1] - offsets[at] > 0` and this failed on
    // `expected 2 to be 6` — every edge in a plan that lists a step nobody
    // estimated anchoring on that step; watched 2026-08-29.
    const rows = [item('A'), item('B')];
    const slices = [
      slice('A', DESIGN, null),
      slice('A', DEV, 4),
      slice('A', QA, null),
      slice('B', DESIGN, 1),
    ];

    const found = schedule(rows, [edge('A', 'B')], slices);

    expect(planned(found, 'A', DESIGN)).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
    expect(planned(found, 'A', DEV)).toMatchObject({ earliestStart: 2, earliestFinish: 6 });
    expect(projectionOf(found, 'B').earliestStart).toBe(6);
  });
});
