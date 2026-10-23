import type {
  DeliveryAttempt,
  DeliveryExecution,
  DeliveryObservation,
  DeliverySource,
} from './observation';

/** Known measurements are exact; partial measurements have incomplete evidence; unknown is never zero. */
export interface DeliveryMeasurement {
  state: 'known' | 'partial' | 'unknown';
  milliseconds: number | null;
  reasons: string[];
}
export interface DeliveryAttemptTiming {
  source: DeliverySource;
  sumExecutionMs: DeliveryMeasurement;
  elapsedMs: DeliveryMeasurement;
  waiting: DeliveryMeasurement & { basis: 'attempt-start-to-execution-start' };
}
/**
 * Elapsed time spans the first performed start to the last performed completion,
 * including gaps between executions and attempts. Partial spans retain known
 * endpoints independently even when their matching endpoints are missing.
 * It is independent of summed work and waiting: adding these measurements
 * would count overlapping time again.
 */
export interface DeliveryTiming {
  sumExecutionMs: DeliveryMeasurement;
  elapsedMs: DeliveryMeasurement;
  attempts: DeliveryAttemptTiming[];
}

/** Sums performed work once, excluding carried and not-performed records; accepts validated observations. */
export function summarizeDeliveryTiming(observation: DeliveryObservation): DeliveryTiming {
  const attempts = observation.runs.flatMap((run) => run.attempts);
  const executions = attempts.flatMap((attempt) => attempt.executions);
  const reasons: string[] = [];
  if (observation.coverage.runs === 'partial') reasons.push('Run inventory is incomplete');
  if (observation.runs.some((run) => !run.attemptsComplete))
    reasons.push('Attempt inventory is incomplete');
  if (attempts.some((attempt) => !attempt.executionsComplete))
    reasons.push('Execution inventory is incomplete');
  return {
    ...measureExecutions(executions, reasons),
    attempts: attempts.map((attempt) => ({
      source: attempt.source,
      ...measureExecutions(
        attempt.executions,
        attempt.executionsComplete ? [] : ['Execution inventory is incomplete'],
      ),
      waiting: measureWaiting(attempt),
    })),
  };
}

/** Sums require paired endpoints; partial spans retain each independently observed bound. */
function measureExecutions(executions: DeliveryExecution[], inventoryReasons: string[]) {
  const reasons = [...inventoryReasons];
  const performed = executions.filter((execution) => execution.kind === 'performed');
  if (executions.some((execution) => execution.kind === 'unknown'))
    reasons.push('Execution attribution is unknown');
  const intervals = performed.flatMap((execution) => {
    if (execution.startedAt === null || execution.completedAt === null) return [];
    return [{ start: Date.parse(execution.startedAt), end: Date.parse(execution.completedAt) }];
  });
  if (intervals.length !== performed.length)
    reasons.push('Performed execution timing is incomplete');
  const sum = intervals.reduce((total, interval) => total + interval.end - interval.start, 0);
  const sumExecutionMs =
    intervals.length === 0 && reasons.length > 0 ? unknown(reasons) : measured(sum, reasons);
  const starts = performed.flatMap((execution) =>
    execution.startedAt === null ? [] : [Date.parse(execution.startedAt)],
  );
  const completions = performed.flatMap((execution) =>
    execution.completedAt === null ? [] : [Date.parse(execution.completedAt)],
  );
  const span = Math.max(...completions) - Math.min(...starts);
  // Proof: removing span < 0 returned partial -8000 ms in elapsed span stays unknown when sparse endpoints.
  const elapsedMs =
    starts.length === 0 || completions.length === 0 || span < 0
      ? unknown([...reasons, 'Observed endpoints do not establish an elapsed span'])
      : measured(span, reasons);
  return { sumExecutionMs, elapsedMs };
}

/** This is observed attempt waiting, not runner queue eligibility or queue duration. */
function measureWaiting(attempt: DeliveryAttempt): DeliveryAttemptTiming['waiting'] {
  const basis = 'attempt-start-to-execution-start';
  const performed = attempt.executions.filter((execution) => execution.kind === 'performed');
  const starts = performed.flatMap((execution) =>
    execution.startedAt === null ? [] : [Date.parse(execution.startedAt)],
  );
  if (attempt.startedAt === null || starts.length === 0)
    return { ...unknown(['Attempt start or performed execution start is unknown']), basis };
  const waiting = Math.min(...starts) - Date.parse(attempt.startedAt);
  if (waiting < 0)
    return { ...unknown(['Execution start predates the observed attempt start']), basis };
  const reasons: string[] = [];
  if (!attempt.executionsComplete) reasons.push('Execution inventory is incomplete');
  if (
    starts.length !== performed.length ||
    attempt.executions.some((execution) => execution.kind === 'unknown')
  )
    reasons.push('First performed execution start is uncertain');
  return { ...measured(waiting, reasons), basis };
}

function measured(milliseconds: number, reasons: string[]): DeliveryMeasurement {
  return { state: reasons.length === 0 ? 'known' : 'partial', milliseconds, reasons };
}

function unknown(reasons: string[]): DeliveryMeasurement {
  return { state: 'unknown', milliseconds: null, reasons };
}
