import { SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';
import { expect, test } from 'bun:test';

import { openMemorySourceFixture, openMemorySourceWithCaptureReadSeam } from './source';
import { workPackageRow } from './work-package-fixture';
/** Awaits the actual operation, then checks its caught rejection synchronously. */
async function expectRejection(operation: Promise<unknown>, diagnostic: string): Promise<void> {
  let rejected = false;
  try {
    await operation;
  } catch (reason: unknown) {
    rejected = true;
    expect(() => {
      throw reason;
    }).toThrow(diagnostic);
  }
  expect(rejected).toBe(true);
}
async function seed(fixture: ReturnType<typeof openMemorySourceFixture>) {
  fixture.addOrganization('org', { legacy: false });
  fixture.addOrganization('foreign', { legacy: false });
  await fixture.source.stores.users.create(
    { id: 'creator', username: 'Creator', passwordHash: null, createdAt: 1 },
    { by: 'creator', at: 1 },
  );
  fixture.setPackageCreationMembers('org', ['creator']);
  fixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: 'parent',
    organizationId: 'org',
    name: 'Parent',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator',
  });
  const created = await fixture.source.stores.workPackages.createInOrganization(
    workPackageRow({ id: 'package', projectId: 'parent' }),
    [
      {
        id: 'dev',
        workPackageId: 'package',
        name: 'Dev',
        code: 'DEV',
        position: 10,
        allowancePercent: 0,
        estimateUnit: 'workdays',
      },
    ],
    { by: 'creator', at: 1 },
    'org',
    { id: 'grant', auditId: 'audit' },
  );
  if (typeof created === 'string') throw Error('fixture birth refused ' + created);
  return fixture;
}
test('refuses an existing package with a missing organization mapping during actual generic capture', async () => {
  const fixture = await seed(openMemorySourceFixture());
  fixture.removeWorkPackageOrganization('package');
  await expectRejection(
    fixture.source.history.savedPlanCapture.readPlanInput('package'),
    'organization',
  );
});
test('captures complete real organization definitions and parent in nonlegacy preactivation while absent package stays null', async () => {
  const fixture = await seed(openMemorySourceFixture()),
    captured = await fixture.source.history.savedPlanCapture.readPlanInput('package');
  expect(captured).not.toBeNull();
  if (captured === null) throw Error('missing capture');
  expect(captured.workPackage.projectId).toBe('parent');
  expect(captured.workPackage).not.toHaveProperty('ownerId');
  const definitions: unknown = captured.measureDefinitions?.map(({ id, ...fields }) => fields);
  expect(definitions).toEqual(SEEDED_MEASURE_DEFINITIONS);
  expect(await fixture.source.history.savedPlanCapture.readPlanInput('missing')).toBeNull();
});
test('refuses a missing or foreign trusted memory parent rather than fabricating historical capture', async () => {
  const missing = await seed(openMemorySourceFixture());
  missing.removePackageCaptureParent('parent');
  await expectRejection(missing.source.history.savedPlanCapture.readPlanInput('package'), 'parent');
  const foreign = await seed(openMemorySourceFixture());
  foreign.replacePackageCaptureParent({
    spaceId: null,
    spacePosition: null,
    id: 'parent',
    organizationId: 'foreign',
    name: 'Foreign',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator',
  });
  await expectRejection(foreign.source.history.savedPlanCapture.readPlanInput('package'), 'parent');
});
test('validates maps and parent from the original detached epoch while live state changes after the first read', async () => {
  let change: () => void = () => {
    throw Error('mutation not initialized');
  };
  const fixture = await seed(
    openMemorySourceWithCaptureReadSeam({
      afterFirstRead: () => {
        change();
        return Promise.resolve();
      },
    }),
  );
  let changed = false;
  change = () => {
    if (changed) return;
    changed = true;
    fixture.removeWorkPackageOrganization('package');
    fixture.removePackageCaptureParent('parent');
  };
  const captured = await fixture.source.history.savedPlanCapture.readPlanInput('package');
  expect(captured).toHaveProperty('workPackage.projectId', 'parent');
  const definitions: unknown = captured?.measureDefinitions?.map(({ id, ...fields }) => fields);
  expect(definitions).toEqual(SEEDED_MEASURE_DEFINITIONS);
  await expectRejection(
    fixture.source.history.savedPlanCapture.readPlanInput('package'),
    'organization',
  );
});
test('fixture parent corruption operations refuse absent identities', async () => {
  const fixture = await seed(openMemorySourceFixture());
  expect(() => {
    fixture.removePackageCaptureParent('missing');
  }).toThrow('absent');
  expect(() => {
    fixture.replacePackageCaptureParent({
      spaceId: null,
      spacePosition: null,
      id: 'missing',
      organizationId: 'org',
      name: 'Missing',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      createdBy: 'creator',
    });
  }).toThrow('absent');
});

test('refuses an empty legacy organization before package birth without publishing partial state', async () => {
  const fixture = openMemorySourceFixture();
  try {
    fixture.addOrganization('', { legacy: true });
    await fixture.source.stores.users.create(
      { id: 'creator', username: 'Creator', passwordHash: null, createdAt: 1 },
      { by: 'creator', at: 1 },
    );
    fixture.seedPackageParent({
      spaceId: null,
      spacePosition: null,
      id: 'empty-org-parent',
      organizationId: '',
      name: 'Parent',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      createdBy: 'creator',
    });
    const before = fixture.stepCatalogueEvidence();
    await expectRejection(
      fixture.source.stores.workPackages.createWithSteps(
        workPackageRow({ id: 'empty-org-package', projectId: 'empty-org-parent' }),
        { by: 'creator', at: 1 },
        { kind: 'legacy' },
      ),
      'organization',
    );
    expect(fixture.stepCatalogueEvidence()).toEqual(before);
    expect(
      await fixture.source.history.savedPlanCapture.readPlanInput('empty-org-package'),
    ).toBeNull();
  } finally {
    await fixture.source.close();
  }
});

test('refuses a corrupt empty organization mapping on an existing package during generic capture', async () => {
  const fixture = await seed(openMemorySourceFixture());
  try {
    fixture.addOrganization('', { legacy: true });
    fixture.ownWorkPackageInOrganization('package', '');
    await expectRejection(
      fixture.source.history.savedPlanCapture.readPlanInput('package'),
      'organization',
    );
  } finally {
    await fixture.source.close();
  }
});
