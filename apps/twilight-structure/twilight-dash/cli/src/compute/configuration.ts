import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

import { parseSecretsOrThrow, type } from '@shared/validation';

import { ApiKey, type McpEndpoint, mcpEndpointOf } from '../mcp/machine-token';
import {
  type HostPoolDimension,
  HostPoolDimensionShape,
  type HostPoolLedger,
  isCountedDimension,
  openHostPoolLedger,
} from './host-pool-ledger';
import {
  type ComputeProvider,
  type Measure,
  MEASURES,
  PROVIDER_KINDS,
  type ProviderKind,
  type ResourceBinding,
} from './provider';

export type ConfigurationRefusalReason =
  | 'config_absent'
  | 'config_unreadable'
  | 'credential_not_owner_only'
  | 'config_malformed'
  | 'unsupported_measure'
  | 'provider_kind_not_available'
  | 'provider_not_implemented';

/**
 * The reporter configuration cannot be used; nothing was dialled. The message names the file,
 * an instance or a resource id, or the failing field paths, and never a configured value.
 */
export class ConfigurationRefusal extends Error {
  public constructor(
    public readonly reason: ConfigurationRefusalReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${reason}: ${message}`, options);
    this.name = 'ConfigurationRefusal';
  }
}

/** One configured provider instance, its adapter opened and its bindings validated. */
export interface ReporterInstance {
  readonly instanceId: string;
  readonly provider: ComputeProvider;
  readonly bindings: readonly ResourceBinding[];
}

/** A loaded `report-capacity` configuration (`compute-providers` P10, P11). */
export interface ReporterConfiguration {
  /** WBS's MCP endpoint, `https:` or loopback `http:` (`wbs-mcp-agent-surface` M12). */
  readonly endpoint: McpEndpoint;
  readonly credential: ApiKey;
  readonly cadenceSeconds: number;
  readonly instances: readonly ReporterInstance[];
  /**
   * This host's managed-resource ledger, present exactly when a binding's source is the host
   * pool (`dash-host-jobs` J10); the loader refuses either without the other.
   */
  readonly hostPool?: HostPoolLedger;
}

/** One instance's settings as the file states them, shape-checked, for its adapter to open. */
export interface InstanceSettings {
  readonly instanceId: string;
  readonly kind: ProviderKind;
  readonly bindings: readonly ResourceBinding[];
  readonly host?: string;
  readonly sshTransportFile?: string;
  readonly dockerContext?: string;
  readonly runImage?: string;
}

/**
 * What builds a provider of one kind. `isStub` and `measures` are consulted before `open`, so a
 * stub or an unsupported binding is refused without reading the adapter's own inputs; `open` reads
 * only local state.
 */
export interface ProviderAdapter {
  /** True for an adapter whose every method answers `not_implemented` (`kubernetes`, P9). */
  readonly isStub: boolean;
  readonly measures: ReadonlySet<Measure>;
  open(settings: InstanceSettings): Promise<ComputeProvider>;
}

/**
 * The adapters this Dash carries. `puni_pool` is a slot with no adapter and never appears here
 * (`compute-providers` P9); a kind that is absent, or whose adapter is a stub, is refused
 * `provider_not_implemented`.
 */
export type ProviderAdapters = Partial<Record<Exclude<ProviderKind, 'puni_pool'>, ProviderAdapter>>;

const DEFAULT_CADENCE_SECONDS = 300;
const MAX_CONFIGURATION_BYTES = 64 * 1024;
const Identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AbsolutePath = /^\/[A-Za-z0-9._/-]*$/;
// Docker's own context-name rule (`^[a-zA-Z0-9][a-zA-Z0-9_.+-]+$`, two characters at least),
// bounded; the first character keeps it from reading as a flag.
// Proof: `{0,63}` made `refuses a docker context or image that could read as a flag
// config_malformed` load the one-character context `a` (2026-10-23).
const DockerContext = /^[A-Za-z0-9][A-Za-z0-9_.+-]{1,63}$/;
// An image reference (`registry/repository:tag@digest`), bounded, never starting with `-`.
const ImageReference = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/;
// The key shape `libs/wbs/application/core/src/service/machine-key.ts` mints.
export const MachineKey =
  /^wbs_mk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const Binding = type({
  resourceId: Identifier,
  measure: type.enumerated(...MEASURES),
  'path?': AbsolutePath,
  'slots?': '1 <= number.integer <= 10000',
  'ceilingGib?': '1 <= number.integer <= 1000000',
  'source?': "'host_pool'",
  'dimension?': HostPoolDimensionShape,
}).onUndeclaredKey('reject');

/** The measure a `host_pool` dimension's reserved units sit beside (`dash-host-jobs` J10). */
const DIMENSION_MEASURES: Readonly<Record<HostPoolDimension, Measure>> = {
  cpuCores: 'cpu_cores',
  memoryGib: 'memory_gib',
  tmpDiskGib: 'disk_gib',
};

const Instance = type({
  instanceId: Identifier,
  kind: type.enumerated(...PROVIDER_KINDS),
  bindings: Binding.array().atLeastLength(1),
  'host?': 'string',
  'sshTransportFile?': 'string',
  'dockerContext?': DockerContext,
  'runImage?': ImageReference,
}).onUndeclaredKey('reject');

const Configuration = type({
  schemaVersion: '2',
  mcpResource: 'string',
  credential: MachineKey,
  'cadenceSeconds?': '30 <= number.integer <= 86400',
  instances: Instance.array().atLeastLength(1),
  'hostPool?': type({ ledger: AbsolutePath }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');

/**
 * The file's bytes, opened without following a link and checked on the open descriptor: a
 * regular file owned by this user with no group or other permission bits, since it holds the
 * credential.
 * @throws ConfigurationRefusal `config_absent`, `config_unreadable`, `credential_not_owner_only`.
 */
export function readOwnerOnly(path: string): string {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
    // Proof: answering every open failure `config_unreadable` failed `refuses an absent
    // configuration config_absent` (2026-10-22).
    if (code === 'ENOENT') {
      throw new ConfigurationRefusal('config_absent', `no configuration at ${path}`, { cause });
    }
    throw new ConfigurationRefusal('config_unreadable', `cannot open ${path}`, { cause });
  }
  try {
    const opened = fstatSync(descriptor);
    // Proof: skipping this check made `refuses a directory config_unreadable…` fail on the raw
    // `EISDIR` read error escaping as no refusal (2026-10-22).
    if (!opened.isFile()) {
      throw new ConfigurationRefusal('config_unreadable', `${path} is not a regular file`);
    }
    // Proof: skipping this check made `refuses a group- or world-readable configuration` load a
    // 0640 file holding the credential (2026-10-22).
    if ((opened.mode & 0o077) !== 0 || opened.uid !== process.getuid?.()) {
      throw new ConfigurationRefusal(
        'credential_not_owner_only',
        `${path} holds the WBS credential and must be owned by this user with mode 0600`,
      );
    }
    const buffer = Buffer.alloc(MAX_CONFIGURATION_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const next = readSync(descriptor, buffer, count, buffer.length - count, count);
      if (next === 0) break;
      count += next;
    }
    // Proof: dropping this cap made `…and a file over 64 KiB config_malformed` load the file
    // (2026-10-22).
    if (count > MAX_CONFIGURATION_BYTES) {
      throw new ConfigurationRefusal('config_malformed', `${path} exceeds 64 KiB`);
    }
    return buffer.subarray(0, count).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

/**
 * The MCP endpoint reports go to (`mcpResource`, e.g. `https://wbs.example/mcp`). The key crosses
 * the wire to its token endpoint, so plain HTTP is accepted only on loopback (a local tunnel or a
 * test server), and user info, a query or a fragment is refused.
 */
function readMcpResource(path: string, source: string): McpEndpoint {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new ConfigurationRefusal('config_malformed', `${path}: mcpResource is not a URL`);
  }
  const plainLoopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  // Proof: accepting any `http:` origin made `refuses a plain-HTTP origin that is not loopback`
  // load a configuration that would send the key in clear text (2026-10-22).
  if (url.protocol !== 'https:' && !plainLoopback) {
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: mcpResource must be https, or http on loopback`,
    );
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: mcpResource must be a URL without user info, query or fragment`,
    );
  }
  return mcpEndpointOf(source);
}

/**
 * The measure-specific fields: `slots` exactly for `agent_slots`; for `disk_gib`, `ceilingGib`
 * exactly on a `docker` instance (its disk answer has no capacity) and `path` exactly otherwise.
 */
function checkBinding(
  path: string,
  instanceId: string,
  kind: ProviderKind,
  binding: ResourceBinding,
): void {
  const wantsCeiling = binding.measure === 'disk_gib' && kind === 'docker';
  const wantsPath = binding.measure === 'disk_gib' && !wantsCeiling;
  const wantsSlots = binding.measure === 'agent_slots';
  // Proof: dropping the `ceilingGib` comparison made `refuses a docker disk binding without
  // ceilingGib or with a path config_malformed` load the docker binding without one (2026-10-22).
  if (
    wantsPath !== (binding.path !== undefined) ||
    wantsSlots !== (binding.slots !== undefined) ||
    wantsCeiling !== (binding.ceilingGib !== undefined)
  ) {
    const wanted = wantsPath
      ? 'a path'
      : wantsSlots
        ? 'slots'
        : wantsCeiling
          ? 'ceilingGib'
          : 'none of path, slots and ceilingGib';
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: instance ${instanceId} resource ${binding.resourceId} measure ${binding.measure} takes ${wanted}`,
    );
  }
  // Proof: dropping this pairing made `refuses a host pool binding whose dimension does not
  // match its measure config_malformed` (report-capacity.test.ts) load memoryGib beside
  // cpu_cores (2026-11-01, verify.md Slice 5).
  if ((binding.source === undefined) !== (binding.dimension === undefined))
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: instance ${instanceId} resource ${binding.resourceId} names source and dimension together or neither`,
    );
  if (binding.dimension !== undefined) {
    const paired = isCountedDimension(binding.dimension)
      ? DIMENSION_MEASURES[binding.dimension]
      : 'agent_slots';
    if (binding.measure !== paired)
      throw new ConfigurationRefusal(
        'config_malformed',
        `${path}: instance ${instanceId} resource ${binding.resourceId} dimension ${binding.dimension} pairs with measure ${paired}`,
      );
  }
}

/**
 * Reads, validates and opens a `report-capacity` configuration before any network call
 * (`compute-providers` P10, P11): the owner-only file, its shape (field paths only, never
 * values), one binding per resource across the file, and per instance its kind's availability,
 * the adapter's measures, then the adapter's own local inputs.
 * A `hostPool.ledger` is opened read-only through `openLedger` after every instance opened,
 * and only when a binding names the host pool.
 * @throws ConfigurationRefusal naming the first unusable input; an adapter's own refusal (an SSH
 * transport refusal) and the ledger's own refusal propagate as they are.
 */
export async function loadReporterConfiguration(
  path: string,
  adapters: ProviderAdapters,
  openLedger: (ledger: string) => HostPoolLedger = openHostPoolLedger,
): Promise<ReporterConfiguration> {
  const source = readOwnerOnly(path);
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    // No cause: a JSON syntax error quotes the bytes around it, which may be the credential.
    throw new ConfigurationRefusal('config_malformed', `${path} is not JSON`);
  }
  let parsed: typeof Configuration.infer;
  try {
    // Proof: `parseOrThrow` here made `never echoes a malformed credential` fail, its summary
    // quoting the key that missed the pattern (2026-10-22).
    parsed = parseSecretsOrThrow(Configuration, input);
  } catch (cause) {
    const fields = cause instanceof Error ? cause.message : 'the value itself';
    throw new ConfigurationRefusal('config_malformed', `${path}: ${fields}`);
  }
  const endpoint = readMcpResource(path, parsed.mcpResource);
  const instanceIds = new Set<string>();
  const resourceIds = new Set<string>();
  for (const instance of parsed.instances) {
    if (instanceIds.has(instance.instanceId)) {
      throw new ConfigurationRefusal(
        'config_malformed',
        `${path}: instance ${instance.instanceId} is configured twice`,
      );
    }
    instanceIds.add(instance.instanceId);
    for (const binding of instance.bindings) {
      // Two bindings on one resource would supersede each other on every tick.
      if (resourceIds.has(binding.resourceId)) {
        throw new ConfigurationRefusal(
          'config_malformed',
          `${path}: resource ${binding.resourceId} is bound twice`,
        );
      }
      resourceIds.add(binding.resourceId);
      checkBinding(path, instance.instanceId, instance.kind, binding);
    }
  }
  const pooled = parsed.instances.some((instance) =>
    instance.bindings.some((binding) => binding.source === 'host_pool'),
  );
  if (pooled !== (parsed.hostPool !== undefined))
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: hostPool.ledger is ${pooled ? 'required by' : 'unused without'} a binding whose source is host_pool`,
    );
  // Opened before any adapter, so a host before `resources init` is refused with nothing to
  // close; an adapter failing afterwards closes the ledger again.
  const hostPool =
    parsed.hostPool === undefined ? undefined : openPool(path, parsed.hostPool.ledger, openLedger);
  try {
    return {
      endpoint,
      credential: ApiKey.of(parsed.credential, `${path}: credential`),
      cadenceSeconds: parsed.cadenceSeconds ?? DEFAULT_CADENCE_SECONDS,
      instances: await openInstances(parsed.instances, adapters),
      ...(hostPool === undefined ? {} : { hostPool }),
    };
  } catch (cause) {
    hostPool?.close();
    throw cause;
  }
}

/**
 * The host pool's ledger through `openLedger`.
 * @throws ConfigurationRefusal `config_malformed` naming the ledger when it cannot be opened or
 * is not a ledger this Dash reads, with the ledger's own refusal as the cause.
 */
function openPool(
  path: string,
  ledger: string,
  openLedger: (ledger: string) => HostPoolLedger,
): HostPoolLedger {
  try {
    return openLedger(ledger);
  } catch (cause) {
    // Proof: rethrowing the ledger's own error made `refuses a host pool binding the loader
    // cannot honour, config_malformed` (report-capacity.host-pool.test.ts) receive a plain Error
    // (2026-11-02).
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: hostPool.ledger ${ledger} is not a managed-resource ledger this Dash can read; run resources init first`,
      { cause },
    );
  }
}

/** Opens each instance's adapter after the checks the file allows without dialling anything. */
async function openInstances(
  configured: readonly (typeof Instance.infer)[],
  adapters: ProviderAdapters,
): Promise<ReporterInstance[]> {
  const instances: ReporterInstance[] = [];
  for (const instance of configured) {
    const { kind } = instance;
    // Proof: letting `puni_pool` fall through to the adapter lookup failed `refuses a pool
    // instance provider_kind_not_available` with `provider_not_implemented` (2026-10-22).
    if (kind === 'puni_pool') {
      throw new ConfigurationRefusal(
        'provider_kind_not_available',
        `instance ${instance.instanceId} is a puni_pool; Dash has no adapter for the PUNI pool`,
      );
    }
    const adapter = adapters[kind];
    if (adapter === undefined) {
      throw new ConfigurationRefusal(
        'provider_not_implemented',
        `instance ${instance.instanceId} is a ${kind}, which this Dash cannot report yet`,
      );
    }
    // A stub would answer `not_implemented`, a body WBS refuses `400 invalid_body` (P9).
    // Proof: skipping this check made `refuses a kubernetes instance at startup, never reaching
    // the stub` reach the stub's methods and end `refused: … HTTP 400 invalid_body` (2026-10-22).
    if (adapter.isStub) {
      throw new ConfigurationRefusal(
        'provider_not_implemented',
        `instance ${instance.instanceId} is a ${kind}, whose adapter is a stub this Dash cannot report from`,
      );
    }
    const unsupported = instance.bindings.find((binding) => !adapter.measures.has(binding.measure));
    // Proof: skipping this check made `refuses a measure the adapter lacks unsupported_measure`
    // open the adapter for an agent_slots binding it cannot measure (2026-10-22).
    if (unsupported !== undefined) {
      throw new ConfigurationRefusal(
        'unsupported_measure',
        `instance ${instance.instanceId} (${kind}) cannot measure ${unsupported.measure} for resource ${unsupported.resourceId}`,
      );
    }
    const settings: InstanceSettings = { ...instance, kind };
    instances.push({
      instanceId: instance.instanceId,
      provider: await adapter.open(settings),
      bindings: instance.bindings,
    });
  }
  return instances;
}
