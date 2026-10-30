import type { ResolvedScheduleInput } from './resolved-schedule-input';
import type { CapacityMode } from './stored-vocabularies';
import type { ScopedTypedDependency } from './typed-dependency';

/**
 * One project's optimization question over a captured reduced component.
 * Starts and finishes cover every component slice exactly: local values are
 * the movement/comparison origin, foreign values are fixed boundary evidence.
 * Original authored selectors survive reduction in relationships. Core owns
 * baseline feasibility and refuses empty local stages before asking a solver.
 */
export interface ConnectedOptimizationStage {
  readonly kind: 'connected-stage';
  readonly projectId: string;
  readonly mode: CapacityMode;
  readonly originOrdinal: number;
  readonly projects: readonly {
    readonly projectId: string;
    readonly rank: number;
    readonly anchorOrdinal: number | null;
  }[];
  readonly input: ResolvedScheduleInput;
  readonly relationships: readonly ScopedTypedDependency[];
  readonly starts: ReadonlyMap<string, number>;
  readonly finishes: ReadonlyMap<string, number>;
}
