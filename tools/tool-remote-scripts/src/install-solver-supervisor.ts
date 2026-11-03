import type { BundleFile } from './lib/deploy-contract';
import { requireInheritedEdgeLock } from './lib/edge-admission';
import {
  assertSolverSupervisorBunVersion,
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUN_SOURCE,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SOCKET,
  SOLVER_SUPERVISOR_UNIT,
  SOLVER_SUPERVISOR_UNIT_SOURCE,
} from './lib/solver-supervisor-install-contract';
import {
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
  stdout: string;
  stderr: string;
}

export interface SolverSupervisorInstallerDependencies {
  read(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  command(argv: readonly string[], inherit?: boolean): Promise<CommandOutput>;
  hash(path: string): Promise<string>;
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
  return { code, stdout, stderr };
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
  const args = parseSolverSupervisorInstallArgs(process.argv.slice(2));
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
