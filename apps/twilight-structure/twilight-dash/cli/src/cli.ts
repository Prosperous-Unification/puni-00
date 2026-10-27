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
import type { Monotonic, WallClock } from './clock';
import { dockerAdapter } from './compute/docker';
import { kubernetesStubAdapter } from './compute/kubernetes';
import { reportCapacityCommand, sleepUnlessInterrupted } from './compute/report-capacity';
import { sshHostAdapter } from './compute/ssh-host';
import { accountOutcomes } from './ledger/account-outcomes';
import { recordBoundProgress, recordProgress } from './progress/record-progress';
import { runResources } from './resources/command';

const enrollmentFlags = [
  '--fleet',
  '--observation',
  '--output',
  '--node',
  '--cluster',
  '--inventory-sha256',
  '--ansible-variables-sha256',
  '--known-hosts-sha256',
] as const;

type PlanEnrollment = (argv: readonly string[]) => Promise<void>;

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

/**
 * Dispatches Dash's commands: `plan-enrollment` through the fixed fleet planner; the four
 * authority commands (`bootstrap-authority`, `inspect-authority`, `recover-publication`,
 * `submit-admission`) through the runtime admission authority; the two observation store commands
 * (`bootstrap-observation`, `migrate-observation`) through the activation controller's store;
 * `render-observation-units` through the observation unit renderer; and `run-activation-checks`
 * through the stateless check runner, which spawns each check with {@link spawnCheck}.
 * `record-progress` and `record-progress-v2` record explicit operator assertions;
 * `account-outcomes` writes the period's efficiency breakdown; `report-capacity` runs the compute
 * providers' capacity reporter until it exits. Every other command refuses before any effect;
 * `mcp` never reaches here, because `entrypoint.ts` dispatches it before loading this module.
 */
export async function runDash(argv: readonly string[], deps: DashDependencies): Promise<void> {
  // A JavaScript caller can omit what the type requires; refuse rather than reach for a default.
  // Proof: giving `clock` a `wallClock()` default here failed `only clock.ts reads the wall
  // clock` naming `cli.ts`; dropping this check let `runDash refuses missing dependencies`
  // reach the dispatcher (2026-10-11); dropping `monotonic` from it did the same (2026-10-12).
  for (const name of ['planEnrollment', 'clock', 'monotonic', 'stdout'] as const) {
    if ((deps as Partial<DashDependencies> | undefined)?.[name] === undefined) {
      throw new Error(`Dash dependency is required: ${name}`);
    }
  }
  const [command, ...argumentsAfterCommand] = argv;
  if (command === 'resources') {
    process.exitCode = await runResources(argumentsAfterCommand, deps.clock, (text) =>
      deps.stdout.write(text),
    );
    return;
  }
  const commandDependencies = {
    clock: deps.clock,
    write: (text: string) => deps.stdout.write(text),
  };
  // Proof: injecting a fleet call here failed `dispatcher uses no clocks or fleet planner`
  // on its real dispatcher dependency canary (2026-10-15).
  // The ledger command parses its whole grammar before it reads a log, a card or the repository.
  if (command === 'account-outcomes') {
    accountOutcomes(argumentsAfterCommand, (text) => deps.stdout.write(text));
    return;
  }
  if (command === 'record-progress-v2') {
    recordBoundProgress(argumentsAfterCommand, (text) => deps.stdout.write(text));
    return;
  }
  if (command === 'record-progress') {
    recordProgress(argumentsAfterCommand, (text) => deps.stdout.write(text));
    return;
  }
  // Each authority command parses its whole grammar before it opens or creates a store.
  if (command === 'bootstrap-authority') {
    bootstrapAuthorityCommand(argumentsAfterCommand, commandDependencies);
    return;
  }
  if (command === 'inspect-authority') {
    inspectAuthorityCommand(argumentsAfterCommand, commandDependencies);
    return;
  }
  if (command === 'recover-publication') {
    recoverPublicationCommand(argumentsAfterCommand, commandDependencies);
    return;
  }
  if (command === 'submit-admission') {
    submitAdmission(argumentsAfterCommand, commandDependencies);
    return;
  }
  // Each observation store command parses its whole grammar before it reads any state.
  if (command === 'bootstrap-observation') {
    await bootstrapObservationCommand(argumentsAfterCommand, commandDependencies);
    return;
  }
  if (command === 'migrate-observation') {
    await migrateObservationCommand(argumentsAfterCommand, commandDependencies);
    return;
  }
  // The check runner parses its whole grammar before it reads the candidate or spawns anything.
  if (command === 'run-activation-checks') {
    runActivationChecksCommand(argumentsAfterCommand, {
      clock: deps.clock,
      execute: spawnCheck,
      write: (text) => deps.stdout.write(text),
    });
    return;
  }
  // The reporter loads its whole configuration before any connection or request.
  if (command === 'report-capacity') {
    const PATH = process.env['PATH'] ?? '';
    const sshExecutable = Bun.which('ssh', { PATH });
    if (sshExecutable === null) throw new Error('report-capacity needs ssh on PATH');
    await reportCapacityCommand(
      argumentsAfterCommand,
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
        send: (request) => fetch(request),
        sleep: sleepUnlessInterrupted,
        write: (text) => deps.stdout.write(text),
      },
    );
    return;
  }
  if (command === 'render-observation-units') {
    renderObservationUnitsCommand(argumentsAfterCommand, (text) => deps.stdout.write(text));
    return;
  }
  if (command !== 'plan-enrollment') {
    // Proof: bypassing this allowlist made the unsupported-command dispatcher negative invoke
    // the fleet planner for apply/discover/build/deploy instead of refusing at the Dash boundary.
    throw new Error(`Unsupported Dash command: ${command}`);
  }

  const allowed = new Set<string>(enrollmentFlags);
  const values = new Map<string, string>();
  for (let position = 0; position < argumentsAfterCommand.length; position += 2) {
    const flag = argumentsAfterCommand.at(position);
    if (flag === undefined || !allowed.has(flag)) {
      // Proof: bypassing this allowlist made all four unsupported-flag dispatcher negatives
      // call the planner instead of refusing `--operation` or executable selection.
      throw new Error(`Unsupported Dash flag: ${String(flag)}`);
    }
    if (values.has(flag)) {
      // Proof: bypassing this guard made the duplicate-node dispatcher negative call the fleet
      // planner with the last node value instead of refusing the ambiguous target.
      throw new Error(`Duplicate Dash flag: ${flag}`);
    }
    const value = argumentsAfterCommand.at(position + 1);
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      // Proof: bypassing this guard made the valueless-flag negative lose its boundary
      // refusal and pass an undefined value to the required-flag stage.
      throw new Error(`Dash flag has no value: ${flag}`);
    }
    values.set(flag, value);
  }

  const fleetArguments: string[] = ['--operation', 'enroll'];
  for (const flag of enrollmentFlags) {
    const value = values.get(flag);
    if (value === undefined) {
      // Proof: bypassing this check made all eight missing-flag dispatcher negatives call
      // the planner with an undefined required argument instead of refusing at Dash.
      throw new Error(`Missing required Dash flag: ${flag}`);
    }
    fleetArguments.push(flag, value);
  }
  await deps.planEnrollment(fleetArguments);
}
