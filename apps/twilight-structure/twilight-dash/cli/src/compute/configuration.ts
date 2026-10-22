import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

import { parseSecretsOrThrow, type } from '@shared/validation';

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

/**
 * A WBS API key (`wbs_mk_<id>.<secret>`, `wbs-machine-credentials` A22). The key is held in a
 * private field, so stringifying, logging or serialising the configuration that carries it prints
 * `[credential]`; only {@link WbsCredential.authorization} reveals it, for the one request header.
 */
export class WbsCredential {
  readonly #key: string;

  public constructor(key: string) {
    this.#key = key;
  }

  /** The `Authorization` header value for one WBS request. */
  public authorization(): string {
    return `Bearer ${this.#key}`;
  }

  public toString(): string {
    return '[credential]';
  }

  public toJSON(): string {
    return '[credential]';
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
  /** The WBS origin, `https:` or loopback `http:`, with no path, query or user info. */
  readonly wbsOrigin: string;
  readonly credential: WbsCredential;
  readonly cadenceSeconds: number;
  readonly instances: readonly ReporterInstance[];
}

/** One instance's settings as the file states them, shape-checked, for its adapter to open. */
export interface InstanceSettings {
  readonly instanceId: string;
  readonly kind: ProviderKind;
  readonly bindings: readonly ResourceBinding[];
  readonly host?: string;
  readonly sshTransportFile?: string;
}

/**
 * What builds a provider of one kind. `measures` is consulted before `open`, so an unsupported
 * binding is refused without reading the adapter's own inputs; `open` reads only local state.
 */
export interface ProviderAdapter {
  readonly measures: ReadonlySet<Measure>;
  open(settings: InstanceSettings): Promise<ComputeProvider>;
}

/**
 * The adapters this Dash carries. `puni_pool` is a slot with no adapter and never appears here
 * (`compute-providers` P9); a kind that is absent is refused `provider_not_implemented`.
 */
export type ProviderAdapters = Partial<Record<Exclude<ProviderKind, 'puni_pool'>, ProviderAdapter>>;

const DEFAULT_CADENCE_SECONDS = 300;
const MAX_CONFIGURATION_BYTES = 64 * 1024;
const Identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AbsolutePath = /^\/[A-Za-z0-9._/-]*$/;
// The key shape `libs/wbs/application/core/src/service/machine-key.ts` mints.
const MachineKey =
  /^wbs_mk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const Binding = type({
  resourceId: Identifier,
  measure: type.enumerated(...MEASURES),
  'path?': AbsolutePath,
  'slots?': '1 <= number.integer <= 10000',
}).onUndeclaredKey('reject');

const Instance = type({
  instanceId: Identifier,
  kind: type.enumerated(...PROVIDER_KINDS),
  bindings: Binding.array().atLeastLength(1),
  'host?': 'string',
  'sshTransportFile?': 'string',
}).onUndeclaredKey('reject');

const Configuration = type({
  schemaVersion: '1',
  wbsOrigin: 'string',
  credential: MachineKey,
  'cadenceSeconds?': '30 <= number.integer <= 86400',
  instances: Instance.array().atLeastLength(1),
}).onUndeclaredKey('reject');

/**
 * The file's bytes, opened without following a link and checked on the open descriptor: a
 * regular file owned by this user with no group or other permission bits, since it holds the
 * credential.
 * @throws ConfigurationRefusal `config_absent`, `config_unreadable`, `credential_not_owner_only`.
 */
function readOwnerOnly(path: string): string {
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
 * The origin requests go to. Plain HTTP would carry the credential readable on the wire, so only
 * a loopback origin may use it (a local tunnel or a test server).
 */
function readOrigin(path: string, source: string): string {
  let origin: URL;
  try {
    origin = new URL(source);
  } catch {
    throw new ConfigurationRefusal('config_malformed', `${path}: wbsOrigin is not a URL`);
  }
  const plainLoopback = origin.protocol === 'http:' && LOOPBACK_HOSTS.has(origin.hostname);
  // Proof: accepting any `http:` origin made `refuses a plain-HTTP origin that is not loopback`
  // load a configuration that would send the key in clear text (2026-10-22).
  if (origin.protocol !== 'https:' && !plainLoopback) {
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: wbsOrigin must be https, or http on loopback`,
    );
  }
  if (
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== ''
  ) {
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: wbsOrigin must be an origin without user info, path, query or fragment`,
    );
  }
  return origin.origin;
}

/** The measure-specific fields: `path` exactly for `disk_gib`, `slots` exactly for `agent_slots`. */
function checkBinding(path: string, instanceId: string, binding: ResourceBinding): void {
  const wantsPath = binding.measure === 'disk_gib';
  const wantsSlots = binding.measure === 'agent_slots';
  if (wantsPath !== (binding.path !== undefined) || wantsSlots !== (binding.slots !== undefined)) {
    throw new ConfigurationRefusal(
      'config_malformed',
      `${path}: instance ${instanceId} resource ${binding.resourceId} measure ${binding.measure} takes ${
        wantsPath ? 'a path' : wantsSlots ? 'slots' : 'neither path nor slots'
      }`,
    );
  }
}

/**
 * Reads, validates and opens a `report-capacity` configuration before any network call
 * (`compute-providers` P10, P11): the owner-only file, its shape (field paths only, never
 * values), one binding per resource across the file, and per instance its kind's availability,
 * the adapter's measures, then the adapter's own local inputs.
 * @throws ConfigurationRefusal naming the first unusable input; an adapter's own refusal (an SSH
 * transport refusal) propagates as it is.
 */
export async function loadReporterConfiguration(
  path: string,
  adapters: ProviderAdapters,
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
  const wbsOrigin = readOrigin(path, parsed.wbsOrigin);
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
      checkBinding(path, instance.instanceId, binding);
    }
  }
  const instances: ReporterInstance[] = [];
  for (const instance of parsed.instances) {
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
  return {
    wbsOrigin,
    credential: new WbsCredential(parsed.credential),
    cadenceSeconds: parsed.cadenceSeconds ?? DEFAULT_CADENCE_SECONDS,
    instances,
  };
}
