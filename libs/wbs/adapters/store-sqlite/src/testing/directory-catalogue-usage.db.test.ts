import { WorkPackageStepMissing } from '@wbs/core';
import { directoryUsageOfPerson } from '@wbs/core/service/directory-usage';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const SHARED = 'directory-current-shared',
  SIBLING_STEP = 'directory-current-sibling-step';
const RETAINED = 'directory-current-retained',
  FOREIGN = 'directory-current-foreign';
const MAIN = 'directory-current-main',
  SIBLING = 'directory-current-sibling';
const PERSON = 'directory-current-person',
  OTHER = 'directory-current-other',
  RESOURCE = 'directory-current-resource';

async function withinFixture(exercise: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  let primary: { cause: unknown } | undefined;
  try {
    await prepare(fixture);
    await exercise(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'directory usage case and Source cleanup failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

async function prepare({ source, port, seed }: Fixture): Promise<void> {
  for (const [id, organizationId, scopeKind, scopeId, name] of [
    [SHARED, seed.organizationId, 'organization', seed.organizationId, 'Shared current step'],
    [SIBLING_STEP, seed.organizationId, 'project', seed.siblingProjectId, 'Sibling current step'],
    [RETAINED, seed.organizationId, 'project', seed.projectId, 'Retained unbound step'],
    [FOREIGN, seed.foreignOrganizationId, 'project', seed.foreignProjectId, 'Foreign current step'],
  ] as const) {
    expect(
      (
        await port.defineAndBindStep(
          organizationId,
          {
            id,
            code: id,
            name,
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          { bindingId: id + ':binding', scopeKind, scopeId, workItemTypeId: null, position: 10 },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
  expect(
    await port.unbindStep(
      seed.organizationId,
      RETAINED + ':binding',
      { dryRun: false },
      seed.stamp,
    ),
  ).toMatchObject({ kind: 'unbound' });
  expect(
    source.db.all(
      sql`SELECT work_package_id,step_id FROM work_package_step WHERE work_package_id=${seed.workPackageId} AND step_id=${RETAINED}`,
    ),
  ).toEqual([{ work_package_id: seed.workPackageId, step_id: RETAINED }]);
  expect(
    (await source.stores.workPackages.stepsOf(seed.foreignWorkPackageId)).map(({ id }) => id),
  ).toEqual([FOREIGN]);
  for (const [id, workPackageId] of [
    [MAIN, seed.workPackageId],
    [SIBLING, seed.siblingWorkPackageId],
  ])
    await source.stores.workItems.insert(
      workItemRow({ id, workPackageId, name: id }),
      [],
      seed.stamp,
    );
  for (const [id, name] of [
    [PERSON, 'Main person'],
    [OTHER, 'Other person'],
  ]) {
    expect((await source.stores.directory.addPerson({ id, name }, [], seed.stamp)).ok).toBe(true);
    source.db.run(
      sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES(${id},${seed.organizationId},${name})`,
    );
  }
  for (const [workItemId, stepId, personId] of [
    [MAIN, SHARED, PERSON],
    [SIBLING, SHARED, PERSON],
    [SIBLING, SIBLING_STEP, OTHER],
  ])
    expect(await source.stores.directory.assign(workItemId, stepId, personId, seed.stamp)).toEqual({
      ok: true,
    });
  expect(
    await source.stores.claims.add(
      [
        {
          id: 'directory-current-claim',
          workItemId: MAIN,
          stepId: SHARED,
          personId: PERSON,
          runId: null,
          parentClaimId: null,
          accountId: seed.stamp.by,
        },
      ],
      [],
      seed.stamp,
      [],
    ),
  ).toBe('written');
  expect(
    source.db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='step'`),
  ).toEqual([]);
  expect(source.db.all('PRAGMA foreign_key_check')).toEqual([]);
}

const names = [
  { id: SHARED, name: 'Shared current step' },
  { id: SIBLING_STEP, name: 'Sibling current step' },
];
const orderNames = (steps: readonly { id: string; name: string }[]) =>
  [...steps].sort((left, right) => left.id.localeCompare(right.id));

test('current directory foreign reach accepts shared definitions in owned packages', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    const before = fixture.readEvidence().snapshot;
    expect(
      await source.stores.directory.foreignReferencesTo('people', PERSON, seed.organizationId),
    ).toEqual([]);
    expect(fixture.readEvidence().snapshot).toEqual(before);
  });
}, 15000);

test('current directory foreign reach reports a foreign definition on an owned work item', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    source.db.run(
      sql`UPDATE assignment SET step_id=${FOREIGN} WHERE work_item_id=${MAIN} AND person_id=${PERSON}`,
    );
    expect(source.db.all('PRAGMA foreign_key_check')).toEqual([]);
    const before = fixture.readEvidence().snapshot;
    expect(
      await source.stores.directory.foreignReferencesTo('people', PERSON, seed.organizationId),
    ).toEqual(['assignment:' + MAIN]);
    expect(fixture.readEvidence().snapshot).toEqual(before);
  });
}, 15000);

test('current directory foreign reach reports a foreign package with an owned definition', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    await source.stores.workItems.insert(
      workItemRow({
        id: 'directory-current-foreign-row',
        workPackageId: seed.foreignWorkPackageId,
        name: 'Foreign row',
      }),
      [],
      seed.stamp,
    );
    source.db.run(
      sql`INSERT INTO assignment(work_item_id,step_id,person_id) VALUES('directory-current-foreign-row',${SHARED},${PERSON})`,
    );
    expect(source.db.all('PRAGMA foreign_key_check')).toEqual([]);
    const before = fixture.readEvidence().snapshot;
    expect(
      await source.stores.directory.foreignReferencesTo('people', PERSON, seed.organizationId),
    ).toEqual(['assignment:directory-current-foreign-row']);
    expect(fixture.readEvidence().snapshot).toEqual(before);
  });
}, 15000);

