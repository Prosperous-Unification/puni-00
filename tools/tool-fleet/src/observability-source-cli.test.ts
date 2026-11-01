import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { cliEnvironment } from './cli.fixture';
import { provisionObservabilityTools } from './observability-tools.fixture';

const tools = await provisionObservabilityTools();
const root = join(import.meta.dir, '../../..');
const cli = join(import.meta.dir, 'observability-source-cli.ts');
const network = {
  api: ['10.1.0.4/32'],
  observer: ['172.31.100.10/32'],
  grafana: ['172.31.100.11/32'],
  s3: ['172.31.100.12/32'],
  alertDelivery: ['172.31.100.13/32'],
  publicProbes: ['172.31.100.14/32'],
};
const request = (placement: string) => ({
  placement,
  instances: [
    { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
    { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
  ],
  network,
});
function invoke(path: string, directory = tools, extra: string[] = []) {
  const process = Bun.spawnSync(['bun', cli, root, directory, path, ...extra], {
    env: cliEnvironment(),
    timeout: 30000,
  });
  return {
    exit: process.exitCode,
    stdout: process.stdout.toString(),
    stderr: process.stderr.toString(),
  };
}
test.each(['absent', 'unreadable', 'malformed', 'unknown', 'arguments'] as const)(
  'full source CLI refuses %s input without private diagnostics',
  async (fault) => {
    const directory = await scratchAsync('source-cli-');
    {
      const path = join(directory, 'requests.json');
      if (fault !== 'absent')
        await writeFile(
          path,
          fault === 'malformed'
            ? '{PRIVATE-MARKER'
            : JSON.stringify({
                local: request('local'),
                production: request('production'),
                ...(fault === 'unknown' ? { credential: 'PRIVATE-MARKER' } : {}),
              }),
        );
      if (fault === 'unreadable') await chmod(path, 0);
      try {
        const response = invoke(path, tools, fault === 'arguments' ? ['PRIVATE-MARKER'] : []);
        expect(response.exit).toBe(1);
        expect(response.stdout).toBe('');
        expect(response.stderr).toBe(
          `observability source: ${fault === 'unknown' ? 'validation-refused' : fault === 'arguments' ? 'invalid-arguments' : `input-${fault}`}\n`,
        );
        expect(response.stderr).not.toContain('PRIVATE-MARKER');
      } finally {
        if (fault === 'unreadable') await chmod(path, 0o600);
      }
    }
  },
);
test('full source CLI actual pinned positive returns source policy receipt and no effective readiness', async () => {
  const directory = await scratchAsync('source-cli-');
  {
    const path = join(directory, 'requests.json');
    await writeFile(
      path,
      JSON.stringify({ local: request('local'), production: request('production') }),
    );
    const response = invoke(path);
    expect(response.exit).toBe(0);
    expect(response.stderr).toBe('');
    expect(JSON.parse(response.stdout)).toMatchObject({
      scope: 'full-service-source-validation',
      sourceSecurityPolicy: true,
      wholeRenderParity: true,
      activationReady: false,
      effectiveAuthorityVerified: false,
    });
  }
});

test.each(['tool-absent', 'tool-failed', 'source-unreadable'])(
  'full source CLI withholds %s subprocess and parser boundary details',
  async (fault) => {
    const directory = await scratchAsync('source-cli-private-');
    const path = join(directory, 'requests.json');
    await writeFile(
      path,
      JSON.stringify({ local: request('local'), production: request('production') }),
    );
    if (fault === 'tool-failed') {
      await writeFile(
        join(directory, 'helm'),
        '#!/bin/sh\nif [ "$1" = version ]; then printf v4.3.0; else printf PRIVATE-MARKER >&2; exit 1; fi\n',
      );
      await chmod(join(directory, 'helm'), 0o700);
    }
    const process = Bun.spawnSync(
      [
        'bun',
        cli,
        fault === 'source-unreadable' ? join(directory, 'PRIVATE-MARKER') : root,
        fault === 'tool-failed' ? directory : join(directory, 'absent-tools'),
        path,
      ],
      { env: cliEnvironment(), timeout: 30000 },
    );
    expect(process.exitCode).toBe(1);
    expect(process.stdout.toString()).toBe('');
    expect(process.stderr.toString()).toBe('observability source: validation-refused\n');
  },
);
