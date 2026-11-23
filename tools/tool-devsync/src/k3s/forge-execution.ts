import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readlinkSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import { release, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareCompilerMetadata, orderCompilerMetadata } from './forge-compiler-metadata';
import { readNativeMapping } from './forge-native-map';
import type { ForgeSupervisorContext } from './forge-supervisor-core';

const compile = Bun.build.bind(Bun);
const resolveModule = Bun.resolveSync.bind(Bun);
const NativeTranspiler = Bun.Transpiler;
const FILE_LIMIT = 128 * 1024 * 1024;
const GRAPH_LIMIT = 32 * 1024 * 1024;
const PACKAGE_LIMIT = 128 * 1024 * 1024;
const CORE = 'tools/tool-devsync/src/k3s/forge-supervisor-core.ts';
const BOOTSTRAP = [
  'tools/tool-devsync/src/k3s/forge-supervisor.ts',
  'tools/tool-devsync/src/k3s/forge-execution.ts',
] as const;
const PACKAGE_PROFILES = new Map([
  ['arktype', '2.2.3'],
  ['arkregex', '0.0.8'],
  ['@ark/schema', '0.56.2'],
  ['@ark/util', '0.56.2'],
]);
const BUILTINS = new Set([
  ...builtinModules.flatMap((name) => {
    const bare = name.replace(/^node:/, '');
    return [bare, 'node:' + bare];
  }),
  'bun',
  'bun:ffi',
  'bun:sqlite',
  'bun:wrap',
]);

/** Each Bun metafile retains the actual compiler cwd that gives its relative keys meaning. */
interface CompilerGraph {
  readonly compilerDirectory: string;
  readonly metadata: Bun.BuildMetafile;
}
interface Compilation extends CompilerGraph {
  readonly bytes: Buffer;
}
interface FileObservation {
  readonly path: string;
  readonly size: number;
  readonly mode: string;
  readonly device: string;
  readonly inode: string;
  readonly modified: string;
  readonly changed: string;
  readonly sha256: string;
}
type ConfigurationObservation =
  | { readonly path: string; readonly kind: 'absent' }
  | { readonly path: string; readonly kind: 'file'; readonly file: FileObservation };
