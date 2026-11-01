import { createHash } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  opendirSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { parseDependencyReceipt } from '@wbs/contracts/dependency-runtime';

import { parseBackendCohort, parseGatewayBinding } from './backend-cohort';
import {
  type CompleteDependencyActivationRequest,
  decodeCompleteDependencyActivationRequest,
} from './dependency-complete-activation';
import { decodeDependencyMigrationManifest } from './dependency-migration-artifact';
import { readParticipantRestartPolicy } from './dependency-participant-transition';
import { openDirectoryFile } from './directory-file';
import { decodeDependencyOwnerPublication } from './edge-ownership';
import { captureSolverRestorationCompletion, type EdgePolicySnapshot } from './edge-policy';
import { envLayout, type EnvName } from './env';
import { decodeInstalledAuthorityPins } from './installed-authorities';
import { decodeWriterManifest, type WriterManifest } from './installed-writers';
import {
  assertExcluded,
  assertSame,
  parseManagedCohort,
  projectIdentities,
  readClosed,
  readDigest,
  readFields,
  readIdentity,
  readInteger,
  readString,
} from './managed-cohort';
import { parseMigrationSetCapture } from './migration-capture';
import type { SolverFile } from './solver-host';
import { decodeRuntimeLaunchPins, type RuntimeLaunchPins } from './solver-launch-observation';
import { decodeSolverRestoration, type SolverRestorationImage } from './solver-restoration';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_UNIT,
} from './solver-supervisor-install-contract';
import { decodeSourceDevPins, decodeSourceStartupManifest } from './source-startup-manifest';

type Fields = Record<string, unknown>;
interface Reference {
  readonly name: string;
  readonly sha256: string;
}
interface CapturedFile {
  readonly path: string;
  readonly parent: HeldDirectory;
  readonly descriptor: number;
  readonly identity: BigIntStats;
  readonly sha256: string;
  readonly contents: string | undefined;
  readonly maximum: number;
}
interface HeldDirectory {
  readonly path: string;
  readonly descriptor: number;
  readonly identity: BigIntStats;
}
const MIB = 1024 * 1024;
const FENCES = [
  ['dev', 'dependency-source-dev-intent.json'],
  ['dev', 'dependency-source-dev-complete.json'],
  ['prod', 'dependency-backend-fence.json'],
  ['prod', 'dependency-backend-intent.json'],
  ['prod', 'dependency-backend-complete.json'],
  ['prod', 'dependency-gateway-fence.json'],
  ['prod', 'dependency-gateway-intent.json'],
  ['prod', 'dependency-gateway-complete.json'],
] as const;

function hashBytes(contents: Uint8Array | string): string {
  return createHash('sha256').update(contents).digest('hex');
}
function refuseGraph(reason: string): never {
  throw new Error('initial handoff ' + reason);
}
function readHash(value: unknown): string {
  const text = readString(value);
  if (!/^[a-f0-9]{64}$/.test(text)) refuseGraph('digest malformed');
  return text;
}
function readDecimal(value: unknown): string {
  const text = readString(value);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) refuseGraph('identity malformed');
  return text;
}
function readRoster(value: unknown, maximum = 128): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) refuseGraph('roster malformed');
  return value.map((entry: unknown) => entry);
}
function parseJson(contents: string): unknown {
  return JSON.parse(contents);
}
function readSequence(name: string): bigint {
  const matched = /^edge-owner-([0-9]{6,12})-/.exec(name);
  const number = matched?.[1];
  if (number === undefined) refuseGraph('record sequence malformed');
  return BigInt(number);
}
function decodeReference(value: unknown, label: string): Reference {
  const fields = readClosed(value, ['name', 'sha256']);
  const name = readString(fields['name']);
  if (!new RegExp('^edge-owner-[0-9]{6,12}-' + label + '\\.json$').test(name))
    refuseGraph('reference family differs');
  return { name, sha256: readHash(fields['sha256']) };
}
function decodeRecord(value: unknown, format: string, keys: string[], version = 1): Fields {
  const fields = readClosed(value, ['format', 'version', ...keys]);
  if (fields['format'] !== format || fields['version'] !== version)
    refuseGraph('record format differs');
  return fields;
}
function matchesIdentity(expected: BigIntStats, observed: BigIntStats): boolean {
  return (
    expected.dev === observed.dev &&
    expected.ino === observed.ino &&
    expected.mode === observed.mode &&
    expected.uid === observed.uid &&
    expected.gid === observed.gid
  );
}
function matchesFile(expected: BigIntStats, observed: BigIntStats): boolean {
  return (
    matchesIdentity(expected, observed) &&
    expected.size === observed.size &&
    expected.mtimeNs === observed.mtimeNs &&
    expected.ctimeNs === observed.ctimeNs
  );
}

