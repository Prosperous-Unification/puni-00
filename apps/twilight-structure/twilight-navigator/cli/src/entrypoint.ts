import { runNavigator, UsageRefusal } from './cli';

try {
  process.stdout.write(`${await runNavigator(process.argv.slice(2))}\n`);
} catch (failure) {
  if (!(failure instanceof UsageRefusal)) throw failure;
  process.stderr.write(`${failure.message}\n`);
  // Proof: exiting 1 here failed `refuses an unsupported command before any read, exit 2 through
  // the entrypoint` on `Expected: 2, Received: 1` (2026-10-11).
  process.exitCode = 2;
}