interface PackageObservation {
  readonly directory: string;
  readonly signature: string;
}
const hashBytes = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isInside(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix);
}
function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}
/** Hold one nofollow regular descriptor through a bounded read and retain release failure with its primary. */
function readObservedFile(
  path: string,
  limit = FILE_LIMIT,
): { readonly file: FileObservation; readonly bytes: Buffer } {
  const canonical = realpathSync.native(path);
  if (canonical !== path)
    throw new Error('Forge required execution file is not canonical: ' + path);
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let observation: FileObservation | undefined;
  let captured: Buffer | undefined;
  let primary: { readonly cause: unknown } | undefined;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > BigInt(limit))
      throw new Error('Forge required execution file exceeds regular-file bound: ' + path);
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      size += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    if (
      size > limit ||
      BigInt(size) !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      named.dev !== before.dev ||
      named.ino !== before.ino ||
      named.mode !== before.mode
    )
      throw new Error('Forge required execution file changed while observed: ' + path);
    captured = Buffer.concat(chunks);
    observation = {
      path,
      size,
      mode: String(before.mode),
      device: String(before.dev),
      inode: String(before.ino),
      modified: String(before.mtimeNs),
      changed: String(before.ctimeNs),
      sha256: hashBytes(captured),
    };
  } catch (cause: unknown) {
    primary = { cause };
  }
  let releaseFailure: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    releaseFailure = { cause };
  }
  if (releaseFailure !== undefined) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, releaseFailure.cause],
        'Forge execution read and release failed',
        { cause: primary.cause },
      );
    throw releaseFailure.cause;
  }
  if (primary !== undefined) throw primary.cause;
  if (observation === undefined || captured === undefined)
    throw new Error('Forge execution read produced no observation');
  return { file: observation, bytes: captured };
}
function observeFile(path: string, limit = FILE_LIMIT): FileObservation {
  return readObservedFile(path, limit).file;
}
function readConfiguration(path: string): ConfigurationObservation {
  try {
    lstatSync(path);
  } catch (cause: unknown) {
    if (isAbsent(cause)) return { path, kind: 'absent' };
    throw cause;
  }
  return { path, kind: 'file', file: observeFile(path, 2 * 1024 * 1024) };
}
function captureConfigurations(
  root: string,
  inputs: readonly string[],
): ConfigurationObservation[] {
  const names = new Set<string>([join(root, 'tsconfig.base.json'), join(root, 'bun.lock')]);
  for (const path of inputs) {
    let directory = dirname(path);
    while (isInside(root, directory)) {
      for (const name of ['tsconfig.json', 'package.json', 'bunfig.toml', '.bunfig.toml'])
        names.add(join(directory, name));
      if (directory === root) break;
      directory = dirname(directory);
    }
  }
  const compilerConfigurations = new Set(
    [...names].filter((path) => /(?:^|\/)tsconfig(?:\.[^/]*)?\.json$/.test(path)),
  );
  const pending = [...names];
  for (let at = 0; at < pending.length; at++) {
    const path = pending.at(at);
    if (path === undefined || pending.length > 4096)
      throw new Error('Forge resolver configuration exceeds bound');
    const configuration = readConfiguration(path);
    if (configuration.kind === 'absent' || !compilerConfigurations.has(path)) continue;
    const current = readObservedFile(path, 2 * 1024 * 1024);
    if (JSON.stringify(current.file) !== JSON.stringify(configuration.file))
      throw new Error('Forge compiler configuration changed during decoding');
    const decoded: unknown = JSON.parse(current.bytes.toString('utf8'));
    if (!isRecord(decoded)) throw new Error('Forge compiler configuration is not an object');
    const inherited = decoded['extends'];
    if (inherited === undefined) continue;
    const parents: unknown[] = Array.isArray(inherited) ? inherited : [inherited];
    for (const parent of parents) {
      if (typeof parent !== 'string' || !parent.startsWith('.') || !parent.endsWith('.json'))
        throw new Error('Forge compiler configuration has an unsupported required extends edge');
      const resolved = resolve(dirname(path), parent);
      if (!isInside(root, resolved))
        throw new Error('Forge compiler configuration escapes its retained source');
      compilerConfigurations.add(resolved);
      if (!names.has(resolved)) {
        names.add(resolved);
        pending.push(resolved);
      }
    }
  }
  const configurations = [...names].sort().map(readConfiguration);
  for (const name of ['tsconfig.base.json', 'package.json', 'bun.lock']) {
    const required = configurations.find(
      (configuration) => configuration.path === join(root, name),
    );
    if (required?.kind !== 'file')
      throw new Error('Forge required source/compiler metadata is absent: ' + name);
  }
  if (
    configurations.some(
      (configuration) =>
        configuration.kind === 'file' &&
        /(?:^|\/)(?:\.bunfig|bunfig)\.toml$/.test(configuration.path),
    )
  )
    throw new Error(
      'Forge current protected compiler profile refuses a discovered Bun configuration',
    );
  return configurations;
}
/** Capture complete selected package data roots, not the entire node_modules installation. Symlinks are explicit retained edges inside that installation. */
function observePackage(directory: string, modules: string): PackageObservation {
  const rows: unknown[] = [];
  let bytes = 0,
    count = 0;
  const active = new Set<string>();
  function visit(path: string): void {
    if (++count > 50000) throw new Error('Forge required package data exceeds member bound');
    const status = lstatSync(path, { bigint: true });
    if (status.isSymbolicLink()) {
      const target = readlinkSync(path),
        selected = realpathSync.native(path);
      if (!isInside(modules, selected))
        throw new Error('Forge required package data link escapes its installation');
      rows.push([
        path,
        'link',
        target,
        String(status.dev),
        String(status.ino),
        String(status.mtimeNs),
        String(status.ctimeNs),
      ]);
      if (active.has(selected)) throw new Error('Forge required package data has a link cycle');
      visit(selected);
      return;
    }
    if (status.isDirectory()) {
      const selected = realpathSync.native(path);
      if (active.has(selected)) throw new Error('Forge required package data directory cycles');
      active.add(selected);
      const entries = readdirSync(path).sort();
      rows.push([
        path,
        'directory',
        String(status.mode),
        String(status.dev),
        String(status.ino),
        entries,
      ]);
      for (const entry of entries) visit(join(path, entry));
      active.delete(selected);
      return;
    }
    const file = observeFile(path, 16 * 1024 * 1024);
    bytes += file.size;
    if (bytes > PACKAGE_LIMIT) throw new Error('Forge required package data exceeds byte bound');
    rows.push(file);
  }
  visit(directory);
  return { directory, signature: hashBytes(JSON.stringify(rows)) };
}
function capturePackages(root: string, paths: readonly string[]): PackageObservation[] {
  const modules = join(root, 'node_modules'),
    roots = new Set<string>();
  for (const path of paths) {
    if (!isInside(modules, path)) continue;
    let directory = dirname(path);
    while (directory !== modules && isInside(modules, directory)) {
      const metadata = join(directory, 'package.json');
      if (hasNamedPath(metadata)) {
        const captured = readObservedFile(metadata, 2 * 1024 * 1024);
        const decoded: unknown = JSON.parse(captured.bytes.toString('utf8'));
        if (
          !isRecord(decoded) ||
          typeof decoded['name'] !== 'string' ||
          !PACKAGE_PROFILES.has(decoded['name']) ||
          PACKAGE_PROFILES.get(decoded['name']) !== decoded['version']
        )
          throw new Error(
            'Forge required package data edge is not in the current execution profile: ' +
              directory,
          );
        roots.add(realpathSync.native(directory));
        break;
      }
      directory = dirname(directory);
    }
    if (directory === modules)
      throw new Error('Forge compiler input has no declared package data owner');
  }
  return [...roots].sort().map((directory) => observePackage(directory, modules));
}
function hasNamedPath(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (cause: unknown) {
    if (isAbsent(cause)) return false;
    throw cause;
  }
}
/** Linux Forge image profile: retain every actually mapped executable file, including the Bun runtime and any loaded native library. Anonymous JIT pages are derived from those captured inputs. */
function captureNativeFiles(): FileObservation[] {
  if (process.platform !== 'linux')
    throw new Error(
      'Forge current loaded-native profile requires Linux; another platform needs its own qualified adapter',
    );
  const maps = readVirtualText('/proc/self/maps', 4 * 1024 * 1024);
  const names = new Map<string, bigint>();
  for (const line of maps.trimEnd().split('\n')) {
    const { permissions, inode, encodedPath: encoded } = readNativeMapping(line);
    if (!permissions.includes('x') || encoded === undefined || encoded.startsWith('[')) continue;
    const path = encoded.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
    if (!path.startsWith('/') || path.endsWith(' (deleted)') || BigInt(inode) === 0n)
      throw new Error('Forge has an unsupported required executable mapping');
    names.set(path, BigInt(inode));
  }
  if (!names.has(realpathSync.native(process.execPath)))
    throw new Error('Forge native observation lacks the actual Bun executable');
  if (names.size === 0 || names.size > 512)
    throw new Error('Forge executable mapping roster exceeds bound');
  let bytes = 0;
  return [...names]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, inode]) => {
      const file = observeFile(path);
      if (BigInt(file.inode) !== inode)
        throw new Error('Forge mapped executable was replaced after loading');
      bytes += file.size;
      if (bytes > 512 * 1024 * 1024) throw new Error('Forge mapped executable bytes exceed bound');
      return file;
    });
}
function captureInputs(root: string, graph: CompilerGraph): FileObservation[] {
  const { metadata, compilerDirectory } = graph;
  const names = new Set<string>(BOOTSTRAP.map((path) => join(root, path)));
  for (const [name, input] of Object.entries(metadata.inputs)) {
    names.add(isAbsolute(name) ? name : resolve(compilerDirectory, name));
    for (const edge of input.imports) {
      if (edge.external === true) {
        if (!BUILTINS.has(edge.path))
          throw new Error('Forge has an unsupported required external module: ' + edge.path);
      } else if (edge.path === 'bun:wrap') {
        // Bun's synthetic CJS wrapper is part of the separately retained runtime binary.
      } else names.add(isAbsolute(edge.path) ? edge.path : resolve(compilerDirectory, edge.path));
    }
  }
  if (names.size === 0 || names.size > 4096)
    throw new Error('Forge compiler input roster exceeds bound');
  let bytes = 0;
  return [...names].sort().map((path) => {
    if (!isInside(root, path)) {
      const origins = Object.entries(metadata.inputs).flatMap(([name, input]) => [
        ...((isAbsolute(name) ? name : resolve(compilerDirectory, name)) === path
          ? [{ input: name }]
          : []),
        ...input.imports
          .filter(
            (edge) =>
              edge.external !== true &&
              edge.path !== 'bun:wrap' &&
              (isAbsolute(edge.path) ? edge.path : resolve(compilerDirectory, edge.path)) === path,
          )
          .map((edge) => ({
            importer: name,
            path: edge.path,
            original: edge.original,
            kind: edge.kind,
          })),
      ]);
      throw new Error(
        'Forge compiler input escapes its retained source: ' +
          JSON.stringify({
            root,
            path,
            compilerCwd: compilerDirectory,
            observedCwd: process.cwd(),
            origins,
          }),
      );
    }
    const file = observeFile(path, 16 * 1024 * 1024);
    bytes += file.size;
    if (bytes > GRAPH_LIMIT) throw new Error('Forge compiler inputs exceed byte bound');
    return file;
  });
}
/** Capture metadata coordinates before invoking Bun; configuration and input observations use resolved absolute paths. */
async function compileEntry(
  root: string,
  entry: string,
  requiredExport: string,
): Promise<Compilation> {
  const compilerDirectory = process.cwd();
  const built = await compile({
    entrypoints: [join(root, entry)],
    target: 'bun',
    packages: 'bundle',
    env: 'disable',
    metafile: true,
    root,
  });
  if (process.cwd() !== compilerDirectory)
    throw new Error('Forge compiler cwd changed during compilation');
  if (!built.success || built.logs.length !== 0)
    throw new AggregateError(
      built.logs,
      'Forge required core compilation did not settle without diagnostics',
    );
  const reported = built.metafile,
    emitted = built.outputs.at(0);
  if (
    reported === undefined ||
    built.outputs.length !== 1 ||
    emitted?.kind !== 'entry-point' ||
    Object.keys(reported.outputs).length !== 1
  )
    throw new Error('Forge producer requires one closed emitted core entry');
  const metadata = orderCompilerMetadata(reported);
  const output = Object.values(metadata.outputs).at(0);
  if (output?.imports.length !== 0 || !output.exports.includes(requiredExport))
    throw new Error(
      'Forge emitted core has unknown required chunk edges or lacks its owned export',
    );
  const bytes = Buffer.from(await emitted.text());
  if (bytes.length === 0 || bytes.length > GRAPH_LIMIT || bytes.length !== emitted.size)
    throw new Error('Forge emitted core exceeds bound');
  if (process.cwd() !== compilerDirectory)
    throw new Error('Forge compiler cwd changed during emitted-byte capture');
  return { compilerDirectory, metadata, bytes };
}
/**
 * Compile and bracket the actual selected core, then compose its mandatory inspection before any
 * native install/parent launch. Compiler/config/package/native observations are sequential under
 * the trusted stable publisher, not an atomic filesystem snapshot or sandbox against in-process
 * callers. The narrow SDK installation facade excludes compiler/plugin/loader APIs. Only the selected archive/package and target worktree are purpose-owned dynamic data edges; they keep their existing independent verification/restart owners. An opaque compiler package in the emitted graph refuses rather than being treated as a captured runtime API.
 * Unknown metadata/import/native edges throw; changed captured inputs require container reload.
 * A failed/unknown core retains its private emitted artifact for operator diagnosis.
 */
