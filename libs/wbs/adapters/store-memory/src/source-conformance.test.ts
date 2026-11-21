import { stepCatalogueFixtureFromSource, unitOfWorkConformance } from '@wbs/conformance';
import { afterEach, beforeEach, describe } from 'bun:test';

import { openMemoryStepCatalogueCase } from './testing/step-catalogue-fixture';

// Proof: after a confirmed `store-memory:test` local-cache hit, a throw in the
// imported conformance source forced Nx to rerun and fail on
// `injected conformance dependency cache fault`.

let current: Awaited<ReturnType<typeof openCurrentSource>> | undefined;

async function openCurrentSource() {
  return await openMemoryStepCatalogueCase('unit-of-work', stepCatalogueFixtureFromSource);
}

beforeEach(async () => {
  current = await openCurrentSource();
});

afterEach(async () => {
  if (current === undefined) return;
  await current.close();
  current = undefined;
});

describe('the in-memory unit of work', () => {
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
