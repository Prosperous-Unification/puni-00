import { dirname } from 'node:path';

import type { BundleFile } from './lib/deploy-contract';
import { requireInheritedEdgeLock } from './lib/edge-admission';
import {
  captureSolverReaderArtifact,
  decodeSolverReaderSelection,
  runSolverReaderTransport,
  type SolverReaderLayout,
  type SolverReaderSelection,
} from './lib/solver-reader-preparation';
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
        `set -eu; install -d -m 0700 /home/puni1/.cache/wbs-solver; mkdir -m 0700 -- ${quoteInstallShell(staging)}`,
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
      argv: shell(buildSolverSupervisorInstallOperation(files, hashes, staging, socketPath, local)),
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
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, signal: child.signalCode, stdout, stderr };
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

  for (const step of plan.filter((candidate) => candidate.phase !== 'preflight')) {
    await requireCommand(step, dependencies, args.local === true);
  }
  return plan;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === '--prepare-first-reader') {
    const plan = await runSolverSupervisorInstaller(argv);
    for (const step of plan) console.log(`  ${step.description}`);
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
  if (argv[0] === '--prepare-first-reader')
    return prepareSolverReaderInstallation(
      parseSolverReaderInstallArgs(argv),
      dependencies,
      construction,
    );
  return installSolverSupervisor(parseSolverSupervisorInstallArgs(argv), dependencies);
}
