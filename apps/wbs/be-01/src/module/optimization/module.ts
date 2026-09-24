import { DiBag } from 'di-bag';

import { OPTIMIZATION_LABEL } from './contract';
import {
  OptimizationCoordinator,
  type OptimizationCoordinatorOptions,
} from './optimization.feature';

type CoordinatorOption<K extends keyof OptimizationCoordinatorOptions> =
  OptimizationCoordinatorOptions[K];

/**
 * Optimization as a sealed DI Bag module.
 *
 * Only `optimizer` is exported. `optimizationOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `backend.optimization/optimizationOptions` rather than
 * against an anonymous binding. The five optional seams (`runChild`,
 * `editDebounceMs`, `sleep`, `setInterval`, `clearInterval`) are registered
 * even when absent, as `undefined`, so the coordinator keeps its own defaults
 * exactly as a direct construction does.
 *
 * The module registers no disposer: `bootBe01` starts the coordinator's
 * reconciliation after composition and awaits its `stop()` in its tested
 * shutdown order, and a second owner here would stop it twice.
 */
export const optimizationModule = DiBag.createBuilder()
  .register({
    optimizationOptions: DiBag.fromSyncFactory(
      ({
        db,
        contractVersion,
        solverVersion,
        budgetMs,
        ownerId,
        now,
        attemptToken,
        inputOf,
        enabledOf,
        spawn,
        runChild,
        onChildError,
        eventLog,
        pushRecorded,
        editDebounceMs,
        sleep,
        setInterval,
        clearInterval,
      }: {
        db: CoordinatorOption<'db'>;
        contractVersion: CoordinatorOption<'contractVersion'>;
        solverVersion: CoordinatorOption<'solverVersion'>;
        budgetMs: CoordinatorOption<'budgetMs'>;
        ownerId: CoordinatorOption<'ownerId'>;
        now: CoordinatorOption<'now'>;
        attemptToken: CoordinatorOption<'attemptToken'>;
        inputOf: CoordinatorOption<'inputOf'>;
        enabledOf: CoordinatorOption<'enabledOf'>;
        spawn: CoordinatorOption<'spawn'>;
        runChild: CoordinatorOption<'runChild'>;
        onChildError: CoordinatorOption<'onChildError'>;
        eventLog: CoordinatorOption<'eventLog'>;
        pushRecorded: CoordinatorOption<'pushRecorded'>;
        editDebounceMs: CoordinatorOption<'editDebounceMs'>;
        sleep: CoordinatorOption<'sleep'>;
        setInterval: CoordinatorOption<'setInterval'>;
        clearInterval: CoordinatorOption<'clearInterval'>;
      }): OptimizationCoordinatorOptions => ({
        db,
        // Proof (2026-09-24): handing the coordinator `contractVersion: solverVersion` instead of
        // the supplied contract version left `reads an idle plan under the identity
        // installOptimization wires` failing (5 pass, 1 fail): the read carried
        // `"contractVersion": "0.1.0"`.
        contractVersion,
        solverVersion,
        budgetMs,
        ownerId,
        now,
        attemptToken,
        inputOf,
        enabledOf,
        spawn,
        runChild,
        // Proof (2026-09-24): handing the coordinator `onChildError: () => undefined` instead of
        // the supplied sink left `reports a failed edit read to the error sink installOptimization
        // wires` failing (5 pass, 1 fail): it received `[]`.
        onChildError,
        eventLog,
        pushRecorded,
        editDebounceMs,
        sleep,
        setInterval,
        clearInterval,
      }),
    ),
  })
  .register({
    optimizer: DiBag.fromSyncFactory(
      ({
        optimizationOptions,
      }: {
        optimizationOptions: OptimizationCoordinatorOptions;
      }): OptimizationCoordinator => new OptimizationCoordinator(optimizationOptions),
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['optimizer', 'optimizationOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (3 pass, 3 fail):
  // `resolve('optimizationOptions')` did not throw, `inspectGraph()` reported bare
  // `optimizationOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: OPTIMIZATION_LABEL }` left only the two label
  // assertions failing (4 pass, 2 fail): `inspectGraph()` reported `optimizationOptions`
  // unlabelled, and the missing-requirement message named `optimizationOptions` instead of
  // `backend.optimization/optimizationOptions`.
  .buildModule(['optimizer'], { label: OPTIMIZATION_LABEL });
