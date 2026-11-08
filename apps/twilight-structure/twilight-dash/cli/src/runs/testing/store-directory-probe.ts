import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Database } from 'bun:sqlite';

const receipt = process.env['STORE_DIRECTORY_PROBE_RECEIPT'];
const mode = process.env['STORE_DIRECTORY_PROBE_MODE'];
if (receipt === undefined || mode === undefined || !['close', 'work', 'work-close'].includes(mode))
  throw new Error('store directory probe configuration absent');
const receiptPath = receipt;
const closeDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'close');
const runDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
if (closeDescriptor === undefined || runDescriptor === undefined)
  throw new Error('native probe descriptors absent');
// Boundary: fixed method descriptors from Bun's own Database prototype preserve the native signatures in this test-only probe.
const originalClose = closeDescriptor.value as Database['close'];
const originalRun = runDescriptor.value as Database['run'];
const directories = new Set<string>();
let providerCloses = 0;
let probeCloses = 0;
const closeFailure = new Error('I1 injected native provider disposal failure');
const workFailure = new Error('I1 injected work failure');
function owns(database: Database): boolean {
  return /\/(?:runs-production-|runs-open-|run-signals-|run-signal-integrity-)/.test(
    database.filename,
  );
}
function callerStack(): string {
  const stack = new Error().stack;
  if (stack === undefined) throw new Error('store directory probe stack absent');
  return stack;
}
function record(): void {
  writeFileSync(
    receiptPath,
    JSON.stringify({ directories: [...directories], providerCloses, probeCloses }),
  );
}
Database.prototype.run = function (sql, ...parameters) {
  if (owns(this)) {
    directories.add(dirname(this.filename));
    record();
    if (
      sql === 'BEGIN IMMEDIATE' &&
      callerStack().includes('/runs/sqlite/run-store.ts') &&
      mode !== 'close'
    )
      throw workFailure;
  }
  return originalRun.call(this, sql, ...parameters);
};
Database.prototype.close = function (...parameters) {
  if (owns(this)) {
    directories.add(dirname(this.filename));
    if (callerStack().includes('/runs/sqlite/run-store.ts')) {
      providerCloses += 1;
      record();
      if (mode !== 'work') throw closeFailure;
    } else if (!callerStack().includes('/runs/sqlite/open-stores.ts')) {
      probeCloses += 1;
      record();
    }
  }
  originalClose.apply(this, parameters);
};
record();
