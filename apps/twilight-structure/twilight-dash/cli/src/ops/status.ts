import type { HostPoolStatus } from '../resources/runtime';

const GIB = 1024 ** 3;

/** `1h02m`, `3m05s` or `45s`; a negative span reads `0s`. */
export function formatSpan(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${String(hours)}h${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${String(minutes)}m${String(rest).padStart(2, '0')}s`;
  return `${String(rest)}s`;
}

/**
 * `ops job status` (`dash-host-jobs` J13): the pool line, each unreleased job (type, label, pid,
 * age, envelope, peak so far, units held, settlement state), then each waiter oldest first (age,
 * budget left, overtake count). `peaks` maps a job id to the largest `memory.peak` its run
 * record sampled; a job with none reads `peak unmeasured`.
 */
export function formatHostPoolStatus(
  status: HostPoolStatus,
  peaks: ReadonlyMap<string, number | null>,
  now: number,
): string[] {
  const { allocatable, reserved } = status;
  const lines = [
    `host pool ${status.enrollmentId}: mode ${status.mode}; allocatable ${String(allocatable.cpuCores)} cores, ${String(allocatable.memoryGib)} GiB, ${String(allocatable.diskUnits)} disk units, ${String(allocatable.workspaceSlots)} slots; reserved ${String(reserved.cpuCores)} cores, ${String(reserved.memoryGib)} GiB, ${String(reserved.diskUnits)} disk units, ${String(reserved.workspaceSlots)} slots`,
  ];
  if (status.jobs.length === 0) lines.push('running none');
  for (const job of status.jobs) {
    const { envelope } = job.descriptor;
    // Proof: dropping the peak (`peak unmeasured`) failed `one running, one waiting: the gate
    // with its tree and peak, then the build` (status.test.ts) on the running line (2026-11-01).
    const peak = peaks.get(job.id) ?? null;
    const units =
      job.units.length === 0
        ? 'none'
        : job.units.map((unit) => `${unit.exclusiveId}=${unit.path}`).join(' ');
    const entries = [
      `compute ${job.compute.state}`,
      `tmp ${job.tmpDisk.state}`,
      ...job.units.map((unit) => `${unit.exclusiveId} ${unit.state}`),
    ].join(', ');
    lines.push(
      `running ${job.descriptor.id} ${job.label} pid ${job.process === null ? '-' : String(job.process.pid)} age ${formatSpan(now - (job.startedAt ?? job.admittedAt))} envelope ${String(envelope.cpuCores)} cores ${String(envelope.memoryGib)} GiB ${String(envelope.tmpDiskGib)} GiB tmp peak ${peak === null ? 'unmeasured' : `${(peak / GIB).toFixed(1)} GiB`} units ${units} settlement ${job.state} (${entries})${job.launchFailure === undefined ? '' : `; ${job.launchFailure}`}`,
    );
  }
  if (status.waiters.length === 0) lines.push('waiting none');
  for (const waiter of status.waiters)
    lines.push(
      `waiting ${waiter.type} ${waiter.label} pid ${String(waiter.pid)} age ${formatSpan(now - waiter.arrivedAt)} budget ${formatSpan(waiter.deadline - now)} overtakes ${String(waiter.overtakes)}`,
    );
  return lines;
}
