import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { OptimizerAvailability } from '../../ports/scheduler';
import { PROJECT_LABEL } from './contract';
import { ProjectService, type ProjectServiceOptions } from './project.resource';

/**
 * Project as a sealed DI Bag module.
 *
 * Only `projects` is exported. `projectOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.project/projectOptions` rather than against
 * an anonymous binding. The store is required as `projectStore` because the
 * host graph's `projects` key is this module's export. `optimizerAvailable`
 * is registered even when absent, as `undefined`, the way Saved plans
 * registers its optional quota: the resource then refuses to switch an
 * optimizer on, as it always has.
 *
 * The module registers no disposer: `ProjectService` holds the borrowed store
 * of one scope, a clock, a broadcaster and a predicate, and no handle of its
 * own.
 */
export const projectModule = DiBag.createBuilder()
  .register({
    projectOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        clock,
        broadcast,
        optimizerAvailable,
      }: {
        projectStore: ProjectStore;
        clock: Clock;
        broadcast: Broadcaster;
        optimizerAvailable: OptimizerAvailability | undefined;
      }): ProjectServiceOptions => ({
        projects: projectStore,
        clock,
        broadcast,
        // Proof (2026-09-24): leaving `optimizerAvailable` out of the returned options left
        // `switches the optimizer on through the availability installProject wires` failing
        // (4 pass, 1 fail): the update answered `optimizer_unavailable`.
        optimizerAvailable,
      }),
    ),
  })
  .register({
    projects: DiBag.fromSyncFactory(
      ({ projectOptions }: { projectOptions: ProjectServiceOptions }): ProjectService =>
        new ProjectService(projectOptions),
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['projects', 'projectOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('projectOptions')` did not throw, `inspectGraph()` reported bare `projectOptions`,
  // and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: PROJECT_LABEL }` left only the two label assertions
  // failing (3 pass, 2 fail): `inspectGraph()` reported `projectOptions` unlabelled, and the
  // missing-requirement message named `projectOptions` instead of
  // `application.project/projectOptions`.
  .buildModule(['projects'], { label: PROJECT_LABEL });
