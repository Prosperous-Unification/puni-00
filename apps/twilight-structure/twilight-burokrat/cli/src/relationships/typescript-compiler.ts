import { Buffer } from 'node:buffer';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import ts from 'typescript';

import { hashCanonical } from '../evidence/content-manifest';
import type { ResolvedDeclaration } from './typescript-core';

/** Compiler IO ports. Implementations own namespace admission; absent probes are explicit. */
export interface TypeScriptSource {
  readonly compilerLibraryDirectory: string;
  readonly useCaseSensitiveFileNames: boolean;
  pathKind: (path: string) => 'file' | 'directory' | 'absent';
  readFile: (path: string) => string | undefined;
  readDirectory: (
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number,
  ) => string[];
  getDirectories: (path: string) => string[];
  realpath: (path: string) => string;
  getCurrentDirectory: () => string;
}

/** Counts repeated probes/bytes and declaration/selector observations before accumulation. */
export interface TypeScriptLimits {
  maximumProbes: number;
  maximumReadBytes: number;
  maximumDirectoryEntries: number;
  maximumOutputBytes: number;
  maximumObservedOutputBytes: number;
}

export interface TypeScriptSystem extends ts.ParseConfigHost {
  readDirectory(
    path: string,
    extensions: readonly string[],
    exclude: readonly string[] | undefined,
    include: readonly string[],
    depth?: number,
  ): string[];
  readonly compilerLibraryDirectory: string;
  pathKind(path: string): 'file' | 'directory' | 'absent';
  directoryExists(path: string): boolean;
  getDirectories(path: string): string[];
  realpath(path: string): string;
  getCurrentDirectory(): string;
  chargeOutput(text: string): void;
  /** Charges a probe and asks the source to admit an effective explicit configuration root. */
  admitConfigurationRoot(path: string): void;
}

/** Compatible callers retain TypeScript namespace misses; retained roots require source admission. */
export type TypeScriptConfigurationMode =
  'compatible' | 'retained-type-roots' | 'retained-config-roots';

export type TypeScriptPolicy =
  { readonly kind: 'bounded'; readonly limits: TypeScriptLimits } | { readonly kind: 'legacy' };

