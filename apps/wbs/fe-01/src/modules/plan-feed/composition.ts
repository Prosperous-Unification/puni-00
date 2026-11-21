import { createPlanRefresh, type PlanReadRoutes } from '@/lib/plan-refresh';
import type { WorkPackageStream } from '@/lib/work-package-stream';
import type { Publisher } from '@/modules/channel';

import type { PlanFeed, PlanFeedRefusal, PlanFeedStreamHandlers } from './contract';
import type { DeliveredPlanWrites } from './delivered-plan-store';
import { createPlanFeed } from './plan-feed.feature';

/**
 * What the composition site is handed: the reader's identity, where its answers
 * go, and the routes its refresh owner reads through.
 */
export interface PlanFeedForReader {
  readonly workPackageId: string;
  /** This module's private repository port, supplied by the work package composition root. */
  readonly routes: PlanReadRoutes;
  readonly subscribe:
    | ((
        workPackageId: string,
        handlers: PlanFeedStreamHandlers,
        baseline: number,
      ) => WorkPackageStream)
    | undefined;
  readonly isActiveReader: () => boolean;
  /** The reader's delivered plan: every publication and connection report is written here. */
  readonly plan: DeliveredPlanWrites;
  /** Where a refusal of the first read is announced; the words are the listener's. */
  readonly refusals: Publisher<PlanFeedRefusal>;
}

/**
 * The one place that sees the refresh owner's factory and the feature at once.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. It is here rather than in the screen because
 * rule K2 says delivery imports a feature-service and nothing beneath it — the
 * same line `modules/directory-management/composition.ts` carries. Its one
 * caller is the work package composition root, `modules/work-package/composition.ts`,
 * which hands it the routes; the work package lifetime of the rollout's last Task 6
 * row takes both over.
 */
export function planFeedForReader({
  workPackageId,
  routes,
  subscribe,
  isActiveReader,
  plan,
  refusals,
}: PlanFeedForReader): PlanFeed {
  return createPlanFeed({
    openOwner: () =>
      createPlanRefresh({ workPackageId, routes, monotonicNow: () => performance.now() }),
    openStream:
      subscribe === undefined
        ? null
        : (handlers, baseline) => subscribe(workPackageId, handlers, baseline),
    isActiveReader,
    publish: plan.deliver,
    // Proof: on 2026-09-24, written as `() => undefined`, `names an unavailable optimizer and
    // offers no export before a plan is installed` failed on `expected [] to include 'Optimized
    // scheduling is unavailable i…'`.
    announceRefusal: refusals.publish,
    // Proof: on 2026-09-24, written as `() => undefined`, `says so while the connection is down`
    // failed on `Unable to find an accessible element with the role "status"`.
    setConnected: plan.reportConnection,
  });
}
