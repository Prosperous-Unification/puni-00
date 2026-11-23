import type { PlanDocumentService, PlanDocumentServiceOptions } from './plan-document.resource';

/**
 * What a host must supply to install {@link planDocumentModule}.
 *
 * The timestamp clock only. Export IO belongs to the required PlanExportReader;
 * serialization consumes complete detached evidence and does not resolve stores.
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
