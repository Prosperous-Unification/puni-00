import { createCalendarMarkers } from './calendar-markers.feature';
import type { CalendarMarkers, CalendarMarkersHost } from './contract';

/**
 * The one place that sees this module's routes and its feature at once.
 *
 * A composition site, which the taxonomy lets see everything because it
 * installs and supplies and holds no logic. It is here rather than in the
 * screen because rule K2 says delivery imports a feature-service and nothing
 * beneath it — the same line `modules/plan-feed/composition.ts` carries. Its
 * one caller is the work package composition root, `modules/work-package/composition.ts`,
 * which hands it the routes; the work package lifetime of the rollout's last Task 6
 * row takes both over.
 */
export function calendarMarkersForReader(host: CalendarMarkersHost): CalendarMarkers {
  return createCalendarMarkers(host);
}
