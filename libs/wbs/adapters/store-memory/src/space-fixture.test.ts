import { spaceStoreConformance } from '@wbs/conformance';
import { describe } from 'bun:test';

import { inMemorySpaces } from './space-fixture';

describe('inMemorySpaces', () => {
  spaceStoreConformance(() => ({
    store: inMemorySpaces(
      new Map([
        ['a1', 'org-a'],
        ['a2', 'org-a'],
        ['a3', 'org-a'],
        ['a4', 'org-a'],
        ['b1', 'org-b'],
      ]),
      'org-a',
    ),
    organizations: { a: 'org-a', b: 'org-b' },
    projects: { a: ['a1', 'a2', 'a3', 'a4'], b: 'b1' },
    stamp: { at: 1, by: 'ada' },
    legacy: 'org-a',
  }));
});
