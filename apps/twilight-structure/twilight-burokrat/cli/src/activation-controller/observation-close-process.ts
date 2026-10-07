import { readFileSync, writeFileSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { ActivationController } from './controller';
import type { ObservationStateConfig } from './observation-state';
import { runObservationTick } from './observation-tick';

const configurationPath = process.argv.at(2);
const enteredPath = process.argv.at(3);
const returnedPath = process.argv.at(4);
const phase = process.argv.at(5);
if (configurationPath === undefined || enteredPath === undefined || returnedPath === undefined)
  throw new Error('synchronous-close fixture arguments absent');
if (phase !== 'controller' && phase !== 'scheduler')
  throw new Error('synchronous-close fixture phase malformed');
const serialized = JSON.parse(readFileSync(configurationPath, 'utf8')) as Omit<
  ObservationStateConfig,
  'clock'
>;
const state: ObservationStateConfig = { ...serialized, clock: () => 1000 };
const stall = () => {
  writeFileSync(enteredPath, 'entered');
  const until = performance.now() + 400;
  while (performance.now() < until) {
    /* Synchronous cleanup stalls the event loop. */
  }
};
if (phase === 'controller') {
  ActivationController.prototype.close = function () {
    stall();
  };
} else {
  const originalClose: (this: Database) => void = Reflect.get(Database.prototype, 'close');
  let closes = 0;
  Database.prototype.close = function () {
    closes += 1;
    if (closes === 2) stall();
    originalClose.call(this);
  };
}
const outcome = await runObservationTick({
  state,
  signal: new AbortController().signal,
  cleanupMs: 30,
  reader: {
    listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
    getPullRequest: () => Promise.reject(new Error('unexpected current read')),
  },
});
writeFileSync(returnedPath, outcome.kind);
process.exit(outcome.kind === 'complete' ? 0 : 124);
