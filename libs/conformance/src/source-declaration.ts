import type {
  HistoryStores,
  SavedPlanStore,
  Stores,
  TransactionalStores,
  WriteStamp,
} from '@wbs/core';

import type { CaseId, HistoryAdmission, PortName } from './case-manifest';

export interface Gap {
  readonly caseId: CaseId;
  readonly reason: string;
  readonly evidence: {
    readonly sourceRevision: string;
    readonly assertion: string;
    readonly observedFailure: string;
  };
}

export type Capability<P> =
  | {
      readonly kind: 'offered';
      open(caseId: CaseId): Promise<CaseFixture<P>>;
      readonly gaps: readonly Gap[];
    }
  | { readonly kind: 'absent'; readonly reason: string };

export type Capabilities = {
  readonly [P in PortName]: Capability<Stores[P]>;
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
  readonly seed: SeededPlan;
  readonly readers: SourceReaders;
  readonly scenario: ScenarioControl;
  close(): Promise<void>;
}

export interface SeededPlan {
  readonly projectIds: readonly [string, string];
  readonly ownerIds: readonly [string, string];
  readonly stepIds: readonly [readonly [string, string], readonly [string, string]];
  readonly workItemIds: readonly [readonly [string, string], readonly [string, string]];
  readonly teamIds: readonly [string, string];
  readonly personIds: readonly [string, string];
  readonly stamps: readonly [WriteStamp, WriteStamp];
}

export interface PhaseBarrier {
  readonly entered: Promise<void>;
  release(): void;
}

export type ScenarioControl =
  | { readonly kind: 'ordinary' }
  | {
      readonly kind: 'late-write';
      readonly point:
        'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';
      arm(): void;
      reached(): boolean;
    }
  | {
      readonly kind: 'capture-interleave';
      readonly firstRead: PhaseBarrier;
      changeDirectory(): Promise<void>;
    }
  | { readonly kind: 'competing-history-write'; readonly rivalWriter: SavedPlanStore }
  | {
      readonly kind: 'batch-settlement';
      begin(): Promise<void>;
      readonly entered: Promise<void>;
      settle(decision: 'commit' | 'rollback'): Promise<void>;
    };

export interface SourceReaders {
  readonly projects: Pick<Stores['projects'], 'findById' | 'stepsOf' | 'listFor'>;
  readonly workItems: Pick<Stores['workItems'], 'listByProject'>;
  readonly steps: Pick<Stores['steps'], 'listByProject'>;
  readonly estimates: Pick<Stores['estimates'], 'listByProject'>;
  readonly actuals: Pick<Stores['actuals'], 'listByProject'>;
  readonly measures: Pick<Stores['measures'], 'listByProject'>;
  readonly progress: Pick<Stores['progress'], 'listByProject'>;
  readonly dependencies: Pick<Stores['dependencies'], 'listByProject'>;
  readonly directory: Pick<
    Stores['directory'],
    | 'listTags'
    | 'listTeams'
    | 'listPeople'
    | 'assignmentsFor'
    | 'assignmentsOf'
    | 'assignmentsInProject'
  >;
  readonly journal: Pick<Stores['journal'], 'entriesFor' | 'stateOf'>;
  readonly planEvents: Pick<Stores['planEvents'], 'listFor'>;
  readonly savedPlans: Pick<Stores['savedPlans'], 'readOf' | 'listOf' | 'principalsOf'>;
}

export type TransactionalPortName = keyof TransactionalStores;
export type HistoryPortName = keyof HistoryStores;
