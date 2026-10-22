import type { ConnectedOptimizationStage, DependencyCalendarMissing } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

/** Detached materialization input; connected boundaries are captured before the target selection. */
export type OptimizationInput =
  | { readonly kind: 'local'; readonly input: ScheduleInput }
  | { readonly kind: 'connected'; readonly stage: ConnectedOptimizationStage };

/** One non-admitting observation; empty local stages never create a solver question. */
export type OptimizationCapture =
  | { readonly kind: 'scheduled'; readonly input: OptimizationInput; readonly enabled: boolean }
  | { readonly kind: 'idle'; readonly enabled: boolean }
  | { readonly kind: 'not_found' }
  | DependencyCalendarMissing
  | {
      readonly kind: 'unavailable';
      readonly reason: 'engine_unavailable' | 'cycle' | 'calendar_range';
    };