export async function runForgeExecution(
  source: string,
  worktree: string,
  context: ForgeSupervisorContext,
): Promise<number> {
  const root = realpathSync.native(source);
  if (root !== source) throw new Error('Forge execution source root is not canonical');
  if (
    root !== originRoot ||
    JSON.stringify(bootstrapIdentity) !== JSON.stringify(captureBootstrap(root))
  )
    throw new Error('Forge already-loaded bootstrap source identity changed');
  const ambient = captureAmbient();
  const first = await compileEntry(root, CORE, 'runForgeSupervisor');
  const firstBootstrap = await compileEntry(root, BOOTSTRAP[0], 'superviseForge');
  const combined = combineMetadata(first, firstBootstrap);
  const inputs = captureInputs(root, combined);
  const paths = inputs.map((file) => file.path);
  const configurations = captureConfigurations(root, paths),
    packages = capturePackages(root, paths);
  const second = await compileEntry(root, CORE, 'runForgeSupervisor');
  const secondBootstrap = await compileEntry(root, BOOTSTRAP[0], 'superviseForge');
  let disagreement: unknown;
  function hasObservationChanged(
    component: string,
    before: string,
    after: string,
    detail?: (before: string, after: string) => unknown,
  ): boolean {
    if (before === after) return false;
    disagreement = {
      component,
      comparisonText: { before: summarizeDiagnostic(before), after: summarizeDiagnostic(after) },
      ...(detail === undefined ? {} : { detail: detail(before, after) }),
    };
    return true;
  }
  function hasMetadataChanged(
    component: string,
    before: Bun.BuildMetafile,
    after: Bun.BuildMetafile,
  ): boolean {
    const comparison = compareCompilerMetadata(before, after);
    if (comparison.kind === 'same') return false;
    return hasObservationChanged(component, comparison.before, comparison.after, () =>
      readMetadataDifference(before, after),
    );
  }
  // Preserve the original left-to-right, short-circuit predicates. Descriptors inspect only
  // already-built bytes/metadata after a mismatch; no later required observation is evaluated.
  if (
    hasObservationChanged('ambient', ambient, captureAmbient()) ||
    hasObservationChanged(
      'bootstrap.sources',
      JSON.stringify(bootstrapIdentity),
      JSON.stringify(captureBootstrap(root)),
    ) ||
    hasObservationChanged(
      'core.compilerDirectory',
      first.compilerDirectory,
      second.compilerDirectory,
    ) ||
    hasObservationChanged(
      'bootstrap.compilerDirectory',
      firstBootstrap.compilerDirectory,
      secondBootstrap.compilerDirectory,
    ) ||
    hasObservationChanged(
      'bootstrap.bytes',
      hashBytes(firstBootstrap.bytes),
      hashBytes(secondBootstrap.bytes),
      (beforeHash, afterHash) => ({
        before: { sha256: beforeHash, bytes: firstBootstrap.bytes.byteLength },
        after: { sha256: afterHash, bytes: secondBootstrap.bytes.byteLength },
        firstByteDifference: readByteDifference(firstBootstrap.bytes, secondBootstrap.bytes),
        firstMetadataDifference: readMetadataDifference(
          firstBootstrap.metadata,
          secondBootstrap.metadata,
        ),
      }),
    ) ||
    hasMetadataChanged('bootstrap.metadata', firstBootstrap.metadata, secondBootstrap.metadata) ||
    hasObservationChanged(
      'core.bytes',
      hashBytes(first.bytes),
      hashBytes(second.bytes),
      (beforeHash, afterHash) => ({
        before: { sha256: beforeHash, bytes: first.bytes.byteLength },
        after: { sha256: afterHash, bytes: second.bytes.byteLength },
        firstByteDifference: readByteDifference(first.bytes, second.bytes),
        firstMetadataDifference: readMetadataDifference(first.metadata, second.metadata),
      }),
    ) ||
    hasMetadataChanged('core.metadata', first.metadata, second.metadata) ||
    hasObservationChanged(
      'inputs',
      JSON.stringify(inputs),
      JSON.stringify(captureInputs(root, combineMetadata(second, secondBootstrap))),
    ) ||
    hasObservationChanged(
      'configurations',
      JSON.stringify(configurations),
      JSON.stringify(captureConfigurations(root, paths)),
    ) ||
    hasObservationChanged(
      'packages',
      JSON.stringify(packages),
      JSON.stringify(capturePackages(root, paths)),
    )
  )
    throw new Error(
      'Forge source/compiler/config/package observation changed during production: ' +
        JSON.stringify(disagreement),
    );
  const directory = mkdtempSync(join(tmpdir(), 'puni-forge-execution-'));
  const artifact = join(directory, 'core.mjs');
  writeFileSync(artifact, second.bytes, { flag: 'wx', mode: 0o400 });
  const emitted = observeFile(artifact, GRAPH_LIMIT);
  writeFileSync(
    join(directory, 'execution-observation.json'),
    JSON.stringify(
      {
        format: 'puni-forge-source-observation',
        version: 1,
        sourceRoot: root,
        compilerDirectory: second.compilerDirectory,
        bootstrapCompilerDirectory: secondBootstrap.compilerDirectory,
        emitted,
        bootstrap: bootstrapIdentity,
        inputs,
        configurations,
        packages,
        coreMetadata: second.metadata,
        bootstrapMetadata: secondBootstrap.metadata,
        ambient,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o400 },
  );
  let returned: number;
  try {
    const namespace: unknown = await import(pathToFileURL(artifact).href);
    if (!isRecord(namespace) || typeof namespace['runForgeSupervisor'] !== 'function')
      throw new Error('Forge emitted core has no callable owned operation');
    const natives = captureNativeFiles();
    function inspect(): Promise<boolean> {
      const inspection = Promise.withResolvers<boolean>();
      try {
        // A newly required native mapping is unknown to the captured instance and cannot admit a successor.
        if (ambient !== captureAmbient())
          throw new Error('Forge required compiler/runtime environment changed');
        const currentNative = captureNativeFiles();
        if (
          JSON.stringify(natives.map((file) => file.path)) !==
          JSON.stringify(currentNative.map((file) => file.path))
        )
          throw new Error(
            'Forge required native execution edges changed; container reload required',
          );
        inspection.resolve(
          JSON.stringify(bootstrapIdentity) === JSON.stringify(captureBootstrap(root)) &&
            JSON.stringify(emitted) === JSON.stringify(observeFile(artifact, GRAPH_LIMIT)) &&
            JSON.stringify(inputs) ===
              JSON.stringify(paths.map((path) => observeFile(path, 16 * 1024 * 1024))) &&
            JSON.stringify(configurations) === JSON.stringify(captureConfigurations(root, paths)) &&
            JSON.stringify(packages) === JSON.stringify(capturePackages(root, paths)) &&
            JSON.stringify(natives) === JSON.stringify(currentNative),
        );
      } catch (cause: unknown) {
        inspection.reject(cause);
      }
      return inspection.promise;
    }
    if (!(await inspect()))
      throw new Error('Forge execution changed while loading its emitted core');
    const status: unknown = await Reflect.apply(namespace['runForgeSupervisor'], namespace, [
      worktree,
      context,
      { inspect },
    ]);
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 0 || status > 255)
      throw new Error('Forge emitted core returned an invalid controlled status');
    returned = status;
  } catch (cause: unknown) {
    throw new Error('Forge required execution failed; retained artifact directory ' + directory, {
      cause,
    });
  }
  // Only the owned core's settled return permits retirement; rejected/unknown native custody retains evidence.
  try {
    rmSync(directory, { recursive: true });
  } catch (cause: unknown) {
    throw new Error(
      'Forge controlled status ' +
        String(returned) +
        ' settled but artifact retirement failed: ' +
        directory,
      { cause },
    );
  }
  return returned;
}

