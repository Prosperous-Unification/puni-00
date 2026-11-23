import {
  STEP_CATALOGUE_SEED,
  type StepCatalogueFixture,
  stepCatalogueFixtureFromSource,
} from '@wbs/conformance';
import {
  CATALOGUE_REVISION_ASSERTIONS,
  runCatalogueRevisionCase,
} from '@wbs/conformance/stores/catalogue-revisions';
import { test } from 'bun:test';

import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

/** Decodes actual complete Source snapshot evidence; it creates no map, project or revision. */
function readProjectRevision(fixture: StepCatalogueFixture, projectId: string): number {
  let captured: unknown = fixture.readEvidence().snapshot;
  for (const field of ['workPackages', 'creation', 'projects']) {
    if (typeof captured !== 'object' || captured === null)
      throw new Error('actual project snapshot path is absent');
    captured = Reflect.get(captured, field);
  }
  if (!(captured instanceof Map)) throw new Error('actual project snapshot map is absent');
  const project: unknown = captured.get(projectId);
  if (typeof project !== 'object' || project === null || Reflect.get(project, 'id') !== projectId)
    throw new Error('required actual project snapshot is absent');
  const revision: unknown = Reflect.get(project, 'revision');
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision))
    throw new Error('actual project revision is malformed');
  return revision;
}

for (const owner of CATALOGUE_REVISION_ASSERTIONS) {
  test(
    'catalogue revisions memory ' + owner.caseId,
    async () => {
      const fixture = await openMemoryStepCatalogueCase(
        owner.caseId,
        stepCatalogueFixtureFromSource,
        STEP_CATALOGUE_SEED.projectId + ':empty',
      );
      await runCatalogueRevisionCase(fixture, owner.assert, (projectId) =>
        readProjectRevision(fixture, projectId),
      );
    },
    30_000,
  );
}
