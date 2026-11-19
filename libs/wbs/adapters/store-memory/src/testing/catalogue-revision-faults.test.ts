import { stepCatalogueFixtureFromSource } from '@wbs/conformance';
import { expect, test } from 'bun:test';
import { bindStores, MemoryState } from '../memory-stores';
import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

for (const target of ['package', 'project'] as const) {
  test(
    'catalogue revision fault memory negative-' + target,
    async () => {
      const fixture = await openMemoryStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        stepCatalogueFixtureFromSource,
      );
      let primary: { cause: unknown } | undefined;
      try {
        const { seed } = fixture;
        const snapshot = fixture.readEvidence().snapshot;
        if (typeof snapshot !== 'object' || snapshot === null)
          throw Error('actual Memory Source tables absent');
        const state = new MemoryState();
        expect(Reflect.ownKeys(snapshot)).toEqual(Reflect.ownKeys(state.tables));
        Object.assign(state.tables, structuredClone(snapshot));
        expect<unknown>(state.tables).toEqual(snapshot);
        const stores = bindStores(state);
        const define = (id: string) =>
          stores.stepCatalogue.defineAndBindStep(
            seed.organizationId,
            {
              id,
              code: id,
              name: id,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 0,
              position: 10,
            },
            {
              bindingId: id + ':binding',
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              workItemTypeId: null,
              position: 10,
            },
            seed.stamp,
          );
        expect(await define('revision-negative-healthy')).toMatchObject({ ok: true });
        const row =
          target === 'package'
            ? state.tables.workPackages.workPackages.get(seed.siblingWorkPackageId)
            : state.tables.workPackages.creation.projects.get(seed.siblingProjectId);
        if (row === undefined || !Number.isSafeInteger(row.revision) || row.revision < 0)
          throw Error('healthy actual revision specimen absent');
        const original = row.revision;
        Reflect.set(row, 'revision', -1);
        const before = structuredClone(state.tables);
        await expect(define('revision-negative-retry')).rejects.toThrow(
          'catalogue affected ' + target + ' revision is absent or malformed',
        );
        expect(state.tables).toEqual(before);
        Reflect.set(row, 'revision', original);
        expect(await define('revision-negative-retry')).toMatchObject({ ok: true });
        expect(fixture.readEvidence().snapshot).toEqual(snapshot);
      } catch (cause: unknown) {
        primary = { cause };
      }
      try {
        await fixture.close();
      } catch (cleanup: unknown) {
        if (primary !== undefined)
          throw new AggregateError(
            [primary.cause, cleanup],
            'negative revision observation and close failed',
            { cause: cleanup },
          );
        throw cleanup;
      }
      if (primary !== undefined) throw primary.cause;
    },
    30000,
  );
}