/** Retained read-only descriptor graph. Pending synchronous reads cannot release an enclosing runtime lock. */
class GraphFiles {
  private readonly directories = new Map<string, HeldDirectory>();
  private readonly files = new Map<string, CapturedFile>();
  private readonly absences = new Map<string, HeldDirectory>();
  private readonly rosters = new Map<string, readonly string[]>();
  private edges = 0;
  constructor(readonly deadline: number) {}
  assertDeadline(): void {
    if (!Number.isFinite(this.deadline) || performance.now() >= this.deadline)
      refuseGraph('original deadline exceeded');
  }
  retainDirectory(path: string, modes?: readonly number[], owned = false): HeldDirectory {
    this.assertDeadline();
    const existing = this.directories.get(path);
    if (existing !== undefined) {
      this.assertDirectory(existing);
      this.checkDirectoryMode(existing.identity, modes, owned);
      return existing;
    }
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path)
      refuseGraph('directory is not canonical');
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      const identity = fstatSync(descriptor, { bigint: true });
      const named = lstatSync(path, { bigint: true });
      if (!identity.isDirectory() || !named.isDirectory() || !matchesIdentity(identity, named))
        refuseGraph('directory changed');
      this.checkDirectoryMode(identity, modes, owned);
      const held = { path, descriptor, identity };
      this.directories.set(path, held);
      this.assertDeadline();
      return held;
    } catch (cause) {
      closeSync(descriptor);
      throw cause;
    }
  }
  private checkDirectoryMode(
    identity: BigIntStats,
    modes: readonly number[] | undefined,
    owned: boolean,
  ): void {
    if (modes !== undefined && !modes.includes(Number(identity.mode & 0o7777n)))
      refuseGraph('directory mode differs');
    if (owned && (process.getuid === undefined || identity.uid !== BigInt(process.getuid())))
      refuseGraph('directory owner differs');
  }
  private assertDirectory(parent: HeldDirectory): void {
    if (
      realpathSync(parent.path) !== parent.path ||
      !matchesIdentity(parent.identity, fstatSync(parent.descriptor, { bigint: true })) ||
      !matchesIdentity(parent.identity, lstatSync(parent.path, { bigint: true }))
    )
      refuseGraph('retained parent changed');
  }
  retainEdge(selected: Reference, consumer?: string): void {
    this.assertDeadline();
    this.edges++;
    if (this.edges > 128) refuseGraph('reference edge budget exceeded');
    if (consumer !== undefined && readSequence(selected.name) >= readSequence(consumer))
      refuseGraph('predecessor order differs');
  }
  captureFile(
    path: string,
    maximum: number,
    text = true,
    modes: readonly number[] = [0o600],
    owned = false,
  ): CapturedFile {
    this.assertDeadline();
    const existing = this.files.get(path);
    if (existing !== undefined) {
      if (existing.maximum !== maximum || (text && existing.contents === undefined))
        refuseGraph('conflicting file binding');
      return existing;
    }
    if (this.files.size >= 64) refuseGraph('regular file budget exceeded');
    const parent = this.retainDirectory(dirname(path));
    let descriptor: number;
    try {
      descriptor = openDirectoryFile(
        parent.descriptor,
        basename(path),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (cause) {
      throw new Error('initial handoff cannot open ' + basename(path), { cause });
    }
    try {
      const identity = fstatSync(descriptor, { bigint: true });
      if (
        !identity.isFile() ||
        identity.size < 1n ||
        identity.size > BigInt(maximum) ||
        !modes.includes(Number(identity.mode & 0o7777n)) ||
        (owned && (process.getuid === undefined || identity.uid !== BigInt(process.getuid())))
      )
        refuseGraph('file type, mode, owner or size differs');
      const captured = this.readBytes(descriptor, identity, maximum, text);
      if (!matchesFile(identity, lstatSync(path, { bigint: true })))
        refuseGraph('named file changed');
      this.assertDirectory(parent);
      this.assertDeadline();
      const held = { path, parent, descriptor, identity, maximum, ...captured };
      this.files.set(path, held);
      return held;
    } catch (cause) {
      closeSync(descriptor);
      throw cause;
    }
  }
  private readBytes(
    descriptor: number,
    identity: BigIntStats,
    maximum: number,
    text: boolean,
  ): { sha256: string; contents: string | undefined } {
    const digest = createHash('sha256');
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(Math.min(MIB, maximum));
    let count = 0;
    for (;;) {
      this.assertDeadline();
      const length = readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.byteLength, maximum + 1 - count),
        count,
      );
      this.assertDeadline();
      if (length === 0) break;
      count += length;
      if (count > maximum) refuseGraph('file byte budget exceeded');
      const bytes = buffer.subarray(0, length);
      digest.update(bytes);
      if (text) chunks.push(Buffer.from(bytes));
    }
    if (
      BigInt(count) !== identity.size ||
      !matchesFile(identity, fstatSync(descriptor, { bigint: true }))
    )
      refuseGraph('file changed during read');
    return {
      sha256: digest.digest('hex'),
      contents: text
        ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks))
        : undefined,
    };
  }
  captureText(
    path: string,
    maximum: number,
    modes: readonly number[] = [0o600],
    owned = false,
  ): CapturedFile & { contents: string } {
    const file = this.captureFile(path, maximum, true, modes, owned);
    if (file.contents === undefined) refuseGraph('text capture absent');
    return { ...file, contents: file.contents };
  }
  requireAbsent(path: string): void {
    this.assertDeadline();
    const parent = this.retainDirectory(dirname(path));
    try {
      lstatSync(path);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
        this.absences.set(path, parent);
        this.assertDeadline();
        return;
      }
      throw cause;
    }
    refuseGraph('required absent path retained');
  }
  private readEntries(parent: HeldDirectory, maximum: number): string[] {
    this.assertDirectory(parent);
    // Linux self-FD resolution selects this retained directory, not a mutable caller pathname.
    const directory = opendirSync('/proc/self/fd/' + String(parent.descriptor), { bufferSize: 1 });
    const names: string[] = [];
    try {
      for (;;) {
        this.assertDeadline();
        const entry = directory.readSync();
        this.assertDeadline();
        if (entry === null) break;
        if (names.length >= maximum) refuseGraph('raw artifact roster exceeds selected membership');
        names.push(entry.name);
      }
    } finally {
      directory.closeSync();
    }
    this.assertDirectory(parent);
    return names.sort();
  }
  requireRoster(path: string, names: readonly string[]): void {
    this.retainDirectory(path, [0o700], true);
    const observed = this.readEntries(this.retainDirectory(path), names.length);
    assertSame([...names].sort(), observed, 'initial raw artifact roster');
    this.rosters.set(path, [...names].sort());
    this.assertDeadline();
  }
  /** Independent closing reads retain the opening baseline and use each original parent descriptor. */
  verifyClosure(): void {
    this.assertStable();
    for (const held of this.files.values()) {
      this.assertDeadline();
      const descriptor = openDirectoryFile(
        held.parent.descriptor,
        basename(held.path),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!matchesFile(held.identity, fstatSync(descriptor, { bigint: true })))
          refuseGraph('closing file identity differs');
        const observed = this.readBytes(
          descriptor,
          held.identity,
          held.maximum,
          held.contents !== undefined,
        );
        if (observed.sha256 !== held.sha256 || observed.contents !== held.contents)
          refuseGraph('closing file bytes differ');
      } finally {
        closeSync(descriptor);
      }
    }
    this.assertStable();
  }
  /** Final identities/absences/rosters are compared to the original captures after launch observation. */
  assertStable(): void {
    this.assertDeadline();
    for (const parent of this.directories.values()) this.assertDirectory(parent);
    for (const held of this.files.values())
      if (
        !matchesFile(held.identity, fstatSync(held.descriptor, { bigint: true })) ||
        !matchesFile(held.identity, lstatSync(held.path, { bigint: true }))
      )
        refuseGraph('retained file identity differs');
    for (const [path, parent] of this.absences) {
      this.assertDirectory(parent);
      try {
        lstatSync(path);
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
        throw cause;
      }
      refuseGraph('absent path appeared');
    }
    for (const [path, names] of this.rosters)
      assertSame(
        names,
        this.readEntries(this.retainDirectory(path), names.length),
        'initial closing artifact roster',
      );
    this.assertDeadline();
  }
  closeFiles(): void {
    for (const file of this.files.values()) closeSync(file.descriptor);
    for (const parent of this.directories.values()) closeSync(parent.descriptor);
    this.files.clear();
    this.directories.clear();
  }
}

/** Stored read-only closure only; this returns no original owner, restoration capability or startup callback. */
export interface InitialHandoffGraph {
  readonly admission: CompleteDependencyActivationRequest;
  readonly runtimeLaunch: RuntimeLaunchPins;
  readonly writerManifest: WriterManifest;
  readonly images: readonly SolverRestorationImage[];
  retainExecutingFile(observed: SolverFile): void;
  verifyClosure(): void;
  assertStable(): void;
  closeFiles(): void;
}

interface GraphContext {
  readonly files: GraphFiles;
  readonly directory: string;
  readonly owner: string;
  readonly publication: ReturnType<typeof decodeDependencyOwnerPublication>;
  readonly labels: Map<string, string>;
}
function captureReference(
  context: GraphContext,
  selected: Reference,
  label: string,
  consumer?: string,
): { file: CapturedFile & { contents: string }; fields: Fields } {
  context.files.retainEdge(selected, consumer);
  const prior = context.labels.get(selected.name);
  const binding = label + ':' + selected.sha256;
  if (prior !== undefined && prior !== binding) refuseGraph('reference binding conflicts');
  context.labels.set(selected.name, binding);
  const file = context.files.captureText(join(context.directory, selected.name), 65536);
  if (file.sha256 !== selected.sha256) refuseGraph('reference hash differs');
  const envelope = readClosed(parseJson(file.contents), ['owner', 'record']);
  if (envelope['owner'] !== context.owner) refuseGraph('original owner bytes differ');
  decodeDependencyOwnerPublication(parseJson(readString(envelope['owner'])));
  return { file, fields: readFields(envelope['record']) };
}

