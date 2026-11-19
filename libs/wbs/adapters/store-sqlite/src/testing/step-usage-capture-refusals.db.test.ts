import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type CaptureFixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function attempt<Value>(call: () => Value | Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}
/** Unexpected mode-restoration failure retains the real Source and directory, without claiming permanent quarantine or fabricating recovery authority. */
const retainedCaptureFixtures = new Set<CaptureFixture>();

async function withCaptureFixture(
  assertCapture: (fixture: CaptureFixture) => Promise<void>,
): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  const execution = await attempt(async () => {
    const { source, port, seed } = fixture;
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'capture-dev',
            code: 'capture-dev',
            name: 'Capture Development',
            position: 10,
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 12.5,
          },
          {
            bindingId: 'capture-binding',
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: null,
            position: 10,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    for (const placement of [
      { id: 'capture-parent', parentId: null, position: 10 },
      { id: 'capture-leaf', parentId: 'capture-parent', position: 10 },
      { id: 'capture-other-parent', parentId: null, position: 20 },
      { id: 'capture-other-leaf', parentId: 'capture-other-parent', position: 10 },
    ])
      await source.stores.workItems.insert(
        workItemRow({ ...placement, workPackageId: seed.workPackageId, name: placement.id }),
        [],
        seed.stamp,
      );
    await source.uow.run(() => {
      source.db.run(
        sql`INSERT INTO person(id,name,account_id,created_at,created_by) VALUES('capture-holder','Capture holder',${seed.stamp.by},100,${seed.stamp.by})`,
      );
      source.db.run(
        sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('capture-holder',${seed.organizationId},'Capture holder')`,
      );
      return Promise.resolve({ commit: true, value: undefined });
    });
    expect(source.db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
    expect(source.db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([
      { ignore_check_constraints: 0 },
    ]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    await assertCapture(fixture);
  });
  if (retainedCaptureFixtures.has(fixture)) {
    if (!execution.ok) throw execution.cause;
    throw new Error('capture fixture has unknown restored mode; owner retained');
  }
  const closed = await attempt(() => fixture.close());
  if (!execution.ok) {
    if (!closed.ok)
      throw new AggregateError(
        [execution.cause, closed.cause],
        'capture assertion and fixture close failed',
        { cause: closed.cause },
      );
    throw execution.cause;
  }
  if (!closed.ok) throw closed.cause;
}

function withBrokenConstraint(
  fixture: CaptureFixture,
  mode: 'foreign_keys' | 'ignore_check_constraints',
  corrupt: () => void,
): void {
  const db = fixture.source.db;
  expect(db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
  expect(db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([{ ignore_check_constraints: 0 }]);
  let primary: { readonly cause: unknown } | undefined;
  try {
    db.run(
      sql.raw(
        mode === 'foreign_keys' ? 'PRAGMA foreign_keys=OFF' : 'PRAGMA ignore_check_constraints=ON',
      ),
    );
    expect(db.all(sql.raw('PRAGMA ' + mode))).toEqual(
      mode === 'foreign_keys' ? [{ foreign_keys: 0 }] : [{ ignore_check_constraints: 1 }],
    );
    corrupt();
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    db.run(
      sql.raw(
        mode === 'foreign_keys' ? 'PRAGMA foreign_keys=ON' : 'PRAGMA ignore_check_constraints=OFF',
      ),
    );
    expect(db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
    expect(db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([{ ignore_check_constraints: 0 }]);
  } catch (cleanup: unknown) {
    retainedCaptureFixtures.add(fixture);
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'trusted corruption and constraint restoration failed; fixture retained',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

function constraintState(fixture: CaptureFixture) {
  return {
    schema: fixture.source.db.all(
      sql`SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY`,
    ),
    ledger: fixture.source.db.all(
      sql`SELECT * FROM __drizzle_migrations ORDER BY name COLLATE BINARY`,
    ),
  };
}
async function expectCaptureRefusal(fixture: CaptureFixture, diagnostic: string): Promise<void> {
  const before = fixture.readEvidence();
  for (const dryRun of [false, true]) {
    const rejected = await attempt(() =>
      fixture.port.unbindStep(
        fixture.seed.organizationId,
        'capture-binding',
        { dryRun },
        fixture.seed.stamp,
      ),
    );
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('corrupt trusted capture returned a modeled unbind outcome');
    expect(rejected.cause).toBeInstanceOf(Error);
    if (!(rejected.cause instanceof Error)) throw rejected.cause;
    expect(rejected.cause.message).toContain(diagnostic);
    expect(fixture.readEvidence()).toEqual(before);
    expect(fixture.source.db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
    expect(fixture.source.db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([
      { ignore_check_constraints: 0 },
    ]);
  }
}

async function seedClaim(fixture: CaptureFixture, delegated: boolean): Promise<void> {
  const { source, seed } = fixture;
  await source.uow.run(() => {
    if (delegated) {
      source.db.run(
        sql`INSERT INTO claim(id,work_item_id,step_id,person_id,created_at,created_by) VALUES('capture-reservation','capture-parent',NULL,'capture-holder',100,${seed.stamp.by})`,
      );
      source.db.run(
        sql`INSERT INTO claim(id,work_item_id,step_id,person_id,created_at,created_by) VALUES('capture-other-reservation','capture-other-parent',NULL,'capture-holder',100,${seed.stamp.by})`,
      );
    }
    source.db.run(
      sql`INSERT INTO claim(id,work_item_id,step_id,person_id,parent_claim_id,run_id,lease_expires_at,lease_revoked_at,created_at,created_by) VALUES('capture-claim','capture-leaf','capture-dev','capture-holder',${delegated ? 'capture-reservation' : null},'opaque-run',150,151,100,${seed.stamp.by})`,
    );
    return Promise.resolve({ commit: true, value: undefined });
  });
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  const before = fixture.readEvidence();
  expect(
    await fixture.port.unbindStep(
      seed.organizationId,
      'capture-binding',
      { dryRun: true },
      seed.stamp,
    ),
  ).toEqual({
    kind: 'preview',
    wouldRefuse: 'step_nodes_in_use',
    count: 1,
    pairs: [
      {
        id: 'capture-leaf',
        name: 'capture-leaf',
        workPackageId: seed.workPackageId,
        stepId: 'capture-dev',
        facts: ['claim'],
      },
    ],
  });
  expect(fixture.readEvidence()).toEqual(before);
  expect(
    (await source.stores.claims.listStampedByWorkPackage(seed.workPackageId)).find(
      ({ id }) => id === 'capture-claim',
    ),
  ).toEqual({
    id: 'capture-claim',
    workItemId: 'capture-leaf',
    stepId: 'capture-dev',
    personId: 'capture-holder',
    accountId: seed.stamp.by,
    parentClaimId: delegated ? 'capture-reservation' : null,
    runId: 'opaque-run',
    claimedAt: 100,
    leaseExpiresAt: 150,
    leaseRevokedAt: 151,
  });
}

const claimCorruptions: readonly {
  readonly title: string;
  readonly diagnostic: string;
  readonly delegated: boolean;
  readonly stampedDiagnostic?: string;
  corrupt(fixture: CaptureFixture): void;
  assertPremise(fixture: CaptureFixture): void;
}[] = [
  {
    title: 'null claim creation instant',
    diagnostic: 'claim instant',
    delegated: false,
    stampedDiagnostic: 'write instant',
    corrupt({ source }) {
      source.db.run(sql`UPDATE claim SET created_at=NULL WHERE id='capture-claim'`);
    },
    assertPremise({ source }) {
      expect(source.db.all(sql`SELECT created_at FROM claim WHERE id='capture-claim'`)).toEqual([
        { created_at: null },
      ]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    },
  },
  {
    title: 'null claim writing account',
    diagnostic: 'claim writing account',
    delegated: false,
    stampedDiagnostic: 'writing account',
    corrupt({ source }) {
      source.db.run(sql`UPDATE claim SET created_by=NULL WHERE id='capture-claim'`);
    },
    assertPremise({ source }) {
      expect(source.db.all(sql`SELECT created_by FROM claim WHERE id='capture-claim'`)).toEqual([
        { created_by: null },
      ]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    },
  },
  {
    title: 'missing claim holder with restored foreign keys',
    diagnostic: 'claim holder/account',
    delegated: false,
    corrupt(fixture) {
      withBrokenConstraint(fixture, 'foreign_keys', () => {
        fixture.source.db.run(
          sql`UPDATE claim SET person_id='capture-missing-holder' WHERE id='capture-claim'`,
        );
      });
    },
    assertPremise({ source }) {
      expect(source.db.all(sql`SELECT person_id FROM claim WHERE id='capture-claim'`)).toEqual([
        { person_id: 'capture-missing-holder' },
      ]);
      expect(
        source.db
          .all<{ table: string; parent: string }>(sql`PRAGMA foreign_key_check`)
          .map(({ table, parent }) => ({ table, parent })),
      ).toEqual([{ table: 'claim', parent: 'person' }]);
    },
  },
  {
    title: 'foreign claim holder',
    diagnostic: 'claim holder/account',
    delegated: false,
    corrupt({ source, seed }) {
      source.db.run(
        sql`INSERT INTO person(id,name,account_id,created_at,created_by) VALUES('capture-foreign-holder','Capture foreign holder',${seed.stamp.by},100,${seed.stamp.by})`,
      );
      source.db.run(
        sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('capture-foreign-holder',${seed.foreignOrganizationId},'Capture foreign holder')`,
      );
      source.db.run(
        sql`UPDATE claim SET person_id='capture-foreign-holder' WHERE id='capture-claim'`,
      );
    },
    assertPremise({ source, seed }) {
      expect(
        source.db.all(
          sql`SELECT c.person_id,p.organization_id FROM claim c JOIN person_organization p ON p.resource_id=c.person_id WHERE c.id='capture-claim'`,
        ),
      ).toEqual([
        { person_id: 'capture-foreign-holder', organization_id: seed.foreignOrganizationId },
      ]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    },
  },
  {
    title: 'nonancestor delegated claim',
    diagnostic: 'not a strict ancestor',
    delegated: true,
    corrupt({ source }) {
      source.db.run(
        sql`UPDATE claim SET parent_claim_id='capture-other-reservation' WHERE id='capture-claim'`,
      );
    },
    assertPremise({ source }) {
      expect(
        source.db.all(sql`SELECT parent_claim_id FROM claim WHERE id='capture-claim'`),
      ).toEqual([{ parent_claim_id: 'capture-other-reservation' }]);
      expect(source.db.all(sql`SELECT parent_id FROM work_item WHERE id='capture-leaf'`)).toEqual([
        { parent_id: 'capture-parent' },
      ]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    },
  },
  {
    title: 'missing delegation parent with restored foreign keys',
    diagnostic: 'claim delegation',
    delegated: true,
    corrupt(fixture) {
      withBrokenConstraint(fixture, 'foreign_keys', () => {
        fixture.source.db.run(
          sql`UPDATE claim SET parent_claim_id='capture-missing-reservation' WHERE id='capture-claim'`,
        );
      });
    },
    assertPremise({ source }) {
      expect(
        source.db.all(sql`SELECT parent_claim_id FROM claim WHERE id='capture-claim'`),
      ).toEqual([{ parent_claim_id: 'capture-missing-reservation' }]);
      expect(
        source.db
          .all<{ table: string; parent: string }>(sql`PRAGMA foreign_key_check`)
          .map(({ table, parent }) => ({ table, parent })),
      ).toEqual([{ table: 'claim', parent: 'claim' }]);
    },
  },
  {
    title: 'BLOB lease instant',
    diagnostic: 'claim instant',
    delegated: false,
    corrupt({ source }) {
      source.db.run(sql`UPDATE claim SET lease_expires_at=x'01' WHERE id='capture-claim'`);
    },
    assertPremise({ source }) {
      expect(
        source.db.all(
          sql`SELECT typeof(lease_expires_at) AS shape FROM claim WHERE id='capture-claim'`,
        ),
      ).toEqual([{ shape: 'blob' }]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    },
  },
  {
    title: 'BLOB opaque run with restored checks',
    diagnostic: 'claim run',
    delegated: false,
    corrupt(fixture) {
      withBrokenConstraint(fixture, 'ignore_check_constraints', () => {
        fixture.source.db.run(sql`UPDATE claim SET run_id=x'01' WHERE id='capture-claim'`);
      });
    },
    assertPremise({ source }) {
      expect(
        source.db.all(sql`SELECT typeof(run_id) AS shape FROM claim WHERE id='capture-claim'`),
      ).toEqual([{ shape: 'blob' }]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    },
  },
];
for (const corruption of claimCorruptions)
  test('sqlite unbind capture refuses ' + corruption.title + ' atomically', async () => {
    await withCaptureFixture(async (fixture) => {
      await seedClaim(fixture, corruption.delegated);
      const constraints = constraintState(fixture);
      corruption.corrupt(fixture);
      corruption.assertPremise(fixture);
      expect(constraintState(fixture)).toEqual(constraints);
      if (corruption.stampedDiagnostic !== undefined) {
        const refused = await attempt(() =>
          fixture.source.stores.claims.listStampedByWorkPackage(fixture.seed.workPackageId),
        );
        expect(refused.ok).toBe(false);
        if (refused.ok) throw new Error('existing stamped claim reader accepted missing audit');
        expect(refused.cause).toBeInstanceOf(Error);
        if (!(refused.cause instanceof Error)) throw refused.cause;
        expect(refused.cause.message).toContain(corruption.stampedDiagnostic);
      }
      await expectCaptureRefusal(fixture, corruption.diagnostic);
    });
  });

async function seedEstimate(fixture: CaptureFixture): Promise<void> {
  const { source, port, seed } = fixture;
  expect(
    await source.stores.estimates.set(
      {
        workItemId: 'capture-leaf',
        stepId: 'capture-dev',
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      },
      seed.stamp,
    ),
  ).toBe('written');
  expect(
    source.db.all(sql`SELECT work_item_id,step_id,optimistic,realistic,pessimistic FROM estimate`),
  ).toEqual([
    {
      work_item_id: 'capture-leaf',
      step_id: 'capture-dev',
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    },
  ]);
  const before = fixture.readEvidence();
  expect(
    await port.unbindStep(seed.organizationId, 'capture-binding', { dryRun: true }, seed.stamp),
  ).toEqual({
    kind: 'preview',
    wouldRefuse: 'step_nodes_in_use',
    count: 1,
    pairs: [
      {
        id: 'capture-leaf',
        name: 'capture-leaf',
        stepId: 'capture-dev',
        workPackageId: seed.workPackageId,
        facts: ['estimate'],
      },
    ],
  });
  expect(fixture.readEvidence()).toEqual(before);
}

test('sqlite unbind capture refuses a foreign stated type atomically', async () => {
  await withCaptureFixture(async (fixture) => {
    const { source, seed } = fixture;
    source.db.run(
      sql`INSERT INTO work_item_work_item_type(work_item_id,type_id,created_at,created_by) VALUES('capture-leaf',${seed.typeId},100,${seed.stamp.by})`,
    );
    await seedEstimate(fixture);
    const constraints = constraintState(fixture);
    // Alter only the membership: immutable organization mappings and their real freeze triggers remain intact.
    source.db.run(
      sql`UPDATE work_item_work_item_type SET type_id=${seed.foreignTypeId} WHERE work_item_id='capture-leaf'`,
    );
    expect(
      source.db.all(
        sql`SELECT m.type_id,t.organization_id FROM work_item_work_item_type m JOIN work_item_type_organization t ON t.resource_id=m.type_id WHERE m.work_item_id='capture-leaf'`,
      ),
    ).toEqual([{ type_id: seed.foreignTypeId, organization_id: seed.foreignOrganizationId }]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    expect(constraintState(fixture)).toEqual(constraints);
    await expectCaptureRefusal(fixture, 'type ownership');
  });
});

test('sqlite unbind capture refuses a missing stated type with restored foreign keys atomically', async () => {
  await withCaptureFixture(async (fixture) => {
    const { source, seed } = fixture;
    source.db.run(
      sql`INSERT INTO work_item_work_item_type(work_item_id,type_id,created_at,created_by) VALUES('capture-leaf',${seed.typeId},100,${seed.stamp.by})`,
    );
    await seedEstimate(fixture);
    const constraints = constraintState(fixture);
    withBrokenConstraint(fixture, 'foreign_keys', () => {
      source.db.run(
        sql`UPDATE work_item_work_item_type SET type_id='capture-missing-type' WHERE work_item_id='capture-leaf'`,
      );
    });
    expect(
      source.db.all(
        sql`SELECT type_id FROM work_item_work_item_type WHERE work_item_id='capture-leaf'`,
      ),
    ).toEqual([{ type_id: 'capture-missing-type' }]);
    expect(
      source.db
        .all<{ table: string; parent: string }>(sql`PRAGMA foreign_key_check`)
        .map(({ table, parent }) => ({ table, parent })),
    ).toEqual([{ table: 'work_item_work_item_type', parent: 'work_item_type' }]);
    expect(constraintState(fixture)).toEqual(constraints);
    await expectCaptureRefusal(fixture, 'type organization');
  });
});

test('sqlite unbind capture refuses a missing explicit package link atomically', async () => {
  await withCaptureFixture(async (fixture) => {
    const { source, seed } = fixture;
    await seedEstimate(fixture);
    const constraints = constraintState(fixture);
    source.db.run(
      sql`DELETE FROM work_package_step WHERE work_package_id=${seed.workPackageId} AND step_id='capture-dev'`,
    );
    expect(
      source.db.all(
        sql`SELECT step_id FROM work_package_step WHERE work_package_id=${seed.workPackageId}`,
      ),
    ).toEqual([]);
    expect(source.db.all(sql`SELECT work_item_id,step_id FROM estimate`)).toEqual([
      { work_item_id: 'capture-leaf', step_id: 'capture-dev' },
    ]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    expect(constraintState(fixture)).toEqual(constraints);
    await expectCaptureRefusal(fixture, 'definition/package link');
  });
});

test('sqlite unbind capture refuses a BLOB package unit with restored checks atomically', async () => {
  await withCaptureFixture(async (fixture) => {
    const { source, seed } = fixture;
    await seedEstimate(fixture);
    const constraints = constraintState(fixture);
    withBrokenConstraint(fixture, 'ignore_check_constraints', () => {
      source.db.run(
        sql`UPDATE work_package_step SET estimate_unit=x'01' WHERE work_package_id=${seed.workPackageId} AND step_id='capture-dev'`,
      );
    });
    expect(
      source.db.all(
        sql`SELECT typeof(estimate_unit) AS shape FROM work_package_step WHERE work_package_id=${seed.workPackageId} AND step_id='capture-dev'`,
      ),
    ).toEqual([{ shape: 'blob' }]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    expect(constraintState(fixture)).toEqual(constraints);
    await expectCaptureRefusal(fixture, 'estimate unit');
  });
});
