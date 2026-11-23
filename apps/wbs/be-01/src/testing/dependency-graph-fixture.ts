import type { WorkPackageStore } from '@wbs/core';
import { createLocalDependencyContext, type ServiceDependencyContext } from '@wbs/core';
import { buildStores } from '@wbs/store-sqlite/build-stores';
import { OPEN } from '@wbs/store-sqlite/gate';

/** Builds explicit local-only evidence over the test's work package store and SQLite connection. */
export function sqliteDependencyContext(
  db: Parameters<typeof buildStores>[0],
  workPackages: WorkPackageStore,
): ServiceDependencyContext {
  return createLocalDependencyContext({ ...buildStores(db, OPEN), workPackages });
}
