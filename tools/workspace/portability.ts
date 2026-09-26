import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

type Fields = Record<string, unknown>;
const targets = ['test', 'lint', 'typecheck', 'build'];
const sharedPackages = ['nx', 'typescript', 'bun-types', 'prettier'];
const compilerKeys = ['strict', 'target', 'module', 'moduleResolution'];

function requireRecord(value: unknown, label: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Invalid ${label}: expected object`);
  // JSON and object boundaries have been checked; values remain unknown until parsed.
  return value as Fields;
}
function readRecord(root: string, path: string): Fields {
  const parsed: unknown = JSON.parse(readFileSync(join(root, path), 'utf8'));
  return requireRecord(parsed, path);
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Invalid ${label}: expected nonempty string`);
  return value;
}
function writeRecord(root: string, path: string, fields: Fields): void {
  writeFileSync(join(root, path), `${JSON.stringify(fields, null, 2)}\n`);
}
function canonicalize(value: unknown): string {
  if (value === undefined) throw new Error('Missing baseline value');
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalize(field)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function readDependencies(manifest: Fields, key: string): Fields {
  // Both package.json dependency sections are optional by its contract.
  return manifest[key] === undefined ? {} : requireRecord(manifest[key], key);
}
function readBaseline(root: string): Fields {
  const manifest = readRecord(root, 'package.json');
  const dependencies = {
    ...readDependencies(manifest, 'dependencies'),
    ...readDependencies(manifest, 'devDependencies'),
  };
  const pins: Fields = {};
  for (const name of sharedPackages) pins[name] = requireString(dependencies[name], name);
  const packageManager =
    manifest['packageManager'] === undefined
      ? `bun@${readFileSync(join(root, '.bun-version'), 'utf8').trim()}`
      : requireString(manifest['packageManager'], 'packageManager');
  if (!/^bun@\d+\.\d+\.\d+$/.test(packageManager))
    throw new Error('A pinned Bun packageManager is required');
  const defaults = requireRecord(readRecord(root, 'nx.json')['targetDefaults'], 'targetDefaults');
  const semantics: Fields = {};
  for (const target of targets) {
    const configuration = requireRecord(defaults[target], target);
    if (typeof configuration['cache'] !== 'boolean')
      throw new Error(`Missing cache policy: ${target}`);
    semantics[target] = { cache: configuration['cache'] };
    if (target === 'build') {
      if (
        !Array.isArray(configuration['dependsOn']) ||
        !configuration['dependsOn'].every((value) => typeof value === 'string')
      )
        throw new Error('Invalid build dependency policy');
      semantics[target] = { cache: configuration['cache'], dependsOn: configuration['dependsOn'] };
    }
  }
  const options = requireRecord(
    readRecord(root, 'tsconfig.base.json')['compilerOptions'],
    'compilerOptions',
  );
  const compiler: Fields = {};
  for (const key of compilerKeys) {
    if (options[key] === undefined) throw new Error(`Missing compiler option: ${key}`);
    compiler[key] = options[key];
  }
  return { version: 1, packageManager, pins, semantics, compiler };
}
function hashBaseline(baseline: Fields): string {
  return createHash('sha256').update(canonicalize(baseline)).digest('hex');
}

/** Updates the shared configuration projection from one public source checkout.
 * Repository identity, product inventory and application-only packages are retained.
 * Regenerate bun.lock with Bun after changing dependency pins. Missing source files throw.
 */
export function synchronizeBaseline(source: string, destination: string): void {
  const baseline = readBaseline(source);
  const manifest = readRecord(destination, 'package.json');
  const nx = readRecord(destination, 'nx.json');
  const typescript = readRecord(destination, 'tsconfig.base.json');
  const dependencies = readDependencies(manifest, 'dependencies');
  const development = readDependencies(manifest, 'devDependencies');
  for (const [name, version] of Object.entries(requireRecord(baseline['pins'], 'pins'))) {
    if (Object.hasOwn(dependencies, name)) dependencies[name] = version;
    else development[name] = version;
  }
  manifest['packageManager'] = baseline['packageManager'];
  manifest['devDependencies'] = development;
  if (manifest['dependencies'] !== undefined) manifest['dependencies'] = dependencies;
  const defaults = requireRecord(nx['targetDefaults'], 'targetDefaults');
  for (const [target, semantics] of Object.entries(
    requireRecord(baseline['semantics'], 'semantics'),
  )) {
    defaults[target] = {
      ...requireRecord(defaults[target], target),
      ...requireRecord(semantics, target),
    };
  }
  typescript['compilerOptions'] = {
    ...requireRecord(typescript['compilerOptions'], 'compilerOptions'),
    ...requireRecord(baseline['compiler'], 'compiler'),
  };
  // All source and destination configuration is read and validated before the first write.
  writeRecord(destination, 'package.json', manifest);
  writeRecord(destination, 'nx.json', nx);
  writeRecord(destination, 'tsconfig.base.json', typescript);
  writeRecord(destination, '.puni-baseline.json', {
    ...baseline,
    fingerprint: hashBaseline(baseline),
  });
}

/** Throws when toolchain pins or supported target/compiler semantics have drifted. */
export function verifyBaseline(source: string, destination: string): void {
  const expected = readBaseline(source);
  const observed = readBaseline(destination);
  // Proof: removing this comparison fails 'changed dependency pin fails conformance before transfer'.
  for (const key of ['packageManager', 'pins', 'semantics', 'compiler']) {
    if (canonicalize(expected[key]) !== canonicalize(observed[key]))
      throw new Error(`Baseline mismatch in ${key}: ${canonicalize(expected[key])}`);
  }
  // Proof: bypassing this read fails 'missing receipt, invalid workspace policy and cyclic closure are refused'.
  const receipt = readRecord(destination, '.puni-baseline.json');
  if (receipt['fingerprint'] !== hashBaseline(observed))
    throw new Error('Baseline receipt mismatch');
}

function readVisibility(root: string): 'public' | 'private' {
  const policy = readRecord(root, 'workspace.portability.json');
  if (
    policy['version'] !== 1 ||
    (policy['visibility'] !== 'public' && policy['visibility'] !== 'private')
  )
    throw new Error('Invalid workspace visibility policy');
  return policy['visibility'];
}
function validatePath(path: string): void {
  if (!/^(apps|libs)\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/.test(path))
    throw new Error(`Invalid project path: ${path}`);
}
function inspectAncestors(root: string, path: string): void {
  let current = root;
  for (const segment of path.split('/')) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error(`Refusing symbolic path: ${current}`);
  }
}
function inspectTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // Proof: removing symlink refusal fails the symbolic-entry case in the unknown-classification test.
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic entry: ${entry.name}`);
    // Proof: removing private-file refusal fails the .env case in the unknown-classification test.
    if (
      /^(\.env(?:\..*)?|\.git|node_modules|dist|\.nx)$/.test(entry.name) ||
      /\.(?:sqlite(?:-wal|-shm)?|pem|key)$/.test(entry.name)
    )
      throw new Error(`Refusing private file or generated tree: ${entry.name}`);
    if (entry.isDirectory()) inspectTree(join(directory, entry.name));
    else if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${entry.name}`);
  }
}

