import { mock } from 'bun:test';

import * as fixture from './registry-maintenance-host.fixture';

const mode = process.argv.at(2);
if (mode !== 'direct' && mode !== 'aggregate') throw new Error('Unknown diagnostic worker mode');
const original = { ...fixture };
const nativeLog = console.log;
const output: string[] = [];
const primary = new Error('PRIVATE primary diagnostic');
primary.stack =
  'Error: PRIVATE primary diagnostic\n    at /usr/local/libexec/puni-registry-maintenance/proof.js:901:7';
const outer = new AggregateError([primary], 'PRIVATE aggregate diagnostic', { cause: primary });
outer.stack =
  'AggregateError: PRIVATE aggregate diagnostic\n    at /usr/local/libexec/puni-registry-maintenance/proof.js:703:2';
const failure = mode === 'direct' ? primary : outer;
let rejected: unknown;
try {
  await mock.module('./registry-maintenance-host.fixture', () => ({
    ...original,
    prepareRegistryHostFixture: () => Promise.reject(failure),
  }));
  console.log = (message?: unknown) => {
    if (typeof message !== 'string') throw new Error('Unexpected diagnostic output');
    output.push(message);
  };
  const { proveRegistryUploadPressureHost } = await import('./registry-upload-host.native');
  try {
    await proveRegistryUploadPressureHost(() =>
      Promise.reject(new Error('Unexpected owner effect')),
    );
  } catch (cause) {
    rejected = cause;
  }
} finally {
  console.log = nativeLog;
  await mock.module('./registry-maintenance-host.fixture', () => original);
}
const encoded = output.join('');
const diagnostic: unknown = JSON.parse(encoded);
nativeLog(
  JSON.stringify({
    isOriginal: rejected === failure,
    diagnostic,
    reflectedPrivate: encoded.includes('PRIVATE'),
  }),
);
