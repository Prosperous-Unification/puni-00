import type { CalendarMarkerEdit, CalendarMarkerPorts, CalendarMarkerWrites } from './contract';

/**
 * Every marker edit leaves exactly this out of date.
 *
 * `markers` and not the tree: a marker moves nothing in the schedule, which is
 * why be-01 answers the list on a read of its own rather than inside
 * {@link PlanRead} — the argument is on {@link ProjectApi.listCalendarMarkers}.
 */
// Proof: on 2026-09-21, replacing this with [] made the dirtied-resource test receive [] instead of ['markers'].
const DIRTIED = ['markers'] as const;

/**
 * The four routes that change one project's calendar markers.
 *
 * The **resource**-service (rule K4): it writes through the HTTP client and
 * knows what each write dirties, and it knows nothing about who asked, whether
 * they are still there, or what a refusal should be called. `projectId` is bound
 * once, because a resource is one aggregate's and not a catalogue of every
 * project's.
 */
export function createCalendarMarkerWrites({
  projectId,
  api,
}: CalendarMarkerPorts): CalendarMarkerWrites {
  return {
    dirtied: DIRTIED,
    send: async (edit: CalendarMarkerEdit): Promise<void> => {
      // Proof: on 2026-09-21, blanking the marker name made the add-route test record an empty name.
      if (edit.kind === 'add') {
        await api.createCalendarMarker(projectId, edit.marker);
        return;
      }
      // Proof: on 2026-09-21, passing '' made the rename-route test receive rename:p1:launch:.
      if (edit.kind === 'rename') {
        await api.renameCalendarMarker(projectId, edit.markerId, edit.name);
        return;
      }
      // Proof: on 2026-09-21, passing null made the recolour-route test lose #0386a5.
      if (edit.kind === 'recolor') {
        await api.recolorCalendarMarker(projectId, edit.markerId, edit.color);
        return;
      }
      // Proof: on 2026-09-21, replacing this call with Promise.resolve() left the route log empty and the production chip drawn.
      await api.deleteCalendarMarker(projectId, edit.markerId);
    },
  };
}
