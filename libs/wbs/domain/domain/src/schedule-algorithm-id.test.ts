import { readFileSync } from 'node:fs';

import { type } from 'arktype';
import { beforeAll, describe, expect, it } from 'bun:test';

import type { PlannedRow } from './derive-numbers';
import type { DependencyReach } from './index';
import { readLegacyPlainSchedule1 } from './saved-plan/legacy-plain-schedule1';
import { readSavedPlainScheduleBody } from './saved-plan/versioned-plain-schedule';
import type {
  DependencyEdge,
  PoolSizes,
  Schedule,
  Scheduled,
  ScheduledSlice,
  Slice,
} from './schedule';
import { schedule, SCHEDULE_ALGORITHM_ID } from './schedule';

/** The engine's own signature, so the negatives below can stand in for it. */
type ScheduleFn = (
  rows: readonly PlannedRow[],
  edges: readonly DependencyEdge[],
  slices: readonly Slice[],
  notBefore?: ReadonlyMap<string, number>,
  poolSizes?: PoolSizes,
  reach?: DependencyReach,
) => Schedule;

interface ScheduleCase {
  name: string;
  rows: readonly PlannedRow[];
  edges: readonly DependencyEdge[];
  slices: readonly Slice[];
  notBefore?: ReadonlyMap<string, number>;
  poolSizes?: PoolSizes;
  reach?: DependencyReach;
}

const DEV = 'step-dev';
const QA = 'step-qa';

const item = (id: string, parentId: string | null, position: number): PlannedRow => ({
  id,
  parentId,
  position,
  frozenNumber: null,
  priority: null,
});

const slice = (
  workItemId: string,
  stepId: string | null,
  days: number | null,
  extra: Partial<Slice> = {},
): Slice => ({
  workItemId,
  stepId,
  days,
  personId: null,
  width: 1,
  poolIds: [],
  ...extra,
});

/**
 * Plans chosen so that every mechanism in the pass decides something.
 *
 * Each case exists to make one class of edit visible: drop a case and the
 * semantics it covers can change under a green digest. A chain and a diamond
 * pin the forward and backward passes and therefore float and criticality; the
 * step case pins `stepOrder`; the `notBefore` case pins that a manual floor
 * pushes and never pins; the person case pins the levelling queue and
 * `waitingForPerson`; the pool case pins reservations, `capacityTeamId`, the
 * whole `capacityPredecessorIds` set and `waitingForCapacity`; the unestimated
 * case pins that an unknown length takes no schedule time, and the `estimated`
 * flag; and the
 * `anchor-slice` case pins the reach mode, which is a parameter whose default
 * changing is exactly the kind of silent semantics change this file is for.
 *
 * The reach case earned its place on the way in. It was first written with a
 * `reach` of `'first-slice'` — a value `DependencyReach` does not have. `bun
 * test` does not typecheck, so it ran, took the not-`'anchor-slice'` branch and
 * produced a perfectly stable digest; only `tsc` caught it. The digest moved
 * from `136e8314b76e0398` to `5f5d507bdf199577` when the value was corrected,
 * which is this guard doing on its own author exactly what it is here to do to
 * everyone else: a changed placement is a changed digest.
 *
 * The corpus is fixed, not generated. A random corpus would make the pinned
 * digest a seed's property rather than the engine's.
 */
