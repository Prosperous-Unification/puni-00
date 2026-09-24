import { DiBag } from 'di-bag';

import type { WorkItemExports, WorkItemRequirements } from './contract';
import { workItemModule } from './module';

/**
 * Installs {@link workItemModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Work item can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link WorkItemExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installWorkItem(requirements: WorkItemRequirements): WorkItemExports {
  const bag = DiBag.createBuilder()
    .installModule(workItemModule)
    .register({
      workItemStore: DiBag.fromSyncFactory(() => requirements.workItems),
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      estimateStore: DiBag.fromSyncFactory(() => requirements.estimates),
      actualStore: DiBag.fromSyncFactory(() => requirements.actuals),
      measureStore: DiBag.fromSyncFactory(() => requirements.measures),
      progressStore: DiBag.fromSyncFactory(() => requirements.progress),
      directoryStore: DiBag.fromSyncFactory(() => requirements.directory),
      capacityStore: DiBag.fromSyncFactory(() => requirements.capacity),
      priorityBandStore: DiBag.fromSyncFactory(() => requirements.priorityBands),
      dependencyStore: DiBag.fromSyncFactory(() => requirements.dependencies),
      subtreeStore: DiBag.fromSyncFactory(() => requirements.subtrees),
      journalStore: DiBag.fromSyncFactory(() => requirements.journal),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      scheduler: DiBag.fromSyncFactory(() => requirements.scheduler),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `WorkItemService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { workItems: bag.resolve('workItems') };
}
