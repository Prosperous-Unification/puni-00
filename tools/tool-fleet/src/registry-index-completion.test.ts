import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

const Observation = type({
  rejected: 'boolean',
  compound: 'boolean',
  failures: 'string[]',
  originalCause: 'boolean',
  singleExact: 'boolean',
  descriptorClosed: 'boolean',
  closedReceipt: 'string|null',
  advanced: 'boolean',
  '+': 'reject',
});
for (const [mode, failures, compound] of [
  ['advance', ['retire'], false],
  ['error', ['primary'], false],
  ['aggregate', ['primary'], false],
  ['undefined', ['primary'], false],
  ['null', ['primary'], false],
  ['string', ['primary'], false],
  ['close', ['close'], false],
  ['trace', ['trace'], false],
  ['primary+close', ['primary', 'close'], true],
  ['primary+trace', ['primary', 'trace'], true],
  ['close+report', ['close', 'invalid-report'], true],
  ['primary+close+report', ['primary', 'close', 'invalid-report'], true],
  ['primary+trace+report', ['primary', 'trace', 'invalid-report'], true],
  ['valid-report', ['valid-report'], false],
  ['primary+valid-report', ['primary', 'valid-report'], true],
  ['valid+invalid-report', ['valid-report', 'invalid-report'], true],
  ['primary+outer-report', ['primary', 'outer-report'], true],
  ['close+outer-report', ['close', 'outer-report'], true],
] as const) {
  test(
    'actual index caller closes before preserving ordered completion failures: ' + mode,
    async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          new URL('./registry-index-completion.fixture.ts', import.meta.url).pathname,
          mode,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
      );
      const [code, output, errors] = await Promise.all([
        child.exited,
        readRegistryBytes(child.stdout, 65536, 'Index completion stdout'),
        readRegistryBytes(child.stderr, 65536, 'Index completion stderr'),
      ]);
      if (code !== 0)
        throw new Error(
          'Index completion fixture setup/observation failed: ' + new TextDecoder().decode(errors),
        );
      const observed = Observation.assert(JSON.parse(new TextDecoder().decode(output)));
      expect(observed).toEqual({
        rejected: true,
        compound,
        failures: [...failures],
        originalCause: compound,
        singleExact: !compound && mode !== 'trace',
        descriptorClosed: true,
        closedReceipt: 'closed',
        advanced: mode === 'advance',
      });
    },
  );
}