/** Copies an explicitly classified project and its declared local dependency closure.
 * Performs every classification, collision, schema and filesystem check before writes.
 * The destination must be exclusively owned during transfer; concurrent writers are unsupported.
 * No credentials, symlinks, generated directories or restricted website source may be promoted.
 */
export function copyProject(source: string, destination: string, project: string): string[] {
  const sourceRoot = realpathSync(source);
  const destinationRoot = realpathSync(destination);
  if (sourceRoot === destinationRoot) throw new Error('Source and destination must differ');
  readVisibility(sourceRoot);
  const visibility = readVisibility(destinationRoot);
  verifyBaseline(sourceRoot, destinationRoot);
  const sourceConfig = readRecord(sourceRoot, 'tsconfig.base.json');
  const destinationConfig = readRecord(destinationRoot, 'tsconfig.base.json');
  const sourceOptions = requireRecord(sourceConfig['compilerOptions'], 'source compilerOptions');
  const destinationOptions = requireRecord(
    destinationConfig['compilerOptions'],
    'destination compilerOptions',
  );
  const sourceAliases =
    sourceOptions['paths'] === undefined
      ? {}
      : requireRecord(sourceOptions['paths'], 'source paths');
  const destinationAliases =
    destinationOptions['paths'] === undefined
      ? {}
      : requireRecord(destinationOptions['paths'], 'destination paths');
  const aliases: Record<string, string[]> = {};
  const completed = new Set<string>();
  const visiting = new Set<string>();
  const paths: string[] = [];
  function visit(path: string): void {
    validatePath(path);
    if (completed.has(path)) return;
    if (visiting.has(path)) throw new Error(`Dependency cycle: ${path}`);
    visiting.add(path);
    inspectAncestors(sourceRoot, path);
    inspectAncestors(destinationRoot, path);
    // Proof: removing collision admission fails 'missing dependency and path collision cause no partial copy'.
    if (existsSync(join(destinationRoot, path))) throw new Error(`Destination collision: ${path}`);
    const manifest = readRecord(sourceRoot, `${path}/project.json`);
    const projectName = requireString(manifest['name'], 'project name');
    const commands = requireRecord(manifest['targets'], 'targets');
    for (const target of targets) requireRecord(commands[target], `target ${target}`);
    const tags = manifest['tags'];
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string'))
      throw new Error(`Invalid project tags: ${path}`);
    const segments = path.split('/');
    const library = segments[0] === 'libs';
    const ring = library ? (segments[2] ?? '') : 'adapter';
    if (
      (library &&
        (segments.length !== 4 || !['domain', 'application', 'adapters'].includes(ring))) ||
      (!library && segments.length !== 3)
    )
      throw new Error(`Invalid project layout: ${path}`);
    // Proof: removing namespace admission copies a fixture manifest missing its required ring: tag.
    for (const [axis, expected] of [
      ['scope:', library ? 'scope:shared' : 'scope:app'],
      ['ring:', `ring:${ring}`],
      ['product:', `product:${segments[1]}`],
    ]) {
      if (tags.filter((tag) => tag.startsWith(axis)).length !== 1 || !tags.includes(expected))
        throw new Error(`Invalid ${axis} tag: ${path}`);
    }
    if (tags.filter((tag) => tag.startsWith('runtime:')).length !== 1)
      throw new Error(`Invalid runtime: tag: ${path}`);
    if (projectName !== `${segments[1] ?? ''}-${segments.at(-1) ?? ''}`)
      throw new Error(`Invalid project name: ${path}`);
    const metadata = requireRecord(manifest['metadata'], 'metadata');
    const policy = requireRecord(metadata['portability'], 'portability');
    // Proof: removing classification refusal fails 'unknown classification, symlinks, private files and escaped project paths fail closed'.
    if (policy['visibility'] !== 'public' && policy['visibility'] !== 'private')
      throw new Error(`Unknown classification: ${path}`);
    // Proof: disabling this guard fails 'restricted dependencies and Novaform paths refuse public promotion before copying bytes'.
    if (
      visibility === 'public' &&
      (policy['visibility'] === 'private' ||
        path === 'apps/website/site' ||
        path.startsWith('apps/website/site/'))
    )
      throw new Error(`Refusing private source promotion: ${path}`);
    const dependencies = policy['dependencies'];
    if (
      !Array.isArray(dependencies) ||
      !dependencies.every((dependency) => typeof dependency === 'string')
    )
      throw new Error(`Invalid dependency closure: ${path}`);
    const declaredAliases = policy['aliases'];
    if (
      declaredAliases !== undefined &&
      (!Array.isArray(declaredAliases) ||
        !declaredAliases.every((alias) => typeof alias === 'string'))
    )
      throw new Error(`Invalid alias declaration: ${path}`);
    for (const alias of declaredAliases ?? []) {
      if (!/^@[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(alias))
        throw new Error(`Invalid alias: ${alias}`);
      const mapping = sourceAliases[alias];
      if (
        !Array.isArray(mapping) ||
        mapping.length !== 1 ||
        typeof mapping[0] !== 'string' ||
        !mapping[0].startsWith(`./${path}/`) ||
        mapping[0].split('/').includes('..') ||
        !existsSync(join(sourceRoot, mapping[0]))
      )
        throw new Error(`Alias must resolve inside ${path}: ${alias}`);
      // Proof: removing alias collision admission copies the fixture despite its conflicting destination alias.
      if (Object.hasOwn(destinationAliases, alias) || Object.hasOwn(aliases, alias))
        throw new Error(`Destination alias collision: ${alias}`);
      aliases[alias] = [mapping[0]];
    }
    inspectTree(join(sourceRoot, path));
    // Proof: omitting traversal fails the bidirectional closure test before its unchanged-byte assertion.
    for (const dependency of dependencies) visit(dependency);
    visiting.delete(path);
    completed.add(path);
    paths.push(path);
  }
  visit(project);
  for (const path of paths) {
    mkdirSync(dirname(join(destinationRoot, path)), { recursive: true });
    cpSync(join(sourceRoot, path), join(destinationRoot, path), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  if (Object.keys(aliases).length > 0) {
    destinationOptions['paths'] = { ...destinationAliases, ...aliases };
    writeRecord(destinationRoot, 'tsconfig.base.json', destinationConfig);
  }
  return paths;
}

if (import.meta.main) {
  const action = process.argv.at(2);
  const source = process.argv.at(3);
  const destination = process.argv.at(4);
  const project = process.argv.at(5);
  if (source === undefined || destination === undefined)
    throw new Error(
      'Usage: bun tools/workspace/portability.ts sync|check|copy SOURCE DESTINATION [PROJECT]',
    );
  if (action === 'sync') synchronizeBaseline(resolve(source), resolve(destination));
  else if (action === 'check') verifyBaseline(resolve(source), resolve(destination));
  else if (action === 'copy' && project !== undefined)
    console.log(copyProject(resolve(source), resolve(destination), project).join('\n'));
  else throw new Error('Invalid portability command');
}