interface Database {
  readonly environment: EnvName;
  readonly path: string;
  readonly host: string;
  readonly directoryIdentity: string;
  readonly fileIdentity: string;
}
interface ParticipantSelection {
  readonly role: 'backend' | 'gateway' | 'source';
  readonly id: string;
  readonly originalPolicy: { readonly name: string; readonly maximumRetryCount: number };
}
interface Participants {
  readonly fields: Fields;
  readonly backend: { id: string; image: string; imageId: string };
  readonly gateway: { id: string; image: string; imageId: string };
  readonly source: {
    id: string;
    runtimeReference: string;
    runtimeImageId: string;
    manifestSha256: string;
    environmentSha256: string;
  };
  readonly databases: readonly Database[];
  readonly solverIntent: Reference;
  readonly fences: Fields;
}
function decodeParticipants(
  value: Fields,
  admission: CompleteDependencyActivationRequest,
  ownerHash: string,
): Participants {
  const fields = decodeRecord(value, 'complete-dependency-participants', [
    'operation',
    'sourceSha',
    'ownerPublicationSha256',
    'selected',
    'capabilities',
    'authorities',
    'solver',
    'databases',
    'fences',
    'migrationManifestSha256',
  ]);
  if (
    fields['operation'] !== 'activate-installed-dormant' ||
    fields['sourceSha'] !== admission.owner.sha ||
    fields['ownerPublicationSha256'] !== ownerHash ||
    fields['migrationManifestSha256'] !== admission.migrations.manifestSha256
  )
    refuseGraph('participants attribution differs');
  const selected = readClosed(fields['selected'], ['backend', 'gateway', 'source']);
  const image = (value: unknown, expected: string) => {
    const fields = readClosed(value, ['id', 'image', 'imageId']);
    const image = readString(fields['image']);
    if (image !== expected) refuseGraph('selected image differs');
    return { id: readIdentity(fields['id']), image, imageId: readDigest(fields['imageId']) };
  };
  const backend = image(selected['backend'], admission.prod.backend.image);
  if (backend.imageId !== admission.migrations.candidateImageId)
    refuseGraph('migration selected image differs');
  const gateway = image(selected['gateway'], admission.prod.gateway.image);
  const sourceFields = readClosed(selected['source'], [
    'id',
    'runtimeReference',
    'runtimeImageId',
    'manifestSha256',
    'environmentSha256',
  ]);
  const source = {
    id: readIdentity(sourceFields['id']),
    runtimeReference: readString(sourceFields['runtimeReference']),
    runtimeImageId: readDigest(sourceFields['runtimeImageId']),
    manifestSha256: readHash(sourceFields['manifestSha256']),
    environmentSha256: readHash(sourceFields['environmentSha256']),
  };
  assertSame(
    {
      id: source.id,
      runtimeReference: admission.source.runtimeReference,
      runtimeImageId: admission.source.pins.runtimeImageId,
      manifestSha256: admission.source.pins.manifestSha256,
      environmentSha256: admission.source.pins.environmentSha256,
    },
    source,
    'initial selected source',
  );
  if (new Set([backend.id, gateway.id, source.id]).size !== 3)
    refuseGraph('selected participant IDs duplicate');
  const capabilities = readClosed(fields['capabilities'], [
    'backendCandidate',
    'backendRetained',
    'gateway',
    'source',
  ]);
  for (const [key, expected] of [
    ['backendCandidate', backend.image],
    ['backendRetained', backend.image],
    ['gateway', gateway.image],
  ] as const) {
    const observed = readClosed(capabilities[key], ['image', 'semantics']);
    assertSame(
      { image: expected, semantics: ['cross-project-dependencies-v1'] },
      observed,
      'initial participant capability',
    );
  }
  assertSame(
    [
      { role: 'backend', purpose: 'candidate', semantics: ['cross-project-dependencies-v1'] },
      { role: 'backend', purpose: 'retained', semantics: ['cross-project-dependencies-v1'] },
      { role: 'gateway', purpose: 'candidate', semantics: ['cross-project-dependencies-v1'] },
      { role: 'mcp', purpose: 'candidate', semantics: ['cross-project-dependencies-v1'] },
    ],
    capabilities['source'],
    'initial source capability roster',
  );
  const authorities = readClosed(fields['authorities'], [
    'writerManifestSha256',
    'launchConfigurationSha256',
    'hostMachineIdSha256',
    'bootId',
    'filesSha256',
  ]);
  for (const key of [
    'writerManifestSha256',
    'launchConfigurationSha256',
    'hostMachineIdSha256',
  ] as const)
    if (readHash(authorities[key]) !== admission.authorities.pins[key])
      refuseGraph('participants authority pins differ');
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      readString(authorities['bootId']),
    )
  )
    refuseGraph('historical authority boot malformed');
  readHash(authorities['filesSha256']);
  const solver = readClosed(fields['solver'], ['pins', 'restorationIntent']);
  assertSame(admission.solver, solver['pins'], 'initial participant solver pins');
  const solverIntent = decodeReference(solver['restorationIntent'], 'solver-restore-intent');
  const databases = readRoster(fields['databases'], 2).map((value, index): Database => {
    const fields = readClosed(value, [
      'environment',
      'path',
      'host',
      'directoryIdentity',
      'fileIdentity',
    ]);
    const environment = index === 0 ? 'prod' : 'dev';
    if (fields['environment'] !== environment) refuseGraph('database roster differs');
    const path = readString(fields['path']);
    const host = readString(fields['host']);
    const directoryIdentity = readString(fields['directoryIdentity']);
    const fileIdentity = readString(fields['fileIdentity']);
    if (
      ![path, host].every(
        (path) => isAbsolute(path) && resolve(path) === path && !path.includes('\0'),
      ) ||
      ![directoryIdentity, fileIdentity].every((identity) =>
        /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(identity),
      )
    )
      refuseGraph('historical database identity malformed');
    return { environment, path, host, directoryIdentity, fileIdentity };
  });
  if (databases.length !== 2) refuseGraph('database roster incomplete');
  const fences = readClosed(fields['fences'], [
    'ingressSha256',
    'sourceSha256',
    'backendSha256',
    'gatewaySha256',
    'solverSha256',
  ]);
  for (const value of Object.values(fences)) readHash(value);
  return { fields, backend, gateway, source, databases, solverIntent, fences };
}
function decodeRestorationSelection(
  value: unknown,
  participants: Participants,
): ParticipantSelection[] {
  const expected = [
    { role: 'backend', id: participants.backend.id },
    { role: 'gateway', id: participants.gateway.id },
    { role: 'source', id: participants.source.id },
  ];
  const selected = readRoster(value, 3).map((value, index): ParticipantSelection => {
    const fields = readClosed(value, ['role', 'id', 'originalPolicy', 'snapshotSha256']);
    const role = fields['role'];
    const prior = expected.at(index);
    if (
      (role !== 'backend' && role !== 'gateway' && role !== 'source') ||
      role !== prior?.role ||
      readIdentity(fields['id']) !== prior.id
    )
      refuseGraph('restoration selected role or ID differs');
    const policy = readClosed(fields['originalPolicy'], ['name', 'maximumRetryCount']);
    const originalPolicy = readParticipantRestartPolicy({
      Name: policy['name'],
      MaximumRetryCount: policy['maximumRetryCount'],
    });
    readHash(fields['snapshotSha256']);
    return { role, id: prior.id, originalPolicy };
  });
  if (selected.length !== 3) refuseGraph('restoration selected roster incomplete');
  return selected;
}
function decodeReady(value: Fields): void {
  const fields = readClosed(value, ['phase', 'observed']);
  if (fields['phase'] !== 'solver-ready-participants-fenced')
    refuseGraph('solver-ready phase differs');
  const observed = readClosed(fields['observed'], ['unit', 'process', 'cgroup']);
  const unit = readClosed(observed['unit'], ['pid', 'invocation', 'cgroup']);
  const process = readClosed(observed['process'], ['pid', 'startTime', 'cgroup']);
  const cgroup = readClosed(observed['cgroup'], ['device', 'inode', 'populated']);
  const pid = readInteger(unit['pid']);
  const group = readString(unit['cgroup']);
  if (
    pid === 0 ||
    process['pid'] !== pid ||
    process['cgroup'] !== group ||
    group.includes('\0') ||
    !group.startsWith('/user.slice/') ||
    !group.endsWith('/wbs-solver-supervisor.service') ||
    resolve(group) !== group ||
    !/^\d+$/.test(readString(process['startTime'])) ||
    !/^([a-f0-9]{32})$/.test(readString(unit['invocation'])) ||
    cgroup['populated'] !== true
  )
    refuseGraph('historical solver-ready identity differs');
  readDecimal(cgroup['device']);
  readDecimal(cgroup['inode']);
}

