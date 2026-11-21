import { describe, expect, it } from 'bun:test';

import { buildTestCaddyCommand } from '../caddy/command';
import { CADDY_IMAGE } from '../caddy/image';

const CADDY = {
  scratch: '/tmp/mcp-caddy-x',
  configurationPath: '/tmp/mcp-caddy-x/Caddyfile',
  container: 'mcp-body-limit-x',
  binary: undefined,
};

const OUTSIDE_A_JOB = [
  'docker',
  'run',
  '--rm',
  '--name',
  'mcp-body-limit-x',
  '--network=host',
  '--volume',
  '/tmp/mcp-caddy-x:/test:ro',
  CADDY_IMAGE,
  'caddy',
  'run',
  '--config',
  '/test/Caddyfile',
];

describe('the boundary tests Caddy command', () => {
  // Proof: with `...hostJobContainerFlags(environment)` removed from buildTestCaddyCommand,
  // `bounds and labels the container inside a Dash job` failed on an argv without `--memory`
  // (2026-11-12).
  it('bounds and labels the container inside a Dash job', () => {
    expect(buildTestCaddyCommand(CADDY, { DASH_JOB_ID: 'abc' })).toEqual([
      'docker',
      'run',
      '--rm',
      '--memory',
      '1g',
      '--cpus',
      '1',
      '--label',
      'puni.job=abc',
      ...OUTSIDE_A_JOB.slice(3),
    ]);
  });

  it('leaves the container argv unchanged outside a Dash job', () => {
    expect(buildTestCaddyCommand(CADDY, {})).toEqual(OUTSIDE_A_JOB);
  });

  it('runs a native development binary as a plain child process', () => {
    expect(
      buildTestCaddyCommand({ ...CADDY, binary: '/usr/bin/caddy' }, { DASH_JOB_ID: 'abc' }),
    ).toEqual(['/usr/bin/caddy', 'run', '--config', '/tmp/mcp-caddy-x/Caddyfile']);
  });
});
