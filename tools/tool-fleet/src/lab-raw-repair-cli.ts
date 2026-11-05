import { prepareRawRepair, RawRepairRefusal } from './lab-raw-repair';

try {
  const arguments_ = process.argv.slice(2);
  const requestPath = arguments_.at(0);
  const requestDigest = arguments_.at(1);
  if (requestPath === undefined || requestDigest === undefined || arguments_.length !== 2) {
    throw new RawRepairRefusal('invalid-arguments');
  }
  await Bun.write(Bun.stdout, JSON.stringify(prepareRawRepair(requestPath, requestDigest)) + '\n');
} catch (failure) {
  // Proof: adjacent source CLI tests require literal diagnostics with forced/disabled terminal color.
  await Bun.write(
    Bun.stderr,
    (failure instanceof RawRepairRefusal ? failure.message : 'raw repair: producer-refused') + '\n',
  );
  process.exitCode = 1;
}