const CORPUS: readonly ScheduleCase[] = [
  {
    name: 'chain with a shared successor',
    rows: [item('a', null, 10), item('b', null, 20), item('c', null, 30)],
    edges: [
      { predecessorId: 'a', successorId: 'c' },
      { predecessorId: 'b', successorId: 'c' },
    ],
    slices: [slice('a', DEV, 2), slice('b', DEV, 5), slice('c', DEV, 1)],
  },
  {
    name: 'diamond under a parent, edges declared on the parent',
    rows: [item('p', null, 10), item('p1', 'p', 10), item('p2', 'p', 20), item('after', null, 20)],
    edges: [{ predecessorId: 'p', successorId: 'after' }],
    slices: [slice('p1', DEV, 3), slice('p2', DEV, 4), slice('after', DEV, 2)],
  },
  {
    name: 'two steps on one work item',
    rows: [item('a', null, 10), item('b', null, 20)],
    edges: [{ predecessorId: 'a', successorId: 'b' }],
    slices: [slice('a', DEV, 3), slice('a', QA, 2), slice('b', DEV, 1)],
  },
  {
    name: 'a manual floor that pushes, and one that does not',
    rows: [item('a', null, 10), item('b', null, 20)],
    edges: [{ predecessorId: 'a', successorId: 'b' }],
    slices: [slice('a', DEV, 4), slice('b', DEV, 2)],
    notBefore: new Map([
      ['a', 3],
      ['b', 1],
    ]),
  },
  {
    name: 'one person on two independent work items',
    rows: [item('a', null, 10), item('b', null, 20)],
    edges: [],
    slices: [slice('a', DEV, 3, { personId: 'kat' }), slice('b', DEV, 2, { personId: 'kat' })],
  },
  {
    name: 'a pool of two holding a width-two block',
    rows: [item('a', null, 10), item('b', null, 20), item('x', null, 30)],
    edges: [],
    slices: [
      slice('a', DEV, 5, { poolIds: ['team-1'] }),
      slice('b', DEV, 7, { poolIds: ['team-1'] }),
      slice('x', DEV, 4, { poolIds: ['team-1'], width: 2 }),
    ],
    poolSizes: new Map([['team-1', 2]]),
  },
  {
    name: 'an unestimated leaf beside an estimated one',
    rows: [item('a', null, 10), item('b', null, 20)],
    edges: [{ predecessorId: 'a', successorId: 'b' }],
    slices: [slice('a', DEV, null), slice('b', DEV, 2)],
  },
  {
    name: 'the same plan under anchor-slice reach',
    rows: [item('a', null, 10), item('b', null, 20)],
    edges: [{ predecessorId: 'a', successorId: 'b' }],
    slices: [slice('a', DEV, 3), slice('a', QA, 2), slice('b', DEV, 1)],
    reach: 'anchor-slice',
  },
];

/**
 * `eventsVisited` is excluded, and it is the only exclusion.
 *
 * It counts the levelling window's work — instrumentation about the run, not
 * about the plan — so an optimization that visits fewer events and places every
 * slice identically would move the digest and demand a bump this file exists to
 * make meaningful. The same key is excluded from the stored schedule body for
 * the same reason (`saved-plans` tasks.md 3.4).
 *
 * Everything else is taken from the value rather than listed, so a field
 * `Scheduled` or `Schedule` gains later is digested the day it is added. An
 * enumerated list would stay green across exactly the change nobody remembered
 * to add to it.
 */
const INSTRUMENTATION_KEY: keyof Schedule = 'eventsVisited';

const semanticPart = (result: Schedule): Record<string, unknown> => {
  const source = result as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      // Proof: also omitting futureField failed the added-field comparison at the top level.
      .filter((key) => key !== INSTRUMENTATION_KEY)
      .map((key) => [key, source[key]]),
  );
};

/** Maps in key order, objects in key order, so the serialization is stable. */
const stable = (value: unknown): unknown => {
  if (value instanceof Map) {
    const entries = [...(value as Map<string, unknown>).entries()];
    return entries
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, stable(entry)]);
  }
  if (Array.isArray(value)) return (value as unknown[]).map(stable);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, stable(source[key])]),
    );
  }
  return value;
};

/**
 * FNV-1a, twice, at two offsets — sixteen hex characters.
 *
 * Written out rather than imported because `domain` is tagged
 * `runtime:isomorphic` and may not reach a runtime module. Nothing here is a
 * security property: the digest only has to change when the serialization
 * changes, and a person has to be able to read it in a diff.
 */
