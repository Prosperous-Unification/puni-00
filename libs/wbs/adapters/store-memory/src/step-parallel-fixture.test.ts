import { assertStepParallelRefusal } from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import { inMemoryStores } from './in-memory-source';
import { inMemorySteps, stepRow } from './step-fixture';
import { inMemoryStepParallels, memoryStepParallelTable } from './step-parallel-fixture';

let stores: ReturnType<typeof inMemoryStores>;
let table: ReturnType<typeof memoryStepParallelTable>;
let parallel: ReturnType<typeof inMemoryStepParallels>;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  stores = inMemoryStores();
  table = memoryStepParallelTable();
  parallel = inMemoryStepParallels(stores.workItems, stores.steps, table);
  await stores.steps.add(
    { id: 'dev', projectId: 'p', name: 'Dev', allowancePercent: 0, estimateUnit: 'workdays' },
    stamp,
  );
  await stores.steps.add(
    {
      id: 'foreign',
      projectId: 'foreign',
      name: 'Foreign',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    stamp,
  );
  await stores.workItems.insert(workItemRow({ id: 'a', projectId: 'p' }), [], stamp);
  await stores.workItems.insert(workItemRow({ id: 'parent', projectId: 'p' }), [], stamp);
  await stores.workItems.insert(
    workItemRow({ id: 'child', projectId: 'p', parentId: 'parent' }),
    [],
    stamp,
  );
});
describe('memory parallelism corruption boundary', () => {
  for (const [name, workItemId, stepId, maxParallel] of [
    ['owner', 'absent', 'dev', 2],
    ['step', 'a', 'absent', 2],
    ['project', 'a', 'foreign', 2],
    ['leaf', 'parent', 'dev', 2],
    ['range', 'a', 'dev', 1001],
  ] as const)
    it(`read refuses corrupt ${name}`, async () => {
      table.rows.push({ workItemId, stepId, maxParallel });
      const messages = {
        owner: 'invalid work-item reference',
        step: 'invalid step reference',
        project: 'project mismatch',
        leaf: 'not a leaf',
        range: 'integer from 1 to 1000',
      };
      await assertStepParallelRefusal(parallel.listByProject('p'), messages[name]);
      await assertStepParallelRefusal(parallel.listByWorkItems('p', [workItemId]), messages[name]);
    });
  it('write refuses a missing owner with a trusted-reference error', async () => {
    await assertStepParallelRefusal(
      parallel.set({ workItemId: 'absent', stepId: 'dev', maxParallel: 2 }, stamp),
      'invalid work-item reference',
    );
  });
  it('read refuses duplicate pairs rather than choosing one', async () => {
    table.rows.push(
      { workItemId: 'a', stepId: 'dev', maxParallel: 2 },
      { workItemId: 'a', stepId: 'dev', maxParallel: 3 },
    );
    await assertStepParallelRefusal(parallel.listByProject('p'), /duplicate/);
  });
  it('reads and writes detached values', async () => {
    const authored = { workItemId: 'a', stepId: 'dev', maxParallel: 2 };
    await parallel.set(authored, stamp);
    authored.maxParallel = 4;
    const read = await parallel.listByProject('p');
    expect(read).toEqual([{ workItemId: 'a', stepId: 'dev', maxParallel: 2 }]);
    read[0].maxParallel = 9;
    expect(await parallel.listByProject('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', maxParallel: 2 },
    ]);
  });
});

for (const cascade of [false, true])
  it(`refuses removing a memory step with retained parallelism (cascade=${String(cascade)})`, async () => {
    await stores.workItems.insert(workItemRow({ id: 'other', projectId: 'foreign' }), [], stamp);
    await stores.stepParallels.set(
      { workItemId: 'other', stepId: 'foreign', maxParallel: 3 },
      stamp,
    );
    await stores.stepParallels.set({ workItemId: 'a', stepId: 'dev', maxParallel: 1 }, stamp);
    expect(await stores.steps.remove('p', 'dev', cascade, stamp)).toEqual({
      ok: false,
      reason: 'referenced_by_step_parallel',
      nodes: [{ workItemId: 'a', stepId: 'dev' }],
    });
    expect(await stores.steps.findById('dev')).not.toBeNull();
    expect(await stores.stepParallels.listByProject('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', maxParallel: 1 },
    ]);
    expect(await stores.steps.remove('foreign', 'dev', cascade, stamp)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await stores.stepParallels.remove('a', 'dev', stamp);
    expect(await stores.steps.remove('p', 'dev', cascade, stamp)).toMatchObject({ ok: true });
    expect(await stores.stepParallels.listByProject('foreign')).toEqual([
      { workItemId: 'other', stepId: 'foreign', maxParallel: 3 },
    ]);
  });

