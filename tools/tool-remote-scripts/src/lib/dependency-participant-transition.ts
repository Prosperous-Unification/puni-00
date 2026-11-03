import { orderMounts } from './docker-inventory';
import { assertSame, readClosed, readFields, readIdentity } from './managed-cohort';

export interface ParticipantRestartPolicy {
  readonly name: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  readonly maximumRetryCount: number;
}
export interface ParticipantSnapshot {
  readonly id: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly restartCount: number;
  readonly policy: ParticipantRestartPolicy;
  readonly native: Record<string, unknown>;
}
/** Exact Docker policy, including the retry count; unsupported or absent policy never becomes a default. */
export function readParticipantRestartPolicy(value: unknown): ParticipantRestartPolicy {
  const policy = readClosed(value, ['Name', 'MaximumRetryCount']);
  const name = policy['Name'];
  const maximumRetryCount = policy['MaximumRetryCount'];
  if (
    (name !== 'no' && name !== 'always' && name !== 'unless-stopped' && name !== 'on-failure') ||
    typeof maximumRetryCount !== 'number' ||
    !Number.isSafeInteger(maximumRetryCount) ||
    maximumRetryCount < 0 ||
    (name !== 'on-failure' && maximumRetryCount !== 0)
  )
    throw new Error('participant restart policy unsupported');
  return { name, maximumRetryCount };
}
/** Bounded native Docker snapshot; this observation has no startup or activation authority. */
export function readParticipantSnapshot(value: unknown): ParticipantSnapshot {
  const native = structuredClone(readFields(value));
  const id = readIdentity(native['Id']);
  const state = readFields(native['State']);
  const pid = state['Pid'];
  const startedAt = state['StartedAt'];
  const restartCount = native['RestartCount'];
  if (
    typeof pid !== 'number' ||
    !Number.isSafeInteger(pid) ||
    pid < 0 ||
    typeof startedAt !== 'string' ||
    !Number.isFinite(Date.parse(startedAt)) ||
    typeof restartCount !== 'number' ||
    !Number.isSafeInteger(restartCount) ||
    restartCount < 0 ||
    state['Paused'] !== false ||
    state['Restarting'] !== false ||
    state['Dead'] === true ||
    state['OOMKilled'] === true ||
    state['Error'] !== ''
  )
    throw new Error('participant lifecycle identity malformed');
  const policy = readParticipantRestartPolicy(readFields(native['HostConfig'])['RestartPolicy']);
  readFields(native['Config']);
  orderMounts(native['Mounts']);
  readFields(readFields(native['NetworkSettings'])['Networks']);
  return { id, pid, startedAt, restartCount, policy, native };
}
function startProjection(snapshot: ParticipantSnapshot): unknown {
  const native = structuredClone(snapshot.native);
  native['Mounts'] = orderMounts(native['Mounts']);
  delete native['RestartCount'];
  const state = readFields(native['State']);
  for (const field of ['Running', 'Pid', 'Status', 'StartedAt', 'FinishedAt', 'ExitCode', 'Error'])
    Reflect.deleteProperty(state, field);
  const settings = readFields(native['NetworkSettings']);
  for (const field of ['SandboxID', 'SandboxKey']) Reflect.deleteProperty(settings, field);
  const networks = readFields(settings['Networks']);
  for (const network of Object.values(networks)) {
    const fields = readFields(network);
    for (const field of [
      'EndpointID',
      'IPAddress',
      'IPPrefixLen',
      'Gateway',
      'GlobalIPv6Address',
      'GlobalIPv6PrefixLen',
      'IPv6Gateway',
      'MacAddress',
    ])
      Reflect.deleteProperty(fields, field);
  }
  return native;
}
/** Only one explicit manual start may change lifecycle/attachment addresses. Stable and policy checks preserve the bound running process. */
export function assertParticipantTransition(
  previous: ParticipantSnapshot,
  observed: unknown,
  transition: 'start' | 'stable' | 'policy',
  policy?: ParticipantRestartPolicy,
): ParticipantSnapshot {
  const current = readParticipantSnapshot(observed);
  const state = readFields(current.native['State']);
  if (
    current.id !== previous.id ||
    state['Running'] !== true ||
    state['Status'] !== 'running' ||
    current.pid <= 0
  )
    throw new Error('participant exact running identity unavailable');
  if (transition === 'start') {
    const before = readFields(previous.native['State']);
    if (
      previous.pid !== 0 ||
      before['Running'] !== false ||
      !['created', 'exited'].includes(String(before['Status'])) ||
      previous.policy.name !== 'no' ||
      current.policy.name !== 'no' ||
      current.startedAt === previous.startedAt ||
      current.restartCount > previous.restartCount
    )
      throw new Error('participant manual start did not produce one new exact process');
    assertSame(
      startProjection(previous),
      startProjection(current),
      'participant immutable start configuration',
    );
  } else {
    const before = structuredClone(previous.native);
    const after = structuredClone(current.native);
    before['Mounts'] = orderMounts(before['Mounts']);
    after['Mounts'] = orderMounts(after['Mounts']);
    if (transition === 'policy') {
      if (policy === undefined) throw new Error('participant original policy absent');
      assertSame(policy, current.policy, 'participant restored original policy');
      delete readFields(before['HostConfig'])['RestartPolicy'];
      delete readFields(after['HostConfig'])['RestartPolicy'];
    }
    assertSame(before, after, 'participant bound running identity');
  }
  return current;
}
/** Exact Docker CLI spelling for a policy already captured before fencing. */
export function formatParticipantRestartPolicy(policy: ParticipantRestartPolicy): string {
  return policy.name === 'on-failure' && policy.maximumRetryCount !== 0
    ? `on-failure:${String(policy.maximumRetryCount)}`
    : policy.name;
}
