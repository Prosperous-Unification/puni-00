import { unitOfWorkConformance } from '@wbs/conformance';
import { afterEach, beforeEach, describe } from 'bun:test';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

let current: Awaited<ReturnType<typeof openSqliteStepCatalogueCase>> | undefined;

beforeEach(async () => {
  current = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
});

afterEach(async () => {
  if (current === undefined) return;
  await current.close();
  current = undefined;
});

describe('the SQLite unit of work', () => {
  unitOfWorkConformance(() => {
    if (current === undefined) throw new Error('unit-of-work Source has not opened');
    return {
      uow: current.source.uow,
      reader: current.source.stores,
      workPackageId: current.seed.workPackageId,
      stamp: current.seed.stamp,
      readEvidence: current.readEvidence.bind(current),
    };
  });
});
