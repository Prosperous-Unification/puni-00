import { inspectRawAllocation, RawAllocationRefusal } from './lab-raw-allocation';

try {
  const arguments_ = process.argv.slice(2);
  // Proof: cli-argument-closure removal admits an extra argument in the actual source CLI test.
  if (arguments_.length !== 2 || !/^[1-9][0-9]{0,9}$/.test(arguments_[1])) {
    throw new RawAllocationRefusal('invalid-arguments');
  }
  console.log(JSON.stringify(await inspectRawAllocation(arguments_[0], Number(arguments_[1]))));
} catch (failure) {
  console.error(
    failure instanceof RawAllocationRefusal
      ? failure.message
      : 'raw allocation: unexpected-refusal',
  );
  process.exit(1);
}
