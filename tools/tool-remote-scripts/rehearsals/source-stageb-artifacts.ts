import { createHash } from 'node:crypto';
import { type BigIntStats, constants, fstatSync, readlinkSync } from 'node:fs';
import { type FileHandle, lstat, open, readFile } from 'node:fs/promises';
import { isProxy } from 'node:util/types';

import {
  type CompleteDependencyActivationRequest,
  decodeCompleteDependencyActivationRequest,
} from '../src/lib/dependency-complete-activation';
import {
  decodeDependencyMigrationManifest,
  type DependencyMigrationManifest,
} from '../src/lib/dependency-migration-artifact';
import { envLayout } from '../src/lib/env';
import { decodeWriterManifest, WRITER_MEMBERS } from '../src/lib/installed-writers';
import { decodeSolverSupervisorConfig } from '../src/lib/solver-supervisor-config';
import { SOLVER_SUPERVISOR_SOCKET } from '../src/lib/solver-supervisor-install-contract';
import { decodeSourceRestorationConfiguration } from '../src/lib/source-restoration-configuration';
import {
  decodeSourceStartupManifest,
  type SourceStartupManifest,
} from '../src/lib/source-startup-manifest';
import {
  assertSourceInputArtifact,
  inspectSourceInputs,
  type SourceInputs,
} from './source-stageb-inputs';

