import type { SavedPlanWrite } from '@wbs/core';
import { Database } from 'bun:sqlite';
import { expect, spyOn, test } from 'bun:test';

import { MemoryState } from '../memory-stores';
import { openMemoryStepCatalogueSourceFixture } from './step-catalogue-fixture';

type CurrentFixture = Awaited<ReturnType<typeof openMemoryStepCatalogueSourceFixture>>;

test('current memory saved aliases follow SQLite binary UTF8 order for Unicode and prefixes', async () => {
  const current = await openMemoryStepCatalogueSourceFixture(),
    { fixture } = current,
    { source } = fixture;
  try {
    await defineIdentitySteps(current);
    const plan = await writeIdentityPlan(current);
    const ids = ['\u{10000}-old', '\uE000-old', 'same-long', 'same', 'z-old', 'A-old'];
    const expected = ['A-old', 'same', 'same-long', 'z-old', '\uE000-old', '\u{10000}-old'];
    const sqlite = new Database(':memory:');
    try {
      expect(
        sqlite
          .query<{ id: string }, [string]>(
            'SELECT value AS id FROM json_each(?) ORDER BY value COLLATE BINARY',
          )
          .all(JSON.stringify(ids)),
      ).toEqual(expected.map((id) => ({ id })));
    } finally {
      sqlite.close();
    }
    const restore = ids.map((oldStepId) =>
      fixture.injectStepAlias({ oldStepId, stepId: 'identity-own', mergedAt: 100 }),
    );
    try {
      const found = await source.history.savedPlans.readOf(plan.id);
      expect(found?.stepIdentity).toEqual({
        kind: 'catalogue',
        aliases: expected.map((oldStepId) => ({ oldStepId, stepId: 'identity-own' })),
      });
    } finally {
      for (const restoreAlias of restore.reverse()) restoreAlias();
    }
  } finally {
    await source.close();
  }
});

async function assertReadFailure(read: () => Promise<unknown>, message: string): Promise<void> {
  const failure = await Promise.resolve()
    .then(read)
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toHaveProperty('message', message);
}

test('current memory identity history is detached by staging and published by replacement', () => {
  const committed = new MemoryState();
  committed.tables.stepCatalogue.identityHistory.set('old-dev', {
    oldStepId: 'old-dev',
    stepId: 'identity-own',
    mergedAt: 100,
  });
  const staged = committed.clone();
  staged.tables.stepCatalogue.identityHistory.set('old-dev', {
    oldStepId: 'old-dev',
    stepId: 'identity-second',
    mergedAt: 101,
  });
  staged.tables.stepCatalogue.identityHistory.set('old-qa', {
    oldStepId: 'old-qa',
    stepId: 'identity-own',
    mergedAt: 102,
  });
  expect([...committed.tables.stepCatalogue.identityHistory.values()]).toEqual([
    { oldStepId: 'old-dev', stepId: 'identity-own', mergedAt: 100 },
  ]);
  committed.replaceWith(staged);
  expect([...committed.tables.stepCatalogue.identityHistory.values()]).toEqual([
    ...staged.tables.stepCatalogue.identityHistory.values(),
  ]);
});

