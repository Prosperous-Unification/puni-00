import { runNavigator } from './cli';
import { readNavigatorInvocation, UsageRefusal } from './cli-parser';

try {
  const invocation = readNavigatorInvocation(process.argv.slice(2), (text) => {
    process.stdout.write(text);
  });
  if (invocation.kind === 'command') {
    process.stdout.write(`${await runNavigator(invocation.command)}\n`);
  }
} catch (failure) {
  if (!(failure instanceof UsageRefusal)) throw failure;
  process.stderr.write(`error: ${failure.message}\n`);
  // Proof: exiting 1 here failed `refuses an unsupported command before any read, exit 2 through
  // the entrypoint` on `Expected: 2, Received: 1` (2026-10-11; re-observed on the Optique
  // parser 2026-11-02).
  process.exitCode = 2;
}
