import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import {
  canonicalize,
  decodeUtf8,
  isArray,
  isObject,
  type Json,
  type JsonObject,
  readConfiguration,
  readField,
  requireObject,
  requireString,
} from './configuration';
import type { Consumer, Context, Location, Runtime, Target } from './model';
import type { Entry, Workspace } from './workspace';
export type { Consumer } from './model';

const contextKeys = [
  'cwd',
  'working-directory',
  'shell',
  'env',
  'if',
  'runs-on',
  'with',
  'args',
  'forwardAllArgs',
  'parallel',
  'executor',
  'dependsOn',
  'strategy',
  'container',
  'services',
];
function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
function encodeLocation(location: Location): Json {
  return location.kind === 'file' ? { kind: 'file' } : { kind: 'property', path: location.path };
}
function readRuntime(word: string): Runtime {
  // Proof: c31c-consumer-interpreter-runtime; injected if (word === 'bun') return 'bun'; → if (word === 'bun') return 'unknown'; failed `discovers package scripts and bin without using a declaration list or filename extension filter`; restoration passed. Actual literal Bun invocation runtime binding; other runtime arms not independently proved by this row.
  if (word === 'bun') return 'bun';
  if (word === 'node') return 'node';
  if (word === 'bash' || word === 'sh') return 'shell';
  if (word === 'python' || word === 'python3') return 'python';
  return 'unknown';
}
function readShebang(entry: Entry): Runtime {
  if (entry.kind !== 'file' || entry.bytes[0] !== 35 || entry.bytes[1] !== 33) return 'unknown';
  const end = entry.bytes.indexOf(10),
    line = decodeUtf8(
      entry.bytes.subarray(2, end < 0 ? entry.bytes.length : end),
      entry.path,
    ).trim();
  const words = line.split(/\s+/u),
    first = words.at(0);
  if (first === undefined) throw new Error('script shebang has no interpreter: ' + entry.path);
  if (first === '/usr/bin/env' && words.length === 2) {
    const runtime = words.at(1);
    if (runtime === undefined) throw new Error('script shebang runtime is absent');
    // Proof: c31c-consumer-env-shebang-runtime; injected return readRuntime(runtime); → return 'unknown'; failed `surfaces executable unknown files and shebang programs independently of consumer declarations`; restoration passed. Observed shebang runtime binding for /usr/bin/env bun only; no complex env option support.
    return readRuntime(runtime);
  }
  return first.startsWith('/') ? readRuntime(posix.basename(first)) : 'unknown';
}

class Discovery {
  private readonly entries: ReadonlyMap<string, Entry>;
  private readonly sites = new Map<string, Consumer>();
  private readonly configurations = new Map<string, JsonObject>();
  private readonly actions = new Set<string>();
  private readonly visiting = new Set<string>();
  private defaults: JsonObject | undefined;
  constructor(workspace: Workspace) {
    this.entries = new Map(workspace.entries.map((entry) => [entry.path, entry]));
  }

