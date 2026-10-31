import {
  assertNoEdgeOwner,
  edgeStateDirectory,
  isRetainedEdgeOwnerRefusal,
  requireInheritedEdgeLock,
} from './lib/edge-admission';
import { readOrdinaryEdgePolicy } from './lib/edge-policy';
import {
  withSolverPolicyAdmission,
  withSolverRuntimeAdmission,
} from './lib/solver-runtime-admission';
import { decodeSolverSupervisorConfig } from './lib/solver-supervisor-config';
import { SOLVER_READER_STATE } from './lib/solver-supervisor-install-contract';
import {
  type SolverSupervisorRuntimeOptions,
  startSolverSupervisor,
} from './lib/solver-supervisor-runtime';

export const SUPERVISOR_CONFIG_MAX_BYTES = 256 * 1024;
const DIGEST_PINNED_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;

export type SolverSupervisorMappingPreflight =
  | {
      config: string;
      env: 'prod';
      callerName: 'be-01-blue' | 'be-01-green';
      image: string;
    }
  | { config: string; env: 'dev'; solverImage: string };

export interface SolverSupervisorEntrypointDependencies {
  read(path: string): Promise<Uint8Array>;
  start(options: SolverSupervisorRuntimeOptions): Promise<unknown>;
  connectionError(error: Error): void;
}

function defect(message: string): Error {
  return new Error(`solver supervisor: ${message}`);
}

function requiredOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (value === undefined || value === '') throw defect(`--${name}= is required`);
  return value;
}

/** Parses the deployment-only mode without widening the service entrypoint. */
export function parseSolverSupervisorMappingPreflight(
  argv: readonly string[],
): SolverSupervisorMappingPreflight {
  const options = new Map<string, string>();
  for (const raw of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match === null) throw defect(`unexpected mapping-preflight argument ${raw}`);
    const key = match[1];
    const value = match[2];
    if (options.has(key)) throw defect(`duplicate --${key}`);
    options.set(key, value);
  }
  const config = requiredOption(options, 'config');
  const env = requiredOption(options, 'preflight');
  if (env === 'prod') {
    const callerName = requiredOption(options, 'caller-name');
    if (callerName !== 'be-01-blue' && callerName !== 'be-01-green') {
      throw defect('prod --caller-name must be be-01-blue or be-01-green');
    }
    const image = requiredOption(options, 'image');
    if (!DIGEST_PINNED_IMAGE.test(image)) throw defect('prod --image is not digest-pinned');
    if (options.size !== 4) throw defect('prod mapping preflight has an unknown argument');
    return { config, env, callerName, image };
  }
  if (env === 'dev') {
    const solverImage = requiredOption(options, 'solver-image');
    if (!DIGEST_PINNED_IMAGE.test(solverImage)) {
      throw defect('dev --solver-image is not digest-pinned');
    }
    if (options.size !== 3) throw defect('dev mapping preflight has an unknown argument');
    return { config, env, solverImage };
  }
  throw defect('--preflight must be prod or dev');
}

/**
 * Proves the installed map names the exact image a deployment is about to use.
 *
 * Prod's solver image is the caller image because both executables ship in one
 * version-locked be-01 artifact. Dev names the independently built compatible
 * artifact explicitly because its source container is not a solver image.
 */
export function assertSolverSupervisorMapping(
  bytes: Uint8Array,
  expected: SolverSupervisorMappingPreflight,
): void {
  const options = decodeSolverSupervisorConfigBytes(bytes);
  if (expected.env === 'prod') {
    const mapped = options.imageFor({
      id: '0'.repeat(64),
      name: expected.callerName,
      image: expected.image,
    });
    // Proof: solver-supervisor.test.ts substitutes another digest for the
    // exact colour and then a different solver image for that valid caller.
    if (mapped !== expected.image) {
      throw defect(`prod ${expected.callerName} solver image does not match its caller image`);
    }
    return;
  }
  const mapped = options.imageFor({
    id: '0'.repeat(64),
    name: 'wbs-dev-src',
    image: 'wbs-dev-src:1',
  });
  // Proof: solver-supervisor.test.ts changes only the expected compatible
  // image and requires deployment refusal.
  if (mapped !== expected.solverImage) {
    throw defect('dev solver image mapping is incompatible with the requested contract image');
  }
}

export type SolverSupervisorArgs =
  { config: string; admission: 'ordinary' } | { config: string; admission: 'policy' };

// Proof: startup-arguments omission admitted another admission value in solver-supervisor.test.ts (exit 1).
export function parseSolverSupervisorArgs(argv: readonly string[]): SolverSupervisorArgs {
  if (
    (argv.length !== 1 && (argv.length !== 2 || argv[1] !== '--admission=policy')) ||
    !argv[0]?.startsWith('--config=')
  ) {
    throw defect('expected exactly --config=/absolute/path');
  }
  const path = argv[0].slice('--config='.length);
  if (!path.startsWith('/') || path.length > 4096 || path.includes('\0')) {
    throw defect('config path must be a bounded absolute path');
  }
  return { config: path, admission: argv.length === 2 ? 'policy' : 'ordinary' };
}

