import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

for (const validation of ['--validate-installation', '--validate-client-installation'])
  for (const [name, args] of [
    ['requires exactly one configuration path', []],
    [
      'rejects additional CLI arguments before opening trusted state',
      ['/must-not-be-opened', 'unexpected'],
    ],
  ] as const)
    test(validation + ' ' + name, async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          new URL('./registry-managed-journal-cli.ts', import.meta.url).pathname,
          validation,
          ...args,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
      );
      const [code, output, errors] = await Promise.all([
        child.exited,
        readRegistryBytes(child.stdout, 65536, 'Candidate validation output'),
        readRegistryBytes(child.stderr, 65536, 'Candidate validation error'),
      ]);
      expect(code).toBe(1);
      expect(output.byteLength).toBe(0);
      expect(new TextDecoder().decode(errors)).toContain(validation + ' <trusted-candidate>');
    });
