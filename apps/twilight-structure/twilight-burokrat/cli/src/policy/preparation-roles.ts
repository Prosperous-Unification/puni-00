import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { createShebang } from '@shared/bun-startup';
import ts from 'typescript';

import type { LintInterrupt, SubscribeLintInterrupts } from '../lint-interrupts';
import { type PreparationCompiler, prepareCompiler } from '../packaging/preparation-compiler';
import { boundSource } from '../relationships/typescript-compiler';
import type { BuildDependencies } from './build-dependencies';
import { type BunToolkitRole, bunToolkitRoles } from './bun-release';
import type { CommittedSource } from './committed-source';
import type { PreparationNotice } from './prepared-activation';
import { type BunToolkit, readBunToolkit } from './toolkit';
import { copyTrustedModules, hashTrustedModules } from './trusted-modules';

interface Context {
  readonly materializedDirectory: string;
  readonly toolkit: BunToolkit;
  readonly validatorEntry: string;
  readonly launcherEntry: string;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}
export type PreparationRoles =
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
  | {
      readonly kind: 'built';
      readonly validator: Uint8Array;
      readonly launcher: Uint8Array;
      readonly snapshotter: Uint8Array;
      readonly compilerTransforms: readonly PreparationCompiler['manifest'][];
      readonly notices: readonly PreparationNotice[];
    };
interface Module {
  readonly bytes: Uint8Array;
  readonly loader: 'ts' | 'tsx' | 'js' | 'jsx' | 'json';
}
function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}
function inspectPath(path: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(path);
  } catch (cause) {
    if (
      cause instanceof Error &&
      'code' in cause &&
      (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
    )
      return undefined;
    throw cause;
  }
}
function selectLoader(path: string): Module['loader'] {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.json')) return 'json';
  if (/\.(?:ts|mts|cts)$/u.test(path)) return 'ts';
  if (/\.(?:js|mjs|cjs)$/u.test(path)) return 'js';
  throw new Error('unsupported preparation build source: ' + path);
}
function assertNoMacros(path: string, source: Module): void {
  if (source.loader === 'json') return;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(source.bytes),
    parsed = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      source.loader === 'tsx'
        ? ts.ScriptKind.TSX
        : source.loader === 'jsx'
          ? ts.ScriptKind.JSX
          : source.loader === 'js'
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS,
    );
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      // Proof: c26-build-macro; injected fault failed `refuses a candidate macro before any bundler execution can create its sentinel`; the same named test(s) passed after restoration.
      node.attributes?.elements.some(
        (attribute) =>
          attribute.name.text === 'type' &&
          ts.isStringLiteral(attribute.value) &&
          attribute.value.text === 'macro',
      ) === true
    )
      throw new Error('preparation build refuses macro import attributes: ' + path);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}
function createImportKey(importer: string, specifier: string, kind: string): string {
  // Proof: c26-build-import-kind; injected fault failed `preserves import and require conditions for the same authenticated package`; the same named test(s) passed after restoration.
  return JSON.stringify([importer, specifier, kind]);
}

