import type { Analytics, LeadEvent } from '@website/analytics';
import type { AnalyticsEvent, ConversationScoping } from '@website/contracts';
import { createContext, useContext, useEffect } from 'react';

import { ApiFailure } from './api';

/** Page-owned observation memory is functional only: identities never enter vendor arguments or storage. */
export function createMilestones(analytics: Analytics) {
  const observed = new Set<string>();
  const confirmed = new Set<string>();
  return {
    analytics,
    observe(identity: string, event: Exclude<AnalyticsEvent, LeadEvent>) {
      // Proof: observation memory is advanced while denied; analytics-flow.test rejects late consent backfill.
      if (observed.has(identity)) return;
      observed.add(identity);
      analytics.dispatch(event);
    },
    confirm(receipt: string, event: LeadEvent) {
      // Proof: bypassing this fence emitted duplicate and late-consent leads in analytics-flow.test.
      if (confirmed.has(receipt)) return;
      confirmed.add(receipt);
      analytics.dispatchLead(receipt, event);
    },
    failure(error: unknown) {
      analytics.dispatch({
        name: 'funnel_failure',
        category:
          error instanceof ApiFailure
            ? error.status === 409
              ? 'conflict'
              : error.status === 429
                ? 'limit'
                : error.status === 400
                  ? 'validation'
                  : 'unavailable'
            : error instanceof TypeError
              ? 'network'
              : 'unavailable',
      });
    },
  };
}

export const MilestonesContext = createContext<ReturnType<typeof createMilestones> | null>(null);
export function useMilestones() {
  return useContext(MilestonesContext);
}

/** Observe visibility without subscribing to consent; a dropped observation is still consumed. */
export function useMilestone(
  identity: string | null,
  event: Exclude<AnalyticsEvent, LeadEvent> | null,
) {
  const milestones = useMilestones();
  useEffect(() => {
    if (identity !== null && event !== null) milestones?.observe(identity, event);
  });
}

/** Null choice in a known draft means the visitor used the typed starter; absent recovery context does not. */
export function readStartingChoice(scoping: ConversationScoping | undefined) {
  return scoping?.version === 1 ? (scoping.startingChoice ?? 'typed') : 'typed';
}