interface Archive {
  readonly directory: 'edge' | 'prod' | 'dev';
  readonly name: string;
  readonly sha256: string;
  readonly device: string;
  readonly inode: string;
  readonly parentDevice: string;
  readonly parentInode: string;
  readonly mode: 384;
}
function decodeArchive(
  value: unknown,
  directory: 'edge' | 'prod' | 'dev',
  literal: string,
): Archive {
  const fields = readClosed(value, [
    'directory',
    'name',
    'sha256',
    'device',
    'inode',
    'parentDevice',
    'parentInode',
    'mode',
  ]);
  const name = readString(fields['name']);
  if (
    fields['directory'] !== directory ||
    fields['mode'] !== 384 ||
    !new RegExp('^edge-owner-[0-9]{6,12}-retired-' + literal + '\\.json$').test(name)
  )
    refuseGraph('archive family differs');
  return {
    directory,
    name,
    sha256: readHash(fields['sha256']),
    device: readDecimal(fields['device']),
    inode: readDecimal(fields['inode']),
    parentDevice: readDecimal(fields['parentDevice']),
    parentInode: readDecimal(fields['parentInode']),
    mode: 384,
  };
}
function resolveArchivePath(context: GraphContext, selected: Archive): string {
  return join(
    selected.directory === 'edge' ? context.directory : envLayout(selected.directory).stateDir,
    selected.name,
  );
}
function assertArchiveFile(selected: Archive, file: CapturedFile): void {
  if (
    file.sha256 !== selected.sha256 ||
    String(file.identity.dev) !== selected.device ||
    String(file.identity.ino) !== selected.inode ||
    String(file.parent.identity.dev) !== selected.parentDevice ||
    String(file.parent.identity.ino) !== selected.parentInode ||
    Number(file.identity.mode & 0o7777n) !== selected.mode
  )
    refuseGraph('archive identity or exact bytes differ');
}
function isPresent(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}
function captureOwnerArchive(context: GraphContext, value: unknown, phase: unknown): void {
  const selected = decodeArchive(value, 'edge', 'pending');
  if (selected.sha256 !== hashBytes(context.owner)) refuseGraph('owner archive hash differs');
  const original = join(context.directory, 'edge-owner.pending');
  const destination = resolveArchivePath(context, selected);
  const pending = isPresent(original);
  const retired = isPresent(destination);
  if (pending === retired || (phase === 'complete' && pending))
    refuseGraph('pending/archive/pointer phase matrix differs');
  const captured = context.files.captureText(pending ? original : destination, 65536);
  assertArchiveFile(selected, captured);
  if (captured.contents !== context.owner) refuseGraph('owner archive publication bytes differ');
  context.files.requireAbsent(pending ? destination : original);
}

function captureFences(
  context: GraphContext,
  value: unknown,
  participants: Participants,
  admission: CompleteDependencyActivationRequest,
): void {
  const captures = new Map<string, CapturedFile & { contents: string }>();
  const fences = readRoster(value, 8);
  if (fences.length !== 8) refuseGraph('fence retirement roster incomplete');
  for (const [index, raw] of fences.entries()) {
    const expected = FENCES.at(index);
    if (expected === undefined) refuseGraph('fence retirement index differs');
    const fields = readClosed(raw, ['environment', 'name', 'originalSha256', 'archive']);
    if (fields['environment'] !== expected[0] || fields['name'] !== expected[1])
      refuseGraph('fence retirement roster differs');
    const selected = decodeArchive(fields['archive'], expected[0], expected[1].slice(0, -5));
    if (readHash(fields['originalSha256']) !== selected.sha256)
      refuseGraph('fence original/archive hash differs');
    const path = resolveArchivePath(context, selected);
    const file = context.files.captureText(path, 65536);
    assertArchiveFile(selected, file);
    context.files.requireAbsent(join(envLayout(expected[0]).stateDir, expected[1]));
    captures.set(expected[1], file);
  }
  const captured = (name: string) => {
    const file = captures.get(name);
    if (file === undefined) refuseGraph('required fence archive missing');
    return file;
  };
  const sourceIntentFile = captured('dependency-source-dev-intent.json');
  const sourceCompleteFile = captured('dependency-source-dev-complete.json');
  const sourceIntent = readClosed(parseJson(sourceIntentFile.contents), [
    'attempt',
    'sha',
    'layouts',
    'member',
  ]);
  const layouts = readClosed(sourceIntent['layouts'], ['prod', 'dev']);
  assertSame(
    { prod: envLayout('prod'), dev: envLayout('dev') },
    layouts,
    'initial archived source layouts',
  );
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      readString(sourceIntent['attempt']),
    ) ||
    sourceIntent['sha'] !== admission.owner.sha
  )
    refuseGraph('archived source attribution differs');
  const sourceComplete = readClosed(parseJson(sourceCompleteFile.contents), [
    'intentSha256',
    'member',
  ]);
  if (sourceComplete['intentSha256'] !== hashBytes(JSON.stringify(sourceIntent)))
    refuseGraph('archived source intent digest differs');
  for (const member of [sourceIntent['member'], sourceComplete['member']]) {
    const fields = readClosed(member, ['id', 'image', 'snapshotSha256']);
    if (
      readIdentity(fields['id']) !== participants.source.id ||
      readDigest(fields['image']) !== admission.source.pins.runtimeImageId
    )
      refuseGraph('archived source selection differs');
    readHash(fields['snapshotSha256']);
  }
  if (
    participants.fences['sourceSha256'] !==
    hashBytes(JSON.stringify([sourceIntentFile.contents, sourceCompleteFile.contents]))
  )
    refuseGraph('source fence projection differs');
  const gatewayHashes = {
    markerSha256: captured('dependency-gateway-fence.json').sha256,
    intentSha256: captured('dependency-gateway-intent.json').sha256,
    completionSha256: captured('dependency-gateway-complete.json').sha256,
  };
  for (const role of ['backend', 'gateway'] as const) {
    const marker = captured(`dependency-${role}-fence.json`);
    if (marker.contents !== `{"format":"dependency-${role}-fence","version":1}\n`)
      refuseGraph('archived fixed fence marker differs');
    const intentFile = captured(`dependency-${role}-intent.json`);
    const completionFile = captured(`dependency-${role}-complete.json`);
    const intent = decodeRecord(parseJson(intentFile.contents), `dependency-${role}-intent`, [
      'attempt',
      'environment',
      'root',
      'network',
      'sha',
      'cohort',
      ...(role === 'backend' ? ['gateway'] : []),
    ]);
    const complete = decodeRecord(
      parseJson(completionFile.contents),
      `dependency-${role}-complete`,
      ['attempt', 'intentSha256', 'cohort', ...(role === 'backend' ? ['gateway'] : [])],
    );
    const layout = envLayout('prod');
    if (
      intent['environment'] !== 'prod' ||
      intent['root'] !== layout.root ||
      intent['network'] !== layout.network ||
      intent['sha'] !== admission.owner.sha ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        readString(intent['attempt']),
      ) ||
      complete['attempt'] !== intent['attempt'] ||
      complete['intentSha256'] !== intentFile.sha256
    )
      refuseGraph('archived managed intent binding differs');
    const original =
      role === 'backend'
        ? parseBackendCohort(intent['cohort'], layout)
        : parseManagedCohort(intent['cohort'], layout);
    const terminal =
      role === 'backend'
        ? parseBackendCohort(complete['cohort'], layout)
        : parseManagedCohort(complete['cohort'], layout);
    assertSame(
      projectIdentities(original),
      projectIdentities(terminal),
      'initial archived managed identities',
    );
    assertExcluded(terminal);
    const selected = role === 'backend' ? participants.backend : participants.gateway;
    const color = role === 'backend' ? admission.prod.backend.color : admission.prod.gateway.color;
    const retained = original[color];
    if (
      retained?.id !== selected.id ||
      retained.image !== selected.imageId ||
      retained.imageRef !== selected.image
    )
      refuseGraph('archived managed selection differs');
    if (role === 'backend') {
      const database = participants.databases.find((database) => database.environment === 'prod');
      const retainedBackend = parseBackendCohort(intent['cohort'], layout)[color];
      if (database === undefined || retainedBackend === null)
        refuseGraph('archived backend database absent');
      assertSame(
        {
          path: database.path,
          host: database.host,
          directoryIdentity: database.directoryIdentity,
          fileIdentity: database.fileIdentity,
        },
        retainedBackend.database,
        'initial archived backend database',
      );
      assertSame(
        gatewayHashes,
        parseGatewayBinding(intent['gateway']),
        'initial archived gateway intent binding',
      );
      assertSame(
        gatewayHashes,
        parseGatewayBinding(complete['gateway']),
        'initial archived gateway completion binding',
      );
    }
    if (
      participants.fences[role === 'backend' ? 'backendSha256' : 'gatewaySha256'] !==
      completionFile.sha256
    )
      refuseGraph('managed fence projection differs');
  }
}

