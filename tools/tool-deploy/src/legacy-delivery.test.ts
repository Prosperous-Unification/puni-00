import { expect, it } from 'bun:test';

import { runCliFixture } from './provenance-cli.fixture.test';

it('executes the supported partial-publication CLI through provenance, preflight, swap and smoke without lifecycle installation', async () => {
  const observed = await runCliFixture({ tiers: 'gw' });
  expect({ code: observed.code, diagnostic: observed.diagnostic }).toEqual({
    code: 0,
    diagnostic: '',
  });
  expect(observed.output).toContain('smoke passed');
  const commands = observed.trace.filter((command) => command.startsWith('ssh '));
  expect(commands).toHaveLength(6);
  expect(commands[1]).toBe(
    'ssh sha256sum /home/puni1/wbs/bin/swap.js /home/puni1/wbs/bin/smoke.js',
  );
  expect(commands[2]).toContain('--preflight');
  expect(commands[3]).toContain('--execute');
  expect(commands[3]).toContain('swap.js gw ');
  expect(commands[5]).toContain('smoke.js');
  expect(observed.trace.filter((command) => command.startsWith('fetch '))).toHaveLength(7);
});
