import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import { assertParticipantRestorationContext } from '../src/lib/complete-dependency-exclusion';
import {
  observeSourceParticipantListener,
  type SourceParticipantListener,
} from '../src/lib/dependency-participant-listener';
import type { FinalizedParticipantRestorationContext } from '../src/lib/dependency-participant-preparation';
import {
  observeParticipantProcess,
  type ParticipantProcessObservation,
} from '../src/lib/dependency-participant-process';
import { runDockerCli } from '../src/lib/docker-deadline';
import { ownerDockerHashed } from '../src/lib/edge-ownership';
import { readClosed } from '../src/lib/managed-cohort';
import type { SourceRestorationConfiguration } from '../src/lib/source-restoration-configuration';
import { decodeSourceDevPins, type SourceDevPins } from '../src/lib/source-startup-manifest';

export type SourceRole = 'backend' | 'gateway' | 'mcp' | 'frontend';
export const SOURCE_ROLES: readonly SourceRole[] = ['backend', 'gateway', 'mcp', 'frontend'];
export interface SourceOwnership {
  readonly format: 'isolated-ci-owned-source';
  readonly version: 1;
  readonly id: string;
  readonly name: 'wbs-dev-src';
  readonly created: string;
  readonly imageId: string;
  readonly reference: string;
  readonly nonce: string;
  readonly sourceSha: string;
  readonly manifestSha256: string;
  readonly dependencySha256: string;
  readonly configurationSha256: string;
}
interface Namespaces {
  readonly pid: string;
  readonly net: string;
  readonly mnt: string;
}
interface Executable {
  readonly device: string;
  readonly inode: string;
  readonly sha256: string;
}
interface Listener {
  readonly family: 'ipv4' | 'ipv6';
  readonly address: string;
  readonly port: number;
  readonly inode: string;
  readonly descriptor: number;
}
export interface SourceProcess {
  readonly pid: number;
  readonly innerPid: number;
  readonly parentPid: number;
  readonly parentStart: string;
  readonly start: string;
  readonly uids: readonly number[];
  readonly gids: readonly number[];
  readonly cgroup: string;
  readonly namespaces: Namespaces;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly executablePath: string;
  readonly executable: Executable;
  readonly listeners: readonly Listener[];
}
export interface SourceOutputParent {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly members: readonly string[];
}
interface SourceOutput {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly mode: number;
  readonly sha256: string | null;
}
export interface SourceCapture {
  readonly format: 'isolated-ci-source-capture';
  readonly version: 1;
  readonly source: SourceOwnership;
  readonly running: boolean;
  readonly initPid: number;
  readonly initStart: string;
  readonly namespaces: Namespaces | null;
  readonly processes: readonly SourceProcess[];
  readonly outputParents: readonly SourceOutputParent[];
  readonly outputs: readonly SourceOutput[];
}
function refuse(): never {
  throw new Error('Source profile evidence refused');
}
function string(value: unknown, maximum = 4096): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value) > maximum ||
    value.includes('\0')
  )
    refuse();
  return value;
}
function match(value: unknown, pattern: RegExp): string {
  const text = string(value);
  if (!pattern.test(text)) refuse();
  return text;
}
function integer(value: unknown, minimum = 0, maximum = 4294967295): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    refuse();
  return value;
}
function array(value: unknown, maximum: number): readonly unknown[] {
  // Proof: dropping the array bound admitted 257 processes; malformed kernel evidence negative failed.
  if (!Array.isArray(value) || value.length > maximum) refuse();
  return value;
}
function unique<T>(values: readonly T[]): readonly T[] {
  if (new Set(values).size !== values.length) refuse();
  return values;
}
function path(value: unknown): string {
  const text = string(value);
  if (!text.startsWith('/') || posix.normalize(text) !== text || text.endsWith(' (deleted)'))
    refuse();
  return text;
}
function decimal(value: unknown): string {
  return match(value, /^(?:0|[1-9][0-9]*)$/);
}
function hash(value: unknown): string {
  return match(value, /^[a-f0-9]{64}$/);
}
function namespaces(value: unknown): Namespaces {
  const fields = readClosed(value, ['pid', 'net', 'mnt']);
  return Object.freeze({
    pid: match(fields['pid'], /^pid:\[[1-9][0-9]*\]$/),
    net: match(fields['net'], /^net:\[[1-9][0-9]*\]$/),
    mnt: match(fields['mnt'], /^mnt:\[[1-9][0-9]*\]$/),
  });
}
function equal(left: unknown, right: unknown): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) refuse();
}

