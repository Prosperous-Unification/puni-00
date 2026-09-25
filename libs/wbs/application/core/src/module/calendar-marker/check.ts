import { DiBag } from 'di-bag';

import type { CalendarMarkerExports, CalendarMarkerRequirements } from './contract';
import { calendarMarkerModule } from './module';

/**
 * Installs {@link calendarMarkerModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Calendar marker
 * can reach a private binding or a host key through it. The type checker does
 * not enforce that on its own: an object with an extra property returned
 * through a variable still satisfies {@link CalendarMarkerExports}, so the
 * module's tests enumerate what this function returns.
 */
export function installCalendarMarker(
  requirements: CalendarMarkerRequirements,
): CalendarMarkerExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([calendarMarkerModule])
    .withServices({
      projectStore: DiBag.createProvider(() => requirements.projects, {
        factoryReturnKind: 'sync-value',
      }),
      calendarMarkerStore: DiBag.createProvider(() => requirements.markers, {
        factoryReturnKind: 'sync-value',
      }),
      clock: DiBag.createProvider(() => requirements.clock, { factoryReturnKind: 'sync-value' }),
      broadcast: DiBag.createProvider(() => requirements.broadcast, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `CalendarMarkerService` kept the key
  // list correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { calendarMarkers: bag.resolve('calendarMarkers') };
}
