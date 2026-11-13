import { expect, it } from 'bun:test';

import { runCliFixture } from './provenance-cli.fixture.test';

for (const fault of [
  'wrong-label',
  'missing-label',
  'corrupt-manifest',
  'corrupt-config',
  'no-run',
  'failed-run',
  'newer-failed-run',
  'cancelled-run',
  'incomplete-run',
  'wrong-source',
  'wrong-repository',
  'wrong-branch',
  'pr-run',
  'wrong-workflow',
  'missing-check',
  'duplicate-check',
  'failed-check',
  'incomplete-check',
  'retry-failed-check',
  'tag-only',
  'inconsistent-digest',
  'wrong-release-source',
  'short-release-source',
  'credentialed-image',
  'shell-image',
  'bad-optional-publication',
  'unknown-role',
  'newline-optional-source',
  'newline-optional-digest',
  'newline-optional-tag',
  'newline-optional-image',
  'unknown-entry-key',
  'missing-entry-field',
  'malformed-json',
  'missing-release',
  'unreadable-release',
  'unsupported-origin',
  'missing-origin',
  'stale-bundle',
  'unreadable-bundle',
  'absent-bundle',
]) {
  it(`refuses ${fault} before actual remote preflight or swap`, async () => {
    const observed = await runCliFixture({ fault });
    expect(
      observed.trace.filter(
        (command) => command.startsWith('ssh ') && /--preflight|--execute/.test(command),
      ),
    ).toEqual([]);
    expect(observed.code).not.toBe(0);
    expect(observed.output + observed.diagnostic).not.toContain('fixture-secret');
    expect(observed.output + observed.diagnostic).not.toContain(
      Buffer.from('fixture-user:fixture-secret').toString('base64'),
    );
    if (fault.endsWith('-bundle'))
      expect(observed.trace.filter((command) => command.startsWith('fetch '))).toEqual([]);
  });
}

for (const fault of [
  undefined,
  'carried-pixels',
  'valid-optional-publication',
  'mutable-release',
]) {
  it(`admits exact all-tier provenance ${fault ?? 'current attempt'} before one swap and smoke`, async () => {
    const observed = await runCliFixture({ fault, credentials: true });
    expect({ code: observed.code, diagnostic: observed.diagnostic }).toEqual({
      code: 0,
      diagnostic: '',
    });
    expect(observed.output).toContain('smoke passed');
    expect(observed.output).toContain('"executionId":"91"');
    expect(observed.output).toContain('"attempt":2');
    if (fault === 'carried-pixels') expect(observed.output).toContain('"attempt":1');
    for (const role of ['be', 'gw', 'fe'])
      expect(observed.output).toContain(observed.configDigests[role]);
    expect(observed.output + observed.diagnostic).not.toContain('fixture-secret');
    expect(observed.output + observed.diagnostic).not.toContain(
      Buffer.from('fixture-user:fixture-secret').toString('base64'),
    );
    expect(observed.trace[1]).toStartWith('ssh sha256sum ');
    const firstPreflight = observed.trace.findIndex(
      (command) => command.startsWith('ssh ') && command.includes('--preflight'),
    );
    expect(firstPreflight).toBeGreaterThan(1);
    expect(
      observed.trace.slice(firstPreflight).filter((command) => command.startsWith('fetch ')),
    ).toEqual([]);
    expect(
      observed.trace.slice(0, firstPreflight).filter((command) => command.startsWith('fetch ')),
    ).toHaveLength(11);
    const swaps = observed.trace.filter(
      (command) => command.startsWith('ssh ') && command.includes('--execute'),
    );
    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toContain('swap.js be,gw,fe ');
    expect(observed.trace.at(-1)).toContain('smoke.js');
  });
}

it('keeps dry run explicitly unverified without provider or registry reads', async () => {
  const observed = await runCliFixture({ dryRun: true, fault: 'wrong-label' });
  expect({ code: observed.code, diagnostic: observed.diagnostic }).toEqual({
    code: 0,
    diagnostic: '',
  });
  expect(observed.output).toContain('deployment verification and image provenance are unverified');
  expect(observed.trace).toHaveLength(1);
  expect(observed.trace[0]).toStartWith('ssh for t in be gw fe;');
});
