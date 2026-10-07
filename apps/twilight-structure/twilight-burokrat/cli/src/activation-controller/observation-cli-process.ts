import { readFileSync, writeFileSync } from 'node:fs';

import { runObservationCli } from './observation-cli';
import type { ObservationStateConfig } from './observation-state';

const configurationPath = process.argv.at(2);
const enteredPath = process.argv.at(3);
if (configurationPath === undefined || enteredPath === undefined)
  throw new Error('observation CLI fixture arguments absent');
const serialized = JSON.parse(readFileSync(configurationPath, 'utf8')) as Omit<
  ObservationStateConfig,
  'clock'
>;
const state: ObservationStateConfig = { ...serialized, clock: () => 1000 };
const code = await runObservationCli({
  state,
  cleanupMs: 500,
  reader: {
    listOpenPullRequests: () => {
      writeFileSync(enteredPath, 'entered');
      return new Promise<never>(() => {
        /* Simulate an abort-ignoring reader. */
      });
    },
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  },
});
process.exit(code);
