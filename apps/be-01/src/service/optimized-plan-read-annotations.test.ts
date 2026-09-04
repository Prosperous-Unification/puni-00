import { materialiseOptimized } from '@wbs/contracts/solver/materialise-optimized';
import { type ScheduleInput, SOLVER_QUANTUM, sliceKey } from '@wbs/domain';
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

beforeEach(async () => {
  const harness = inMemoryServices();
  ({ projects, workItems, estimates, capacity } = harness.stores);
  serviceOptions = { ...harness.stores, broadcast: harness.broadcast };
  const project = projectRow({ id: crypto.randomUUID(), ownerId: OWNER });
  stepId = crypto.randomUUID();
  await projects.create(
    project,
    [{ id: stepId, projectId: project.id, name: 'Dev', position: 10 }],
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
  const asked = asks[0];
  if (asks.length !== 1 || asked === undefined) {
    throw new Error(`the reader was consulted ${String(asks.length)} times, not once`);
  }
  return asked.input;
}

/**
 * The payload of a plan read served by the real materialiser over `offsets`.
 *
 * `offsets` is keyed by `sliceKey` and measured in solver units, which is the
 * wire's own shape — `materialiseOptimized` divides by {@link SOLVER_QUANTUM}
 * and hands the result to `schedule()` as pinned starts. Every slice in the
 * plan must appear: a map missing one is refused by the placement pass, and
 * that refusal is 4.9's, proved there.
 */
async function servedBy(offsets: Readonly<Record<string, number>>) {
  const input = await askedInput();
  const materialised = materialiseOptimized(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    offsets,
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
    const tree = await servedBy({
      [sliceKey(strip, stepId)]: units(0),
      [sliceKey(sand, stepId)]: units(3),
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
    const tree = await servedBy({ [sliceKey(rewire, stepId)]: units(3) });

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
    // Watched red: `annotateCapacity`'s guard widened from
    // `boundBy === 'capacity'` to `boundBy === 'capacity' || boundBy ===
    // 'optimizer'`, so the optimizer slice named the team whose pool it
    // happened to sit in. This failed on `capacityTeamId` receiving
    // `'team-platform'` where `null` was expected. Watched 2026-09-04.
    await capacity.set(projectId, PLATFORM, 2, WROTE);
    const hold = await leaf('Hold', 6, PLATFORM);
    const rewire = await leaf('Rewire', 2, PLATFORM);
    const tree = await servedBy({
      [sliceKey(hold, stepId)]: units(0),
      [sliceKey(rewire, stepId)]: units(3),
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
});
