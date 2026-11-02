import { readDashInvocation, UsageRefusal } from './cli-parser';
import { monotonicClock, wallClock } from './clock';

/**
 * One `error: ` line, Bun's own prefix for an uncaught error, without its stack trace or source
 * excerpt. The cause chain contributes only its error codes (`ENOENT`, `EACCES`), never cause
 * messages, which may quote input bytes.
 */
function refusalLine(cause: unknown): string {
  const codes: string[] = [];
  let current: unknown = cause instanceof Error ? cause.cause : undefined;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if ('code' in current && typeof current.code === 'string') codes.push(current.code);
    current = current.cause;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return `error: ${message}${codes.length === 0 ? '' : ` [${codes.join(', ')}]`}\n`;
}

try {
  const invocation = readDashInvocation(process.argv.slice(2), (text) => {
    process.stdout.write(text);
  });
  const command = invocation.kind === 'command' ? invocation.command : undefined;
  if (command?.command === 'mcp') {
    // `mcp token` runs as Claude Code's `headersHelper`, whose 10 s budget counts from spawn:
    // it loads only its own modules (about 0.1 s), not `cli.ts`'s command graph (about 2.5 s,
    // measured 2026-10-27).
    // Proof: not dispatching `mcp` made `the entrypoint prints only the header map…` see exit 1
    // where 0 was expected (2026-10-27).
    const { runMcpCommand } = await import('./mcp/token-command');
    await runMcpCommand([command.subcommand, ...command.argv], {
      send: (input, init) => fetch(input, init),
      monotonic: monotonicClock(),
      sleep: (milliseconds) => Bun.sleep(milliseconds),
      environment: process.env,
      write: (text) => process.stdout.write(text),
    });
  } else if (command?.command === 'pool') {
    const { runPoolCommand, systemPoolFiles } = await import('./mcp/pool-import');
    await runPoolCommand([command.subcommand, ...command.argv], {
      send: (input, init) => fetch(input, init),
      write: (text) => process.stdout.write(text),
      helper: [process.execPath, import.meta.path],
      sleep: (milliseconds) => Bun.sleep(milliseconds),
      files: systemPoolFiles,
    });
  } else if (command !== undefined) {
    const { runDash, runFleetPlan } = await import('./cli');
    await runDash(command, {
      clock: wallClock(),
      monotonic: monotonicClock(),
      planEnrollment: runFleetPlan,
      stdout: process.stdout,
    });
  }
} catch (cause) {
  process.stderr.write(refusalLine(cause));
  // `ops` keeps the shell lock's exit codes (`dash-host-jobs` J13), where a usage error is 64.
  // Proof: exiting 1 here failed `an ops usage refusal exits 64` (cli.test.ts) (2026-11-01).
  process.exitCode = cause instanceof UsageRefusal && process.argv[2] === 'ops' ? 64 : 1;
}
