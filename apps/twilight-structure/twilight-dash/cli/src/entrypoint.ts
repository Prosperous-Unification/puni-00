import { wallClock } from './authority/clock';
import { runDash, runFleetPlan } from './cli';

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
  await runDash(process.argv.slice(2), {
    clock: wallClock(),
    planEnrollment: runFleetPlan,
    stdout: process.stdout,
  });
} catch (cause) {
  process.stderr.write(refusalLine(cause));
  process.exitCode = 1;
}
