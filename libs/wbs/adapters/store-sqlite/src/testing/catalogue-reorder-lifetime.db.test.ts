import { rejects } from 'node:assert';

import {
  CATALOGUE_REORDER_LIFETIME_ASSERTIONS,
  runCatalogueReorderLifetimeCase,
} from '@wbs/conformance/stores/catalogue-reorder-lifetime';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const owner of CATALOGUE_REORDER_LIFETIME_ASSERTIONS) {
  test(
    'catalogue reorder sqlite ' + owner.caseId,
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      await runCatalogueReorderLifetimeCase(fixture, owner.assert, (projectId) => {
        const rows = fixture.source.db.all<{
            id: unknown;
            revision: unknown;
            updatedAt: unknown;
          }>(sql`SELECT id,revision,updated_at AS "updatedAt" FROM project WHERE id=${projectId}`),
          project = rows.at(0);
        if (
          rows.length !== 1 ||
          project?.id !== projectId ||
          typeof project.revision !== 'number' ||
          !Number.isSafeInteger(project.revision) ||
          (project.updatedAt !== null &&
            (typeof project.updatedAt !== 'number' || !Number.isSafeInteger(project.updatedAt)))
        )
          throw Error('actual SQLite project audit absent or malformed');
        return { revision: project.revision, updatedAt: project.updatedAt };
      });
    },
    30000,
  );
}

test('catalogue reorder sqlite reorder-life:native-zero-update', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  let primary: { cause: unknown } | undefined;
  try {
    const { port, source, seed } = fixture,
      scope = { scopeKind: 'project' as const, scopeId: seed.projectId };
    for (const [index, bindingId] of ['reorder-native-a', 'reorder-native-b'].entries())
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: bindingId + ':step',
              code: bindingId,
              name: bindingId,
              position: (index + 1) * 10,
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 7,
            },
            { bindingId, ...scope, workItemTypeId: null, position: (index + 1) * 10 },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
    expect(
      await port.reorderBindings(
        seed.organizationId,
        scope,
        ['reorder-native-a', 'reorder-native-b'],
        seed.stamp,
      ),
    ).toEqual({ ok: true, workPackageIds: [], projectIds: [] });
    const catalogue = await port.readCatalogue(seed.organizationId),
      values = fixture.readEvidence().packageValues;
    expect(catalogue?.bindings.map(({ bindingId, position }) => ({ bindingId, position }))).toEqual(
      [
        { bindingId: 'reorder-native-a', position: 10 },
        { bindingId: 'reorder-native-b', position: 20 },
      ],
    );
    source.db.run(
      sql.raw(
        "CREATE TRIGGER reorder_native_ignore BEFORE UPDATE OF position ON step_binding WHEN OLD.id='reorder-native-a' BEGIN SELECT RAISE(IGNORE); END",
      ),
    );
    const before = fixture.readEvidence();
    // B updates first; the actual SQLite trigger suppresses A's subsequent UPDATE.
    await rejects(
      port.reorderBindings(
        seed.organizationId,
        scope,
        ['reorder-native-b', 'reorder-native-a'],
        seed.stamp,
      ),
      (cause: unknown) => {
        expect(() => {
          throw cause;
        }).toThrow('catalogue reorder binding disappeared');
        return true;
      },
    );
    expect(fixture.readEvidence()).toEqual(before);
    await source.uow.run(async ({ stores }) => {
      await rejects(
        stores.stepCatalogue.reorderBindings(
          seed.organizationId,
          scope,
          ['reorder-native-b', 'reorder-native-a'],
          seed.stamp,
        ),
        (cause: unknown) => {
          expect(() => {
            throw cause;
          }).toThrow('catalogue reorder binding disappeared');
          return true;
        },
      );
      await stores.workItems.insert(
        workItemRow({ id: 'reorder-native-independent', workPackageId: seed.workPackageId }),
        [],
        seed.stamp,
      );
      return { commit: true, value: undefined };
    });
    expect(await port.readCatalogue(seed.organizationId)).toEqual(catalogue);
    expect(fixture.readEvidence().packageValues).toEqual(values);
    expect(await source.stores.workItems.findById('reorder-native-independent')).not.toBeNull();
    source.db.run(sql.raw('DROP TRIGGER reorder_native_ignore'));
    expect(
      await port.reorderBindings(
        seed.organizationId,
        scope,
        ['reorder-native-b', 'reorder-native-a'],
        seed.stamp,
      ),
    ).toEqual({ ok: true, workPackageIds: [seed.workPackageId], projectIds: [seed.projectId] });
    expect(
      (await port.readCatalogue(seed.organizationId))?.bindings.map(({ bindingId, position }) => ({
        bindingId,
        position,
      })),
    ).toEqual([
      { bindingId: 'reorder-native-a', position: 20 },
      { bindingId: 'reorder-native-b', position: 10 },
    ]);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'native reorder fault owner and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}, 30000);