test('current directory usage names shared catalogue steps once and preserves actual assignee effects', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture,
      before = fixture.readEvidence().snapshot;
    const usage = await source.stores.directory.usageOfPerson(PERSON);
    expect(orderNames(usage.steps)).toEqual(names);
    expect(fixture.readEvidence().snapshot).toEqual(before);
    const effects = directoryUsageOfPerson(usage, PERSON)
      .workPackages.flatMap(({ workItems }) =>
        workItems.map(({ id, effects }) => ({ id, effects })),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    expect(effects).toEqual([
      {
        id: MAIN,
        effects: [
          { kind: 'assignment_dropped', step: names[0] },
          { kind: 'assumed_assignee_changed', assumedNow: 'Main person', assumedAfter: null },
          { kind: 'claim_released', step: names[0] },
        ],
      },
      {
        id: SIBLING,
        effects: [
          { kind: 'assignment_dropped', step: names[0] },
          { kind: 'assumed_assignee_changed', assumedNow: null, assumedAfter: 'Other person' },
        ],
      },
    ]);
    const refused = await source.stores.directory.removePerson(PERSON, false, seed.stamp, {
      kind: 'every',
    });
    expect(refused).toMatchObject({
      ok: false,
      reason: 'in_use',
      usage: { steps: usage.steps, claims: usage.claims },
    });
    expect(fixture.readEvidence().snapshot).toEqual(before);
    expect(
      await source.stores.directory.removePerson(PERSON, true, seed.stamp, { kind: 'every' }),
    ).toMatchObject({ ok: true });
    expect(source.db.all(sql`SELECT id FROM person WHERE id=${PERSON}`)).toEqual([]);
    expect(source.db.all(sql`SELECT id FROM claim WHERE person_id=${PERSON}`)).toEqual([]);
    expect(
      source.db.all(
        sql`SELECT work_item_id,step_id,person_id FROM assignment ORDER BY work_item_id,step_id`,
      ),
    ).toEqual([{ work_item_id: SIBLING, step_id: SIBLING_STEP, person_id: OTHER }]);
  });
}, 15000);

