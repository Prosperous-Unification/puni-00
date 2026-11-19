import { expect, it } from 'bun:test';

import { inMemoryProjects, memoryProjectTables } from './project-fixture';
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
  expect(await store.create(draft(), act(), first())).toMatchObject({
    kind: 'created_with_work_package',
    project: { workPackageCount: 1 },
    workPackage: { id: 'w', projectId: 'p' },
    steps: [{ id: 's' }],
  });
  expect(tables.packages.workPackages.get('w')).toMatchObject({ id: 'w', projectId: 'p' });
  expect(tables.packages.steps.get('w')).toEqual(first().steps);
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
