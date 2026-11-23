import { importServiceSourceContract } from '@wbs/core/testing/import-service-source-contract';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';

import { openMemorySourceFixture } from './source';

importServiceSourceContract(
  async () => {
    const fixture = openMemorySourceFixture();
    const source = fixture.source;
    await source.stores.users.create(
      { id: 'import-owner', username: 'import-owner', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: 'import-owner' },
    );
    seedLegacyPackageParent(fixture, {
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      creator: 'import-owner',
    });
    fixture.seedPackageParent({
      id: 'holding-project',
      organizationId: 'fixture-legacy-org',
      name: 'Holding project',
      createdBy: 'import-owner',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      spaceId: null,
      spacePosition: null,
    });
    return source;
  },
  'fixture-project',
  (source) => source.createPlanExports(fastScheduler),
  'holding-project',
);
