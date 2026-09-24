import type { PlanDocumentService, PlanDocumentServiceOptions } from './plan-document.resource';

/**
 * What a host must supply to install {@link planDocumentModule}.
 *
 * Exactly {@link PlanDocumentServiceOptions}, unchanged by the move: the six
 * directory list reads, the owner-neutral marker read and the clock.
 *
 * **No K3 debt; K2 debt disclosed.** Plan document is a resource, so the
 * direction rule that binds it is K4, not K3: it reads the `DirectoryStore`
 * repository port and the neutral `CalendarMarkerReader`, never another
 * resource's file, and `ports/sideways-type-boundaries.test.ts` watches the
 * Calendar marker half. What this extraction does not close is delivery's
 * side: `http/project.routes.ts` still installs the module itself and hands it
 * the Calendar marker and Directory resources, a direct resource dependency
 * of delivery (K2) the backend module map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type PlanDocumentRequirements = PlanDocumentServiceOptions;

/** What installing {@link planDocumentModule} adds to a host graph. */
export interface PlanDocumentExports {
  readonly planDocuments: PlanDocumentService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.plan-document` and the label drops
 * the `module.` prefix.
 */
export const PLAN_DOCUMENT_LABEL = 'application.plan-document';
