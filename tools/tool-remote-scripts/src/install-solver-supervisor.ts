import { builtinModules } from 'node:module';
import { dirname, extname } from 'node:path';

import type { BundleFile } from './lib/deploy-contract';
import { requireInheritedEdgeLock, retainUnknownControllerObservation } from './lib/edge-admission';
import {
  captureSolverReaderArtifact,
  decodeSolverReaderSelection,
  readSolverReaderBuildInput,
  runSolverReaderTransport,
  type SolverReaderArtifactObservation,
  type SolverReaderLayout,
  type SolverReaderSelection,
} from './lib/solver-reader-preparation';
import {
  decodeSolverReaderTransition,
  type SolverReaderTransition,
} from './lib/solver-reader-transition';
import {
  assertSolverSupervisorBunVersion,
  SOLVER_READER_STATE,
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUN_SOURCE,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SOCKET,
  SOLVER_SUPERVISOR_UNIT,
  SOLVER_SUPERVISOR_UNIT_SOURCE,
} from './lib/solver-supervisor-install-contract';
import {
  buildSolverReaderPreparationBundle,
  buildSolverReaderPreparationExecution,
  buildSolverSupervisorInstallOperation,
  describeSolverSupervisorInstallEvidence,
  quoteInstallShell,
} from './lib/solver-supervisor-install-operation';
import {
  decodeSolverSupervisorConfigBytes,
  SUPERVISOR_CONFIG_MAX_BYTES,
} from './solver-supervisor';

const HOST = /^[a-zA-Z0-9._-]+$/;

export interface SolverSupervisorInstallArgs {
  host: string;
  execute: boolean;
  config: string;
  local?: boolean;
}

export interface SolverSupervisorInstallStep {
  phase: 'preflight' | 'files' | 'service';
  description: string;
  argv: string[];
  failureContext: string;
}