/** Diagnostic summaries keep exact encoded lengths/hashes while bounding displayed content. */
function summarizeDiagnostic(value: unknown) {
  const stringify: (input: unknown) => string | undefined = JSON.stringify;
  const encoded = typeof value === 'string' ? value : stringify(value);
  if (encoded === undefined) return { kind: 'undefined' as const };
  return {
    kind: 'encoded' as const,
    bytes: Buffer.byteLength(encoded),
    sha256: hashBytes(encoded),
    preview: encoded.slice(0, 1536),
    truncated: encoded.length > 1536,
  };
}
/** Report one already-built byte disagreement; at most192 bytes of context are encoded. */
function readByteDifference(before: Uint8Array, after: Uint8Array) {
  let offset = 0;
  while (
    offset < before.byteLength &&
    offset < after.byteLength &&
    before[offset] === after[offset]
  )
    offset++;
  const start = Math.max(0, offset - 32);
  return {
    offset,
    beforeHex: Buffer.from(before.subarray(start, offset + 64)).toString('hex'),
    afterHex: Buffer.from(after.subarray(start, offset + 64)).toString('hex'),
  };
}
/** Distinguish metadata key order/membership from its first encoded entry-value difference. */
function readMetadataDifference(before: Bun.BuildMetafile, after: Bun.BuildMetafile): unknown {
  const beforeSections = Object.keys(before),
    afterSections = Object.keys(after);
  if (JSON.stringify(beforeSections) !== JSON.stringify(afterSections))
    return {
      kind: 'top-level-keys',
      before: summarizeDiagnostic(beforeSections),
      after: summarizeDiagnostic(afterSections),
    };
  for (const section of ['inputs', 'outputs'] as const) {
    const beforeEntries = before[section],
      afterEntries = after[section];
    const beforeKeys = Object.keys(beforeEntries),
      afterKeys = Object.keys(afterEntries);
    for (let index = 0; index < Math.max(beforeKeys.length, afterKeys.length); index++) {
      const beforeKey = beforeKeys.at(index),
        afterKey = afterKeys.at(index);
      if (beforeKey !== afterKey)
        return {
          kind: 'entry-key',
          section,
          index,
          beforeKey,
          afterKey,
          before: summarizeDiagnostic(
            beforeKey === undefined ? undefined : beforeEntries[beforeKey],
          ),
          after: summarizeDiagnostic(afterKey === undefined ? undefined : afterEntries[afterKey]),
        };
    }
    for (const key of beforeKeys)
      if (JSON.stringify(beforeEntries[key]) !== JSON.stringify(afterEntries[key]))
        return {
          kind: 'entry-value',
          section,
          key,
          before: summarizeDiagnostic(beforeEntries[key]),
          after: summarizeDiagnostic(afterEntries[key]),
        };
  }
  return { kind: 'no-per-entry-difference' };
}

