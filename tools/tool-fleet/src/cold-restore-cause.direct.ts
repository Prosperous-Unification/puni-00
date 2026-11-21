import { injected } from './cold-restore-cause.preload';
import { matchingRecorderInputs } from './cold-restore-recorder.fixture';
import { recordManifest } from './recover';

const directory = process.argv[2];
if (!directory) throw new Error('Recorder fault fixture requires its scratch directory');

try {
  await recordManifest(matchingRecorderInputs(directory));
  throw new Error('Recorder unexpectedly produced a manifest');
} catch (fault) {
  if (!(fault instanceof Error) || fault.message !== 'Capture publication request failed') {
    throw fault;
  }
  console.log(
    JSON.stringify({
      message: fault.message,
      type: fault.constructor.name,
      exactCause: fault.cause === injected,
    }),
  );
}
