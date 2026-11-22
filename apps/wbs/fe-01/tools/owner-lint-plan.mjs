import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const APP = 'apps/wbs/fe-01';
const DIRECTORIES = [`${APP}/src`, `${APP}/e2e`, `${APP}/e2e-packaged`];
const ROOT_SOURCE = /^apps\/wbs\/fe-01\/[^/]+\.tsx?$/;
const ESLINT_VERSION = '10.10.0';
const MODULES_PER_GROUP = 4;

/** Split the Nx-authored owner operands from the operator's original CLI arguments. */
export function readInvocation(root, arguments_) {
  const delimiter = arguments_.indexOf('--');
  // Proof: removing the delimiter check failed the missing-delimiter assertion.
  if (delimiter < 0) {
    throw new Error('Expected owner lint operand delimiter');
  }
  const operands = arguments_.slice(0, delimiter);
  // Proof: bypassing the directory check failed the incomplete-owner-input assertion.
  if (DIRECTORIES.some((directory, index) => operands[index] !== directory)) {
    throw new Error('Expected frontend lint directories');
  }
  const explicit = operands.slice(DIRECTORIES.length);
  // Proof: removing the uniqueness check admitted duplicate explicit roots and failed the input test.
  if (
    explicit.length === 0 ||
    explicit.some((file) => !ROOT_SOURCE.test(file)) ||
    new Set(explicit).size !== explicit.length
  ) {
    throw new Error('Expected unique frontend root source operands');
  }
  const forwarded = arguments_.slice(delimiter + 1);
  // Proof: skipping forwarded mode failed the exact flag/value/path argument assertion.
  if (forwarded.length > 0) {
    return { mode: 'whole-cli', reason: 'forwarded arguments', operands, forwarded };
  }
  // Proof: skipping suppressions mode failed the present-file invocation assertion.
  if (statSync(join(root, 'eslint-suppressions.json'), { throwIfNoEntry: false })) {
    return { mode: 'whole-cli', reason: 'repository suppressions', operands, forwarded };
  }
  return { mode: 'serial', operands, forwarded };
}

function installedFinder(root) {
  const requireOwner = createRequire(join(root, 'package.json'));
  const manifest = requireOwner.resolve('eslint/package.json');
  const version = requireOwner(manifest).version;
  // Proof: accepting the mismatched fixture version failed the version refusal assertion.
  if (version !== ESLINT_VERSION) {
    throw new Error(`Unsupported ESLint finder version ${version}; expected ${ESLINT_VERSION}`);
  }

  const directory = dirname(manifest);
  const helpers = requireOwner(join(directory, 'lib/eslint/eslint-helpers.js'));
  for (const name of [
    'findFiles',
    'processOptions',
    'createDefaultConfigs',
    'createLinter',
    'createConfigLoader',
  ]) {
    // Proof: bypassing this check failed the required installed finder export assertion.
    if (typeof helpers[name] !== 'function') {
      throw new Error(`Missing installed ESLint discovery capability ${name}`);
    }
  }
  const createOptions = requireOwner(join(directory, 'lib/options.js'));
  const translateOptions = requireOwner(join(directory, 'lib/shared/translate-cli-options.js'));
  const { WarningService } = requireOwner(join(directory, 'lib/services/warning-service.js'));
  return {
    helpers,
    createOptions,
    translateOptions,
    WarningService,
    cli: join(directory, 'bin/eslint.js'),
  };
}

