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
    .withInstalledModules([workItemModule])
    .withServices({
      workItemStore: DiBag.createProvider(() => requirements.workItems, {
        factoryReturnKind: 'sync-value',
      }),
      projectStore: DiBag.createProvider(() => requirements.projects, {
        factoryReturnKind: 'sync-value',
      }),
      estimateStore: DiBag.createProvider(() => requirements.estimates, {
        factoryReturnKind: 'sync-value',
      }),
      actualStore: DiBag.createProvider(() => requirements.actuals, {
        factoryReturnKind: 'sync-value',
      }),
      measureStore: DiBag.createProvider(() => requirements.measures, {
        factoryReturnKind: 'sync-value',
      }),
      progressStore: DiBag.createProvider(() => requirements.progress, {
        factoryReturnKind: 'sync-value',
      }),
      directoryStore: DiBag.createProvider(() => requirements.directory, {
        factoryReturnKind: 'sync-value',
      }),
      capacityStore: DiBag.createProvider(() => requirements.capacity, {
        factoryReturnKind: 'sync-value',
      }),
      priorityBandStore: DiBag.createProvider(() => requirements.priorityBands, {
        factoryReturnKind: 'sync-value',
      }),
      dependencyStore: DiBag.createProvider(() => requirements.dependencies, {
        factoryReturnKind: 'sync-value',
      }),
      subtreeStore: DiBag.createProvider(() => requirements.subtrees, {
        factoryReturnKind: 'sync-value',
      }),
      journalStore: DiBag.createProvider(() => requirements.journal, {
        factoryReturnKind: 'sync-value',
      }),
      broadcast: DiBag.createProvider(() => requirements.broadcast, {
        factoryReturnKind: 'sync-value',
      }),
      scheduler: DiBag.createProvider(() => requirements.scheduler, {
        factoryReturnKind: 'sync-value',
      }),
      clock: DiBag.createProvider(() => requirements.clock, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `WorkItemService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { workItems: bag.resolve('workItems') };
}
