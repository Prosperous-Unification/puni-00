import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PodObservation } from './forge-recovery-check';

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected JSON object');
  // JSON/object boundary is checked above; individual fields are validated by their consumers.
  return value as Record<string, unknown>;
}
function readText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('expected nonempty string');
  return value;
}
function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error('expected nonnegative integer');
  return value;
}

/** Missing container status is a modeled startup state; malformed present status fails closed. */
export function observePod(value: unknown): PodObservation | null {
  const pod = readObject(value);
  const status = readObject(pod['status']);
  if (status['containerStatuses'] === undefined) return null;
  if (!Array.isArray(status['containerStatuses']))
    throw new Error('expected containerStatuses array');
  const source = status['containerStatuses']
    .map(readObject)
    .find((container) => container['name'] === 'source');
  if (source === undefined) throw new Error('source container missing from present status');
  if (source['containerID'] === undefined) return null;
  if (typeof source['ready'] !== 'boolean') throw new Error('source ready is not boolean');
  const previous = readObject(source['lastState']);
  const state = readObject(source['state']);
  const terminated = [previous['terminated'], state['terminated']]
    .filter((termination) => termination !== undefined)
    .map(readObject);
  return {
    uid: readText(readObject(pod['metadata'])['uid']),
    container: readText(source['containerID']),
    restarts: readCount(source['restartCount']),
    ready: source['ready'],
    // Proof: ignoring current OOM fails its snapshot test; treating Error/137 as OOM fails the deliberate SIGKILL test.
    oom: terminated.some((termination) => termination['reason'] === 'OOMKilled'),
  };
}

export type RecoveryCommandRunner = (
  command: readonly string[],
  name: string,
  timeoutMs?: number,
) => Promise<string>;

/** Inventory is read-only; even a completely empty inventory is never a creation receipt. */
export async function inspectRecoveryLab(
  command: RecoveryCommandRunner,
  lab: string,
): Promise<void> {
  const inventory: string[] = [];
  for (const kind of ['container', 'network', 'volume']) {
    const args = ['docker', kind, 'ls', '-q', '--filter', `label=puni.dev/lab-id=${lab}`];
    if (kind === 'container') args.push('--all');
    inventory.push((await command(args, `inventory-${kind}`)).trim());
  }
  // Proof: seeded labelled container/network/volume fixtures are refused unchanged without down.
  if (inventory.some((listed) => listed !== ''))
    throw new Error('lab already has resources; refusing adoption');
}

/**
 * Automatic creation and teardown are unavailable until tool-fleet returns resource creation
 * receipts. A preflight snapshot or cooperating-only lock cannot authorize deletion of resources
 * that appear between inventory and creation. This entry point always fails before mutation.
 */
export async function runRecoveryLab(_arguments: readonly string[]): Promise<never> {
  await Promise.resolve();
  // Proof: the post-inventory raced-network command fixture remains untouched and this CLI refuses.
  throw new Error('automatic lab up/down disabled: tool-fleet creation receipts required');
}

/** Inspect the owning node and refuse every foreign or non-PID1 target before issuing SIGKILL. */
export async function killRecoveryPid1(
  command: RecoveryCommandRunner,
  node: string,
  pod: PodObservation,
): Promise<void> {
  if (!/^containerd:\/\/[a-f0-9]+$/.test(pod.container))
    throw new Error('invalid container identity');
  const identity = readObject(
    JSON.parse(
      await command(
        ['docker', 'exec', node, 'crictl', 'inspect', pod.container.slice(13)],
        'container-inspect',
      ),
    ),
  );
  const status = readObject(identity['status']);
  // Proof: the foreign-UID command fixture observes no kill; removing this guard issues one.
  if (readObject(status['labels'])['io.kubernetes.pod.uid'] !== pod.uid)
    throw new Error('node container belongs to foreign UID');
  const pid = readCount(readObject(identity['info'])['pid']);
  // Proof: node PID zero/one fixtures observe no kill; removing this guard reaches the kill command.
  if (pid <= 1) throw new Error('node PID must be greater than one');
  const proc = await command(
    ['docker', 'exec', node, 'cat', `/proc/${String(pid)}/status`],
    'pid-status',
  );
  // Proof: a node process whose final NSpid is two is refused before the boundary kill.
  if (!/^NSpid:\s+.*\b1$/m.test(proc)) throw new Error('target is not container PID1');
  await command(['docker', 'exec', node, 'kill', '-9', String(pid)], 'kill-pid1');
}

