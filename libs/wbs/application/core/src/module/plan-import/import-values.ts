import type {
  DocumentExternalMapping,
  DocumentV11TypedDependency,
  PlanDocumentImport,
} from '@wbs/contracts';
import type {
  AllowancePercent,
  AttemptOutcome,
  EstimateUnit,
  Hold,
  MeasureMetric,
  Readiness,
  ResourceKind,
  StepState,
  ThreePointEstimate as Estimate,
  TypedDependency,
} from '@wbs/domain';

import type { WorkItem } from '../../ports/work-item-values';

type DocumentRow = PlanDocumentImport['workItems'][number];
type DocumentDirectory = PlanDocumentImport['directory'];

export interface PreparedCapacity {
  teamFileId: string;
  size: number;
}

/** A resource the file states, matched by name against the target directory on import. */
export interface PreparedResource extends PreparedNamedEntry {
  kind: ResourceKind;
  unitLabel: string;
}

export interface PreparedMarker {
  fileId: string;
  date: string;
  name: string;
  color: string | null;
}

export interface PreparedStep {
  estimateUnit: EstimateUnit;
  fileId: string;
  name: string;
  position: number;
  allowancePercent: AllowancePercent;
  /**
   * The step code the imported step is written with: the file's own from
   * version 3. A version 1 or 2 document carries none, so each is suggested
   * from the name exactly as for a newly created step, in step order.
   */
  code: string;
}

export interface PreparedNamedEntry {
  fileId: string;
  name: string;
}

export interface PreparedTeam extends PreparedNamedEntry {
  serviceFileIds: string[];
}

export interface PreparedPerson extends PreparedNamedEntry {
  kind: DocumentDirectory['people'][number]['kind'];
  teamFileIds: string[];
}

export interface PreparedExternalRef extends PreparedNamedEntry {
  systemFileId: string;
  url: string;
}

export interface PreparedEstimate extends Estimate {
  stepFileId: string;
}

export interface PreparedActual {
  stepFileId: string;
  days: number;
}

export interface PreparedProgress {
  stepFileId: string;
  state: StepState;
}

export interface PreparedMeasure {
  stepFileId: string;
  metric: MeasureMetric;
  value: number;
}

export interface PreparedAssignment {
  stepFileId: string;
  personFileId: string;
}

/** One attempt a leaf is imported with, its executor resolved to the file's person. */
export interface PreparedAttempt {
  stepFileId: string;
  attemptNumber: number;
  startedAt: number;
  endedAt: number | null;
  outcome: AttemptOutcome | null;
  personFileId: string | null;
  reference: string | null;
  note: string | null;
}

export interface PreparedWorkItem {
  fileId: string;
  parentFileId: string | null;
  position: number;
  name: string;
  notes: string;
  frozenNumber: string | null;
  startNoEarlierThan: string | null;
  startNoEarlierThanReason: string | null;
  deadline: string | null;
  factStart: string | null;
  factEnd: string | null;
  readiness: Readiness | null;
  hold: Hold | null;
  priority: number | null;
  serviceTeamFileId: string | null;
  serviceFileId: string | null;
  maxParallel: number;
  teamFileIds: string[];
  tagFileIds: string[];
  serviceFileIds: string[];
  typeFileIds: string[];
  externalRefs: PreparedExternalRef[];
  isLeaf: boolean;
  estimates: PreparedEstimate[];
  actuals: PreparedActual[];
  progress: PreparedProgress[];
  measures: PreparedMeasure[];
  assignments: PreparedAssignment[];
  /** The leaf's attempts by number within each node; none on a parent or before version 7. */
  attempts: PreparedAttempt[];
}

export interface PreparedDependency {
  predecessorFileId: string;
  successorFileId: string;
}

