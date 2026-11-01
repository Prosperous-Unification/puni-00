import {
  bootstrapObservationCommand,
  migrateObservationCommand,
} from './activation/observation-commands';
import { renderObservationUnitsCommand } from './activation/units/bundle';
import {
  bootstrapAuthorityCommand,
  inspectAuthorityCommand,
  recoverPublicationCommand,
} from './authority/authority-commands';
import { submitAdmission } from './authority/submit-admission';
import { runActivationChecksCommand, spawnCheck } from './check-runs/run-activation-checks';
import { type DashCommand, parseDashCommand, UsageRefusal } from './cli-parser';
import type { Monotonic, WallClock } from './clock';
import { dockerAdapter } from './compute/docker';
import { kubernetesStubAdapter } from './compute/kubernetes';
import {
  reportCapacityCommand,
  REQUEST_TIMEOUT_MS,
  sleepUnlessInterrupted,
} from './compute/report-capacity';
import { sshHostAdapter } from './compute/ssh-host';
import { accountOutcomes } from './ledger/account-outcomes';
import { McpWbsTools } from './mcp/wbs-tools';
import { recordBoundProgress, recordProgress } from './progress/record-progress';
import { runResources } from './resources/command';

type PlanEnrollment = (argv: readonly string[]) => Promise<void>;

/** A resource runtime tool call's deadline, as its HTTP requests had. */
const RESOURCE_CALL_TIMEOUT_MS = 15_000;

/** Everything `runDash` reaches outside its arguments, composed once by `entrypoint.ts`. */
export interface DashDependencies {
  readonly planEnrollment: PlanEnrollment;
  readonly clock: WallClock;
  /** Deadlines for the activation commands; composed now so no later command defaults it. */
  readonly monotonic: Monotonic;
  readonly stdout: { write(text: string): unknown };
}

/** Preserve the fleet CLI enrollment guards, plan bytes and summary without execution. */
export async function runFleetPlan(argv: readonly string[]): Promise<void> {
  const { runPlan } = await import('@tools/fleet-plan');
  // Proof: injecting kubectl apply after planning made the real-entrypoint equivalence
  // test fail on its mutation canary despite matching plan bytes and an exit-zero planner.
  await runPlan(argv);
}

/** The commands `entrypoint.ts` dispatches itself, so `mcp token` never loads this module. */
type EntrypointCommand = Extract<DashCommand, { readonly command: 'mcp' | 'pool' }>;

/** A parsed command `runDash` dispatches. */
export type DispatchedCommand = Exclude<DashCommand, EntrypointCommand>;

type Handlers = {
  readonly [Name in DispatchedCommand['command']]: (
    command: Extract<DispatchedCommand, { readonly command: Name }>,
    deps: DashDependencies,
  ) => Promise<void> | void;
};

function commandDependencies(deps: DashDependencies) {
  return { clock: deps.clock, write: (text: string) => deps.stdout.write(text) };
}

/**
 * One handler per dispatched command. Every delegated handler parses its whole grammar from
 * `argv` before any effect: the authority commands before they open or create a store, the
 * observation store commands before they read state, the check runner before it reads the
 * candidate, the reporter before any connection, and the ledger before it reads a log.
 */
