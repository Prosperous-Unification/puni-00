import type { CalendarMarker, CalendarMarkerStore, CalendarMarkerWritten } from '@wbs/core';
import type { SettingScope } from '@wbs/domain';

/**
 * A {@link CalendarMarkerStore} backed by a Map, for the callers that need
 * `buildApp` to construct and never drive a marker route.
 *
 * It keeps the two guarantees a test could otherwise pass against by accident,
 * because a fixture laxer than production lets a test assert behaviour that
 * does not exist: every read and write is scoped by `workPackageId`, and `listFor`
 * is totally ordered by `(date, createdAt, id)` — the third key included,
 * because it is the one `CalendarMarkerRepository` exists to guarantee and a
 * fixture that dropped it would answer a tie in insertion order.
 *
 * What it deliberately does not keep is the work-package-existence check, for
 * `inMemoryPriorityBands`' reason: this Map holds no work packages, so an answer
 * about an unknown id would be an answer to a question it cannot know.
 * `CalendarMarkerService` reads the work package itself, and the store's own refusal
 * is asserted against real SQLite in
 * `repository/calendar-marker-repository.db.test.ts`.
 */
export interface MemoryCalendarMarkerTable {
  readonly held: Map<
    string,
    Omit<CalendarMarker, 'workPackageId'> & { readonly scope: SettingScope }
  >;
}
export function memoryCalendarMarkerTable(
  seed: readonly CalendarMarker[] = [],
): MemoryCalendarMarkerTable {
  return {
    held: new Map(
      seed.map(({ workPackageId, ...marker }) => [
        marker.id,
        { ...structuredClone(marker), scope: { level: 'work_package', id: workPackageId } },
      ]),
    ),
  };
}

export function inMemoryCalendarMarkers(
  seed: readonly CalendarMarker[] = [],
  table: MemoryCalendarMarkerTable = memoryCalendarMarkerTable(seed),
): CalendarMarkerStore {
  const { held } = table;
  const published = (
    marker: Omit<CalendarMarker, 'workPackageId'> & { readonly scope: SettingScope },
  ): CalendarMarker => {
    if (marker.scope.level !== 'work_package')
      throw new Error('non-package marker reached own-scope adapter');
    const { scope, ...point } = marker;
    return { ...point, workPackageId: scope.id };
  };
  const one = (workPackageId: string, id: string): CalendarMarker | undefined => {
    const found = held.get(id);
    return found?.scope.level === 'work_package' && found.scope.id === workPackageId
      ? published(found)
      : undefined;
  };
  const touch = (
    workPackageId: string,
    id: string,
    patch: Partial<Pick<CalendarMarker, 'name' | 'color'>>,
  ): Promise<CalendarMarkerWritten> => {
    const found = one(workPackageId, id);
    if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
    const written = { ...found, ...patch };
    const { workPackageId: ownerId, ...point } = written;
    held.set(id, { ...point, scope: { level: 'work_package', id: ownerId } });
    return Promise.resolve({ ok: true, marker: { ...written } });
  };
  return {
    listFor(workPackageId) {
      return Promise.resolve(
        [...held.values()]
          .filter(
            (marker) => marker.scope.level === 'work_package' && marker.scope.id === workPackageId,
          )
          // A copy, so a caller that mutated what it was handed would not be
          // editing the store from the read side.
          .map(published)
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
          ),
      );
    },
    create(marker) {
      if (held.has(marker.id)) return Promise.resolve({ ok: false, reason: 'taken' });
      const { workPackageId, ...point } = marker;
      held.set(marker.id, { ...point, scope: { level: 'work_package', id: workPackageId } });
      return Promise.resolve({ ok: true, marker: { ...marker } });
    },
    rename(workPackageId, id, name) {
      return touch(workPackageId, id, { name });
    },
    recolor(workPackageId, id, color) {
      return touch(workPackageId, id, { color });
    },
    remove(workPackageId, id) {
      const found = one(workPackageId, id);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      held.delete(id);
      return Promise.resolve({ ok: true, marker: { ...found } });
    },
  };
}
