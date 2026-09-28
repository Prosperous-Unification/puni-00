import type { ProjectStore } from '@wbs/core';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import { buildStores } from '@wbs/store-sqlite/build-stores';
import { OPEN } from '@wbs/store-sqlite/gate';

/** Builds a real guard over the test's project store and SQLite connection. */
export function sqliteDependencyGraph(
  db: Parameters<typeof buildStores>[0],
  projects: ProjectStore,
): DependencyGraphGuard {
  return new DependencyGraphGuard({ ...buildStores(db, OPEN), projects });
}
