import { GuestPreparationRefusal, prepareGuest } from './lab-guest-preparation';

try {
  const arguments_ = process.argv.slice(2);
  const requestPath = arguments_.at(0);
  const requestDigest = arguments_.at(1);
  if (requestPath === undefined || requestDigest === undefined || arguments_.length !== 2) {
    throw new GuestPreparationRefusal('invalid-arguments');
  }
  await Bun.write(Bun.stdout, JSON.stringify(prepareGuest(requestPath, requestDigest)) + '\n');
} catch (failure) {
  // The focused source CLI control checks literal stderr under FORCE_COLOR and NO_COLOR.
  await Bun.write(
    Bun.stderr,
    (failure instanceof GuestPreparationRefusal
      ? failure.message
      : 'guest preparation: producer-refused') + '\n',
  );
  process.exitCode = 1;
}
