import { type StepCatalogueFixture, stepCatalogueFixtureFromSource } from '@wbs/conformance';
import {
  CATALOGUE_REORDER_LIFETIME_ASSERTIONS,
  runCatalogueReorderLifetimeCase,
} from '@wbs/conformance/stores/catalogue-reorder-lifetime';
import { test } from 'bun:test';

import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

function readAudit(fixture: StepCatalogueFixture, projectId: string) {
  let captured: unknown = fixture.readEvidence().snapshot;
  for (const field of ['workPackages', 'creation', 'projects']) {
    if (typeof captured !== 'object' || captured === null)
      throw Error('actual project audit snapshot path absent');
    captured = Reflect.get(captured, field);
  }
  if (!(captured instanceof Map)) throw Error('actual project audit map absent');
  const project: unknown = captured.get(projectId);
  if (typeof project !== 'object' || project === null || Reflect.get(project, 'id') !== projectId)
    throw Error('actual project audit identity absent');
  const revision: unknown = Reflect.get(project, 'revision'),
    updatedAt: unknown = Reflect.get(project, 'updatedAt');
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    (updatedAt !== null && (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt)))
  )
    throw Error('actual project audit fields malformed');
  return { revision, updatedAt };
}

for (const owner of CATALOGUE_REORDER_LIFETIME_ASSERTIONS) {
  test(
    'catalogue reorder memory ' + owner.caseId,
    async () => {
      const fixture = await openMemoryStepCatalogueCase(
        owner.caseId,
        stepCatalogueFixtureFromSource,
      );
      await runCatalogueReorderLifetimeCase(fixture, owner.assert, (projectId) =>
        readAudit(fixture, projectId),
      );
    },
    30000,
  );
}