export function boundSource(
  workspace: string,
  source: TypeScriptSource,
  policy: TypeScriptPolicy,
): TypeScriptSystem {
  // Proof: omitting each admission route independently invoked a forbidden outside port in
  // `compiler namespace misses never delegate outside paths to any source port`.
  const admits = (path: string): boolean =>
    workspacePath(workspace, resolve(path)) !== undefined ||
    workspacePath(source.compilerLibraryDirectory, resolve(path)) !== undefined;
  const exceeds = (count: number, name: keyof TypeScriptLimits): boolean =>
    policy.kind === 'bounded' && count > policy.limits[name];
  let probes = 0;
  let readBytes = 0;
  let directoryEntries = 0;
  let outputBytes = 0;
  const probe = (): void => {
    probes += 1;
    // Proof: omitting this refusal made `compiler refuses maximumProbes` return extraction.
    if (exceeds(probes, 'maximumProbes')) throw new Error('TypeScript probe limit exceeded');
  };
  const enumerate = (paths: string[]): string[] => {
    directoryEntries += paths.length;
    // Proof: omitting this refusal made `compiler refuses maximumDirectoryEntries` succeed.
    if (exceeds(directoryEntries, 'maximumDirectoryEntries'))
      throw new Error('TypeScript directory entry limit exceeded');
    return paths;
  };
  const pathKind = (path: string): ReturnType<TypeScriptSource['pathKind']> => {
    probe();
    return admits(path) ? source.pathKind(path) : 'absent';
  };
  return {
    compilerLibraryDirectory: source.compilerLibraryDirectory,
    useCaseSensitiveFileNames: source.useCaseSensitiveFileNames,
    pathKind,
    // Proof: compiler-charge omission lost the repeated-probe refusal; source-delegation
    // omission lost the path list in `explicit type root admission delegates outside paths
    // and charges repeated probes`. Masking this route admitted the absolute outside root.
    // Proof: masking source delegation admitted the outside rootDirs fixture; removing probe()
    // lost `retained effective rootDirs charges repeated compiler admission at exact fit`.
    admitConfigurationRoot: (path) => {
      probe();
      source.pathKind(path);
    },
    fileExists: (path) => pathKind(path) === 'file',
    directoryExists: (path) => pathKind(path) === 'directory',
    readFile: (path) => {
      probe();
      const text = admits(path) ? source.readFile(path) : undefined;
      readBytes += text === undefined ? 0 : Buffer.byteLength(text, 'utf8');
      // Proof: omitting this refusal made `compiler refuses maximumReadBytes` succeed.
      if (exceeds(readBytes, 'maximumReadBytes'))
        throw new Error('TypeScript read byte limit exceeded');
      return text;
    },
    readDirectory: (path, extensions, exclude, include, depth) => {
      probe();
      return enumerate(
        admits(path) ? source.readDirectory(path, extensions, exclude, include, depth) : [],
      );
    },
    getDirectories: (path) => {
      probe();
      return enumerate(admits(path) ? source.getDirectories(path) : []);
    },
    realpath: (path) => {
      probe();
      if (!admits(path)) throw new Error(`compiler path outside trusted closure: ${path}`);
      return source.realpath(path);
    },
    getCurrentDirectory: () => {
      probe();
      return source.getCurrentDirectory();
    },
    chargeOutput: (text) => {
      outputBytes += Buffer.byteLength(text, 'utf8');
      // Proof: omitting this refusal made `compiler refuses maximumObservedOutputBytes` succeed.
      if (exceeds(outputBytes, 'maximumObservedOutputBytes'))
        throw new Error('TypeScript observed output byte limit exceeded');
    },
  };
}

export interface ParsedProject {
  system: TypeScriptSystem;
  configPath: string;
  configurationIdentity: string;
  options: ts.CompilerOptions;
  program: ts.Program;
  declarations: Map<string, ResolvedDeclaration>;
}

export const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

export function workspacePath(workspace: string, path: string): string | undefined {
  const fromRoot = relative(workspace, path).replaceAll('\\', '/');
  // Proof: returning the temporary absolute root for `rootDir: '.'` made repeated extraction of
  // one commit receive configuration identities cc163641... and 0ec9a7e... instead of equality.
  if (fromRoot === '') return '.';
  return fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot)
    ? undefined
    : fromRoot;
}

export function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

export function isJsonSource(sourceFile: ts.SourceFile): boolean {
  return (sourceFile.flags & ts.NodeFlags.JsonFile) !== 0;
}

function normalizedCompilerValue(value: unknown, workspace: string): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const selectedPath = workspacePath(workspace, value);
    return selectedPath ?? value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizedCompilerValue(entry, workspace));
  if (typeof value !== 'object') {
    throw new Error(`TypeScript compiler configuration contains unsupported ${typeof value}`);
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) normalized[key] = normalizedCompilerValue(field, workspace);
  }
  return normalized;
}

/**
 * Uses the lockfile-pinned @typescript/old 6.0.3 pure path algebra, including drive roots and
 * backslashes. This private helper performs no IO and never consults an ambient cwd.
 * @throws Error if the installed private helper's version, signature or return shape differs.
 */
