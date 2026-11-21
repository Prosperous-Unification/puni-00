import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { LEGACY_ACCESS } from '../ports/organization-access';
import type {
  CapturedWorkPackageAddresses,
  WorkPackageAddressSearchStore,
} from '../ports/work-package-address-search';
import { WorkPackageAddressSearch } from './work-package-address-search';

const leafId = '00000000-0000-4000-8000-000000000001';
const stepId = '00000000-0000-4000-8000-000000000002';
const captured: CapturedWorkPackageAddresses = {
  workPackage: { workPackageId: 'package', abbreviation: 'PKG', name: 'Package' },
  placements: [
    {
      id: leafId,
      parentId: null,
      position: 10,
      frozenNumber: null,
      name: 'Leaf',
      steps: [
        {
          stepId,
          code: 'dev',
          name: 'Develop',
          via: [
            {
              bindingId: 'binding',
              scopeKind: 'organization',
              scopeId: 'org',
              workItemTypeId: null,
            },
          ],
        },
      ],
    },
  ],
  steps: [{ id: stepId, code: 'dev', name: 'Develop', position: 10 }],
};

// Purpose orchestration fixtures supply detached facts only; these do not prove Source admission.
function searchWith(facts: CapturedWorkPackageAddresses) {
  const store: WorkPackageAddressSearchStore = {
    withSnapshot: async (_principal, read) => ({
      ok: true,
      value: await read({
        access: LEGACY_ACCESS,
        capture: () => facts,
        searchWorkPackages: () => [],
      }),
    }),
  };
  return new WorkPackageAddressSearch(store, {
    sha256: (bytes) => Promise.resolve(createHash('sha256').update(bytes).digest('hex')),
  });
}

test('qualified purpose refuses absent leaf metadata', async () => {
  const placements = captured.placements.map(({ steps: _steps, ...placement }) => placement);
  await searchWith({ ...captured, placements })
    .discoverCandidates({ id: 'actor' }, 'package', {
      search: '',
      cursor: null,
      limit: 10,
    })
    .then(
      () => {
        throw new Error('Qualified purpose admitted absent leaf metadata');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('leaf step metadata is absent'));
      },
    );
});

test('qualified purpose diagnoses an inconsistent captured catalogue', async () => {
  await searchWith({ ...captured, steps: [] })
    .discoverCandidates({ id: 'actor' }, 'package', {
      search: '',
      cursor: null,
      limit: 10,
    })
    .then(
      () => {
        throw new Error('Qualified purpose admitted an inconsistent captured catalogue');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('address leaf step is outside the catalogue'));
      },
    );
});
