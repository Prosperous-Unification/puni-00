import { prepareRaw, RawPreparationRefusal } from './lab-raw-preparation';

try {
  const arguments_ = process.argv.slice(2);
  const requestPath = arguments_.at(0);
  const requestDigest = arguments_.at(1);
  if (requestPath === undefined || requestDigest === undefined || arguments_.length !== 2) {
    throw new RawPreparationRefusal('invalid-arguments');
  }
  console.log(JSON.stringify(prepareRaw(requestPath, requestDigest)));
} catch (failure) {
  console.error(
    failure instanceof RawPreparationRefusal
      ? failure.message
      : 'raw preparation: producer-refused',
  );
  process.exitCode = 1;
}
