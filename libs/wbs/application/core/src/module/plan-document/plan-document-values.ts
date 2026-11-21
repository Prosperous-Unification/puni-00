import type { PlanDocument, PlanDocumentImport } from '@wbs/contracts';

import type { Clock } from '../../ports/clock';
import type { WorkPackage } from '../../ports/work-package-store';

/**
 * The work package an export writes: its settings and the zone its days are read
 * in, which the document carries as `settings.timezone` (`step-node-attempts` D5).
 */
export type ExportedWorkPackage = WorkPackage & { timezone: string };

/** The pure serializer borrows only its export timestamp clock. */
export interface PlanDocumentServiceOptions {
  clock: Pick<Clock, 'now'>;
}

/**
 * A plan export: the document, or the modeled refusal of a work package holding
 * uncoded steps, which names each one and the be-01 backfill `command` that
 * codes them, after which the export succeeds. Authored sparse parallelism
 * refuses export because version 9 cannot preserve it; uncoded steps take precedence.
 */
export type PlanDocumentExport =
  | { ok: true; value: PlanDocument }
  | { ok: false; error: 'unsupported_step_parallelism' }
  | {
      ok: false;
      error: 'uncoded_steps';
      steps: { id: string; name: string }[];
      command: string;
    };

export type PlanDocumentClassification =
  | { ok: true; value: PlanDocumentImport }
  | {
      ok: false;
      code: 'invalid_body' | 'invalid_typed_dependency' | 'unsupported_version';
      path: string;
    };
