import type { StepService, StepServiceOptions } from './step.resource';

/**
 * What a host must supply to install {@link stepModule}.
 *
 * Exactly {@link StepServiceOptions}, unchanged by the move: the project and
 * step stores of the one scope being installed over, the broadcaster, the
 * clock and the dependency graph guard. `servicesOver` supplies the stores of each admitted scope, so one
 * installation never outlives the scope it was built over.
 *
 * **No K6 debt; K4 support and K2 debt disclosed.** Step is a resource: it
 * imports the domain library, repository ports and no other resource. Task 6.1
 * moved `cleanName` and the assumed-assignee rules to `@wbs/domain`; remaining
 * `service/` support: `dependency-graph.ts`. Delivery's side is not closed either:
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