/** Select files with the installed full CLI's config and glob semantics before running rules. */
export async function discoverFiles(root, operands) {
  // Proof: removing this check failed the empty discovery operand assertion.
  if (operands.length === 0) {
    throw new Error('Expected lint operands before ESLint discovery');
  }
  const { helpers, createOptions, translateOptions, WarningService, cli } = installedFinder(root);
  const parsed = createOptions().parse([process.execPath, cli, ...operands]);
  const translated = await translateOptions(parsed);
  const options = helpers.processOptions({ ...translated, cwd: root });
  const warnings = new WarningService();
  const configLoader = helpers.createConfigLoader(
    options,
    helpers.createDefaultConfigs(translated.plugins),
    helpers.createLinter(options, warnings),
    warnings,
  );

  const explicit = new Set(parsed._.map((operand) => resolve(root, operand)));
  const loading = new Set();
  const loadFile = configLoader.loadConfigArrayForFile.bind(configLoader);
  configLoader.loadConfigArrayForFile = (file) => {
    const load = loadFile(file);
    if (explicit.has(file)) {
      // The installed finder starts explicit config loads before checking missing arguments.
      // Wait for those loads even if the finder rejects before awaiting their promises.
      const settled = Promise.allSettled([load]);
      loading.add(settled);
      void settled.then(() => loading.delete(settled));
    }
    return load;
  };

  try {
    return await helpers.findFiles({
      patterns: parsed._,
      cwd: root,
      globInputPaths: options.globInputPaths,
      configLoader,
      // Proof: allowing unmatched patterns resolved the real missing-operand fixture and failed its test.
      errorOnUnmatchedPattern: options.errorOnUnmatchedPattern,
    });
  } finally {
    // Proof: removing the drain failed the delayed explicit-config completion assertion.
    await Promise.all(loading);
  }
}

function selectedFile(root, file) {
  const path = relative(root, file);
  // Proof: removing the scope guard admitted the unrelated file and failed the roster test.
  if (
    !isAbsolute(file) ||
    resolve(file) !== file ||
    (!DIRECTORIES.some((directory) => path.startsWith(directory + sep)) && !ROOT_SOURCE.test(path))
  ) {
    throw new Error(`Outside frontend lint inputs: ${file}`);
  }
  const insideSource = path.startsWith(DIRECTORIES[0] + sep);
  const parts = relative(join(root, DIRECTORIES[0]), file).split(sep);
  const module = insideSource && parts[0] === 'modules' && parts.length > 2 ? parts[1] : undefined;
  return { file, insideSource, module };
}

function moduleGroups(root, selected) {
  const names = [
    ...new Set(selected.flatMap(({ module }) => (module === undefined ? [] : [module]))),
  ]
    .sort()
    .filter((module) =>
      statSync(join(root, DIRECTORIES[0], 'modules', module, 'tsconfig.json'), {
        throwIfNoEntry: false,
      })?.isFile(),
    );
  const groups = [];
  const byModule = new Map();
  for (let start = 0; start < names.length; start += MODULES_PER_GROUP) {
    const batch = names.slice(start, start + MODULES_PER_GROUP);
    const group = { name: `modules:${batch.join(',')}`, files: [] };
    groups.push(group);
    for (const module of batch) {
      byModule.set(module, group);
    }
  }
  return { groups, byModule };
}

/** Group selected files without changing their ESLint configuration or order within each group. */
export function groupFiles(root, files) {
  // Proof: removing this check admitted an empty roster and failed its assertion.
  if (files.length === 0) {
    throw new Error('Empty frontend lint roster');
  }
  const seen = new Set();
  const selected = files.map((file) => {
    // Proof: removing the check admitted a duplicate path and failed the roster test.
    if (seen.has(file)) {
      throw new Error(`Duplicate lint file: ${file}`);
    }
    seen.add(file);
    return selectedFile(root, file);
  });

  const source = { name: 'source', files: [] };
  const browser = { name: 'browser and config', files: [] };
  const { groups, byModule } = moduleGroups(root, selected);
  for (const { file, insideSource, module } of selected) {
    // Proof: bypassing module routing failed the configured-module and prefix-lookalike partition test.
    const group = byModule.get(module) ?? (insideSource ? source : browser);
    group.files.push(file);
  }
  return [source, ...groups, browser].filter((group) => group.files.length > 0);
}
