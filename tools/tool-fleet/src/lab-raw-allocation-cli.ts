import { inspectRawAllocation, RawAllocationRefusal } from './lab-raw-allocation';

try {
  const arguments_ = process.argv.slice(2);
  // Proof: cli-argument-closure removal admits an extra argument in the actual source CLI test.
  if (arguments_.length !== 2 || !/^[1-9][0-9]{0,9}$/.test(arguments_[1])) {
    throw new RawAllocationRefusal('invalid-arguments');
  }
  await Bun.write(
    Bun.stdout,
    JSON.stringify(await inspectRawAllocation(arguments_[0], Number(arguments_[1]))) + '\n',
  );
} catch (failure) {
  // Proof: forced-color source CLI tests fail if terminal console formatting is restored.
  await Bun.write(
    Bun.stderr,
    (failure instanceof RawAllocationRefusal
      ? failure.message
      : 'raw allocation: unexpected-refusal') + '\n',
  );
  process.exit(1);
}