function resolveLiteralPath(base: string, substitution: string): string {
  const runtime: unknown = ts;
  // Proof: helper-callable/version/signature omissions failed the isolated helper-absent,
  // helper-version and helper-signature production boundary cases in typescript-compiler.test.ts.
  if (
    runtime === null ||
    typeof runtime !== 'object' ||
    !('version' in runtime) ||
    runtime.version !== '6.0.3' ||
    !('resolvePath' in runtime) ||
    typeof runtime.resolvePath !== 'function' ||
    runtime.resolvePath.length !== 1
  )
    throw new Error('installed TypeScript resolvePath shape differs');
  // Boundary: the pinned 6.0.3 private helper has this pure signature; its output is checked below.
  const resolvePath = runtime.resolvePath as (path: string, ...paths: string[]) => unknown;
  const path = resolvePath(base, substitution);
  // Proof: removing this refusal failed the isolated helper-return production boundary case.
  if (typeof path !== 'string')
    throw new Error('installed TypeScript resolvePath returned nonstring');
  return path;
}

/**
 * Admits only effective fixed substitutions, preserving key/array order and repeated work.
 * The parser owns inheritance and configDir expansion; wildcard-bearing targets are untouched.
 * @throws Error for malformed effective mappings, nested substitutions or required origins.
 */
function admitLiteralPaths(options: ts.CompilerOptions, system: TypeScriptSystem): void {
  const paths: unknown = options.paths;
  if (paths === undefined) return;
  // Proof: removing the mapping guard failed boundary nonobject; removing its array clause
  // failed boundary array-map in the isolated production parser path.
  if (paths === null || typeof paths !== 'object' || Array.isArray(paths))
    throw new Error('TypeScript effective paths must be a mapping');
  // Proof: key filtering lost fixed wildcard-key outside refusal; reversing mappings lost
  // prior-roots/key-order normalization. Reintroducing discarded mappings lost override success.
  const mappings: unknown[] = Object.values(paths);
  for (const substitutions of mappings) {
    // Proof: removing this refusal failed the isolated boundary nonarray production case.
    if (!Array.isArray(substitutions))
      throw new Error('TypeScript effective paths substitutions must be arrays');
    const entries: readonly unknown[] = substitutions;
    // Proof: deduplicating this loop lost declaring-origin repeated admission and order.
    for (const substitution of entries) {
      // Proof: removing this refusal failed the isolated boundary nonstring production case.
      if (typeof substitution !== 'string')
        throw new Error('TypeScript effective paths substitution must be a string');
      // Proof: admitting wildcard-bearing targets lost admits wildcard substitution untouched.
      if (substitution.includes('*')) continue;
      // Proof: cwd origin substitution lost declaring-origin normalization; ignoring baseUrl
      // lost baseUrl override. The corrected consumer configDir oracle failed omitted admission.
      let base: unknown;
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Pinned TS6 paths resolution prefers defined baseUrl over parser-owned pathsBasePath.
      if (options.baseUrl !== undefined) base = options.baseUrl;
      else base = options['pathsBasePath'];
      // Proof: origin-guard omission and cwd-default injection failed boundary missing-origin.
      if (typeof base !== 'string')
        throw new Error('TypeScript effective paths requires a string baseUrl or pathsBasePath');
      // Proof: Node resolution lost backslash/drive normalization; existence checks lost inside
      // missing success. Ambient sys access lost removed-root replay; omitting link census lost
      // inside-linked raw bytes. Compiler/source omission or reset and omitted steps lost shared
      // exact-fit controls. Lexical-only admission lost ancestor escape refusal.
      system.admitConfigurationRoot(resolveLiteralPath(base, substitution));
    }
  }
}

/**
 * Parses one root project with compiler inheritance semantics. Retained modes admit effective
 * typeRoots; retained-config-roots also admits effective rootDirs, baseUrl and literal paths
 * substitutions before the host, using the effective baseUrl or parser-owned declaring origin.
 * Absent admitted roots are valid, and repeated roots consume repeated admission work.
 * @throws Error for config failures, refused source admission or escaped declarations.
 */