interface CommandOutput {
  code: number;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface SolverSupervisorInstallerDependencies {
  read(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  command(argv: readonly string[], inherit?: boolean): Promise<CommandOutput>;
  hash(path: string): Promise<string>;
  readerCommand?: (argv: readonly string[], finalOperation: boolean) => Promise<CommandOutput>;
}

export function parseSolverSupervisorInstallArgs(
  argv: readonly string[],
): SolverSupervisorInstallArgs {
  let host = 'h2puni';
  let execute = false;
  let config = '';
  let local = false;
  let explicitHost = false;

  for (const raw of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (match === null) throw new Error(`unexpected argument ${raw}`);
    const key = match[1];
    const value = (match[2] as string | undefined) ?? '';
    if (key === 'host') {
      host = value;
      explicitHost = true;
    } else if (key === 'local' && value === '') local = true;
    else if (key === 'execute' && value === '') execute = true;
    else if (key === 'dry-run' && value === '') execute = false;
    else if (key === 'config' && value !== '') config = value;
    else throw new Error(`unexpected argument ${raw}`);
  }

  // Proof: omitting mutual exclusion failed the explicit local/host argument negative.
  if (local && explicitHost) throw new Error('--local cannot combine with --host');
  if (!HOST.test(host)) throw new Error(`invalid SSH host ${host || '(missing)'}`);
  if (config === '') throw new Error('--config=<local validated supervisor config> is required');
  return { host, execute, config, ...(local ? { local } : {}) };
}

export function solverSupervisorInstallFiles(config: string): readonly BundleFile[] {
  return [
    { local: SOLVER_SUPERVISOR_BUN_SOURCE, remote: SOLVER_SUPERVISOR_BUN },
    SOLVER_SUPERVISOR_BUNDLE,
    { local: config, remote: SOLVER_SUPERVISOR_CONFIG },
    { local: SOLVER_SUPERVISOR_UNIT_SOURCE, remote: SOLVER_SUPERVISOR_UNIT },
  ];
}

/** Captures unique private staging and one admitted publication operation. */
export function buildSolverSupervisorInstallPlan(
  host: string,
  config: string,
  socketPath: string,
  hashes: readonly string[],
  local = false,
): readonly SolverSupervisorInstallStep[] {
  const files = solverSupervisorInstallFiles(config);
  // Proof: fixed attempt IDs reuse paths in the repeated real remote CLI transport test.
  const staging = `/home/puni1/.cache/wbs-solver/install-${crypto.randomUUID()}`;
  const shell = (script: string): string[] =>
    local ? ['sh', '-c', script] : ['ssh', host, `sh -c ${quoteInstallShell(script)}`];
  const steps: Omit<SolverSupervisorInstallStep, 'failureContext'>[] = [
    {
      phase: 'preflight',
      description: 'require the installer Bun to have accepted-socket fd support',
      argv: [SOLVER_SUPERVISOR_BUN_SOURCE, '--version'],
    },
    {
      phase: 'files',
      // Proof: changing mkdir to 0755 failed real SCP privacy validation before the first upload.
      description: 'create unique private supervisor staging',
      argv: shell(
        `set -eu; test -d /home/puni1/.cache/wbs-solver; test ! -L /home/puni1/.cache/wbs-solver; controller_parent_path=$(realpath -- /home/puni1/.cache/wbs-solver) || exit 1; test "$controller_parent_path" = /home/puni1/.cache/wbs-solver || exit 1; controller_parent_mode=$(stat -c %a -- /home/puni1/.cache/wbs-solver) || exit 1; test "$controller_parent_mode" = 700 || exit 1; mkdir -m 0700 -- ${quoteInstallShell(staging)} || exit 1; controller_created_stage=$(stat -c '%d:%i' -- ${quoteInstallShell(staging)}) || exit 1; test -n "$controller_created_stage" || exit 1; printf '%s\\n' "$controller_created_stage"`,
      ),
    },
    ...files.map((file, index) => ({
      phase: 'files' as const,
      description: `stage ${file.local}`,
      argv: local
        ? ['cp', '--', file.local, `${staging}/${String(index)}`]
        : ['scp', file.local, `${host}:${staging}/${String(index)}`],
    })),
    {
      phase: 'service',
      description: 'admit, publish, read back and ready supervisor under canonical edge.lock',
      argv: shell(
        buildSolverSupervisorInstallOperation(
          files,
          hashes,
          staging,
          socketPath,
          local,
          '__INSTALL_CREATED_STAGE_IDENTITY__',
        ),
      ),
    },
  ];
  const failureContext = describeSolverSupervisorInstallEvidence(files, hashes, staging);
  return steps.map((step) => ({ ...step, failureContext }));
}

/** Preserves the admitted open description across the second Bun-to-shell hop. */
export async function runSolverSupervisorInstallCommand(
  argv: readonly string[],
  inherit = false,
): Promise<CommandOutput> {
  // Proof: omitting admission or FD3 mapping independently failed the real two-hop Bun/shell control.
  const admission = inherit ? await requireInheritedEdgeLock() : undefined;
  const child = Bun.spawn([...argv], {
    env: {
      ...process.env,
      ...(admission === undefined
        ? {}
        : { WBS_EDGE_LOCK_FD: '3', WBS_EDGE_STATE: admission.stateDirectory }),
    },
    stdio:
      admission === undefined
        ? ['ignore', 'pipe', 'pipe']
        : ['ignore', 'pipe', 'pipe', admission.descriptor],
  });
  const [stdout, stderr, wait] = await Promise.allSettled([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled' || wait.status !== 'fulfilled')
    return retainUnknownControllerObservation();
  return { code: wait.value, signal: child.signalCode, stdout: stdout.value, stderr: stderr.value };
}

const DEFAULT_DEPENDENCIES: SolverSupervisorInstallerDependencies = {
  read: async (path) =>
    new Uint8Array(
      await Bun.file(path)
        .slice(0, SUPERVISOR_CONFIG_MAX_BYTES + 1)
        .arrayBuffer(),
    ),
  exists: (path) => Bun.file(path).exists(),
  command: runSolverSupervisorInstallCommand,
  readerCommand: runSolverReaderTransport,
  hash: async (path) =>
    new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex'),
};

async function requireCommand(
  step: SolverSupervisorInstallStep,
  dependencies: SolverSupervisorInstallerDependencies,
  inherit = false,
): Promise<CommandOutput> {
  // Proof: omitting context independently failed real upload refusal and unspawnable-transport negatives.
  let output: CommandOutput;
  try {
    output = await dependencies.command(step.argv, inherit);
  } catch (error) {
    throw new Error(
      `${step.description} could not run: ${error instanceof Error ? error.message : String(error)}; installation may be partial or uncertain; ${step.failureContext}; inspect installed bytes and service readiness under edge.lock before retry`,
      { cause: error },
    );
  }
  if (output.code !== 0) {
    throw new Error(
      `${step.description} failed (exit ${String(output.code)}): ${output.stderr.trim()}; installation may be partial or uncertain; ${step.failureContext}; inspect installed hashes, invocation staging and service readiness under edge.lock before retry`,
    );
  }
  return output;
}

/**
 * Validates local inputs before staging and rejects unsupported staged bytes
 * before final publication. Local execution requires inherited admission at each child.
 *
 * Proof: install-solver-supervisor.test.ts supplies an incomplete config and
 * requires the command ledger to remain empty.
 */
export async function installSolverSupervisor(
  args: SolverSupervisorInstallArgs,
  dependencies: SolverSupervisorInstallerDependencies = DEFAULT_DEPENDENCIES,
): Promise<readonly SolverSupervisorInstallStep[]> {
  const bytes = await dependencies.read(args.config);
  const options = decodeSolverSupervisorConfigBytes(bytes);
  if (options.connection.unix !== SOLVER_SUPERVISOR_SOCKET) {
    throw new Error(`solver supervisor config socket must be ${SOLVER_SUPERVISOR_SOCKET}`);
  }
  const files = solverSupervisorInstallFiles(args.config);
  for (const file of files) {
    if (!(await dependencies.exists(file.local))) {
      throw new Error(`${file.local} not found — build or create it before installing`);
    }
  }

  // Proof: changing source config during SCP is refused against the validated bytes captured here.
  const hashes = await Promise.all(
    files.map((file) =>
      file.local === args.config
        ? Promise.resolve(new Bun.CryptoHasher('sha256').update(bytes).digest('hex'))
        : dependencies.hash(file.local),
    ),
  );
  const plan = buildSolverSupervisorInstallPlan(
    args.host,
    args.config,
    options.connection.unix,
    hashes,
    args.local,
  );
  if (!args.execute) return plan;

  const preflight = plan.find((step) => step.phase === 'preflight');
  if (preflight === undefined) throw new Error('solver supervisor install has no Bun preflight');
  // Proof: install-solver-supervisor.test.ts returns 1.3.13 and observes that
  // the preflight is the only command reached.
  assertSolverSupervisorBunVersion((await requireCommand(preflight, dependencies)).stdout);

  let createdStageIdentity: string | undefined;
  for (const step of plan.filter((candidate) => candidate.phase !== 'preflight')) {
    if (step.phase === 'service') {
      if (createdStageIdentity === undefined)
        throw new Error('solver supervisor staging creation identity is missing');
      const identity = createdStageIdentity;
      const marker = '__INSTALL_CREATED_STAGE_IDENTITY__';
      if (step.argv.join(' ').split(marker).length !== 2)
        throw new Error('solver supervisor staging identity boundary differs');
      await requireCommand(
        { ...step, argv: step.argv.map((argument) => argument.replace(marker, identity)) },
        dependencies,
        args.local === true,
      );
    } else {
      const output = await requireCommand(step, dependencies, args.local === true);
      if (createdStageIdentity === undefined) {
        const identity = output.stdout.trim();
        if (!/^[0-9]+:[0-9]+$/.test(identity))
          throw new Error(
            `solver supervisor staging creation identity is invalid; ${step.failureContext}`,
          );
        createdStageIdentity = identity;
      }
    }
  }
  return plan;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === '--prepare-first-reader' || argv[0] === '--transition-controller-reader') {
    const plan = await runSolverSupervisorInstaller(argv);
    for (const step of plan) console.log(`  ${step.description}`);
    if (argv[0] === '--transition-controller-reader') {
      const operation = plan.at(-1);
      if (operation === undefined) throw new Error('missing selected reader transition operation');
      console.log(operation.failureContext);
    }
    return;
  }
  const args = parseSolverSupervisorInstallArgs(argv);
  const plan = await installSolverSupervisor(args);
  console.log(
    `[tool-remote-scripts] solver supervisor host=${args.local === true ? 'local' : args.host} execute=${String(args.execute)}`,
  );
  for (const step of plan) console.log(`  ${step.description}`);
  if (!args.execute) {
    console.log('[tool-remote-scripts] dry-run only. re-run with --execute to install for real.');
  } else {
    console.log('[tool-remote-scripts] solver supervisor installed, verified, and ready.');
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      '[tool-remote-scripts] solver supervisor install failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}

export interface SolverReaderInstallation {
  readonly host: string;
  readonly execute: boolean;
  readonly selection: unknown;
}

/** Explicit attended first-reader branch; never selected by missing files or normal installer defaults. */
export async function prepareSolverReaderInstallation(
  request: SolverReaderInstallation,
  dependencies: SolverSupervisorInstallerDependencies = DEFAULT_DEPENDENCIES,
  construction?: SolverReaderLayout,
): Promise<readonly SolverSupervisorInstallStep[]> {
  const selection = decodeSolverReaderSelection(request.selection);
  if (
    !HOST.test(request.host) ||
    (construction === undefined &&
      (selection.target.account.name !== 'puni1' ||
        selection.target.account.uid !== 1000 ||
        selection.target.account.gid !== 1000))
  )
    throw new Error(
      'first-reader preparation requires an independently selected fresh target/account',
    );
  const artifacts = [selection.bun, selection.reader, selection.initializer];
  for (const artifact of artifacts) {
    const observed = await captureSolverReaderArtifact(artifact.path);
    if (
      observed.artifact.sha256 !== artifact.sha256 ||
      observed.artifact.byteLength !== artifact.byteLength
    )
      throw new Error(`preselected first-reader artifact differs: ${artifact.path}`);
  }

  const staging = `/home/puni1/.cache/wbs-solver/reader-${crypto.randomUUID()}`;
  const layout = construction ?? {
    state: SOLVER_READER_STATE,
    staging,
    bun: SOLVER_SUPERVISOR_BUN,
    reader: SOLVER_SUPERVISOR_BUNDLE.remote,
  };
  const steps = await buildSolverReaderPreparationPlan(request.host, selection, layout);
  if (!request.execute) return steps;
  const preflight = steps.at(0);
  if (preflight === undefined) throw new Error('missing first-reader Bun preflight');
  const command = dependencies.readerCommand;
  if (command === undefined) throw new Error('first-reader requires original observed transport');
  const run = async (step: SolverSupervisorInstallStep, finalOperation: boolean) => {
    let output: CommandOutput;
    try {
      output = await command(step.argv, finalOperation);
    } catch (cause) {
      throw new Error(
        `first-reader transport failed; remote settlement is unknown; ${step.failureContext}`,
        { cause },
      );
    }
    if (output.code !== 0 || output.signal !== null)
      throw new Error(
        `first-reader transport settlement is unknown or abnormal; ${step.failureContext}`,
      );
    return output;
  };
  assertSolverSupervisorBunVersion((await run(preflight, false)).stdout);
  for (const [index, step] of steps.slice(1).entries()) await run(step, index === steps.length - 2);

  return steps;
}

/** Builds the same first-reader transport for fixed production paths or isolated test construction. */
export async function buildSolverReaderPreparationPlan(
  host: string,
  selection: SolverReaderSelection,
  layout: SolverReaderLayout,
): Promise<readonly SolverSupervisorInstallStep[]> {
  if (!HOST.test(host))
    throw new Error('first-reader preparation requires an explicit selected host');
  const staging = layout.staging;
  const artifacts = [selection.bun, selection.reader, selection.initializer];
  const transported: SolverReaderSelection = {
    ...selection,
    bun: { ...selection.bun, path: `${staging}/0` },
    reader: { ...selection.reader, path: `${staging}/1` },
    initializer: { ...selection.initializer, path: `${staging}/2` },
  };
  const builtOperation = await buildSolverReaderPreparationBundle(transported, layout);
  const operation = builtOperation.bytes;
  const operationHash = new Bun.CryptoHasher('sha256').update(operation).digest('hex');
  const quote = quoteInstallShell;
  const shell = (script: string) => ['ssh', host, `sh -c ${quote(script)}`];
  const failureContext = `first-reader attempt=${staging}; target=${selection.target.hostname}/${selection.target.account.name}; artifacts=${artifacts.map((artifact) => `${artifact.sha256}:${String(artifact.byteLength)}:${artifact.path}`).join(';')}; operation=${operationHash}:${String(operation.byteLength)}; buildBun=${builtOperation.bunVersion}; compiler=${JSON.stringify(builtOperation.compiler)}; virtualEntry=${JSON.stringify(builtOperation.virtualEntry)}; externals=${JSON.stringify(builtOperation.externals)}; buildInputs=${builtOperation.inputs.map((input) => `${input.artifact.sha256}:${String(input.artifact.byteLength)}:${input.artifact.path}`).join(',')}; retain policy, published files and evidence for attended inspection; no automatic retry or inverse`;
  const steps: SolverSupervisorInstallStep[] = [
    {
      phase: 'preflight',
      description: 'require the selected transport Bun version',
      argv: [selection.bun.path, '--version'],
      failureContext,
    },
    {
      phase: 'files',
      description: 'create private first-reader invocation staging',
      argv: shell(
        `set -eu; install -d -m 0700 -- ${quote(dirname(staging))}; mkdir -m 0700 -- ${quote(staging)}`,
      ),
      failureContext,
    },
    ...artifacts.map((artifact, index) => ({
      phase: 'files' as const,
      description: `stage selected first-reader artifact ${artifact.path}`,
      argv: ['scp', artifact.path, `${host}:${staging}/${String(index)}`],
      failureContext,
    })),
    {
      phase: 'files',
      description: 'stage the pinned transient first-reader operation',
      argv: shell(
        `set -eu; printf %s ${quote(Buffer.from(operation).toString('base64'))} | base64 -d > ${quote(`${staging}/3`)}; chmod 0600 -- ${quote(`${staging}/3`)}`,
      ),
      failureContext,
    },
    {
      phase: 'files',
      description:
        'initialize once and prepare the fixed installed reader under original edge.lock',
      argv: shell(
        buildSolverReaderPreparationExecution(transported, {
          path: `${staging}/3`,
          sha256: operationHash,
          byteLength: operation.byteLength,
        }),
      ),
      failureContext,
    },
  ];
  return steps;
}

/** Closed explicit action; flags record an attended selection and are not an authority token. */
export function parseSolverReaderInstallArgs(argv: readonly string[]): SolverReaderInstallation {
  if (argv[0] !== '--prepare-first-reader')
    throw new Error('expected explicit --prepare-first-reader');
  const fields = new Map<string, string>();
  let execute = false;
  let selectedMode = false;
  for (const argument of argv.slice(1)) {
    if (argument === '--execute' || argument === '--dry-run') {
      if (selectedMode) throw new Error('duplicate first-reader execution mode');
      selectedMode = true;
      execute = argument === '--execute';
      continue;
    }
    const match = /^--([a-z0-9-]+)=(.+)$/.exec(argument);
    if (match === null) throw new Error(`unexpected first-reader argument ${argument}`);
    const key = match[1];
    if (fields.has(key)) throw new Error(`duplicate first-reader --${key}`);
    fields.set(key, match[2]);
  }
  const required = [
    'host',
    'target-hostname',
    'account',
    'uid',
    'gid',
    'fresh-target',
    'bun',
    'bun-sha256',
    'bun-bytes',
    'reader',
    'reader-sha256',
    'reader-bytes',
    'initializer',
    'initializer-sha256',
    'initializer-bytes',
  ];
  if (fields.size !== required.length || required.some((key) => !fields.has(key)))
    throw new Error(
      'first-reader requires the complete closed independently selected target/account and artifact inputs',
    );
  const text = (key: string) => {
    const value = fields.get(key);
    if (value === undefined) throw new Error(`missing first-reader --${key}`);
    return value;
  };
  const integer = (key: string) => {
    const value = text(key);
    if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`invalid first-reader --${key}`);
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`unsafe first-reader --${key}`);
    return number;
  };
  const artifact = (name: string) => ({
    path: text(name),
    sha256: text(`${name}-sha256`),
    byteLength: integer(`${name}-bytes`),
  });
  const host = text('host');
  if (!HOST.test(host)) throw new Error('first-reader requires an explicit selected host');
  return {
    host,
    execute,
    selection: decodeSolverReaderSelection({
      target: {
        hostname: text('target-hostname'),
        account: { name: text('account'), uid: integer('uid'), gid: integer('gid') },
        freshness: text('fresh-target'),
      },
      bun: artifact('bun'),
      reader: artifact('reader'),
      initializer: artifact('initializer'),
    }),
  };
}

/** Public dispatch preserves normal four-file installation; construction paths are available only to local tests. */
export async function runSolverSupervisorInstaller(
  argv: readonly string[],
  dependencies: SolverSupervisorInstallerDependencies = DEFAULT_DEPENDENCIES,
  construction?: SolverReaderLayout,
): Promise<readonly SolverSupervisorInstallStep[]> {
  if (argv[0] === '--transition-controller-reader')
    return transitionSolverReaderInstallation(
      parseSolverReaderTransitionArgs(argv),
      dependencies,
      construction,
    );
  if (argv[0] === '--prepare-first-reader')
    return prepareSolverReaderInstallation(
      parseSolverReaderInstallArgs(argv),
      dependencies,
      construction,
    );
  return installSolverSupervisor(parseSolverSupervisorInstallArgs(argv), dependencies);
}

export interface SolverReaderTransitionInstallation {
  readonly host: string;
  readonly execute: boolean;
  readonly selection: SolverReaderTransition;
}

/** Closed separately selected operation; normal and fresh-reader flags never enter this branch. */
export function parseSolverReaderTransitionArgs(
  argv: readonly string[],
): SolverReaderTransitionInstallation {
  if (argv[0] !== '--transition-controller-reader')
    throw new Error('expected explicit reader transition');
  const fields = new Map<string, string>();
  let execute = false;
  let selectedMode = false;
  for (const argument of argv.slice(1)) {
    if (argument === '--execute' || argument === '--dry-run') {
      if (selectedMode) throw new Error('duplicate reader transition execution mode');
      selectedMode = true;
      execute = argument === '--execute';
      continue;
    }
    const match = /^--([a-z0-9-]+)=(.+)$/.exec(argument);
    if (match === null) throw new Error(`unexpected reader transition argument ${argument}`);
    const key = match[1];
    if (fields.has(key)) throw new Error(`duplicate reader transition --${key}`);
    fields.set(key, match[2]);
  }
  const required = [
    'host',
    'target-hostname',
    'account',
    'uid',
    'gid',
    'old-bun-sha256',
    'old-bun-bytes',
    'old-reader-sha256',
    'old-reader-bytes',
    'reader',
    'reader-sha256',
    'reader-bytes',
  ];
  if (fields.size !== required.length || required.some((key) => !fields.has(key)))
    throw new Error(
      'reader transition requires complete closed selected target/account and artifact inputs',
    );
  const text = (key: string) => {
    const value = fields.get(key);
    if (value === undefined) throw new Error(`missing reader transition --${key}`);
    return value;
  };
  const integer = (key: string) => {
    const value = text(key);
    if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error(`invalid reader transition --${key}`);
    return Number(value);
  };
  const pin = (name: string) => ({
    sha256: text(`${name}-sha256`),
    byteLength: integer(`${name}-bytes`),
  });
  const host = text('host');
  if (!HOST.test(host)) throw new Error('reader transition requires explicit selected host');
  const selection = decodeSolverReaderTransition({
    target: {
      hostname: text('target-hostname'),
      account: { name: text('account'), uid: integer('uid'), gid: integer('gid') },
    },
    oldBun: pin('old-bun'),
    oldReader: pin('old-reader'),
    reader: { path: text('reader'), ...pin('reader') },
  });
  if (
    selection.target.account.name !== 'puni1' ||
    selection.target.account.uid !== 1000 ||
    selection.target.account.gid !== 1000
  )
    throw new Error('reader transition requires selected production account puni1/1000/1000');
  return { host, execute, selection };
}

/** Pins the actual compiler and every input consumed by this separately selected operation. */
async function buildSolverReaderTransitionBundle(
  selection: SolverReaderTransition,
  layout: SolverReaderLayout,
) {
  const compiler = await captureSolverReaderArtifact(process.execPath);
  const source = new URL('./lib/solver-reader-transition.ts', import.meta.url).pathname;
  const entrypoint = 'solver-reader-transition-entry';
  const contents = `import { transitionSolverReader } from ${JSON.stringify(source)}; await transitionSolverReader(${JSON.stringify(selection)}, ${JSON.stringify(layout)});`;
  const inputs: SolverReaderArtifactObservation[] = [];
  const externals = new Set<string>();
  const compilation = await Bun.build({
    entrypoints: [entrypoint],
    target: 'bun',
    packages: 'bundle',
    plugins: [
      {
        name: 'reader-transition',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (file) => {
            if (file.path === entrypoint) return { path: entrypoint, namespace: 'transition' };
            if (
              file.path.startsWith('bun:') ||
              file.path.startsWith('node:') ||
              builtinModules.includes(file.path)
            ) {
              const name =
                file.path.startsWith('bun:') || file.path.startsWith('node:')
                  ? file.path
                  : `node:${file.path}`;
              if (
                (name.startsWith('bun:') && !['bun:ffi', 'bun'].includes(name)) ||
                (name.startsWith('node:') &&
                  !builtinModules.includes(name) &&
                  !builtinModules.includes(name.slice(5)))
              )
                throw new Error(`unsupported reader transition external ${name}`);
              externals.add(name);
              return { path: name, external: true };
            }
            return undefined;
          });
          build.onLoad({ filter: /.*/, namespace: 'file' }, async (file) => {
            const loaded = await readSolverReaderBuildInput(file.path);
            inputs.push(loaded.observation);
            const extension = extname(file.path);
            const loader =
              extension === '.ts'
                ? 'ts'
                : extension === '.json'
                  ? 'json'
                  : ['.js', '.mjs', '.cjs'].includes(extension)
                    ? 'js'
                    : undefined;
            if (loader === undefined)
              throw new Error(`unsupported reader transition build file ${file.path}`);
            return { contents: loaded.bytes, loader };
          });
          build.onLoad({ filter: /.*/, namespace: 'transition' }, () => ({
            contents,
            loader: 'ts',
          }));
        },
      },
    ],
  });
  const output = compilation.outputs.at(0);
  if (!compilation.success || compilation.outputs.length !== 1 || output === undefined)
    throw new Error(
      `reader transition operation build failed: ${compilation.logs.map(String).join('; ')}`,
    );
  if (!inputs.some((input) => input.artifact.path === source))
    throw new Error('reader transition source closure unobserved');
  for (const observed of [compiler, ...inputs]) {
    if (
      JSON.stringify(await captureSolverReaderArtifact(observed.artifact.path)) !==
      JSON.stringify(observed)
    )
      throw new Error(`reader transition build input changed: ${observed.artifact.path}`);
  }
  return {
    bytes: new Uint8Array(await output.arrayBuffer()),
    compiler,
    inputs,
    externals: [...externals].sort(),
    virtualEntry: {
      sha256: new Bun.CryptoHasher('sha256').update(contents).digest('hex'),
      byteLength: Buffer.byteLength(contents),
    },
    bunVersion: Bun.version,
  };
}

/** Builds a reader-only attended transport with no service/configuration step or fallback. */
export async function transitionSolverReaderInstallation(
  request: SolverReaderTransitionInstallation,
  dependencies: SolverSupervisorInstallerDependencies = DEFAULT_DEPENDENCIES,
  construction?: SolverReaderLayout,
): Promise<readonly SolverSupervisorInstallStep[]> {
  const selection = decodeSolverReaderTransition(request.selection);
  if (
    !HOST.test(request.host) ||
    (construction === undefined &&
      (selection.target.account.name !== 'puni1' ||
        selection.target.account.uid !== 1000 ||
        selection.target.account.gid !== 1000))
  )
    throw new Error('reader transition requires selected production account puni1/1000/1000');
  const observed = await captureSolverReaderArtifact(selection.reader.path);
  if (
    observed.artifact.sha256 !== selection.reader.sha256 ||
    observed.artifact.byteLength !== selection.reader.byteLength
  )
    throw new Error('selected new reader bytes differ');
  const staging =
    construction?.staging ?? `/home/puni1/.cache/wbs-solver/transition-${crypto.randomUUID()}`;
  const layout = construction ?? {
    state: SOLVER_READER_STATE,
    staging,
    bun: SOLVER_SUPERVISOR_BUN,
    reader: SOLVER_SUPERVISOR_BUNDLE.remote,
  };
  const transported = { ...selection, reader: { ...selection.reader, path: `${staging}/reader` } };
  const built = await buildSolverReaderTransitionBundle(transported, layout);
  const operation = {
    path: `${staging}/operation`,
    sha256: new Bun.CryptoHasher('sha256').update(built.bytes).digest('hex'),
    byteLength: built.bytes.byteLength,
  };
  const failureContext = `reader transition attempt=${staging}; operation=${JSON.stringify(operation)}; oldBun=${JSON.stringify(selection.oldBun)}; oldReader=${JSON.stringify(selection.oldReader)}; newReader=${JSON.stringify(selection.reader)}; compiler=${JSON.stringify(built.compiler)}; buildInputs=${JSON.stringify(built.inputs)}; virtualEntry=${JSON.stringify(built.virtualEntry)}; externals=${JSON.stringify(built.externals)}; buildBun=${built.bunVersion}; retain evidence and partial state; no automatic retry/inverse`;
  const quote = quoteInstallShell;
  const shell = (script: string) => ['ssh', request.host, `sh -c ${quote(script)}`];
  const steps: SolverSupervisorInstallStep[] = [
    {
      phase: 'files',
      description: 'create exclusive private inert transition staging',
      argv: shell(
        `set -eu; test -d ${quote(dirname(staging))}; test ! -L ${quote(dirname(staging))}; controller_parent_path=$(realpath -- ${quote(dirname(staging))}) || exit 1; test "$controller_parent_path" = ${quote(dirname(staging))} || exit 1; controller_parent_mode=$(stat -c %a -- ${quote(dirname(staging))}) || exit 1; test "$controller_parent_mode" = 700 || exit 1; controller_parent_uid=$(stat -c %u -- ${quote(dirname(staging))}) || exit 1; test "$controller_parent_uid" = ${quote(String(selection.target.account.uid))} || exit 1; mkdir -m 0700 -- ${quote(staging)} || exit 1`,
      ),
      failureContext,
    },
    {
      phase: 'files',
      description: 'stage selected inert reader',
      argv: ['scp', selection.reader.path, `${request.host}:${transported.reader.path}`],
      failureContext,
    },
    {
      phase: 'files',
      description: 'stage selected transient operation',
      argv: shell(
        `set -eu; (set -C; printf %s ${quote(Buffer.from(built.bytes).toString('base64'))} | base64 -d > ${quote(operation.path)}); chmod 0600 -- ${quote(operation.path)}`,
      ),
      failureContext,
    },
    {
      phase: 'files',
      description: 'transition only the fixed reader under original existing edge.lock',
      argv: shell(`set -eu
${[
  ...new Set([
    dirname(layout.bun),
    dirname(layout.reader),
    layout.state,
    dirname(layout.state),
    staging,
  ]),
]
  .map(
    (parent, index) => `test -d ${quote(parent)} || exit 1
test ! -L ${quote(parent)} || exit 1
test -r ${quote(parent)} && test -x ${quote(parent)} || exit 1
controller_parent_path=$(realpath -- ${quote(parent)}) || exit 1
test "$controller_parent_path" = ${quote(parent)} || exit 1
controller_parent_owner=$(stat -c '%u:%g' -- ${quote(parent)}) || exit 1
test "$controller_parent_owner" = ${quote(`${String(selection.target.account.uid)}:${String(selection.target.account.gid)}`)} || exit 1
controller_parent_${String(index)}=$(stat -c '%d:%i:%f:%u:%g' -- ${quote(parent)}) || exit 1
test -n "$controller_parent_${String(index)}" || exit 1`,
  )
  .join('\n')}
${[layout.bun, layout.reader]
  .map(
    (
      path,
      index,
    ) => `test -f ${quote(path)} && test ! -L ${quote(path)} && test -r ${quote(path)} || exit 1
controller_artifact_path=$(realpath -- ${quote(path)}) || exit 1
test "$controller_artifact_path" = ${quote(path)} || exit 1
controller_artifact_owner=$(stat -c '%a:%u:%g' -- ${quote(path)}) || exit 1
test "$controller_artifact_owner" = ${quote(`755:${String(selection.target.account.uid)}:${String(selection.target.account.gid)}`)} || exit 1
controller_old_${String(index)}=$(stat -c '%d:%i:%f:%u:%g:%s:%y:%z' -- ${quote(path)}) || exit 1
test -n "$controller_old_${String(index)}" || exit 1`,
  )
  .join('\n')}
${[{ path: layout.bun, ...selection.oldBun }, { path: layout.reader, ...selection.oldReader }, transported.reader, operation].map((artifact) => `test -f ${quote(artifact.path)}; test ! -L ${quote(artifact.path)}; controller_artifact_bytes=$(stat -c %s -- ${quote(artifact.path)}) || exit 1; test "$controller_artifact_bytes" = ${quote(String(artifact.byteLength))} || exit 1; printf '%s  %s\\n' ${quote(artifact.sha256)} ${quote(artifact.path)} | sha256sum -c - || exit 1`).join('\n')}
${[
  ...new Set([
    dirname(layout.bun),
    dirname(layout.reader),
    layout.state,
    dirname(layout.state),
    staging,
  ]),
]
  .map(
    (parent, index) => `controller_parent_path=$(realpath -- ${quote(parent)}) || exit 1
test "$controller_parent_path" = ${quote(parent)} || exit 1
controller_parent_closing=$(stat -c '%d:%i:%f:%u:%g' -- ${quote(parent)}) || exit 1
test "$controller_parent_closing" = "$controller_parent_${String(index)}" || exit 1`,
  )
  .join('\n')}
${[layout.bun, layout.reader]
  .map(
    (path, index) => `test ! -L ${quote(path)} || exit 1
controller_artifact_path=$(realpath -- ${quote(path)}) || exit 1
test "$controller_artifact_path" = ${quote(path)} || exit 1
controller_old_closing=$(stat -c '%d:%i:%f:%u:%g:%s:%y:%z' -- ${quote(path)}) || exit 1
test "$controller_old_closing" = "$controller_old_${String(index)}" || exit 1`,
  )
  .join('\n')}
exec ${quote(layout.bun)} ${quote(operation.path)}`),
      failureContext,
    },
  ];
  if (request.execute) {
    const command = dependencies.readerCommand;
    if (command === undefined)
      throw new Error('reader transition requires observed original transport');
    console.log(failureContext);
    for (const [index, step] of steps.entries()) {
      let output: CommandOutput;
      try {
        output = await command(step.argv, index === steps.length - 1);
      } catch (cause) {
        throw new Error(
          `reader transition transport failed; remote settlement is unknown; ${failureContext}`,
          { cause },
        );
      }
      if (output.code !== 0 || output.signal !== null)
        throw new Error(`reader transition transport abnormal or unknown; ${failureContext}`);
    }
  }
  return steps;
}
