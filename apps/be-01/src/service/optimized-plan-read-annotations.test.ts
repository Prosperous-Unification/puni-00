import { materialiseOptimized } from '@wbs/contracts/solver/materialise-optimized';
import { quantisedFastBaseline } from '@wbs/contracts/solver/quantised-baseline';
import { type ScheduleInput, sliceKey, SOLVER_QUANTUM } from '@wbs/domain';
import { beforeEach, describe, expect, it } from 'bun:test';

import type {
  CapacityStore,
  EstimateStore,
  ProjectStore,
  WorkItemStore,
  WriteStamp,
} from '../repository';
import { inMemoryServices } from '../testing/harness';
import { projectRow } from '../testing/project-fixture';
import type { OptimizedScheduleAsk } from './optimized-schedule-reader';
import { WorkItemService, type WorkItemServiceOptions } from './work-item.service';

/**
 * tasks.md 4.11 (a)–(c): the materialiser's annotations, asserted **through the
 * real plan-read payload** rather than against the domain type.
 *
 * The distinction is the whole item. `schedule-annotate.test.ts` already proves
 * what `pinFloor` and `annotateCapacity` decide, and 4.9 is closed on exactly
 * those assertions — so an assertion written one layer down here would be 4.9's
 * proof again under a new name. What is unproved until this file exists is that
 * a *served* optimized schedule reaches `tree()`'s payload with its own
 * annotations intact: the floats, the `boundBy` labels and the capacity fields
 * that a Gantt bar and a critical-path badge are drawn from.
 *
 * **The materialiser is the real one, not a moved schedule.**
 * `optimized-plan-read.test.ts` fabricates a `Schedule` by running Fast and
 * shifting a slice, which is right for its subject (*which pass answers*) and
 * wrong for this one: a hand-moved slice carries Fast's annotations by
 * construction, so a case built on one could not tell an optimized annotation
 * from a Fast annotation with a later date. Every schedule below comes out of
 * `materialiseOptimized` over the plan read's own `ScheduleInput`, driven by
 * unit offsets exactly as a parsed solver response would drive it.
 */

const OWNER = 'owner-account';
const WROTE: WriteStamp = { at: 1, by: OWNER };
/** The one team any pooled case here draws from. */
const PLATFORM = 'team-platform';

let projects: ProjectStore;
let workItems: WorkItemStore;
let estimates: EstimateStore;
let capacity: CapacityStore;
let serviceOptions: WorkItemServiceOptions;
let projectId: string;
let stepId: string;
/**
 * The project's second step, so a slice can have a floor that is neither the
 * project start nor a pool.
 *
 * Step order is an edge in this engine (`slicesOf`), so a work item's QA slice
 * sits on a `stepOrder` floor at its Dev slice's finish — the cheapest real
 * floor a payload fixture can build, needing no dependency rows and no
 * project start date.
 */
let laterStepId: string;

beforeEach(async () => {
  const harness = inMemoryServices();
  ({ projects, workItems, estimates, capacity } = harness.stores);
  serviceOptions = { ...harness.stores, broadcast: harness.broadcast };
  const project = projectRow({ id: crypto.randomUUID(), ownerId: OWNER });
  stepId = crypto.randomUUID();
  laterStepId = crypto.randomUUID();
  await projects.create(
    project,
    [
      { id: stepId, projectId: project.id, name: 'Dev', position: 10 },
      { id: laterStepId, projectId: project.id, name: 'QA', position: 20 },
    ],
    WROTE,
  );
  projectId = project.id;
  const moved = await projects.update(
    projectId,
    { optimizationEnabled: true, scheduleEngine: 'optimized' },
    WROTE,
  );
  if (moved === null) throw new Error('project vanished');
});

/**
 * One leaf with a flat whole-day estimate, and optionally a team.
 *
 * Whole days on purpose: every number these cases assert is a workday offset,
 * and a three-point estimate that averaged to a fraction would make the
 * expected values arithmetic the reader has to redo.
 */
async function leaf(name: string, days: number, serviceTeamId: string | null = null) {
  const id = crypto.randomUUID();
  await workItems.insert(
    {
      id,
      projectId,
      parentId: null,
      position: 10,
      name,
      notes: '',
      frozenNumber: null,
      priority: 50,
      startNoEarlierThan: null,
      startNoEarlierThanReason: null,
      serviceTeamId,
      serviceId: null,
      maxParallel: 1,
      revision: 0,
    },
    [],
    WROTE,
  );
  await estimates.set(
    { workItemId: id, stepId, optimistic: days, realistic: days, pessimistic: days },
    WROTE,
  );
  return id;
}

