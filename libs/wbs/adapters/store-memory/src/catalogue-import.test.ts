import {
  assertCatalogueImport,
  CATALOGUE_IMPORT_CASES,
  IMPORT_CATALOGUE_ORGANIZATION,
  IMPORT_CATALOGUE_PROJECT,
  IMPORT_CATALOGUE_SIBLING,
  IMPORT_CATALOGUE_STAMP,
} from '@wbs/core/testing/catalogue-import';
import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { test } from 'bun:test';

import { openMemorySourceFixture } from './source';

for (const purpose of CATALOGUE_IMPORT_CASES)
  test('actual Memory catalogue import ' + purpose, async () => {
    const fixture = openMemorySourceFixture(),
      source = fixture.source;
    await withinClaimFixture(
      () => source.close(),
      async () => {
        const stamp = IMPORT_CATALOGUE_STAMP;
        await source.stores.users.create(
          { id: stamp.by, username: stamp.by, passwordHash: null, createdAt: stamp.at },
          stamp,
        );
        seedLegacyPackageParent(fixture, {
          organizationId: IMPORT_CATALOGUE_ORGANIZATION,
          projectId: IMPORT_CATALOGUE_PROJECT,
          creator: stamp.by,
        });
        fixture.seedPackageParent({
          id: IMPORT_CATALOGUE_SIBLING,
          organizationId: IMPORT_CATALOGUE_ORGANIZATION,
          name: IMPORT_CATALOGUE_SIBLING,
          spaceId: null,
          spacePosition: null,
          revision: 0,
          createdAt: stamp.at,
          createdBy: stamp.by,
          updatedAt: null,
        });
        const restoreDefinitions: (() => void)[] = [];
        try {
          await assertCatalogueImport(
            source,
            () => fixture.stepCatalogueEvidence(),
            purpose,
            async (id, name) => {
              await source.stores.directory.addWorkItemType({ id, name }, stamp);
            },
            () => {
              // Raw retained-code boundary control, not a historical producer or migration certificate.
              restoreDefinitions.push(
                fixture.injectStepDefinition('global-impl', {
                  id: 'global-impl',
                  organizationId: IMPORT_CATALOGUE_ORGANIZATION,
                  code: 's1-impl',
                  name: 'Existing impl',
                  defaultEstimateUnit: 'minutes',
                  defaultAllowanceBps: 700,
                  position: 10,
                  definedAtScopeKind: 'project',
                  definedAtScopeId: IMPORT_CATALOGUE_PROJECT,
                  origin: 'authored',
                  createdAt: stamp.at,
                  createdBy: stamp.by,
                  updatedAt: null,
                }),
              );
            },
          );
        } finally {
          for (const restore of restoreDefinitions.reverse()) restore();
        }
      },
    );
  });
