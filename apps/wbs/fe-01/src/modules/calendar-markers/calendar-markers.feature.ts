import { createCalendarMarkerWrites } from './calendar-markers.resource';
import type { CalendarMarkerEdit, CalendarMarkers, CalendarMarkersHost } from './contract';

/**
 * Builds the calendar-marker gestures for one reader: one project, one API, one
 * refresh owner.
 *
 * The **feature**-service delivery sees (rule K2), and the only place that
 * knows **who** a write belongs to. Every gesture is the same three acts — send
 * it, say what was refused, read the dirtied resources again — and the two
 * guards below are what keep a departed reader out of all three.
 */
export function createCalendarMarkers({
  projectId,
  api,
  readRefreshOwner,
  isActiveReader,
  announceRefusal,
}: CalendarMarkersHost): CalendarMarkers {
  const writes = createCalendarMarkerWrites({ projectId, api });
  const run = async (edit: CalendarMarkerEdit): Promise<void> => {
    const owner = readRefreshOwner();
    if (owner === null) return;
    /**
     * Still this reader's write: the owner it started against is still the one
     * installed, and the screen still holds the project and API it opened.
     * Both, because they fail at different moments — the owner is replaced by
     * an effect, the project and API by a render before it.
     */
    const isCurrent = (): boolean => readRefreshOwner() === owner && isActiveReader();
    try {
      await writes.send(edit);
    } catch (cause) {
      if (!isCurrent()) return;
      announceRefusal({ cause });
    }
    // A refused write rereads too: the target may have disappeared under it.
    if (isCurrent()) await owner.invalidate({ resources: writes.dirtied });
  };
  return {
    add: (marker) => run({ kind: 'add', marker }),
    rename: (markerId, name) => run({ kind: 'rename', markerId, name }),
    recolor: (markerId, color) => run({ kind: 'recolor', markerId, color }),
    remove: (markerId) => run({ kind: 'remove', markerId }),
  };
}
