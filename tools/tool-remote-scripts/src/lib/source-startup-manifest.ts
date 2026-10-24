import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, lstat, open, readdir, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';

import { envLayout } from './env';
import {
  decodeSourceRestorationConfiguration,
  type SourceRestorationConfiguration,
} from './source-restoration-configuration';

export interface SourceDevPins {
  version: 1;
  sourceSha: string;
  runtimeImageId: string;
  manifestSha256: string;
  environmentSha256: string;
}
export type SourceRoot = 'source' | 'dependencies' | 'git';
export type SourceEntry =
  | { root: SourceRoot; path: string; kind: 'directory'; mode: number }
  | { root: SourceRoot; path: string; kind: 'file'; mode: number; size: number; sha256: string }
  | { root: SourceRoot; path: string; kind: 'symlink'; target: string };
export type SourceConfigSlot = 'backend' | 'gateway' | 'mcp' | 'frontend';
export interface SourceConfigPin {
  slot: SourceConfigSlot;
  size: number;
  sha256: string;
}
export interface SourceStartupManifest {
  format: 'wbs-source-startup';
  version: 1;
  profile: 'wbs-source-cold-v1';
  sourceSha: string;
  entries: readonly SourceEntry[];
  configuration: readonly SourceConfigPin[];
}
const ROOTS: readonly SourceRoot[] = ['source', 'dependencies', 'git'];
const TIERS = ['be-01', 'gw-01', 'mcp-01', 'fe-01'] as const;
const SLOTS: readonly SourceConfigSlot[] = ['backend', 'gateway', 'mcp', 'frontend'];
const CONFIGS = TIERS.map((tier) => `apps/wbs/${tier}/.env`);
const MAX_MANIFEST = 64 * 1024 * 1024;
const MAX_FILE = 512 * 1024 * 1024;
const MAX_TOTAL = 16 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 250000;
const MAX_CONFIG = 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const COLD_PATHS = [
  '.nx',
  'dist',
  'node_modules/.cache',
  'node_modules/.vite',
  'node_modules/.vite-temp',
  ...TIERS.map((tier) => `apps/wbs/${tier}/node_modules`),
  'apps/wbs/fe-01/.vite',
  'apps/wbs/mcp-01/src/openapi.json',
];
const RUNNING_OUTPUTS = [
  '.nx',
  'node_modules/.cache',
  'node_modules/.vite',
  'node_modules/.vite-temp',
  'apps/wbs/fe-01/.vite',
  'apps/wbs/mcp-01/src/openapi.json',
];
const CONFIG_NAMES = [
  '.env.local',
  '.local.env',
  ...['development', 'production', 'test'].flatMap((mode) => [
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]),
  ...['serve', 'prepare'].flatMap((target) => [
    `.env.${target}.local`,
    `.env.${target}`,
    `.${target}.local.env`,
    `.${target}.env`,
  ]),
  'bunfig.toml',
  '.bunfig.toml',
  '.npmrc',
];
const FORBIDDEN = new Set([
  'BUN_OPTIONS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_COMPILE_CACHE',
  'BASH_ENV',
  'ENV',
  'SHELLOPTS',
  'BASHOPTS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'WBS_DEV_LOG',
]);
const PROFILE: Readonly<Record<string, string>> = {
  NODE_ENV: 'development',
  NX_DAEMON: 'false',
  NX_CACHE_PROJECT_GRAPH: 'false',
  NX_SKIP_NX_CACHE: 'true',
  NX_LOAD_DOT_ENV_FILES: 'false',
  NX_ISOLATE_PLUGINS: 'false',
  NX_CACHE_DIRECTORY: '/src/.nx/cache',
  NX_WORKSPACE_DATA_DIRECTORY: '/src/.nx/workspace-data',
  NX_NATIVE_FILE_CACHE_DIRECTORY: '/src/.nx/native',
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
  WBS_PUBLIC_DEV: 'true',
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
};
function fail(): never {
  throw new Error('source startup inputs invalid or changed');
}
// Proof: closed-pins omission accepted an unknown field; closed pins require full SHA test failed.
function readFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
  return value as Record<string, unknown>; /* Closed object boundary checked above. */
}
function readText(value: unknown): string {
  if (typeof value !== 'string') fail();
  return value;
}
// Proof: removing the numeric limit accepted a 512MiB+1 declaration; decoder oversized-file test failed.
function readInteger(value: unknown, limit: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > limit)
    fail();
  return value;
}
function hashContents(contents: string | Uint8Array): string {
  return createHash('sha256').update(contents).digest('hex');
}
function readDigest(value: unknown): string {
  const encoded = readText(value);
  if (!HEX.test(encoded)) fail();
  return encoded;
}
function readSourceSha(value: unknown): string {
  const encoded = readText(value);
  if (!SHA.test(encoded)) fail();
  return encoded;
}
// Proof: independent byte/depth omissions admitted otherwise complete long/deep declarations; path bounds test failed.
function readPath(value: unknown): string {
  const path = readText(value);
  if (
    !path ||
    Buffer.byteLength(path) > 4096 ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    path.split('/').length > 64
  )
    fail();
  return path;
}
// Proof: four-slot count omitted accepted the missing final config slot; canonical manifest test failed.
function decodeConfigurationPins(value: unknown): SourceConfigPin[] {
  if (!Array.isArray(value) || value.length !== 4) fail();
  return value.map((raw: unknown, index) => {
    const pin = readFields(raw, ['slot', 'size', 'sha256']);
    if (pin['slot'] !== SLOTS[index]) fail();
    const size = readInteger(pin['size'], MAX_CONFIG);
    if (size === 0) fail();
    return {
      slot: SLOTS[index],
      size,
      sha256: readDigest(pin['sha256']),
    }; /* Exact four-entry slot boundary checked above. */
  });
}
/** Closed independently supplied identity; installed observations never supply missing expected pins. */
export function decodeSourceDevPins(value: unknown): SourceDevPins {
  const pins = readFields(value, [
    'version',
    'sourceSha',
    'runtimeImageId',
    'manifestSha256',
    'environmentSha256',
  ]);
  const image = readText(pins['runtimeImageId']);
  if (pins['version'] !== 1 || !/^sha256:[a-f0-9]{64}$/.test(image)) fail();
  return {
    version: 1,
    sourceSha: readSourceSha(pins['sourceSha']),
    runtimeImageId: image,
    manifestSha256: readDigest(pins['manifestSha256']),
    environmentSha256: readDigest(pins['environmentSha256']),
  };
}
function decodeEntries(value: unknown): SourceEntry[] {
  // Proof: entry-count guard omitted admitted 250001 unique entries; manifest limits test failed.
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) fail();
  let previous = '';
  let total = 0;
  const directories = new Set<string>();
  return value.map((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null || !('kind' in raw)) fail();
    const entry = readFields(
      raw,
      raw.kind === 'directory'
        ? ['root', 'path', 'kind', 'mode']
        : raw.kind === 'file'
          ? ['root', 'path', 'kind', 'mode', 'size', 'sha256']
          : ['root', 'path', 'kind', 'target'],
    );
    const root = readText(entry['root']);
    const index = ROOTS.indexOf(root as SourceRoot);
    /* Membership checked immediately below. */ if (index < 0) fail();
    const path = readPath(entry['path']);
    const key = `${String(index)}/${path}`;
    // Proof: ordering omitted admitted out-of-order roots; declaration ordering test failed.
    if (previous !== '' && Buffer.compare(Buffer.from(previous), Buffer.from(key)) >= 0) fail();
    previous = key;
    const parent = posix.dirname(path);
    // Proof: parent membership omitted admitted an orphan directory; declaration ordering test failed.
    if (parent !== '.' && !directories.has(`${root}/${parent}`)) fail();
    if (isReserved(root as SourceRoot, path)) fail();
    const base = { root: root as SourceRoot, path }; /* Fixed root membership checked above. */
    if (entry['kind'] === 'directory') {
      const mode = readInteger(entry['mode'], 0o777);
      // Proof: directory-mode check omitted admitted0777; declaration ordering test failed.
      if (![0o700, 0o755].includes(mode)) fail();
      directories.add(`${root}/${path}`);
      return { ...base, kind: 'directory', mode };
    }
    if (entry['kind'] === 'file') {
      const mode = readInteger(entry['mode'], 0o777);
      if (![0o444, 0o600, 0o644, 0o700, 0o755].includes(mode)) fail();
      const size = readInteger(entry['size'], MAX_FILE);
      total += size;
      // Proof: declared-byte guard omitted admitted 33 legal 512MiB files; manifest limits test failed.
      if (total > MAX_TOTAL) fail();
      return { ...base, kind: 'file', mode, size, sha256: readDigest(entry['sha256']) };
    }
    if (entry['kind'] !== 'symlink') fail();
    const target = readText(entry['target']);
    if (
      !target ||
      Buffer.byteLength(target) > 4096 ||
      target.includes('\0') ||
      target.includes('\\') ||
      posix.isAbsolute(target) ||
      target.split('/').some((segment) => segment === '' || segment === '.') ||
      target.split('/').length > 64
    )
      fail();
    return { ...base, kind: 'symlink', target };
  });
}
// Proof: both reserved-path calls omitted admitted a tracked cold cache; cold cache roots test failed.
function isReserved(root: SourceRoot, path: string): boolean {
  const sourcePath =
    root === 'dependencies' ? `node_modules/${path}` : root === 'git' ? `.git/${path}` : path;
  return (
    (root === 'source' &&
      (path === 'node_modules' ||
        path.startsWith('node_modules/') ||
        path === '.git' ||
        path.startsWith('.git/') ||
        CONFIGS.includes(path))) ||
    COLD_PATHS.some((cold) => sourcePath === cold || sourcePath.startsWith(`${cold}/`)) ||
    ['', ...TIERS.map((tier) => `apps/wbs/${tier}/`)].some((prefix) =>
      CONFIG_NAMES.some((name) => sourcePath === prefix + name),
    ) ||
    sourcePath === '.env' ||
    (root === 'git' &&
      (path.endsWith('.lock') || ['objects/info/alternates', 'commondir', 'gitdir'].includes(path)))
  );
}
// Proof: resolver omission accepted absent/file ancestors before '..'; relative link resolution test failed.
function checkLinks(entries: readonly SourceEntry[]): void {
  const namespace = new Map<string, SourceEntry>();
  for (const entry of entries)
    namespace.set(
      entry.root === 'source'
        ? entry.path
        : entry.root === 'dependencies'
          ? `node_modules/${entry.path}`
          : `.git/${entry.path}`,
      entry,
    );
  for (const [name, entry] of namespace) {
    if (entry.kind !== 'symlink') continue;
    const pending = name.split('/');
    const resolved: string[] = [];
    let links = 0;
    while (pending.length > 0) {
      const segment = pending.shift();
      if (segment === undefined) fail();
      if (segment === '..') {
        if (resolved.length === 0) fail();
        resolved.pop();
        continue;
      }
      const prefix = [...resolved, segment].join('/');
      const child = namespace.get(prefix);
      if (child?.kind === 'symlink') {
        if (++links > 40) fail();
        pending.unshift(...child.target.split('/'));
        continue;
      }
      const root = prefix === 'node_modules' || prefix === '.git';
      if (child === undefined && !root) fail();
      if (pending.length > 0 && !root && child?.kind !== 'directory') fail();
      resolved.push(segment);
    }
  }
}
/** Requires canonical compact JSON bytes, fixed slots and exact sorted bounded membership. */
export function decodeSourceStartupManifest(
  contents: string,
  pins: SourceDevPins,
): SourceStartupManifest {
  pins = decodeSourceDevPins(pins);
  // Proof: digest and 64MiB limit removed independently; canonical manifest and valid oversized document tests failed.
  if (Buffer.byteLength(contents) > MAX_MANIFEST || hashContents(contents) !== pins.manifestSha256)
    fail();
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    fail();
  }
  const manifest = readFields(parsed, [
    'format',
    'version',
    'profile',
    'sourceSha',
    'entries',
    'configuration',
  ]);
  if (
    manifest['format'] !== 'wbs-source-startup' ||
    manifest['version'] !== 1 ||
    manifest['profile'] !== 'wbs-source-cold-v1' ||
    manifest['sourceSha'] !== pins.sourceSha
  )
    fail();
  const decoded: SourceStartupManifest = {
    format: 'wbs-source-startup',
    version: 1,
    profile: 'wbs-source-cold-v1',
    sourceSha: readSourceSha(manifest['sourceSha']),
    entries: decodeEntries(manifest['entries']),
    configuration: decodeConfigurationPins(manifest['configuration']),
  };
  checkLinks(decoded.entries);
  if (JSON.stringify(decoded) + '\n' !== contents) fail();
  return decoded;
}
interface Identity {
  dev: number;
  ino: number;
  mode: number;
  size: number;
  nlink: number;
  mtimeMs: number;
  ctimeMs: number;
}
function assertSame(left: unknown, right: unknown): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail();
}
function identifyFile(stats: Identity): Identity {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    size: stats.size,
    nlink: stats.nlink,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  };
}
interface HeldDirectory {
  path: string;
  descriptor: FileHandle;
  identity: Identity;
  names: string[];
}
// Proof: deadline validation omitted admitted invalid/expired total deadlines; whole observation deadline test failed.
export function assertSourceDeadline(deadline: number): void {
  if (
    !Number.isFinite(deadline) ||
    deadline <= performance.now() ||
    deadline - performance.now() > 600000
  )
    fail();
}
async function captureAncestors(root: string): Promise<Map<string, Identity>> {
  const captured = new Map<string, Identity>();
  for (let path = resolve(root); ; path = dirname(path)) {
    const stats = await lstat(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) fail();
    captured.set(path, identifyFile(stats));
    if (dirname(path) === path) break;
  }
  return captured;
}
async function assertAncestors(captured: Map<string, Identity>): Promise<void> {
  for (const [path, identity] of captured) {
    const stats = await lstat(path);
    if (stats.dev !== identity.dev || stats.ino !== identity.ino || stats.mode !== identity.mode)
      fail();
  }
}
async function readRegular(
  path: string,
  deadline: number,
  maximum: number,
  privateConfig = false,
  capture = false,
): Promise<{ sha256: string; size: number; contents?: string; blob: string }> {
  assertSourceDeadline(deadline);
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await descriptor.stat();
    const mode = before.mode & 0o7777;
    if (
      !before.isFile() ||
      // Proof: nlink guard omitted admitted a hardlinked normal0444 Git object; readonly Git alias test failed.
      before.nlink !== 1 ||
      before.size > maximum ||
      // Proof: private mode check omitted admitted0444 config; private config mode test failed.
      !(privateConfig ? mode === 0o600 : [0o444, 0o600, 0o644, 0o700, 0o755].includes(mode)) ||
      (mode & 0o400) === 0
    )
      fail();
    const sha = createHash('sha256');
    const blob = createHash('sha1').update(`blob ${String(before.size)}\0`);
    const chunks: Buffer[] = [];
    let size = 0;
    const buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, before.size)));
    for (;;) {
      assertSourceDeadline(deadline);
      const read = await descriptor.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
      if (size > maximum || size > before.size) fail();
      const chunk = buffer.subarray(0, read.bytesRead);
      // Proof: hashing omitted only for ordinary files admitted a same-size module change; unchanged HEAD test failed.
      sha.update(chunk);
      blob.update(chunk);
      if (privateConfig || capture) chunks.push(Buffer.from(chunk));
    }
    assertSame(identifyFile(before), identifyFile(await descriptor.stat()));
    assertSame(identifyFile(before), identifyFile(await lstat(path)));
    if (size !== before.size) fail();
    return {
      sha256: sha.digest('hex'),
      size,
      blob: blob.digest('hex'),
      ...(privateConfig || capture
        ? {
            // Proof: lossy UTF8 decoding admitted malformed private bytes; malformed private UTF8 test failed.
            contents: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
          }
        : {}),
    };
  } finally {
    await descriptor.close();
  }
}
// Proof: dotenv validation omitted admitted five independently hash-matching malformed/control configs; private dotenv tests failed.
function assertDotenv(contents: string, slot: SourceConfigSlot): void {
  if (contents.includes('\0') || contents.startsWith('\ufeff')) fail();
  const names = new Set<string>();
  let migration = false;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const match = /^(?:export )?([A-Za-z_][A-Za-z0-9_]*)=([^\r\n]*)$/.exec(line);
    if (match === null) fail();
    const name = match.at(1);
    const value = match.at(2);
    if (
      name === undefined ||
      value === undefined ||
      names.has(name) ||
      FORBIDDEN.has(name) ||
      /^(NX_|BUN_|npm_config_|NPM_CONFIG_)/.test(name) ||
      [
        'PATH',
        'HOME',
        'XDG_CONFIG_HOME',
        'SHELL',
        'TMPDIR',
        'TMP',
        'TEMP',
        'NODE_ENV',
        'WBS_PUBLIC_DEV',
      ].includes(name) ||
      value.endsWith('\\') ||
      ((value.startsWith('"') || value.startsWith("'")) && value.at(-1) !== value[0])
    )
      fail();
    names.add(name);
    if (name === 'MIGRATE_ON_STARTUP') {
      if (value !== 'false') fail();
      migration = true;
    }
  }
  if (slot === 'backend' && !migration) fail();
}
/** Captures only exact pinned private role controls before activation; original tree monitors separately preserve every file identity throughout restoration. */
export async function captureSourceRestorationConfiguration(
  root: string,
  manifest: SourceStartupManifest,
  inherited: readonly string[],
  deadline: number,
): Promise<SourceRestorationConfiguration> {
  try {
    const ancestry = await captureAncestors(root);
    const files = { backend: '', gateway: '', mcp: '', frontend: '' };
    for (const [index, slot] of SLOTS.entries()) {
      const path = CONFIGS.at(index);
      const pin = manifest.configuration.find((candidate) => candidate.slot === slot);
      if (path === undefined || pin === undefined) fail();
      const observed = await readRegular(join(root, path), deadline, MAX_CONFIG, true, true);
      // Proof: omitting original size/hash checks admitted a credential-only private config change; actual pinned-file test failed with Missing expected rejection.
      if (
        observed.sha256 !== pin.sha256 ||
        observed.size !== pin.size ||
        observed.contents === undefined
      )
        fail();
      files[slot] = observed.contents;
    }
    await assertAncestors(ancestry);
    return decodeSourceRestorationConfiguration(files, inherited);
  } catch {
    throw new Error('source pinned restoration configuration refused');
  }
}
/** Validates fixed effective container controls privately, including ordered environment identity. */
// Proof: ordered-env hash and forbidden-name checks omitted separately; effective environment test failed.
export function assertSourceEnvironment(
  value: unknown,
  imageValue: unknown,
  expected: string,
): void {
  if (
    !Array.isArray(value) ||
    !Array.isArray(imageValue) ||
    hashContents(JSON.stringify(value)) !== expected
  )
    fail();
  const defaults = new Map<string, string>();
  for (const assignment of imageValue) {
    const encoded = readText(assignment);
    const split = encoded.indexOf('=');
    if (split < 1) fail();
    const name = encoded.slice(0, split);
    if (defaults.has(name)) fail();
    defaults.set(name, encoded.slice(split + 1));
  }
  const environment = new Map<string, string>();
  for (const assignment of value) {
    const encoded = readText(assignment);
    const split = encoded.indexOf('=');
    if (split < 1) fail();
    const name = encoded.slice(0, split);
    const assigned = encoded.slice(split + 1);
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      environment.has(name) ||
      FORBIDDEN.has(name) ||
      name === 'XDG_CONFIG_HOME' ||
      /^(npm_config_|NPM_CONFIG_)/.test(name) ||
      ((name.startsWith('NX_') || name.startsWith('BUN_')) &&
        !Object.hasOwn(PROFILE, name) &&
        !(name === 'BUN_VERSION' && assigned === defaults.get(name)))
    )
      fail();
    if (name === 'HOME' && (!isAbsolute(assigned) || assigned !== defaults.get(name))) fail();
    environment.set(name, assigned);
  }
  // Actual pinned Nx module/subprocess tests exercise these exact cache and false-flag spellings.
  for (const [name, expectedValue] of Object.entries(PROFILE))
    if (environment.get(name) !== expectedValue) fail();
}
async function scanTree(
  root: string,
  deadline: number,
  configuration: readonly SourceConfigPin[] | null,
  runningOpenapiSha256?: string,
): Promise<{
  entries: SourceEntry[];
  blobs: Map<string, string>;
  identities: Map<string, Identity>;
  outputParents: ReadonlySet<string>;
}> {
  assertSourceDeadline(deadline);
  const ancestry = await captureAncestors(root);
  const held: HeldDirectory[] = [];
  const leaves: { path: string; identity: Identity }[] = [];
  const entries: SourceEntry[] = [];
  const blobs = new Map<string, string>();
  const identities = new Map<string, Identity>();
  let total = 0;
  let generatedEntries = 0;
  const outputParents = new Set<string>();
  const outputs = new Set<string>();
  async function inspectOutput(path: string, relative: string): Promise<void> {
    assertSourceDeadline(deadline);
    readPath(relative);
    if (++generatedEntries > MAX_ENTRIES) fail();
    const before = await lstat(path);
    // Proof: accepting a regular .nx root admitted the derived-root-file negative before this directory contract.
    if (
      RUNNING_OUTPUTS.includes(relative) &&
      relative !== 'apps/wbs/mcp-01/src/openapi.json' &&
      !before.isDirectory()
    )
      fail();
    if (before.isFile()) {
      const observed = await readRegular(path, deadline, MAX_FILE);
      total += observed.size;
      if (total > MAX_TOTAL) fail();
      leaves.push({ path, identity: identifyFile(before) });
      if (
        relative === 'apps/wbs/mcp-01/src/openapi.json' &&
        observed.sha256 !== runningOpenapiSha256
      )
        fail();
    } else if (before.isDirectory() && relative !== 'apps/wbs/mcp-01/src/openapi.json') {
      const descriptor = await open(
        path,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      let registered = false;
      try {
        const opened = await descriptor.stat();
        assertSame(identifyFile(before), identifyFile(opened));
        if (![0o700, 0o755].includes(opened.mode & 0o7777)) fail();
        const names = (await readdir(`/proc/self/fd/${String(descriptor.fd)}`)).sort(
          (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)),
        );
        held.push({ path, descriptor, identity: identifyFile(opened), names });
        registered = true;
        for (const name of names)
          await inspectOutput(
            `/proc/self/fd/${String(descriptor.fd)}/${name}`,
            `${relative}/${name}`,
          );
      } finally {
        if (!registered) await descriptor.close();
      }
    } else fail();
  }
  async function walk(path: string, kind: SourceRoot, prefix: string): Promise<void> {
    assertSourceDeadline(deadline);
    await assertAncestors(ancestry);
    const descriptor = await open(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    let registered = false;
    try {
      const stats = await descriptor.stat();
      identities.set(`${kind}/${prefix}`, identifyFile(stats));
      if (!stats.isDirectory() || ![0o700, 0o755].includes(stats.mode & 0o7777)) fail();
      const names = (await readdir(`/proc/self/fd/${String(descriptor.fd)}`)).sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      );
      held.push({ path, descriptor, identity: identifyFile(stats), names });
      registered = true;
      for (const name of names) {
        assertSourceDeadline(deadline);
        const relative = prefix ? `${prefix}/${name}` : name;
        readPath(relative);
        const child = `/proc/self/fd/${String(descriptor.fd)}/${name}`;
        if (kind === 'source' && ['node_modules', '.git'].includes(relative)) continue;
        if (kind === 'source' && CONFIGS.includes(relative)) {
          if (configuration === null) fail();
          continue;
        }
        const sourcePath =
          kind === 'dependencies'
            ? `node_modules/${relative}`
            : kind === 'git'
              ? `.git/${relative}`
              : relative;
        if (runningOpenapiSha256 !== undefined && RUNNING_OUTPUTS.includes(sourcePath)) {
          await inspectOutput(child, sourcePath);
          outputs.add(sourcePath);
          outputParents.add(`${kind}/${prefix}`);
          continue;
        }
        if (isReserved(kind, relative)) fail();
        const before = await lstat(child);
        identities.set(`${kind}/${relative}`, identifyFile(before));
        if (!before.isDirectory()) leaves.push({ path: child, identity: identifyFile(before) });
        const base = { root: kind, path: relative };
        if (before.isDirectory()) {
          entries.push({ ...base, kind: 'directory', mode: before.mode & 0o7777 });
          await walk(child, kind, relative);
        } else if (before.isFile()) {
          const observed = await readRegular(child, deadline, MAX_FILE);
          assertSame(identifyFile(before), identifyFile(await lstat(child)));
          total += observed.size;
          // Proof: declared-byte guard omitted admitted 33 legal 512MiB files; manifest limits test failed.
          if (total > MAX_TOTAL) fail();
          entries.push({
            ...base,
            kind: 'file',
            mode: before.mode & 0o7777,
            size: observed.size,
            sha256: observed.sha256,
          });
          if (kind === 'source') blobs.set(relative, observed.blob);
        } else if (before.isSymbolicLink()) {
          const target = await readlink(child);
          assertSame(identifyFile(before), identifyFile(await lstat(child)));
          entries.push({ ...base, kind: 'symlink', target });
          if (kind === 'source')
            blobs.set(
              relative,
              createHash('sha1')
                .update(`blob ${String(Buffer.byteLength(target))}\0${target}`)
                .digest('hex'),
            );
        } else fail();
        if (entries.length > MAX_ENTRIES) fail();
        await assertAncestors(ancestry);
        assertSame(identifyFile(stats), identifyFile(await descriptor.stat()));
      }
    } finally {
      if (!registered) await descriptor.close();
    }
  }
  try {
    for (const kind of ROOTS)
      await walk(
        kind === 'source' ? root : join(root, kind === 'dependencies' ? 'node_modules' : '.git'),
        kind,
        '',
      );
    if (configuration !== null) {
      for (let index = 0; index < CONFIGS.length; index++) {
        const path = CONFIGS.at(index);
        const pin = configuration.at(index);
        const slot = SLOTS.at(index);
        if (path === undefined || pin === undefined || slot === undefined) fail();
        const observed = await readRegular(join(root, path), deadline, MAX_CONFIG, true);
        identities.set(`config/${slot}`, identifyFile(await lstat(join(root, path))));
        if (
          observed.size !== pin.size ||
          observed.sha256 !== pin.sha256 ||
          observed.contents === undefined ||
          observed.size === 0
        )
          fail();
        assertDotenv(observed.contents, slot);
      }
    }
    for (const directory of held) {
      assertSourceDeadline(deadline);
      assertSame(directory.identity, identifyFile(await directory.descriptor.stat()));
      assertSame(directory.identity, identifyFile(await lstat(directory.path)));
      assertSame(
        directory.names,
        (await readdir(`/proc/self/fd/${String(directory.descriptor.fd)}`)).sort((left, right) =>
          Buffer.compare(Buffer.from(left), Buffer.from(right)),
        ),
      );
    }
    for (const leaf of leaves) assertSame(leaf.identity, identifyFile(await lstat(leaf.path)));
    await assertAncestors(ancestry);
    entries.sort(
      (left, right) =>
        ROOTS.indexOf(left.root) - ROOTS.indexOf(right.root) ||
        Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
    );
    const decoded = decodeEntries(entries);
    checkLinks(decoded);
    if (runningOpenapiSha256 !== undefined && !outputs.has('apps/wbs/mcp-01/src/openapi.json'))
      fail();
    return { entries: decoded, blobs, identities, outputParents };
  } catch {
    return fail();
  } finally {
    for (const directory of held.reverse()) await directory.descriptor.close();
  }
}
async function readJson(
  root: string,
  path: string,
  deadline: number,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    const read = await readRegular(join(root, path), deadline, MAX_CONFIG, false, true);
    if (read.contents === undefined) fail();
    parsed = JSON.parse(read.contents);
  } catch {
    fail();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) fail();
  return parsed as Record<string, unknown>; /* JSON object boundary checked above. */
}
// Proof: profile calls omitted admitted five committed incompatible launcher configurations; frozen startup profile tests failed.
async function assertLaunchProfile(root: string, deadline: number): Promise<void> {
  const packageJson = await readJson(root, 'package.json', deadline);
  const scripts = packageJson['scripts'];
  if (
    typeof scripts !== 'object' ||
    scripts === null ||
    !('dev' in scripts) ||
    scripts.dev !== 'bin/dev.sh' ||
    'predev' in scripts ||
    'postdev' in scripts
  )
    fail();
  const nx = await readJson(root, 'nx.json', deadline);
  assertSame(nx['plugins'], []);
  if (
    nx['useInferencePlugins'] !== false ||
    ['extends', 'tasksRunnerOptions', 'nxCloudId', 'nxCloudAccessToken'].some((key) =>
      Object.hasOwn(nx, key),
    )
  )
    fail();
  for (const tier of TIERS) {
    const project = await readJson(root, `apps/wbs/${tier}/project.json`, deadline);
    const targets = project['targets'];
    if (typeof targets !== 'object' || targets === null || !('serve' in targets)) fail();
    const expected = {
      executor: 'nx:run-commands',
      continuous: true,
      options: {
        command: tier === 'fe-01' ? 'bunx vite' : 'bun --watch src/main.ts',
        cwd: `apps/wbs/${tier}`,
      },
      cache: false,
      ...(tier === 'mcp-01' ? { dependsOn: ['prepare'] } : {}),
    };
    const serve = targets.serve;
    if (typeof serve !== 'object' || serve === null) fail();
    const decoded = readFields(serve, Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) assertSame(decoded[key], value);
    if (tier === 'mcp-01') {
      if (!('prepare' in targets)) fail();
      const prepare = readFields(targets.prepare, ['executor', 'options', 'outputs', 'cache']);
      assertSame(prepare['executor'], 'nx:run-commands');
      assertSame(prepare['options'], {
        command:
          'bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts apps/wbs/mcp-01/src/openapi.json',
      });
      assertSame(prepare['outputs'], ['{projectRoot}/src/openapi.json']);
      assertSame(prepare['cache'], false);
    }
  }
}
/** Retains private descriptor-derived identities for fresh rechecks; this grants no writer admission. */
export async function captureSourceStartupTree(
  root: string,
  manifest: SourceStartupManifest,
  deadline: number,
): Promise<() => Promise<void>> {
  assertSourceDeadline(deadline);
  try {
    const parents = await captureAncestors(root);
    const initial = await scanTree(root, deadline, manifest.configuration);
    // Proof: both expected-membership comparisons omitted admitted shadow.js; extra cold input test failed.
    assertSame(initial.entries, manifest.entries);
    await assertLaunchProfile(root, deadline);
    async function recheck(): Promise<void> {
      try {
        await assertAncestors(parents);
        const current = await scanTree(root, deadline, manifest.configuration);
        assertSame(current.entries, manifest.entries);
        // Proof: identity comparison omitted admitted a byte-identical parent swap; captured parent identity test failed.
        assertSame([...initial.identities], [...current.identities]);
        await assertAncestors(parents);
      } catch {
        return fail();
      }
    }
    await recheck();
    return recheck;
  } catch {
    return fail();
  }
}
/** Captures original cold identities once, then validates the fixed generated-output transition without retaining any exclusion token. */
export async function captureSourceRestartTree(
  root: string,
  manifest: SourceStartupManifest,
  deadline: number,
  generatedOpenapiSha256: string,
): Promise<{ inspectCold(): Promise<void>; inspectRunning(): Promise<void> }> {
  readDigest(generatedOpenapiSha256);
  const parents = await captureAncestors(root);
  const initial = await scanTree(root, deadline, manifest.configuration);
  assertSame(initial.entries, manifest.entries);
  await assertLaunchProfile(root, deadline);
  async function inspect(running: boolean): Promise<void> {
    try {
      await assertAncestors(parents);
      const current = await scanTree(
        root,
        deadline,
        manifest.configuration,
        running ? generatedOpenapiSha256 : undefined,
      );
      assertSame(current.entries, manifest.entries);
      assertSame([...initial.identities.keys()], [...current.identities.keys()]);
      for (const [path, original] of initial.identities) {
        const observed = current.identities.get(path);
        if (observed === undefined) fail();
        if (running && current.outputParents.has(path)) {
          assertSame(
            { dev: original.dev, ino: original.ino, mode: original.mode },
            { dev: observed.dev, ino: observed.ino, mode: observed.mode },
          );
        } else assertSame(original, observed);
      }
      await assertAncestors(parents);
      assertSourceDeadline(deadline);
    } catch {
      return fail();
    }
  }
  await inspect(false);
  return { inspectCold: () => inspect(false), inspectRunning: () => inspect(true) };
}
/** Fresh bounded exact-tree verification, including private config; errors contain no file bytes. */
export async function verifySourceStartupTree(
  root: string,
  manifest: SourceStartupManifest,
  deadline: number,
): Promise<void> {
  await captureSourceStartupTree(root, manifest, deadline);
}
/** All Git preparation reads share the constructor deadline; abort joins child exit and both pipes. */
async function readGit(root: string, args: string[], deadline: number): Promise<string> {
  assertSourceDeadline(deadline);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, deadline - performance.now());
  try {
    const child = Bun.spawn(
      [
        'git',
        '--no-optional-locks',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.hooksPath=/dev/null',
        '-C',
        root,
        ...args,
      ],
      {
        signal: controller.signal,
        killSignal: 'SIGKILL',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PATH: process.env['PATH'],
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_NO_REPLACE_OBJECTS: '1',
        },
      },
    );
    // Proof: deadline omission left actual Git blocked on FIFO config beyond the caller budget; the fixture observed late and killed/reaped its recorded child.
    const [stdout, stderr, exit] = await Promise.allSettled([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled' ||
      exit.status !== 'fulfilled'
    )
      fail();
    if (controller.signal.aborted || exit.value !== 0) fail();
    assertSourceDeadline(deadline);
    return stdout.value;
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Captures an independently prepared clean standalone clone. Never installs, cleans or adopts.
 * Expected private config hashes come from separate review; no installed config values are read.
 */
export async function createSourceStartupManifest(
  preparedRoot: string,
  sha: string,
  configuration: readonly SourceConfigPin[],
): Promise<{ manifest: SourceStartupManifest; contents: string; sha256: string }> {
  readSourceSha(sha);
  const pins = decodeConfigurationPins(configuration);
  if (!isAbsolute(preparedRoot)) fail();
  // Proof: self/alias checks omitted admitted the disposable installed tree; isolated constructor fixture failed.
  const installed = resolve(envLayout('dev').root, 'src');
  if (resolve(preparedRoot) === installed || resolve(preparedRoot).startsWith(`${installed}/`))
    fail();
  const root = await realpath(preparedRoot);
  if (root === installed || root.startsWith(`${installed}/`)) fail();
  try {
    const canonicalInstalled = await realpath(installed);
    const installedIdentity = await lstat(canonicalInstalled);
    for (const [path, identity] of await captureAncestors(root)) {
      if (
        path === canonicalInstalled ||
        (identity.dev === installedIdentity.dev && identity.ino === installedIdentity.ino)
      )
        fail();
    }
  } catch (failure) {
    if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT'))
      return fail();
  }
  const deadline = performance.now() + 600000;
  const readPreparedGit = (args: string[]) => readGit(root, args, deadline);
  const gitDirectory = await lstat(join(root, '.git'));
  if (!gitDirectory.isDirectory() || gitDirectory.isSymbolicLink()) fail();
  const localConfig = await readPreparedGit([
    'config',
    '--local',
    '--no-includes',
    '--name-only',
    '--list',
  ]);
  if (
    localConfig
      .split('\n')
      .some((name) =>
        /^(include|includeif|extensions|filter)\.|^core\.(worktree|fsmonitor|hooks[Pp]ath)$/i.test(
          name,
        ),
      )
  )
    fail();
  if ((await readPreparedGit(['rev-parse', '--git-common-dir'])).trim() !== '.git') fail();
  // Proof: full-clone check omitted admitted a shallow marker; shallow Git metadata test failed.
  if ((await readPreparedGit(['rev-parse', '--is-shallow-repository'])).trim() !== 'false') fail();
  if (
    (await readPreparedGit(['rev-parse', 'HEAD'])).trim() !== sha ||
    (await readPreparedGit(['status', '--porcelain', '--untracked-files=no'])).trim() !== ''
  )
    fail();
  const roster = await readPreparedGit(['ls-tree', '-rz', '--full-tree', sha]);
  const tracked = new Map<string, string>();
  for (const line of roster.split('\0')) {
    if (line === '') continue;
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if (match === null) fail();
    const blob = match.at(2);
    const path = match.at(3);
    if (blob === undefined || path === undefined) fail();
    tracked.set(path, blob);
  }
  await assertLaunchProfile(root, deadline);
  const observed = await scanTree(root, deadline, null);
  // Proof: no-replace interpretation omitted admitted replacement commit bytes; Git replacement test failed.
  assertSame([...observed.blobs].sort(), [...tracked].sort());
  const ancestors = new Set<string>();
  for (const path of tracked.keys()) {
    for (let parent = posix.dirname(path); parent !== '.'; parent = posix.dirname(parent))
      ancestors.add(parent);
  }
  if (
    observed.entries.some(
      (entry) =>
        entry.root === 'source' && entry.kind === 'directory' && !ancestors.has(entry.path),
    )
  )
    fail();
  const manifest: SourceStartupManifest = {
    format: 'wbs-source-startup',
    version: 1,
    profile: 'wbs-source-cold-v1',
    sourceSha: sha,
    entries: observed.entries,
    configuration: pins,
  };
  const contents = JSON.stringify(manifest) + '\n';
  if (Buffer.byteLength(contents) > MAX_MANIFEST) fail();
  return { manifest, contents, sha256: hashContents(contents) };
}