const digestOf = (text: string): string => {
  const pass = (offset: number): string => {
    let hash = offset;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  return `${pass(0x811c9dc5)}${pass(0x9e3779b9)}`;
};

/** Every raw engine fact in the original case order, excluding only run instrumentation. */
function serializeCorpus(run: ScheduleFn): string {
  return JSON.stringify(
    CORPUS.map((plan) => [
      plan.name,
      stable(
        semanticPart(
          run(plan.rows, plan.edges, plan.slices, plan.notBefore, plan.poolSizes, plan.reach),
        ),
      ),
    ]),
  );
}

/**
 * The Fast arithmetic identity and digest originally measured in the plain1 vocabulary.
 *
 * `v1` was `5f5d507bdf199577`, and this is what moved it: tasks.md 5.1 and 5.2.
 *
 * **Recorded because the digest cannot say what changed and this file's whole
 * value is that somebody had to look.** The corpus above passes no deadlines,
 * so 5.1's reordering ties on both new comparisons and moved not one date in
 * it — the digest moved on 5.2 alone, the `lateBy` field now published on every
 * slice, which reads `null` throughout this deadline-free corpus. That is a
 * shape change rather than a placement change, and it is still an identity
 * change: a `v1` plan carries no `lateBy` at all, so a reader that found the
 * field absent could not tell "computed before the field existed" from
 * "computed and on time".
 *
 * The measurement was on h2puni at the committed bytes, not on the workspace
 * box, and both values are in this comment so a future re-pin can be checked
 * against the one it replaced.
 *
 * `v2` was `18b55455829f4eb1`. `v3` moved it through the corpus's unestimated
 * case alone: WBS 010.4.4 gives an unknown slice zero schedule time instead of
 * `ASSUMED_SLICE_WORKDAYS`. Measured on the workstation 2026-09-27.
 * `v4` preserves this FS-only digest because it dispatches those graphs to the
 * v3 engine; weighted cases are asserted in `schedule-weighted.test.ts`.
 */

const PINNED = {
  id: 'slice-leveling-v4',
  digest: 'f0145c81759486b5',
} as const;

/** The plain1 writer at c8018843e captured each original corpus case with a null calendar anchor. */
const captures = type(['string', 'unknown'])
  .array()
  .assert(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/schedule-algorithm-v4-plain1.json', import.meta.url),
        'utf8',
      ),
    ),
  );

type CapturedTiming = ReturnType<typeof readLegacyPlainSchedule1>['workItems'][string];

/** The original producer used a null calendar anchor for every case. */
function capturedTimings(timings: Readonly<Record<string, CapturedTiming>>) {
  return new Map(
    Object.entries(timings).map(([key, { startsOn, endsOn, ...timing }]) => {
      expect(startsOn).toBeNull();
      expect(endsOn).toBeNull();
      return [key, timing] as const;
    }),
  );
}

/** Recover the original raw facts or the production reader's forward projection of those facts. */
function serializeCapturedCorpus(version: 1 | 3): string {
  return JSON.stringify(
    captures.map(([name, capture]) => {
      const body =
        version === 1 ? readLegacyPlainSchedule1(capture) : readSavedPlainScheduleBody(capture, 1);
      const { version: bodyVersion, algorithmId, slices, workItems, ...counts } = body;
      expect(bodyVersion).toBe(version);
      expect(algorithmId).toBe(PINNED.id);
      return [
        name,
        stable({
          ...counts,
          slices: capturedTimings(slices),
          workItems: capturedTimings(workItems),
        }),
      ];
    }),
  );
}

/** One perturbed value of the same shape — the smallest change a real edit makes. */
const perturbed = (value: unknown): unknown => {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'string') return `${value}~`;
  if (Array.isArray(value)) return [...(value as unknown[]), 'perturbation'];
  return 'perturbation';
};

/** The real engine with one field of one slice moved, standing in for a semantics change. */
const engineWithSliceFieldMoved =
  (field: string, change = perturbed): ScheduleFn =>
  (...args) => {
    const real = schedule(...args);
    const slices = new Map(real.slices);
    const firstKey = [...slices.keys()].sort()[0];
    const target = slices.get(firstKey) as unknown as Record<string, unknown>;
    slices.set(firstKey, {
      ...target,
      [field]: change(target[field]),
    } as unknown as ScheduledSlice);
    return { ...real, slices };
  };

/** The same, one field of one **work item** — the projection the table reads. */
const engineWithWorkItemFieldMoved =
  (field: string): ScheduleFn =>
  (...args) => {
    const real = schedule(...args);
    const workItems = new Map(real.workItems);
    const firstKey = [...workItems.keys()].sort()[0];
    const target = workItems.get(firstKey) as unknown as Record<string, unknown>;
    workItems.set(firstKey, {
      ...target,
      [field]: perturbed(target[field]),
    } as unknown as Scheduled);
    return { ...real, workItems };
  };

/** The same, one of the top-level counts. */
const engineWithCountMoved =
  (field: string): ScheduleFn =>
  (...args) => {
    const real = schedule(...args);
    return { ...real, [field]: perturbed((real as unknown as Record<string, unknown>)[field]) };
  };

