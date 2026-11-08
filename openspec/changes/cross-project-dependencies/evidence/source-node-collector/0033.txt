import type {
  CompleteActivationTransports,
  CompleteDependencyActivationCompletion,
} from './complete-dependency-exclusion';
import type { CompleteDependencyParticipants } from './dependency-activation-records';
import type { activateDependencyStores } from './dependency-activation-storage';
import type { CompleteDependencyActivationRequest } from './dependency-complete-activation';
import type { scanMigrationArtifact } from './dependency-migration-artifact-scanner';
import type { ParticipantSnapshot } from './dependency-participant-transition';
import type { DependencyOwner } from './edge-ownership';
import type { EdgePolicySnapshot, EdgeRecordSnapshot } from './edge-policy';
import type { InstalledAuthorityObservation } from './installed-authorities';
import type { captureParkedDependencies } from './parked-dependencies';
import type { SolverLayouts } from './solver-exclusion';
import type { RetainedSolverRestoration } from './solver-restoration';
import type { SourceDevRestartInputs } from './source-dev-inputs';

export type DependencyParticipantRole = 'backend' | 'gateway' | 'source';
/** Private actual observations retained by the activation core. This type has no constructor or authority decoder. */
export interface ParticipantRestorationContext {
  readonly owner: DependencyOwner;
  readonly layouts: SolverLayouts;
  readonly request: CompleteDependencyActivationRequest;
  readonly deadline: number;
  readonly directory: string;
  readonly attempt: string;
  readonly ports: CompleteActivationTransports;
  readonly originalPolicy: EdgePolicySnapshot;
  readonly pending: EdgeRecordSnapshot;
  readonly originals: Readonly<Record<DependencyParticipantRole, ParticipantSnapshot>>;
  readonly parkedInventory: readonly unknown[];
  readonly parked: Awaited<ReturnType<typeof captureParkedDependencies>>;
  readonly solverIntent: RetainedSolverRestoration;
  readonly authorities: InstalledAuthorityObservation;
  readonly observeAuthorities: () => Promise<InstalledAuthorityObservation>;
  readonly source: SourceDevRestartInputs;
  readonly artifact: Awaited<ReturnType<typeof scanMigrationArtifact>>;
  readonly storage: Awaited<ReturnType<typeof activateDependencyStores>>;
  readonly participants: CompleteDependencyParticipants;
}
/** Minted only after activation's physical finalizers and retained fenced-complete readback succeeded. */
export interface FinalizedParticipantRestorationContext extends ParticipantRestorationContext {
  readonly completion: CompleteDependencyActivationCompletion;
  readonly fencedComplete: EdgeRecordSnapshot;
}