/** The same leaf, estimated on both steps, so it carries a `stepOrder` floor. */
async function twoStepLeaf(name: string, days: number, serviceTeamId: string | null = null) {
  const id = await leaf(name, days, serviceTeamId);
  await estimates.set(
    { workItemId: id, stepId: laterStepId, optimistic: days, realistic: days, pessimistic: days },
    WROTE,
  );
  return id;
}

/**
 * The `ScheduleInput` the plan read will hand its reader for this project.
 *
 * Taken from a throwaway pass with a reader that answers `null` rather than
 * rebuilt here: the input is the service's own canonicalisation of the stored
 * rows, and a copy assembled in the test would be a second implementation of it
 * — one that could drift from the real one without either side failing, which
 * is the exact defect the port's doc comment refuses for `inputHash`.
 */
async function askedInput(): Promise<ScheduleInput> {
  const asks: OptimizedScheduleAsk[] = [];
  const probe = new WorkItemService({
    ...serviceOptions,
    optimized: (ask) => {
      asks.push(ask);
      return null;
    },
  });
  await probe.tree(projectId);
  // A length check rather than an `=== undefined` guard on the indexed read:
  // `noUncheckedIndexedAccess` is off in this repo, so the read is not optional
  // and eslint refuses the guard as `no-unnecessary-condition`.
  if (asks.length !== 1) {
    throw new Error(`the reader was consulted ${String(asks.length)} times, not once`);
  }
  return asks[0].input;
}

/**
 * The payload of a plan read served by the real materialiser over `offsets`.
 *
 * `moved` is keyed by `sliceKey` and measured in solver units, which is the
 * wire's own shape — `materialiseOptimized` divides by {@link SOLVER_QUANTUM}
 * and hands the result to `schedule()` as pinned starts.
 *
 * **Every slice the plan has must carry an offset**, because a solver answers
 * for all of them and `materialiseOptimized` refuses a map that misses one.
 * The unmoved ones therefore come from `quantisedFastBaseline` — the plan's own
 * hint, and the one offset set that is legal by construction — and `moved`
 * overrides only the slices a case is about. Spelling every offset in the case
 * instead made the fixtures depend on how many steps the project happens to
 * have: a second step added for 4.11 (f) silently gave every other leaf a
 * second slice, and three cases that had spelled one offset each began throwing
 * `this plan has no such slice`'s converse. Measured 2026-09-04.
 */
async function servedBy(moved: Readonly<Record<string, number>>) {
  const input = await askedInput();
  const materialised = materialiseOptimized(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    {
      ...quantisedFastBaseline(
        input.rows,
        input.edges,
        input.slices,
        input.notBefore,
        input.poolSizes,
        input.reach,
      ),
      ...moved,
    },
  );
  const service = new WorkItemService({ ...serviceOptions, optimized: () => materialised });
  const tree = await service.tree(projectId);
  if (tree === null) throw new Error('project vanished');
  return tree;
}

/** Solver units for a whole number of workdays. */
const units = (days: number) => days * SOLVER_QUANTUM;

/** One work item's slice in the payload, or a throw — a missing one is a broken fixture. */
function slicedFor(
  tree: Awaited<ReturnType<WorkItemService['tree']>>,
  workItemId: string,
): NonNullable<typeof tree>['slices'][number] {
  const found = tree?.slices.find((one) => one.workItemId === workItemId);
  if (found === undefined) throw new Error(`no slice for ${workItemId}`);
  return found;
}

/** One work item's row in the payload, or a throw. */
function rowFor(
  tree: Awaited<ReturnType<WorkItemService['tree']>>,
  workItemId: string,
): NonNullable<typeof tree>['workItems'][number] {
  const found = tree?.workItems.find((one) => one.id === workItemId);
  if (found === undefined) throw new Error(`no row for ${workItemId}`);
  return found;
}

