import { expect, it } from 'bun:test';

import { inMemoryProjects, memoryProjectTables } from './project-fixture';
import { seedProjectCatalogue } from './testing/project-catalogue-fixture';
import { workPackageRow } from './work-package-fixture';
function fixture() {
  const tables = memoryProjectTables();
  tables.users.set('creator', {
    id: 'creator',
    username: 'Creator',
    passwordHash: null,
    createdAt: 1,
  });
  tables.organizations.set('org', { legacy: false });
  tables.memberships.set('org', new Set(['creator']));
  return { tables, store: inMemoryProjects(tables) };
}
const draft = () => ({ id: 'p', organizationId: 'org', name: 'Plan' });
const act = () => ({
  actor: { kind: 'user' as const, userId: 'creator' },
  at: 17,
  grantId: 'p-grant',
  projectAuditId: 'p-created',
  grantAuditId: 'p-granted',
});
const first = () => ({
  workPackage: workPackageRow({ id: 'w', projectId: 'p', name: 'First', createdAt: 17 }),
  steps: [
    {
      id: 's',
      workPackageId: 'w',
      name: 'Dev',
      position: 10,
      code: 'DEV',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
  ],
  creatorGrant: { id: 'w-grant', auditId: 'w-granted' },
});
function snapshot(tables: ReturnType<typeof memoryProjectTables>) {
  return structuredClone(tables);
}
async function expectFailure(operation: Promise<unknown>, diagnostic: string) {
  let rejected = false;
  try {
    await operation;
  } catch (reason) {
    rejected = true;
    expect(() => {
      throw reason;
    }).toThrow(diagnostic);
  }
  expect(rejected).toBe(true);
}
it('publishes actual first package and step state with both real creator grants and three audits', async () => {
  const { tables, store } = fixture();
  await seedProjectCatalogue(tables, 'org', {
    id: 's',
    code: 'dev',
    name: 'Dev',
    position: 10,
    defaultEstimateUnit: 'workdays',
    defaultAllowancePercent: 0,
  });
  expect(await store.create(draft(), act(), first())).toMatchObject({
    kind: 'created_with_work_package',
    project: { workPackageCount: 1 },
    workPackage: { id: 'w', projectId: 'p' },
    steps: [{ id: 's' }],
  });
  expect(tables.packages.workPackages.get('w')).toMatchObject({ id: 'w', projectId: 'p' });
  expect(tables.packages.steps.get('w')).toEqual([]);
  expect(tables.catalogue.packageValues.get('w')).toEqual(
    new Map([
      [
        's',
        {
          workPackageId: 'w',
          stepId: 's',
          estimateUnit: 'workdays',
          allowanceBps: 0,
          allowanceRevision: 0,
        },
      ],
    ]),
  );
  expect(tables.packages.owning.get('w')).toBe('org');
  expect(tables.packages.creation.creators.get('w')).toBe('creator');
  expect(tables.packages.creation.projects).toBe(tables.projects);
  expect(tables.packages.creation.grants).toBe(tables.grants);
  expect(
    [...tables.grants.values()].map(({ roleId, origin, subject }) => ({ roleId, origin, subject })),
  ).toEqual([
    { roleId: 'project-manager', origin: 'creation', subject: { kind: 'user', userId: 'creator' } },
    { roleId: 'package-manager', origin: 'creation', subject: { kind: 'user', userId: 'creator' } },
  ]);
  expect([...tables.audits.values()].map(({ action }) => action)).toEqual([
    'project_created',
    'access_granted',
    'access_granted',
  ]);
});
for (const stage of [
  'project',
  'grant',
  'project_audit',
  'grant_audit',
  'package',
  'package_grant',
  'package_grant_audit',
] as const)
  it('publishes no joined state when selected combined stage ' + stage + ' fails', async () => {
    const { tables, store } = fixture();
    await seedProjectCatalogue(tables, 'org', {
      id: 's',
      code: 'dev',
      name: 'Dev',
      position: 10,
      defaultEstimateUnit: 'workdays',
      defaultAllowancePercent: 0,
    });
    tables.failAt = stage;
    const before = snapshot(tables);
    await expectFailure(
      store.create(draft(), act(), first()),
      'controlled ' + stage + ' write failure',
    );
    expect(snapshot(tables)).toEqual(before);
  });
it('requires the actual package-manager role and creator membership after project staging', async () => {
  for (const reason of ['role', 'membership']) {
    const { tables, store } = fixture();
    if (reason === 'role') tables.roles.delete('package-manager');
    else tables.memberships.set('org', new Set());
    const before = snapshot(tables);
    const operation = store.create(draft(), act(), first());
    if (reason === 'membership') expect(await operation).toBe('not_a_member');
    else await expectFailure(operation, 'unknown_role');
    expect(snapshot(tables)).toEqual(before);
  }
});

it('keeps an explicitly empty current catalogue empty instead of publishing the legacy first-package draft', async () => {
  const { tables, store } = fixture();
  expect(await store.create(draft(), act(), first())).toMatchObject({
    kind: 'created_with_work_package',
    project: { workPackageCount: 1 },
    workPackage: { id: 'w', projectId: 'p' },
    steps: [],
  });
  expect(tables.packages.steps.get('w')).toEqual([]);
  expect([...tables.grants.values()].map((grant) => grant.roleId).sort()).toEqual([
    'package-manager',
    'project-manager',
  ]);
  expect(tables.audits.size).toBe(3);
});

it('materializes typed-only catalogue steps in an empty first package', async () => {
  const { tables, store } = fixture();
  tables.workItemTypes.set('build-type', { id: 'build-type' });
  tables.typeOrganizations.set('build-type', 'org');
  await seedProjectCatalogue(
    tables,
    'org',
    {
      id: 'typed-review',
      code: 'review',
      name: 'Review',
      position: 30,
      defaultEstimateUnit: 'minutes',
      defaultAllowancePercent: 25,
    },
    'build-type',
  );
  expect(await store.create(draft(), act(), first())).toMatchObject({
    kind: 'created_with_work_package',
    steps: [
      {
        id: 'typed-review',
        name: 'Review',
        code: 'review',
        estimateUnit: 'minutes',
        allowancePercent: 25,
      },
    ],
  });
  expect(tables.catalogue.packageValues.get('w')).toEqual(
    new Map([
      [
        'typed-review',
        {
          workPackageId: 'w',
          stepId: 'typed-review',
          estimateUnit: 'minutes',
          allowanceBps: 2500,
          allowanceRevision: 0,
        },
      ],
    ]),
  );
});

it('captures a real catalogue binding added before the queued first-package owner starts', async () => {
  const { tables, store } = fixture();
  const pending = store.create(draft(), act(), first());
  const authored = seedProjectCatalogue(tables, 'org', {
    id: 'queued-review',
    code: 'review',
    name: 'Queued review',
    position: 20,
    defaultEstimateUnit: 'minutes',
    defaultAllowancePercent: 6.25,
  });
  await authored;
  expect(await pending).toMatchObject({
    kind: 'created_with_work_package',
    steps: [
      {
        id: 'queued-review',
        name: 'Queued review',
        estimateUnit: 'minutes',
        allowancePercent: 6.25,
      },
    ],
  });
  expect(tables.catalogue.packageValues.get('w')?.get('queued-review')).toEqual({
    workPackageId: 'w',
    stepId: 'queued-review',
    estimateUnit: 'minutes',
    allowanceBps: 625,
    allowanceRevision: 0,
  });
});

for (const fault of ['invalid-default', 'retired-definition', 'foreign-type'] as const) {
  it('rolls the complete combined owner back for ' + fault, async () => {
    const { tables, store } = fixture();
    tables.workItemTypes.set('build-type', { id: 'build-type' });
    tables.typeOrganizations.set('build-type', 'org');
    await seedProjectCatalogue(
      tables,
      'org',
      {
        id: 'current-dev',
        code: 'dev',
        name: 'Dev',
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      'build-type',
    );
    const definition = tables.catalogue.definitions.get('current-dev');
    if (definition === undefined) throw new Error('authored definition is absent');
    if (fault === 'invalid-default') Reflect.set(definition, 'defaultEstimateUnit', 'hours');
    else if (fault === 'retired-definition')
      tables.catalogue.retirements.set('current-dev', {
        stepId: 'current-dev',
        organizationId: 'org',
        retiredAt: 43,
        retiredBy: 'creator',
      });
    else {
      tables.organizations.set('foreign', { legacy: false });
      tables.typeOrganizations.set('build-type', 'foreign');
    }
    const before = snapshot(tables);
    await expectFailure(
      store.create(draft(), act(), first()),
      fault === 'invalid-default'
        ? 'default estimate unit is malformed'
        : fault === 'retired-definition'
          ? 'retired definition'
          : 'type is absent or foreign',
    );
    expect(snapshot(tables)).toEqual(before);
  });
}

it('preserves existing explicit values when a later combined birth uses changed defaults', async () => {
  const { tables, store } = fixture();
  await seedProjectCatalogue(tables, 'org', {
    id: 'current-dev',
    code: 'dev',
    name: 'Dev',
    position: 10,
    defaultEstimateUnit: 'workdays',
    defaultAllowancePercent: 0,
  });
  expect(await store.create(draft(), act(), first())).toMatchObject({
    kind: 'created_with_work_package',
  });
  const prior = structuredClone(tables.catalogue.packageValues.get('w'));
  const definition = tables.catalogue.definitions.get('current-dev');
  if (definition === undefined) throw new Error('authored definition is absent');
  // Valid stored defaults after an independent edit; existing explicit values remain authored facts.
  Reflect.set(definition, 'defaultEstimateUnit', 'minutes');
  Reflect.set(definition, 'defaultAllowanceBps', 2500);
  expect(
    await store.create(
      { id: 'second-project', organizationId: 'org', name: 'Second' },
      {
        actor: { kind: 'user', userId: 'creator' },
        at: 18,
        grantId: 'second-project-grant',
        projectAuditId: 'second-project-created',
        grantAuditId: 'second-project-granted',
      },
      {
        workPackage: workPackageRow({
          id: 'second-package',
          projectId: 'second-project',
          name: 'Second child',
          createdAt: 18,
        }),
        steps: [],
        creatorGrant: { id: 'second-package-grant', auditId: 'second-package-granted' },
      },
    ),
  ).toMatchObject({
    kind: 'created_with_work_package',
    steps: [{ id: 'current-dev', estimateUnit: 'minutes', allowancePercent: 25 }],
  });
  expect(tables.catalogue.packageValues.get('w')).toEqual(prior);
  expect(tables.catalogue.packageValues.get('second-package')?.get('current-dev')).toEqual({
    workPackageId: 'second-package',
    stepId: 'current-dev',
    estimateUnit: 'minutes',
    allowanceBps: 2500,
    allowanceRevision: 0,
  });
});
