import { unitOfWorkConformance } from '@wbs/conformance';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { beforeEach, describe } from 'bun:test';

import type { openMemorySource } from './source';
import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

// Proof: after a confirmed `store-memory:test` local-cache hit, a throw in the
// imported conformance source forced Nx to rerun and fail on
// `injected conformance dependency cache fault`.

let latestSource: ReturnType<typeof openMemorySource> | null = null;
let latestFixture: {
  readonly workPackageId: string;
  readonly stamp: { readonly at: number; readonly by: string };
} | null = null;

beforeEach(async () => {
  const fixture = openMemorySourceFixture();
  const source = fixture.source;
  const { stores } = source;
  const ownerId = crypto.randomUUID();
  const stamp = { at: 1, by: ownerId };
  const workPackageId = 'p1';
  const stepId = 'st-1';
  await stores.users.create(
    { id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 },
    stamp,
  );
  seedLegacyPackageParent(fixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: ownerId,
  });
  await stores.workPackages.create(
    workPackageRow({ id: workPackageId, name: 'Rewire the shed', projectId: 'fixture-project' }),
    [
      {
        id: stepId,
        workPackageId,
        name: 'Dev',
        position: 10,
        code: 'dev',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    stamp,
  );
  await stores.steps.add(
    {
      id: stepId,
      workPackageId,
      name: 'Dev',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
    stamp,
  );
  latestFixture = { workPackageId, stamp };
  latestSource = source;
});

describe('the in-memory unit of work', () => {
  unitOfWorkConformance(() => {
    const source = latestSource;
    const fixture = latestFixture;
    if (source === null || fixture === null) {
      throw new Error('the source was read before it opened');
    }
    return {
      uow: source.uow,
      reader: source.stores,
      workPackageId: fixture.workPackageId,
      stamp: fixture.stamp,
    };
  });
});
