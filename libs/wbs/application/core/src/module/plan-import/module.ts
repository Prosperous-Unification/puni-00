import { DiBag } from 'di-bag';

import { createImportService, type PlanImportSource } from './composition';
import { PLAN_IMPORT_LABEL } from './contract';
import type { ImportService } from './plan-import.feature';

/**
 * Plan import as a sealed DI Bag module.
 *
 * Only `imports` is exported. `importOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is reported
 * against `application.plan-import/importOptions` rather than against an
 * anonymous binding.
 *
 * The module registers no disposer, because nothing it owns has one:
 * `ImportService` holds a mapped transaction, three borrowed ports and no timer, socket
 * or handle of its own. Its lifetime therefore stays the composition root's,
 * exactly as `bootBe01` owns the source it borrows.
 */
export const planImportModule = DiBag.createBuilder()
  .withServices({
    importOptions: DiBag.createProvider((source: PlanImportSource): PlanImportSource => source, {
      factoryReturnKind: 'sync-value',
    }),
  })
  .withServices({
    imports: DiBag.createProvider(
      ({ importOptions }: { importOptions: PlanImportSource }): ImportService =>
        createImportService(importOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-23): widening the key tuple to `['imports', 'importOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (3 pass, 3 fail):
  // `resolve('importOptions')` returned the options object, `inspectGraph()` reported bare
  // `importOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-23): dropping `{ label: PLAN_IMPORT_LABEL }` left only the two label
  // assertions failing (4 pass, 2 fail): `inspectGraph()` reported `importOptions` unlabelled,
  // and the missing-requirement message named `importOptions` instead of
  // `application.plan-import/importOptions`.
  .buildModule({ exportedServiceKeys: ['imports'], moduleLabel: PLAN_IMPORT_LABEL });