const slots = [
  'prerequisites',
  'source-tree',
  'dependencies',
  'configuration',
  'startup-manifest',
  'openapi',
  'migration-manifest',
  'installed-authority-manifest',
  'solver-artifacts',
] as const;
export type SourceArtifactSlot = (typeof slots)[number];
export type SourceArtifactDescriptors = Readonly<Record<SourceArtifactSlot, number>>;
declare const artifactBrand: unique symbol;
/** Original verified-input-staging lifetime; authorityInstallation and writerBuildProvenance remain not-established. No provider/preparation authority. */
export interface SourceArtifacts {
  readonly [artifactBrand]: true;
}
const mib = 1024 * 1024;
const caps: Readonly<Record<SourceArtifactSlot, number>> = {
  prerequisites: mib,
  'source-tree': 16 * 1024 * mib,
  dependencies: 16 * 1024 * mib,
  configuration: 80 * mib,
  'startup-manifest': 64 * mib,
  openapi: 16 * mib,
  'migration-manifest': 4 * mib,
  'installed-authority-manifest': 1536 * mib + 2 * mib + 4,
  'solver-artifacts': 4 + 8192 + 144 * mib + 128 * 1024,
};
const small = new Set<SourceArtifactSlot>([
  'prerequisites',
  'configuration',
  'startup-manifest',
  'openapi',
  'migration-manifest',
]);
const scope = {
  scope: 'verified-input-staging',
  authorityInstallation: 'not-established',
  writerBuildProvenance: 'not-established',
} as const;
interface Retained {
  file: FileHandle;
  identity: BigIntStats;
  name: string;
  bytes: number;
  sha256: string;
  flags: number;
  snapshot?: Uint8Array;
  prefix?: Uint8Array;
}
export interface SourceArtifactMember {
  readonly slot: SourceArtifactSlot;
  readonly offset: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly path: string;
  readonly mode: number;
}
interface Configuration {
  sourceFiles: { backend: string; gateway: string; mcp: string; frontend: string };
  sourceEnvironment: string[];
  productEnvironment: { backend: string[]; gateway: string[] };
  caddyFiles: { root: string; redaction: string; prod: string; dev: string };
}
interface Projection {
  request: CompleteDependencyActivationRequest;
  manifest: SourceStartupManifest;
  migrations: DependencyMigrationManifest;
  migrationManifestBytes: Uint8Array;
  openapiBytes: Uint8Array;
  configuration: Configuration;
  members: SourceArtifactMember[];
  images: {
    gatewayImageId: string;
    caddy: { reference: string; imageId: string };
    solver: { reference: string; imageId: string }[];
  };
  dependencySha256: string;
  openapiSha256: string;
  frames: { slot: SourceArtifactSlot; bytes: Uint8Array }[];
}
interface Lifetime {
  inputs: SourceInputs;
  retained: Map<SourceArtifactSlot, Retained>;
  projection?: Projection;
  isLive: boolean;
  isBusy: boolean;
  active?: Promise<void>;
  failure?: { cause: unknown };
  closing?: Promise<void>;
}
const lifetimes = new WeakMap<SourceArtifacts, Lifetime>();
const admitting = new WeakSet<SourceInputs>();
const ownedDescriptors = new Map<number, FileHandle>();
function refuseArtifacts(reason: string): never {
  throw new Error(`source artifacts ${reason}`);
}
function hashBytes(bytes: string | Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
function readFields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    // Proof: proxy-reflection-barrier saved fault made the ordering barrier RED; exact restoration replayed GREEN.
    isProxy(value) ||
    // Proof: plain-record-prototype saved fault made the actual consumer RED; exact restoration replayed GREEN.
    Object.getPrototypeOf(value) !== Object.prototype
  )
    refuseArtifacts('object refused');
  // Proof: closed-fields-before-semantic-barrier saved fault made the ordering barrier RED; exact restoration replayed GREEN.
  if (Reflect.ownKeys(value).length !== names.length) refuseArtifacts('fields refused');
  const checked: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    // Proof: own-enumerable-data-field saved fault made the actual consumer RED; exact restoration replayed GREEN.
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      refuseArtifacts('field refused');
    // Proof: own-data-copy-prototype-safety saved fault made the actual consumer RED; exact restoration replayed GREEN.
    Object.defineProperty(checked, name, { value: descriptor.value, enumerable: true });
  }
  return checked;
}
function readText(value: unknown, maximum: number, nonempty = true): string {
  // Proof: bounded-text saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (
    typeof value !== 'string' ||
    (nonempty && value.length === 0) ||
    Buffer.byteLength(value) > maximum ||
    value.includes('\0') ||
    value.startsWith('\ufeff')
  )
    refuseArtifacts('text refused');
  return value;
}
function readInteger(value: unknown, maximum: number, minimum = 0): number {
  // Proof: integer-validation saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    refuseArtifacts('bound refused');
  return value;
}
function assertEqual(actual: unknown, expected: unknown, reason: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) refuseArtifacts(reason);
}
function decodeJson(bytes: Uint8Array): unknown {
  // Proof: raw-JSON-BOM saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) refuseArtifacts('JSON BOM refused');
  // Proof: fatal-UTF8 saved fault made the actual consumer RED; exact restoration replayed GREEN.
  const contents = readText(new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes.length);
  return JSON.parse(contents);
}
function assertCanonical(bytes: Uint8Array, value: unknown) {
  // Proof: canonical-encoding saved fault made the actual consumer RED; exact restoration replayed GREEN.
  // Proof: authority-canonical-encoding saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (!Buffer.from(bytes).equals(Buffer.from(JSON.stringify(value) + '\n')))
    refuseArtifacts('canonical bytes refused');
}
function identifyFile(stats: BigIntStats) {
  return [
    stats.dev,
    stats.ino,
    stats.mode,
    stats.uid,
    stats.gid,
    stats.nlink,
    stats.size,
    stats.mtimeNs,
    stats.ctimeNs,
  ].join(':');
}
function assertLive(lifetime: Lifetime) {
  if (lifetime.failure !== undefined) throw lifetime.failure.cause;
  // Proof: artifact-close-invalidates-read saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (!lifetime.isLive) refuseArtifacts('closed lifetime');
  inspectSourceInputs(lifetime.inputs);
}
function getLifetime(token: SourceArtifacts) {
  const lifetime = lifetimes.get(token);
  if (lifetime === undefined) refuseArtifacts('original token refused');
  return lifetime;
}
function getRetained(lifetime: Lifetime, slot: SourceArtifactSlot) {
  const file = lifetime.retained.get(slot);
  if (file === undefined) refuseArtifacts('role absent');
  return file;
}
async function assertContinuity(lifetime: Lifetime, file: Retained) {
  assertLive(lifetime);
  if (
    (await readDescriptorFlags(file.file.fd)) !== file.flags ||
    identifyFile(await file.file.stat({ bigint: true })) !== identifyFile(file.identity) ||
    identifyFile(await lstat(file.name, { bigint: true })) !== identifyFile(file.identity)
  )
    refuseArtifacts('file changed');
  assertLive(lifetime);
}
/** Shipping aggregate and per-role arithmetic, shared with actual reader; no allocation or admission. @internal */
export function reserveSourceArtifactBytes(
  slot: SourceArtifactSlot,
  bytes: number,
  total: number,
): number {
  // Proof: outer-role-cap saved fault made the actual consumer RED; exact restoration replayed GREEN.
  readInteger(bytes, caps[slot], 1);
  readInteger(total, 20 * 1024 * mib);
  // Proof: aggregate-limit omission admitted one byte beyond shipping 20GiB; production planner boundary consumer RED.
  if (bytes > 20 * 1024 * mib - total) refuseArtifacts('aggregate bound refused');
  return total + bytes;
}
async function readRange(
  lifetime: Lifetime,
  slot: SourceArtifactSlot,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  const file = getRetained(lifetime, slot);
  readInteger(offset, file.bytes);
  readInteger(length, 65536, 1);
  if (length > file.bytes - offset) refuseArtifacts('range refused');
  await assertContinuity(lifetime, file);
  const bytes = Buffer.alloc(length);
  let used = 0;
  while (used < length) {
    assertLive(lifetime);
    const read = await file.file.read(bytes, used, length - used, offset + used);
    if (read.bytesRead < 1 || read.bytesRead > length - used) refuseArtifacts('short read');
    used += read.bytesRead;
  }
  await assertContinuity(lifetime, file);
  if (
    file.prefix !== undefined &&
    offset < file.prefix.length &&
    !bytes
      .subarray(0, Math.min(length, file.prefix.length - offset))
      .equals(Buffer.from(file.prefix.subarray(offset, offset + length)))
  )
    refuseArtifacts('authenticated prefix changed');
  return bytes;
}
async function hashRole(lifetime: Lifetime, slot: SourceArtifactSlot, snapshot: boolean) {
  const file = getRetained(lifetime, slot);
  await assertContinuity(lifetime, file);
  const hash = createHash('sha256');
  const bytes = snapshot ? Buffer.alloc(file.bytes) : undefined;
  const prefixLength =
    slot === 'installed-authority-manifest'
      ? 2 * mib + 4
      : slot === 'solver-artifacts'
        ? 8196
        : slot === 'source-tree'
          ? 27
          : slot === 'dependencies'
            ? 28
            : 0;
  const prefix =
    file.prefix === undefined && prefixLength > 0
      ? Buffer.alloc(Math.min(prefixLength, file.bytes))
      : undefined;
  for (let offset = 0; offset < file.bytes;) {
    const chunk = await readRange(lifetime, slot, offset, Math.min(65536, file.bytes - offset));
    hash.update(chunk);
    bytes?.set(chunk, offset);
    if (prefix !== undefined && offset < prefix.length)
      prefix.set(chunk.subarray(0, Math.min(chunk.length, prefix.length - offset)), offset);
    offset += chunk.length;
  }
  const eof = Buffer.alloc(1);
  const read = await file.file.read(eof, 0, 1, file.bytes);
  if (read.bytesRead !== 0) refuseArtifacts('trailing byte');
  await assertContinuity(lifetime, file);
  // Proof: whole-role-before-parse omission admitted changed exact OpenAPI bytes; actual digest consumer RED.
  assertSourceInputArtifact(lifetime.inputs, slot, file.bytes, hash.digest('hex'));
  if (bytes !== undefined) file.snapshot = bytes;
  // Proof: authenticated-header-retention-dependency saved fault made the authenticated-snapshot dependency RED; exact restoration replayed GREEN.
  if (prefix !== undefined) file.prefix = prefix;
}
async function readBounded(
  lifetime: Lifetime,
  slot: SourceArtifactSlot,
  offset: number,
  length: number,
) {
  const bytes = Buffer.alloc(length);
  for (let used = 0; used < length;) {
    const chunk = await readRange(lifetime, slot, offset + used, Math.min(65536, length - used));
    bytes.set(chunk, used);
    used += chunk.length;
  }
  return bytes;
}
function getSnapshot(lifetime: Lifetime, slot: SourceArtifactSlot) {
  const bytes = getRetained(lifetime, slot).snapshot;
  if (bytes === undefined) refuseArtifacts('snapshot absent');
  return bytes;
}
function readHeader(lifetime: Lifetime, slot: SourceArtifactSlot, maximum: number) {
  const prefix = getRetained(lifetime, slot).prefix;
  if (prefix === undefined || prefix.length < 4) refuseArtifacts('authenticated header absent');
  const length = readInteger(Buffer.from(prefix).readUInt32BE(), maximum, 1);
  if (length > prefix.length - 4) refuseArtifacts('header truncated');
  return { bytes: prefix.slice(4, 4 + length), offset: 4 + length };
}
async function hashMember(lifetime: Lifetime, member: SourceArtifactMember) {
  const hash = createHash('sha256');
  for (let used = 0; used < member.bytes;) {
    const chunk = await readRange(
      lifetime,
      member.slot,
      member.offset + used,
      Math.min(65536, member.bytes - used),
    );
    hash.update(chunk);
    used += chunk.length;
  }
  // Proof: member-payload-hash omission admitted changed actual tree payload; tree-member-hash consumer RED.
  if (hash.digest('hex') !== member.sha256) refuseArtifacts('member hash differs');
}
function decodeEnvironment(value: unknown): string[] {
  // Proof: environment-count saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (!Array.isArray(value) || value.length > 4096) refuseArtifacts('environment refused');
  const assignments = value.map((assignment: unknown) => readText(assignment, 65536));
  const names = assignments.map((assignment) => {
    const split = assignment.indexOf('=');
    // Proof: environment-name-grammar saved fault made the actual consumer RED; exact restoration replayed GREEN.
    if (split < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(assignment.slice(0, split)))
      refuseArtifacts('environment assignment refused');
    return assignment.slice(0, split);
  });
  // Proof: environment-unique-name saved fault made the actual consumer RED; exact restoration replayed GREEN.
  // Proof: environment-JSON-bound saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (new Set(names).size !== names.length || Buffer.byteLength(JSON.stringify(assignments)) > mib)
    refuseArtifacts('environment bounds');
  return assignments;
}
function decodeConfiguration(bytes: Uint8Array): Configuration {
  const root = readFields(decodeJson(bytes), [
    'format',
    'version',
    'sourceFiles',
    'sourceEnvironment',
    'productEnvironment',
    'caddyFiles',
  ]);
  if (root['format'] !== 'source-stageb-configuration' || root['version'] !== 1)
    refuseArtifacts('configuration format');
  const rawFiles = readFields(root['sourceFiles'], ['backend', 'gateway', 'mcp', 'frontend']);
  const sourceFiles = {
    backend: readText(rawFiles['backend'], mib),
    gateway: readText(rawFiles['gateway'], mib),
    mcp: readText(rawFiles['mcp'], mib),
    frontend: readText(rawFiles['frontend'], mib),
  };
  const rawProduct = readFields(root['productEnvironment'], ['backend', 'gateway']);
  const productEnvironment = {
    backend: decodeEnvironment(rawProduct['backend']),
    gateway: decodeEnvironment(rawProduct['gateway']),
  };
  const rawCaddy = readFields(root['caddyFiles'], ['root', 'redaction', 'prod', 'dev']);
  const caddyFiles = {
    root: readText(rawCaddy['root'], mib),
    redaction: readText(rawCaddy['redaction'], mib),
    prod: readText(rawCaddy['prod'], mib),
    dev: readText(rawCaddy['dev'], mib),
  };
  const sourceEnvironment = decodeEnvironment(root['sourceEnvironment']);
  const configuration = { sourceFiles, sourceEnvironment, productEnvironment, caddyFiles };
  assertCanonical(bytes, { format: 'source-stageb-configuration', version: 1, ...configuration });
  decodeSourceRestorationConfiguration(sourceFiles, sourceEnvironment);
  return configuration;
}
function decodeImageId(value: unknown): string {
  const id = readText(value, 71);
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) refuseArtifacts('image ID');
  return id;
}
function decodeImageReference(value: unknown): string {
  const ref = readText(value, 4096);
  if (!/^(?:[a-z0-9][a-z0-9._:-]*\/)*[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$/.test(ref))
    refuseArtifacts('image reference');
  return ref;
}
async function decodeArtifacts(lifetime: Lifetime): Promise<Projection> {
  const sourceSha = inspectSourceInputs(lifetime.inputs).index.sourceSha;
  const prerequisiteBytes = getSnapshot(lifetime, 'prerequisites');
  const prerequisites = readFields(decodeJson(prerequisiteBytes), [
    'format',
    'version',
    'activation',
    'images',
  ]);
  if (prerequisites['format'] !== 'source-stageb-prerequisites' || prerequisites['version'] !== 1)
    refuseArtifacts('prerequisite format');
  const activation = readFields(prerequisites['activation'], [
    'format',
    'version',
    'owner',
    'activate',
    'solver',
    'prod',
    'source',
    'authorities',
    'migrations',
  ]);
  const rawSource = readFields(activation['source'], ['pins', 'runtimeReference']);
  const rawAuthorities = readFields(activation['authorities'], ['pins']);
  const authorityHeader = readHeader(lifetime, 'installed-authority-manifest', 2 * mib);
  const authority = readFields(decodeJson(authorityHeader.bytes), [
    'format',
    'version',
    'writerManifestContents',
    'members',
  ]);
  const authorityFormat = authority['format'];
  const authorityVersion = authority['version'];
  // Proof: authority-format-const saved fault made the actual consumer RED; exact restoration replayed GREEN.
  // Proof: authority-version-const saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (authorityFormat !== 'source-stageb-authority-files' || authorityVersion !== 1)
    refuseArtifacts('authority format');
  const writerManifestContents = readText(authority['writerManifestContents'], 256 * 1024);
  const manifestContents = readText(
    new TextDecoder('utf-8', { fatal: true }).decode(getSnapshot(lifetime, 'startup-manifest')),
    64 * mib,
  );
  const request = decodeCompleteDependencyActivationRequest(
    {
      ...activation,
      source: { ...rawSource, manifestContents },
      authorities: { ...rawAuthorities, writerManifestContents },
    },
    inspectSourceInputs(lifetime.inputs).originalDeadline,
  );
  // Proof: private-dev-profile omission admitted authenticated prod activation; private-dev-roster consumer RED.
  if (request.owner.sha !== sourceSha || JSON.stringify(request.activate) !== '["dev"]')
    refuseArtifacts('source/profile differs');
  const manifest = decodeSourceStartupManifest(manifestContents, request.source.pins);
  const migrations = decodeDependencyMigrationManifest(
    new TextDecoder('utf-8', { fatal: true }).decode(getSnapshot(lifetime, 'migration-manifest')),
    request.migrations,
  );
  // Proof: writer-identity omission admitted changed build SHA; authority-wrong-build consumer RED.
  const writer = decodeWriterManifest(JSON.parse(writerManifestContents));
  if (
    // Proof: writer-inner-document-hash saved fault made the actual consumer RED; exact restoration replayed GREEN.
    hashBytes(writerManifestContents) !== request.authorities.pins.writerManifestSha256 ||
    writer.sourceSha !== sourceSha ||
    writer.buildSha !== sourceSha
  )
    refuseArtifacts('writer attribution differs');
  const prodRoot = envLayout('prod').root;
  const devRoot = envLayout('dev').root;
  // Existing installed-authorities.ts FIXED_WRITER_PATHS; comparison grants no path IO authority.
  const knownPaths = new Map<string, string>([
    ['prod-swap', `${prodRoot}/bin/swap.js`],
    ['prod-smoke', `${prodRoot}/bin/smoke.js`],
    ['dev-swap', `${devRoot}/bin/swap.js`],
    ['dev-smoke', `${devRoot}/bin/smoke.js`],
    ['dev-poller', `${devRoot}/bin/poll.sh`],
    ['dev-loader', `${devRoot}/bin/dev-poll-sync.sh`],
    ['dev-interpreter', `${devRoot}/bin/bun`],
  ]);
  for (const member of writer.members) {
    // Proof: known-writer-target omission admitted changed canonical target claim; authority-known-target consumer RED.
    const known = knownPaths.get(member.member);
    if (known !== undefined && known !== member.hostPath)
      refuseArtifacts('known writer destination differs');
  }
  // Proof: ordered-environment omission admitted changed ordered Env; configuration-vs-env-digest consumer RED.
  const configuration = decodeConfiguration(getSnapshot(lifetime, 'configuration'));
  if (
    hashBytes(JSON.stringify(configuration.sourceEnvironment)) !==
    request.source.pins.environmentSha256
  )
    refuseArtifacts('ordered environment differs');
  // Proof: source-config-pin omission admitted changed dotenv size/hash; source-config-size-hash consumer RED.
  for (const pin of manifest.configuration) {
    const bytes = configuration.sourceFiles[pin.slot];
    if (Buffer.byteLength(bytes) !== pin.size || hashBytes(bytes) !== pin.sha256)
      refuseArtifacts('configuration pin differs');
  }
  const openapiValue = decodeJson(getSnapshot(lifetime, 'openapi'));
  if (typeof openapiValue !== 'object' || openapiValue === null || Array.isArray(openapiValue))
    refuseArtifacts('OpenAPI object');
  const openapi = readFields(openapiValue, Object.keys(openapiValue));
  if (
    typeof openapi['openapi'] !== 'string' ||
    !openapi['openapi'].startsWith('3.') ||
    typeof openapi['info'] !== 'object' ||
    openapi['info'] === null ||
    typeof openapi['paths'] !== 'object' ||
    openapi['paths'] === null
  )
    refuseArtifacts('OpenAPI differs');
  const rawImages = readFields(prerequisites['images'], ['gatewayImageId', 'caddy', 'solver']);
  const caddy = readFields(rawImages['caddy'], ['reference', 'imageId']);
  if (!Array.isArray(rawImages['solver']) || rawImages['solver'].length > 4)
    refuseArtifacts('solver image table');
  const images = {
    gatewayImageId: decodeImageId(rawImages['gatewayImageId']),
    caddy: {
      reference: decodeImageReference(caddy['reference']),
      imageId: decodeImageId(caddy['imageId']),
    },
    solver: rawImages['solver'].map((value: unknown) => {
      const row = readFields(value, ['reference', 'imageId']);
      return {
        reference: decodeImageReference(row['reference']),
        imageId: decodeImageId(row['imageId']),
      };
    }),
  };
  if (
    images.solver.some(
      (row, index) =>
        index > 0 &&
        row.reference <=
          (images.solver.at(index - 1)?.reference ?? refuseArtifacts('image predecessor absent')),
    )
  )
    refuseArtifacts('image table order');
  const projectedActivation = {
    ...request,
    source: { pins: request.source.pins, runtimeReference: request.source.runtimeReference },
    authorities: { pins: request.authorities.pins },
  };
  assertCanonical(prerequisiteBytes, {
    format: 'source-stageb-prerequisites',
    version: 1,
    activation: projectedActivation,
    images,
  });
  const members: SourceArtifactMember[] = [];
  for (const slot of ['source-tree', 'dependencies'] as const) {
    const prefix = Buffer.from(
      slot === 'source-tree' ? 'source-stageb-source-tree-v1\n' : 'source-stageb-dependencies-v1\n',
    );
    // Proof: tree-prefix-codeword saved fault made the actual consumer RED; exact restoration replayed GREEN.
    if (!Buffer.from(await readRange(lifetime, slot, 0, prefix.length)).equals(prefix))
      refuseArtifacts('tree prefix');
    let offset = prefix.length;
    for (const entry of manifest.entries)
      if (
        entry.kind === 'file' &&
        (slot === 'dependencies' ? entry.root === 'dependencies' : entry.root !== 'dependencies')
      ) {
        const path =
          entry.root === 'source'
            ? `source/${entry.path}`
            : entry.root === 'git'
              ? `source/.git/${entry.path}`
              : `source/node_modules/${entry.path}`;
        members.push({
          slot,
          offset,
          bytes: entry.size,
          sha256: entry.sha256,
          path,
          mode: entry.mode,
        });
        offset += entry.size;
      }
    // Proof: tree-outer-length omission admitted an extra actual tree byte; tree-trailing consumer RED.
    if (offset !== getRetained(lifetime, slot).bytes) refuseArtifacts('tree length differs');
  }
  if (!manifest.entries.some((entry) => entry.root === 'git' && entry.kind === 'file'))
    refuseArtifacts('standalone Git absent');
  const rawMembers = authority['members'];
  if (!Array.isArray(rawMembers) || rawMembers.length !== WRITER_MEMBERS.length)
    refuseArtifacts('authority member count');
  let offset = authorityHeader.offset;
  let payload = 0;
  const authorityMembers = rawMembers.map((value: unknown, index) => {
    const row = readFields(value, ['member', 'bytes', 'mode']);
    const declaredMember = row['member'];
    const member = WRITER_MEMBERS.at(index);
    // Proof: authority-member-const saved fault made the actual consumer RED; exact restoration replayed GREEN.
    if (member === undefined || declaredMember !== member)
      refuseArtifacts('authority member order');
    const bytes = readInteger(row['bytes'], 128 * mib, 1);
    const mode = readInteger(row['mode'], 0o755);
    // Proof: authority-mode-roster saved fault made the actual consumer RED; exact restoration replayed GREEN.
    if (![0o600, 0o644, 0o755].includes(mode)) refuseArtifacts('authority mode');
    const pin = writer.members.find((candidate) => candidate.member === member);
    if (pin === undefined) refuseArtifacts('writer member absent');
    members.push({
      slot: 'installed-authority-manifest',
      offset,
      bytes,
      sha256: pin.sha256,
      path: `authority/${member}`,
      mode,
    });
    offset += bytes;
    payload += bytes;
    return { member: declaredMember, bytes, mode };
  });
  if (
    payload > 1536 * mib ||
    // Proof: authority-exact-outer-EOF saved fault made the actual consumer RED; exact restoration replayed GREEN.
    offset !== getRetained(lifetime, 'installed-authority-manifest').bytes
  )
    refuseArtifacts('authority payload length');
  assertCanonical(authorityHeader.bytes, {
    format: authorityFormat,
    version: authorityVersion,
    writerManifestContents,
    members: authorityMembers,
  });
  const solverHeader = readHeader(lifetime, 'solver-artifacts', 8192);
  const solver = readFields(decodeJson(solverHeader.bytes), ['format', 'version', 'members']);
  if (
    solver['format'] !== 'source-stageb-solver-files' ||
    solver['version'] !== 1 ||
    !Array.isArray(solver['members']) ||
    solver['members'].length !== 4
  )
    refuseArtifacts('solver format');
  offset = solverHeader.offset;
  const solverSlots = ['bun', 'bundle', 'configuration', 'unit'];
  const limits = [128 * mib, 16 * mib, 65536, 65536];
  const modes = [0o755, 0o755, 0o600, 0o644];
  const hashes = [
    request.solver.bunSha256,
    request.solver.bundleSha256,
    request.solver.configSha256,
    request.solver.unitSha256,
  ];
  const solverMembers = solver['members'].map((value: unknown, index) => {
    const row = readFields(value, ['slot', 'bytes']);
    const slot = solverSlots.at(index);
    const limit = limits.at(index);
    const mode = modes.at(index);
    const sha256 = hashes.at(index);
    if (
      slot === undefined ||
      limit === undefined ||
      mode === undefined ||
      sha256 === undefined ||
      row['slot'] !== slot
    )
      refuseArtifacts('solver order');
    const bytes = readInteger(row['bytes'], limit, 1);
    members.push({ slot: 'solver-artifacts', offset, bytes, sha256, path: `solver/${slot}`, mode });
    offset += bytes;
    return { slot, bytes };
  });
  // Proof: solver-exact-outer-EOF saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (offset !== getRetained(lifetime, 'solver-artifacts').bytes)
    refuseArtifacts('solver payload length');
  assertCanonical(solverHeader.bytes, {
    format: 'source-stageb-solver-files',
    version: 1,
    members: solverMembers,
  });
  for (const member of members) await hashMember(lifetime, member);
  const configMember = members.find((member) => member.path === 'solver/configuration');
  if (configMember === undefined) refuseArtifacts('solver configuration absent');
  const configBytes = await readBounded(
    lifetime,
    configMember.slot,
    configMember.offset,
    configMember.bytes,
  );
  // Proof: consumed-solver-config-hash saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (hashBytes(configBytes) !== configMember.sha256)
    refuseArtifacts('consumed solver configuration differs');
  const rawConfig: unknown = decodeJson(configBytes);
  decodeSolverSupervisorConfig(rawConfig);
  const config = readFields(rawConfig, [
    'socketPath',
    'maxSearchWorkers',
    'maxMemoryLimitMb',
    'pidsLimit',
    'maxManagedContainers',
    'devSourceSha',
    'images',
  ]);
  // Proof: solver-source-socket omission admitted changed source SHA; solver-source-sha consumer RED.
  if (config['socketPath'] !== SOLVER_SUPERVISOR_SOCKET || config['devSourceSha'] !== sourceSha)
    refuseArtifacts('solver source/socket differs');
  const rules = config['images'];
  // Proof: solver-roster-count omission admitted missing dev source; solver-source-missing consumer RED.
  if (!Array.isArray(rules) || rules.length !== 2) refuseArtifacts('solver roster count');
  const references: string[] = [];
  for (const [index, value] of rules.entries()) {
    // Proof: solver-selected-caller omission admitted opposite backend color; solver-opposite-color consumer RED.
    const rule = readFields(value, ['callerName', 'callerImage', 'solverImage']);
    if (
      rule['callerName'] !==
        (index === 0 ? `be-01-${request.prod.backend.color}` : 'wbs-dev-src') ||
      rule['callerImage'] !== (index === 0 ? request.prod.backend.image : null)
    )
      refuseArtifacts('solver caller differs');
    references.push(decodeImageReference(rule['solverImage']));
  }
  // Proof: solver-reference-table omission admitted missing authenticated image reference; solver-image-table-missing consumer RED.
  assertEqual(
    images.solver.map((row) => row.reference),
    [...new Set(references)].sort(),
    'solver references differ',
  );
  for (const row of migrations.migrations)
    for (const [name, pin] of [
      ['migration.sql', row.migration],
      ['down.sql', row.down],
      ['snapshot.json', row.snapshot],
    ] as const) {
      const entry = manifest.entries.find(
        (entry) =>
          entry.root === 'source' && entry.path === `apps/wbs/be-01/drizzle/${row.name}/${name}`,
      );
      // Proof: migration-source-row-join saved fault made the actual consumer RED; exact restoration replayed GREEN.
      if (
        pin === null
          ? entry !== undefined
          : entry?.kind !== 'file' || entry.size !== pin.size || entry.sha256 !== pin.sha256
      )
        refuseArtifacts('migration source differs');
    }
  await recheckArtifacts(lifetime);
  return {
    request,
    manifest,
    migrations,
    migrationManifestBytes: getSnapshot(lifetime, 'migration-manifest'),
    openapiBytes: getSnapshot(lifetime, 'openapi'),
    configuration,
    members,
    images,
    dependencySha256: getRetained(lifetime, 'dependencies').sha256,
    openapiSha256: getRetained(lifetime, 'openapi').sha256,
    frames: [
      { slot: 'source-tree', bytes: Buffer.from('source-stageb-source-tree-v1\n') },
      { slot: 'dependencies', bytes: Buffer.from('source-stageb-dependencies-v1\n') },
      {
        slot: 'installed-authority-manifest',
        bytes: (
          getRetained(lifetime, 'installed-authority-manifest').prefix ??
          refuseArtifacts('authority prefix absent')
        ).slice(0, authorityHeader.offset),
      },
      {
        slot: 'solver-artifacts',
        bytes: (
          getRetained(lifetime, 'solver-artifacts').prefix ??
          refuseArtifacts('solver prefix absent')
        ).slice(0, solverHeader.offset),
      },
    ],
  };
}
async function recheckArtifacts(lifetime: Lifetime) {
  for (const slot of slots) await hashRole(lifetime, slot, false);
}
interface BorrowedArtifact {
  descriptor: number;
  identity: BigIntStats;
  name: string;
  flags: number;
}
interface Acquisition {
  file: FileHandle;
  descriptor: number;
  identity?: BigIntStats;
  flags?: number;
}
const failedAcquisitions = new Set<Acquisition>();
const failedRetained = new Set<Retained>();
async function readDescriptorFlags(descriptor: number): Promise<number> {
  const contents = await readFile(`/proc/self/fdinfo/${String(descriptor)}`, 'utf8');
  const encoded = /^flags:\s+([0-7]+)$/m.exec(contents)?.at(1);
  if (encoded === undefined) refuseArtifacts('descriptor flags absent');
  const flags = Number.parseInt(encoded, 8);
  // Linux O_PATH (0020000000) is not an actual readable descriptor even with access bits zero.
  // Proof: borrowed-access omission admitted actual O_RDWR delivery; read-write-input consumer RED.
  if ((flags & 3) !== 0 || (flags & 0x200000) !== 0)
    refuseArtifacts('read-only descriptor required');
  return flags;
}
async function assertBorrowed(inputs: SourceInputs, borrowed: BorrowedArtifact) {
  // Proof: borrowed-binding omission admitted actual pre-handoff close/reuse; borrowed-reuse consumer RED.
  inspectSourceInputs(inputs);
  if (
    identifyFile(fstatSync(borrowed.descriptor, { bigint: true })) !==
      identifyFile(borrowed.identity) ||
    readlinkSync(`/proc/self/fd/${String(borrowed.descriptor)}`) !== borrowed.name ||
    (await readDescriptorFlags(borrowed.descriptor)) !== borrowed.flags
  )
    refuseArtifacts('borrowed binding changed');
  inspectSourceInputs(inputs);
}
async function closeAcquisition(acquisition: Acquisition) {
  if (acquisition.file.fd !== acquisition.descriptor) refuseArtifacts('owned descriptor changed');
  if (acquisition.identity !== undefined) {
    const current = fstatSync(acquisition.descriptor, { bigint: true });
    if (
      current.dev !== acquisition.identity.dev ||
      current.ino !== acquisition.identity.ino ||
      (current.mode & 0o170000n) !== (acquisition.identity.mode & 0o170000n)
    )
      refuseArtifacts('owned close identity unproved');
  }
  // Before first identity, actual trusted open plus exclusive private FD custody establishes this acquired reference; no caller number enters this ledger.
  if (
    acquisition.flags !== undefined &&
    (await readDescriptorFlags(acquisition.descriptor)) !== acquisition.flags
  )
    refuseArtifacts('owned access flags changed');
  await acquisition.file.close();
  if (ownedDescriptors.get(acquisition.descriptor) === acquisition.file)
    ownedDescriptors.delete(acquisition.descriptor);
}
/** Borrows nine stable primitive descriptors until Promise settlement. Owns only actual trusted procfd reopens; caller originals are never closed. Native decoder imports initialize FFI/SQLite bindings. */
export async function readSourceArtifacts(
  inputs: SourceInputs,
  descriptors: SourceArtifactDescriptors,
): Promise<SourceArtifacts> {
  const inspection = inspectSourceInputs(inputs);
  // Proof: admission-overlap omission accepted a second actual own-reference lifetime; overlap-admission consumer RED.
  if (admitting.has(inputs)) refuseArtifacts('overlapping admission');
  const record = readFields(descriptors, slots);
  // Proof: role-key-order omission admitted reversed actual borrowed-slot record; role-order consumer RED.
  assertEqual(Reflect.ownKeys(descriptors), slots, 'role order differs');
  const numbers = slots.map((slot) => readInteger(record[slot], 2147483647));
  // Proof: private-owned-descriptor-overlap saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (
    new Set(numbers).size !== slots.length ||
    numbers.includes(8) ||
    numbers.some((descriptor) => ownedDescriptors.has(descriptor))
  )
    refuseArtifacts('borrowed descriptor alias');
  admitting.add(inputs);
  const lifetime: Lifetime = { inputs, retained: new Map(), isLive: true, isBusy: false };
  const acquired: Acquisition[] = [];
  try {
    if (
      process.platform !== 'linux' ||
      process.geteuid === undefined ||
      process.getegid === undefined
    )
      refuseArtifacts('UID/procfd observation unavailable');
    const borrowed = new Map<SourceArtifactSlot, BorrowedArtifact>();
    let total = 0;
    const identities = new Set<string>();
    for (const [index, slot] of slots.entries()) {
      inspectSourceInputs(inputs);
      const descriptor = numbers.at(index);
      if (descriptor === undefined) refuseArtifacts('borrowed role absent');
      const stats = fstatSync(descriptor, { bigint: true });
      const key = `${String(stats.dev)}:${String(stats.ino)}`;
      if (
        !stats.isFile() ||
        // Proof: input-hardlink-exclusion saved fault made the actual consumer RED; exact restoration replayed GREEN.
        stats.nlink !== 1n ||
        stats.uid !== BigInt(process.geteuid()) ||
        stats.gid !== BigInt(process.getegid()) ||
        // Proof: input-private-write-mode saved fault made the actual consumer RED; exact restoration replayed GREEN.
        (stats.mode & 0o022n) !== 0n ||
        // Proof: input-owner-read-bit-barrier saved fault made the ordering barrier RED; exact restoration replayed GREEN.
        (stats.mode & 0o400n) === 0n ||
        identities.has(key)
      )
        refuseArtifacts('regular file custody refused');
      identities.add(key);
      const flags = await readDescriptorFlags(descriptor);
      const name = readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      const expected = inspection.index.artifacts.find((artifact) => artifact.slot === slot);
      if (expected === undefined || BigInt(expected.bytes) !== stats.size)
        refuseArtifacts('role size differs');
      total = reserveSourceArtifactBytes(slot, expected.bytes, total);
      borrowed.set(slot, { descriptor, identity: stats, name, flags });
    }
    for (const slot of slots) {
      const original = borrowed.get(slot);
      if (original === undefined) refuseArtifacts('borrowed observation absent');
      await assertBorrowed(inputs, original);
      const file = await open(
        `/proc/self/fd/${String(original.descriptor)}`,
        constants.O_RDONLY | constants.O_NONBLOCK,
      );
      const acquisition: Acquisition = { file, descriptor: file.fd };
      // Proof: immediate-owned-ledger omission leaked the actual late-opened reference; late-artifact-open settlement consumer RED.
      acquired.push(acquisition);
      if (ownedDescriptors.has(file.fd)) refuseArtifacts('owned descriptor collision');
      ownedDescriptors.set(file.fd, file);
      acquisition.identity = fstatSync(file.fd, { bigint: true });
      assertLive(lifetime);
      if (
        numbers.includes(file.fd) ||
        acquired.slice(0, -1).some((previous) => previous.descriptor === file.fd)
      )
        refuseArtifacts('owned/borrowed descriptor collision');
      if (
        !acquisition.identity.isFile() ||
        identifyFile(acquisition.identity) !== identifyFile(original.identity)
      )
        refuseArtifacts('acquired identity differs');
      acquisition.flags = await readDescriptorFlags(file.fd);
      await assertBorrowed(inputs, original);
      const expected = inspection.index.artifacts.find((artifact) => artifact.slot === slot);
      if (expected === undefined) refuseArtifacts('expected role absent');
      lifetime.retained.set(slot, {
        file,
        identity: acquisition.identity,
        name: original.name,
        bytes: expected.bytes,
        sha256: expected.sha256,
        flags: acquisition.flags,
      });
      await assertContinuity(lifetime, getRetained(lifetime, slot));
    }
    for (const original of borrowed.values()) await assertBorrowed(inputs, original);
    // All whole-role joins precede interpretation; reads and settlement use B-owned references only.
    for (const slot of slots) await hashRole(lifetime, slot, small.has(slot));
    lifetime.projection = await decodeArtifacts(lifetime);
    for (const role of lifetime.retained.values()) role.snapshot = undefined;
    for (const original of borrowed.values()) await assertBorrowed(inputs, original);
    assertLive(lifetime);
    const token = Object.freeze({});
    lifetimes.set(token as SourceArtifacts, lifetime);
    return token as SourceArtifacts; // Boundary: registered original identity alone carries this private lifetime.
  } catch (primary) {
    lifetime.isLive = false;
    const cleanup: unknown[] = [];
    for (const acquisition of acquired)
      try {
        await closeAcquisition(acquisition);
      } catch (failure) {
        failedAcquisitions.add(acquisition);
        cleanup.push(failure);
      }
    if (cleanup.length > 0)
      throw new AggregateError([primary, ...cleanup], 'source artifacts read and cleanup failed', {
        cause: primary,
      });
    throw primary;
  } finally {
    admitting.delete(inputs);
  }
}
/** Detached bounded authenticated metadata, never descriptors, install authority or historical compilation evidence. */
export function inspectSourceArtifacts(token: SourceArtifacts) {
  const lifetime = getLifetime(token);
  assertLive(lifetime);
  if (lifetime.projection === undefined) refuseArtifacts('projection absent');
  // Proof: inspection-detached-copy saved fault made the actual consumer RED; exact restoration replayed GREEN.
  return structuredClone({ ...scope, ...lifetime.projection });
}
async function runArtifactOperation<T>(
  lifetime: Lifetime,
  operation: () => Promise<T>,
): Promise<T> {
  assertLive(lifetime);
  // Proof: internal-operation-overlap omission admitted simultaneous read/recheck; bounded-helper consumer RED.
  if (lifetime.isBusy) refuseArtifacts('overlapping operation');
  lifetime.isBusy = true;
  let settle: (() => void) | undefined;
  lifetime.active = new Promise<void>((resolve) => {
    settle = resolve;
  });
  try {
    return await operation();
  } catch (cause) {
    lifetime.failure ??= { cause };
    lifetime.isLive = false;
    throw cause;
  } finally {
    lifetime.isBusy = false;
    if (settle === undefined) refuseArtifacts('settlement absent');
    settle();
  }
}
/** B-only bounded positional input access; transfers bytes, never descriptor or output authority. @internal */
export function readSourceArtifactChunk(
  inputs: SourceInputs,
  token: SourceArtifacts,
  slot: SourceArtifactSlot,
  offset: number,
  length: number,
) {
  const lifetime = getLifetime(token);
  // Proof: chunk-same-original-I saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (lifetime.inputs !== inputs) refuseArtifacts('I instance differs');
  assertLive(lifetime);
  const file = getRetained(lifetime, slot);
  readInteger(offset, file.bytes);
  readInteger(length, 65536, 1);
  if (length > file.bytes - offset) refuseArtifacts('range refused');
  return runArtifactOperation(lifetime, () => readRange(lifetime, slot, offset, length));
}
/** Rehashes original mutable delivery after population, preserving original I/cutoff. @internal */
export function recheckSourceArtifacts(inputs: SourceInputs, token: SourceArtifacts) {
  const lifetime = getLifetime(token);
  if (lifetime.inputs !== inputs) refuseArtifacts('I instance differs');
  return runArtifactOperation(lifetime, () => recheckArtifacts(lifetime));
}
/** Settles only B-owned procfd references, once, after acquired IO. Caller originals are never closed; future reads invalidate immediately. */
export function closeSourceArtifacts(token: SourceArtifacts): Promise<void> {
  let lifetime: Lifetime;
  try {
    lifetime = getLifetime(token);
  } catch (failure) {
    return Promise.reject(
      failure instanceof Error
        ? failure
        : new Error('source artifact token refused', { cause: failure }),
    );
  }
  // Proof: artifact-close-memoization saved fault made the actual consumer RED; exact restoration replayed GREEN.
  if (lifetime.closing !== undefined) return lifetime.closing;
  lifetime.isLive = false;
  lifetime.closing = (async () => {
    await lifetime.active;
    const failures: unknown[] = [];
    for (const file of lifetime.retained.values())
      try {
        const descriptor = file.file.fd;
        const current = await file.file.stat({ bigint: true });
        if (
          current.dev !== file.identity.dev ||
          current.ino !== file.identity.ino ||
          !current.isFile() ||
          (await readDescriptorFlags(file.file.fd)) !== file.flags
        )
          // Proof: owned-close-identity omission closed the deliberately recycled private FD; private-own-recycling consumer RED.
          refuseArtifacts('close descriptor recycled');
        // Proof: owned-close-effect omission left real owned references open; actual nine-role original-survival consumer RED.
        await file.file.close();
        if (ownedDescriptors.get(descriptor) === file.file) ownedDescriptors.delete(descriptor);
      } catch (failure) {
        failedRetained.add(file);
        failures.push(failure);
      }
    lifetime.retained.clear();
    lifetime.projection = undefined;
    if (failures.length > 0)
      throw new AggregateError(
        lifetime.failure === undefined ? failures : [lifetime.failure.cause, ...failures],
        'source artifact close failed',
        lifetime.failure === undefined ? undefined : { cause: lifetime.failure.cause },
      );
  })();
  return lifetime.closing;
}
