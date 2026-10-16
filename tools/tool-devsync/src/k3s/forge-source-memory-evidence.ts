import type { CgroupObservation } from './forge-process-observation';
import type { PodObservation } from './forge-recovery-check';

/** Explicit operator-supplied identity; matching observations cannot authenticate its origin. */
export interface SourceBinding {
  readonly uid: string;
  readonly container: string;
  readonly init: { readonly pid: number; readonly starttime: string };
  /** Exact cgroup-v2 membership path, as emitted by observeProcesses (without /sys/fs/cgroup). */
  readonly cgroup: string;
  readonly device: string;
  readonly inode: string;
}

export interface SourceMemoryEvidence {
  readonly source: SourceBinding;
  readonly samples: readonly CgroupObservation[];
}

const isCounter = (value: string): boolean => typeof value === 'string' && /^\d+$/.test(value);
const isNatural = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/**
 * Binds complete structured local samples to the expected first source container and supplied
 * init/cgroup identity. Throws on mismatch, incomplete metrics or a limit other than 2Gi.
 * The caller supplies observations from observeProcesses, not parsed external JSON. This
 * validates consistency, never the authenticity of the supplied binding, readiness, OOM cause
 * or F9 acceptance. Only declared evidence fields are copied; argv and caller verdicts cannot
 * enter the returned evidence. Historical text logs are not accepted by this interface.
 */
export function validateSourceMemory(
  samples: readonly CgroupObservation[],
  first: PodObservation,
  source: SourceBinding,
): SourceMemoryEvidence {
  // Proof: source-binding guard removal RETURNS EVIDENCE for co-mutated malformed binding/expected
  // identity negatives. Init shape is redundant with complete-process validation: removing BOTH
  // guards RETURNS EVIDENCE for co-mutated malformed init enforcement-path negatives.
  if (
    source.uid.length === 0 ||
    source.uid !== first.uid ||
    !/^containerd:\/\/[a-f0-9]{64}$/.test(source.container) ||
    source.container !== first.container ||
    !isNatural(source.init.pid) ||
    source.init.pid === 0 ||
    !isCounter(source.init.starttime) ||
    !source.cgroup.startsWith('/') ||
    source.cgroup
      .split('/')
      .slice(1)
      .some((segment) => segment === '' || segment === '.' || segment === '..') ||
    !isCounter(source.device) ||
    !isCounter(source.inode)
  )
    throw new Error('invalid first source binding');
  // Proof: sample-count guard removal fails the empty-samples negative.
  if (samples.length === 0) throw new Error('source memory requires a complete sample');
  const observations = samples.map((sample): CgroupObservation => {
    // Proof: exact-cgroup guard removal credits sibling/prefix paths and changed device/inode negatives.
    if (
      sample.cgroup !== source.cgroup ||
      sample.device !== source.device ||
      sample.inode !== source.inode
    )
      throw new Error('source cgroup identity mismatch');
    // Proof: init-member guard removal credits absent/replacement PID and reused-starttime negatives.
    if (
      !sample.processes.some(
        (process) => process.pid === source.init.pid && process.starttime === source.init.starttime,
      )
    )
      throw new Error('source init member absent or reused');
    // Proof: memory-limit guard removal credits missing, unlimited, malformed and non-2Gi max negatives.
    if (sample.memory.max !== '2147483648')
      throw new Error('source memory limit must be exactly 2Gi');
    // Proof: completeness guard removal credits missing current/peak/events/RSS and invalid counts/time negatives.
    if (
      !Number.isFinite(Date.parse(sample.sampledAt)) ||
      !Number.isFinite(sample.elapsedMs) ||
      sample.elapsedMs < 0 ||
      !isCounter(sample.memory.current) ||
      !isCounter(sample.memory.peak) ||
      !Object.hasOwn(sample.memory.events, 'oom') ||
      !Object.hasOwn(sample.memory.events, 'oom_kill') ||
      Object.entries(sample.memory.events).some(
        ([name, count]) => !/^[a-z_]+$/.test(name) || !isCounter(count),
      ) ||
      sample.processes.some(
        (process) =>
          !isNatural(process.pid) ||
          process.pid === 0 ||
          !isCounter(process.starttime) ||
          !isNatural(process.ppid) ||
          !isNatural(process.rssKiB) ||
          !isNatural(process.threads) ||
          !/^[a-zA-Z0-9._+-]{1,256}$/.test(process.executable) ||
          !['vite', 'nx', 'unknown'].includes(process.role),
      ) ||
      new Set(sample.processes.map((process) => process.pid)).size !== sample.processes.length
    )
      throw new Error('source memory requires a complete sample');
    return {
      sampledAt: sample.sampledAt,
      elapsedMs: sample.elapsedMs,
      cgroup: sample.cgroup,
      device: sample.device,
      inode: sample.inode,
      memory: {
        current: sample.memory.current,
        peak: sample.memory.peak,
        max: sample.memory.max,
        events: { ...sample.memory.events },
      },
      processes: sample.processes.map((process) => ({
        pid: process.pid,
        starttime: process.starttime,
        ppid: process.ppid,
        executable: process.executable,
        role: process.role,
        rssKiB: process.rssKiB,
        threads: process.threads,
      })),
    };
  });
  // Proof: returning caller fields by spread fails the credential argv/injected restored-success negative.
  return {
    source: {
      uid: source.uid,
      container: source.container,
      init: { pid: source.init.pid, starttime: source.init.starttime },
      cgroup: source.cgroup,
      device: source.device,
      inode: source.inode,
    },
    samples: observations,
  };
}
