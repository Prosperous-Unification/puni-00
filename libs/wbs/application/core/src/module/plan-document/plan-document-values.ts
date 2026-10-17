import type { PlanDocument, PlanDocumentImport } from '@wbs/contracts';

import type { CalendarMarkerReader } from '../../ports/calendar-marker-read';
import type { Clock } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type { Project } from '../../ports/project-store';
import type { StepParallelStore } from '../../ports/step-parallel-store';

/**
 * The project an export writes: its settings and the zone its days are read
 * in, which the document carries as `settings.timezone` (`step-node-attempts` D5).
 */
export type ExportedProject = Project & { timezone: string };

type PlanDirectory = Pick<
  DirectoryStore,
  | 'listInOrganization'
  | 'listTeams'
  | 'listPeople'
  | 'listTags'
  | 'listServices'
  | 'listWorkItemTypes'
  | 'listExternalSystems'
>;

export interface PlanDocumentServiceOptions {
  stepParallels: Pick<StepParallelStore, 'listByProject'>;
  directory: PlanDirectory;
  markers: CalendarMarkerReader;
  clock: Pick<Clock, 'now'>;
}

/**
 * A plan export: the document, or the modeled refusal of a project holding
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