export const dashHandlers: Handlers = {
  'plan-enrollment': (command, deps) =>
    deps.planEnrollment([
      '--operation',
      'enroll',
      '--fleet',
      command.fleet,
      '--observation',
      command.observation,
      '--output',
      command.output,
      '--node',
      command.node,
      '--cluster',
      command.cluster,
      '--inventory-sha256',
      command.inventorySha256,
      '--ansible-variables-sha256',
      command.ansibleVariablesSha256,
      '--known-hosts-sha256',
      command.knownHostsSha256,
    ]),
  'bootstrap-authority': ({ argv }, deps) => {
    bootstrapAuthorityCommand(argv, commandDependencies(deps));
  },
  'inspect-authority': ({ argv }, deps) => {
    inspectAuthorityCommand(argv, commandDependencies(deps));
  },
  'recover-publication': ({ argv }, deps) => {
    recoverPublicationCommand(argv, commandDependencies(deps));
  },
  'submit-admission': ({ argv }, deps) => {
    submitAdmission(argv, commandDependencies(deps));
  },
  'render-observation-units': ({ argv }, deps) => {
    renderObservationUnitsCommand(argv, (text) => deps.stdout.write(text));
  },
  'run-activation-checks': ({ argv }, deps) => {
    runActivationChecksCommand(argv, {
      clock: deps.clock,
      execute: spawnCheck,
      write: (text) => deps.stdout.write(text),
    });
  },
  'bootstrap-observation': ({ argv }, deps) =>
    bootstrapObservationCommand(argv, commandDependencies(deps)),
  'migrate-observation': ({ argv }, deps) =>
    migrateObservationCommand(argv, commandDependencies(deps)),
  'record-progress': ({ argv }, deps) => {
    recordProgress(argv, (text) => deps.stdout.write(text));
  },
  'record-progress-v2': ({ argv }, deps) => {
    recordBoundProgress(argv, (text) => deps.stdout.write(text));
  },
  'account-outcomes': ({ argv }, deps) => {
    accountOutcomes(argv, (text) => deps.stdout.write(text));
  },
  'report-capacity': async ({ argv }, deps) => {
    const PATH = process.env['PATH'] ?? '';
    const sshExecutable = Bun.which('ssh', { PATH });
    if (sshExecutable === null) throw new Error('report-capacity needs ssh on PATH');
    await reportCapacityCommand(
      argv,
      {
        ssh_host: sshHostAdapter({ sshExecutable, environment: process.env }),
        // `docker` is required only once a docker instance opens.
        docker: dockerAdapter({
          dockerExecutable: Bun.which('docker', { PATH }),
          environment: process.env,
        }),
        kubernetes: kubernetesStubAdapter(),
      },
      {
        clock: deps.clock,
        connect: (endpoint, key) =>
          new McpWbsTools({
            endpoint,
            key,
            send: (input, init) => fetch(input, init),
            monotonic: deps.monotonic,
            timeoutMs: REQUEST_TIMEOUT_MS,
            clientName: 'twilight-dash-report-capacity',
          }),
        sleep: sleepUnlessInterrupted,
        write: (text) => deps.stdout.write(text),
      },
    );
  },
  resources: async ({ argv }, deps) => {
    process.exitCode = await runResources(
      argv,
      deps.clock,
      (text) => deps.stdout.write(text),
      (endpoint, key) =>
        new McpWbsTools({
          endpoint,
          key,
          send: (input, init) => fetch(input, init),
          monotonic: deps.monotonic,
          timeoutMs: RESOURCE_CALL_TIMEOUT_MS,
          clientName: 'twilight-dash-resources',
        }),
    );
  },
};

/**
 * Dispatches one parsed Dash command (see {@link parseDashCommand}) to its handler in
 * {@link dashHandlers}: `plan-enrollment` through the fixed fleet planner with only the reviewed
 * enrollment operation; the four authority commands through the runtime admission authority; the
 * two observation store commands through the activation controller's store;
 * `render-observation-units` through the observation unit renderer; `run-activation-checks`
 * through the stateless check runner, which spawns each check with {@link spawnCheck};
 * `record-progress` and `record-progress-v2` record explicit operator assertions;
 * `account-outcomes` writes the period's efficiency breakdown; `report-capacity` runs the compute
 * providers' capacity reporter until it exits; `resources` runs the managed resource runtime.
 * `mcp` and `pool` never reach here, because `entrypoint.ts` dispatches them before loading
 * this module.
 *
 * @throws Error `Unsupported Dash command: <name>` for a command no handler takes, which only a
 * JavaScript caller bypassing the parser can pass.
 */
export async function runDash(command: DispatchedCommand, deps: DashDependencies): Promise<void> {
  // A JavaScript caller can omit what the type requires; refuse rather than reach for a default.
  // Proof: giving `clock` a `wallClock()` default here failed `only clock.ts reads the wall
  // clock` naming `cli.ts`; dropping this check let `runDash refuses missing dependencies`
  // reach the dispatcher (2026-10-11); dropping `monotonic` from it did the same (2026-10-12).
  for (const name of ['planEnrollment', 'clock', 'monotonic', 'stdout'] as const) {
    if ((deps as Partial<DashDependencies> | undefined)?.[name] === undefined) {
      throw new Error(`Dash dependency is required: ${name}`);
    }
  }
  const name: string = command.command;
  // Proof: deleting this guard made `runDash refuses a command no handler takes` call
  // `undefined` and throw a TypeError instead of the Dash refusal (2026-11-01).
  if (!Object.hasOwn(dashHandlers, name)) throw new Error(`Unsupported Dash command: ${name}`);
  // The handler table is keyed by the same union member that selected the handler, a pairing
  // TypeScript cannot follow through an indexed access; the mapped type above checks each entry.
  const handler = dashHandlers[command.command] as (
    command: DispatchedCommand,
    deps: DashDependencies,
  ) => Promise<void> | void;
  // Proof: injecting a fleet call here failed `dispatcher uses no clocks or fleet planner`
  // on its real dispatcher dependency canary (2026-10-15).
  await handler(command, deps);
}

/**
 * Parses `argv` with {@link parseDashCommand} and dispatches it with {@link runDash}, for callers
 * that hold a command line rather than a parsed command, such as the dispatcher tests.
 *
 * @throws UsageRefusal before any handler runs when the line is refused, prints only help, or
 * names `mcp` or `pool`, which only `entrypoint.ts` dispatches.
 */
export async function runDashArguments(
  argv: readonly string[],
  deps: DashDependencies,
): Promise<void> {
  const command = parseDashCommand(argv);
  if (command.command === 'mcp' || command.command === 'pool') {
    throw new UsageRefusal(`${command.command} is dispatched by entrypoint.ts`);
  }
  await runDash(command, deps);
}
