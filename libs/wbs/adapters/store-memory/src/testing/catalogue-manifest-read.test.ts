import { rejects } from 'node:assert/strict';

import { stepCatalogueFixtureFromSource } from '@wbs/conformance';
import {
  CATALOGUE_MANIFEST_READ_CASES,
  runCatalogueManifestReadCase,
} from '@wbs/conformance/stores/catalogue-manifest-read';
import { expect, test } from 'bun:test';

import { bindStores, MemoryState } from '../memory-stores';
import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

const openFixture = () =>
  openMemoryStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    stepCatalogueFixtureFromSource,
    'manifest-read-empty',
  );
for (const selected of CATALOGUE_MANIFEST_READ_CASES) {
  test(
    'catalogue manifest memory ' + selected,
    async () => {
      await runCatalogueManifestReadCase(await openFixture(), selected);
    },
    30000,
  );
}
type Fixture = Awaited<ReturnType<typeof openFixture>>;
async function withinFixture(use: (fixture: Fixture) => Promise<void>) {
  const fixture = await openFixture();
  let primary: { cause: unknown } | undefined;
  try {
    await use(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError([primary.cause, cleanup], 'manifest fault owner and close failed', {
        cause: cleanup,
      });
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

/** Rebinds only complete detached evidence captured from the genuine Source; no test tables are installed back into it. */
function ownState(fixture: Fixture) {
  const snapshot = fixture.readEvidence().snapshot;
  if (typeof snapshot !== 'object' || snapshot === null)
    throw Error('actual Memory Source tables absent');
  const state = new MemoryState();
  expect(Reflect.ownKeys(snapshot)).toEqual(Reflect.ownKeys(state.tables));
  Object.assign(state.tables, structuredClone(snapshot));
  const observed: unknown = state.tables;
  expect(observed).toEqual(snapshot);
  return state;
}
for (const [label, revision] of [
  ['text', 'bad'],
  ['fractional', 1.5],
  ['unsafe', 9007199254740992],
  ['negative', -1],
] as const) {
  test(
    'catalogue manifest memory stored-revision-' + label,
    async () =>
      withinFixture(async (fixture) => {
        expect(
          (await fixture.port.readManifest(fixture.seed.organizationId, fixture.seed.projectId))
            ?.project.id,
        ).toBe(fixture.seed.projectId);
        const before = fixture.readEvidence(),
          state = ownState(fixture),
          project = state.tables.workPackages.creation.projects.get(fixture.seed.projectId);
        if (project === undefined) throw Error('actual owned project specimen absent');
        Reflect.set(project, 'revision', revision);
        await rejects(
          bindStores(state).stepCatalogue.readManifest(
            fixture.seed.organizationId,
            fixture.seed.projectId,
          ),
          /manifest project revision/,
        );
        expect(fixture.readEvidence()).toEqual(before);
      }),
    30000,
  );
}
test(
  'catalogue manifest memory owned-type-coherence',
  async () =>
    withinFixture(async (fixture) => {
      const before = fixture.readEvidence(),
        state = ownState(fixture),
        type = state.tables.directory.workItemTypes.get(fixture.seed.typeId);
      if (type === undefined) throw Error('actual owned type specimen absent');
      Reflect.set(type, 'id', 'wrong-root-identity');
      await rejects(
        bindStores(state).stepCatalogue.readManifest(
          fixture.seed.organizationId,
          fixture.seed.projectId,
        ),
        /owned type identity/,
      );
      expect(fixture.readEvidence()).toEqual(before);
    }),
  30000,
);
