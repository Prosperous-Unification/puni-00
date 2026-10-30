/** Captured projects whose surviving work has no calendar anchor. */
export interface DependencyCalendarMissing {
  readonly kind: 'dependency_calendar_missing';
  readonly projects: readonly {
    readonly projectId: string;
    readonly abbreviation: string;
    readonly name: string;
  }[];
}

/** An optimized connected placement could not be produced; no Fast dates are displayed. */
export interface ConnectedEngineUnavailable {
  readonly kind: 'engine_unavailable';
  readonly engine: 'optimized';
  readonly projects: readonly string[];
  readonly reason: 'adapter_missing' | 'connected_optimization_not_supported';
}

/** Why forecast placement is unavailable; null means placement is available. */
export type ScheduleError =
  null | 'cycle' | 'calendar_range' | DependencyCalendarMissing | ConnectedEngineUnavailable;
