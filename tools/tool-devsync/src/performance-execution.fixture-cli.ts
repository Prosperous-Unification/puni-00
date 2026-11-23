import { appendFileSync, writeFileSync } from 'node:fs';

import { runPerformanceLevel } from './performance-level';

const root = process.argv.at(2);
const policy = process.argv.at(3);
const trace = process.argv.at(4);
const receipt = process.argv.at(5);
if (
  root === undefined ||
  policy === undefined ||
  trace === undefined ||
  receipt === undefined ||
  process.argv.length !== 6
)
  throw new Error('Execution fixture supervisor requires root, policy, trace and receipt');
const original = Bun.spawn;
const observed: Promise<void>[] = [];
const observationFailures: unknown[] = [];
const append = (record: unknown): void => {
  try {
    appendFileSync(trace, `${JSON.stringify(record)}\n`);
  } catch (cause) {
    observationFailures.push(cause);
  }
};
// Test observation boundary: PerformanceProcessOwner uses only the argv+options overload.
// Every selected argument and option is forwarded unchanged to the actual native Bun spawn.
Bun.spawn = ((...arguments_: Parameters<typeof Bun.spawn>) => {
  const [argv, options] = arguments_;
  if (options === undefined) throw new Error('Observed production owner omitted spawn options');
  const child = original(...arguments_);
  append({ kind: 'spawn', pid: child.pid, argv: [...argv], cwd: options.cwd, env: options.env });
  observed.push(
    child.exited
      .then((exitCode) => {
        append({ kind: 'exit', pid: child.pid, exitCode, signalCode: child.signalCode });
      })
      .catch((cause: unknown) => {
        observationFailures.push(cause);
      }),
  );
  return child;
}) as typeof Bun.spawn;
let primary: unknown;
let failed = false;
try {
  await runPerformanceLevel(root, policy);
} catch (cause) {
  failed = true;
  primary = cause;
}
await Promise.all(observed);
Bun.spawn = original;
try {
  writeFileSync(
    receipt,
    JSON.stringify({
      schemaVersion: 1,
      ok: !failed && observationFailures.length === 0,
      primary: failed ? String(primary) : null,
      observationFailures: observationFailures.map(String),
    }),
  );
} catch (cause) {
  observationFailures.push(cause);
}
if (observationFailures.length > 0)
  throw new AggregateError(
    failed ? [primary, ...observationFailures] : observationFailures,
    'Performance execution observation failed',
  );
if (failed) throw primary;
