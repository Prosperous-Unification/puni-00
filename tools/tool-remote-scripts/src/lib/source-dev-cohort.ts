import { type EnvLayout, sourceDevContract } from './env';
import {
  assertSame,
  readBoolean,
  readClosed,
  readDigest,
  readFields,
  readIdentity,
  readInteger,
  readNonempty,
  readString,
} from './managed-cohort';

/** Bound source participant, including exact effective configuration and namespace membership. */
export interface SourceDevMember {
  id: string;
  image: string;
  path: string;
  args: readonly string[];
  config: Record<string, unknown>;
  host: Record<string, unknown>;
  mounts: unknown[];
  networks: Record<string, unknown>;
  restartCount: number;
  state: Record<string, unknown>;
}

/** Fixed source contract admits no-init containers because whole private namespace extinction supplies exclusion. */
export function decodeSourceDev(raw: unknown, layout: EnvLayout): SourceDevMember {
  const container = readFields(raw);
  const contract = sourceDevContract(layout);
  if (container['Name'] !== `/${contract.name}`) throw new Error('source dev name differs');
  const config = readFields(container['Config']);
  const labels = readFields(config['Labels']);
  if (
    config['Image'] !== contract.image ||
    config['WorkingDir'] !== '/src' ||
    config['User'] !== '1000:1000' ||
    labels['com.docker.compose.service'] !== contract.service
  )
    throw new Error('source dev fixed config differs');
  readNonempty(labels['com.docker.compose.project']);
  assertSame(['bun', 'run', 'dev'], config['Cmd'], 'source dev command');
  const entrypoint = config['Entrypoint'];
  if (!(
    entrypoint === null ||
    (Array.isArray(entrypoint) &&
      entrypoint.length > 0 &&
      entrypoint.every((argument: unknown) => typeof argument === 'string' && argument.length > 0))
  ))
    throw new Error('source dev entrypoint malformed');
  const argv = [
    ...(Array.isArray(entrypoint)
      ? entrypoint.map((argument: unknown) => readString(argument))
      : []),
    'bun',
    'run',
    'dev',
  ];
  const path = readNonempty(container['Path']);
  assertSame(argv[0], path, 'source dev effective executable');
  assertSame(argv.slice(1), container['Args'], 'source dev effective arguments');
  const host = readFields(container['HostConfig']);
  const caps = host['CapAdd'];
  // Proof: source decoder PID sharing negatives reject host and container namespaces.
  if (
    !(host['Init'] === null || host['Init'] === false || host['Init'] === true) ||
    host['PidMode'] !== '' ||
    host['Privileged'] !== false ||
    !(caps === null || (Array.isArray(caps) && caps.length === 0))
  )
    throw new Error('source dev requires typed init, private PID, unprivileged and no added caps');
  const networks = readFields(readFields(container['NetworkSettings'])['Networks']);
  // Proof: network-guard omission admitted host mode; unsupported network negative failed (exit 1).
  if (host['NetworkMode'] !== layout.network || Object.keys(networks).length !== 1)
    throw new Error('source dev network differs');
  readIdentity(readFields(networks[layout.network])['NetworkID']);
  const mounts: unknown = container['Mounts'];
  if (!Array.isArray(mounts)) throw new Error('source dev mounts missing');
  // Proof: replacing expected mounts with observed mounts admitted a foreign source; unsupported mount negative failed.
  assertSame(
    [...contract.mounts].sort((left, right) => left.target.localeCompare(right.target)),
    mounts
      .map((raw: unknown) => {
        const mount = readFields(raw);
        if (mount['Type'] !== 'bind') throw new Error('source dev requires bind mounts');
        return {
          source: readString(mount['Source']),
          target: readString(mount['Destination']),
          writable: readBoolean(mount['RW']),
        };
      })
      .sort((left, right) => left.target.localeCompare(right.target)),
    'source dev mounts',
  );
  const policy = readClosed(host['RestartPolicy'], ['Name', 'MaximumRetryCount']);
  if (
    !['no', 'unless-stopped'].includes(readString(policy['Name'])) ||
    readInteger(policy['MaximumRetryCount']) !== 0
  )
    throw new Error('source dev restart policy unsupported');
  const state = readFields(container['State']);
  for (const name of ['Running', 'Paused', 'Restarting', 'Dead', 'OOMKilled'])
    readBoolean(state[name]);
  const pid = readInteger(state['Pid']);
  readInteger(state['ExitCode']);
  for (const name of ['StartedAt', 'FinishedAt']) {
    const stamp = readNonempty(state[name]);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(stamp) ||
      !Number.isFinite(Date.parse(stamp))
    )
      throw new Error('source dev lifecycle timestamp malformed');
  }
  if (
    state['Paused'] ||
    state['Restarting'] ||
    state['Dead'] ||
    state['OOMKilled'] ||
    state['Error'] !== '' ||
    (state['Running']
      ? state['Status'] !== 'running' || pid === 0
      : !['exited', 'created'].includes(readString(state['Status'])) || pid !== 0)
  )
    throw new Error('source dev lifecycle incoherent');
  return {
    id: readIdentity(container['Id']),
    path,
    args: argv.slice(1),
    image: readDigest(container['Image']),
    config,
    host,
    mounts,
    networks,
    restartCount: readInteger(container['RestartCount']),
    state,
  };
}

/** Stable process-start/configuration identity excludes only intended restart-policy and terminal transitions. */
export function sourceDevIdentity(member: SourceDevMember): unknown {
  const { RestartPolicy: _policy, ...host } = member.host;
  return {
    id: member.id,
    image: member.image,
    path: member.path,
    args: member.args,
    config: member.config,
    host,
    mounts: member.mounts,
    networks: Object.fromEntries(
      Object.entries(member.networks).map(([name, network]) => [
        name,
        readFields(network)['NetworkID'],
      ]),
    ),
    restartCount: member.restartCount,
    startedAt: member.state['StartedAt'],
  };
}

/** Coherent terminal PID-zero plus restart inhibition are both required; retained stopped state grants no authority. */
export function assertSourceDevExcluded(member: SourceDevMember): void {
  // Proof: terminal-guard omission admitted the omitted stop; source refuses omitted stop before callback failed.
  if (
    member.state['Running'] !== false ||
    member.state['Pid'] !== 0 ||
    !['exited', 'created'].includes(readString(member.state['Status']))
  )
    throw new Error('source dev is not terminal with PID zero');
  assertSame(
    { Name: 'no', MaximumRetryCount: 0 },
    member.host['RestartPolicy'],
    'source dev restart inhibition',
  );
}