it('returns sorted detached memory references for the exact target', async () => {
  await stores.workItems.insert(workItemRow({ id: 'a:b', projectId: 'p' }), [], stamp);
  const facts = memoryStepParallelTable();
  facts.rows.push(
    { workItemId: 'a:b', stepId: 'dev', maxParallel: 1 },
    { workItemId: 'a', stepId: 'dev', maxParallel: 1 },
    { workItemId: 'a', stepId: 'foreign', maxParallel: 1 },
  );
  const steps = inMemorySteps([stepRow({ id: 'dev', projectId: 'p' })], undefined, undefined, {
    table: facts,
    workItems: stores.workItems,
  });
  const refused = await steps.remove('p', 'dev', true, stamp);
  expect(refused).toEqual({
    ok: false,
    reason: 'referenced_by_step_parallel',
    nodes: [
      { workItemId: 'a', stepId: 'dev' },
      { workItemId: 'a:b', stepId: 'dev' },
    ],
  });
  facts.rows[0].workItemId = 'changed';
  expect(refused).toMatchObject({
    nodes: [
      { workItemId: 'a', stepId: 'dev' },
      { workItemId: 'a:b', stepId: 'dev' },
    ],
  });
});

for (const [name, workItemId, maxParallel, message] of [
  ['owner', 'absent', 2, 'invalid work-item reference'],
  ['project', 'other', 2, 'project mismatch'],
  ['leaf', 'parent', 2, 'not a leaf'],
  ['range', 'a', 1001, 'integer from 1 to 1000'],
  ['duplicate', 'a', 2, 'duplicate'],
] as const)
  it(`removal throws on corrupt retained memory ${name}`, async () => {
    await stores.workItems.insert(workItemRow({ id: 'other', projectId: 'foreign' }), [], stamp);
    table.rows.push({ workItemId, stepId: 'dev', maxParallel });
    if (name === 'duplicate') table.rows.push({ workItemId, stepId: 'dev', maxParallel });
    const steps = inMemorySteps([stepRow({ id: 'dev', projectId: 'p' })], undefined, undefined, {
      table,
      workItems: stores.workItems,
    });
    await assertStepParallelRefusal(steps.remove('p', 'dev', true, stamp), message);
    expect(await steps.findById('dev')).not.toBeNull();
    expect(table.rows).toHaveLength(name === 'duplicate' ? 2 : 1);
  });

for (const sameStep of [false, true])
  it(`rechecks the target after concurrent owner reads (sameStep=${String(sameStep)})`, async () => {
    let release: (() => void) | undefined;
    let arrive: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    let reads = 0;
    const workItems = {
      ...stores.workItems,
      async listByProject(projectId: string) {
        reads++;
        if (reads === 2) {
          if (arrive === undefined) throw new Error('missing arrival signal');
          arrive();
        }
        await waiting;
        return stores.workItems.listByProject(projectId);
      },
    };
    const steps = inMemorySteps(
      [
        stepRow({ id: 'a', projectId: 'p', name: 'A' }),
        stepRow({ id: 'b', projectId: 'p', name: 'B' }),
      ],
      undefined,
      undefined,
      { table: memoryStepParallelTable(), workItems },
    );
    const first = steps.remove('p', 'a', true, stamp);
    const second = steps.remove('p', sameStep ? 'a' : 'b', true, stamp);
    await arrived;
    if (release === undefined) throw new Error('missing release signal');
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject(
      sameStep ? { ok: false, reason: 'not_found' } : { ok: true },
    );
    expect((await steps.listByProject('p')).map((step) => step.id)).toEqual(sameStep ? ['b'] : []);
  });