/** Only graphs with the same observed metadata coordinate system may share key/edge comparisons. */
function combineMetadata(core: CompilerGraph, bootstrap: CompilerGraph): CompilerGraph {
  if (core.compilerDirectory !== bootstrap.compilerDirectory)
    throw new Error('Forge compiler graphs have different retained metadata coordinates');
  const inputs = { ...core.metadata.inputs };
  for (const [path, input] of Object.entries(bootstrap.metadata.inputs)) {
    const existing = Object.entries(inputs).find(([name]) => name === path)?.[1];
    if (existing === undefined) {
      inputs[path] = input;
      continue;
    }
    if (existing.bytes !== input.bytes || existing.format !== input.format)
      throw new Error('Forge compiler graphs disagree about a shared input');
    const edges = new Map(
      [...existing.imports, ...input.imports].map((edge) => [JSON.stringify(edge), edge]),
    );
    inputs[path] = { ...existing, imports: [...edges.values()] };
  }
  return {
    compilerDirectory: core.compilerDirectory,
    metadata: { inputs, outputs: { ...core.metadata.outputs, ...bootstrap.metadata.outputs } },
  };
}
function captureAmbient(): string {
  return hashBytes(
    JSON.stringify({
      environment: Object.entries(process.env).sort(([left], [right]) => left.localeCompare(right)),
      directory: process.cwd(),
      runtime: realpathSync.native(process.execPath),
      bun: Bun.version,
      platform: process.platform,
      architecture: process.arch,
      kernel: release(),
    }),
  );
}
/** Synchronous module-evaluation identity closes the gap before the first async compiler call. Its only nonliteral import is this producer's validated, retained emitted artifact. */
function captureBootstrap(root: string): FileObservation[] {
  const names = [...BOOTSTRAP.map((path) => join(root, path))];
  const found = new Map<string, FileObservation>();
  let bytes = 0;
  const scanner = new NativeTranspiler({ loader: 'ts', target: 'bun' });
  for (let at = 0; at < names.length; at++) {
    const path = names.at(at);
    if (path === undefined || names.length > 4096)
      throw new Error('Forge loaded bootstrap graph exceeds bound');
    if (found.has(path)) continue;
    if (!isInside(root, path)) throw new Error('Forge loaded bootstrap graph escapes its source');
    const observed = readObservedFile(path, 16 * 1024 * 1024);
    bytes += observed.file.size;
    if (bytes > GRAPH_LIMIT) throw new Error('Forge loaded bootstrap bytes exceed bound');
    found.set(path, observed.file);
    if (path.endsWith('.json')) continue;
    for (const edge of scanner.scanImports(observed.bytes)) {
      if (BUILTINS.has(edge.path)) continue;
      const selected = realpathSync.native(resolveModule(edge.path, dirname(path)));
      if (!found.has(selected) && !names.includes(selected)) names.push(selected);
    }
  }
  return [...found.values()].sort((left, right) => left.path.localeCompare(right.path));
}
const originRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const bootstrapIdentity = captureBootstrap(originRoot);

/** procfs reports virtual size0, so bound its actual descriptor stream rather than allocating an unchecked whole read. */
function readVirtualText(path: string, limit: number): string {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let primary: { readonly cause: unknown } | undefined;
  let contents: string | undefined;
  try {
    if (!fstatSync(descriptor).isFile())
      throw new Error('Forge native map source is not a regular procfs endpoint');
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      size += count;
    }
    if (size > limit) throw new Error('Forge native map observation exceeds byte bound');
    contents = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch (cause: unknown) {
    primary = { cause };
  }
  let releaseFailure: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    releaseFailure = { cause };
  }
  if (releaseFailure !== undefined) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, releaseFailure.cause],
        'Forge procfs read and release failed',
        { cause: primary.cause },
      );
    throw releaseFailure.cause;
  }
  if (primary !== undefined) throw primary.cause;
  if (contents === undefined) throw new Error('Forge native map observation is missing');
  return contents;
}
