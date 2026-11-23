import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { expect, test } from 'bun:test';

import { openMemorySourceFixture } from './source';

const stamp = { at: 100, by: 'directory-owner' };

for (const mode of ['public', 'borrowed'] as const) {
  test(`memory ${mode} directory ownership survives commit and rolls back with its root`, async () => {
    const fixture = openMemorySourceFixture(),
      source = fixture.source;
    try {
      await source.stores.users.create(
        { id: stamp.by, username: stamp.by, passwordHash: null, createdAt: stamp.at },
        stamp,
      );
      seedLegacyPackageParent(fixture, {
        organizationId: 'directory-legacy-org',
        projectId: 'directory-project',
        creator: stamp.by,
      });
      const type = { id: 'directory-type', name: 'Committed type' };
      if (mode === 'public') await source.stores.directory.addWorkItemType(type, stamp);
      else
        await source.uow.run(async ({ stores }) => {
          await stores.directory.addWorkItemType(type, stamp);
          expect(
            await stores.directory.listInOrganization('workItemTypes', 'directory-legacy-org'),
          ).toEqual([type]);
          return { commit: true, value: undefined };
        });
      expect(
        await source.stores.directory.listInOrganization('workItemTypes', 'directory-legacy-org'),
      ).toEqual([type]);
      const second = { id: 'directory-second-type', name: 'Second committed type' };
      await source.uow.run(async ({ stores }) => {
        await stores.directory.addWorkItemType(second, stamp);
        return { commit: true, value: undefined };
      });
      expect(
        await source.stores.directory.listInOrganization('workItemTypes', 'directory-legacy-org'),
      ).toEqual([type, second]);
      await source.uow.run(async ({ stores }) => {
        await stores.directory.addWorkItemType(
          { id: 'rolled-back-type', name: 'Rolled back type' },
          stamp,
        );
        return { commit: false, value: undefined };
      });
      expect(await source.stores.directory.listWorkItemTypes()).toEqual([type, second]);
      expect(
        await source.stores.directory.listInOrganization('workItemTypes', 'directory-legacy-org'),
      ).toEqual([type, second]);
    } finally {
      await source.close();
    }
  });
}
