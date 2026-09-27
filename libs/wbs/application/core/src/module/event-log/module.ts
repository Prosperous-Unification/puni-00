import { DiBag } from 'di-bag';

import type { EventLogStore } from '../../ports/event-log-store';
import { EVENT_LOG_LABEL } from './contract';
import { EventLogService } from './event-log.resource';

/** Sealed durable-history resource with its repository store kept private. */
export const eventLogModule = DiBag.createBuilder()
  .withServices({
    eventLogSettings: DiBag.createProvider(
      ({ eventLogStore }: { eventLogStore: EventLogStore }): EventLogStore => eventLogStore,
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    eventLog: DiBag.createProvider(
      ({ eventLogSettings }: { eventLogSettings: EventLogStore }): EventLogService =>
        new EventLogService(eventLogSettings),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-27): exporting eventLogSettings failed the privacy, label,
  // and missing-requirement tests (2 pass, 3 fail). Removing the label failed
  // the label and missing-requirement tests (3 pass, 2 fail).
  .buildModule({ exportedServiceKeys: ['eventLog'], moduleLabel: EVENT_LOG_LABEL });
