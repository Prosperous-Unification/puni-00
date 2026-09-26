import type { Scheduled } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { Project, Step, StoredDependency, WorkItem, WriteStamp } from '../repository';
import { STEP_POSITION_STEP } from '../repository';
import { inMemoryServices } from '../testing/harness';
import { projectRow } from '../testing/project-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import captured from './fixtures/live-plan-2026-08-09.json';

/**
 * A real project's `/work-items` response, captured from a running be-01 on
 * 2026-08-09, replayed through the service that answers it.
 *
 * The engine underneath was rewritten to plan in slices, and the change
 * promised no plan would move. A fixture written by the same hand as the change
 * cannot say whether that held — this is a plan somebody actually made, with
 * PERT thirds, a start date, a two-deep branch, a dependency and rows nobody has
 * estimated, and the assertion is every number the server printed for it.
 *
 * It goes in through `tree`, not through the planner: the projection, the
 * calendar and the adapter that turns estimates into slices are all part of what
 * must not have moved.
 */
interface CapturedRow {
  id: string;
  parentId: string | null;
  position: number;
  name: string;
  notes: string;
  startNoEarlierThan: string | null;
  serviceTeamId: string | null;
  revision: number;
  number: string;
  estimates: Record<string, { optimistic: number; realistic: number; pessimistic: number }>;
  dependsOn: string[];
  schedule: Scheduled;
  dates: { startsOn: string; endsOn: string } | null;
}

interface CapturedPlan {
  workItems: CapturedRow[];
  /** Narrow, not `EstimateMethod`: this capture is PERT, and the first test says so. */
  estimateMethod: 'pert';
  startDate: string;
  projectRevision: number;
}

// The boundary: a file captured from a live server, read as the fixture it is.
// Nothing here validates it into existence — the first test below asserts the
// shape the rest of the file depends on, and would fail loudly on a re-capture
// of something else.
const plan = captured as unknown as CapturedPlan;

const PROJECT_ID = 'live-project';
const capturedRows = plan.workItems;
/**
 * The stamp every replayed write carries. The capture predates a write recording
 * who made it, so the project's own owner stands in for the actor and the instant
 * is fixed — the replay is a claim about the engine, not about either.
 */
const STAMP: WriteStamp = { at: 1, by: 'owner' };

/** Every step the captured estimates name, in the order the rows print them. */
function stepsInPlan(): string[] {
  const named: string[] = [];
  for (const row of capturedRows) {
    for (const stepId of Object.keys(row.estimates)) {
      if (!named.includes(stepId)) named.push(stepId);
    }
  }
  return named;
}

/**
 * The captured project, rebuilt behind the service, and read back through it.
 *
 * `extraSteps` is the interesting knob: the live project's steps are not in the
 * response, only the ones its estimates name. A step nobody has estimated adds a
 * zero-length slice to every leaf, and the claim is that it changes nothing —
 * which is the rule an unestimated `Dev` in front of an estimated `QA` rests on.
 */
