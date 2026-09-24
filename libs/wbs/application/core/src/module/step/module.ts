import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { StepStore } from '../../ports/step-store';
import { STEP_LABEL } from './contract';
import { StepService, type StepServiceOptions } from './step.resource';

/**
 * Step as a sealed DI Bag module.
 *
 * Only `steps` is exported. `stepOptions` stays private to each installation,
 * so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.step/stepOptions` rather than against an
 * anonymous binding. The two stores are required as `projectStore` and
 * `stepStore` because the host graph's `steps` key is this module's export.
 *
 * The module registers no disposer: `StepService` holds the borrowed stores of
 * one scope, a clock and a broadcaster, and no handle of its own.
 */
export const stepModule = DiBag.createBuilder()
  .register({
    stepOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        stepStore,
        broadcast,
        clock,
      }: {
        projectStore: ProjectStore;
        stepStore: StepStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): StepServiceOptions => ({
        projects: projectStore,
        steps: stepStore,
        // Proof (2026-09-24): handing the resource
        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
        // broadcaster left `announces an added step through the broadcaster installStep wires`
        // failing (4 pass, 1 fail): it received `[]`.
        broadcast,
        clock,
      }),
    ),
  })
  .register({
    steps: DiBag.fromSyncFactory(
      ({ stepOptions }: { stepOptions: StepServiceOptions }): StepService =>
        new StepService(stepOptions),
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['steps', 'stepOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('stepOptions')` did not throw, `inspectGraph()` reported bare `stepOptions`,
  // and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: STEP_LABEL }` left only the two label assertions
  // failing (3 pass, 2 fail): `inspectGraph()` reported `stepOptions` unlabelled, and the
  // missing-requirement message named `stepOptions` instead of
  // `application.step/stepOptions`.
  .buildModule(['steps'], { label: STEP_LABEL });
