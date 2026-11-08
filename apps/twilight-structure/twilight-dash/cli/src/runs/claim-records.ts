import type { RuntimeBasis } from '@wbs/contracts';

import type {
  DispatchOwner,
  ExecutorKind,
  ExecutorLocator,
  Preparation,
  TurnRequest,
} from '../agents/execution-records';
import type {
  ArtifactDigest,
  ArtifactRef,
  AttemptId,
  ManifestDigest,
  RunId,
  WorkItemId,
} from './records';
import type { RuntimeAcceptance, RuntimeIntent, RuntimeScope } from './runtime-records';

/** Projection of independently retained, schema-validated WBS state bytes. */
export interface TargetObservation {
  readonly version: 1;
  readonly evidence: ArtifactRef;
  readonly scope: RuntimeScope;
  readonly ledgerId: string;
  readonly basis: RuntimeBasis;
  readonly workItemId: WorkItemId;
  readonly stepId: string;
  readonly stepCode: string;
}
export interface PreparationIntent {
  readonly version: 1;
  readonly preparation: Preparation;
  readonly manifestDigest: ManifestDigest;
  readonly selection: ExecutorLocator['selection'];
  readonly executor: { readonly kind: ExecutorKind; readonly version: string };
  readonly target: {
    readonly observation: TargetObservation;
    readonly parentClaimId: string | null;
  };
  readonly owner: DispatchOwner;
}
export type Attachment =
  | { readonly version: 1; readonly kind: 'opened'; readonly owner: DispatchOwner }
  | {
      readonly version: 1;
      readonly kind: 'reattached';
      readonly owner: DispatchOwner;
      readonly evidence: ArtifactRef;
    };
/** Receiver-generated receipt fields; request-known fields remain in the canonical intent. */
export interface ClaimProjection {
  readonly version: 1;
  readonly claimId: string;
  readonly actorId: string;
  readonly basisAfter: RuntimeBasis;
}
export interface ClaimBinding {
  readonly version: 1;
  readonly intent: RuntimeIntent;
  readonly acceptance: RuntimeAcceptance;
  readonly projection: ClaimProjection;
}
export interface ClaimRef {
  readonly version: 1;
  readonly commandId: string;
  readonly requestDigest: ArtifactDigest;
  readonly runId: RunId;
  readonly attemptId: AttemptId;
}
export interface TurnIntent {
  readonly version: 1;
  readonly locator: ExecutorLocator;
  readonly claim: ClaimRef;
  readonly grantCommandId: string;
  readonly request: TurnRequest;
}
export interface Located {
  readonly version: 1;
  readonly preparation: PreparationIntent;
  readonly locator: ExecutorLocator;
  readonly attachment: Attachment;
}
export interface Claimed {
  readonly version: 1;
  readonly session: Located;
  readonly binding: ClaimBinding;
}
