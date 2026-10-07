import { readFileSync, writeFileSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { ActivationController } from './controller';
import type { ObservationStateConfig } from './observation-state';
import { runObservationTick } from './observation-tick';

const configurationPath = process.argv.at(2);
const enteredPath = process.argv.at(3);
const closedPath = process.argv.at(4);
if (configurationPath === undefined || enteredPath === undefined || closedPath === undefined)
  throw new Error('observation tick process fixture arguments absent');
const serialized = JSON.parse(readFileSync(configurationPath, 'utf8')) as Omit<
  ObservationStateConfig,
  'clock'
>;
const state: ObservationStateConfig = { ...serialized, clock: () => 1000 };
const originalClose: unknown = Object.getOwnPropertyDescriptor(Database.prototype, 'close')?.value;
if (typeof originalClose !== 'function') throw new Error('database close fixture absent');
Database.prototype.close = function () {
  writeFileSync(closedPath, 'closed');
  Reflect.apply(originalClose, this, []);
};
ActivationController.prototype.reconcileReady = function () {
  writeFileSync(enteredPath, 'entered');
  return new Promise<never>(() => {
    /* Simulate local continuation ignoring cancellation. */
  });
};
const aborter = new AbortController();
setTimeout(() => {
  aborter.abort();
}, 20);
await runObservationTick({
  state,
  signal: aborter.signal,
  cleanupMs: 100,
  reader: {
    listOpenPullRequests: () => Promise.reject(new Error('fixture reader must remain unused')),
    getPullRequest: () => Promise.reject(new Error('fixture reader must remain unused')),
  },
});
throw new Error('unsettled observation tick returned after cleanup expiry');
