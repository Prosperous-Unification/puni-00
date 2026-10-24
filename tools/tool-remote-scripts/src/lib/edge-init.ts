import { createHash } from 'node:crypto';

import { orderMounts } from './docker-inventory';
import { readDigest, readFields, readIdentity, readInteger, readString } from './managed-cohort';

export type NativeValue = null | boolean | number | string | NativeValue[] | NativeFields;
export interface NativeFields {
  [field: string]: NativeValue;
}
type Rule = (value: unknown) => NativeValue;

/** Fixed codes contain no Engine body, host configuration, Env, route or credential bytes. */
export class InitRefusal extends Error {
  constructor(readonly reason: string) {
    super(`edge Init adoption refused: ${reason}`);
  }
}

function refuse(): never {
  throw new InitRefusal('unsupported-native-shape');
}
const text: Rule = (value) => (typeof value === 'string' ? value : refuse());
const boolean: Rule = (value) => (typeof value === 'boolean' ? value : refuse());
const integer: Rule = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : refuse();
const nullable =
  (rule: Rule): Rule =>
  (value) =>
    value === null ? null : rule(value);
const array =
  (rule: Rule): Rule =>
  (value) =>
    Array.isArray(value) ? value.map((entry: unknown) => rule(entry)) : refuse();
const strings = nullable(array(text));
const dictionary =
  (rule: Rule): Rule =>
  (value) =>
    Object.fromEntries(Object.entries(readFields(value)).map(([key, entry]) => [key, rule(entry)]));
const closed =
  (rules: Record<string, Rule | undefined>, required: readonly string[] = []): Rule =>
  (value) => {
    const fields = readFields(value);
    if (required.some((key) => !Object.hasOwn(fields, key))) refuse();
    return Object.fromEntries(
      Object.entries(fields).map(([key, entry]) => {
        // Proof: omitting own-key admission let Config constructor/toString bypass the native-schema negatives.
        const rule = Object.hasOwn(rules, key) ? rules[key] : undefined;
        // Proof: unknown-field omission admitted unsupported Config, HostConfig, State and endpoint fields in edge-init.test.ts.
        if (rule === undefined) refuse();
        return [key, rule(entry)];
      }),
    );
  };
