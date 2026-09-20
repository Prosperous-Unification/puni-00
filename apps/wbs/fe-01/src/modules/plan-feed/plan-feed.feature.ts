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
  // Proof: changing `isLive` below to `() => isActiveReader()` delivered a
  // snapshot in `hands nothing on once it is closed, though the owner still
  // publishes`; the closed-reader refusal case failed too (2026-09-20).
  let closed = false;
  const reading = createPlanReading({
    openOwner,
    openStream,
    // Proof: replacing this expression with `() => !closed` delivered a
    // snapshot in `hands nothing to a reader that has moved on` instead of an
    // empty array (2026-09-20).
    isLive: () => !closed && isActiveReader(),
    deliver: publish,
    reportFailures: (failures) => {
      // Proof: replacing this loop with `void failures` left the optimizer
      // toast list empty in `names an unavailable optimizer and offers no
      // export before a plan is installed`, and announced no cause in the
      // feature suite (2026-09-20).
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
