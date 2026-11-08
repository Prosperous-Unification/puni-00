import type { DependencyRuntimeCapability } from '@wbs/contracts';
import { inspectDependencyActivation, inspectDependencyBootstrap } from '@wbs/store-sqlite';
import type { Drizzle } from '@wbs/store-sqlite/db';

export { BACKEND_DEPENDENCY_CAPABILITY } from './dependency-support';

/**
 * Refuses unreadable or inconsistent authority before service creation. Enabled
 * authority remains binding with zero current edges because history survives deletion.
 * This inspection never activates authoring and never writes to storage.
 */
export function assertDependencyRuntime(
  db: Drizzle,
  capability: DependencyRuntimeCapability,
): void {
  const activation = inspectDependencyActivation(db);
  const edges = db.all('SELECT id FROM external_dependency LIMIT 1');
  // Proof: removing the DISABLED/retained-edge predicate let the real boot
  // persist local-dev in the retaining-edge refusal test (2026-10-22).
  if (activation.state === 'DISABLED' && edges.length !== 0)
    throw new Error('disabled dependency authority retains external relationships');
  // Proof: removing the ENABLED/semantic-support predicate let enabled-empty
  // boot persist local-dev in cross-project-dependency.boot.db.test.ts (2026-10-22).
  // Proof: removing this predicate also admitted the isolated empty-binary fixture before its pending migration (2026-10-23).
  if (
    activation.state === 'ENABLED' &&
    !capability.semantics.includes('cross-project-dependencies-v1')
  )
    throw new Error('backend lacks cross-project dependency semantics');
}

/** Admits existing semantic authority before migrations; only certified bootstrap can defer it. */
export function assertDependencyMigrationRuntime(
  db: Drizzle,
  capability: DependencyRuntimeCapability,
  migrationsFolder: string,
): void {
  if (inspectDependencyBootstrap(db, migrationsFolder) === 'authority')
    assertDependencyRuntime(db, capability);
}