const empty = closed({});
const stringMap = nullable(dictionary(text));
const portBinding = closed({ HostIp: text, HostPort: text }, ['HostIp', 'HostPort']);
const ports = nullable(dictionary(nullable(array(portBinding))));
const ipam = nullable(closed({ IPv4Address: text, IPv6Address: text, LinkLocalIPs: strings }));
const endpointRules = {
  IPAMConfig: ipam,
  Links: strings,
  Aliases: strings,
  DriverOpts: stringMap,
  GwPriority: integer,
  NetworkID: text,
  EndpointID: text,
  Gateway: text,
  IPAddress: text,
  IPPrefixLen: integer,
  IPv6Gateway: text,
  GlobalIPv6Address: text,
  GlobalIPv6PrefixLen: integer,
  MacAddress: text,
  DNSNames: strings,
};
const endpoint = closed(endpointRules, [
  'NetworkID',
  'Aliases',
  'IPAMConfig',
  'Links',
  'DriverOpts',
]);
const mount = closed(
  {
    Type: text,
    Name: text,
    Source: text,
    Destination: text,
    Driver: text,
    Mode: text,
    RW: boolean,
    Propagation: text,
  },
  ['Type', 'Source', 'Destination', 'Mode', 'RW', 'Propagation'],
);
const throttle = array(closed({ Path: text, Rate: integer }, ['Path', 'Rate']));
const weight = array(closed({ Path: text, Weight: integer }, ['Path', 'Weight']));
const mountRequest = closed({
  Type: text,
  Source: text,
  Target: text,
  ReadOnly: boolean,
  Consistency: text,
  BindOptions: closed({
    Propagation: text,
    NonRecursive: boolean,
    CreateMountpoint: boolean,
    ReadOnlyNonRecursive: boolean,
    ReadOnlyForceRecursive: boolean,
  }),
  VolumeOptions: closed({
    NoCopy: boolean,
    Subpath: text,
    Labels: stringMap,
    DriverConfig: closed({ Name: text, Options: stringMap }),
  }),
  TmpfsOptions: closed({ SizeBytes: integer, Mode: integer, Options: array(array(text)) }),
  ImageOptions: closed({ Subpath: text }),
});
const configRules = {
  Hostname: text,
  Domainname: text,
  User: text,
  AttachStdin: boolean,
  AttachStdout: boolean,
  AttachStderr: boolean,
  ExposedPorts: nullable(dictionary(empty)),
  Tty: boolean,
  OpenStdin: boolean,
  StdinOnce: boolean,
  Env: array(text),
  Cmd: strings,
  Image: text,
  Volumes: nullable(dictionary(empty)),
  WorkingDir: text,
  Entrypoint: strings,
  // Proof: weakening this present-value rule made the malformed native OnBuild cases fail.
  OnBuild: strings,
  Labels: stringMap,
  StopSignal: text,
  StopTimeout: integer,
  Shell: strings,
  ArgsEscaped: boolean,
  NetworkDisabled: boolean,
  MacAddress: text,
  Healthcheck: closed({
    Test: array(text),
    Interval: integer,
    Timeout: integer,
    StartPeriod: integer,
    StartInterval: integer,
    Retries: integer,
  }),
};
// API 1.52 omits OnBuild; preserve absence rather than supplying null.
// Proof: requiring OnBuild made the observed-shape absence regression fail; admitting an unknown key also failed its strictness regression.
const configRequired = [
  'Hostname',
  'Domainname',
  'User',
  'AttachStdin',
  'AttachStdout',
  'AttachStderr',
  'Tty',
  'OpenStdin',
  'StdinOnce',
  'Env',
  'Cmd',
  'Image',
  'Volumes',
  'WorkingDir',
  'Entrypoint',
  'Labels',
];
const hostRules: Record<string, Rule> = {
  Binds: strings,
  ContainerIDFile: text,
  LogConfig: closed({ Type: text, Config: stringMap }, ['Type', 'Config']),
  NetworkMode: text,
  PortBindings: ports,
  RestartPolicy: closed({ Name: text, MaximumRetryCount: integer }, ['Name', 'MaximumRetryCount']),
  AutoRemove: boolean,
  VolumeDriver: text,
  VolumesFrom: strings,
  ConsoleSize: array(integer),
  CapAdd: strings,
  CapDrop: strings,
  CgroupnsMode: text,
  Dns: strings,
  DnsOptions: strings,
  DnsSearch: strings,
  ExtraHosts: strings,
  GroupAdd: strings,
  IpcMode: text,
  Cgroup: text,
  Links: strings,
  OomScoreAdj: integer,
  PidMode: text,
  Privileged: boolean,
  PublishAllPorts: boolean,
  ReadonlyRootfs: boolean,
  SecurityOpt: strings,
  StorageOpt: stringMap,
  Tmpfs: stringMap,
  UTSMode: text,
  UsernsMode: text,
  ShmSize: integer,
  Sysctls: stringMap,
  Runtime: text,
  Isolation: text,
  CpuShares: integer,
  Memory: integer,
  NanoCpus: integer,
  CgroupParent: text,
  BlkioWeight: integer,
  BlkioWeightDevice: nullable(weight),
  BlkioDeviceReadBps: nullable(throttle),
  BlkioDeviceWriteBps: nullable(throttle),
  BlkioDeviceReadIOps: nullable(throttle),
  BlkioDeviceWriteIOps: nullable(throttle),
  CpuPeriod: integer,
  CpuQuota: integer,
  CpuRealtimePeriod: integer,
  CpuRealtimeRuntime: integer,
  CpusetCpus: text,
  CpusetMems: text,
  Devices: nullable(
    array(
      closed({ PathOnHost: text, PathInContainer: text, CgroupPermissions: text }, [
        'PathOnHost',
        'PathInContainer',
        'CgroupPermissions',
      ]),
    ),
  ),
  DeviceCgroupRules: strings,
  DeviceRequests: nullable(
    array(
      closed({
        Driver: text,
        Count: integer,
        DeviceIDs: strings,
        Capabilities: array(array(text)),
        Options: stringMap,
      }),
    ),
  ),
  MemoryReservation: integer,
  MemorySwap: integer,
  MemorySwappiness: nullable(integer),
  OomKillDisable: nullable(boolean),
  PidsLimit: nullable(integer),
  Ulimits: nullable(
    array(closed({ Name: text, Hard: integer, Soft: integer }, ['Name', 'Hard', 'Soft'])),
  ),
  CpuCount: integer,
  CpuPercent: integer,
  IOMaximumIOps: integer,
  IOMaximumBandwidth: integer,
  MaskedPaths: strings,
  ReadonlyPaths: strings,
  Init: nullable(boolean),
  Mounts: nullable(array(mountRequest)),
  Annotations: stringMap,
  CgroupV2: stringMap,
};
const stateRules = {
  Status: text,
  Running: boolean,
  Paused: boolean,
  Restarting: boolean,
  OOMKilled: boolean,
  Dead: boolean,
  Pid: integer,
  ExitCode: integer,
  Error: text,
  StartedAt: text,
  FinishedAt: text,
  Health: closed({
    Status: text,
    FailingStreak: integer,
    Log: array(closed({ Start: text, End: text, ExitCode: integer, Output: text })),
  }),
};