async function prepareResource({ source, seed }: Fixture): Promise<void> {
  expect(
    (
      await source.stores.directory.addResource(
        { id: RESOURCE, name: 'Current resource', kind: 'divisible', unitLabel: 'units' },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  for (const [workItemId, units] of [
    [MAIN, 4],
    [SIBLING, 5],
  ] as const)
    expect(await source.stores.demands.set(workItemId, RESOURCE, units, seed.stamp)).toBe(
      'written',
    );
  expect(
    (await source.stores.resourceCapacity.set(seed.siblingWorkPackageId, RESOURCE, 32, seed.stamp))
      .ok,
  ).toBe(true);
}

test('current directory resource refusal and cascade read catalogue usage on their writer', async () => {
  await withinFixture(async (fixture) => {
    await prepareResource(fixture);
    const { source, seed } = fixture,
      before = fixture.readEvidence().snapshot;
    const refused = await source.stores.directory.removeResource(RESOURCE, false, seed.stamp);
    expect(refused).toMatchObject({ ok: false, reason: 'in_use' });
    if (refused.ok || refused.reason !== 'in_use')
      throw new Error('resource usage was not retained');
    expect(orderNames(refused.usage.rows.steps)).toEqual(names);
    expect(refused.usage.demands).toEqual([
      { workItemId: MAIN, resourceId: RESOURCE, units: 4 },
      { workItemId: SIBLING, resourceId: RESOURCE, units: 5 },
    ]);
    expect(fixture.readEvidence().snapshot).toEqual(before);
    expect(await source.stores.directory.removeResource(RESOURCE, true, seed.stamp)).toMatchObject({
      ok: true,
    });
    expect(source.db.all(sql`SELECT id FROM resource WHERE id=${RESOURCE}`)).toEqual([]);
    expect(await source.stores.demands.listByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(await source.stores.demands.listByWorkPackage(seed.siblingWorkPackageId)).toEqual([]);
  });
}, 15000);

/**
 * Only the exclusively owned fixture is corrupted; constraints are restored
 * before actual directory reads.
 * Proof: separately omitting value/parent/row deletion fails the physical
 * absence premises (current-directory-effect-{values,parent,row}-injection-v2).
 * Omitting FK restoration fails all six actual PRAGMA premises before reads
 * (current-directory-effect-constraint-restoration-v2).
 */
function deleteTrusted(
  fixture: Fixture,
  boundary: 'primary-values' | 'sibling-values' | 'parent' | 'work-item',
): void {
  const { db } = fixture.source,
    { seed } = fixture;
  const workPackageId =
    boundary === 'sibling-values' ? seed.siblingWorkPackageId : seed.workPackageId;
  db.run(sql`PRAGMA foreign_keys=OFF`);
  try {
    if (boundary === 'parent') db.run(sql`DELETE FROM project WHERE id=${seed.projectId}`);
    else if (boundary === 'work-item') db.run(sql`DELETE FROM work_item WHERE id=${MAIN}`);
    else
      db.run(
        sql`DELETE FROM work_package_step WHERE work_package_id=${workPackageId} AND step_id=${SHARED}`,
      );
  } finally {
    db.run(sql`PRAGMA foreign_keys=ON`);
  }
  expect(db.all('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
  expect(
    boundary === 'parent'
      ? db.all(sql`SELECT id FROM project WHERE id=${seed.projectId}`)
      : boundary === 'work-item'
        ? db.all(sql`SELECT id FROM work_item WHERE id=${MAIN}`)
        : db.all(
            sql`SELECT step_id FROM work_package_step WHERE work_package_id=${workPackageId} AND step_id=${SHARED}`,
          ),
  ).toEqual([]);
}

const failureOf = (action: () => Promise<unknown>): Promise<unknown> =>
  Promise.resolve()
    .then(action)
    .then(
      () => null,
      (cause: unknown) => cause,
    );

for (const boundary of ['primary-values', 'sibling-values'] as const)
  test(
    'current directory usage refuses missing explicit ' + boundary + ' without changing facts',
    async () => {
      await withinFixture(async (fixture) => {
        deleteTrusted(fixture, boundary);
        const { source, seed } = fixture,
          before = fixture.readEvidence().snapshot;
        for (const action of [
          () => source.stores.directory.usageOfPerson(PERSON),
          () => source.stores.directory.removePerson(PERSON, false, seed.stamp, { kind: 'every' }),
        ]) {
          expect(await failureOf(action)).toBeInstanceOf(WorkPackageStepMissing);
          expect(fixture.readEvidence().snapshot).toEqual(before);
        }
      });
    },
    15000,
  );

test('current directory resource removal refuses an absent package parent before deletion', async () => {
  await withinFixture(async (fixture) => {
    await prepareResource(fixture);
    deleteTrusted(fixture, 'parent');
    const { source, seed } = fixture,
      before = fixture.readEvidence().snapshot;
    for (const cascade of [false, true]) {
      const failure = await failureOf(() =>
        source.stores.directory.removeResource(RESOURCE, cascade, seed.stamp),
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty(
        'message',
        'package ' + seed.workPackageId + ' has an absent, malformed or foreign parent',
      );
      expect(fixture.readEvidence().snapshot).toEqual(before);
    }
  });
}, 15000);

for (const family of ['assignment', 'claim'] as const)
  test(
    'current directory usage refuses unresolved retained ' + family + ' facts',
    async () => {
      await withinFixture(async (fixture) => {
        const { source, seed } = fixture;
        if (family === 'assignment') {
          // Proof: omitting either other-family deletion fails that family's
          // physical isolation premise (current-directory-effect-{assignment,claim}-only-setup-v2).
          source.db.run(sql`DELETE FROM claim WHERE person_id=${PERSON}`);
          expect(source.db.all(sql`SELECT id FROM claim WHERE person_id=${PERSON}`)).toEqual([]);
        } else {
          source.db.run(sql`DELETE FROM assignment WHERE person_id=${PERSON}`);
          expect(
            source.db.all(sql`SELECT step_id FROM assignment WHERE person_id=${PERSON}`),
          ).toEqual([]);
        }
        // Proof: omitting binding deletion fails both physical absence premises
        // before unresolved facts are read (current-directory-effect-binding-injection-v2).
        source.db.run(sql`DELETE FROM step_binding WHERE id=${SHARED + ':binding'}`);
        expect(
          source.db.all(sql`SELECT id FROM step_binding WHERE id=${SHARED + ':binding'}`),
        ).toEqual([]);
        expect(
          source.db.all(
            sql`SELECT step_id FROM work_package_step WHERE work_package_id=${seed.workPackageId} AND step_id=${SHARED}`,
          ),
        ).toEqual([{ step_id: SHARED }]);
        const before = fixture.readEvidence().snapshot;
        for (const action of [
          () => source.stores.directory.usageOfPerson(PERSON),
          () => source.stores.directory.removePerson(PERSON, false, seed.stamp, { kind: 'every' }),
        ]) {
          const failure = await failureOf(action);
          expect(failure).toBeInstanceOf(Error);
          expect(failure).toHaveProperty(
            'message',
            'stored ' + family + ' is not leaf-resolved: step_not_resolved',
          );
          expect(fixture.readEvidence().snapshot).toEqual(before);
        }
      });
    },
    15000,
  );

test('current directory usage refuses a retained claim whose work item is absent', async () => {
  await withinFixture(async (fixture) => {
    deleteTrusted(fixture, 'work-item');
    const { source, seed } = fixture,
      before = fixture.readEvidence().snapshot;
    expect(source.db.all(sql`SELECT work_item_id FROM claim WHERE person_id=${PERSON}`)).toEqual([
      { work_item_id: MAIN },
    ]);
    for (const action of [
      () => source.stores.directory.usageOfPerson(PERSON),
      () => source.stores.directory.removePerson(PERSON, false, seed.stamp, { kind: 'every' }),
    ]) {
      const failure = await failureOf(action);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', 'directory claim work item is absent from usage');
      expect(fixture.readEvidence().snapshot).toEqual(before);
    }
  });
}, 15000);

for (const cascade of [false, true])
  test(
    'current directory resource ' +
      (cascade ? 'cascade' : 'refusal') +
      ' requires explicit values without point facts',
    async () => {
      await withinFixture(async (fixture) => {
        await prepareResource(fixture);
        const { source, seed } = fixture;
        // Proof: separately omitting either clear fails both no-point premises
        // (current-directory-effect-no-points-{assignment,claim}-v2), before value admission.
        source.db.run(sql`DELETE FROM assignment`);
        source.db.run(sql`DELETE FROM claim`);
        expect(source.db.all('SELECT work_item_id FROM assignment')).toEqual([]);
        expect(source.db.all('SELECT work_item_id FROM claim')).toEqual([]);
        deleteTrusted(fixture, 'primary-values');
        const before = fixture.readEvidence().snapshot;
        expect(
          await failureOf(() =>
            source.stores.directory.removeResource(RESOURCE, cascade, seed.stamp),
          ),
        ).toBeInstanceOf(WorkPackageStepMissing);
        expect(fixture.readEvidence().snapshot).toEqual(before);
      });
    },
    15000,
  );

test('current directory usage refuses duplicate retained claim addresses', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed } = fixture;
    source.db.run(sql`DROP INDEX claim_step`);
    // Proof: omitting this INSERT leaves one actual claim at the complete-row
    // premise (current-directory-effect-duplicate-injection-v2); no duplicate-guard credit follows.
    source.db.run(
      sql`INSERT INTO claim(id,work_item_id,step_id,person_id,created_at,created_by) VALUES('directory-current-duplicate',${MAIN},${SHARED},${PERSON},${seed.stamp.at},${seed.stamp.by})`,
    );
    expect(
      source.db.all(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='claim_step'`),
    ).toEqual([]);
    expect(
      source.db.all(
        sql`SELECT id FROM claim WHERE work_item_id=${MAIN} AND step_id=${SHARED} ORDER BY id`,
      ),
    ).toEqual([{ id: 'directory-current-claim' }, { id: 'directory-current-duplicate' }]);
    const before = fixture.readEvidence().snapshot;
    const failure = await failureOf(() => source.stores.directory.usageOfPerson(PERSON));
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', 'duplicate stored claim pair');
    expect(fixture.readEvidence().snapshot).toEqual(before);
  });
}, 15000);