  collect(): readonly Consumer[] {
    const nx = this.entries.get('nx.json');
    if (nx !== undefined)
      this.defaults =
        readField(this.readConfig(nx.path), 'targetDefaults') === undefined
          ? undefined
          : requireObject(
              readField(this.readConfig(nx.path), 'targetDefaults'),
              'nx.json targetDefaults',
            );
    for (const entry of this.entries.values()) {
      if (
        entry.kind === 'file' &&
        (entry.executable ||
          // Proof: c31c-consumer-index-executable; injected (entry.provenance.kind === 'tracked' && entry.provenance.mode === '100755') || →  failed `keeps tracked executable index evidence when current execute bits were removed`; restoration passed. Actual removed current execute bits leave only tracked executable evidence; no executable-suffix inference.
          (entry.provenance.kind === 'tracked' && entry.provenance.mode === '100755') ||
          // Proof: c31c-consumer-shebang-discovery; injected (entry.bytes[0] === 35 && entry.bytes[1] === 33)) → false) failed `surfaces executable unknown files and shebang programs independently of consumer declarations`; restoration passed. Actual non-executable shebang file isolates shebang-based discovery; no filename heuristic claim.
          (entry.bytes[0] === 35 && entry.bytes[1] === 33))
      )
        this.collectEntrypoint(entry);
      const name = posix.basename(entry.path);
      // Proof: c31c-consumer-package-family; injected if (name === 'package.json') this.collectPackage(entry.path); → if (false) this.collectPackage(entry.path); failed `discovers package scripts and bin without using a declaration list or filename extension filter`; restoration passed. Discovery omission/wiring fault; credit only actual named failure and restored matching pass, not complete syntax support.
      if (name === 'package.json') this.collectPackage(entry.path);
      // Proof: c31c-consumer-project-family; injected else if (name === 'project.json') this.collectProject(entry.path); → else if (false) this.collectProject(entry.path); failed `collects project commands object forms and configuration overrides with explicit inherited context layers`; restoration passed. Discovery omission/wiring fault; credit only actual named failure and restored matching pass, not complete syntax support.
      else if (name === 'project.json') this.collectProject(entry.path);
      // Proof: c31c-consumer-default-family; injected else if (entry.path === 'nx.json') this.collectDefaults(entry.path); → else if (false) this.collectDefaults(entry.path); failed `discovers embedded package Nx targets and root targetDefaults instead of assuming only project.json`; restoration passed. Discovery omission/wiring fault; credit only actual named failure and restored matching pass, not complete syntax support.
      else if (entry.path === 'nx.json') this.collectDefaults(entry.path);
      // Proof: c31c-consumer-workflow-family; injected else if (entry.path.startsWith('.github/workflows/') && /\.ya?ml$/u.test(name)) → else if (false) failed `discovers workflow run uses and referenced local composite run bodies in dot directories`; restoration passed. Discovery omission/wiring fault; credit only actual named failure and restored matching pass, not complete syntax support.
      else if (entry.path.startsWith('.github/workflows/') && /\.ya?ml$/u.test(name))
        this.collectWorkflow(entry.path);
    }
    return [...this.sites.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
  }

  private readConfig(path: string): JsonObject {
    const prior = this.configurations.get(path);
    if (prior !== undefined) return prior;
    const entry = this.entries.get(path);
    if (entry === undefined) throw new Error('script configuration is not captured: ' + path);
    const syntax = /\.ya?ml$/u.test(path)
      ? 'yaml'
      : posix.basename(path) === 'package.json'
        ? 'json'
        : 'jsonc';
    const configuration = readConfiguration(entry, syntax);
    this.configurations.set(path, configuration);
    return configuration;
  }
  private readContext(
    source: string,
    location: readonly (string | number)[],
    node: JsonObject,
  ): Context {
    const settings: [string, Json][] = [];
    for (const key of contextKeys) {
      const value = readField(node, key);
      if (value !== undefined) {
        if (key === 'cwd' || key === 'working-directory' || key === 'shell')
          requireString(value, source + ' ' + key);
        settings.push([key, value]);
      }
    }
    return { source, location, settings: Object.fromEntries(settings) };
  }
  private rootContext(source: string, cwd: string): Context {
    return { source, location: [], settings: { cwd } };
  }
  private readCwd(
    context: readonly Context[],
  ):
    | { readonly kind: 'path'; readonly path: string }
    | { readonly kind: 'unresolved'; readonly reason: string } {
    let cwd = '';
    for (const layer of context)
      for (const key of ['cwd', 'working-directory']) {
        const value = readField(layer.settings, key);
        if (value === undefined) continue;
        const selected =
          typeof value === 'string' && value === ''
            ? ''
            : requireString(value, layer.source + ' cwd');
        if (selected.includes('{') || selected.includes('}') || posix.isAbsolute(selected))
          return { kind: 'unresolved', reason: 'dynamic or external working directory' };
        cwd = posix.normalize(selected);
      }
    if (cwd === '..' || cwd.startsWith('../'))
      return { kind: 'unresolved', reason: 'working directory is outside the captured workspace' };
    return { kind: 'path', path: cwd === '.' ? '' : cwd };
  }
  private readTarget(
    cwd: string,
    operand: string,
    purpose: 'program' | 'configuration' = 'program',
  ): Target {
    const path = posix.isAbsolute(operand) ? operand : posix.normalize(posix.join(cwd, operand));
    // Proof: c31c-consumer-target-outside; injected if (posix.isAbsolute(path) || path === '..' || path.startsWith('../')) → if (false) failed `retains ignored missing outside and symlink targets as boundaries instead of silently dropping their consumer`; restoration passed. Outside becomes unavailable under mutant; exact boundary classification, not admission.
    if (posix.isAbsolute(path) || path === '..' || path.startsWith('../'))
      return { usage: purpose, kind: 'outside', path };
    const segments = path.split('/');
    for (let depth = 1; depth < segments.length; depth++) {
      const ancestor = segments.slice(0, depth).join('/'),
        boundary = this.entries.get(ancestor);
      // Proof: c31c-consumer-target-ancestor; injected if (boundary !== undefined && (boundary.kind === 'symlink' || boundary.kind === 'gitlink')) → if (false) failed `preserves a captured symlink ancestor as the boundary for a referenced descendant`; restoration passed. Returns ancestor symlink boundary rather than missing descendant; classification, not independent unresolved admission.
      if (boundary !== undefined && (boundary.kind === 'symlink' || boundary.kind === 'gitlink'))
        return { usage: purpose, kind: boundary.kind, path: ancestor };
    }
    const entry = this.entries.get(path);
    if (entry === undefined)
      return { usage: purpose, kind: 'unavailable', path, reason: 'missing-or-ignored' };
    if (entry.kind !== 'file') return { usage: purpose, kind: entry.kind, path };
    // Proof: c31c-consumer-program-registration; injected if (purpose === 'program') this.collectEntrypoint(entry); → void purpose; failed `reconciles exact discovered identities with caller evidence and required ownership metadata`; restoration passed. Program registration is asserted by actual inventory fixture graph, not package target-only assertions.
    // Proof: c31c-consumer-config-registration; injected if (purpose === 'program') this.collectEntrypoint(entry); → this.collectEntrypoint(entry); failed `treats local action metadata as configuration references rather than executable program candidates`; restoration passed. Actual action metadata must not become an executable candidate; no interpreter inference from extension.
    if (purpose === 'program') this.collectEntrypoint(entry);
    // Proof: c31c-consumer-reference-usage; injected return { usage: purpose, kind: 'file', path, sha256: entry.sha256 }; → return { usage: 'program', kind: 'file', path, sha256: entry.sha256 }; failed `keeps program versus configuration reference usage explicit for later caller validation`; restoration passed. Target usage boundary exercised on program and local metadata; inventory caller filtering needs its own negative.
    return { usage: purpose, kind: 'file', path, sha256: entry.sha256 };
  }
  private emit(
    source: string,
    location: Location,
    kind: Consumer['kind'],
    body: Consumer['body'],
    observedRuntime: Runtime,
    invocation: Consumer['invocation'],
    context: readonly Context[],
    targets: readonly Target[],
    reason?: string,
  ): void {
    const id = JSON.stringify([source, encodeLocation(location)]);
    if (this.sites.has(id)) throw new Error('script execution location is duplicated: ' + id);
    // Proof: c31c-consumer-target-resolution; injected targets.some((target) => target.kind !== 'file') → false failed `retains ignored missing outside and symlink targets as boundaries instead of silently dropping their consumer`; restoration passed. Otherwise literal missing target becomes incorrectly resolved; test explicitly checks missing resolution.
    const resolution: Consumer['resolution'] =
      reason !== undefined
        ? { kind: 'unresolved', reason }
        : targets.some((target) => target.kind !== 'file')
          ? { kind: 'unresolved', reason: 'local target is outside captured regular files' }
          : { kind: 'resolved' };
    const identity: Json = {
      source,
      location: encodeLocation(location),
      kind,
      body,
      observedRuntime,
      invocation,
      // Proof: c31c-consumer-context-identity; injected context: context.map((layer) => ({ source: layer.source, location: layer.location, settings: layer.s → context: [], failed `retains caller environment and resolves local action metadata at the workspace root despite run cwd`; restoration passed. Only inherited environment changes while body/target remain stable, isolating context inclusion in digest.
      context: context.map((layer) => ({
        source: layer.source,
        location: layer.location,
        settings: layer.settings,
      })),
      targets,
      resolution,
    };
    const bodyDigest = body.kind === 'file' ? body.sha256 : digest(body.text);
    this.sites.set(id, {
      id,
      source,
      location,
      kind,
      body,
      bodyDigest,
      digest: digest(JSON.stringify(canonicalize(identity))),
      observedRuntime,
      invocation,
      context,
      targets,
      resolution,
    });
  }
  private collectEntrypoint(entry: Entry): void {
    if (entry.kind !== 'file')
      throw new Error('script entrypoint is not a regular captured file: ' + entry.path);
    const location: Location = { kind: 'file' },
      id = JSON.stringify([entry.path, encodeLocation(location)]);
    if (this.sites.has(id)) return;
    this.emit(
      entry.path,
      location,
      'entrypoint',
      { kind: 'file', sha256: entry.sha256 },
      readShebang(entry),
      { kind: 'unresolved', reason: 'file candidate has no invocation of its own' },
      [],
      [],
    );
  }
  private readContextBoundary(context: readonly Context[]): string | undefined {
    for (const layer of context) {
      const shell = readField(layer.settings, 'shell');
      if (
        // Proof: c31c-consumer-custom-shell; injected shell !== undefined && !['bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes( → false && !['bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes( failed `retains an explicit custom workflow shell as an unresolved program boundary`; restoration passed. Otherwise valid captured Bun operand isolates custom shell adapter requirement.
        shell !== undefined &&
        !['bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes(
          requireString(shell, layer.source + ' shell'),
        )
      )
        return 'custom shell invocation requires a supported adapter';
      const environment = readField(layer.settings, 'env');
      if (environment === undefined) continue;
      // Proof: c31c-consumer-environment-mapping; injected !isObject(environment) → false failed `retains a dynamic environment mapping as unresolved execution context`; restoration passed. Dynamic environment map remains explicit unsupported context rather than being silently treated as empty.
      if (!isObject(environment)) return 'dynamic environment mapping requires a supported adapter';
      for (const key of ['NODE_OPTIONS', 'BUN_OPTIONS', 'BUN_INSPECT_PRELOAD']) {
        const setting = readField(environment, key);
        // Proof: c31c-consumer-startup-environment; injected if (setting !== undefined && setting !== '') → if (false) failed `retains startup program options in captured environment as unresolved program indirection`; restoration passed. NODE_OPTIONS value reaches otherwise valid captured Bun command; sibling BUN_OPTIONS/BUN_INSPECT_PRELOAD keys are same grouped guard, not separate observed tests.
        if (setting !== undefined && setting !== '')
          return 'startup program environment requires a supported adapter';
      }
    }
    return undefined;
  }
  private collectCommand(
    source: string,
    path: readonly (string | number)[],
    value: Json | undefined,
    context: readonly Context[],
  ): void {
    const text = requireString(value, source + ' command'),
      first = text.trimStart().split(/\s+/u).at(0);
    if (first === undefined) throw new Error('script command has no first word');
    const runtime = readRuntime(first),
      location: Location = { kind: 'property', path };
    // Proof: c31c-consumer-literal-syntax; injected !/^[A-Za-z0-9_./:@=+,-]+(?:[ \t]+[A-Za-z0-9_./:@=+,-]+)*$/u.test(text) → false failed `keeps an otherwise captured syntax or interpreter indirection unresolved "bun first.xyz && bun second.xyz"` and 1 other named controls; restoration passed. Captured first operands prevent missing-target fallback from masking syntax admission; interpret exact selected failures and preserve unresolved reasons.
    if (!/^[A-Za-z0-9_./:@=+,-]+(?:[ \t]+[A-Za-z0-9_./:@=+,-]+)*$/u.test(text)) {
      this.emit(
        source,
        location,
        'command',
        { kind: 'command', text },
        runtime,
        { kind: 'unresolved', reason: 'compound quoted or dynamic command syntax' },
        context,
        [],
        'command needs a supported literal invocation',
      );
      return;
    }
    const argv = text.split(/[ \t]+/u),
      command = argv.at(0),
      operand = argv.at(1),
      invocation: Consumer['invocation'] = { kind: 'argv', argv };
    if (command === undefined) throw new Error('script literal invocation has no executable');
    const boundary = this.readContextBoundary(context);
    if (boundary !== undefined) {
      this.emit(
        source,
        location,
        'command',
        { kind: 'command', text },
        runtime,
        invocation,
        context,
        [],
        boundary,
      );
      return;
    }
    const cwd = this.readCwd(context);
    if (cwd.kind === 'unresolved') {
      this.emit(
        source,
        location,
        'command',
        { kind: 'command', text },
        runtime,
        invocation,
        context,
        [],
        cwd.reason,
      );
      return;
    }
    if (runtime !== 'unknown') {
      if (
        // Proof: c31c-consumer-interpreter-indirection; injected operand === undefined || operand.startsWith('-') || (command === 'bun' && [ 'run', 'test', 'x', 'ins → false failed `keeps an otherwise captured syntax or interpreter indirection unresolved "node -e literal"` and 1 other named controls; restoration passed. Captured -e/run operands distinguish the explicit interpreter/builtin fence from later missing-target resolution.
        operand === undefined ||
        operand.startsWith('-') ||
        (command === 'bun' &&
          [
            'run',
            'test',
            'x',
            'install',
            'build',
            'add',
            'remove',
            'update',
            'create',
            'init',
          ].includes(operand))
      ) {
        this.emit(
          source,
          location,
          'command',
          { kind: 'command', text },
          runtime,
          invocation,
          context,
          [],
          'interpreter option builtin or script indirection requires its own adapter',
        );
        return;
      }
      this.emit(
        source,
        location,
        'command',
        { kind: 'command', text },
        runtime,
        invocation,
        context,
        [this.readTarget(cwd.path, operand)],
      );
      return;
    }
    if (command.startsWith('./') || command.startsWith('../') || command.startsWith('/')) {
      this.emit(
        source,
        location,
        'command',
        { kind: 'command', text },
        runtime,
        invocation,
        context,
        [this.readTarget(cwd.path, command)],
        'direct executable runtime requires entrypoint admission',
      );
      return;
    }
    // Proof: c31c-consumer-git-wrapper; injected const isExternal = [ 'echo', → const isExternal = [ 'git', 'echo', failed `does not classify a Git execution wrapper as a resolved external operation`; restoration passed. Real Git foreach spelling remains unresolved; no general parsing of Git subcommands.
    const isExternal = [
      'echo',
      'printf',
      'true',
      'false',
      'date',
      'ls',
      'pwd',
      'mkdir',
      'rm',
      'cp',
      'mv',
      'chmod',
      'touch',
    ].includes(command);
    this.emit(
      source,
      location,
      'command',
      { kind: 'command', text },
      isExternal ? 'external' : runtime,
      invocation,
      context,
      [],
      // Proof: c31c-consumer-unknown-wrapper; injected isExternal ? undefined : 'wrapper or external executable requires a supported adapter' → undefined failed `keeps quoted compound dynamic and interpreter inline invocations explicit unresolved boundaries`; restoration passed. Existing env wrapper has no local targets: removes unresolved reason and actually admits wrapper. Other grouped cases may remain unresolved.
      isExternal ? undefined : 'wrapper or external executable requires a supported adapter',
    );
  }
  private collectFileReference(
    source: string,
    path: readonly (string | number)[],
    value: Json | undefined,
    context: readonly Context[],
    runtime: Runtime,
    reason?: string,
    purpose: 'program' | 'configuration' = 'program',
  ): void {
    const text = requireString(value, source + ' file reference'),
      cwd = this.readCwd(context);
    if (cwd.kind === 'unresolved' || text.includes('{')) {
      this.emit(
        source,
        { kind: 'property', path },
        'reference',
        { kind: 'reference', text },
        runtime,
        { kind: 'unresolved', reason: 'dynamic file reference' },
        context,
        [],
        'dynamic file reference',
      );
      return;
    }
    this.emit(
      source,
      { kind: 'property', path },
      'reference',
      { kind: 'reference', text },
      runtime,
      { kind: 'argv', argv: [text] },
      context,
      [this.readTarget(cwd.path, text, purpose)],
      reason,
    );
  }
  private collectPackage(source: string): void {
    const configuration = this.readConfig(source),
      context = [
        // Proof: c31c-consumer-package-cwd; injected this.rootContext(source, posix.dirname(source) === '.' ? '' : posix.dirname(source)), → this.rootContext(source, ''), failed `discovers package scripts and bin without using a declaration list or filename extension filter`; restoration passed. Nested package program/bin resolution uses package-relative cwd.
        this.rootContext(source, posix.dirname(source) === '.' ? '' : posix.dirname(source)),
      ],
      scripts = readField(configuration, 'scripts'),
      bin = readField(configuration, 'bin'),
      nx = readField(configuration, 'nx');
    if (scripts !== undefined)
      for (const [name, command] of Object.entries(requireObject(scripts, source + ' scripts')))
        this.collectCommand(source, ['scripts', name], command, context);
    // Proof: c31c-consumer-package-bin; injected if (bin !== undefined) { → if (false) { failed `discovers package scripts and bin without using a declaration list or filename extension filter`; restoration passed. Object bin roster is reached; string bin branch not independently covered.
    if (bin !== undefined) {
      if (typeof bin === 'string')
        this.collectFileReference(source, ['bin'], bin, context, 'unknown');
      else
        for (const [name, target] of Object.entries(requireObject(bin, source + ' bin')))
          this.collectFileReference(source, ['bin', name], target, context, 'unknown');
    }
    // Proof: c31c-consumer-package-nx; injected if (nx !== undefined) { → if (false) { failed `discovers embedded package Nx targets and root targetDefaults instead of assuming only project.json`; restoration passed. Discovery omission/wiring fault; credit only actual named failure and restored matching pass, not complete syntax support.
    if (nx !== undefined) {
      const targets = readField(requireObject(nx, source + ' nx'), 'targets');
      if (targets !== undefined)
        this.collectTargets(
          source,
          ['nx', 'targets'],
          requireObject(targets, source + ' nx targets'),
        );
    }
  }
  private collectProject(source: string): void {
    const targets = readField(this.readConfig(source), 'targets');
    if (targets !== undefined)
      this.collectTargets(source, ['targets'], requireObject(targets, source + ' targets'));
  }
  private collectDefaults(source: string): void {
    if (this.defaults !== undefined)
      this.collectTargets(source, ['targetDefaults'], this.defaults, true);
  }
  private collectTargets(
    source: string,
    path: readonly (string | number)[],
    targets: JsonObject,
    isDefault = false,
  ): void {
    for (const [name, value] of Object.entries(targets)) {
      const target = requireObject(value, source + ' target ' + name),
        targetPath = [...path, name],
        context: Context[] = [this.rootContext(source, '')];
      if (!isDefault && this.defaults !== undefined) {
        const executor = readField(target, 'executor'),
          executorDefault =
            typeof executor === 'string' ? readField(this.defaults, executor) : undefined,
          inheritedName =
            // Proof: c31c-consumer-executor-default; injected executorDefault === undefined ? name : requireString(executor, source + ' executor'); → name; failed `includes executor-key Nx defaults in execution identity rather than only target-name defaults`; restoration passed. Existing executor-key default takes precedence over absent target-name default; not both-present precedence proof.
            executorDefault === undefined ? name : requireString(executor, source + ' executor');
        const inherited = readField(this.defaults, inheritedName);
        if (inherited !== undefined) {
          const definition = requireObject(inherited, 'nx.json targetDefaults ' + inheritedName);
          context.push(this.readContext('nx.json', ['targetDefaults', inheritedName], definition));
          const options = readField(definition, 'options');
          // Proof: c31c-consumer-inherited-options; injected if (options !== undefined) context.push( → if (false) context.push( failed `includes executor-key Nx defaults in execution identity rather than only target-name defaults`; restoration passed. Inherited options environment changes identity; top-level inherited context remains.
          if (options !== undefined)
            context.push(
              this.readContext(
                'nx.json',
                ['targetDefaults', inheritedName, 'options'],
                requireObject(options, 'Nx inherited options'),
              ),
            );
        }
      }
      if (
        // Proof: c31c-consumer-glob-filtered-default; injected isDefault && (['*', '?', '[', ']', '(', ')', '{', '}', '!'].some((symbol) => name.includes(symbol))  → false failed `keeps glob and filtered Nx defaults as explicit unsupported boundaries even without command fields`; restoration passed. The first failure is the missing verify-* discovery site. The later filtered build assertion is not reached.
        isDefault &&
        (['*', '?', '[', ']', '(', ')', '{', '}', '!'].some((symbol) => name.includes(symbol)) ||
          readField(target, 'filter') !== undefined)
      )
        this.emit(
          source,
          { kind: 'property', path: targetPath },
          'reference',
          { kind: 'reference', text: JSON.stringify(canonicalize(target)) },
          'unknown',
          { kind: 'unresolved', reason: 'glob or filtered Nx defaults require an adapter' },
          context,
          [],
          'glob or filtered Nx defaults require an adapter',
        );
      context.push(this.readContext(source, targetPath, target));
      this.collectCommandFields(source, targetPath, target, context);
      const options = readField(target, 'options');
      if (options !== undefined) {
        const fields = requireObject(options, source + ' options');
        // Proof: c31c-consumer-options-context; injected context.push(this.readContext(source, [...targetPath, 'options'], fields)); → void fields; failed `collects project commands object forms and configuration overrides with explicit inherited context layers`; restoration passed. The first failure changes the base cwd target. The later inherited-environment and strict-layer assertions are not reached.
        context.push(this.readContext(source, [...targetPath, 'options'], fields));
        this.collectCommandFields(source, [...targetPath, 'options'], fields, context);
      }
      const ownOptions =
        options === undefined ? undefined : requireObject(options, source + ' options');
      const hasCommand =
        readField(target, 'command') !== undefined ||
        readField(target, 'commands') !== undefined ||
        (ownOptions !== undefined &&
          (readField(ownOptions, 'command') !== undefined ||
            readField(ownOptions, 'commands') !== undefined));
      // Proof: c31c-consumer-inherited-command; injected if (!isDefault && !hasCommand) → if (false) failed `surfaces a project invocation inherited only from Nx defaults with overridden cwd`; restoration passed. Inherited-only project must remain visible unresolved even when defaults separately contain an executable command.
      if (!isDefault && !hasCommand)
        this.emit(
          source,
          { kind: 'property', path: targetPath },
          'reference',
          { kind: 'reference', text: 'inherited or implicit Nx command' },
          'unknown',
          { kind: 'unresolved', reason: 'inherited or implicit Nx invocation requires expansion' },
          context,
          [],
          'inherited or implicit Nx invocation requires expansion',
        );
      const configurations = readField(target, 'configurations');
      if (configurations !== undefined)
        for (const [configurationName, override] of Object.entries(
          requireObject(configurations, source + ' configurations'),
        )) {
          const fields = requireObject(override, source + ' configuration ' + configurationName),
            location = [...targetPath, 'configurations', configurationName],
            layers = [...context, this.readContext(source, location, fields)];
          // Proof: c31c-consumer-configuration-commands; injected this.collectCommandFields(source, location, fields, layers); → void layers; failed `collects project commands object forms and configuration overrides with explicit inherited context layers`; restoration passed. Actual command-bearing configuration override discovery.
          this.collectCommandFields(source, location, fields, layers);
          if (
            // Proof: c31c-consumer-commandless-variant; injected readField(fields, 'command') === undefined && readField(fields, 'commands') === undefined → false failed `retains commandless Nx overrides and custom executors as unresolved invocation boundaries`; restoration passed. Commandless configuration override must remain an explicit inherited-invocation site; missing-site failure is the discovery oracle.
            readField(fields, 'command') === undefined &&
            readField(fields, 'commands') === undefined
          )
            this.emit(
              source,
              { kind: 'property', path: location },
              'reference',
              { kind: 'reference', text: 'inherited Nx command variant' },
              'unknown',
              { kind: 'unresolved', reason: 'inherited Nx command variant requires expansion' },
              layers,
              [],
              'inherited Nx command variant requires expansion',
            );
        }
      const executor = readField(target, 'executor');
      // Proof: c31c-consumer-custom-executor; injected executor !== undefined && executor !== 'nx:run-commands' → false failed `retains commandless Nx overrides and custom executors as unresolved invocation boundaries`; restoration passed. Unrecognized executor must remain a discovered unresolved reference despite an otherwise supported literal command.
      if (executor !== undefined && executor !== 'nx:run-commands')
        this.emit(
          source,
          { kind: 'property', path: [...targetPath, 'executor'] },
          'reference',
          { kind: 'reference', text: requireString(executor, source + ' executor') },
          'unknown',
          { kind: 'unresolved', reason: 'executor requires its own adapter' },
          context,
          [],
          'executor requires its own adapter',
        );
    }
  }
  private collectCommandFields(
    source: string,
    path: readonly (string | number)[],
    fields: JsonObject,
    context: readonly Context[],
  ): void {
    const command = readField(fields, 'command'),
      commands = readField(fields, 'commands');
    if (command !== undefined) this.collectCommand(source, [...path, 'command'], command, context);
    if (commands === undefined) return;
    if (!isArray(commands)) throw new Error('script Nx commands must be an array: ' + source);
    for (const [index, commandEntry] of commands.entries()) {
      if (typeof commandEntry === 'string')
        this.collectCommand(source, [...path, 'commands', index], commandEntry, context);
      else {
        const object = requireObject(commandEntry, source + ' commands entry'),
          location = [...path, 'commands', index];
        // Proof: c31c-consumer-command-object; injected this.collectCommand(source, [...location, 'command'], readField(object, 'command'), [ ...context, th → void object; failed `collects project commands object forms and configuration overrides with explicit inherited context layers`; restoration passed. Object commands array entry discovery; forwardAllArgs identity not independently asserted.
        this.collectCommand(source, [...location, 'command'], readField(object, 'command'), [
          ...context,
          this.readContext(source, location, object),
        ]);
      }
    }
  }
  private appendDefaults(
    source: string,
    path: readonly (string | number)[],
    node: JsonObject,
    context: readonly Context[],
  ): readonly Context[] {
    const defaults = readField(node, 'defaults');
    // Proof: c31c-consumer-workflow-defaults; injected if (defaults === undefined) return context; → if (true) return context; failed `discovers workflow run uses and referenced local composite run bodies in dot directories`; restoration passed. Workflow working-directory default reaches regular captured first target; job-level default variant not independently proved.
    if (defaults === undefined) return context;
    const run = readField(requireObject(defaults, source + ' defaults'), 'run');
    if (run === undefined) return context;
    return [
      ...context,
      this.readContext(
        source,
        [...path, 'defaults', 'run'],
        requireObject(run, source + ' defaults.run'),
      ),
    ];
  }
  private collectWorkflow(source: string): void {
    const configuration = this.readConfig(source),
      context = this.appendDefaults(source, [], configuration, [
        this.rootContext(source, ''),
        this.readContext(source, [], configuration),
      ]),
      jobs = requireObject(readField(configuration, 'jobs'), source + ' jobs');
    for (const [name, value] of Object.entries(jobs)) {
      const job = requireObject(value, source + ' job ' + name),
        path = ['jobs', name],
        layers = this.appendDefaults(source, path, job, [
          ...context,
          // Proof: c31c-consumer-workflow-job-context; injected this.readContext(source, path, job), → this.rootContext(source, ''), failed `discovers workflow run uses and referenced local composite run bodies in dot directories`; restoration passed. The first failure changes target cwd tools/first.xyz to first.xyz. The later environment assertion is not reached; no independently observed environment-retention failure is claimed.
          this.readContext(source, path, job),
        ]),
        uses = readField(job, 'uses'),
        steps = readField(job, 'steps');
      if (uses !== undefined) this.collectUses(source, [...path, 'uses'], uses, layers, true);
      if (steps !== undefined) this.collectSteps(source, [...path, 'steps'], steps, layers, false);
      if (uses === undefined && steps === undefined)
        throw new Error('script workflow job has no execution form: ' + source + ' ' + name);
    }
  }
  private collectSteps(
    source: string,
    path: readonly (string | number)[],
    steps: Json,
    context: readonly Context[],
    composite: boolean,
  ): void {
    // Proof: c31c-consumer-workflow-step-array; injected !isArray(steps) → false failed `refuses an existing unsupported workflow form .github/workflows/ci.yml "jobs:\n  x:\n    steps: 12\n"`; restoration passed. Explicit malformed steps-array diagnostic can remain guarded by native iteration failure after removal; classification only.
    if (!isArray(steps)) throw new Error('script workflow steps must be an array: ' + source);
    for (const [index, value] of steps.entries()) {
      const step = requireObject(value, source + ' step'),
        location = [...path, index],
        // Proof: c31c-consumer-step-context; injected layers = [...context, this.readContext(source, location, step)], → layers = [...context], failed `discovers workflow run uses and referenced local composite run bodies in dot directories`; restoration passed. Composite step working-directory resolves second captured target; no independent shell metadata identity claim.
        layers = [...context, this.readContext(source, location, step)],
        run = readField(step, 'run'),
        uses = readField(step, 'uses');
      // Proof: c31c-consumer-workflow-step-union; injected (run === undefined) === (uses === undefined) → false failed `refuses an existing unsupported workflow form .github/workflows/ci.yml "jobs:\n  x:\n    steps:\n      - run: bun ./safe.xyz\n        uses: external/action@v1\n"`; restoration passed. Both/neither run/uses cases may meet different later refusals; count only actual reached diagnostics/admission.
      if ((run === undefined) === (uses === undefined))
        throw new Error('script workflow step requires exactly one run or uses field: ' + source);
      if (run !== undefined) {
        // Proof: c31c-consumer-composite-shell; injected if (composite) requireString(readField(step, 'shell'), source + ' composite shell'); → void composite; failed `refuses an existing unsupported workflow form .github/actions/local/action.yml "runs:\n  using: composite\n  steps:\n    - run: bun ./safe.xyz\n"`; restoration passed. Composite missing-shell case is otherwise valid Bun execution; mandatory provider shell metadata cannot disappear.
        if (composite) requireString(readField(step, 'shell'), source + ' composite shell');
        this.collectCommand(source, [...location, 'run'], run, layers);
      } else this.collectUses(source, [...location, 'uses'], uses, layers, false);
    }
  }
  private collectUses(
    source: string,
    path: readonly (string | number)[],
    value: Json | undefined,
    context: readonly Context[],
    reusable: boolean,
  ): void {
    const text = requireString(value, source + ' uses');
    if (!text.startsWith('./')) {
      const supported =
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[A-Za-z0-9_.-]+$/u.test(text);
      this.emit(
        source,
        { kind: 'property', path },
        'reference',
        { kind: 'reference', text },
        'external',
        { kind: 'unresolved', reason: 'provider action reference' },
        context,
        [],
        supported ? undefined : 'dynamic or unsupported provider reference',
      );
      return;
    }
    const target = posix.normalize(text);
    if (target.startsWith('../')) {
      this.emit(
        source,
        { kind: 'property', path },
        'reference',
        { kind: 'reference', text },
        'unknown',
        { kind: 'unresolved', reason: 'local action outside workspace' },
        context,
        [{ kind: 'outside', path: target, usage: 'configuration' }],
        'local action outside workspace',
      );
      return;
    }
    if (reusable) {
      this.collectFileReference(
        source,
        path,
        target,
        [...context, this.rootContext(source, '')],
        'unknown',
        'reusable workflow indirection requires its own adapter',
        'configuration',
      );
      return;
    }
    const choices = [target + '/action.yml', target + '/action.yaml'].filter((candidate) =>
      this.entries.has(candidate),
    );
    // Proof: c31c-consumer-action-ambiguity; injected if (choices.length > 1) throw new Error('script local action metadata is ambiguous: ' + target); → void choices; failed `refuses ambiguous local action metadata instead of choosing a preferred extension`; restoration passed. Both valid metadata files supplied; choosing preferred file would otherwise succeed.
    if (choices.length > 1) throw new Error('script local action metadata is ambiguous: ' + target);
    const selected = choices.at(0);
    if (selected === undefined) {
      this.emit(
        source,
        { kind: 'property', path },
        'reference',
        { kind: 'reference', text },
        'unknown',
        { kind: 'unresolved', reason: 'local action metadata is missing' },
        context,
        [
          {
            kind: 'unavailable',
            path: target,
            reason: 'missing-or-ignored',
            usage: 'configuration',
          },
        ],
        'local action metadata is missing',
      );
      return;
    }
    // Proof: c31c-consumer-action-expansion; injected this.collectAction(selected); → void selected; failed `discovers workflow run uses and referenced local composite run bodies in dot directories`; restoration passed. Referenced local composite run bodies must be independently discovered.
    this.collectAction(selected);
    this.collectFileReference(
      source,
      path,
      // Proof: c31c-consumer-action-cwd; injected selected, [...context, this.rootContext(source, '')], → selected, context, failed `retains caller environment and resolves local action metadata at the workspace root despite run cwd`; restoration passed. Action metadata resolves at workspace root despite workflow run cwd; captured caller environment retained separately.
      selected,
      [...context, this.rootContext(source, '')],
      'external',
      undefined,
      'configuration',
    );
  }
  private collectAction(source: string): void {
    // Proof: c31c-consumer-action-cycle; injected if (this.visiting.has(source)) → if (false) failed `refuses a local composite action cycle with the named configuration error`; restoration passed. Named cycle diagnostic only: recursive graph may still throw stack RangeError; reject any native crash/test timeout as proof.
    if (this.visiting.has(source))
      throw new Error('script local action reference cycle: ' + source);
    if (this.actions.has(source)) return;
    this.visiting.add(source);
    try {
      const configuration = this.readConfig(source),
        runs = requireObject(readField(configuration, 'runs'), source + ' runs'),
        using = requireString(readField(runs, 'using'), source + ' runs.using');
      if (using === 'composite')
        this.collectSteps(
          source,
          ['runs', 'steps'],
          this.requireSteps(runs, source),
          [this.rootContext(source, '')],
          true,
        );
      else if (/^node[0-9]+$/u.test(using)) {
        const context = [this.rootContext(source, posix.dirname(source))];
        // Proof: c31c-consumer-node-action-main; injected this.collectFileReference( source, ['runs', 'main'], readField(runs, 'main'), context, 'node', ); → void context; failed `surfaces reusable workflows and Node or Docker local actions as explicit execution boundaries`; restoration passed. Actual Node action main body discovered; no Node execution claimed.
        this.collectFileReference(
          source,
          ['runs', 'main'],
          readField(runs, 'main'),
          context,
          'node',
        );
        // Proof: c31c-consumer-node-action-hooks; injected for (const key of ['pre', 'post']) → for (const key of []) failed `surfaces reusable workflows and Node or Docker local actions as explicit execution boundaries`; restoration passed. Existing post fixture proves hook iteration wiring, not a separate reached pre fixture.
        for (const key of ['pre', 'post']) {
          const target = readField(runs, key);
          if (target !== undefined)
            this.collectFileReference(source, ['runs', key], target, context, 'node');
        }
      } else if (using === 'docker')
        this.collectFileReference(
          source,
          ['runs', 'image'],
          readField(runs, 'image'),
          [this.rootContext(source, posix.dirname(source))],
          'external',
          // Proof: c31c-consumer-docker-boundary; injected 'Docker action entrypoint requires the container collector', → undefined, failed `surfaces reusable workflows and Node or Docker local actions as explicit execution boundaries`; restoration passed. Captured Dockerfile exists: removing unresolved boundary incorrectly resolves configuration reference; not container-body coverage.
          'Docker action entrypoint requires the container collector',
          'configuration',
        );
      else
        // Proof: c31c-consumer-unsupported-action; injected throw new Error( 'script action uses an unsupported execution form: ' + source + ' ' + using, ); → void using; failed `refuses an existing unsupported workflow form .github/actions/local/action.yml "runs:\n  using: unsupported\n"`; restoration passed. Unsupported runs.using must not yield a resolved metadata edge with no executable definition.
        throw new Error(
          'script action uses an unsupported execution form: ' + source + ' ' + using,
        );
      this.actions.add(source);
    } finally {
      this.visiting.delete(source);
    }
  }
  private requireSteps(runs: JsonObject, source: string): Json {
    const steps = readField(runs, 'steps');
    if (steps === undefined) throw new Error('script composite action steps are absent: ' + source);
    return steps;
  }
}

/**
 * Discover only the initial entrypoint/package/Nx/GitHub consumer families from captured bytes.
 * IDs preserve tagged structural locations; digests include canonical context and target identity.
 * Literal argv syntax never proves wrapper/indirection resolution. Unsupported forms remain
 * explicit blockers, and declarations cannot choose this discovery universe. This is neither
 * complete generated/remote/infra coverage nor a certificate that the observed programs run on Bun.
 */
export function discoverConsumers(workspace: Workspace): readonly Consumer[] {
  return new Discovery(workspace).collect();
}
