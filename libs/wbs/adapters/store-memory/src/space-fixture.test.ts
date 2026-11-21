import { spaceStoreConformance } from '@wbs/conformance';
import { describe } from 'bun:test';

import { inMemorySpaces, memorySpaceTables } from './space-fixture';

describe('inMemorySpaces', () => {
  spaceStoreConformance(() => ({
    store: inMemorySpaces(
      memorySpaceTables(
        new Map(
          [
            ['a1', 'org-a'],
            ['a2', 'org-a'],
            ['a3', 'org-a'],
            ['a4', 'org-a'],
            ['b1', 'org-b'],
          ].map(([id, organizationId]) => [
            id,
            { organizationId, spaceId: null, spacePosition: null, revision: 0 },
          ]),
        ),
        new Map([
          ['org-a', { legacy: true }],
          ['org-b', { legacy: false }],
        ]),
      ),
    ),
    organizations: { a: 'org-a', b: 'org-b' },
    projects: { a: ['a1', 'a2', 'a3', 'a4'], b: 'b1' },
    stamp: { at: 1, by: 'ada' },
    legacy: 'org-a',
  }));
});