export interface CleanupObservation {
  readonly lab: string;
  readonly namespace: string;
  readonly kubeconfig: string;
  readonly context: string;
  readonly statePath: string;
  readonly kubeGlobal: string;
  readonly kubeBefore: string;
}

/**
 * Verify operator-performed cleanup without deleting anything. Every independent verification
 * runs after earlier failures, then all failures are thrown together. Creation receipts must be
 * implemented by tool-fleet before this module can safely automate destructive lab teardown.
 */
export async function verifyRecoveryCleanup(
  command: RecoveryCommandRunner,
  request: CleanupObservation,
): Promise<void> {
  const failures: string[] = [];
  const attempt = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (failure) {
      failures.push(String(failure));
    }
  };
  const kube = (...args: string[]) => [
    'kubectl',
    '--kubeconfig',
    request.kubeconfig,
    '--context',
    request.context,
    ...args,
  ];
  await attempt(async () => {
    const namespace = await command(
      kube('get', 'namespace', request.namespace, '--ignore-not-found', '-o', 'name'),
      'namespace-absent',
    );
    // Proof: surviving namespace fixture fails while Lease and all resource checks still execute.
    if (namespace.trim() !== '') throw new Error('owned namespace remains');
  });
  await attempt(async () => {
    const leases = readObject(
      JSON.parse(
        await command(kube('-n', 'puni-forge', 'get', 'leases', '-o', 'json'), 'leases-absent'),
      ),
    );
    // Proof: surviving Lease fixture fails while all Docker resource checks still execute.
    if (!Array.isArray(leases['items']) || leases['items'].length !== 0)
      throw new Error('owned claim Leases remain');
  });
  for (const kind of ['container', 'network', 'volume']) {
    await attempt(async () => {
      const args = ['docker', kind, 'ls', '-q', '--filter', `label=puni.dev/lab-id=${request.lab}`];
      if (kind === 'container') args.push('--all');
      // Proof: a surviving fixture for each kind independently fails; later kinds are still queried.
      if ((await command(args, `${kind}-absent`)).trim() !== '')
        throw new Error(`owned ${kind} remains`);
    });
  }
  await attempt(async () => {
    await Promise.resolve();
    // Proof: surviving lab.json fixture fails after all Docker probes execute.
    if (existsSync(join(request.statePath, 'lab.json'))) throw new Error('lab state remains');
  });
  await attempt(async () => {
    const digest = createHash('sha256')
      .update(await readFile(request.kubeGlobal))
      .digest('hex');
    // Proof: modifying the fixture global kubeconfig after recording its digest fails this boundary.
    if (digest !== request.kubeBefore) throw new Error('global kubeconfig changed');
  });
  if (failures.length > 0) throw new Error(`cleanup failed: ${failures.join('; ')}`);
}

if (import.meta.main) await runRecoveryLab(process.argv.slice(2));
/** Refuses unrelated platform samples as evidence about the first observed forge container. */
export function requireMemoryEvidence(samples: string, pod: PodObservation): void {
  const source = samples
    .split('/sys/fs/cgroup/')
    .filter((sample) =>
      sample.split('\n')[0]?.includes(`pod${pod.uid}/${pod.container.slice(13)}`),
    );
  // Proof: platform-only and missing-peak samples fail their first-source evidence tests.
  if (
    !source.some((sample) =>
      ['memory.current', 'memory.peak', 'memory.events', 'VmRSS:'].every((metric) =>
        sample.includes(metric),
      ),
    )
  ) {
    throw new Error('first source container memory/RSS evidence absent');
  }
}
