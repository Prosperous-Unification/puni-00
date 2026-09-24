import type { CapacityService, CapacityServiceOptions } from './capacity.resource';

/**
 * What a host must supply to install {@link capacityModule}.
 *
 * Exactly {@link CapacityServiceOptions}, unchanged by the move: the project
 * and capacity stores of the one scope being installed over, the broadcaster
 * and the clock. `servicesOver` supplies the stores of each admitted scope, so
 * one installation never outlives the scope it was built over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Capacity is a resource: it imports
 * the domain library and repository ports and no other resource. What this
 * extraction does not close is delivery's and Plan commands' side:
 * `service/plan-commands.ts` still names `CapacityService` directly, and
 * delivery reaches it through the composed graph rather than a feature
 * contract (K2), which the backend module map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type CapacityRequirements = CapacityServiceOptions;

/** What installing {@link capacityModule} adds to a host graph. */
export interface CapacityExports {
  readonly capacity: CapacityService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.capacity` and the label drops the
 * `module.` prefix.
 */
export const CAPACITY_LABEL = 'application.capacity';
