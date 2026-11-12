import type { LegacyQueueStatus } from '../resources/legacy-lock';
import type { HostPoolStatus } from '../resources/runtime';

const GIB = 1024 ** 3;

/** What a live job's run record sampled so far, as `ops job status` prints it. */
export interface JobPeak {
  /** The largest `memory.peak` sampled, bytes; null before any counter was read. */
  memoryBytes: number | null;
  /** The largest `memory.events high` sampled: above zero, the scope is throttled. */
  memoryHighEvents: number;
}

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
 * `ops job status` (`dash-host-jobs` J13): the pool line, each unreleased job (`calibration`
 * first for a calibration run, J9; type, label, pid,
 * age, envelope, peak so far, units held, settlement state), then each waiter oldest first (age,
 * budget left, overtake count). `peaks` maps a job id to its run record's {@link JobPeak}; a
 * job with no record or no counter reads `peak unmeasured`, and one whose scope sampled
 * `memory.events high` above zero reads `throttled (memory.events high <n>)` after its peak.
 * The pool line names the mode and, in concurrent mode, the singleton guard and its holder; a
 * live `switch-mode` gets a line of its own. `legacy`, while the shell lock matters (observe mode, or the guard on), follows verbatim
 * as `bin/with-heavy-lock.sh status` prints it, holder first (J12, J13).
 */
export function formatHostPoolStatus(
  status: HostPoolStatus,
  peaks: ReadonlyMap<string, JobPeak>,
  now: number,
  legacy: LegacyQueueStatus | null,
  holdDirectory: string,
): string[] {
  const { allocatable, reserved } = status;
  const holder = status.guardHolder;
  const guard =
    status.mode === 'observe'
      ? ''
      : status.guard === 'released'
        ? ', guard released'
        : `, guard on (${holder === null ? 'not held' : `held by pid ${String(holder.pid)}${holder.live ? '' : ', gone'}`})`;
  const lines = [
    `host pool ${status.enrollmentId}: mode ${status.mode}${guard}; allocatable ${String(allocatable.cpuCores)} cores, ${String(allocatable.memoryGib)} GiB, ${String(allocatable.diskUnits)} disk units, ${String(allocatable.workspaceSlots)} slots; reserved ${String(reserved.cpuCores)} cores, ${String(reserved.memoryGib)} GiB, ${String(reserved.diskUnits)} disk units, ${String(reserved.workspaceSlots)} slots`,
  ];
  const fence = status.switching;
  if (fence?.live === true)
    lines.push(
      `switching to ${fence.target} by ${fence.operator} pid ${String(fence.pid)} age ${formatSpan(now - fence.since)}; intake stopped`,
    );
  // Proof: without it `a stray file in the legacy hold directory stops concurrent admission`
  // (host-pool-mode.test.ts) found no line naming it in status (2026-11-02, review H7).
  if (status.holdCorruption !== null)
    lines.push(
      `hold corruption: ${status.holdCorruption}, which Dash did not write; concurrent admission refuses until it is checked and removed, then resources sweep`,
    );
  if (status.jobs.length === 0) lines.push('running none');
  for (const job of status.jobs) {
    const { envelope } = job.descriptor;
    // Proof: dropping the peak (`peak unmeasured`) failed `one running, one waiting: the gate
    // with its tree and peak, then the build` (status.test.ts) on the running line (2026-11-01).
    const sampled = peaks.get(job.id);
    const peak = sampled?.memoryBytes ?? null;
    const highEvents = sampled?.memoryHighEvents ?? 0;
    // Proof: never printing the marker failed `a throttled job says so beside its peak`
    // (status.test.ts) on the running line (2026-11-12).
    const throttled = highEvents > 0 ? ` throttled (memory.events high ${String(highEvents)})` : '';
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
      `running ${job.calibration === true ? 'calibration ' : ''}${job.descriptor.id} ${job.label} pid ${job.process === null ? '-' : String(job.process.pid)} age ${formatSpan(now - (job.startedAt ?? job.admittedAt))} envelope ${String(envelope.cpuCores)} cores ${String(envelope.memoryGib)} GiB ${String(envelope.tmpDiskGib)} GiB tmp peak ${peak === null ? 'unmeasured' : `${(peak / GIB).toFixed(1)} GiB`}${throttled} units ${units} settlement ${job.state} (${entries})${job.launchFailure === undefined ? '' : `; ${job.launchFailure}`}${job.guardLost === undefined ? '' : `; singleton guard (pid ${job.guardLost.holderPid === null ? 'unrecorded' : String(job.guardLost.holderPid)}) lost ${formatSpan(now - job.guardLost.at)} ago`}`,
    );
  }
  if (status.waiters.length === 0) lines.push('waiting none');
  for (const waiter of status.waiters)
    lines.push(
      `waiting ${waiter.calibration ? 'calibration ' : ''}${waiter.type} ${waiter.label} pid ${String(waiter.pid)} age ${formatSpan(now - waiter.arrivedAt)} budget ${formatSpan(waiter.deadline - now)} overtakes ${String(waiter.overtakes)}`,
    );
  if (legacy !== null) {
    lines.push(...legacy.lines);
    // A Dash hold left behind is ended by removing its hold file (review H1): say which file and
    // who removes it, since only the operator can when no `watch` runs.
    const holder = legacy.holder;
    const held =
      holder.kind !== 'held'
        ? null
        : holder.label === 'dash-switch-mode'
          ? 'dash-switch-mode'
          : (/^dash-job-([0-9a-f-]{36})(?: |$)/.exec(holder.label)?.[1] ?? null);
    // Proof: without it `status names a Dash hold's file and its remedy`
    // (host-pool-mode.test.ts) printed the holder line alone (2026-11-02, review H1).
    if (held !== null)
      lines.push(
        `note: the shell lock is held for Dash through ${holdDirectory}/${held}; it ends when that file goes: the launcher removes it at settlement, resources watch once the work settles, or run resources sweep`,
      );
  }
  return lines;
}