export interface NativeContainer {
  id: string;
  name: string;
  image: string;
  config: NativeFields;
  host: NativeFields;
  mounts: Record<string, unknown>[];
  networks: NativeFields;
  sandboxId: string;
  sandboxKey: string;
  ports: NativeValue;
  state: NativeFields;
  restartCount: number;
}

/** Boundary preserves every supported Config/HostConfig value and refuses unknown nested fields. */
export function parseNativeContainer(value: unknown): NativeContainer {
  const fields = readFields(value);
  const networks = readFields(fields['NetworkSettings']);
  const config = readFields(closed(configRules, configRequired)(fields['Config']));
  encodeOrderedEnv(config['Env']);
  const host = readFields(
    closed(hostRules, ['Binds', 'NetworkMode', 'PortBindings', 'RestartPolicy'])(
      fields['HostConfig'],
    ),
  );
  const parsedNetworks = dictionary(endpoint)(networks['Networks']);
  for (const raw of Object.values(readFields(parsedNetworks)))
    readIdentity(readFields(raw)['NetworkID']);
  const mounts = orderMounts(fields['Mounts']);
  for (const mounted of mounts) mount(mounted);
  return {
    id: readIdentity(fields['Id']),
    name: readString(fields['Name']),
    image: readDigest(fields['Image']),
    // Every value was recursively admitted by the closed schemas above; the casts retain JSON recursion, never arbitrary native values.
    config: config as NativeFields,
    host: host as NativeFields,
    networks: parsedNetworks as NativeFields,
    mounts,
    sandboxId: readString(networks['SandboxID']),
    sandboxKey: readString(networks['SandboxKey']),
    ports: ports(networks['Ports']),
    state: readFields(
      closed(
        stateRules,
        Object.keys(stateRules).filter((key) => key !== 'Health'),
      )(fields['State']),
    ) as NativeFields,
    restartCount: readInteger(fields['RestartCount']),
  };
}

/** Python json.dumps(..., ensure_ascii=True, separators=(',', ':')) for a validated ordered Env array. */
export function encodeOrderedEnv(value: unknown): string {
  if (!Array.isArray(value)) throw new InitRefusal('invalid-ordered-env');
  const seen = new Set<string>();
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string') throw new InitRefusal('invalid-ordered-env');
    const separator = entry.indexOf('=');
    const key = entry.slice(0, separator);
    if (separator < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || seen.has(key))
      throw new InitRefusal('invalid-ordered-env');
    seen.add(key);
  }
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** Stable JSON hashes object keys but never array order or null/empty distinctions. */
export function fingerprint(value: unknown): string {
  const sort = (entry: unknown): unknown =>
    Array.isArray(entry)
      ? entry.map(sort)
      : entry !== null && typeof entry === 'object'
        ? Object.fromEntries(
            Object.entries(entry)
              .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
              .map(([key, child]) => [key, sort(child)]),
          )
        : entry;
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}

export interface CandidateRequest {
  Config: NativeFields;
  HostConfig: NativeFields;
  NetworkingConfig: { EndpointsConfig: NativeFields };
}

function configuredEndpoints(container: NativeContainer): NativeFields {
  return Object.fromEntries(
    Object.values(container.networks).map((raw) => {
      const fields = readFields(raw);
      const settings = Object.fromEntries(
        ['IPAMConfig', 'Links', 'Aliases', 'DriverOpts', 'GwPriority']
          .filter((key) => Object.hasOwn(fields, key))
          .map((key) => [key, fields[key]]),
      );
      // Endpoint values have already passed the closed recursive endpoint schema.
      return [readIdentity(fields['NetworkID']), settings as NativeFields];
    }),
  );
}

/** Complete create input; only immutable image spelling and Init differ. Allocated addresses never become requests. */
export function constructCandidate(container: NativeContainer): CandidateRequest {
  return {
    Config: { ...container.config, Image: container.image },
    // Proof: rewriting OOM to false failed the independent null-request regression.
    HostConfig: { ...container.host, Init: true },
    NetworkingConfig: { EndpointsConfig: configuredEndpoints(container) },
  };
}

export interface InvariantProjection {
  image: string;
  config: NativeFields;
  host: NativeFields;
  mounts: readonly unknown[];
  endpoints: NativeFields;
}
/** The only characterized created-state representation allowance; omitted context remains strict. */
export const CREATED_OOM_PROFILE = 'engine-29.1.3-api-1.52-cgroup2-created-oom-v1';
export type InvariantProfile = typeof CREATED_OOM_PROFILE;

/** Requires fresh fixed daemon evidence; this identifier is never decoded from an operation packet.
 * Proof: independently omitting each version/API/OS/server/cgroup check failed the daemon-evidence regression.
 */