export function parseProject(
  workspace: string,
  configPath: string,
  system: TypeScriptSystem,
  mode: TypeScriptConfigurationMode = 'compatible',
): ParsedProject {
  const absoluteConfig = resolve(workspace, configPath);
  // Proof: removing this boundary made the production CLI report the absent
  // `missing-tsconfig.json` as unreadable; the exact absent assertion failed.
  if (system.pathKind(absoluteConfig) === 'absent')
    throw new Error(`TypeScript config absent: ${configPath}`);
  const config = ts.readConfigFile(absoluteConfig, (path) => system.readFile(path));
  if (config.error !== undefined) {
    // Proof: removing this branch made the directory supplied as config exit 0; the production
    // unreadable-config oracle expected exit 1 and failed before the malformed case.
    const detail = formatDiagnostic(config.error);
    // Proof: omitting code 5012 labeled the injected unreadable source config malformed;
    // `unreadable config remains unreadable with source context` failed.
    const failure =
      config.error.code === 5083 || config.error.code === 5012 ? 'unreadable' : 'malformed';
    throw new Error(`TypeScript config ${failure}: ${configPath}: ${detail}`);
  }
  // Proof: substituting ts.sys here made the scoped-config CLI fixture report the trusted
  // @fixture/config package absent; its expected-success assertion failed.
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    system,
    dirname(absoluteConfig),
    {},
    absoluteConfig,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      `TypeScript config malformed: ${configPath}: ${parsed.errors.map(formatDiagnostic).join('; ')}`,
    );
  }
  // Proof: loop/masked-route/auto-discovery gating omissions admitted the outside root with
  // types:[]; raw-only inspection admitted the inherited outside root. Wrong-base substitution
  // lost `retained admission observes only parser effective roots at the declaring config base`.
  // Validating discarded inherited roots lost `admits override discarded outside`; moving this
  // loop after program creation lost the zero-host assertion in `refuses absolute outside`.
  // Proof: excluding the new mode admitted the outside root in the retained typeRoots refusal.
  if (mode === 'retained-type-roots' || mode === 'retained-config-roots') {
    for (const path of parsed.options.typeRoots ?? []) system.admitConfigurationRoot(path);
  }
  // Proof: omitted/types-empty-gated admission let `rootDirs refuses absolute outside` succeed;
  // moving it after host creation lost that test's zero-host assertion. Raw-only roots lost
  // inherited-outside refusal; wrong-base/reversed order lost the normalized sequential-root
  // oracle. Validating discarded inherited roots lost override success; requiring existence
  // lost missing-root success. Global admission lost the previous-mode compatibility control;
  // deduplication lost the repeated compiler admission exact-fit test.
  if (mode === 'retained-config-roots') {
    for (const path of parsed.options.rootDirs ?? []) system.admitConfigurationRoot(path);
    // Proof: omitted/usage/types gates and masked/bypassed source admission lost unused outside
    // refusal. Raw/wrong bases lost effective normalization; discarded inheritance lost override
    // success. Requiring existence lost missing success; invented defaults lost omitted admission.
    // Option removal/rewrite lost bare-provider resolution; lexical-only admission lost link escape
    // refusal. Global admission lost prior-mode compatibility; late admission lost zero-host cutoff.
    // Physical lookup lost removed-root replay. Compiler/source charge omission or reset lost
    // shared exact-fit controls; removing the source path fence lost the long-root encoding guard.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- The pinned TS6 parser returns this supported deprecated option; admit its effective root before compiler use.
    if (parsed.options.baseUrl !== undefined) system.admitConfigurationRoot(parsed.options.baseUrl);
    // Proof: omitted/usage/types-gated/masked/bypassed admission lost unused outside refusal;
    // late admission lost zero-host cutoff. Global admission lost previous-mode compatibility.
    // Option removal and reversed fallbacks lost exact alias declarations. Removing the source
    // path fence reached the forbidden long-root encoding sentinel.
    admitLiteralPaths(parsed.options, system);
  }
  const options: ts.CompilerOptions = {
    ...parsed.options,
    declaration: true,
    declarationMap: false,
    emitDeclarationOnly: true,
    noEmit: false,
  };
  const host = createCompilerHost(options, system);
  const program = ts.createProgram({
    host,
    rootNames: parsed.fileNames,
    options,
    projectReferences: parsed.projectReferences,
  });
  // Proof: with filesystem admission deliberately bypassed, this guard still refused an
  // outside config-listed declaration. Removing it then made that production CLI exit 0.
  for (const sourceFile of program.getSourceFiles()) {
    const canonical = system.realpath(sourceFile.fileName);
    // Proof: bypassing nested-module materialization rejection still refused the symlink-alias
    // CLI fixture here. Removing this guard then admitted external:hidden and exited 0.
    if (
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      program.isSourceFileFromExternalLibrary(sourceFile) &&
      workspacePath(resolve(workspace, 'node_modules'), canonical) === undefined
    ) {
      throw new Error(
        `compiler external declaration outside trusted copied closure: ${sourceFile.fileName}`,
      );
    }
    if (
      workspacePath(workspace, canonical) === undefined &&
      !program.isSourceFileDefaultLibrary(sourceFile)
    ) {
      throw new Error(
        `compiler declaration outside trusted copied closure: ${sourceFile.fileName}`,
      );
    }
  }
  const configurationIdentity = hashCanonical({
    configPath,
    fileNames: parsed.fileNames
      .map((fileName) => workspacePath(workspace, fileName))
      .filter((path): path is string => path !== undefined)
      .sort(compareText),
    options: normalizedCompilerValue(options, workspace),
  });
  return {
    system,
    configPath,
    configurationIdentity,
    options,
    program,
    declarations: new Map(),
  };
}

