import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

const Observation = type({
  rejected: 'boolean',
  elapsedMs: 'number >= 0',
  compound: 'boolean',
  failures: 'string[]',
  originalCause: 'boolean',
  singleExact: 'boolean',
  groupsAbsent: 'boolean',
  terminal: 'boolean',
  engines: 'number.safe >= 0',
  platforms: 'string[]',
  '+': 'reject',
});
for (const [mode, required] of [
  ['success', []],
  ['error', []],
  ['aggregate', []],
  ['undefined', []],
  ['null', []],
  ['string', []],
  ['operation-report', ['operation-report']],
  ['summary-report', ['summary-report']],
  ['diagnostics-report', ['diagnostics-report']],
  ['exit', ['child-exit']],
  ['exit+diagnostics-report', ['child-exit', 'diagnostics-report']],
  ['signal', ['signal']],
  ['signal+summary-report', ['signal', 'summary-report']],
  [
    'operation-report+diagnostics-report+summary-report',
    ['operation-report', 'diagnostics-report', 'summary-report'],
  ],
  ['stdout', ['stdout']],
  ['stderr', ['stderr']],
  ['stdout+stderr', ['stdout', 'stderr']],
  ['spawn', []],
  ['stubborn', ['abort']],
] as const) {
  test(
    'actual Docker caller preserves failures after real owned engine cleanup: ' + mode,
    async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          new URL('./registry-docker-completion.fixture.ts', import.meta.url).pathname,
          mode,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(20000) },
      );
      const [code, output, errors] = await Promise.all([
        child.exited,
        readRegistryBytes(child.stdout, 65536, 'Docker completion stdout'),
        readRegistryBytes(child.stderr, 65536, 'Docker completion stderr'),
      ]);
      if (code !== 0)
        throw new Error(
          'Docker completion fixture setup/rescue failed: ' + new TextDecoder().decode(errors),
        );
      const observed = Observation.assert(JSON.parse(new TextDecoder().decode(output)));
      expect(observed.elapsedMs).toBeLessThan(8500);
      if (mode === 'success') {
        expect(observed).toMatchObject({
          rejected: false,
          compound: false,
          failures: [],
          originalCause: false,
          singleExact: false,
          groupsAbsent: true,
          terminal: true,
          engines: 4,
          platforms: ['amd64', 'arm64'],
        });
        return;
      }
      expect(observed.platforms).toEqual([]);
      expect(observed.rejected).toBe(true);
      expect(observed.engines).toBe(mode === 'spawn' ? 1 : 2);
      expect(observed.groupsAbsent).toBe(true);
      expect(observed.terminal).toBe(true);
      expect(observed.failures.at(0)).toBe('primary');
      expect(observed.failures).not.toContain('unexpected');
      let previous = 0;
      for (const failure of required) {
        const position = observed.failures.indexOf(failure);
        expect(position).toBeGreaterThan(previous);
        previous = position;
      }
      const permitted = new Set<string>(['primary', ...required]);
      if (mode.includes('stdout') || mode.includes('stderr')) {
        permitted.add('abort');
        permitted.add('child-exit');
      }
      if (mode === 'spawn') permitted.add('child-exit');
      expect(observed.failures.every((failure) => permitted.has(failure))).toBe(true);
      if (observed.compound) expect(observed.originalCause).toBe(true);
      else expect(observed.singleExact).toBe(true);
    },
  );
}