/** Decodes a private creation receipt, never an authority token. The provider must independently establish each creation and fresh Docker readback. */
export function decodeSourceOwnership(value: unknown): SourceOwnership {
  // Proof: allowing unknown ownership keys admitted program; the closed ownership packet negative failed.
  const fields = readClosed(value, [
    'format',
    'version',
    'id',
    'name',
    'created',
    'imageId',
    'reference',
    'nonce',
    'sourceSha',
    'manifestSha256',
    'dependencySha256',
    'configurationSha256',
  ]);
  if (
    fields['format'] !== 'isolated-ci-owned-source' ||
    fields['version'] !== 1 ||
    fields['name'] !== 'wbs-dev-src'
  )
    refuse();
  const created = string(fields['created']);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/.test(created) ||
    !Number.isFinite(Date.parse(created))
  )
    refuse();
  return Object.freeze({
    format: 'isolated-ci-owned-source',
    version: 1,
    id: hash(fields['id']),
    name: 'wbs-dev-src',
    created,
    imageId: match(fields['imageId'], /^sha256:[a-f0-9]{64}$/),
    reference: match(fields['reference'], /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/),
    nonce: match(fields['nonce'], /^[a-f0-9]{32}$/),
    sourceSha: match(fields['sourceSha'], /^[a-f0-9]{40}$/),
    manifestSha256: hash(fields['manifestSha256']),
    dependencySha256: hash(fields['dependencySha256']),
    configurationSha256: hash(fields['configurationSha256']),
  });
}
function listener(value: unknown): Listener {
  const fields = readClosed(value, ['family', 'address', 'port', 'inode', 'descriptor']);
  const family = fields['family'];
  if (family !== 'ipv4' && family !== 'ipv6') refuse();
  return Object.freeze({
    family,
    address: string(fields['address'], 128),
    port: integer(fields['port'], 1, 65535),
    inode: match(fields['inode'], /^[1-9][0-9]*$/),
    descriptor: integer(fields['descriptor'], 0, 1048576),
  });
}
function processObservation(value: unknown): SourceProcess {
  const fields = readClosed(value, [
    'pid',
    'innerPid',
    'parentPid',
    'parentStart',
    'start',
    'uids',
    'gids',
    'cgroup',
    'namespaces',
    'argv',
    'cwd',
    'executablePath',
    'executable',
    'listeners',
  ]);
  const executable = readClosed(fields['executable'], ['device', 'inode', 'sha256']);
  const uids = array(fields['uids'], 4).map((uid) => integer(uid));
  const gids = array(fields['gids'], 4).map((gid) => integer(gid));
  const argv = array(fields['argv'], 4096).map((argument) => {
    if (argument === '') return '';
    return string(argument, 65536);
  });
  if (uids.length !== 4 || gids.length !== 4 || argv.length === 0 || argv[0] === '') refuse();
  const listeners = array(fields['listeners'], 64).map(listener);
  unique(listeners.map((entry) => `${entry.family}:${entry.inode}:${String(entry.descriptor)}`));
  return Object.freeze({
    pid: integer(fields['pid'], 1),
    innerPid: integer(fields['innerPid'], 1),
    parentPid: integer(fields['parentPid'], 1),
    parentStart: decimal(fields['parentStart']),
    start: decimal(fields['start']),
    uids: Object.freeze(uids),
    gids: Object.freeze(gids),
    cgroup: path(fields['cgroup']),
    namespaces: namespaces(fields['namespaces']),
    argv: Object.freeze(argv),
    cwd: path(fields['cwd']),
    executablePath: path(fields['executablePath']),
    executable: Object.freeze({
      device: decimal(executable['device']),
      inode: decimal(executable['inode']),
      sha256: hash(executable['sha256']),
    }),
    listeners: Object.freeze(listeners),
  });
}
function outputParent(value: unknown): SourceOutputParent {
  const fields = readClosed(value, ['path', 'device', 'inode', 'mode', 'members']);
  const members = array(fields['members'], 8192).map((member) => {
    const name = string(member, 255);
    if (name === '.' || name === '..' || name.includes('/')) refuse();
    return name;
  });
  return Object.freeze({
    path: path(fields['path']),
    device: decimal(fields['device']),
    inode: decimal(fields['inode']),
    mode: integer(fields['mode'], 0, 4095),
    members: Object.freeze([...unique(members)].sort()),
  });
}
function output(value: unknown): SourceOutput {
  const fields = readClosed(value, ['path', 'kind', 'mode', 'sha256']);
  const kind = fields['kind'];
  if (kind !== 'file' && kind !== 'directory') refuse();
  const sha256 = kind === 'file' ? hash(fields['sha256']) : null;
  if (kind === 'directory' && fields['sha256'] !== null) refuse();
  return Object.freeze({
    path: path(fields['path']),
    kind,
    mode: integer(fields['mode'], 0, 4095),
    sha256,
  });
}
/** Bounded raw capture decoder. Raw process/argv/output evidence remains private; successful decoding alone proves no native observation or monitor success. */
export function decodeSourceCapture(value: unknown, owned: SourceOwnership): SourceCapture {
  if (Buffer.byteLength(JSON.stringify(value)) > 8 * 2 ** 20) refuse();
  const fields = readClosed(value, [
    'format',
    'version',
    'source',
    'running',
    'initPid',
    'initStart',
    'namespaces',
    'processes',
    'outputParents',
    'outputs',
  ]);
  if (
    fields['format'] !== 'isolated-ci-source-capture' ||
    fields['version'] !== 1 ||
    typeof fields['running'] !== 'boolean'
  )
    refuse();
  const source = decodeSourceOwnership(fields['source']);
  // Proof: omitting this join admitted a changed fixture nonce; capture ownership drift negative failed.
  equal(owned, source);
  const processes = array(fields['processes'], 256).map(processObservation);
  const outputParents = array(fields['outputParents'], 256).map(outputParent);
  const outputs = array(fields['outputs'], 8192).map(output);
  unique(processes.map((process) => process.pid));
  unique(processes.map((process) => process.innerPid));
  unique(outputParents.map((parent) => parent.path));
  unique(outputs.map((entry) => entry.path));
  const running = fields['running'];
  if (
    // Proof: omitting cold separation admitted running process/output records as cold; cold-baseline negative failed.
    !running &&
    (fields['initPid'] !== 0 ||
      fields['initStart'] !== '0' ||
      fields['namespaces'] !== null ||
      processes.length !== 0 ||
      outputs.length !== 0)
  )
    refuse();
  return Object.freeze({
    format: 'isolated-ci-source-capture',
    version: 1,
    source,
    running,
    initPid: integer(fields['initPid'], running ? 1 : 0),
    initStart: decimal(fields['initStart']),
    namespaces: running ? namespaces(fields['namespaces']) : null,
    processes: Object.freeze(processes),
    outputParents: Object.freeze(outputParents),
    outputs: Object.freeze(outputs),
  });
}
const ROLE_DIRECTORIES: Readonly<Record<SourceRole, string>> = {
  backend: 'be-01',
  gateway: 'gw-01',
  mcp: 'mcp-01',
  frontend: 'fe-01',
};
/** Candidate labels require the retained configuration's port, role directory, namespace and observed parent identity. Unknown launchers remain in the private roster; no argv grammar is inferred or admitted. */
export function latchSourceRoleCandidates(
  latched: Readonly<Partial<Record<SourceRole, SourceProcess>>>,
  capture: SourceCapture,
  ports: Readonly<Record<SourceRole, number>>,
): Readonly<Partial<Record<SourceRole, SourceProcess>>> {
  if (!capture.running) refuse();
  const initRows = capture.processes.filter((process) => process.pid === capture.initPid);
  const init = initRows.at(0);
  // Proof: omitting cardinality accepted duplicate full init rows; typed-binder init negative failed.
  if (initRows.length !== 1 || init === undefined) refuse();
  // Proof: omitting this join accepted a contradictory declared start with valid ancestry; top-level init-start negative failed.
  if (init.start !== capture.initStart) refuse();
  // Proof: omitting this check accepted unique inner PID9 for init and role PID1; init-inner-PID negative failed.
  if (init.innerPid !== 1) refuse();
  // Proof: omitting the external-parent requirement accepted init pointing to its own child; external-parent negative failed.
  if (capture.processes.some((process) => process.pid === init.parentPid)) refuse();
  // Proof: omitting complete-roster ancestry admitted an orphan watcher and self-parent cycle; ancestry negative failed.
  for (const process of capture.processes) {
    // Proof: omitting the full-roster namespace join accepted foreign init PID namespace; init-namespace negative failed.
    equal(process.namespaces, capture.namespaces);
    const ancestors = new Set<number>();
    let current = process;
    while (current.pid !== init.pid) {
      if (ancestors.has(current.pid)) refuse();
      ancestors.add(current.pid);
      const parent = capture.processes.find((candidate) => candidate.pid === current.parentPid);
      // Proof: omitting the actual parent-start join accepted an intermediate launcher with wrong init start; indirect-ancestry negative failed.
      if (parent?.start !== current.parentStart) refuse();
      current = parent;
    }
  }
  const bindings: Partial<Record<SourceRole, SourceProcess>> = {};
  for (const role of SOURCE_ROLES) {
    const port = integer(ports[role], 1, 65535);
    const listeners = capture.processes.filter((process) =>
      process.listeners.some((entry) => entry.port === port),
    );
    // Proof: omitting ambiguity refusal admitted duplicate applications; role-binding negative failed.
    if (listeners.length > 1) refuse();
    const candidate = listeners.at(0);
    const previous = latched[role];
    // Proof: omitting the partial latch admitted a replacement while frontend was absent; startup rebaseline negative failed.
    if (previous !== undefined) equal(previous, candidate);
    if (candidate === undefined) continue;
    if (
      // Proof: omitting directory binding admitted a sole foreign application at backend port; foreign-application negative failed.
      // Proof: omitting the init-role exclusion admitted launcher init as backend; launcher role-label negative failed.
      candidate.pid === init.pid ||
      candidate.cwd !== `/src/apps/wbs/${ROLE_DIRECTORIES[role]}` ||
      candidate.uids.some((uid) => uid !== 1000) ||
      candidate.gids.some((gid) => gid !== 1000)
    )
      refuse();
    equal(candidate.namespaces, capture.namespaces);
    bindings[role] = candidate;
  }
  return Object.freeze(bindings);
}
/** Requires all four unambiguous applications after validating the complete persistent roster. */
export function bindSourceRoles(
  capture: SourceCapture,
  ports: Readonly<Record<SourceRole, number>>,
): Readonly<Record<SourceRole, SourceProcess>> {
  const { backend, gateway, mcp, frontend } = latchSourceRoleCandidates({}, capture, ports);
  if (backend === undefined || gateway === undefined || mcp === undefined || frontend === undefined)
    refuse();
  unique([backend.pid, gateway.pid, mcp.pid, frontend.pid]);
  return Object.freeze({ backend, gateway, mcp, frontend });
}
/** Stable samples preserve every persistent process and socket binding. A changed identity is a refusal and never a replacement baseline. */
export function assertSourceLatch(first: SourceCapture, repeated: SourceCapture): void {
  equal(first.source, repeated.source);
  equal(
    [first.running, first.initPid, first.initStart, first.namespaces],
    [repeated.running, repeated.initPid, repeated.initStart, repeated.namespaces],
  );
  // Proof: omitting this roster comparison admitted changed process start; excluding only init also admitted executable-inode drift; stable-latch and stable-init negatives failed.
  equal(
    [...first.processes].sort((left, right) => left.pid - right.pid),
    [...repeated.processes].sort((left, right) => left.pid - right.pid),
  );
}
/** Generated membership may change; each original output parent must retain its path/device/inode/mode. The unchanged production running monitor decides whether actual output paths/bytes are supported. */
export function assertSourceOutputParents(
  cold: readonly SourceOutputParent[],
  running: readonly SourceOutputParent[],
): void {
  const identity = (parent: SourceOutputParent) => ({
    path: parent.path,
    device: parent.device,
    // Proof: dropping inode from this projection admitted parent replacement; output-parent negative failed.
    inode: parent.inode,
    mode: parent.mode,
  });
  equal(
    cold.map(identity).sort((left, right) => left.path.localeCompare(right.path)),
    running.map(identity).sort((left, right) => left.path.localeCompare(right.path)),
  );
}
export type SourceProfileReason =
  | 'complete'
  | 'provider-incomplete'
  | 'authorization-required'
  | 'permission-profile'
  | 'role-binding'
  | 'identity-drift'
  | 'output-profile'
  | 'bounded-capture'
  | 'monitor-refused'
  | 'ownership'
  | 'io-failure';
