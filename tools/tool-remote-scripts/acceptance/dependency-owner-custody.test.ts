import { test } from 'bun:test';

import {
  dependencyOwnerCustodyCases,
  prepareDependencyOwnerCustody,
} from '../src/fixtures/dependency-owner-custody';

const dependencyCustodyObservations = await prepareDependencyOwnerCustody();

for (const row of dependencyOwnerCustodyCases)
  test(
    row.title,
    () => {
      const observed = dependencyCustodyObservations.get(row.variant);
      if (observed === undefined) throw new Error('UC2 known original helper observation absent');
      if (!observed.pass) throw new Error(observed.oracle);
    },
    10000,
  );