async function replay(extraSteps: readonly string[]) {
  const {
    service,
    stores: { projects, workItems, estimates, dependencies },
  } = inMemoryServices();

  const project: Project = projectRow({
    id: PROJECT_ID,
    name: 'The captured plan',
    ownerId: 'owner',
    estimateMethod: plan.estimateMethod,
    // The arithmetic this capture was taken under: a step's figure reached the
    // schedule as the fraction the method produced. `estimate-weights-and-rounding`
    // made `ceil` the default for every project and left `exact` as the arm an
    // oracle replays on.
    estimateRounding: 'exact',
    startDate: plan.startDate,
    revision: plan.projectRevision,
  });
  const steps: Step[] = [...stepsInPlan(), ...extraSteps].map((id, place) => ({
    id,
    projectId: PROJECT_ID,
    name: `Step ${String(place)}`,
    position: (place + 1) * STEP_POSITION_STEP,
  }));
  await projects.create(project, steps, STAMP);

  for (const row of capturedRows) {
    const stored: WorkItem = workItemRow({
      id: row.id,
      projectId: PROJECT_ID,
      parentId: row.parentId,
      position: row.position,
      name: row.name,
      notes: row.notes,
      // The capture predates the column, and `DEFAULT 1` is what every row on
      // the live server got when the migration ran — so 1 here is the captured
      // plan's own state, not a convenience.
      maxParallel: 1,
      startNoEarlierThan: row.startNoEarlierThan,
      serviceTeamId: row.serviceTeamId,
      revision: row.revision,
    });
    await workItems.insert(stored, [], STAMP);
  }
  // After the rows, so an estimate is never written against a work item that is
  // not there yet — the fixture mirrors the foreign key.
  for (const row of capturedRows) {
    const children = capturedRows.some((each) => each.parentId === row.id);
    if (children) continue;
    for (const [stepId, days] of Object.entries(row.estimates)) {
      await estimates.set({ workItemId: row.id, stepId, ...days }, STAMP);
    }
  }
  for (const row of capturedRows) {
    for (const predecessorId of row.dependsOn) {
      const edge: StoredDependency = {
        id: `${predecessorId}->${row.id}`,
        projectId: PROJECT_ID,
        predecessorId,
        successorId: row.id,
      };
      await dependencies.add(edge, STAMP);
    }
  }

  const tree = await service.tree(PROJECT_ID);
  if (tree === null) throw new Error('the captured project vanished');
  return tree;
}

describe('a captured live plan, through the slice engine', () => {
  it('is worth asserting against: PERT, a calendar, a branch, a dependency and a gap', () => {
    // The fixture is as capable of being empty as the engine is of being wrong.
    expect(plan.estimateMethod).toBe('pert');
    expect(plan.startDate).toBe('2026-08-10');
    expect(capturedRows.some((row) => row.parentId !== null)).toBe(true);
    expect(capturedRows.some((row) => row.dependsOn.length > 0)).toBe(true);
    expect(capturedRows.some((row) => row.schedule.estimated)).toBe(true);
    expect(capturedRows.some((row) => !row.schedule.estimated)).toBe(true);
    expect(capturedRows.some((row) => row.schedule.critical)).toBe(true);
    // Thirds, which is what makes the arithmetic worth checking to the last bit.
    expect(capturedRows.some((row) => !Number.isInteger(row.schedule.earliestFinish))).toBe(true);
  });

  it('answers exactly what the live server answered', async () => {
    // The live server drew an unestimated row as taking no schedule time, and
    // since `unestimated-steps-take-no-schedule-time` (2026-09-27) so does the
    // engine again: every number below is the live server's, unedited. `020`
    // and `030.1.1` are the rows a real planner left unestimated. From
    // `assumed-duration-schedules` (2026-08-29) until then they ran two
    // workdays each and this capture was the oracle only where somebody had
    // estimated.
    const tree = await replay([]);

    expect(tree.scheduleError).toBeNull();
    expect(tree.workItems.map((row) => row.number)).toEqual(capturedRows.map((row) => row.number));
    for (const [at, row] of tree.workItems.entries()) {
      const was = capturedRows[at];
      expect({ number: row.number, schedule: row.schedule, dates: row.dates }).toEqual({
        number: was.number,
        schedule: was.schedule,
        dates: was.dates,
      });
    }
  });

  it('answers the same with a step nobody has estimated added to the project', async () => {
    // A step nobody has sized is zero schedule time, so a second step changes
    // what the plan is computed in and must change nothing about the answer —
    // under either reach, because a zero-time last slice finishes where the
    // anchor does.
    //
    // Proof: `durationOf` answering `ASSUMED_SLICE_WORKDAYS` for null days
    // made this fail with `010`'s `earliestFinish` moved out by two workdays;
    // watched 2026-09-27.
    const tree = await replay(['role-nobody-estimated']);

    for (const [at, row] of tree.workItems.entries()) {
      expect(row.schedule).toEqual(capturedRows[at].schedule);
      expect(row.dates).toEqual(capturedRows[at].dates);
    }
  });
});