export type SourceProfileStatus = 'measured' | 'unsupported' | 'unexecuted';
export interface SourceProfileSummary {
  readonly case: 'B2-source-profile';
  readonly status: SourceProfileStatus;
  readonly reason: SourceProfileReason;
  readonly admission: 'not-granted';
  readonly cleanup: 'proved' | 'unproved';
}
/** Reconstructs a closed public receipt from finite enums only. Arbitrary exceptions, capture records and sentinel text have no serialization path. */
export function sourceProfileSummary(
  status: SourceProfileStatus,
  reason: SourceProfileReason,
  cleanup: 'proved' | 'unproved',
): SourceProfileSummary {
  const reasons: readonly SourceProfileReason[] = [
    'complete',
    'provider-incomplete',
    'authorization-required',
    'permission-profile',
    'role-binding',
    'identity-drift',
    'output-profile',
    'bounded-capture',
    'monitor-refused',
    'ownership',
    'io-failure',
  ];
  if (
    !['measured', 'unsupported', 'unexecuted'].includes(status) ||
    // Proof: omitting this enum check admitted a private sentinel reason; private-sentinel negative failed.
    !reasons.includes(reason) ||
    !['proved', 'unproved'].includes(cleanup)
  )
    refuse();
  // Proof: allowing unproved cleanup admitted a measured receipt; public-summary negative failed.
  if (status === 'measured' ? reason !== 'complete' || cleanup !== 'proved' : reason === 'complete')
    refuse();
  if (
    status === 'unexecuted'
      ? !['provider-incomplete', 'authorization-required'].includes(reason)
      : ['provider-incomplete', 'authorization-required'].includes(reason)
  )
    refuse();
  return Object.freeze({
    case: 'B2-source-profile',
    status,
    reason,
    admission: 'not-granted',
    cleanup,
  });
}
export type SourceChannelOperation =
  | 'capture-owned-source'
  | 'acknowledge-source-start'
  | 'stop-join-owned-source'
  | 'finalize-evidence';
