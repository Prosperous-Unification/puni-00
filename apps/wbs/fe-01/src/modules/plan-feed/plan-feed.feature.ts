import type { PlanFeed, PlanFeedHost } from './contract';
import { createPlanReading } from './plan-feed.resource';

/**
 * Builds the live plan reading for one reader: one project, one API, one screen.
 *
 * The **feature**-service delivery sees (rule K2), and the only place that knows
 * **who** the reading belongs to. Two things can end a reader's claim and they
 * end it at different moments — the screen closing, and the project or API
 * changing under a render that has not been torn down yet — so `isLive` is the
 * conjunction of both, and the resource asks it before every answer it gives.
 */
export function createPlanFeed({
  openOwner,
  openStream,
  isActiveReader,
  publish,
  announceRefusal,
  setConnected,
}: PlanFeedHost): PlanFeed {
  let closed = false;
  const reading = createPlanReading({
    openOwner,
    openStream,
    isLive: () => !closed && isActiveReader(),
    deliver: publish,
    reportFailures: (failures) => {
      for (const failure of failures) announceRefusal({ cause: failure.cause });
    },
    reportConnection: setConnected,
  });
  return {
    owner: reading.owner,
    subscribe: reading.subscribe,
    snapshot: reading.snapshot,
    rereadResources: reading.rereadResources,
    close: () => {
      closed = true;
      reading.close();
    },
  };
}
