import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const operation of ['map', 'remove'] as const) {
  test(
    'catalogue type revisions sqlite caught-' + operation + '-failure',
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        undefined,
        'manifest-type-empty',
      );
      let primary: { cause: unknown } | undefined;
      try {
        const { source, port, seed } = fixture,
          typeId = 'type-atomic-extra';
        expect(
          await source.stores.directory.addWorkItemType(
            { id: typeId, name: 'Atomic root' },
            seed.stamp,
          ),
        ).toEqual({ id: typeId, name: 'Atomic root' });
        if (operation === 'remove')
          await source.stores.directory.mapInOrganization(
            'workItemTypes',
            typeId,
            seed.organizationId,
            'Atomic extra',
            seed.stamp,
          );
        const manifest = await port.readManifest(seed.organizationId, seed.projectId);
        expect(manifest?.project.id).toBe(seed.projectId);
        source.db.run(
          sql.raw(
            "CREATE TRIGGER catalogue_type_second_touch BEFORE UPDATE ON project WHEN OLD.id='" +
              seed.siblingProjectId.replaceAll("'", "''") +
              "' AND NEW.revision=OLD.revision+1 BEGIN SELECT RAISE(IGNORE); END",
          ),
        );
        const before = fixture.readEvidence();
        await source.uow.run(async ({ stores }) => {
          let failure: unknown;
          try {
            if (operation === 'map')
              await stores.directory.mapInOrganization(
                'workItemTypes',
                typeId,
                seed.organizationId,
                'Atomic extra',
                seed.stamp,
              );
            else await stores.directory.removeWorkItemType(typeId, false, seed.stamp);
          } catch (cause: unknown) {
            failure = cause;
          }
          expect(failure).toBeInstanceOf(Error);
          if (!(failure instanceof Error))
            throw Error('native second project update unexpectedly succeeded');
          expect(failure.message).toContain('project revision did not advance');
          expect(
            await stores.directory.addTag(
              { id: 'type-atomic-tag', name: 'Unrelated committed' },
              seed.stamp,
            ),
          ).toEqual({ id: 'type-atomic-tag', name: 'Unrelated committed' });
          return { commit: true, value: undefined };
        });
        expect(await port.readManifest(seed.organizationId, seed.projectId)).toEqual(manifest);
        expect(
          (await source.stores.directory.listTags()).some((tag) => tag.id === 'type-atomic-tag'),
        ).toBe(true);
        expect(
          (await source.stores.directory.removeTag('type-atomic-tag', false, seed.stamp)).ok,
        ).toBe(true);
        expect(fixture.readEvidence()).toEqual(before);
        source.db.run(sql`DROP TRIGGER catalogue_type_second_touch`);
        if (operation === 'map')
          await source.stores.directory.mapInOrganization(
            'workItemTypes',
            typeId,
            seed.organizationId,
            'Atomic extra',
            seed.stamp,
          );
        else
          expect(
            (await source.stores.directory.removeWorkItemType(typeId, false, seed.stamp)).ok,
          ).toBe(true);
        const changed = await port.readManifest(seed.organizationId, seed.projectId);
        if (changed === null || manifest === null)
          throw Error('actual healthy manifest control absent');
        expect(changed.project.revision).toBe(manifest.project.revision + 1);
        expect(changed.types.some((type) => type.workItemTypeId === typeId)).toBe(
          operation === 'map',
        );
      } catch (cause: unknown) {
        primary = { cause };
      }
      try {
        await fixture.close();
      } catch (cleanup: unknown) {
        if (primary !== undefined)
          throw new AggregateError(
            [primary.cause, cleanup],
            'type atomicity owner and close failed',
            { cause: cleanup },
          );
        throw cleanup;
      }
      if (primary !== undefined) throw primary.cause;
    },
    30000,
  );
}
