import { rejects } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkItem, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import { EstimateRepository } from './estimate';
import { OPEN } from './gate';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const custody = { hasUnknownOwner: false };

let dir: string;
let repo: EstimateRepository;
let ownerId: string;
let workPackageId: string;
let devId: string;
let qaId: string;
let stripId: string;
let sandId: string;

/**
 * The stamp every write here carries. The account is the work package's owner, which
 * the `created_by` foreign key requires to exist; the owner's own signup carries
 * it too, because a new account authors its own row.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

/** A plausible trio; the figures are not the subject of the reference cases. */
const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

const insertItem = async (
  workItems: WorkItemRepository,
  id: string,
  position: number,
  name: string,
): Promise<void> => {
  const item: WorkItem = workItemRow({
    id,
    workPackageId,
    position,
    name,
  });
  await workItems.insert(item, [], wrote());
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-estimate-'));
  const path = join(dir, 'test.db');
  custody.hasUnknownOwner = false;
  ownerId = crypto.randomUUID();
  workPackageId = crypto.randomUUID();
  // Make key order differ from authored step order to exercise the production projection.
  devId = `z-dev-${crypto.randomUUID()}`;
  qaId = `a-qa-${crypto.randomUUID()}`;
  await seedCurrentProjectFixture(
    {
      path,
      directory: dir,
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      stamp: wrote(),
      definitions: [
        {
          id: devId,
          code: 'dev',
          name: 'Dev',
          position: 10,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          id: qaId,
          code: 'qa',
          name: 'QA',
          position: 20,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
      ],
    },
    custody,
  );
  const db = openDrizzle(path);
  repo = new EstimateRepository(db, OPEN);
  const workItems = new WorkItemRepository(db, OPEN);
  await new WorkPackageRepository(db, OPEN).create(
    workPackageRow({ id: workPackageId, projectId: 'fixture-project' }),
    [],
    wrote(),
  );

  stripId = crypto.randomUUID();
  sandId = crypto.randomUUID();
  await insertItem(workItems, stripId, 10, 'Strip');
  await insertItem(workItems, sandId, 20, 'Sand');
});

afterEach(() => {
  if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
});

describe('EstimateRepository', () => {
  it('removes one work item’s step without touching the other step or the same step elsewhere', async () => {
    // Both halves of the condition are load-bearing and each needs its own
    // survivor. With one work item, a delete narrowed to the step alone —
    // which would clear that step on every work item in the database — passes.
    // The same trap `directory.test.ts` records for `assign(…, null)`.
    await repo.set(
      {
        workItemId: stripId,
        stepId: devId,
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      },
      wrote(),
    );
    await repo.set(
      {
        workItemId: stripId,
        stepId: qaId,
        optimistic: 4,
        realistic: 5,
        pessimistic: 6,
      },
      wrote(),
    );
    await repo.set(
      {
        workItemId: sandId,
        stepId: devId,
        optimistic: 7,
        realistic: 8,
        pessimistic: 9,
      },
      wrote(),
    );

    await repo.remove(stripId, devId, wrote());

    const left = await repo.listByWorkPackage(workPackageId);
    expect(left).toHaveLength(2);
    // The same step on another work item survives — the work-item half.
    expect(left).toContainEqual({
      workItemId: sandId,
      stepId: devId,
      optimistic: 7,
      realistic: 8,
      pessimistic: 9,
    });
    // The other step on this one — the step half.
    expect(left).toContainEqual({
      workItemId: stripId,
      stepId: qaId,
      optimistic: 4,
      realistic: 5,
      pessimistic: 6,
    });
  });

  it('removing an estimate that was never stored takes nothing away and does not throw', async () => {
    // Clearing twice is the ordinary path: a person empties three boxes, the
    // tree refreshes, and they empty them again. The state asked for is the
    // state left, so the second call is a success rather than a 404.
    await repo.set(
      {
        workItemId: stripId,
        stepId: qaId,
        optimistic: 4,
        realistic: 5,
        pessimistic: 6,
      },
      wrote(),
    );

    await repo.remove(stripId, devId, wrote());
    await repo.remove(stripId, devId, wrote());

    expect(await repo.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: stripId, stepId: qaId, optimistic: 4, realistic: 5, pessimistic: 6 },
    ]);
  });

  it('reads a work item’s estimates in step order, not in the order the row ids happen to sort', async () => {
    // The order is a contract because the schedule's adapter adds these up per
    // work item, and floating-point addition is not associative: three steps
    // summed in two orders can differ in the last bit, and a finish is read
    // through `Math.ceil`, so that bit is a day on the screen. `Dev` runs first
    // here and its id sorts last, so a read falling back to the primary key
    // would hand back `QA` first.
    await repo.set(
      {
        workItemId: stripId,
        stepId: qaId,
        optimistic: 4,
        realistic: 5,
        pessimistic: 6,
      },
      wrote(),
    );
    await repo.set(
      {
        workItemId: stripId,
        stepId: devId,
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      },
      wrote(),
    );

    const held = await repo.listByWorkPackage(workPackageId);

    expect(held.map((each) => each.stepId)).toEqual([devId, qaId]);
  });

  it('reads estimate facts with one join and bounds catalogue reads independently of row count', async () => {
    const queries: { sql: string; bindings: number }[] = [];
    const counted = new EstimateRepository(
      openDrizzle(join(dir, 'test.db'), {
        logQuery(query, params) {
          queries.push({ sql: query, bindings: params.length });
        },
      }),
      OPEN,
    );
    await repo.set({ workItemId: stripId, stepId: devId, ...DAYS }, wrote());
    expect(await counted.listByWorkPackage(workPackageId)).toHaveLength(1);
    const one = queries.splice(0);
    const workItems = new WorkItemRepository(openDrizzle(join(dir, 'test.db')), OPEN);
    for (let made = 0; made < 20; made += 1) {
      const id = `row-${String(made)}`;
      await insertItem(workItems, id, 100 + made, `Row ${String(made)}`);
      await repo.set(
        { workItemId: id, stepId: devId, optimistic: 1, realistic: 2, pessimistic: 3 },
        wrote(),
      );
    }

    expect(await counted.listByWorkPackage(workPackageId)).toHaveLength(21);
    // Proof: adding one bound SELECT per fact to the actual reader failed this equality.
    expect(queries).toEqual(one);
    const facts = queries.filter(({ sql }) => sql.includes('FROM estimate f'));
    expect(facts).toHaveLength(1);
    expect(facts[0]?.sql).toContain('JOIN work_item');
    expect(facts[0]?.sql.toLowerCase()).not.toContain('in (');
    expect(facts[0]?.bindings).toBe(1);
  });
});

describe('what a broken reference means', () => {
  it('answers unknown_step for a step that has gone, and throws for anything else', async () => {
    // The step is gone, the work item is there: the modeled outcome.
    expect(await repo.set({ workItemId: stripId, stepId: 'no-such-step', ...DAYS }, wrote())).toBe(
      'unknown_step',
    );

    // The catalogue writer inspects the work item before resolving its step.
    await rejects(repo.set({ workItemId: 'no-such-work-item', stepId: devId, ...DAYS }, wrote()), {
      message: 'step write work item is absent or inconsistent',
    });
  });
});
