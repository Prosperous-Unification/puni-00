import {
  DEPENDENCY_SEMANTICS,
  type DependencyClientRefusal,
  type DependencyRuntimeCapability,
} from '@wbs/contracts';
import { inspectDependencyActivation } from '@wbs/store-sqlite/cross-project-dependency-activation';
import type { Drizzle } from '@wbs/store-sqlite/db';

/**
 * Reads trusted authority afresh in one coherent SQLite read transaction. Enabled
 * authority requires both the exact client claim and immutable binary support.
 * Missing, unreadable or malformed authority throws; this never activates authoring.
 */
export function admitDependencyClient(
  db: Drizzle,
  capability: DependencyRuntimeCapability,
  claim: string | null,
): DependencyClientRefusal | null {
  // Proof: bypassing fresh inspection admitted ENABLED /api/projects,200 instead of409; removing the transaction changed the rival-activation snapshot request from200 to409.
  const activation = db.transaction((transaction) => inspectDependencyActivation(transaction));
  if (activation.state === 'DISABLED') return null;
  // Proof: independently removing exact claim or immutable support admitted an incompatible client in dependency-client.db.test.ts.
  if (claim !== DEPENDENCY_SEMANTICS || !capability.semantics.includes(DEPENDENCY_SEMANTICS))
    return { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS };
  return null;
}