const sample = schedule(
  CORPUS[0].rows,
  CORPUS[0].edges,
  CORPUS[0].slices,
  CORPUS[0].notBefore,
  CORPUS[0].poolSizes,
  CORPUS[0].reach,
);
const sampleSlice = [...sample.slices.values()][0];
const sampleWorkItem = [...sample.workItems.values()][0];
const SLICE_FIELDS = Object.keys(sampleSlice);
const WORK_ITEM_FIELDS = Object.keys(sampleWorkItem);
const COUNT_FIELDS = Object.keys(semanticPart(sample)).filter(
  (key) => key !== 'slices' && key !== 'workItems',
);

let projectedCorpus: string;

beforeAll(() => {
  projectedCorpus = serializeCapturedCorpus(3);
});

describe('the scheduling algorithm identity', () => {
  it('is a monotonically versioned engine name', () => {
    expect(SCHEDULE_ALGORITHM_ID).toMatch(/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/);
  });

  it('is the id the pinned behaviour was pinned against', () => {
    // Not a tautology across time: `PINNED.id` is what the digest below was
    // measured under, so bumping the constant without re-measuring fails here
    // rather than shipping a new id attached to old evidence.
    expect(SCHEDULE_ALGORITHM_ID).toBe(PINNED.id);
  });

  it('reproduces the original v4 digest from all eight plain1 captures in order', () => {
    expect(captures.map(([name]) => name)).toEqual(CORPUS.map((plan) => plan.name));
    // Proof: increasing one original slice's earliestFinish failed this historical pin.
    expect(digestOf(serializeCapturedCorpus(1))).toBe(PINNED.digest);
  });

  it('matches every current engine fact against the forward-projected original captures', () => {
    // Proof: projecting the start floor to predecessor or adding one to the engine's slice
    // duration independently failed this comparison.
    expect(serializeCorpus(schedule)).toBe(projectedCorpus);
  });
});

describe('the v4 corpus notices a semantics change', () => {
  it('reads every field of a scheduled slice, whatever they are', () => {
    // A precondition, not decoration: an empty field list would make every
    // `it.each` below vacuous and the suite would pass having proved nothing.
    expect(SLICE_FIELDS.length).toBeGreaterThan(5);
    for (const field of SLICE_FIELDS) {
      expect(serializeCorpus(engineWithSliceFieldMoved(field))).not.toBe(projectedCorpus);
    }
  });

  it('reads every field of a work item projection, whatever they are', () => {
    expect(WORK_ITEM_FIELDS.length).toBeGreaterThan(5);
    for (const field of WORK_ITEM_FIELDS) {
      expect(serializeCorpus(engineWithWorkItemFieldMoved(field))).not.toBe(projectedCorpus);
    }
  });

  it('reads the top-level counts, whatever they are', () => {
    expect(COUNT_FIELDS).toContain('waitingForPerson');
    expect(COUNT_FIELDS).toContain('waitingForCapacity');
    for (const field of COUNT_FIELDS) {
      expect(serializeCorpus(engineWithCountMoved(field))).not.toBe(projectedCorpus);
    }
  });

  it('detects an added field at every level', () => {
    for (const change of [
      engineWithSliceFieldMoved,
      engineWithWorkItemFieldMoved,
      engineWithCountMoved,
    ]) {
      expect(serializeCorpus(change('futureField'))).not.toBe(projectedCorpus);
    }
  });

  it('detects a current engine that emits the historical start-floor spelling', () => {
    const legacyFloor = (value: unknown) => (value === 'workPackageStart' ? 'projectStart' : value);
    expect(serializeCorpus(engineWithSliceFieldMoved('boundBy', legacyFloor))).not.toBe(
      projectedCorpus,
    );
  });

  it('stays silent on instrumentation, which is the one thing it excludes', () => {
    const withOtherEventCount: ScheduleFn = (...args) => ({
      ...schedule(...args),
      eventsVisited: schedule(...args).eventsVisited + 1000,
    });
    expect(serializeCorpus(withOtherEventCount)).toBe(projectedCorpus);
  });

  it('is stable across runs of the same engine', () => {
    expect(serializeCorpus(schedule)).toBe(projectedCorpus);
  });
});