export interface SourceChannelRequest {
  readonly version: 1;
  readonly nonce: string;
  readonly sequence: number;
  readonly operation: SourceChannelOperation;
}
export type SourceChannelReply =
  | { readonly status: 'captured'; readonly capture: SourceCapture }
  | { readonly status: 'acknowledged' }
  | {
      readonly status: 'stopped';
      readonly proof: {
        readonly sourceStopped: true;
        readonly processesAbsent: true;
        readonly listenersClosed: true;
        readonly helpersJoined: true;
      };
    }
  | { readonly status: 'finalized' }
  | { readonly status: 'refused'; readonly reason: SourceProfileReason };
/** Builds a target-free operation bound to the one provider journal nonce and strict sequence. */
export function sourceChannelRequest(
  nonce: string,
  sequence: number,
  operation: SourceChannelOperation,
): SourceChannelRequest {
  match(nonce, /^[a-f0-9]{32}$/);
  integer(sequence, 1, 64);
  if (
    ![
      'capture-owned-source',
      'acknowledge-source-start',
      'stop-join-owned-source',
      'finalize-evidence',
    ].includes(operation)
  )
    refuse();
  return Object.freeze({ version: 1, nonce, sequence, operation });
}
/** Requires exact frame correlation and a complete operation-specific proof. A frame remains instrument evidence; the provider implementation must actually perform and read back each effect. */
export function decodeSourceChannelReply(
  value: unknown,
  request: SourceChannelRequest,
  owned: SourceOwnership,
): SourceChannelReply {
  if (Buffer.byteLength(JSON.stringify(value)) > 8 * 2 ** 20) refuse();
  const identity = ['version', 'nonce', 'sequence', 'operation', 'status'];
  const raw = readClosed(
    value,
    (() => {
      if (typeof value !== 'object' || value === null || !('status' in value)) refuse();
      if (value.status === 'refused') return [...identity, 'reason'];
      if (request.operation === 'capture-owned-source') return [...identity, 'capture'];
      if (request.operation === 'stop-join-owned-source') return [...identity, 'proof'];
      return identity;
    })(),
  );
  // Proof: omitting correlation admitted a different sequence; channel identity negative failed.
  equal(
    [raw['version'], raw['nonce'], raw['sequence'], raw['operation']],
    [request.version, request.nonce, request.sequence, request.operation],
  );
  if (raw['status'] === 'refused') {
    const reason = string(raw['reason']);
    if (
      ![
        'permission-profile',
        'role-binding',
        'identity-drift',
        'output-profile',
        'bounded-capture',
        'monitor-refused',
        'ownership',
        'io-failure',
      ].includes(reason)
    )
      refuse();
    // Exact membership in the finite reason roster is checked above.
    return Object.freeze({ status: 'refused', reason: reason as SourceProfileReason });
  }
  if (request.operation === 'capture-owned-source' && raw['status'] === 'captured')
    return Object.freeze({
      status: 'captured',
      capture: decodeSourceCapture(raw['capture'], owned),
    });
  if (request.operation === 'acknowledge-source-start' && raw['status'] === 'acknowledged')
    return Object.freeze({ status: 'acknowledged' });
  if (request.operation === 'stop-join-owned-source' && raw['status'] === 'stopped') {
    const proof = readClosed(raw['proof'], [
      'sourceStopped',
      'processesAbsent',
      'listenersClosed',
      'helpersJoined',
    ]);
    // Proof: accepting false process absence admitted incomplete stop proof; stop/join ordering negative failed.
    if (Object.values(proof).some((verified) => verified !== true)) refuse();
    return Object.freeze({
      status: 'stopped',
      proof: Object.freeze({
        sourceStopped: true,
        processesAbsent: true,
        listenersClosed: true,
        helpersJoined: true,
      }),
    });
  }
  if (request.operation === 'finalize-evidence' && raw['status'] === 'finalized')
    return Object.freeze({ status: 'finalized' });
  return refuse();
}
export type SourceSequence = 'cold' | 'acknowledged' | 'running' | 'stopped' | 'finalized';
/** A finite runner sequence keeps stop/join ahead of finalization and preparation release. Stop is permitted from every live phase for failure recovery. */
export function advanceSourceSequence(
  phase: SourceSequence,
  operation: SourceChannelOperation,
): SourceSequence {
  if (operation === 'stop-join-owned-source' && ['cold', 'acknowledged', 'running'].includes(phase))
    return 'stopped';
  if (operation === 'capture-owned-source' && phase === 'cold') return 'cold';
  if (operation === 'acknowledge-source-start' && phase === 'cold') return 'acknowledged';
  if (operation === 'capture-owned-source' && ['acknowledged', 'running'].includes(phase))
    return 'running';
  if (operation === 'finalize-evidence' && phase === 'stopped') return 'finalized';
  return refuse();
}
export interface SourceProfilePacket {
  readonly format: 'isolated-ci-source-profile';
  readonly version: 1;
  readonly source: SourceOwnership;
  readonly workflowSha: string;
  readonly inputManifestSha256: string;
  readonly recipientFingerprint: string;
  readonly pins: SourceDevPins;
  readonly configuration: SourceRestorationConfiguration;
  readonly openapiSha256: string;
}
/** A distinct B2 packet joins independently created source pins; runtime authority still comes solely from the original consumed context. */
export function decodeSourceProfilePacket(value: unknown): SourceProfilePacket {
  const fields = readClosed(value, [
    'format',
    'version',
    'source',
    'workflowSha',
    'inputManifestSha256',
    'recipientFingerprint',
    'pins',
    'configuration',
    'openapiSha256',
  ]);
  if (fields['format'] !== 'isolated-ci-source-profile' || fields['version'] !== 1) refuse();
  const source = decodeSourceOwnership(fields['source']);
  const pins = decodeSourceDevPins(fields['pins']);
  // Proof: omitting source/pin equality admitted a foreign runtime image; B2 packet pin negative failed.
  equal(
    [source.sourceSha, source.imageId, source.manifestSha256, source.configurationSha256],
    [pins.sourceSha, pins.runtimeImageId, pins.manifestSha256, pins.environmentSha256],
  );
  const configuration = readClosed(fields['configuration'], [
    'ports',
    'gatewayBackend',
    'mcpBackend',
    'frontendBackend',
    'frontendGateway',
  ]);
  const portFields = readClosed(configuration['ports'], [...SOURCE_ROLES]);
  const ports = {
    backend: integer(portFields['backend'], 1, 65535),
    gateway: integer(portFields['gateway'], 1, 65535),
    mcp: integer(portFields['mcp'], 1, 65535),
    frontend: integer(portFields['frontend'], 1, 65535),
  };
  equal(ports, { backend: 3100, gateway: 3200, mcp: 3300, frontend: 4200 });
  return Object.freeze({
    format: 'isolated-ci-source-profile',
    version: 1,
    source,
    workflowSha: match(fields['workflowSha'], /^[a-f0-9]{40}$/),
    inputManifestSha256: hash(fields['inputManifestSha256']),
    recipientFingerprint: hash(fields['recipientFingerprint']),
    pins: Object.freeze(pins),
    configuration: Object.freeze({
      ports: Object.freeze(ports),
      gatewayBackend: string(configuration['gatewayBackend']),
      mcpBackend: string(configuration['mcpBackend']),
      frontendBackend: string(configuration['frontendBackend']),
      frontendGateway: string(configuration['frontendGateway']),
    }),
    openapiSha256: hash(fields['openapiSha256']),
  });
}
export interface SourceProviderChannel {
  /** Only inherited, nonce-bound finite operation frames; no arbitrary targets or command callback. */
  exchange(request: SourceChannelRequest, deadline: number): Promise<unknown>;
  /** Close inherited descriptors, terminate if needed and join the exact owned channel helper. */
  closeAndJoin(deadline: number): Promise<void>;
}
export interface SourceMeasurementPhase {
  readonly observation: 'collected' | 'unsupported';
  readonly reason: SourceProfileReason;
  readonly sourceCleanup: 'proved' | 'unproved';
  readonly channelCleanup: 'proved' | 'unproved';
  readonly captures: readonly SourceCapture[];
  readonly observers: readonly {
    readonly role: SourceRole;
    readonly process: ParticipantProcessObservation;
    readonly listener: SourceParticipantListener;
  }[];
  readonly failures: readonly unknown[];
}
class SourceMeasurementRefusal extends Error {
  constructor(
    readonly reason: SourceProfileReason,
    cause?: unknown,
  ) {
    super('Source measurement refused; inspect private evidence', { cause });
  }
}
/** Genuine same-owner B2 phase only. This never releases preparation, restores policy or produces an accepted public receipt. All returned evidence, including failures, is private. Root-provider completion and cleanup are still required. */
export async function measureSourceProfile(
  context: FinalizedParticipantRestorationContext,
  packet: SourceProfilePacket,
  channel: SourceProviderChannel,
): Promise<SourceMeasurementPhase> {
  // Proof: removing this initial call returned from a forged context and touched close; actual measurement guard negative failed.
  await assertParticipantRestorationContext(context);
  let phase: SourceSequence = 'cold';
  let sequence = 0;
  let bytes = 0;
  let reason: SourceProfileReason = 'io-failure';
  let observation: 'collected' | 'unsupported' = 'unsupported';
  let sourceCleanup: 'proved' | 'unproved' = 'unproved';
  let channelCleanup: 'proved' | 'unproved' = 'unproved';
  const captures: SourceCapture[] = [];
  const observers: {
    role: SourceRole;
    process: ParticipantProcessObservation;
    listener: SourceParticipantListener;
  }[] = [];
  const failures: unknown[] = [];
  const workDeadline = Math.min(context.deadline - 120000, performance.now() + 60000);
  async function check() {
    if (!Number.isFinite(workDeadline) || performance.now() >= workDeadline)
      throw new SourceMeasurementRefusal('bounded-capture');
    await assertParticipantRestorationContext(context);
  }
  async function operation(operation: SourceChannelOperation): Promise<SourceChannelReply> {
    const next = advanceSourceSequence(phase, operation);
    const request = sourceChannelRequest(packet.source.nonce, ++sequence, operation);
    const raw = await channel.exchange(
      request,
      operation === 'stop-join-owned-source' || operation === 'finalize-evidence'
        ? context.deadline
        : workDeadline,
    );
    bytes += Buffer.byteLength(JSON.stringify(raw));
    if (bytes > 96 * 2 ** 20) throw new SourceMeasurementRefusal('bounded-capture');
    const reply = decodeSourceChannelReply(raw, request, packet.source);
    if (reply.status === 'refused') throw new SourceMeasurementRefusal(reply.reason);
    phase = next;
    if (reply.status === 'captured') captures.push(reply.capture);
    return reply;
  }
  async function capture(): Promise<SourceCapture> {
    await check();
    const reply = await operation('capture-owned-source');
    if (reply.status !== 'captured') throw new SourceMeasurementRefusal('bounded-capture');
    return reply.capture;
  }
  async function cleanup(): Promise<void> {
    try {
      const reply = await operation('stop-join-owned-source');
      if (reply.status !== 'stopped') throw new SourceMeasurementRefusal('io-failure');
      sourceCleanup = 'proved';
      const finalized = await operation('finalize-evidence');
      if (finalized.status !== 'finalized') throw new SourceMeasurementRefusal('io-failure');
    } catch (cause) {
      failures.push(cause);
    }
    try {
      await channel.closeAndJoin(context.deadline);
      channelCleanup = 'proved';
    } catch (cause) {
      failures.push(cause);
    }
  }
  try {
    if (
      process.getuid?.() !== 1000 ||
      process.geteuid?.() !== 1000 ||
      process.getgid?.() !== 1000 ||
      process.getegid?.() !== 1000
    )
      throw new SourceMeasurementRefusal('permission-profile');
    packet = decodeSourceProfilePacket(packet);
    reason = 'ownership';
    const selected = context.participants.selected.source;
    equal(
      [
        packet.source.id,
        packet.source.reference,
        packet.source.imageId,
        packet.source.manifestSha256,
        packet.source.configurationSha256,
        packet.source.sourceSha,
      ],
      [
        selected.id,
        selected.runtimeReference,
        selected.runtimeImageId,
        selected.manifestSha256,
        selected.environmentSha256,
        context.participants.sourceSha,
      ],
    );
    equal(packet.configuration, context.source.configuration);
    equal(packet.openapiSha256, context.source.openapiSha256);
    const cold = await capture();
    if (cold.running) throw new SourceMeasurementRefusal('ownership');
    assertSourceOutputCoverage(cold, context.source.openapiSha256);
    await context.source.inspectCold();
    await context.storage.evidence.inspect();
    await context.storage.stores.inspect();
    await operation('acknowledge-source-start');
    await check();
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        controller.abort();
      },
      Math.min(15000, workDeadline - performance.now()),
    );
    try {
      await ownerDockerHashed(
        context.owner,
        context.layouts.dev,
        runDockerCli,
      )(['--host', 'unix:///var/run/docker.sock', 'start', selected.id], controller.signal);
    } finally {
      clearTimeout(timer);
    }
    let first: SourceCapture | undefined;
    let init: readonly unknown[] | undefined;
    let candidates: Readonly<Partial<Record<SourceRole, SourceProcess>>> = {};
    const startupDeadline = Math.min(workDeadline, performance.now() + 30000);
    for (let sample = 0; sample < 8; sample++) {
      const current = await capture();
      if (!current.running) throw new SourceMeasurementRefusal('ownership');
      const observedInit = [current.initPid, current.initStart, current.namespaces];
      if (init === undefined) init = observedInit;
      else equal(init, observedInit);
      reason = 'role-binding';
      candidates = latchSourceRoleCandidates(candidates, current, packet.configuration.ports);
      if (SOURCE_ROLES.every((role) => candidates[role] !== undefined)) {
        first = current;
        break;
      }
      if (sample === 7 || performance.now() + 4000 >= startupDeadline)
        throw new SourceMeasurementRefusal('role-binding');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 4000);
      });
    }
    if (first === undefined) throw new SourceMeasurementRefusal('role-binding');
    reason = 'role-binding';
    const roles = bindSourceRoles(first, context.source.configuration.ports);
    reason = 'permission-profile';
    for (const role of SOURCE_ROLES) {
      await check();
      const candidate = roles[role];
      reason = 'permission-profile';
      const observed = await observeParticipantProcess(candidate.pid, workDeadline);
      const listener = await observeSourceParticipantListener(
        candidate.pid,
        context.source.configuration.ports[role],
        workDeadline,
      );
      reason = 'identity-drift';
      equal(observed.identity, {
        pid: candidate.pid,
        startTime: candidate.start,
        uid: 1000,
        cgroup: candidate.cgroup,
        executable: candidate.executable,
        argvSha256: createHash('sha256')
          .update(candidate.argv.join('\0') + '\0')
          .digest('hex'),
        cwd: candidate.cwd,
      });
      equal(observed.argv, candidate.argv);
      equal(observed.executablePath, candidate.executablePath);
      equal(listener.process, observed.identity);
      equal(listener.namespaces, candidate.namespaces);
      equal(
        listener.listeners,
        [...candidate.listeners]
          .filter((entry) => entry.port === context.source.configuration.ports[role])
          .sort((left, right) => left.inode.localeCompare(right.inode)),
      );
      observers.push({ role, process: observed, listener });
    }
    reason = 'identity-drift';
    const repeated = await capture();
    assertSourceLatch(first, repeated);
    bindSourceRoles(repeated, context.source.configuration.ports);
    reason = 'output-profile';
    assertSourceOutputParents(cold.outputParents, repeated.outputParents);
    assertSourceOutputCoverage(repeated, context.source.openapiSha256);
    reason = 'monitor-refused';
    await context.source.inspectRunning();
    await check();
    await context.storage.evidence.inspect();
    await context.storage.stores.inspect();
    observation = 'collected';
    reason = 'complete';
  } catch (cause) {
    if (cause instanceof SourceMeasurementRefusal) reason = cause.reason;
    failures.push(cause);
  } finally {
    await cleanup();
  }
  if (observation === 'collected' && failures.length > 0) {
    observation = 'unsupported';
    reason = 'io-failure';
  }
  return Object.freeze({
    observation,
    reason,
    sourceCleanup,
    channelCleanup,
    captures: Object.freeze(captures),
    observers: Object.freeze(observers),
    failures: Object.freeze(failures),
  });
}
/** Root-provider request boundary: exact fields, one journal nonce and the next expected sequence only. */
export function decodeSourceChannelRequest(
  value: unknown,
  nonce: string,
  sequence: number,
): SourceChannelRequest {
  const fields = readClosed(value, ['version', 'nonce', 'sequence', 'operation']);
  // Proof: dropping correlation admitted replayed sequence1 when2 was required; provider-request negative failed.
  equal([fields['version'], fields['nonce'], fields['sequence']], [1, nonce, sequence]);
  const operation = string(fields['operation']);
  if (
    operation !== 'capture-owned-source' &&
    operation !== 'acknowledge-source-start' &&
    operation !== 'stop-join-owned-source' &&
    operation !== 'finalize-evidence'
  )
    refuse();
  return sourceChannelRequest(nonce, sequence, operation);
}
/** Requires raw observations for the fixed direct output parents used by the existing startup monitor, plus exact independently emitted OpenAPI bytes when running. This adds no permitted output root. */
export function assertSourceOutputCoverage(capture: SourceCapture, openapiSha256: string): void {
  // Proof: omitting parent coverage admitted an empty parent roster with valid OpenAPI; raw-output coverage negative failed.
  equal(
    capture.outputParents.map((parent) => parent.path).sort(),
    ['/src', '/src/node_modules', '/src/apps/wbs/fe-01', '/src/apps/wbs/mcp-01/src'].sort(),
  );
  if (capture.running) {
    const openapi = capture.outputs.find(
      (entry) => entry.path === '/src/apps/wbs/mcp-01/src/openapi.json',
    );
    // Proof: omitting emitted-byte coverage admitted absent/wrong-hash OpenAPI; raw-output coverage negative failed.
    if (openapi?.kind !== 'file' || openapi.sha256 !== openapiSha256) refuse();
  }
}
