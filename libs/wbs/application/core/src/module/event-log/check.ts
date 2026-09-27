import { DiBag } from 'di-bag';

import type { EventLogExports, EventLogRequirements } from './contract';
import { eventLogModule } from './module';

/** Install durable subscription history over the supplied repository scope. */
export function installEventLog(requirements: EventLogRequirements): EventLogExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([eventLogModule])
    .withServices({
      eventLogStore: DiBag.createProvider(() => requirements.events, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();
  // Proof (2026-09-27): adding `bag` to this return failed `exports only the
  // resource` (4 pass, 1 fail).
  return { eventLog: bag.resolve('eventLog') };
}
