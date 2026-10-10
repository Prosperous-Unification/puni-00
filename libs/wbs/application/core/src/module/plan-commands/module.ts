import { DiBag } from 'di-bag';

import { createPlanCommandRunner, type PlanCommandsSource } from './composition';
import { PLAN_COMMANDS_LABEL, type PlanCommandsRequirements } from './contract';
import type { PlanCommandRunner } from './plan-commands.feature';

/**
 * Plan commands as a sealed DI Bag module.
 *
 * Only `commands` is exported. `planCommandOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.plan-commands/planCommandOptions` rather than
 * against an anonymous binding.
 *
 * The module registers no disposer: `PlanCommandRunner` holds a mapped
 * transaction, a borrowed public graph and a broadcaster, and no handle
 * of its own. Every batch's collector and Working plan are made and dropped
 * inside that batch.
 */
export const planCommandsModule = DiBag.createBuilder()
  .withServices({
    planCommandOptions: DiBag.createProvider(
      (source: PlanCommandsRequirements): PlanCommandsSource => source,
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    commands: DiBag.createProvider(
      ({ planCommandOptions }: { planCommandOptions: PlanCommandsSource }): PlanCommandRunner =>
        createPlanCommandRunner(planCommandOptions),
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
