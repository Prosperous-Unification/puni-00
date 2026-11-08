import { prepareSeed, SeedPreparationRefusal } from './lab-seed-preparation';

try {
  const arguments_ = process.argv.slice(2);
  const requestPath = arguments_.at(0);
  const requestDigest = arguments_.at(1);
  if (requestPath === undefined || requestDigest === undefined || arguments_.length !== 2) {
    throw new SeedPreparationRefusal('invalid-arguments');
  }
  await Bun.write(Bun.stdout, JSON.stringify(prepareSeed(requestPath, requestDigest)) + '\n');
} catch (failure) {
  // Proof: forced-color source CLI tests fail if terminal console formatting is restored.
  await Bun.write(
    Bun.stderr,
    (failure instanceof SeedPreparationRefusal
      ? failure.message
      : 'seed preparation: producer-refused') + '\n',
  );
  process.exitCode = 1;
}
