import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { type ObservationStateConfig, withObservationAttempt } from './observation-state';

const configurationPath = process.argv.at(2);
const mode = process.argv.at(3);
const markerPath = process.argv.at(4);
const releasePath = process.argv.at(5);
if (
  configurationPath === undefined ||
  mode === undefined ||
  markerPath === undefined ||
  releasePath === undefined
) {
  throw new Error('observation process fixture arguments absent');
}
// Test-only process fixture reads bytes written by observation-state.db.test.ts.
const serialized = JSON.parse(readFileSync(configurationPath, 'utf8')) as Omit<
  ObservationStateConfig,
  'clock'
>;
const config: ObservationStateConfig = { ...serialized, clock: () => 1000 };
let calls = 0;
const outcome = await withObservationAttempt(config, async (attempt) => {
  calls += 1;
  writeFileSync(markerPath, String(attempt.sequence));
  if (mode === 'hold') {
    while (!existsSync(releasePath)) await Bun.sleep(10);
  }
  return attempt.sequence;
});
process.stdout.write(JSON.stringify({ outcome, calls }));
