import { assertStepParallelRefusal } from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import { inMemoryStores } from './in-memory-source';
import { inMemorySteps, stepRow } from './step-fixture';
import { inMemoryStepParallels, memoryStepParallelTable } from './step-parallel-fixture';
import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

let stores: ReturnType<typeof inMemoryStores>;
let table: ReturnType<typeof memoryStepParallelTable>;
let parallel: ReturnType<typeof inMemoryStepParallels>;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  stores = inMemoryStores();
  table = memoryStepParallelTable();
  parallel = inMemoryStepParallels(stores.workItems, stores.steps, table);
  await stores.steps.add(
    { id: 'dev', workPackageId: 'p', name: 'Dev', allowancePercent: 0, estimateUnit: 'workdays' },
    stamp,
  );
  await stores.steps.add(
    {
      id: 'foreign',
      workPackageId: 'foreign',
      name: 'Foreign',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    stamp,
  );
  await stores.workItems.insert(workItemRow({ id: 'a', workPackageId: 'p' }), [], stamp);
  await stores.workItems.insert(workItemRow({ id: 'parent', workPackageId: 'p' }), [], stamp);
  await stores.workItems.insert(
    workItemRow({ id: 'child', workPackageId: 'p', parentId: 'parent' }),
    [],
    stamp,
  );
});
describe('memory parallelism corruption boundary', () => {
  for (const [name, workItemId, stepId, maxParallel] of [
    ['owner', 'absent', 'dev', 2],
    ['step', 'a', 'absent', 2],
    ['workPackage', 'a', 'foreign', 2],
    ['leaf', 'parent', 'dev', 2],
    ['range', 'a', 'dev', 1001],
  ] as const)
    it(`read refuses corrupt ${name}`, async () => {
      table.rows.push({ workItemId, stepId, maxParallel });
      const messages = {
        owner: 'invalid work-item reference',
        step: 'invalid step reference',
        workPackage: 'work package mismatch',
        leaf: 'not a leaf',
        range: 'integer from 1 to 1000',
      };
      await assertStepParallelRefusal(parallel.listByWorkPackage('p'), messages[name]);
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
    await assertStepParallelRefusal(parallel.listByWorkPackage('p'), /duplicate/);
  });
  it('reads and writes detached values', async () => {
    const authored = { workItemId: 'a', stepId: 'dev', maxParallel: 2 };
    await parallel.set(authored, stamp);
    authored.maxParallel = 4;
    const read = await parallel.listByWorkPackage('p');
    expect(read).toEqual([{ workItemId: 'a', stepId: 'dev', maxParallel: 2 }]);
    read[0].maxParallel = 9;
    expect(await parallel.listByWorkPackage('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', maxParallel: 2 },
    ]);
  });
});

