import { bootstrapAuthorityCommand, inspectAuthorityCommand } from './authority/authority-commands';
import type { AuthorityClock } from './authority/authority-store';
import { submitAdmission } from './authority/submit-admission';

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
  readonly clock: AuthorityClock;
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
 * Dispatches enrollment planning through the fixed fleet planner and the three authority
 * commands (`bootstrap-authority`, `inspect-authority`, `submit-admission`) through the runtime
 * authority; every other command refuses before any effect.
 */
export async function runDash(argv: readonly string[], deps: DashDependencies): Promise<void> {
  // A JavaScript caller can omit what the type requires; refuse rather than reach for a default.
  // Proof: giving `clock` a `wallClock()` default here failed `only clock.ts reads the wall
  // clock` naming `cli.ts`; dropping this check let `runDash refuses missing dependencies`
  // reach the dispatcher (2026-10-11).
  for (const name of ['planEnrollment', 'clock', 'stdout'] as const) {
    if ((deps as Partial<DashDependencies> | undefined)?.[name] === undefined) {
      throw new Error(`Dash dependency is required: ${name}`);
    }
  }
  const [command, ...argumentsAfterCommand] = argv;
  const authority = { clock: deps.clock, write: (text: string) => deps.stdout.write(text) };
  // Each authority command parses its whole grammar before it opens or creates a store.
  if (command === 'bootstrap-authority') {
    bootstrapAuthorityCommand(argumentsAfterCommand, authority);
    return;
  }
  if (command === 'inspect-authority') {
    inspectAuthorityCommand(argumentsAfterCommand, authority);
    return;
  }
  if (command === 'submit-admission') {
    submitAdmission(argumentsAfterCommand, authority);
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
