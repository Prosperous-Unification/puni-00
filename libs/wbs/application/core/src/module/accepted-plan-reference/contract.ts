import type {
  ActivePlanReference,
  AuthenticatedUser,
  HistoricalPlanReference,
} from '@wbs/contracts';
import type { ProjectOwnership } from '@wbs/domain';

import type { WritingServices } from '../../compose';
import type {
  AcceptedReferenceScope,
  AcceptedReferenceSelector,
  PlanReferencePolicy,
  RetainedPlanReference,
} from '../../ports/accepted-plan-reference-values';
import type { Clock } from '../../ports/clock';
import type { CommandAccess } from '../../ports/command-access';
import type { DependencyContext } from '../../ports/dependency-context';
import type { EditAdmission } from '../../ports/edit-admission';
import type { RefusedOrganizationAccess, ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import type { AcceptedPlanReferences } from './accepted-plan-reference.feature';
import type { OrdinaryCapture } from './accepted-plan-reference.resource';

export const ACCEPTED_PLAN_REFERENCE_LABEL = 'application.accepted-plan-reference';

export interface ReferenceComposition {
  uow: UnitOfWork;
  commandAccess: CommandAccess;
  batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    dependencies: DependencyContext,
  ) => Pick<WritingServices, 'workItems' | 'projects' | 'directory' | 'calendarMarkers'>;
}

export interface AcceptedPlanReferenceRequirements {
  source: ReferenceComposition;
  clock: Clock;
}

export interface AcceptedPlanReferenceExports {
  readonly acceptedPlanReferences: AcceptedPlanReferences;
}

export type ScopedAccess = Extract<ResourceAccess, { kind: 'scoped' }>;
export type ReferenceAddress = Pick<AcceptedReferenceScope, 'repository' | 'change'>;
export type Denied =
  | RefusedOrganizationAccess
  | { ok: false; error: 'forbidden' | 'insufficient_scope' | 'not_found' };

export interface ReferenceAccess {
  principal: AuthenticatedUser;
  expectedAccess: ResourceAccess;
}

export type ReferenceDecision<Value> =
  { commit: true; value: Value } | { commit: false; value: Value };

export type AdmittedAcceptance = Omit<RetainedPlanReference, 'lock'> & {
  lock: Pick<RetainedPlanReference['lock'], 'version' | 'referenceDigest'>;
};

/** Reference operations over one admitted WBS writer turn. */
export interface AdmittedReference {
  access: ScopedAccess;
  project: ProjectOwnership;
  address: AcceptedReferenceScope;
  readPolicy(): PlanReferencePolicy;
  readActive(): ActivePlanReference | null;
  readHistorical(selector: AcceptedReferenceSelector): HistoricalPlanReference | null;
  insert(acceptance: AdmittedAcceptance): void;
  captureOrdinary(exportedAt: number): Promise<OrdinaryCapture>;
}

export interface ReferenceTransaction {
  run<Value>(
    projectId: string,
    caller: ReferenceAccess,
    address: ReferenceAddress,
    permission: 'read' | 'write',
    act: (admitted: AdmittedReference) => Promise<ReferenceDecision<Value>>,
  ): Promise<Value | Denied>;
}
