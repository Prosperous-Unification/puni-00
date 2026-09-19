import type { ProfilerOnRenderCallback } from 'react';

export interface WbsScrollProbe {
  recordHeightCalls: number;
  recordHeightMs: number;
  placeRowsCalls: number;
  placeRowsMs: number;
  reactCommits: number;
  reactCommitMs: number;
  ganttCommits: number;
  ganttCommitMs: number;
  anchorWrites: number;
  scrollLinkWrites: number;
}

declare global {
  interface Window {
    __wbsScrollProbe?: WbsScrollProbe;
  }
}

function probe(): WbsScrollProbe | undefined {
  return typeof window === 'undefined' ? undefined : window.__wbsScrollProbe;
}

export function scrollProbeStart(): number | null {
  return probe() === undefined ? null : performance.now();
}

export function recordScrollProbe(
  count: keyof Pick<
    WbsScrollProbe,
    'recordHeightCalls' | 'placeRowsCalls' | 'anchorWrites' | 'scrollLinkWrites'
  >,
  duration: keyof Pick<WbsScrollProbe, 'recordHeightMs' | 'placeRowsMs'> | null = null,
  started: number | null = null,
): void {
  const active = probe();
  if (active === undefined) return;
  active[count] += 1;
  if (duration !== null && started !== null) active[duration] += performance.now() - started;
}

export const recordWbsScrollCommit: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
  const active = probe();
  if (active === undefined) return;
  active.reactCommits += 1;
  active.reactCommitMs += actualDuration;
};

export const recordGanttScrollCommit: ProfilerOnRenderCallback = (
  _id,
  _phase,
  actualDuration,
) => {
  const active = probe();
  if (active === undefined) return;
  active.ganttCommits += 1;
  active.ganttCommitMs += actualDuration;
};