export function decodeSolverSupervisorConfigBytes(
  bytes: Uint8Array,
  now?: () => number,
): SolverSupervisorRuntimeOptions {
  if (bytes.byteLength === 0 || bytes.byteLength > SUPERVISOR_CONFIG_MAX_BYTES) {
    throw defect(`config must contain 1 through ${String(SUPERVISOR_CONFIG_MAX_BYTES)} bytes`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw defect('config is not valid UTF-8');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw defect('config is not valid JSON');
  }
  return decodeSolverSupervisorConfig(value, now);
}

async function readConfig(path: string): Promise<Uint8Array> {
  const bytes = await Bun.file(path)
    .slice(0, SUPERVISOR_CONFIG_MAX_BYTES + 1)
    .arrayBuffer();
  return new Uint8Array(bytes);
}

const DEFAULT_DEPENDENCIES: SolverSupervisorEntrypointDependencies = {
  read: readConfig,
  start: (options) => startSolverSupervisor(options),
  connectionError: (error) => {
    console.error(`[wbs-solver-supervisor] connection refused: ${error.message}`);
  },
};

/**
 * Reads one bounded host-owned document, validates it completely, then returns
 * at listener readiness. This startup seam does not own runtime admission;
 * the actual CLI retains it for its entire process lifetime.
 */
export async function runSolverSupervisor(
  argv: readonly string[],
  dependencies: SolverSupervisorEntrypointDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const { config: path } = parseSolverSupervisorArgs(argv);
  const options = decodeSolverSupervisorConfigBytes(await dependencies.read(path));
  await dependencies.start({
    ...options,
    connection: {
      ...options.connection,
      onConnectionError: (error) => {
        dependencies.connectionError(error);
      },
    },
  });
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const operation =
    argv.length === 1 && argv[0] === '--check-edge-policy-inherited'
      ? (async () => {
          if (edgeStateDirectory() !== SOLVER_READER_STATE)
            throw new Error('inherited reader requires fixed canonical state');
          const admission = await requireInheritedEdgeLock();
          await readOrdinaryEdgePolicy(admission.stateDirectory);
          await assertNoEdgeOwner(admission.stateDirectory);
          console.log('[wbs-solver-supervisor] inherited ordinary edge policy ok');
        })()
      : argv.length === 1 && argv[0] === '--check-edge-policy'
        ? (async () => {
            const directory = edgeStateDirectory();
            // Proof: readonly-policy-check omission accepted absent policy in
            // solver-runtime-admission.proc.test.ts (exit 1).
            await readOrdinaryEdgePolicy(directory);
            // Proof: readonly-marker omission accepted retained owner in solver-runtime-admission.proc.test.ts (exit 1).
            await assertNoEdgeOwner(directory);
            console.log('[wbs-solver-supervisor] ordinary edge policy ok');
          })()
        : argv.some((argument) => argument.startsWith('--preflight='))
          ? (async (): Promise<void> => {
              const expected = parseSolverSupervisorMappingPreflight(argv);
              assertSolverSupervisorMapping(await readConfig(expected.config), expected);
              console.log(`[wbs-solver-supervisor] ${expected.env} mapping preflight ok`);
            })()
          : // Proof: omitted CLI admission reached missing config under retained markers;
            // solver-runtime-admission.proc.test.ts observed owner callbacks during paused startup.
            (async () => {
              const { admission } = parseSolverSupervisorArgs(argv);
              // Proof: cli-policy-mode omission reached config without a policy in
              // solver-runtime-admission.proc.test.ts (exit 1).
              const admit =
                admission === 'policy' ? withSolverPolicyAdmission : withSolverRuntimeAdmission;
              await admit(async () => {
                await runSolverSupervisor(argv);
                // startSolverSupervisor returns at readiness. Retain the descriptor after
                // that return and through all listener/request continuations. No signal
                // handler unlocks it: the kernel closes it only when this process exits.
                // Proof: removing lifetime wait lets the real ready CLI lose its lock
                // in solver-runtime-admission.proc.test.ts (SIGTERM/SIGKILL cases).
                await new Promise<never>(() => {
                  setInterval(() => undefined, 60_000);
                });
              });
            })();
  operation.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown failure';
    console.error(`[wbs-solver-supervisor] startup failed: ${message}`);
    // Proof: controlled refusal maps to 78; config, unknown and lock-only errors stay 1 in real CLI tests.
    process.exit(isRetainedEdgeOwnerRefusal(error) ? 78 : 1);
  });
}
