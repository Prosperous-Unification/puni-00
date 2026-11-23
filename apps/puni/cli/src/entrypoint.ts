import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { type Command, readFailureStatus, readInvocation } from './cli-parser';
import { type Context, executeCommand } from './execute-command';

/**
 * Owned lint, preparation, local PUNI installation, development, Browser/Performance levels, Forge supervision and lock operations may retain terminal
 * native references; other operations drain.
 */
export interface Completion {
  readonly kind: 'drain' | 'exit';
  readonly status: number;
}

function requiresExit(command: Command | undefined): boolean {
  if (
    command?.tool === 'dash' &&
    (command.request.command === 'install-puni' ||
      command.request.command === 'dev' ||
      command.request.command === 'dev-env' ||
      command.request.command === 'browser' ||
      command.request.command === 'performance')
  )
    return true;
  if (
    command?.tool === 'dash' &&
    command.request.command === 'ops' &&
    command.request.words.startsWith('lock ')
  )
    return true;
  return (
    command?.tool === 'burokrat' &&
    (command.request.command === 'lint' ||
      // Proof: removing this audit membership failed
      // `burokrat forwards typed audit-push once without a caller required override: invalid`
      // on exit versus drain; the mock completed once at 37, not a native-exit proof.
      command.request.command === 'audit-push' ||
      // Proof: c28-root-preparation-exit-normal; injected fault failed `actual root prepare-activation exits after unconfirmed Git cleanup before fixture reaping`; restoration passed.
      command.request.command === 'prepare-activation' ||
      // Proof: c28-root-preparation-exit-relocation; injected fault failed `actual root prepare-relocation-activation exits after unconfirmed Git cleanup before fixture reaping`; restoration passed.
      command.request.command === 'prepare-relocation-activation')
  );
}

/** Print one failure line without a source excerpt, stack or nested cause messages. */
function formatFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return (
    'error: ' +
    message
      // Proof: root-error-controls; `formats an operation error as one plain line without nested cause messages` failed under its recorded production fault and passed after restoration.
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      // Proof: root-error-whitespace; `formats an operation error as one plain line without nested cause messages` failed under its recorded production fault and passed after restoration.
      .replace(/\s+/gu, ' ')
      .trim() +
    '\n'
  );
}

/**
 * Parse once, return discovery without runtime loading, and await one typed provider operation.
 * Context is explicit so development tests can select real external fixture installations.
 * Usage statuses depend on the parsed invocation; unexpected Navigator failures remain1.
 * Lint, preparation, development and local PUNI installation owners use real output; their completion tells
 * the executable to terminate only after that owner settles. Reusable callers receive the
 * completion without exit.
 */
export async function main(args: readonly string[], context: Context): Promise<Completion> {
  let command: Command | undefined;
  let readDevelopmentDiagnostic:
    NonNullable<Context['developmentIO']>['readDiagnosticAttempt'] | undefined;
  try {
    // Proof: root-main-lazy; `["--help"] discovers through the actual root without provider runtimes, clock, network or PATH` failed under its recorded production fault and passed after restoration.
    // Proof: root-main-args; `[] keeps invocation-aware usage status under misleading ambient argv` failed under its recorded production fault and passed after restoration.
    const invocation = readInvocation(args, (chunk) => {
      context.stdout(chunk);
    });
    // Proof: root-main-discovery; `["--help"] discovers through the actual root without provider runtimes, clock, network or PATH` failed under its recorded production fault and passed after restoration.
    if (invocation.kind === 'printed') return { kind: 'drain', status: 0 };
    command = invocation.command;
    if (
      command.tool === 'dash' &&
      (command.request.command === 'dev' || command.request.command === 'dev-env')
    ) {
      const capability = context.developmentIO;
      if (capability !== undefined)
        // Proof: `actual development main retains its diagnostic lookup across caller capability
        // mutation` passed its real owned diagnostic/baseline Completion and mutation-before-record
        // witnesses, then read replacement1/initial0 and rejected that exact replacement Error
        // instead of returning exit Completion1 (6 expects). This owns that lookup mutation,
        // not native factory retention, every reporting failure or later stderr assertions.
        readDevelopmentDiagnostic = capability.readDiagnosticAttempt.bind(capability);
    }
    // Proof: root-main-await; `awaits the selected typed operation without changing global status or reparsing ambient argv` failed because main returned before lazy runtime entry and passed after restoration; this proves dispatch awaiting.
    // Proof: root-main-status; `dash forwards actual native ops refusal status through the typed root` failed under its recorded production fault and passed after restoration.
    const status = await executeCommand(command, context);
    return {
      kind: requiresExit(command) ? 'exit' : 'drain',
      status,
    };
  } catch (cause) {
    const reported = readDevelopmentDiagnostic?.();
    if (reported === undefined || !Object.is(reported.cause, cause))
      context.stderr(formatFailure(cause));
    return {
      kind: requiresExit(command) ? 'exit' : 'drain',
      status: readFailureStatus(cause, command),
    };
  }
}

// Proof: root-main-import-guard; `imports the root executable without running ambient argv or assigning global status` failed under its recorded production fault and passed after restoration.
if (import.meta.main) {
  const entrypoint = import.meta.path;
  const directory = dirname(entrypoint);
  const environment = { ...process.env };
  const nativeStdout = Bun.stdout,
    nativeStderr = Bun.stderr;
  let developmentFailure: ReturnType<
    NonNullable<Context['developmentIO']>['readDiagnosticAttempt']
  >;
  const developmentIO: NonNullable<Context['developmentIO']> = {
    stdin: 0,
    stdout: 1,
    stderr: 2,
    openStdout: nativeStdout.writer.bind(nativeStdout),
    openStderr: nativeStderr.writer.bind(nativeStderr),
    recordDiagnosticAttempt: (cause, outcome) => {
      developmentFailure = { cause, outcome };
    },
    readDiagnosticAttempt: () => developmentFailure,
  };
  const completion = await main(process.argv.slice(2), {
    installation: { directory, entrypoint },
    lookup: { directory, path: environment['PATH'] },
    callerDirectory: process.cwd(),
    runtime: process.execPath,
    temporaryDirectory: tmpdir(),
    environment,
    developmentIO,
    stdout: (chunk) => {
      process.stdout.write(chunk);
    },
    stderr: (chunk) => {
      process.stderr.write(chunk);
    },
  });
  // Proof: root-main-terminal-exit; `exits the actual root after unconfirmed lint Git preflight before fixture cleanup` failed under its recorded production fault and passed after restoration.
  if (completion.kind === 'exit') process.exit(completion.status);
  process.exitCode = completion.status;
}
