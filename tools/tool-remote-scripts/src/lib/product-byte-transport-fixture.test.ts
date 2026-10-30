import { chmod, rename, rm, symlink } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { createProductByteTransportFixture } from '../fixtures/product-byte-transport';

test('byte fixture refuses a missing startup mapping before any CLI dispatch', async () => {
  const module = new URL('../fixtures/product-byte-transport.ts', import.meta.url).pathname;
  const environment = { ...process.env };
  delete environment['PRODUCT_MODEL_DOCKER'];
  delete environment['PRODUCT_MODEL_DOCKER_IDENTITY'];
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `import { assertProductByteTransportFixture } from ${JSON.stringify(module)}; await assertProductByteTransportFixture();`,
    ],
    { env: environment, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  const [output, failure, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(output).toBe('');
  expect(code).not.toBe(0);
  expect(failure).toContain('mapping absent or misresolved');
});

for (const fault of ['none', 'resolution', 'content', 'identity', 'mode', 'symlink'] as const)
  test(`byte fixture ${fault} checks exact owned startup CLI without executing it`, async () => {
    const fixture = await createProductByteTransportFixture();
    try {
      const path = fixture.environment.PRODUCT_MODEL_DOCKER;
      if (fault === 'resolution') fixture.environment.PATH = '/usr/bin:/bin';
      if (fault === 'content') await Bun.write(path, '#!/bin/sh\nexit 0\n');
      if (fault === 'identity') {
        await Bun.write(path + '.replacement', await Bun.file(path).text());
        await chmod(path + '.replacement', 0o700);
        await rename(path + '.replacement', path);
      }
      if (fault === 'mode') await chmod(path, 0o750);
      if (fault === 'symlink') {
        await rename(path, path + '.original');
        await symlink(path + '.original', path);
      }
      const module = new URL('../fixtures/product-byte-transport.ts', import.meta.url).pathname;
      const child = Bun.spawn(
        [
          process.execPath,
          '-e',
          `import { assertProductByteTransportFixture } from ${JSON.stringify(module)}; await assertProductByteTransportFixture();`,
        ],
        { env: fixture.environment, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      );
      const [output, failure, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(output).toBe('');
      if (fault === 'none') {
        expect(code).toBe(0);
        expect(failure).toBe('');
      } else {
        expect(code).not.toBe(0);
        expect(failure).toMatch(/local product byte CLI (?:mapping|identity)/);
      }
    } finally {
      await rm(fixture.directory, { recursive: true });
    }
  });
