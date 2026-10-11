import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type ControlEvidence = { kind: 'available' } | { kind: 'unavailable'; reason: string };

export interface WorkerCapabilityEvidence {
  namespaceProbe: ControlEvidence;
  cgroupDelegation: ControlEvidence;
  appArmorProfile: ControlEvidence;
  fdMountSupport: ControlEvidence;
}

export type WorkerCapability = { kind: 'available' } | { kind: 'unavailable'; reasons: string[] };

/**
 * Reports all required controls; no single successful probe grants worker execution.
 * Proof: capability.test.ts removes cgroup/AppArmor/namespace/FD-mount evidence independently
 * and observes named unavailable results despite the other controls being available.
 */
export function assessWorkerCapability(evidence: WorkerCapabilityEvidence): WorkerCapability {
  const reasons = (
    [
      ['namespace-probe', evidence.namespaceProbe],
      ['cgroup-delegation', evidence.cgroupDelegation],
      ['apparmor-profile', evidence.appArmorProfile],
      ['fd-mount-support', evidence.fdMountSupport],
    ] as const
  ).flatMap(([name, control]) =>
    control.kind === 'unavailable' ? [`${name}: ${control.reason}`] : [],
  );
  return reasons.length === 0 ? { kind: 'available' } : { kind: 'unavailable', reasons };
}

function inspectNamespaces(): ControlEvidence {
  const probe = spawnSync(
    '/usr/bin/timeout',
    [
      '5',
      '/usr/bin/bwrap',
      '--unshare-user',
      '--unshare-pid',
      '--unshare-ipc',
      '--unshare-uts',
      '--unshare-cgroup',
      '--unshare-net',
      '--die-with-parent',
      '--new-session',
      '--cap-drop',
      'ALL',
      '--ro-bind',
      '/',
      '/',
      '--',
      '/bin/true',
    ],
    { encoding: 'utf8', timeout: 6000, env: { PATH: '/usr/bin:/bin' } },
  );
  if (probe.error) return { kind: 'unavailable', reason: probe.error.message };
  if (probe.status !== 0)
    return {
      kind: 'unavailable',
      reason: `inert Bubblewrap probe exit ${String(probe.status)}: ${probe.stderr.trim()}`,
    };
  return { kind: 'available' };
}

function inspectCgroupDelegation(): ControlEvidence {
  try {
    const membership = readFileSync('/proc/self/cgroup', 'utf8')
      .split('\n')
      .find((line) => line.startsWith('0::'));
    if (!membership) return { kind: 'unavailable', reason: 'cgroup v2 membership absent' };
    const scope = membership.slice(3);
    if (!scope.startsWith('/') || scope.includes('..'))
      return { kind: 'unavailable', reason: 'cgroup v2 membership malformed' };
    const controls = readFileSync(`/sys/fs/cgroup${scope}/cgroup.subtree_control`, 'utf8')
      .trim()
      .split(/\s+/);
    if (!controls.includes('cpu') || !controls.includes('memory') || !controls.includes('pids'))
      return {
        kind: 'unavailable',
        reason: 'cpu/memory/pids controllers not delegated to this scope',
      };
    // Read-only inspection cannot prove a writable quota-enforced child subtree.
    return { kind: 'unavailable', reason: 'quota-enforced delegated subtree not verified' };
  } catch (failure) {
    return {
      kind: 'unavailable',
      reason: `cgroup delegation unreadable: ${failure instanceof Error ? failure.message : String(failure)}`,
    };
  }
}

function inspectAppArmor(): ControlEvidence {
  try {
    const profile = readFileSync('/proc/self/attr/current', 'utf8').trim();
    if (profile === 'unconfined') return { kind: 'unavailable', reason: 'unconfined' };
    // A profile name alone does not prove the pinned candidate-denial policy.
    return {
      kind: 'unavailable',
      reason: `profile ${profile} is not attested against pinned policy`,
    };
  } catch (failure) {
    return {
      kind: 'unavailable',
      reason: `AppArmor profile unreadable: ${failure instanceof Error ? failure.message : String(failure)}`,
    };
  }
}

/** Read-only host inspection. Its result is reporting, never a dispatch token. */
export function inspectWorkerCapability(): WorkerCapability {
  return assessWorkerCapability({
    namespaceProbe: inspectNamespaces(),
    cgroupDelegation: inspectCgroupDelegation(),
    appArmorProfile: inspectAppArmor(),
    fdMountSupport: {
      kind: 'unavailable',
      reason: 'exact-profile FD and mount sentinels have not run',
    },
  });
}