function assertNoOpaqueLoads(path: string, module: Module, vendor: boolean): void {
  if (module.loader === 'json') return;
  const parsed = ts.createSourceFile(
    path,
    new TextDecoder('utf-8', { fatal: true }).decode(module.bytes),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  function visit(node: ts.Node): void {
    if (
      // Proof: c26-build-alias-loader; injected fault failed `refuses an aliased first-party opaque loader alongside the admitted compiler`; the same named test(s) passed after restoration.
      !vendor &&
      ts.isIdentifier(node) &&
      node.text === 'require' &&
      ts.isVariableDeclaration(node.parent) &&
      node.parent.initializer === node
    )
      throw new Error('preparation refuses an aliased first-party runtime loader: ' + path);
    if (ts.isCallExpression(node)) {
      const call = node.expression;
      const isLoader =
        call.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(call) && call.text === 'require') ||
        (ts.isPropertyAccessExpression(call) &&
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'require' &&
          call.name.text === 'resolve');
      const specifier = node.arguments.at(0);
      // Proof: c26-build-opaque; injected fault failed `refuses an opaque runtime import rather than claiming a closed build`; the same named test(s) passed after restoration.
      if (isLoader && (specifier === undefined || !ts.isStringLiteralLike(specifier)))
        throw new Error(
          'preparation refuses an opaque ' +
            (vendor ? 'vendor' : 'first-party') +
            ' runtime loader: ' +
            path,
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

interface RoleBuildContext<Role extends string> {
  readonly materializedDirectory: string;
  readonly entries: readonly (readonly [Role, string])[];
  readonly executableRoles: readonly Role[];
  readonly readDependencies: () => BuildDependencies;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}
type BuiltRoles<Role extends string> =
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
  | {
      readonly kind: 'built';
      readonly roleBytes: Readonly<Record<Role, Uint8Array>>;
      readonly compilerTransforms: readonly PreparationCompiler['manifest'][];
      readonly notices: readonly PreparationNotice[];
    };

/** The three-role relocation adapter reauthenticates its selected toolkit inside the owned build. */
export async function buildPreparationRoles(
  source: CommittedSource,
  context: Context,
): Promise<PreparationRoles> {
  const toolkitDirectory = context.toolkit.directory,
    toolkitIdentity = context.toolkit.digest;
  const built = await buildSelectedRoles(source, {
    materializedDirectory: context.materializedDirectory,
    entries: [
      ['validator', context.validatorEntry],
      ['launcher', context.launcherEntry],
      ['snapshotter', join(dirname(context.validatorEntry), 'policy/snapshot-validator.ts')],
    ],
    executableRoles: ['launcher'],
    subscribeInterrupts: context.subscribeInterrupts,
    readDependencies: () => {
      const verified = readBunToolkit(toolkitDirectory);
      // Proof: c26-build-toolkit; injected fault failed `refuses a changed selected toolkit identity before copying dependencies`; the same named test(s) passed after restoration.
      if (verified.digest !== toolkitIdentity)
        throw new Error('preparation toolkit identity changed before build');
      return {
        directory: join(verified.directory, 'trusted-node-modules'),
        identity: verified.trustedNodeModulesIdentity,
        names: verified.trustedNodeModules,
        bunVersion: verified.bunVersion,
        compilerVersion: ts.version,
        protectedPaths: [verified.directory],
      };
    },
  });
  if (built.kind !== 'built') return built;
  return {
    kind: 'built',
    // Proof: c26-build-validator-provenance; injected fault failed `builds selected checkout roles and aliases from captured B while live B changes`; the same named test(s) passed after restoration.
    validator: built.roleBytes.validator,
    // Proof: c26-build-launcher-provenance; injected fault failed `builds selected checkout roles and aliases from captured B while live B changes`; the same named test(s) passed after restoration.
    launcher: built.roleBytes.launcher,
    // Proof: c26-build-snapshotter-provenance; injected fault failed `builds selected checkout roles and aliases from captured B while live B changes`; the same named test(s) passed after restoration.
    snapshotter: built.roleBytes.snapshotter,
    compilerTransforms: built.compilerTransforms,
    notices: built.notices,
  };
}

/**
 * Build every current toolkit role from one captured source and independently admitted closure.
 * The capability comes from readBuildDependencies or an already authenticated toolkit adapter;
 * no candidate import extends its roster. Input arrays and fields are captured before callbacks.
 */
export function buildToolkitRoles(
  source: CommittedSource,
  context: {
    readonly materializedDirectory: string;
    readonly dependencies: BuildDependencies;
    readonly entries: Readonly<Record<BunToolkitRole, string>>;
    readonly subscribeInterrupts: SubscribeLintInterrupts;
  },
): Promise<BuiltRoles<BunToolkitRole>> {
  const dependencies: BuildDependencies = {
    ...context.dependencies,
    // Proof: c27-roles-capability-capture; names-array capture only: mutation retains that input array alias; other copied capability fields are not independently claimed; injected fault failed `captures five-role entries and dependency capability fields before subscription aliases mutate`; restoration passed.
    names: [...context.dependencies.names],
    protectedPaths: [...context.dependencies.protectedPaths],
  };
  // Proof: c27-roles-entry-capture; ordering fault: invoke the callback before copying role-entry fields; injected fault failed `captures five-role entries and dependency capability fields before subscription aliases mutate`; restoration passed.
  return buildSelectedRoles(source, {
    materializedDirectory: context.materializedDirectory,
    entries: bunToolkitRoles.map((role) => [role, context.entries[role]] as const),
    executableRoles: [
      'launcher.mjs',
      'prepare-activation.mjs',
      'prepare-relocation-activation.mjs',
    ],
    readDependencies: () => dependencies,
    subscribeInterrupts: context.subscribeInterrupts,
  });
}

/**
 * Candidate helpers/plugins never execute: configuration is bounded and a sealed namespace
 * supplies captured modules, closed imports and the pinned compiler transform. Macro attributes
 * refuse before Bun's API. The caller owns the fresh view and retains it on failure/cancellation.
 * Every in-process build settles before cancellation returns; this API owns no child group.
 */
async function buildSelectedRoles<Role extends string>(
  source: CommittedSource,
  context: RoleBuildContext<Role>,
): Promise<BuiltRoles<Role>> {
  const materializedDirectory = context.materializedDirectory,
    selectedEntries = context.entries.map(([role, path]) => [role, path] as const),
    executableRoles = [...context.executableRoles],
    readDependencies = context.readDependencies,
    subscribe = context.subscribeInterrupts;
  let first: LintInterrupt | undefined;
  const unsubscribe = subscribe((signal) => {
    // Proof: c26-build-first-reason; injected fault failed `honors the first interruption delivered during terminal build subscription release`; the same named test(s) passed after restoration.
    first ??= signal;
  });
  const readCancellation = (): Extract<BuiltRoles<Role>, { kind: 'cancelled' }> | undefined =>
    // Proof: c26-build-status; injected fault failed `returns prior role-build cancellation before resolving absent materialization`; the same named test(s) passed after restoration.
    first === undefined ? undefined : { kind: 'cancelled', status: first === 'SIGINT' ? 130 : 143 };
  async function buildRoles(): Promise<BuiltRoles<Role>> {
    const prior = readCancellation();
    // Proof: c26-build-prior; injected fault failed `returns prior role-build cancellation before resolving absent materialization`; the same named test(s) passed after restoration.
    if (prior !== undefined) return prior;
    const directory = realpathSync.native(materializedDirectory);
    const snapshot = source.readSnapshot(),
      readFile = source.readFile.bind(source);
    // Proof: c26-build-captured-modules; injected fault failed `refuses captured node_modules before copying any preparation dependencies`; the same named test(s) passed after restoration.
    if (snapshot.entries.some((entry) => entry.path.split('/').includes('node_modules')))
      throw new Error('captured node_modules is not preparation dependency authority');
    const dependencies = readDependencies();
    // Proof: c27-roles-capability-pins; injected fault failed `refuses a dependency capability with a different bunVersion before copying` and 1 additional named controls; restoration passed.
    if (dependencies.bunVersion !== Bun.version || dependencies.compilerVersion !== ts.version)
      throw new Error(
        'preparation build dependency capability has different runtime or compiler pins',
      );
    const modules = join(directory, 'node_modules');
    mkdirSync(modules, { mode: 0o700 });
    copyTrustedModules(modules, dependencies.directory, dependencies.names);
    // Proof: c26-build-copy; injected fault failed `refuses changed dependency copy bytes before building executable roles`; the same named test(s) passed after restoration.
    // Proof: c27-roles-admitted-copy; injected fault failed `refuses dependency bytes changed after capability admission and before the private copy`; restoration passed.
    if (hashTrustedModules(modules) !== dependencies.identity)
      throw new Error('preparation build dependency copy differs from toolkit');
    const manifest: unknown = JSON.parse(
      readFileSync(join(modules, '@typescript/old/package.json'), 'utf8'),
    );
    if (
      // Proof: c26-build-compiler-version; injected fault failed `refuses authenticated compiler metadata that differs from the producer compiler`; the same named test(s) passed after restoration.
      typeof manifest !== 'object' ||
      manifest === null ||
      !('version' in manifest) ||
      manifest.version !== ts.version
    )
      throw new Error('preparation compiler differs from producer TypeScript ' + ts.version);
    const entries = new Map(snapshot.entries.map((entry) => [entry.path, entry]));
    const rootConfig = join(directory, 'tsconfig.json'),
      defaultConfig = JSON.stringify({ compilerOptions: {} });
    if (!entries.has('tsconfig.json'))
      writeFileSync(rootConfig, defaultConfig, { flag: 'wx', mode: 0o444 });
    function admitPath(path: string): string {
      const absolute = resolve(path);
      // Proof: c26-build-logical-root; injected fault failed `refuses an unused external captured configuration baseUrl root`; `refuses an unused external captured configuration rootDirs root`; `refuses an unused external captured configuration typeRoots root`; the same named test(s) passed after restoration.
      if (!isWithin(directory, absolute))
        throw new Error('preparation build path escapes selected view: ' + path);
      const status = inspectPath(absolute);
      if (status !== undefined && !isWithin(directory, realpathSync.native(absolute)))
        throw new Error('preparation build native path escapes selected view: ' + path);
      return absolute;
    }
    function readBytes(path: string): Uint8Array {
      const absolute = admitPath(path),
        canonical = realpathSync.native(absolute),
        offset = relative(directory, canonical);
      if (isWithin(modules, canonical)) {
        if (!statSync(canonical).isFile())
          throw new Error('preparation dependency is not a regular file: ' + canonical);
        return readFileSync(canonical);
      }
      const entry = entries.get(offset);
      if (entry === undefined) {
        if (canonical === rootConfig && !entries.has('tsconfig.json'))
          return Buffer.from(defaultConfig);
        // Proof: c26-build-source-capture; injected fault failed `refuses an uncaptured generated source file appearing in the materialized view`; the same named test(s) passed after restoration.
        throw new Error('preparation build requested uncaptured source: ' + offset);
      }
      if (entry.mode !== '100644' && entry.mode !== '100755')
        throw new Error('preparation build source is not captured regular bytes: ' + offset);
      return readFile(offset);
    }
    const system = boundSource(
      directory,
      {
        compilerLibraryDirectory: join(modules, '@typescript/old/lib'),
        useCaseSensitiveFileNames: true,
        pathKind: (path) => {
          const status = inspectPath(admitPath(path));
          return status === undefined
            ? 'absent'
            : status.isDirectory()
              ? 'directory'
              : status.isFile()
                ? 'file'
                : 'absent';
        },
        readFile: (path) =>
          inspectPath(admitPath(path)) === undefined
            ? undefined
            : new TextDecoder('utf-8', { fatal: true }).decode(readBytes(path)),
        readDirectory: (path, extensions, exclude, include, depth) =>
          ts.sys.readDirectory(admitPath(path), extensions, exclude, include, depth),
        getDirectories: (path) => ts.sys.getDirectories(admitPath(path)),
        realpath: (path) => realpathSync.native(admitPath(path)),
        getCurrentDirectory: () => directory,
      },
      {
        kind: 'bounded',
        limits: {
          maximumProbes: 1000000,
          maximumReadBytes: 536870912,
          maximumDirectoryEntries: 500000,
          maximumOutputBytes: 536870912,
          maximumObservedOutputBytes: 536870912,
        },
      },
    );
    const configurations = new Map<string, ts.CompilerOptions>();
    function readConfiguration(importer: string): ts.CompilerOptions {
      if (isWithin(modules, importer)) return {};
      let parent = dirname(importer);
      while (!existsSync(join(parent, 'tsconfig.json'))) {
        if (parent === directory) throw new Error('preparation root configuration disappeared');
        parent = dirname(parent);
        if (!isWithin(directory, parent)) throw new Error('preparation configuration escaped root');
      }
      const path = join(parent, 'tsconfig.json'),
        cached = configurations.get(path);
      if (cached !== undefined) return cached;
      const config = ts.readConfigFile(path, (path) => system.readFile(path));
      if (config.error !== undefined)
        throw new Error(
          'preparation configuration unreadable: ' +
            ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
        );
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        { ...system, readDirectory: () => [] },
        parent,
        {},
        path,
      );
      const errors = parsed.errors.filter((error) => error.code !== 18003);
      if (errors.length > 0)
        throw new Error(
          'preparation configuration malformed: ' +
            errors
              .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
              .join('; '),
        );
      const fields: Readonly<Record<string, unknown>> = parsed.options;
      for (const key of ['baseUrl', 'rootDirs', 'typeRoots']) {
        const value = fields[key];
        if (typeof value === 'string') admitPath(value);
        else if (Array.isArray(value))
          for (const root of value) {
            if (typeof root !== 'string')
              throw new Error('preparation configuration root is malformed');
            admitPath(root);
          }
      }
      if (parsed.options.paths !== undefined) {
        const base = fields['baseUrl'] ?? fields['pathsBasePath'];
        if (typeof base !== 'string') throw new Error('preparation alias base is absent');
        for (const substitutions of Object.values(parsed.options.paths))
          for (const substitution of substitutions) {
            const prefix = substitution.split('*')[0];
            admitPath(resolve(base, prefix.replaceAll('\\', '/')));
          }
      }
      configurations.set(path, parsed.options);
      return parsed.options;
    }
    function selectProvider(specifier: string, importer: string): string {
      const parts = specifier.split('/'),
        name = parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
      if (name === '' || name === '@' || name === '.' || name === '..')
        throw new Error('preparation dependency name is malformed');
      let parent = dirname(importer);
      while (isWithin(directory, parent)) {
        const candidate = join(parent, 'node_modules', name);
        if (isWithin(modules, candidate) && inspectPath(candidate)?.isDirectory() === true)
          return realpathSync.native(candidate);
        if (parent === directory) break;
        parent = dirname(parent);
      }
      throw new Error('authenticated preparation dependency is absent: ' + name);
    }
    function resolveImport(
      specifier: string,
      importer: string,
      kind: string,
    ): { path: string; isExternal: boolean } {
      if (isBuiltin(specifier) || specifier === 'bun' || specifier.startsWith('bun:'))
        return { path: specifier, isExternal: true };
      if (specifier.includes(':') || specifier.startsWith('#'))
        throw new Error('unsupported preparation import specifier: ' + specifier);
      const options = readConfiguration(importer),
        matches = Object.keys(options.paths ?? {}).some((pattern) => {
          const star = pattern.indexOf('*');
          return star < 0
            ? pattern === specifier
            : specifier.startsWith(pattern.slice(0, star)) &&
                specifier.endsWith(pattern.slice(star + 1));
        });
      if (matches) {
        const selected = ts.resolveModuleName(specifier, importer, options, system).resolvedModule;
        if (selected === undefined)
          throw new Error('captured workspace alias is unresolved: ' + specifier);
        return {
          path: realpathSync.native(admitPath(selected.resolvedFileName)),
          isExternal: false,
        };
      }
      let provider: string | undefined;
      if (!specifier.startsWith('.') && !isAbsolute(specifier))
        provider = selectProvider(specifier, importer);
      else admitPath(isAbsolute(specifier) ? specifier : resolve(dirname(importer), specifier));
      const selected = realpathSync.native(
        kind === 'require-call' || kind === 'require-resolve'
          ? createRequire(importer).resolve(specifier)
          : Bun.resolveSync(specifier, dirname(importer)),
      );
      admitPath(selected);
      if (provider !== undefined && !isWithin(provider, selected))
        throw new Error(
          'preparation dependency resolves outside authenticated provider: ' + specifier,
        );
      // Proof: c26-build-vendor-source; injected fault failed `refuses an authenticated vendor importing captured first-party source inside the view`; the same named test(s) passed after restoration.
      if (isWithin(modules, importer) && !isWithin(modules, selected))
        throw new Error('preparation dependency imports first-party source: ' + specifier);
      return { path: selected, isExternal: false };
    }
    const roleEntries = selectedEntries.map(
      ([role, path]) => [role, realpathSync.native(admitPath(join(directory, path)))] as const,
    );
    // Proof: c26-build-role-source; injected fault failed `refuses an executable role selected from authenticated dependencies`; the same named test(s) passed after restoration.
    if (roleEntries.some(([, path]) => isWithin(modules, path)))
      throw new Error('preparation executable role must be selected first-party source');
    const compilerTransforms: PreparationCompiler['manifest'][] = [];
    const notices: PreparationNotice[] = [];
    const captured = new Map<string, Module>(),
      imports = new Map<string, { path: string; isExternal: boolean }>(),
      pending = roleEntries.map(([, path]) => path);
    while (pending.length > 0) {
      const path = pending.pop();
      if (path === undefined) throw new Error('preparation source queue is unexpectedly empty');
      if (captured.has(path)) continue;
      let original: Module = { bytes: readBytes(path), loader: selectLoader(path) };
      if (path === join(modules, '@typescript/old/lib/typescript.js')) {
        const prepared = prepareCompiler(
          new TextDecoder('utf-8', { fatal: true }).decode(original.bytes),
          readBytes(join(dirname(path), '../LICENSE.txt')),
          readBytes(join(dirname(path), '../ThirdPartyNoticeText.txt')),
        );
        compilerTransforms.push(prepared.manifest);
        notices.push(
          { path: 'licenses/typescript-preparation/LICENSE.txt', bytes: prepared.license },
          { path: 'licenses/typescript-preparation/NOTICE', bytes: prepared.notice },
        );
        original = { bytes: Buffer.from(prepared.source), loader: original.loader };
      }
      assertNoMacros(path, original);
      const options = readConfiguration(path);
      let module: Module = original;
      if (original.loader !== 'json') {
        if (
          // Proof: c26-build-jsx-refusal; injected fault failed `refuses preserved JSX instead of silently changing candidate runtime semantics`; the same named test(s) passed after restoration.
          (original.loader === 'tsx' || original.loader === 'jsx') &&
          (options.jsx === ts.JsxEmit.Preserve || options.jsx === ts.JsxEmit.ReactNative)
        )
          throw new Error('preparation build does not support preserved JSX transforms: ' + path);
        const transformOptions = { ...options };
        // Alias resolution already consumed these parser-owned fields; they do not affect emit.
        Reflect.deleteProperty(transformOptions, 'baseUrl');
        Reflect.deleteProperty(transformOptions, 'pathsBasePath');
        delete transformOptions.paths;
        const emitted = ts.transpileModule(
          new TextDecoder('utf-8', { fatal: true }).decode(original.bytes),
          {
            fileName: path,
            compilerOptions: {
              // Proof: c26-build-transforms; injected fault failed `preserves captured class-field assignment semantics`; `preserves a captured JSX factory instead of adopting producer defaults`; the same named test(s) passed after restoration.
              ...transformOptions,
              target: options.target ?? ts.ScriptTarget.ESNext,
              module: ts.ModuleKind.Preserve,
              moduleResolution: ts.ModuleResolutionKind.Bundler,
              noEmit: false,
              declaration: false,
              declarationMap: false,
              emitDeclarationOnly: false,
              sourceMap: false,
              inlineSourceMap: false,
            },
            reportDiagnostics: true,
          },
        );
        const errors =
          emitted.diagnostics?.filter(
            (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
          ) ?? [];
        // Proof: c26-build-transform-errors; injected fault failed `refuses captured TypeScript transform diagnostics before invoking Bun build`; the same named test(s) passed after restoration.
        if (errors.length > 0)
          throw new Error(
            'preparation source transform failed: ' +
              errors
                .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
                .join('; '),
          );
        // The producer owns the launcher's protected hashbang. Retaining a source hashbang
        // makes Bun preserve it and produces two directives when the protected one is added.
        module = {
          // Proof: c26-build-source-hashbang; injected fault failed `delivers the producer Bun pin and one protected launcher hashbang in selected roles`; the same named test(s) passed after restoration.
          bytes: Buffer.from(emitted.outputText.replace(/^#![^\n]*(?:\n|$)/u, '\n')),
          loader: 'js',
        };
      }
      assertNoOpaqueLoads(path, module, isWithin(modules, path));
      captured.set(path, module);
      if (module.loader === 'json') continue;
      for (const imported of new Bun.Transpiler({ loader: module.loader }).scanImports(
        module.bytes,
      )) {
        const selected = resolveImport(imported.path, path, imported.kind);
        imports.set(createImportKey(path, imported.path, imported.kind), selected);
        if (!selected.isExternal && !captured.has(selected.path)) pending.push(selected.path);
      }
    }
    const buildConfig = join(directory, '.puni-build-options.json');
    writeFileSync(
      buildConfig,
      JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext' } }),
      { flag: 'wx', mode: 0o444 },
    );
    async function buildRole(entry: string): Promise<Uint8Array> {
      const namespace = 'puni-captured-preparation',
        entrySpecifier = 'puni-captured-entry';
      const built = await Bun.build({
        entrypoints: [entrySpecifier],
        target: 'bun',
        format: 'esm',
        env: 'disable',
        allowUnresolved: [],
        tsconfig: buildConfig,
        // Proof: c26-build-pin; injected fault failed `delivers the producer Bun pin and one protected launcher hashbang in selected roles`; the same named test(s) passed after restoration.
        define: {
          __PUNI_LINT_BUN_VERSION__: JSON.stringify(Bun.version),
          __PUNI_PREPARATION_BUN_VERSION__: JSON.stringify(Bun.version),
        },
        plugins: [
          {
            name: namespace,
            setup(builder) {
              builder.onResolve({ filter: /[\s\S]*/ }, ({ path, importer, kind }) => {
                if (kind === 'entry-point-build' && importer === '' && path === entrySpecifier)
                  return { path: entry, namespace };
                const selected = imports.get(createImportKey(importer, path, kind));
                // Proof: c26-build-unplanned-import; injected fault failed `refuses an unplanned sealed import requested by the actual Bun bundler`; the same named test(s) passed after restoration.
                if (selected === undefined)
                  throw new Error('preparation bundler requested unplanned import: ' + path);
                return selected.isExternal
                  ? { path: selected.path, external: true }
                  : { path: selected.path, namespace };
              });
              builder.onLoad({ filter: /[\s\S]*/, namespace }, ({ path }) => {
                const module = captured.get(path);
                // Proof: c26-build-uncaptured-load; injected fault failed `refuses an unplanned sealed load requested by the actual Bun bundler`; the same named test(s) passed after restoration.
                if (module === undefined)
                  throw new Error('preparation bundler requested uncaptured bytes: ' + path);
                // Proof: c26-build-captured-loading; injected fault failed `uses captured source and dependency bytes after their materialized files change during build`; the same named test(s) passed after restoration.
                return { contents: module.bytes, loader: module.loader };
              });
            },
          },
        ],
      });
      // Proof: c26-build-success; injected fault failed `refuses unsuccessful role build output after actual Bun build settlement`; the same named test(s) passed after restoration.
      // Proof: c26-build-count; injected fault failed `refuses multiple role build output after actual Bun build settlement`; the same named test(s) passed after restoration.
      if (!built.success || built.outputs.length !== 1)
        throw new Error('preparation role build failed: ' + built.logs.map(String).join('; '));
      const artifact = built.outputs.at(0);
      // Proof: c26-build-output-presence; injected fault failed `refuses disappeared role build output after actual Bun build settlement`; the same named test(s) passed after restoration.
      if (artifact === undefined) throw new Error('preparation role build output disappeared');
      return new Uint8Array(await artifact.arrayBuffer());
    }
    const roleBytes: [Role, Uint8Array][] = [];
    for (const [role, entry] of roleEntries) {
      // Proof: c26-build-await-validator; injected fault failed `awaits the actual in-process build after interruption and starts no later role`; the same named test(s) passed after restoration.
      const bytes = await buildRole(entry);
      const afterBuild = readCancellation();
      // Proof: c26-build-after-validator; injected fault failed `awaits the actual in-process build after interruption and starts no later role`; the same named test(s) passed after restoration.
      if (afterBuild !== undefined) return afterBuild;
      // Proof: c26-build-hashbang; injected fault failed `delivers the producer Bun pin and one protected launcher hashbang in selected roles`; the same named test(s) passed after restoration.
      roleBytes.push([
        role,
        executableRoles.includes(role)
          ? Buffer.concat([Buffer.from(createShebang() + '\n'), bytes])
          : bytes,
      ]);
    }
    return {
      kind: 'built',
      // The private adapters supply each closed Role exactly once, and this settled loop maps
      // those captured entries one-to-one; Object.fromEntries widens that discharged key set.
      roleBytes: Object.fromEntries(roleBytes) as Readonly<Record<Role, Uint8Array>>,
      compilerTransforms: compilerTransforms.map((manifest) => ({ ...manifest })),
      notices: notices.map((notice) => ({ path: notice.path, bytes: notice.bytes.slice() })),
    };
  }
  const settled = await buildRoles().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let release: { cause: unknown } | undefined;
  try {
    // Proof: c26-build-release; injected fault failed `preserves build and subscription release failures ahead of recorded interruption`; the same named test(s) passed after restoration.
    unsubscribe();
  } catch (cause) {
    release = { cause };
  }
  if (settled.kind === 'rejected') {
    if (release !== undefined)
      throw new AggregateError(
        // Proof: c26-build-both-causes; injected fault failed `preserves build and subscription release failures ahead of recorded interruption`; the same named test(s) passed after restoration.
        [settled.cause, release.cause],
        'preparation build and release failed',
        { cause: release.cause },
      );
    throw settled.cause;
  }
  if (release !== undefined) throw release.cause;
  // Proof: c26-build-terminal; injected fault failed `honors the first interruption delivered during terminal build subscription release`; the same named test(s) passed after restoration.
  return readCancellation() ?? settled.value;
}
