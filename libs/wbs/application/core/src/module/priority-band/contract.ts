import type { PriorityBandService, PriorityBandServiceOptions } from './priority-band.resource';

/**
 * What a host must supply to install {@link priorityBandModule}.
 *
 * Exactly {@link PriorityBandServiceOptions}, unchanged by the move: the
 * project and ladder stores of the one scope being installed over, the
 * broadcaster and the clock. `servicesOver` supplies the stores of each
 * admitted scope, so one installation never outlives the scope it was built
 * over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Priority band is a resource: it
 * imports the domain library and repository ports and no other resource. What
 * this extraction does not close is Plan commands' and delivery's side:
 * `service/plan-commands.ts` still names `PriorityBandService` directly, and
 * delivery reaches it through the composed graph rather than a feature
 * contract (K2), which the backend module map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type PriorityBandRequirements = PriorityBandServiceOptions;

/** What installing {@link priorityBandModule} adds to a host graph. */
export interface PriorityBandExports {
  readonly priorityBands: PriorityBandService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.priority-band` and the label drops
 * the `module.` prefix.
 */
export const PRIORITY_BAND_LABEL = 'application.priority-band';
