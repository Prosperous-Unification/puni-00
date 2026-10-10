import { schedule } from '@wbs/domain';

import type {
  CapturedScheduleAsk,
  LiveScheduleAsk,
  ScheduleAsk,
  Scheduler,
  ScheduleRead,
} from '../ports/scheduler';

function readFast(ask: CapturedScheduleAsk): ScheduleRead;
function readFast(ask: LiveScheduleAsk): Promise<ScheduleRead>;
function readFast(ask: ScheduleAsk): ScheduleRead | Promise<ScheduleRead> {
  const scheduled: ScheduleRead =
    ask.enabled && ask.engine === 'optimized'
      ? { kind: 'engine_unavailable', error: 'engine_unavailable', engine: 'optimized' }
      : {
          kind: 'scheduled',
          fast: schedule(
            ask.input.rows,
            ask.input.edges,
            ask.input.slices,
            ask.input.notBefore,
            ask.input.poolSizes,
            ask.input.reach,
            ask.input.deadlines,
            ask.input.typed,
          ),
          optimization: null,
        };
  return ask.mode === 'live' ? Promise.resolve(scheduled) : scheduled;
}

/** Fast-only scheduler for source-neutral core service tests. */
export const fastScheduler: Scheduler = {
  supports: (engine) => engine === 'fast',
  read: readFast,
};
