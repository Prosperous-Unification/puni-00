import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { type Command, readFailureStatus, readInvocation } from './cli-parser';
import { type Context, executeCommand } from './execute-command';

/** Lint may retain bounded-failure native references; other operations use ordinary draining. */
export interface Completion {
  readonly kind: 'drain' | 'lint';
  readonly status: number;
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
 * Lint's native owner uses real output; its completion tells the executable to terminate
 * only after that owner settles. Reusable callers receive the completion without exit.
 */
export async function main(args: readonly string[], context: Context): Promise<Completion> {
  let command: Command | undefined;
  try {
    // Proof: root-main-lazy; `["--help"] discovers through the actual root without provider runtimes, clock, network or PATH` failed under its recorded production fault and passed after restoration.
    // Proof: root-main-args; `[] keeps invocation-aware usage status under misleading ambient argv` failed under its recorded production fault and passed after restoration.
    const invocation = readInvocation(args, (chunk) => {
      context.stdout(chunk);
    });
    // Proof: root-main-discovery; `["--help"] discovers through the actual root without provider runtimes, clock, network or PATH` failed under its recorded production fault and passed after restoration.
    if (invocation.kind === 'printed') return { kind: 'drain', status: 0 };
    command = invocation.command;
    // Proof: root-main-await; `awaits the selected typed operation without changing global status or reparsing ambient argv` failed because main returned before lazy runtime entry and passed after restoration; this proves dispatch awaiting.
    // Proof: root-main-status; `dash forwards actual native ops refusal status through the typed root` failed under its recorded production fault and passed after restoration.
    const status = await executeCommand(command, context);
    return {
      kind: command.tool === 'burokrat' && command.request.command === 'lint' ? 'lint' : 'drain',
      status,
    };
  } catch (cause) {
    context.stderr(formatFailure(cause));
    return {
      kind: command?.tool === 'burokrat' && command.request.command === 'lint' ? 'lint' : 'drain',
      status: readFailureStatus(cause, command),
    };
  }
}

// Proof: root-main-import-guard; `imports the root executable without running ambient argv or assigning global status` failed under its recorded production fault and passed after restoration.
if (import.meta.main) {
  const entrypoint = import.meta.path;
  const directory = dirname(entrypoint);
  const environment = { ...process.env };
  const completion = await main(process.argv.slice(2), {
    installation: { directory, entrypoint },
    lookup: { directory, path: environment['PATH'] },
    callerDirectory: process.cwd(),
    runtime: process.execPath,
    temporaryDirectory: tmpdir(),
    environment,
    stdout: (chunk) => {
      process.stdout.write(chunk);
    },
    stderr: (chunk) => {
      process.stderr.write(chunk);
    },
  });
  // Proof: root-main-terminal-exit; `exits the actual root after unconfirmed lint Git preflight before fixture cleanup` failed under its recorded production fault and passed after restoration.
  if (completion.kind === 'lint') process.exit(completion.status);
  process.exitCode = completion.status;
}