async function defineIdentitySteps({ fixture, seed }: CurrentFixture) {
  for (const [id, organizationId, projectId] of [
    ['identity-own', seed.organizationId, seed.projectId],
    ['identity-second', seed.organizationId, seed.projectId],
    ['identity-foreign', seed.foreignOrganizationId, seed.foreignProjectId],
  ]) {
    expect(
      await fixture.source.stores.stepCatalogue.defineAndBindStep(
        organizationId,
        {
          id,
          code: id,
          name: id,
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        {
          bindingId: id + ':binding',
          scopeKind: 'project',
          scopeId: projectId,
          position: 10,
          workItemTypeId: null,
        },
        seed.stamp,
      ),
    ).toMatchObject({ ok: true });
  }
}

async function writeIdentityPlan({ fixture, seed }: CurrentFixture) {
  const plan: SavedPlanWrite = {
    id: 'identity-plan',
    workPackageId: seed.workPackageId,
    name: 'Identity plan',
    createdBy: 'Catalogue author',
    createdById: seed.stamp.by,
    createdAt: seed.stamp.at,
    input: { schemaVersion: 11, bytes: '{"stepId":"old-dev"}', sha256: 'retained-original-digest' },
    schedule: { present: false, absentReason: 'not-requested' },
  };
  expect(await fixture.source.history.savedPlans.write(plan, () => Promise.resolve(null))).toEqual({
    outcome: 'written',
  });
  return plan;
}

test('current memory saved aliases are scoped, ordered, detached and retained after retirement', async () => {
  const current = await openMemoryStepCatalogueSourceFixture(),
    { fixture, seed } = current,
    { source } = fixture;
  try {
    await defineIdentitySteps(current);
    const plan = await writeIdentityPlan(current),
      before = await source.history.savedPlans.readOf(plan.id);
    const offered = { oldStepId: 'z-old-dev', stepId: 'identity-own', mergedAt: 100 };
    const restore = [
      fixture.injectStepAlias(offered),
      fixture.injectStepAlias({ oldStepId: 'A-old-dev', stepId: 'identity-own', mergedAt: 101 }),
      fixture.injectStepAlias({
        oldStepId: 'foreign-old',
        stepId: 'identity-foreign',
        mergedAt: NaN,
      }),
    ];
    offered.stepId = 'missing-survivor';
    offered.mergedAt = NaN;
    try {
      const expected = {
        kind: 'catalogue' as const,
        aliases: [
          { oldStepId: 'A-old-dev', stepId: 'identity-own' },
          { oldStepId: 'z-old-dev', stepId: 'identity-own' },
        ],
      };
      const found = await source.history.savedPlans.readOf(plan.id);
      expect(found?.stepIdentity).toEqual(expected);
      expect(found?.bodies).toEqual(before?.bodies);
      expect(found?.header).toEqual(before?.header);
      if (found?.stepIdentity.kind !== 'catalogue')
        throw new Error('expected current catalogue evidence');
      const alias = found.stepIdentity.aliases.at(0);
      if (alias === undefined) throw new Error('expected actual alias');
      Object.assign(alias, { stepId: 'caller-mutated' });
      expect((await source.history.savedPlans.readOf(plan.id))?.stepIdentity).toEqual(expected);
      expect(
        await source.stores.stepCatalogue.unbindStep(
          seed.organizationId,
          'identity-own:binding',
          { dryRun: false },
          seed.stamp,
        ),
      ).toMatchObject({ kind: 'unbound' });
      expect(
        await source.stores.stepCatalogue.retireStepDefinition(
          seed.organizationId,
          'identity-own',
          seed.stamp,
        ),
      ).toEqual({ ok: true });
      expect(
        (await source.stores.stepCatalogue.readCatalogue(seed.organizationId))?.definitions.map(
          ({ id }) => id,
        ),
      ).not.toContain('identity-own');
      expect((await source.history.savedPlans.readOf(plan.id))?.stepIdentity).toEqual(expected);
      await source.uow.run(() => Promise.resolve({ commit: true, value: null }));
      expect((await source.history.savedPlans.readOf(plan.id))?.stepIdentity).toEqual(expected);
    } finally {
      for (const restoreAlias of restore.reverse()) restoreAlias();
    }
    expect(await source.history.savedPlans.readOf(plan.id)).toEqual(before);
  } finally {
    await source.close();
  }
});

for (const fault of [
  { oldStepId: 'old-dev', stepId: 'missing-survivor', mergedAt: 100 },
  { oldStepId: 'identity-own', stepId: 'identity-own', mergedAt: 100 },
  { oldStepId: 'identity-own', stepId: 'identity-second', mergedAt: 100 },
  { oldStepId: 'old-dev', stepId: 'identity-own', mergedAt: NaN },
  { oldStepId: 'old-dev', stepId: 'identity-own', mergedAt: 0.5 },
])
  test(
    'current memory saved read refuses actual alias corruption ' + JSON.stringify(fault),
    async () => {
      const current = await openMemoryStepCatalogueSourceFixture(),
        { fixture } = current,
        { source } = fixture;
      try {
        await defineIdentitySteps(current);
        const plan = await writeIdentityPlan(current),
          before = await source.history.savedPlans.readOf(plan.id);
        const restore = fixture.injectStepAlias(fault);
        try {
          await assertReadFailure(
            () => source.history.savedPlans.readOf(plan.id),
            'saved step identity history is inconsistent',
          );
        } finally {
          restore();
        }
        expect(await source.history.savedPlans.readOf(plan.id)).toEqual(before);
      } finally {
        await source.close();
      }
    },
  );

test('current memory saved read refuses an actual alias chain and retries after restoration', async () => {
  const current = await openMemoryStepCatalogueSourceFixture(),
    { fixture } = current,
    { source } = fixture;
  try {
    await defineIdentitySteps(current);
    const plan = await writeIdentityPlan(current),
      before = await source.history.savedPlans.readOf(plan.id);
    const restore = [
      fixture.injectStepAlias({ oldStepId: 'old-dev', stepId: 'identity-own', mergedAt: 100 }),
      fixture.injectStepAlias({
        oldStepId: 'identity-own',
        stepId: 'identity-second',
        mergedAt: 101,
      }),
    ];
    try {
      await assertReadFailure(
        () => source.history.savedPlans.readOf(plan.id),
        'saved step identity history is inconsistent',
      );
    } finally {
      for (const restoreAlias of restore.reverse()) restoreAlias();
    }
    expect(await source.history.savedPlans.readOf(plan.id)).toEqual(before);
  } finally {
    await source.close();
  }
});

test('current memory saved read refuses missing package attribution and retries after restoration', async () => {
  const current = await openMemoryStepCatalogueSourceFixture(),
    { fixture, seed } = current,
    { source } = fixture;
  try {
    const plan = await writeIdentityPlan(current),
      before = await source.history.savedPlans.readOf(plan.id);
    fixture.removeWorkPackageOrganization(seed.workPackageId);
    try {
      await assertReadFailure(
        () => source.history.savedPlans.readOf(plan.id),
        'saved step identity package attribution is inconsistent',
      );
    } finally {
      fixture.ownWorkPackageInOrganization(seed.workPackageId, seed.organizationId);
    }
    expect(await source.history.savedPlans.readOf(plan.id)).toEqual(before);
  } finally {
    await source.close();
  }
});

for (const fault of ['foreign-value', 'foreign-organization'] as const)
  test('current memory saved read refuses captured ' + fault + ' alias corruption', async () => {
    const current = await openMemoryStepCatalogueSourceFixture(),
      { fixture, seed } = current,
      { source } = fixture;
    try {
      await defineIdentitySteps(current);
      const plan = await writeIdentityPlan(current),
        before = await source.history.savedPlans.readOf(plan.id);
      const restoreAlias = fixture.injectStepAlias({
        oldStepId: 'foreign-old',
        stepId: 'identity-foreign',
        mergedAt: 100,
      });
      // The spy calls the captured method with its actual Source-owned receiver.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const clone = MemoryState.prototype.clone;
      const capture = spyOn(MemoryState.prototype, 'clone').mockImplementation(function (
        this: MemoryState,
      ) {
        const epoch = clone.call(this);
        if (fault === 'foreign-organization')
          epoch.tables.directory.measureDefinitions.organizations.delete(
            seed.foreignOrganizationId,
          );
        else {
          const included = epoch.tables.stepCatalogue.packageValues.get(seed.workPackageId),
            foreign = epoch.tables.stepCatalogue.packageValues
              .get(seed.foreignWorkPackageId)
              ?.get('identity-foreign');
          if (included === undefined || foreign === undefined)
            throw new Error('actual identity corruption prerequisite is absent');
          included.set('identity-foreign', { ...foreign, workPackageId: seed.workPackageId });
        }
        return epoch;
      });
      try {
        await assertReadFailure(
          () => source.history.savedPlans.readOf(plan.id),
          'saved step identity history is inconsistent',
        );
      } finally {
        capture.mockRestore();
        restoreAlias();
      }
      expect(await source.history.savedPlans.readOf(plan.id)).toEqual(before);
    } finally {
      await source.close();
    }
  });

test('current memory alias fixture rejects injection after Source closure', async () => {
  const { fixture } = await openMemoryStepCatalogueSourceFixture(),
    { source } = fixture;
  await source.close();
  const before = fixture.stepCatalogueEvidence();
  expect(() =>
    fixture.injectStepAlias({ oldStepId: 'old-dev', stepId: 'identity-own', mergedAt: 100 }),
  ).toThrow('memory source is closed');
  expect(fixture.stepCatalogueEvidence()).toEqual(before);
});

test('current memory alias fixture rejects restoration after Source closure', async () => {
  const { fixture } = await openMemoryStepCatalogueSourceFixture(),
    { source } = fixture;
  const restore = fixture.injectStepAlias({
    oldStepId: 'old-dev',
    stepId: 'identity-own',
    mergedAt: 100,
  });
  await source.close();
  const before = fixture.stepCatalogueEvidence();
  expect(restore).toThrow('memory source is closed');
  expect(fixture.stepCatalogueEvidence()).toEqual(before);
});

for (const selection of ['known', 'missing'] as const)
  test('current memory saved read rejects a closed Source ' + selection, async () => {
    const current = await openMemoryStepCatalogueSourceFixture(),
      { fixture } = current,
      { source } = fixture;
    try {
      const plan = await writeIdentityPlan(current);
      await source.close();
      await assertReadFailure(
        () => source.history.savedPlans.readOf(selection === 'known' ? plan.id : 'missing-plan'),
        'memory source is closed',
      );
    } finally {
      await source.close();
    }
  });

test('current memory saved reads report the catalogue epoch beside unchanged old bodies', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  const source = fixture.source;
  try {
    const input = '{"stepId":"old-dev"}';
    const plan: SavedPlanWrite = {
      id: 'current-history-old-body',
      workPackageId: seed.workPackageId,
      name: 'Old immutable body',
      createdBy: 'Catalogue author',
      createdById: seed.stamp.by,
      createdAt: seed.stamp.at,
      input: {
        schemaVersion: 11,
        bytes: input,
        sha256: Bun.CryptoHasher.hash('sha256', input, 'hex'),
      },
      schedule: { present: false, absentReason: 'not-requested' },
    };
    expect(await source.history.savedPlans.write(plan, () => Promise.resolve(null))).toEqual({
      outcome: 'written',
    });
    const stored = await source.history.savedPlans.readOf(plan.id);
    expect(stored?.bodies).toEqual({ input, schedule: null });
    expect(stored?.header.inputSha256).toBe(plan.input.sha256);
    expect(stored?.header.inputSchemaVersion).toBe(11);
    expect(stored?.stepIdentity).toEqual({ kind: 'catalogue', aliases: [] });
    expect(await source.history.savedPlans.readOf('missing-history-plan')).toBeNull();
    expect(await source.history.savedPlans.readOf(plan.id)).toEqual(stored);
  } finally {
    await source.close();
  }
});
