import { describe, expect, it } from 'bun:test';

import { SOURCE_CONFORMANCE_CASES } from '../certification';
import { existingStoreRegistrations } from '../source-conformance';

describe('the migrated existing store kits', () => {
  it('preserves the original offered-case IDs', () => {
    const unopened = () => Promise.reject(new Error('ID inventory must not open a fixture'));
    const registrations = existingStoreRegistrations({
      steps: unopened,
      estimates: unopened,
      directory: unopened,
      eventLog: unopened,
    });

    expect(registrations.map(({ caseId }) => caseId)).toEqual([...SOURCE_CONFORMANCE_CASES]);
  });
});