export interface PreparedImport {
  stepBlockages: PlanDocumentImport['stepBlockages'];
  settings: PlanDocumentImport['settings'];
  capacity: PreparedCapacity[];
  priorityBands: PlanDocumentImport['priorityBands'];
  calendarMarkers: PreparedMarker[];
  steps: PreparedStep[];
  workItems: PreparedWorkItem[];
  dependencies: PreparedDependency[];
  typedDependencies: TypedDependency[];
  externalDependencies: {
    path: string;
    predecessor: Extract<DocumentV11TypedDependency['predecessor'], { kind: 'external' }>;
    destination: DocumentExternalMapping['destination'];
    successor: TypedDependency['successor'];
    type: TypedDependency['type'];
  }[];
  stepByFileId: ReadonlyMap<string, PreparedStep>;
  teamByFileId: ReadonlyMap<string, PreparedTeam>;
  personByFileId: ReadonlyMap<string, PreparedPerson>;
  tagByFileId: ReadonlyMap<string, PreparedNamedEntry>;
  serviceByFileId: ReadonlyMap<string, PreparedNamedEntry>;
  typeByFileId: ReadonlyMap<string, PreparedNamedEntry>;
  externalSystemByFileId: ReadonlyMap<string, PreparedNamedEntry>;
  resourceByFileId: ReadonlyMap<string, PreparedResource>;
  resourceCapacities: { resourceFileId: string; units: number }[];
  demands: { workItemFileId: string; resourceFileId: string; units: number }[];
}

export type ImportRefusalCode =
  | 'invalid_body'
  | 'invalid_typed_dependency'
  | 'unknown_ref'
  | 'cycle'
  | 'ancestor'
  | 'deadline_before_project_start'
  | 'engine_unavailable'
  | 'work_item_takes_one_type';

/** The complete file-id resolution, or the first fault in stable document order. */
export type ImportPreparation =
  | { ok: true; value: PreparedImport }
  | { ok: false; code: ImportRefusalCode; path: string; detail: string | null };

/**
 * Keeps document row identity and hierarchy intact for dependency admission.
 * Proof: replacing parentId with null made the production preparation ancestry case accept it.
 */
export function rowShape(row: DocumentRow): WorkItem {
  return {
    id: row.id,
    projectId: 'file',
    parentId: row.parentId,
    position: row.position,
    name: row.name,
    notes: row.notes,
    frozenNumber: row.frozenNumber,
    startNoEarlierThan: row.startNoEarlierThan,
    startNoEarlierThanReason: row.startNoEarlierThanReason,
    deadline: row.deadline,
    factStart: row.factStart,
    factEnd: row.factEnd,
    readiness: row.readiness,
    hold: row.hold,
    priority: row.priority,
    serviceTeamId: row.serviceTeamId,
    serviceId: row.serviceId,
    maxParallel: row.maxParallel,
    revision: 0,
  };
}

/**
 * Maps admitted file references without resolving them to stored repository IDs.
 * Proof: replacing serviceTeamFileId with null failed the production normalized-values assertion.
 */
export function preparedRow(
  row: DocumentRow,
): Omit<
  PreparedWorkItem,
  'isLeaf' | 'estimates' | 'actuals' | 'progress' | 'measures' | 'assignments' | 'attempts'
> {
  return {
    fileId: row.id,
    parentFileId: row.parentId,
    position: row.position,
    name: row.name,
    notes: row.notes,
    frozenNumber: row.frozenNumber,
    startNoEarlierThan: row.startNoEarlierThan,
    startNoEarlierThanReason: row.startNoEarlierThanReason,
    deadline: row.deadline,
    factStart: row.factStart,
    factEnd: row.factEnd,
    readiness: row.readiness,
    hold: row.hold,
    priority: row.priority,
    serviceTeamFileId: row.serviceTeamId,
    serviceFileId: row.serviceId,
    maxParallel: row.maxParallel,
    teamFileIds: row.teamIds,
    tagFileIds: row.tagIds,
    serviceFileIds: row.serviceIds,
    typeFileIds: row.typeIds,
    externalRefs: row.externalRefs.map((reference) => ({
      fileId: reference.id,
      systemFileId: reference.systemId,
      url: reference.url,
      name: reference.name,
    })),
  };
}