export function admitInvariantProfile(version: unknown, information: unknown): InvariantProfile {
  const server = readFields(version),
    info = readFields(information);
  if (
    server['Version'] !== '29.1.3' ||
    server['ApiVersion'] !== '1.52' ||
    server['Os'] !== 'linux' ||
    info['ServerVersion'] !== '29.1.3' ||
    info['OSType'] !== 'linux' ||
    info['CgroupVersion'] !== '2' ||
    info['CgroupDriver'] !== 'systemd'
  )
    throw new InitRefusal('invariant-profile-unavailable');
  return CREATED_OOM_PROFILE;
}
// Proof: removing profile identity admission failed the unknown-profile regression.
function checkProfile(profile: unknown): void {
  if (profile !== undefined && profile !== CREATED_OOM_PROFILE)
    throw new InitRefusal('invariant-profile-invalid');
}
/** The characterized source must contain explicit null; absence and false never opt into this profile.
 * Proof: omitting source admission failed source false/true/absence regressions, including zero-effect operation refusal.
 */
export function checkProfileSource(original: NativeContainer, profile?: InvariantProfile): void {
  checkProfile(profile);
  if (
    profile !== undefined &&
    (!Object.hasOwn(original.host, 'OomKillDisable') || original.host['OomKillDisable'] !== null)
  )
    throw new InitRefusal('invariant-profile-source-invalid');
}
/** Requires never-started process, sandbox, ports and endpoint evidence; an invariant hash is not a lifecycle proof.
 * Proof: omitted status, running, dead, sandbox and endpoint checks each admitted its retained-false drift regression.
 */
export function checkInert(observed: NativeContainer): void {
  if (
    observed.state['Status'] !== 'created' ||
    observed.state['Running'] !== false ||
    observed.state['Paused'] !== false ||
    observed.state['Restarting'] !== false ||
    observed.state['Dead'] !== false ||
    observed.state['Pid'] !== 0 ||
    observed.state['StartedAt'] !== '0001-01-01T00:00:00Z' ||
    observed.state['FinishedAt'] !== '0001-01-01T00:00:00Z' ||
    observed.restartCount !== 0 ||
    observed.sandboxId !== '' ||
    observed.sandboxKey !== '' ||
    Object.values(readFields(observed.ports)).some((bindings) => bindings !== null)
  )
    throw new InitRefusal('candidate-not-inert');
  for (const network of Object.values(observed.networks)) {
    const endpoint = readFields(network);
    if (
      endpoint['EndpointID'] !== '' ||
      endpoint['IPAddress'] !== '' ||
      endpoint['GlobalIPv6Address'] !== ''
    )
      throw new InitRefusal('candidate-network-active');
  }
}
/** Complete admitted immutable fields; the fixed profile projects only a fully inert false to null on a fresh HostConfig copy.
 * Proof: missing/value, phase and default-strictness omissions failed their regressions; broad running equality failed the actual finite operation.
 */
export function projectInvariant(
  container: NativeContainer,
  profile?: InvariantProfile,
): InvariantProjection {
  checkProfile(profile);
  let host = container.host;
  if (profile !== undefined) {
    if (
      !Object.hasOwn(host, 'OomKillDisable') ||
      (host['OomKillDisable'] !== null && host['OomKillDisable'] !== false)
    )
      throw new InitRefusal('invariant-profile-value-invalid');
    if (host['OomKillDisable'] === false) {
      checkInert(container);
      host = { ...host, OomKillDisable: null };
    }
  }
  return {
    image: container.image,
    config: container.config,
    host,
    mounts: container.mounts,
    endpoints: configuredEndpoints(container),
  };
}
/** Expected replacement fields from the unchanged original request; never project an observed replacement through its constructor. */
export function candidateInvariant(
  original: NativeContainer,
  profile?: InvariantProfile,
): InvariantProjection {
  checkProfileSource(original, profile);
  const request = constructCandidate(original);
  return {
    image: original.image,
    config: request.Config,
    host: request.HostConfig,
    mounts: original.mounts,
    endpoints: request.NetworkingConfig.EndpointsConfig,
  };
}
/** Compare independent stored fields under an explicitly admitted native profile, or strictly by default. */
export function compareCandidate(
  original: NativeContainer,
  candidate: NativeContainer,
  profile?: InvariantProfile,
): void {
  // Proof: omission admitted all eleven Env/image/HostConfig/mount/endpoint drifts in edge-init.test.ts.
  if (
    fingerprint(candidateInvariant(original, profile)) !==
    fingerprint(projectInvariant(candidate, profile))
  )
    throw new InitRefusal('candidate-preservation-mismatch');
}
