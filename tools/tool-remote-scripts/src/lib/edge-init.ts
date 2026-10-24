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
  'OnBuild',
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
    HostConfig: { ...container.host, Init: true },
    NetworkingConfig: { EndpointsConfig: configuredEndpoints(container) },
  };
}

/** Compare independent stored fields; only inspected Mounts order and generated endpoint identity are excluded. */
export function compareCandidate(original: NativeContainer, candidate: NativeContainer): void {
  const expected = constructCandidate(original);
  // Proof: omission admitted all eleven Env/image/HostConfig/mount/endpoint drifts in edge-init.test.ts.
  if (
    fingerprint({
      image: original.image,
      config: expected.Config,
      host: expected.HostConfig,
      mounts: original.mounts,
      endpoints: expected.NetworkingConfig.EndpointsConfig,
    }) !==
    fingerprint({
      image: candidate.image,
      config: candidate.config,
      host: candidate.host,
      mounts: candidate.mounts,
      endpoints: configuredEndpoints(candidate),
    })
  )
    throw new InitRefusal('candidate-preservation-mismatch');
}
