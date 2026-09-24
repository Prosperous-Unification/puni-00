import type { StepService, StepServiceOptions } from './step.resource';

/**
 * What a host must supply to install {@link stepModule}.
 *
 * Exactly {@link StepServiceOptions}, unchanged by the move: the project and
 * step stores of the one scope being installed over, the broadcaster and the
 * clock. `servicesOver` supplies the stores of each admitted scope, so one
 * installation never outlives the scope it was built over.
 *
 * **No K6 debt; K4 support and K2 debt disclosed.** Step is a resource: it
 * imports the domain library, repository ports and no other resource. It
 * still imports two support files from `service/`, `assumed-assignee.ts` and
 * `clean-name.ts`, which the backend module map moves to the domain library
 * (task 6.1); until then that is a resource reading application-ring support
 * rather than the domain. Delivery's side is not closed either:
 * `http/step.routes.ts` still accepts `StepService` directly, the direct
 * resource dependency of delivery (K2) the map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type StepRequirements = StepServiceOptions;

/** What installing {@link stepModule} adds to a host graph. */
export interface StepExports {
  readonly steps: StepService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.step` and the label drops the
 * `module.` prefix.
 */
export const STEP_LABEL = 'application.step';
