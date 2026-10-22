import type { DependencyRuntimeCapability } from '@wbs/contracts';
import { inspectDependencyActivation } from '@wbs/store-sqlite';
import type { Drizzle } from '@wbs/store-sqlite/db';

/** Complete connected semantics are still unadvertised; configuration cannot grant support. */
export const BACKEND_DEPENDENCY_CAPABILITY: DependencyRuntimeCapability = Object.freeze({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: Object.freeze([]),
});

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
  if (
    activation.state === 'ENABLED' &&
    !capability.semantics.includes('cross-project-dependencies-v1')
  )
    throw new Error('backend lacks cross-project dependency semantics');
}
