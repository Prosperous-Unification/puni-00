import type {
  CapturedScheduleAsk,
  LiveScheduleAsk,
  ScheduleAsk,
  Scheduler,
  ScheduleRead,
} from '@wbs/core';

/** Builds a test scheduler whose captured read stays synchronous. */
export function capturedSchedulerFixture(
  readCaptured: (ask: CapturedScheduleAsk) => ScheduleRead,
  supports: Scheduler['supports'],
): Scheduler {
  function read(ask: CapturedScheduleAsk): ScheduleRead;
  function read(ask: LiveScheduleAsk): Promise<ScheduleRead>;
  function read(ask: ScheduleAsk): ScheduleRead | Promise<ScheduleRead> {
    const observed = readCaptured({ ...ask, mode: 'capture' });
    return ask.mode === 'live' ? Promise.resolve(observed) : observed;
  }
  return { supports, read };
}
