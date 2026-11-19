import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import { PLAN_DOCUMENT_LABEL } from './contract';
import { PlanDocumentService, type PlanDocumentServiceOptions } from './plan-document.resource';

/**
 * Plan document as a sealed DI Bag module.
 *
 * Only `planDocuments` is exported. `planDocumentOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.plan-document/planDocumentOptions` rather
 * than against an anonymous binding.
 *
 * The module registers no disposer: `PlanDocumentService` holds borrowed
 * clock and no timer, socket or handle of its own. The supplied evidence is detached.
 */
export const planDocumentModule = DiBag.createBuilder()
  .withServices({
    planDocumentOptions: DiBag.createProvider(
      ({ clock }: { clock: Pick<Clock, 'now'> }): PlanDocumentServiceOptions => {
        // Proof (2026-09-23): handing the feature `clock: { now: () => 0 }` instead of the supplied
        // clock left `exports a workPackage with its markers over the graph installPlanDocument wires`
        // failing (4 pass, 1 fail): `exportedAt` read "1970-01-01T00:00:00.000Z".

        return { clock };
      },
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    planDocuments: DiBag.createProvider(
      ({
        planDocumentOptions,
      }: {
        planDocumentOptions: PlanDocumentServiceOptions;
      }): PlanDocumentService => new PlanDocumentService(planDocumentOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-23): widening the key tuple to `['planDocuments', 'planDocumentOptions']` left
  // the private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('planDocumentOptions')` did not throw, `inspectGraph()` reported bare
  // `planDocumentOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-23): dropping `{ label: PLAN_DOCUMENT_LABEL }` left only the two label
  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `planDocumentOptions`
  // unlabelled, and the missing-requirement message named `planDocumentOptions` instead of
  // `application.plan-document/planDocumentOptions`.
  .buildModule({ exportedServiceKeys: ['planDocuments'], moduleLabel: PLAN_DOCUMENT_LABEL });
