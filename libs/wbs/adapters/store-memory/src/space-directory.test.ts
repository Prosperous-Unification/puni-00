import {
  assertSpaceDirectoryLabels,
  assertSpaceDirectoryRefusal,
  assertSpaceDirectoryRemoval,
  seedSpaceDirectory,
} from '@wbs/core/testing/space-directory';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

for (const operationKind of ['usage', 'removal'] as const)
  test(
    'actual Memory team ' +
      operationKind +
      ' refuses missing explicit package values before changing spaces',
    async () => {
      const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
      try {
        await seedSpaceDirectory(fixture.source, seed, (_kind, id) => {
          fixture.ownResourceInOrganization(id, seed.organizationId);
          return Promise.resolve();
        });
        expect(
          await fixture.source.stores.stepCatalogue.defineAndBindStep(
            seed.organizationId,
            {
              id: 'directory-required-step',
              code: 'directory',
              name: 'Directory step',
              position: 10,
              defaultAllowancePercent: 0,
              defaultEstimateUnit: 'workdays',
            },
            {
              bindingId: 'directory-required-binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 10,
            },
            seed.stamp,
          ),
        ).toMatchObject({ ok: true });
        await fixture.source.stores.workItems.insert(
          workItemRow({
            id: 'directory-usage',
            workPackageId: seed.workPackageId,
            serviceTeamId: 'directory-team',
          }),
          [],
          seed.stamp,
        );
        expect(fixture.removePackageStepValues(seed.workPackageId)).toBe(1);
        const before = fixture.stepCatalogueEvidence();
        const operation =
          operationKind === 'usage'
            ? () => fixture.source.stores.directory.usageOfTeam('directory-team')
            : () => fixture.source.stores.directory.removeTeam('directory-team', true, seed.stamp);
        const answer = await operation().then(
          () => ({ kind: 'answered' }) as const,
          (cause: unknown) => ({ kind: 'failed', cause }) as const,
        );
        expect(answer.kind).toBe('failed');
        if (answer.kind === 'failed') expect(answer.cause).toBeInstanceOf(Error);
        expect(fixture.stepCatalogueEvidence()).toEqual(before);
      } finally {
        await fixture.source.close();
      }
    },
  );

test('actual Memory team deletion clears primary and secondary work-item labels', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  try {
    const own = (_kind: 'person' | 'team', id: string) => {
      fixture.ownResourceInOrganization(id, seed.organizationId);
      return Promise.resolve();
    };
    await seedSpaceDirectory(fixture.source, seed, own);
    await assertSpaceDirectoryLabels(fixture.source, seed, own);
  } finally {
    await fixture.source.close();
  }
});

for (const kind of ['person', 'team'] as const)
  for (const cascade of [false, true])
    for (const settlement of ['public', 'commit', 'rollback'] as const) {
      test(
        'actual Memory directory deletion updates space memberships ' +
          [kind, cascade, settlement].join(' '),
        async () => {
          const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
          try {
            await seedSpaceDirectory(fixture.source, seed, (_kind, id) => {
              fixture.ownResourceInOrganization(id, seed.organizationId);
              return Promise.resolve();
            });
            await assertSpaceDirectoryRemoval(fixture.source, seed, kind, cascade, settlement);
            if (settlement !== 'rollback') {
              const snapshot = fixture.stepCatalogueEvidence().snapshot as {
                directory: { organizationOf: Map<string, string> };
              };
              expect(snapshot.directory.organizationOf.has('directory-' + kind)).toBe(false);
            }
          } finally {
            await fixture.source.close();
          }
        },
      );
    }

test('actual Memory team refusal preserves its space memberships until cascade consent', async () => {
  const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
  try {
    await seedSpaceDirectory(fixture.source, seed, (_kind, id) => {
      fixture.ownResourceInOrganization(id, seed.organizationId);
      return Promise.resolve();
    });
    await assertSpaceDirectoryRefusal(fixture.source, seed);
  } finally {
    await fixture.source.close();
  }
});
