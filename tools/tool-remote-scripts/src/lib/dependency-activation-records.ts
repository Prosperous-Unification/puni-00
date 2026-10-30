import type { DependencyActivationReceipt } from '@wbs/contracts/dependency-runtime';

import type { DatabaseIdentity } from './backend-cohort';
import type { DependencyCapabilityObservation } from './dependency-capability';
import type { DependencyParticipantRole } from './dependency-participant-preparation';
import type { ParticipantRestartPolicy } from './dependency-participant-transition';
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
  readonly 'participant-restore-intent': {
    readonly format: 'dependency-participant-restore-intent';
    readonly version: 1;
    readonly participants: ActivationRecordReference;
    readonly committed: readonly {
      readonly environment: EnvName;
      readonly record: ActivationRecordReference;
    }[];
    readonly solverIntent: ActivationRecordReference;
    readonly solverReady?: ActivationRecordReference;
    readonly selected: readonly {
      readonly role: DependencyParticipantRole;
      readonly id: string;
      readonly originalPolicy: ParticipantRestartPolicy;
      readonly snapshotSha256: string;
    }[];
  };
  readonly 'participant-start-intent': {
    readonly format: 'dependency-participant-start-intent';
    readonly version: 1;
    readonly restoration: ActivationRecordReference;
    readonly role: DependencyParticipantRole;
    readonly id: string;
  };
  readonly 'participant-ready': {
    readonly format: 'dependency-participant-ready';
    readonly version: 1;
    readonly restoration: ActivationRecordReference;
    readonly role: DependencyParticipantRole;
    readonly id: string;
    readonly readinessSha256: string;
  };
  readonly 'participant-policy-intent': {
    readonly format: 'dependency-participant-policy-intent';
    readonly version: 1;
    readonly ready: ActivationRecordReference;
    readonly role: DependencyParticipantRole;
    readonly id: string;
    readonly policySha256: string;
  };
  readonly 'participants-restored': {
    readonly format: 'dependency-participants-restored';
    readonly version: 1;
    readonly restoration: ActivationRecordReference;
    readonly activated: readonly ReceiptEntry[];
    readonly ready: readonly ActivationRecordReference[];
    readonly policies: readonly ActivationRecordReference[];
    readonly exposure: 'closed';
    readonly controllers: 'fenced';
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
