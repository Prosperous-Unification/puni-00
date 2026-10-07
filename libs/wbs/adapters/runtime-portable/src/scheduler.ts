import type {
  CapturedScheduleAsk,
  FastScheduler,
  LiveScheduleAsk,
  OptimizedScheduleAdapter,
  OptimizedScheduleAsk,
  OptimizedScheduleRead,
  ScheduleAsk,
  Scheduler,
  ScheduleRead,
} from '@wbs/core';
import { type Elsewhere, SOLVER_OBJECTIVES } from '@wbs/domain';

/** A canonical input with no bookings elsewhere states none. */
const NOWHERE: Elsewhere = new Map();

/** Builds the synchronous scheduler view over installed runtime adapters. */
export function createScheduler(
  fast: FastScheduler,
  optimized?: OptimizedScheduleAdapter,
): Scheduler {
  function read(ask: CapturedScheduleAsk): ScheduleRead;
  function read(ask: LiveScheduleAsk): Promise<ScheduleRead>;
  function read(ask: ScheduleAsk): ScheduleRead | Promise<ScheduleRead> {
    return ask.mode === 'capture'
      ? readSchedule(fast, optimized, ask)
      : readSchedule(fast, optimized, ask);
  }
  return {
    supports: (engine) => engine === 'fast' || optimized !== undefined,
    read,
  };
}

function readSchedule(
  fast: FastScheduler,
  optimized: OptimizedScheduleAdapter | undefined,
  ask: CapturedScheduleAsk,
): ScheduleRead;
function readSchedule(
  fast: FastScheduler,
  optimized: OptimizedScheduleAdapter | undefined,
  ask: LiveScheduleAsk,
): Promise<ScheduleRead>;
function readSchedule(
  fast: FastScheduler,
  optimized: OptimizedScheduleAdapter | undefined,
  ask: ScheduleAsk,
): ScheduleRead | Promise<ScheduleRead> {
  // Proof: removing this guard returned a scheduled Fast plan instead of
  // engine_unavailable in scheduler.test.ts; Fast ran before the assertion.
  if (ask.enabled && ask.engine === 'optimized' && optimized === undefined) {
    const unavailable = {
      kind: 'engine_unavailable' as const,
      error: 'engine_unavailable' as const,
      engine: 'optimized' as const,
    };
    return ask.mode === 'live' ? Promise.resolve(unavailable) : unavailable;
  }

  const fastSchedule = fast(
    ask.input.rows,
    ask.input.edges,
    ask.input.slices,
    ask.input.notBefore,
    ask.input.poolSizes,
    ask.input.reach,
    // Proof: dropping this seventh argument removed the literal
    // Map { "leaf" => 9 } from both recorded Fast calls in scheduler.test.ts.
    ask.input.deadlines,
    // The eighth: typed dependencies, resolved beside the legacy edges.
    ask.input.typed,
    // The ninth: bookings elsewhere, absent for every plan nothing outranks.
    // Proof: `NOWHERE` here made `hands the bookings elsewhere to Fast` in
    // scheduler.test.ts see an empty map; watched 2026-09-29.
    ask.input.elsewhere ?? NOWHERE,
  );
  if (optimized === undefined) {
    const scheduled = { kind: 'scheduled' as const, fast: fastSchedule, optimization: null };
    return ask.mode === 'live' ? Promise.resolve(scheduled) : scheduled;
  }

  const optimizationAsk: OptimizedScheduleAsk = {
    projectId: ask.projectId,
    objective: ask.objective,
    input: ask.input,
    enabled: ask.enabled,
  };
  if (ask.mode === 'live')
    return optimized.readLive(optimizationAsk).then((optimization) => {
      // Proof: omitting this live guard accepted a ready PRI variant with no
      // schedule in the malformed optimized-reader test.
      assertReadySchedules(optimization);
      return { kind: 'scheduled' as const, fast: fastSchedule, optimization };
    });
  const optimization = optimized.readCaptured(optimizationAsk);
  // Proof: removing this check let a ready PRI variant with a null schedule
  // return `kind: scheduled` in scheduler.test.ts instead of throwing.
  assertReadySchedules(optimization);
  return { kind: 'scheduled', fast: fastSchedule, optimization };
}

function assertReadySchedules(read: OptimizedScheduleRead): void {
  for (const objective of SOLVER_OBJECTIVES) {
    if (read.variants[objective].state === 'ready' && read.schedules[objective] === null) {
      throw new Error(`optimized scheduler reported ready without a ${objective} schedule`);
    }
  }
}
