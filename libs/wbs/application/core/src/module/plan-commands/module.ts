import { DiBag } from 'di-bag';

import type { Broadcaster } from '../../ports/project-event';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { PLAN_COMMANDS_LABEL } from './contract';
import {
  PlanCommandRunner,
  type PlanCommandRunnerOptions,
  type PlanCommandServices,
} from './plan-commands.feature';

/**
 * Plan commands as a sealed DI Bag module.
 *
 * Only `commands` is exported. `planCommandOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.plan-commands/planCommandOptions` rather than
 * against an anonymous binding.
 *
 * The module registers no disposer: `PlanCommandRunner` holds a factory, a
 * borrowed graph, the source's unit of work and a broadcaster, and no handle
 * of its own. Every batch's collector and Working plan are made and dropped
 * inside that batch.
 */
export const planCommandsModule = DiBag.createBuilder()
  .withServices({
    planCommandOptions: DiBag.createProvider(
      ({
        batchServices,
        publicServices,
        uow,
        announcements,
      }: {
        batchServices: PlanCommandRunnerOptions['batchServices'];
        publicServices: PlanCommandServices;
        uow: UnitOfWork;
        announcements: Broadcaster;
      }): PlanCommandRunnerOptions => ({
        // Proof (2026-09-24): handing the runner
        // `(scope) => batchServices(scope, announcements)` instead of the supplied factory left
        // `hands every batch its own collector, never the direct broadcaster` failing (5 pass,
        // 1 fail): both batches received the one direct broadcaster.
        batchServices,
        publicServices,
        uow,
        // Proof (2026-09-24): handing the runner
        // `{ ...announcements, publish: () => Promise.resolve() }` instead of the supplied
        // broadcaster left `drains a committed batch into the broadcaster installPlanCommands
        // wires` failing (5 pass, 1 fail): it received `[]`.
        announcements,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    commands: DiBag.createProvider(
      ({
        planCommandOptions,
      }: {
        planCommandOptions: PlanCommandRunnerOptions;
      }): PlanCommandRunner => new PlanCommandRunner(planCommandOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['commands', 'planCommandOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (3 pass, 3 fail):
  // `resolve('planCommandOptions')` did not throw, `inspectGraph()` reported bare
  // `planCommandOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: PLAN_COMMANDS_LABEL }` left only the two label
  // assertions failing (4 pass, 2 fail): `inspectGraph()` reported `planCommandOptions`
  // unlabelled, and the missing-requirement message named `planCommandOptions` instead of
  // `application.plan-commands/planCommandOptions`.
  .buildModule({ exportedServiceKeys: ['commands'], moduleLabel: PLAN_COMMANDS_LABEL });