describe("the materialiser's annotations, through the plan read", () => {
  it('reports the optimized float and the optimized floor, not Fast’s against optimized dates', async () => {
    // tasks.md 4.11 (a). Two independent two-day leaves. Fast puts both on day
    // 0, so the plan is two days long and BOTH are critical with no float. The
    // solver idles `sand` to day 3, which makes the plan five days long and
    // hands `strip` three days of float it did not have — and `sand` a floor
    // Fast has no name for.
    //
    // Watched red: `timing = planned.workItems` replaced by
    // `timing = schedule(rows, edges, slices, notBefore, slotsOf,
    // project.depReach).workItems` — Fast's own annotations under the
    // optimizer's dates. `strip` came back `float: 0, critical: true` and this
    // failed on both. Watched 2026-09-04.
    const strip = await leaf('Strip', 2);
    const sand = await leaf('Sand', 2);
    // The QA slice moves with its Dev slice: `sand`'s zero-duration second
    // slice sits on a `stepOrder` floor at its Dev finish, so a baseline offset
    // for day 2 is below the floor day 3 creates and the materialiser refuses
    // it — correctly. A solver moves a slice's own successors too.
    const tree = await servedBy({
      [sliceKey(strip, stepId)]: units(0),
      [sliceKey(sand, stepId)]: units(3),
      [sliceKey(sand, laterStepId)]: units(5),
    });

    expect(slicedFor(tree, sand)).toMatchObject({
      earliestStart: 3,
      earliestFinish: 5,
      boundBy: 'optimizer',
      critical: true,
    });
    expect(rowFor(tree, strip).schedule).toMatchObject({ float: 3, critical: false });
    expect(rowFor(tree, sand).schedule).toMatchObject({ float: 0, critical: true });
  });

  it('labels a deliberately idled slice `optimizer` and not by the floor it cleared', async () => {
    // tasks.md 4.11 (b). One leaf, nothing holding it up, pinned three days
    // above the only floor it has. `projectStart` is a true statement about
    // where it *could* have gone and a false one about why it is where it is —
    // the difference a Gantt bar's reason text is drawn from.
    //
    // Watched red: `pinFloor`'s last line returned
    // `{ start: window.start, boundBy: resolved.boundBy }` — the optimizer's
    // date under the floor's own label. This failed on
    // `'projectStart'` where `'optimizer'` was expected, and it is the only
    // case in the repository that fails on it: the date is unchanged, so every
    // placement assertion elsewhere stays green. Watched 2026-09-04.
    const rewire = await leaf('Rewire', 2);
    const tree = await servedBy({
      [sliceKey(rewire, stepId)]: units(3),
      [sliceKey(rewire, laterStepId)]: units(5),
    });

    expect(slicedFor(tree, rewire)).toMatchObject({
      earliestStart: 3,
      earliestFinish: 5,
      boundBy: 'optimizer',
    });
  });

  it('leaves an optimizer slice naming no team and no capacity predecessor', async () => {
    // tasks.md 4.11 (c), the render invariant on the production path: the
    // capacity fields are set exactly when `boundBy` is `capacity`, and an
    // `'optimizer'` slice is the case where a pool exists, the slice draws from
    // it, and it still held nothing up. A team named here would draw an arrow
    // from a bar that waited for nobody.
    //
    // The pool has room — size 2 with one other tenant — so the pin is legal
    // and the re-ask inside `pinFloor` returns its own instant with an empty
    // binding, which is what makes the invariant true rather than lucky.
    //
    // **MEASURED, NOT ARGUED, AND NOT YET A WATCHED RED.** The pin must be
    // strictly above the slice's own capacity floor or `pinFloor` hands back
    // `resolved` untouched and the slice is `'capacity'`, not `'optimizer'` —
    // measured 2026-09-04 on the tighter fixture this case was first written
    // with (pool size 1, the other tenant releasing at exactly the pinned
    // instant), which came back `boundBy: 'capacity'` with the team named,
    // correctly. Above the floor the conservative scan has no reservation left
    // that finishes by the start, so deleting `annotateCapacity`'s
    // `boundBy === 'capacity'` gate leaves this green: the case states the
    // invariant on the production path and does not yet pin the gate. The
    // fixture that does both is a pool the optimizer idles PAST rather than
    // one it clears, and it is the next chunk's.
    await capacity.set(projectId, PLATFORM, 2, WROTE);
    const hold = await leaf('Hold', 6, PLATFORM);
    const rewire = await leaf('Rewire', 2, PLATFORM);
    const tree = await servedBy({
      [sliceKey(hold, stepId)]: units(0),
      [sliceKey(rewire, stepId)]: units(3),
      [sliceKey(rewire, laterStepId)]: units(5),
    });

    expect(slicedFor(tree, rewire)).toMatchObject({
      earliestStart: 3,
      boundBy: 'optimizer',
      capacityTeamId: null,
      capacityPredecessorIds: [],
    });
    // The other tenant is where Fast put it, and its own floor is unchanged —
    // so the assertion above is about the pinned slice and not about a plan
    // that lost its capacity annotations wholesale.
    expect(slicedFor(tree, hold)).toMatchObject({ earliestStart: 0, capacityTeamId: null });
  });

  it('leaves a slice pinned on its own floor labelled by that floor, not by the optimizer', async () => {
    // tasks.md 4.11 (f), the converse of (b) and the case the three-way split
    // in `pinFloor` exists for: an offset that agrees with where the plan was
    // going to put the slice anyway. The solver returns a start for EVERY
    // slice, so this is not a corner — it is what most of a solver answer looks
    // like, and calling all of it `'optimizer'` would make the label mean
    // "was in the answer" rather than "the optimizer chose this".
    //
    // The floor is `stepOrder`: the QA slice cannot begin before the same work
    // item's Dev slice finishes, and the pool has room (size 2, one tenant), so
    // capacity is not what is holding it.
    //
    // Watched red: `pinFloor`'s early return reduced from
    // `pinned === undefined || withinDrift(pinned, resolved.start)` to
    // `pinned === undefined`, so a pin equal to its own floor falls through to
    // the window and comes back `'optimizer'`.
    await capacity.set(projectId, PLATFORM, 2, WROTE);
    const rewire = await twoStepLeaf('Rewire', 2, PLATFORM);
    const tree = await servedBy({
      [sliceKey(rewire, stepId)]: units(0),
      [sliceKey(rewire, laterStepId)]: units(2),
    });

    const later = tree.slices.find(
      (each) => each.workItemId === rewire && each.stepId === laterStepId,
    );
    expect(later).toMatchObject({
      earliestStart: 2,
      earliestFinish: 4,
      boundBy: 'stepOrder',
      capacityTeamId: null,
      capacityPredecessorIds: [],
    });
  });

  it('names only the pool tenants that had actually finished by the pinned start', async () => {
    // tasks.md 4.11 (e), the long-plus-short capacity-2 case, on the production
    // path. Pool size 2. `long` runs 0–10 and `short` runs 0–5, so the pool is
    // full for the first five days and `pinned` — which nothing else holds up —
    // has a capacity floor at 5. The optimizer's offset agrees with it, so this
    // slice stays `'capacity'` and its predecessor set is a real one.
    //
    // The set is `short` and NOT `long`: a conservative scan records every
    // reservation live at a violated instant, but a reservation that is still
    // running alongside this slice did not release the slot it took. Promoting
    // it into the backward graph draws a `long` → `pinned` edge, which gives
    // `long` a late finish earlier than its own early finish and puts negative
    // float on the plan — a bar the UI would draw as overdue against nothing.
    //
    // Watched red: `annotateCapacity`'s
    // `window.blocking.filter(finishesByStart)` reduced to `window.blocking`.
    await capacity.set(projectId, PLATFORM, 2, WROTE);
    const long = await leaf('Long', 10, PLATFORM);
    const short = await leaf('Short', 5, PLATFORM);
    const pinned = await leaf('Pinned', 2, PLATFORM);
    const tree = await servedBy({ [sliceKey(pinned, stepId)]: units(5) });

    const shortSlice = slicedFor(tree, short);
    expect(slicedFor(tree, pinned)).toMatchObject({
      earliestStart: 5,
      boundBy: 'capacity',
      capacityTeamId: PLATFORM,
      capacityPredecessorIds: [shortSlice.id],
    });
    // The other half of the same claim, and the one a reader of the plan sees:
    // `long` keeps a late finish at or after its early finish. Under the
    // dropped filter it does not.
    const longRow = rowFor(tree, long).schedule;
    expect(longRow.latestFinish).toBeGreaterThanOrEqual(longRow.earliestFinish);
  });
});