for (const cascade of [false, true])
  it(`refuses removing a memory step with retained parallelism (cascade=${String(cascade)})`, async () => {
    const steps = inMemorySteps(
      [
        stepRow({ id: 'dev', workPackageId: 'p' }),
        stepRow({ id: 'foreign', workPackageId: 'foreign', name: 'Foreign' }),
      ],
      undefined,
      undefined,
      { table, workItems: stores.workItems },
    );
    await stores.workItems.insert(
      workItemRow({ id: 'other', workPackageId: 'foreign' }),
      [],
      stamp,
    );
    await parallel.set({ workItemId: 'other', stepId: 'foreign', maxParallel: 3 }, stamp);
    await parallel.set({ workItemId: 'a', stepId: 'dev', maxParallel: 1 }, stamp);
    expect(await steps.remove('p', 'dev', cascade, stamp)).toEqual({
      ok: false,
      reason: 'referenced_by_step_parallel',
      nodes: [{ workItemId: 'a', stepId: 'dev' }],
    });
    expect(await steps.findById('dev')).not.toBeNull();
    expect(await parallel.listByWorkPackage('p')).toEqual([
      { workItemId: 'a', stepId: 'dev', maxParallel: 1 },
    ]);
    expect(await steps.remove('foreign', 'dev', cascade, stamp)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await parallel.remove('a', 'dev', stamp);
    expect(await steps.remove('p', 'dev', cascade, stamp)).toMatchObject({ ok: true });
    expect(await parallel.listByWorkPackage('foreign')).toEqual([
      { workItemId: 'other', stepId: 'foreign', maxParallel: 3 },
    ]);
  });

it('returns sorted detached memory references for the exact target', async () => {
  await stores.workItems.insert(workItemRow({ id: 'a:b', workPackageId: 'p' }), [], stamp);
  const facts = memoryStepParallelTable();
  facts.rows.push(
    { workItemId: 'a:b', stepId: 'dev', maxParallel: 1 },
    { workItemId: 'a', stepId: 'dev', maxParallel: 1 },
    { workItemId: 'a', stepId: 'foreign', maxParallel: 1 },
  );
  const steps = inMemorySteps([stepRow({ id: 'dev', workPackageId: 'p' })], undefined, undefined, {
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
  ['work_package', 'other', 2, 'work package mismatch'],
  ['leaf', 'parent', 2, 'not a leaf'],
  ['range', 'a', 1001, 'integer from 1 to 1000'],
  ['duplicate', 'a', 2, 'duplicate'],
] as const)
  it(`removal throws on corrupt retained memory ${name}`, async () => {
    await stores.workItems.insert(
      workItemRow({ id: 'other', workPackageId: 'foreign' }),
      [],
      stamp,
    );
    table.rows.push({ workItemId, stepId: 'dev', maxParallel });
    if (name === 'duplicate') table.rows.push({ workItemId, stepId: 'dev', maxParallel });
    const steps = inMemorySteps(
      [stepRow({ id: 'dev', workPackageId: 'p' })],
      undefined,
      undefined,
      {
        table,
        workItems: stores.workItems,
      },
    );
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
      async listByWorkPackage(workPackageId: string) {
        reads++;
        if (reads === 2) {
          if (arrive === undefined) throw new Error('missing arrival signal');
          arrive();
        }
        await waiting;
        return stores.workItems.listByWorkPackage(workPackageId);
      },
    };
    const steps = inMemorySteps(
      [
        stepRow({ id: 'a', workPackageId: 'p', name: 'A' }),
        stepRow({ id: 'b', workPackageId: 'p', name: 'B' }),
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
    expect((await steps.listByWorkPackage('p')).map((step) => step.id)).toEqual(
      sameStep ? ['b'] : [],
    );
  });

for (const dryRun of [false, true])
  it(`current memory binding protects retained parallelism one before retirement (dryRun=${String(dryRun)})`, async () => {
    const { fixture, seed } = await openMemoryStepCatalogueSourceFixture(),
      source = fixture.source;
    try {
      for (const [organizationId, projectId, workPackageId, stepId, rowId] of [
        [seed.organizationId, seed.projectId, seed.workPackageId, 'current-dev', 'current-a'],
        [
          seed.foreignOrganizationId,
          seed.foreignProjectId,
          seed.foreignWorkPackageId,
          'foreign-dev',
          'current-other',
        ],
      ]) {
        const defined = await source.stores.stepCatalogue.defineAndBindStep(
          organizationId,
          {
            id: stepId,
            code: 'dev',
            name: 'Dev',
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          {
            bindingId: stepId + '-binding',
            scopeKind: 'project',
            scopeId: projectId,
            workItemTypeId: null,
            position: 10,
          },
          seed.stamp,
        );
        if (!defined.ok)
          throw new Error('parallel fixture binding refused: ' + JSON.stringify(defined));
        await source.stores.workItems.insert(
          workItemRow({ id: rowId, workPackageId, name: rowId }),
          [],
          seed.stamp,
        );
        await source.stores.stepParallels.set(
          { workItemId: rowId, stepId, maxParallel: rowId === 'current-a' ? 1 : 3 },
          seed.stamp,
        );
        expect(await source.stores.stepParallels.listByWorkPackage(workPackageId)).toEqual([
          { workItemId: rowId, stepId, maxParallel: rowId === 'current-a' ? 1 : 3 },
        ]);
      }
      const before = fixture.stepCatalogueEvidence();
      expect(
        await source.stores.stepCatalogue.unbindStep(
          seed.foreignOrganizationId,
          'current-dev-binding',
          { dryRun },
          seed.stamp,
        ),
      ).toEqual({ kind: 'not_found' });
      // Proof: removing actual parallel usage capture admitted both protected apply/preview cases (memory-current-fault-parallel-fact-v1).
      const refused = await source.stores.stepCatalogue.unbindStep(
        seed.organizationId,
        'current-dev-binding',
        { dryRun },
        seed.stamp,
      );
      const protectedNodes = {
        count: 1,
        pairs: [
          {
            id: 'current-a',
            name: 'current-a',
            workPackageId: seed.workPackageId,
            stepId: 'current-dev',
            facts: ['parallel' as const],
          },
        ],
      };
      expect(refused).toEqual(
        dryRun
          ? { kind: 'preview', wouldRefuse: 'step_nodes_in_use', ...protectedNodes }
          : { kind: 'step_nodes_in_use', ...protectedNodes },
      );
      expect(
        await source.stores.stepCatalogue.retireStepDefinition(
          seed.organizationId,
          'current-dev',
          seed.stamp,
        ),
      ).toEqual({ ok: false, reason: 'step_bound' });
      expect(fixture.stepCatalogueEvidence()).toEqual(before);
      await source.stores.stepParallels.remove('current-a', 'current-dev', seed.stamp);
      expect(
        await source.stores.stepCatalogue.unbindStep(
          seed.organizationId,
          'current-dev-binding',
          { dryRun: false },
          seed.stamp,
        ),
      ).toMatchObject({ kind: 'unbound' });
      const values = fixture.stepCatalogueEvidence().packageValues;
      expect(
        await source.stores.stepCatalogue.retireStepDefinition(
          seed.organizationId,
          'current-dev',
          seed.stamp,
        ),
      ).toEqual({ ok: true });
      expect(
        (await source.stores.stepCatalogue.readCatalogue(seed.organizationId))?.definitions,
      ).toEqual([]);
      expect(await source.stores.stepCatalogue.readRetiredCodes(seed.organizationId)).toEqual([
        'dev',
      ]);
      expect(fixture.stepCatalogueEvidence().packageValues).toEqual(values);
      expect(
        await source.stores.stepParallels.listByWorkPackage(seed.foreignWorkPackageId),
      ).toEqual([{ workItemId: 'current-other', stepId: 'foreign-dev', maxParallel: 3 }]);
    } finally {
      await source.close();
    }
  });