function captureActivationArtifacts(
  context: GraphContext,
  selections: readonly {
    environment: EnvName;
    capture: Fields;
    backup: Fields;
    intent: Fields;
    committed: Fields;
    receipt: ReturnType<typeof parseDependencyReceipt>;
  }[],
  participants: Participants,
  admission: CompleteDependencyActivationRequest,
): void {
  const directory = join(context.directory, 'dependency-activation-' + context.publication.attempt);
  context.files.retainDirectory(context.directory);
  context.files.requireRoster(
    directory,
    selections.flatMap(({ environment }) => [
      environment + '.capture.json',
      environment + '.before.sqlite',
    ]),
  );
  const artifactRoot = join(context.directory, 'dependency-artifacts');
  context.files.retainDirectory(artifactRoot, [0o700, 0o755]);
  const artifactDirectory = join(artifactRoot, admission.migrations.manifestSha256);
  context.files.retainDirectory(artifactDirectory, [0o700, 0o755]);
  const manifestFile = context.files.captureText(
    join(artifactDirectory, 'manifest.json'),
    4 * MIB,
    [0o600, 0o644],
  );
  if (manifestFile.identity.nlink !== 1n) refuseGraph('migration manifest link count differs');
  const manifest = decodeDependencyMigrationManifest(manifestFile.contents, admission.migrations);
  const applied = manifest.migrations.map(({ name, migration }) => ({
    name,
    hash: migration.sha256,
  }));
  const names = applied.map(({ name }) => name);
  let backupBytes = 0;
  for (const selected of selections) {
    const database = participants.databases.find(
      (database) => database.environment === selected.environment,
    );
    if (database === undefined) refuseGraph('selected database missing');
    const databaseIdentity = JSON.stringify({
      environment: database.environment,
      host: database.host,
      directoryIdentity: database.directoryIdentity,
      fileIdentity: database.fileIdentity,
    });
    const capture = readClosed(selected.intent['capture'], ['name', 'sha256']);
    const captureName = readString(capture['name']);
    const captureHash = readHash(capture['sha256']);
    if (
      captureName !== selected.environment + '.capture.json' ||
      selected.capture['databaseIdentity'] !== databaseIdentity ||
      selected.backup['databaseIdentity'] !== databaseIdentity ||
      selected.receipt.databaseIdentity !== databaseIdentity
    )
      refuseGraph('selected database/capture binding differs');
    assertSame(capture, selected.capture['capture'], 'initial selected raw capture reference');
    const snapshot = readClosed(selected.backup['snapshot'], [
      'name',
      'sha256',
      'bytes',
      'migrations',
    ]);
    const backupName = readString(snapshot['name']);
    const size = readInteger(snapshot['bytes']);
    if (backupName !== selected.environment + '.before.sqlite' || size < 1 || size > 1073741824)
      refuseGraph('backup byte or name bound differs');
    backupBytes += size;
    if (backupBytes > 2147483648) refuseGraph('combined backup byte bound exceeded');
    const migrations = readRoster(snapshot['migrations'], 4096).map((value) => readString(value));
    assertSame(names, migrations, 'initial backup complete migration names');
    for (const entry of [
      selected.backup['captureSha256'],
      selected.committed['captureSha256'],
      selected.receipt.migrationCaptureSha256,
    ])
      if (readHash(entry) !== captureHash) refuseGraph('selected capture digest differs');
    context.files.retainEdge({ name: captureName, sha256: captureHash });
    const rawFile = context.files.captureText(join(directory, captureName), 4 * MIB, [0o600], true);
    if (rawFile.sha256 !== captureHash) refuseGraph('raw migration capture hash differs');
    const raw = readClosed(parseJson(rawFile.contents), [
      'format',
      'version',
      'target',
      'attempt',
      'candidate',
      'applied',
      'pending',
    ]);
    const rawApplied = readRoster(raw['applied'], 4096);
    const pending = readRoster(raw['pending'], 4096);
    if (
      rawApplied.length === 0 ||
      pending.length !== 0 ||
      rawApplied.length + pending.length > 4096
    )
      refuseGraph('initial complete applied ledger differs');
    for (const entry of rawApplied) {
      const fields = readClosed(entry, ['name', 'hash']);
      const name = readString(fields['name']);
      if (!/^[0-9]{14}_[a-z0-9_]+$/.test(name) || Buffer.byteLength(name) > 160)
        refuseGraph('raw migration name differs');
      readHash(fields['hash']);
    }
    for (const entry of pending) {
      const fields = readClosed(entry, ['name', 'hash', 'downHash']);
      readHash(fields['hash']);
      readHash(fields['downHash']);
    }
    const image =
      selected.environment === 'prod'
        ? admission.prod.backend.image
        : admission.source.runtimeReference;
    const attempt = context.publication.attempt + ':' + selected.environment;
    const decoded = parseMigrationSetCapture(raw, {
      target: databaseIdentity,
      attempt,
      candidate: image,
    });
    assertSame(applied, decoded.applied, 'initial complete applied migration ledger');
    if (
      selected.receipt.activationId !== attempt ||
      selected.receipt.candidateImage !== image ||
      selected.receipt.rollbackImage !== image
    )
      refuseGraph('selected initial receipt attribution differs');
    context.files.retainEdge({ name: backupName, sha256: readHash(snapshot['sha256']) });
    const backup = context.files.captureFile(
      join(directory, backupName),
      size,
      false,
      [0o600],
      true,
    );
    if (backup.identity.size !== BigInt(size) || backup.sha256 !== snapshot['sha256'])
      refuseGraph('complete binary backup bytes differ');
  }
}

