import type {
  HistoryStores,
  SavedPlanStore,
  StoredSavedPlanBytes,
  Stores,
  TransactionalStores,
  WriteStamp,
} from '@wbs/core';

import type { CaseId, HistoryAdmission, PortName } from './case-manifest';
import type { StepCatalogueFixture } from './step-catalogue-fixture';

export interface Gap {
  readonly caseId: CaseId;
  readonly reason: string;
  readonly evidence: {
    readonly sourceRevision: string;
    readonly assertion: string;
    readonly observedFailure: string;
  };
}

type FixtureCapability<Fixture> =
  | {
      readonly kind: 'offered';
      open(caseId: CaseId): Promise<Fixture>;
      readonly gaps: readonly Gap[];
    }
  | { readonly kind: 'absent'; readonly reason: string };

export type Capability<P> = FixtureCapability<CaseFixture<P>>;

export type Capabilities = {
  readonly [P in PortName]: FixtureCapability<
    P extends 'stepCatalogue' ? StepCatalogueFixture : CaseFixture<Stores[P]>
  >;
};

export interface SourceDeclaration {
  readonly name: string;
  readonly revision: string;
  readonly capabilities: Capabilities;
  readonly historyAdmission: HistoryAdmission;
}

export interface CaseFixture<P> {
  readonly fixtureId: string;
  readonly port: P;
  readonly journalAppender: Pick<Stores['journal'], 'append'>;
  readonly seed: SeededPlan;
  readonly readers: SourceReaders;
  readonly scenario: ScenarioControl;
  close(): Promise<void>;
}

export interface SeededPlan {
  readonly workPackageIds: readonly [string, string];
  readonly ownerIds: readonly [string, string];
  readonly stepIds: readonly [readonly [string, string], readonly [string, string]];
  readonly workItemIds: readonly [readonly [string, string], readonly [string, string]];
  readonly teamIds: readonly [string, string];
  readonly tagIds: readonly [string];
  readonly serviceIds: readonly [string];
  readonly typeIds: readonly [string];
  readonly externalSystemIds: readonly [string];
  readonly personIds: readonly [string, string];
  readonly stamps: readonly [WriteStamp, WriteStamp];
}

/** Stable cross-source identities used by every independently opened case. */
export const DETERMINISTIC_SEED: SeededPlan = {
  workPackageIds: ['work-package-a', 'work-package-b'],
  ownerIds: ['owner-a', 'owner-b'],
  stepIds: [
    ['step-a-dev', 'step-a-qa'],
    ['step-b-dev', 'step-b-qa'],
  ],
  workItemIds: [
    ['work-a-one', 'work-a-two'],
    ['work-b-one', 'work-b-two'],
  ],
  teamIds: ['team-a', 'team-b'],
  tagIds: ['tag-a'],
  serviceIds: ['service-a'],
  typeIds: ['type-a'],
  externalSystemIds: ['sys-jira-issue'],
  personIds: ['person-a', 'person-b'],
  stamps: [
    { at: 100, by: 'owner-a' },
    { at: 200, by: 'owner-b' },
  ],
};

/** Mixed-case owners that distinguish SQLite BINARY order from locale collation. */
export const TARGETED_ORDER_WORK_ITEM_IDS = ['work-A', 'work-a'] as const;

export interface PhaseBarrier {
  readonly entered: Promise<void>;
  release(): void;
}

export interface LateWriteEvidence {
  readonly savedPlan?: StoredSavedPlanBytes;
}

export interface CaptureDirectoryChange {
  readonly tag: Awaited<ReturnType<TransactionalStores['directory']['renameTag']>>;
  readonly person: Awaited<ReturnType<TransactionalStores['directory']['patchPerson']>>;
}

export type ScenarioControl =
  | { readonly kind: 'ordinary' }
  | {
      readonly kind: 'late-write';
      readonly point:
        'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';
      arm(): void;
      reached(): boolean;
      evidence(): LateWriteEvidence;
    }
  | {
      readonly kind: 'capture-interleave';
      readonly firstRead: PhaseBarrier;
      changeDirectory(): Promise<CaptureDirectoryChange>;
    }
  | {
      readonly kind: 'capture-typed-change';
      changeTypedDependencies(): Promise<void>;
    }
  | {
      readonly kind: 'competing-history-write';
      readonly rivalWriter: SavedPlanStore;
      readonly expectedRival: 'quota-refused' | 'snapshot_busy';
    }
  | {
      readonly kind: 'lease-revocation';
      /**
       * Ends every lease of `personId` at `at` as revoking the person's last
       * live credential does (`wbs-claim-leases` L8), through the source's own
       * revocation path; answers how many leases it ended.
       */
      endLeasesOf(personId: string, at: number): Promise<number>;
    }
  | {
      readonly kind: 'batch-settlement';
      begin(): Promise<void>;
      readonly entered: Promise<void>;
      settle(decision: 'commit' | 'rollback'): Promise<void>;
    };

export interface SourceReaders {
  readonly workPackages: Pick<Stores['workPackages'], 'findById' | 'stepsOf' | 'listFor'>;
  readonly workItems: Pick<Stores['workItems'], 'listByWorkPackage'>;
  readonly steps: Pick<Stores['steps'], 'listByWorkPackage'>;
  readonly estimates: Pick<Stores['estimates'], 'listByWorkPackage'>;
  readonly actuals: Pick<Stores['actuals'], 'listByWorkPackage'>;
  readonly measures: Pick<Stores['measures'], 'listByWorkPackage'>;
  readonly measureEstimates: Pick<Stores['measureEstimates'], 'listByWorkPackage'>;
  readonly budgets: Pick<Stores['budgets'], 'listByWorkPackage'>;
  readonly progress: Pick<Stores['progress'], 'listByWorkPackage'>;
  readonly dependencies: Pick<Stores['dependencies'], 'listByWorkPackage'>;
  readonly typedDependencies: Pick<Stores['typedDependencies'], 'listByWorkPackage'>;
  readonly directory: Pick<
    Stores['directory'],
    | 'listTags'
    | 'listTeams'
    | 'listPeople'
    | 'assignmentsFor'
    | 'assignmentsOf'
    | 'assignmentsInWorkPackage'
  >;
  readonly journal: Pick<Stores['journal'], 'entriesFor' | 'stateOf'>;
  readonly planEvents: Pick<Stores['planEvents'], 'listFor'>;
  readonly savedPlans: Pick<Stores['savedPlans'], 'readOf' | 'listOf' | 'principalsOf'>;
}

/** Writer authority is a source lifetime capability, outside CRUD store conformance. */
export type TransactionalPortName = Exclude<
  keyof TransactionalStores,
  'externalDependencyAuthoring'
>;
export type HistoryPortName = keyof HistoryStores;
