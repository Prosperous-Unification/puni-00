import { createPlanRefresh } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type { ProjectApi } from '@/lib/wbs-api';
import type { Publisher } from '@/modules/channel';

import type {
  PlanFeed,
  PlanFeedDelivery,
  PlanFeedRefusal,
  PlanFeedStreamHandlers,
} from './contract';
import { createPlanFeed } from './plan-feed.feature';

/** What a screen hands the composition site: its identity and where its answers go. */
export interface PlanFeedForReader {
  readonly projectId: string;
  readonly api: ProjectApi;
  readonly subscribe:
    | ((projectId: string, handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream)
    | undefined;
  readonly isActiveReader: () => boolean;
  readonly publish: (delivery: PlanFeedDelivery) => void;
  /** Where a refusal of the first read is announced; the words are the listener's. */
  readonly refusals: Publisher<PlanFeedRefusal>;
  readonly setConnected: (connected: boolean) => void;
}

/**
 * The one place that sees the refresh owner's factory and the feature at once.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. It is here rather than in the screen because
 * rule K2 says delivery imports a feature-service and nothing beneath it — the
 * same line `modules/directory-management/composition.ts` carries. The project
 * lifetime of the rollout's last Task 6 row takes this over; until then it is
 * one call.
 */
export function planFeedForReader({
  projectId,
  api,
  subscribe,
  isActiveReader,
  publish,
  refusals,
  setConnected,
}: PlanFeedForReader): PlanFeed {
  return createPlanFeed({
    openOwner: () => createPlanRefresh({ projectId, api }),
    openStream:
      subscribe === undefined
        ? null
        : (handlers, baseline) => subscribe(projectId, handlers, baseline),
    isActiveReader,
    publish,
    announceRefusal: refusals.publish,
    setConnected,
  });
}