/** Captures the complete closed INITIAL graph and every selected raw byte under one existing deadline. */
export async function captureInitialHandoff(
  snapshot: EdgePolicySnapshot,
  deadline: number,
): Promise<InitialHandoffGraph> {
  const policy = snapshot.policy;
  if (policy.phase !== 'active' || snapshot.mode !== 0o600)
    refuseGraph('requires private active policy');
  const files = new GraphFiles(deadline);
  const directory = policy.edgeState;
  try {
    const policyFile = files.captureText(join(directory, 'edge-policy.json'), 4096);
    if (
      policyFile.contents !== snapshot.contents ||
      String(policyFile.identity.dev) !== snapshot.device ||
      String(policyFile.identity.ino) !== snapshot.inode ||
      String(policyFile.parent.identity.dev) !== snapshot.parentDevice ||
      String(policyFile.parent.identity.ino) !== snapshot.parentInode
    )
      refuseGraph('opening policy identity changed');
    const pointerFile = files.captureText(join(directory, 'edge-owner.json'), 4096);
    const pointer = decodeRecord(parseJson(pointerFile.contents), 'dependency-edge-handoff', [
      'phase',
      'ownerPublicationSha256',
      'policySha256',
      'handoff',
    ]);
    if (
      (pointer['phase'] !== 'prepared' && pointer['phase'] !== 'complete') ||
      pointer['ownerPublicationSha256'] !== policy.ownerPublicationSha256 ||
      pointer['policySha256'] !== policyFile.sha256
    )
      refuseGraph('pointer/policy binding differs');
    assertSame(
      policy.handoff,
      decodeReference(pointer['handoff'], 'handoff-complete'),
      'initial pointer handoff',
    );
    const rootFile = files.captureText(join(directory, policy.handoff.name), 65536);
    const rootEnvelope = readClosed(parseJson(rootFile.contents), ['owner', 'record']);
    const owner = readString(rootEnvelope['owner']);
    const publication = decodeDependencyOwnerPublication(parseJson(owner));
    assertSame(
      [envLayout('prod'), envLayout('dev')],
      publication.plan.layouts,
      'initial exact owner layouts',
    );
    if (hashBytes(owner) !== policy.ownerPublicationSha256)
      refuseGraph('policy original owner hash differs');
    const context: GraphContext = { files, directory, owner, publication, labels: new Map() };
    const completeCapture = captureReference(context, policy.handoff, 'handoff-complete');
    const complete = decodeRecord(completeCapture.fields, 'dependency-initial-handoff-complete', [
      'intent',
      'exposure',
      'admission',
      'ownerPublicationSha256',
      'fences',
    ]);
    if (complete['ownerPublicationSha256'] !== policy.ownerPublicationSha256)
      refuseGraph('handoff complete owner differs');
    const intentRef = decodeReference(complete['intent'], 'handoff-intent');
    const admissionRef = decodeReference(complete['admission'], 'handoff-admission');
    const exposureRef = decodeReference(complete['exposure'], 'exposure-complete');
    const intentCapture = captureReference(
      context,
      intentRef,
      'handoff-intent',
      policy.handoff.name,
    );
    const intent = decodeRecord(intentCapture.fields, 'dependency-initial-handoff-intent', [
      'admission',
      'participants',
      'restoration',
      'restored',
      'activations',
      'ownerPublicationSha256',
      'ownerArchive',
      'fences',
      'ingress',
    ]);
    if (intent['ownerPublicationSha256'] !== policy.ownerPublicationSha256)
      refuseGraph('handoff intent owner differs');
    assertSame(
      admissionRef,
      decodeReference(intent['admission'], 'handoff-admission'),
      'initial admission reference',
    );
    assertSame(complete['fences'], intent['fences'], 'initial fence retirement selection');
    const exposureCapture = captureReference(
      context,
      exposureRef,
      'exposure-complete',
      policy.handoff.name,
    );
    const exposure = decodeRecord(exposureCapture.fields, 'dependency-initial-exposure-complete', [
      'intent',
      'diskConfigurationSha256',
      'liveConfigurationSha256',
      'selectedRoutesSha256',
      'unrelatedRoutesSha256',
    ]);
    const exposureIntentRef = decodeReference(exposure['intent'], 'exposure-intent');
    const exposureIntentCapture = captureReference(
      context,
      exposureIntentRef,
      'exposure-intent',
      exposureRef.name,
    );
    const exposureIntent = decodeRecord(
      exposureIntentCapture.fields,
      'dependency-initial-exposure-intent',
      [
        'handoff',
        'maintenanceReceiptSha256',
        'originalSelectedRoutesSha256',
        'unrelatedRoutesSha256',
      ],
    );
    assertSame(
      intentRef,
      decodeReference(exposureIntent['handoff'], 'handoff-intent'),
      'initial exposure handoff',
    );
    files.retainEdge(intentRef, exposureIntentRef.name);
    if (
      readHash(exposure['diskConfigurationSha256']) !==
      readHash(exposure['liveConfigurationSha256'])
    )
      refuseGraph('exposure disk/live configuration differs');
    const ingress = readClosed(intent['ingress'], [
      'edgeId',
      'sites',
      'originalFilesSha256',
      'selectedRoutesSha256',
      'unrelatedRoutesSha256',
    ]);
    readIdentity(ingress['edgeId']);
    readHash(ingress['originalFilesSha256']);
    const sites = readRoster(ingress['sites'], 2).map((value) => {
      const fields = readClosed(value, ['environment', 'path']);
      return { environment: fields['environment'], path: fields['path'] };
    });
    assertSame(
      ['prod', 'dev'].map((environment) => ({
        environment,
        path: envLayout(environment).siteCaddyPath,
      })),
      sites,
      'initial ingress sites',
    );
    const selectedRoutes = readHash(ingress['selectedRoutesSha256']);
    const unrelatedRoutes = readHash(ingress['unrelatedRoutesSha256']);
    if (
      exposureIntent['originalSelectedRoutesSha256'] !== selectedRoutes ||
      exposureIntent['unrelatedRoutesSha256'] !== unrelatedRoutes ||
      exposure['selectedRoutesSha256'] !== selectedRoutes ||
      exposure['unrelatedRoutesSha256'] !== unrelatedRoutes
    )
      refuseGraph('initial exposure route projections differ');
    readHash(exposureIntent['maintenanceReceiptSha256']);
    const activationRefs = readRoster(intent['activations'], 2).map(
      (
        value,
      ): { environment: EnvName; intent: Reference; capture: Reference; committed: Reference } => {
        const fields = readClosed(value, ['environment', 'intent', 'capture', 'committed']);
        const environment = fields['environment'];
        if (environment !== 'prod' && environment !== 'dev')
          refuseGraph('activation environment differs');
        return {
          environment,
          intent: decodeReference(fields['intent'], 'activation-intent'),
          capture: decodeReference(fields['capture'], 'activation-capture'),
          committed: decodeReference(fields['committed'], 'activation-committed'),
        };
      },
    );
    if (
      !['["prod"]', '["dev"]', '["prod","dev"]'].includes(
        JSON.stringify(activationRefs.map(({ environment }) => environment)),
      )
    )
      refuseGraph('activation roster differs');
    const admissionCapture = captureReference(
      context,
      admissionRef,
      'handoff-admission',
      intentRef.name,
    );
    const admissionFields = decodeRecord(
      admissionCapture.fields,
      'dependency-initial-handoff-admission',
      [
        'sourceSha',
        'solver',
        'authorities',
        'writerManifest',
        'source',
        'prod',
        'migrations',
        'runtimeLaunch',
      ],
      2,
    );
    if (admissionFields['sourceSha'] !== publication.plan.sha)
      refuseGraph('initial admission source differs');
    const authorityPins = decodeInstalledAuthorityPins(admissionFields['authorities']);
    const runtimeLaunch = decodeRuntimeLaunchPins(
      admissionFields['runtimeLaunch'],
      publication.plan.sha,
      authorityPins,
    );
    const sourceFields = readClosed(admissionFields['source'], [
      'pins',
      'runtimeReference',
      'manifest',
    ]);
    const sourcePins = decodeSourceDevPins(sourceFields['pins']);
    const writerRef = decodeReference(admissionFields['writerManifest'], 'handoff-writers');
    const sourceRef = decodeReference(sourceFields['manifest'], 'handoff-source-manifest');
    files.retainEdge(writerRef, admissionRef.name);
    files.retainEdge(sourceRef, admissionRef.name);
    const writerFile = files.captureText(join(directory, writerRef.name), 262144);
    if (
      writerFile.sha256 !== writerRef.sha256 ||
      writerFile.sha256 !== authorityPins.writerManifestSha256
    )
      refuseGraph('writer manifest independent hash differs');
    const writerManifest = decodeWriterManifest(parseJson(writerFile.contents));
    if (
      writerManifest.sourceSha !== publication.plan.sha ||
      writerManifest.buildSha !== publication.plan.sha
    )
      refuseGraph('writer manifest source differs');
    const sourceFile = files.captureText(join(directory, sourceRef.name), 67108864);
    if (sourceFile.sha256 !== sourceRef.sha256 || sourceFile.sha256 !== sourcePins.manifestSha256)
      refuseGraph('source manifest independent hash differs');
    decodeSourceStartupManifest(sourceFile.contents, sourcePins);
    const admission = decodeCompleteDependencyActivationRequest(
      {
        format: 'complete-dependency-activation',
        version: 1,
        owner: publication.plan,
        activate: activationRefs.map(({ environment }) => environment),
        solver: admissionFields['solver'],
        prod: admissionFields['prod'],
        source: {
          pins: sourcePins,
          manifestContents: sourceFile.contents,
          runtimeReference: sourceFields['runtimeReference'],
        },
        authorities: { pins: authorityPins, writerManifestContents: writerFile.contents },
        migrations: admissionFields['migrations'],
      },
      deadline,
    );
    const participantsRef = decodeReference(intent['participants'], 'activation-participants');
    const participantsCapture = captureReference(
      context,
      participantsRef,
      'activation-participants',
      intentRef.name,
    );
    const participants = decodeParticipants(
      participantsCapture.fields,
      admission,
      policy.ownerPublicationSha256,
    );
    if (exposureIntent['maintenanceReceiptSha256'] !== participants.fences['ingressSha256'])
      refuseGraph('exposure original maintenance receipt differs');
    const restorationRef = decodeReference(
      intent['restoration'],
      'activation-participant-restore-intent',
    );
    const restoredRef = decodeReference(intent['restored'], 'activation-participants-restored');
    const restorationCapture = captureReference(
      context,
      restorationRef,
      'activation-participant-restore-intent',
      intentRef.name,
    );
    const restoration = decodeRecord(
      restorationCapture.fields,
      'dependency-participant-restore-intent',
      ['participants', 'committed', 'solverIntent', 'solverReady', 'selected'],
    );
    assertSame(
      participantsRef,
      decodeReference(restoration['participants'], 'activation-participants'),
      'initial restoration participants',
    );
    files.retainEdge(participantsRef, restorationRef.name);
    const solverIntentRef = decodeReference(restoration['solverIntent'], 'solver-restore-intent');
    assertSame(participants.solverIntent, solverIntentRef, 'initial original solver intent');
    const solverIntentCapture = captureReference(
      context,
      solverIntentRef,
      'solver-restore-intent',
      restorationRef.name,
    );
    files.retainEdge(solverIntentRef, participantsRef.name);
    const solverIntent = decodeSolverRestoration(parseJson(solverIntentCapture.file.contents));
    assertSame(
      admission.solver,
      solverIntent.record.pins,
      'initial restoration solver immutable pins',
    );
    const readyRef = decodeReference(restoration['solverReady'], 'solver-restore-complete');
    const readyCapture = captureReference(
      context,
      readyRef,
      'solver-restore-complete',
      restorationRef.name,
    );
    files.retainEdge(solverIntentRef, readyRef.name);
    decodeReady(readyCapture.fields);
    files.assertDeadline();
    const dedicatedReady = await captureSolverRestorationCompletion(directory, readyRef.name);
    files.assertDeadline();
    if (
      dedicatedReady.contents !== readyCapture.file.contents ||
      dedicatedReady.device !== String(readyCapture.file.identity.dev) ||
      dedicatedReady.inode !== String(readyCapture.file.identity.ino) ||
      dedicatedReady.parentDevice !== String(readyCapture.file.parent.identity.dev) ||
      dedicatedReady.parentInode !== String(readyCapture.file.parent.identity.ino)
    )
      refuseGraph('dedicated ready capture changed');
    const selected = decodeRestorationSelection(restoration['selected'], participants);
    const committedRoster = readRoster(restoration['committed'], 2).map((value) => {
      const fields = readClosed(value, ['environment', 'record']);
      return {
        environment: fields['environment'],
        record: decodeReference(fields['record'], 'activation-committed'),
      };
    });
    assertSame(
      activationRefs.map(({ environment, committed }) => ({ environment, record: committed })),
      committedRoster,
      'initial selected committed roster',
    );
    const restoredCapture = captureReference(
      context,
      restoredRef,
      'activation-participants-restored',
      intentRef.name,
    );
    const restored = decodeRecord(restoredCapture.fields, 'dependency-participants-restored', [
      'restoration',
      'activated',
      'ready',
      'policies',
      'exposure',
      'controllers',
    ]);
    assertSame(
      restorationRef,
      decodeReference(restored['restoration'], 'activation-participant-restore-intent'),
      'initial restored restoration',
    );
    files.retainEdge(restorationRef, restoredRef.name);
    if (restored['exposure'] !== 'closed' || restored['controllers'] !== 'fenced')
      refuseGraph('historical participants-restored boundary differs');
    const activated = readRoster(restored['activated'], 2).map((value) => {
      const fields = readClosed(value, ['environment', 'receipt']);
      return {
        environment: fields['environment'],
        receipt: parseDependencyReceipt(fields['receipt']),
      };
    });
    assertSame(
      activationRefs.map(({ environment }) => environment),
      activated.map(({ environment }) => environment),
      'initial activated receipt roster',
    );
    const ready = readRoster(restored['ready'], 3).map((value) =>
      decodeReference(value, 'activation-participant-ready'),
    );
    const policies = readRoster(restored['policies'], 3).map((value) =>
      decodeReference(value, 'activation-participant-policy-intent'),
    );
    if (ready.length !== 3 || policies.length !== 3) refuseGraph('ready/policy roster incomplete');
    for (const [index, participant] of selected.entries()) {
      const readyRef = ready.at(index);
      const policyRef = policies.at(index);
      if (readyRef === undefined || policyRef === undefined)
        refuseGraph('ready/policy selected entry absent');
      const readyCapture = captureReference(
        context,
        readyRef,
        'activation-participant-ready',
        restoredRef.name,
      );
      const readyFields = decodeRecord(readyCapture.fields, 'dependency-participant-ready', [
        'restoration',
        'role',
        'id',
        'readinessSha256',
      ]);
      assertSame(
        restorationRef,
        decodeReference(readyFields['restoration'], 'activation-participant-restore-intent'),
        'initial participant ready restoration',
      );
      files.retainEdge(restorationRef, readyRef.name);
      if (
        readyFields['role'] !== participant.role ||
        readIdentity(readyFields['id']) !== participant.id
      )
        refuseGraph('participant ready selection differs');
      readHash(readyFields['readinessSha256']);
      const policyCapture = captureReference(
        context,
        policyRef,
        'activation-participant-policy-intent',
        restoredRef.name,
      );
      const policyFields = decodeRecord(
        policyCapture.fields,
        'dependency-participant-policy-intent',
        ['ready', 'role', 'id', 'policySha256'],
      );
      assertSame(
        readyRef,
        decodeReference(policyFields['ready'], 'activation-participant-ready'),
        'initial participant policy ready',
      );
      files.retainEdge(readyRef, policyRef.name);
      if (
        policyFields['role'] !== participant.role ||
        readIdentity(policyFields['id']) !== participant.id ||
        readHash(policyFields['policySha256']) !==
          hashBytes(JSON.stringify(participant.originalPolicy))
      )
        refuseGraph('participant original policy digest differs');
    }
    const artifacts = activationRefs.map((selection) => {
      const intentCapture = captureReference(
        context,
        selection.intent,
        'activation-intent',
        intentRef.name,
      );
      const activationIntent = decodeRecord(intentCapture.fields, 'dependency-activation-intent', [
        'environment',
        'receipt',
        'participantRecord',
        'capture',
        'backup',
        'migrationManifestSha256',
      ]);
      const captureCapture = captureReference(
        context,
        selection.capture,
        'activation-capture',
        selection.intent.name,
      );
      files.retainEdge(selection.capture, participantsRef.name);
      const capture = decodeRecord(captureCapture.fields, 'dependency-activation-capture', [
        'environment',
        'databaseIdentity',
        'capture',
      ]);
      const backupRef = decodeReference(activationIntent['backup'], 'activation-backup');
      const backupCapture = captureReference(
        context,
        backupRef,
        'activation-backup',
        selection.intent.name,
      );
      files.retainEdge(backupRef, participantsRef.name);
      const backup = decodeRecord(backupCapture.fields, 'dependency-activation-backup', [
        'environment',
        'databaseIdentity',
        'snapshot',
        'captureSha256',
      ]);
      const committedCapture = captureReference(
        context,
        selection.committed,
        'activation-committed',
        restorationRef.name,
      );
      files.retainEdge(selection.intent, selection.committed.name);
      const committed = decodeRecord(committedCapture.fields, 'dependency-activation-committed', [
        'environment',
        'receipt',
        'captureSha256',
        'migrationManifestSha256',
      ]);
      for (const fields of [activationIntent, capture, backup, committed])
        if (fields['environment'] !== selection.environment)
          refuseGraph('activation envelope environment differs');
      assertSame(
        participantsRef,
        decodeReference(activationIntent['participantRecord'], 'activation-participants'),
        'initial activation selected participants',
      );
      files.retainEdge(participantsRef, selection.intent.name);
      for (const fields of [activationIntent, committed])
        if (fields['migrationManifestSha256'] !== admission.migrations.manifestSha256)
          refuseGraph('selected activation manifest differs');
      const receipt = parseDependencyReceipt(activationIntent['receipt']);
      assertSame(
        receipt,
        parseDependencyReceipt(committed['receipt']),
        'initial committed receipt',
      );
      const restoredReceipt = activated.find(
        ({ environment }) => environment === selection.environment,
      );
      if (restoredReceipt === undefined) refuseGraph('restored selected receipt missing');
      assertSame(receipt, restoredReceipt.receipt, 'initial restored activated receipt');
      if (receipt.participantProofSha256 !== participantsRef.sha256)
        refuseGraph('receipt participants proof differs');
      return {
        environment: selection.environment,
        capture,
        backup,
        intent: activationIntent,
        committed,
        receipt,
      };
    });
    captureActivationArtifacts(context, artifacts, participants, admission);
    captureFences(context, intent['fences'], participants, admission);
    captureOwnerArchive(context, intent['ownerArchive'], pointer['phase']);
    files.assertStable();
    return {
      admission,
      runtimeLaunch,
      writerManifest,
      images: solverIntent.record.images,
      retainExecutingFile: (observed) => {
        const selected = [
          {
            path: SOLVER_SUPERVISOR_BUN,
            maximum: 128 * MIB,
            mode: 0o755,
            sha256: admission.solver.bunSha256,
          },
          {
            path: SOLVER_SUPERVISOR_BUNDLE.remote,
            maximum: 16 * MIB,
            mode: 0o755,
            sha256: admission.solver.bundleSha256,
          },
          {
            path: SOLVER_SUPERVISOR_CONFIG,
            maximum: 65536,
            mode: 0o600,
            sha256: admission.solver.configSha256,
          },
          {
            path: SOLVER_SUPERVISOR_UNIT,
            maximum: 65536,
            mode: 0o644,
            sha256: admission.solver.unitSha256,
          },
        ].find((selected) => selected.path === observed.path);
        if (selected === undefined) refuseGraph('executing tuple path differs');
        const retained = files.captureFile(selected.path, selected.maximum, false, [selected.mode]);
        if (
          retained.sha256 !== selected.sha256 ||
          observed.sha256 !== selected.sha256 ||
          observed.device !== String(retained.identity.dev) ||
          observed.inode !== String(retained.identity.ino) ||
          observed.mode !== selected.mode
        )
          refuseGraph('retained executing tuple differs');
      },
      verifyClosure: () => {
        files.verifyClosure();
      },
      assertStable: () => {
        files.assertStable();
      },
      closeFiles: () => {
        files.closeFiles();
      },
    };
  } catch (cause) {
    files.closeFiles();
    throw cause;
  }
}
