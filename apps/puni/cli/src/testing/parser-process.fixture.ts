import { readInvocation, UsageRefusal } from '../cli-parser';

try {
  const invocation = readInvocation(process.argv.slice(2), (chunk) => process.stdout.write(chunk));
  if (invocation.kind === 'command') process.stdout.write(JSON.stringify(invocation.command));
} catch (cause) {
  if (!(cause instanceof UsageRefusal)) throw cause;
  process.stderr.write(`error: ${cause.message}\n`);
  process.exitCode = cause.exitCode;
}
