import { createCalendarMarkers } from './calendar-markers.feature';
import type { CalendarMarkers, CalendarMarkersHost } from './contract';

/**
 * The one place that sees the HTTP client and the feature at once.
 *
 * A composition site, which the taxonomy lets see everything because it
 * installs and supplies and holds no logic. It is here rather than in the
 * screen because rule K2 says delivery imports a feature-service and nothing
 * beneath it — the same line `modules/plan-feed/composition.ts` carries. The
 * project lifetime of the rollout's last Task 6 row takes this over; until then
 * it is one call.
 */
export function calendarMarkersForReader(host: CalendarMarkersHost): CalendarMarkers {
  return createCalendarMarkers(host);
}
