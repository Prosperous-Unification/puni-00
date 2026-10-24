import type { DependencyActivationReceipt } from '@wbs/contracts/dependency-runtime';

import type { DatabaseIdentity } from './backend-cohort';
import type { DependencyCapabilityObservation } from './dependency-capability';
import type { EnvName } from './env';
import type { SolverPins } from './solver-host';
import type { SourceDevInputObservation } from './source-dev-inputs';

export interface ActivationRecordReference {
  readonly name: string;
  readonly sha256: string;
}
interface ReceiptEntry {
  readonly environment: EnvName;
  readonly receipt: DependencyActivationReceipt;
}
interface ParticipantImage {
  readonly id: string;
  readonly image: string;
  readonly imageId: string;
}
/** Hash projections only. Source/configuration bodies and collector payloads never enter durable participant evidence. */
export interface CompleteDependencyParticipants {
  readonly format: 'complete-dependency-participants';
  readonly version: 1;
  readonly operation: 'activate-installed-dormant';
  readonly sourceSha: string;
  readonly ownerPublicationSha256: string;
  readonly selected: {
    readonly backend: ParticipantImage;
    readonly gateway: ParticipantImage;
    readonly source: {
      readonly id: string;
      readonly runtimeReference: string;
      readonly runtimeImageId: string;
      readonly manifestSha256: string;
      readonly environmentSha256: string;
    };
  };
  readonly capabilities: {
    readonly backendCandidate: DependencyCapabilityObservation;
    readonly backendRetained: DependencyCapabilityObservation;
    readonly gateway: DependencyCapabilityObservation;
    readonly source: SourceDevInputObservation['capabilities'];
  };
  readonly authorities: {
    readonly writerManifestSha256: string;
    readonly launchConfigurationSha256: string;
    readonly hostMachineIdSha256: string;
    readonly bootId: string;
    readonly filesSha256: string;
  };
  readonly solver: {
    readonly pins: SolverPins;
    readonly restorationIntent: ActivationRecordReference;
  };
  readonly databases: readonly (DatabaseIdentity & { readonly environment: EnvName })[];
  readonly fences: {
    readonly ingressSha256: string;
    readonly sourceSha256: string;
    readonly backendSha256: string;
    readonly gatewaySha256: string;
    readonly solverSha256: string;
  };
  readonly migrationManifestSha256: string;
}
/** Closed records produced only by the activation coordinator and its direct storage shell. */
export interface ActivationRecordByLabel {
  readonly participants: CompleteDependencyParticipants;
  readonly capture: {
    readonly format: 'dependency-activation-capture';
    readonly version: 1;
    readonly environment: EnvName;
    readonly databaseIdentity: string;
    readonly capture: ActivationRecordReference;
  };
  readonly backup: {
    readonly format: 'dependency-activation-backup';
    readonly version: 1;
    readonly environment: EnvName;
    readonly databaseIdentity: string;
    readonly snapshot: ActivationRecordReference & {
      readonly bytes: number;
      readonly migrations: readonly string[];
    };
    readonly captureSha256: string;
  };
  readonly intent: {
    readonly format: 'dependency-activation-intent';
    readonly version: 1;
    readonly environment: EnvName;
    readonly receipt: DependencyActivationReceipt;
    readonly participantRecord: ActivationRecordReference;
    readonly capture: ActivationRecordReference;
    readonly backup: ActivationRecordReference;
    readonly migrationManifestSha256: string;
  };
  readonly committed: {
    readonly format: 'dependency-activation-committed';
    readonly version: 1;
    readonly environment: EnvName;
    readonly receipt: DependencyActivationReceipt;
    readonly captureSha256: string;
    readonly migrationManifestSha256: string;
  };
  readonly 'fenced-complete': {
    readonly format: 'dependency-activation-fenced-complete';
    readonly version: 1;
    readonly activated: readonly ReceiptEntry[];
    readonly exposure: 'closed';
    readonly controllers: 'fenced';
  };
}
export type ActivationRecordLabel = keyof ActivationRecordByLabel;