/**
 * Constructs every compiler IO route explicitly; unexpected output writes are refused.
 * Proof: independently replacing every read/probe/enumeration/cwd/library route with ts.sys
 * or an ambient library path failed poisoned reference, package, type-root and library positives.
 * Removing readDirectory failed the wildcard project-reference positive instead of falling back.
 */
export function createCompilerHost(
  options: ts.CompilerOptions,
  system: TypeScriptSystem,
): ts.CompilerHost {
  const host: ts.CompilerHost = {
    getDefaultLibFileName: (compilerOptions) =>
      resolve(system.compilerLibraryDirectory, ts.getDefaultLibFileName(compilerOptions)),
    getDefaultLibLocation: () => system.compilerLibraryDirectory,
    fileExists: (path) => system.fileExists(path),
    readFile: (path) => system.readFile(path),
    readDirectory: (path, extensions, exclude, include, depth) =>
      system.readDirectory(path, extensions, exclude, include, depth),
    directoryExists: (path) => system.directoryExists(path),
    getDirectories: (path) => system.getDirectories(path),
    realpath: (path) => system.realpath(path),
    getCurrentDirectory: () => system.getCurrentDirectory(),
    // Proof: plain toLowerCase collapsed İ and i̇ in the case-insensitive compiler fixture.
    getCanonicalFileName: (path) =>
      system.useCaseSensitiveFileNames
        ? path
        : path.replace(/[^\u0130\u0131\u00DFa-z0-9\\/:\-_. ]+/g, (segment) =>
            segment.toLowerCase(),
          ),
    useCaseSensitiveFileNames: () => system.useCaseSensitiveFileNames,
    getNewLine: () => (options.newLine === ts.NewLineKind.CarriageReturnLineFeed ? '\r\n' : '\n'),
    // Proof: removing this throw made `compiler ambient output callback refuses unexpected
    // compiler writes` accept the injected compiler write.
    writeFile: () => {
      throw new Error('TypeScript compiler attempted an ambient output write');
    },
    getSourceFile: (path, languageVersion) => {
      // Proof: restoring ts.sys here failed the poisoned wildcard reference positive;
      // host.readFile itself is separately poisoned to prove this route remains connected.
      const source = host.readFile(path);
      return source === undefined ? undefined : ts.createSourceFile(path, source, languageVersion);
    },
  };
  return host;
}
