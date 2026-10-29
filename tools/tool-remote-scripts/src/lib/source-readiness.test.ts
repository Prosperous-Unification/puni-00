import { rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';
import { SOURCE_READINESS_CASES } from '../fixtures/source-readiness-cases';

for (const name of SOURCE_READINESS_CASES)
  test(`isolated ${name}`, async () => {
    const peer = await createReadinessByteTransportFixture();
    const environment: NodeJS.ProcessEnv = { ...peer.environment, FORCE_COLOR: '0' };
    delete environment['SOURCE_READINESS_PROOF'];
    let isSettled = false;
    try {
      const child = Bun.spawn(
        [
          process.execPath,
          'test',
          'test/source-readiness-model-child.test.ts',
          '-t',
          `^${name}$`,
          '--timeout=300000',
        ],
        {
          cwd: new URL('../..', import.meta.url).pathname,
          env: environment,
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          signal: AbortSignal.timeout(310000),
          killSignal: 'SIGKILL',
        },
      );
      const terminal = await Promise.allSettled([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const failures: unknown[] = [];
      for (const receipt of terminal)
        if (receipt.status === 'rejected') failures.push(receipt.reason);
      if (failures.length > 0)
        throw new AggregateError(
          failures,
          `source readiness child settlement unproved; peer retained at ${peer.directory}`,
        );
      const [exit, stdout, stderr] = terminal;
      if (
        exit.status !== 'fulfilled' ||
        stdout.status !== 'fulfilled' ||
        stderr.status !== 'fulfilled'
      )
        throw new Error('source readiness child settlement unproved');
      process.stderr.write(stderr.value);
      if ((exit.value !== 0 && exit.value !== 1) || child.signalCode !== null)
        throw new Error(
          `source readiness child custody unproved; peer retained at ${peer.directory}`,
        );
      isSettled = true;
      // This receipt follows the ORIGINAL child exit and both EOF joins, with
      // normal exit0/1 and null signal; an outcome line alone proves no custody.
      process.stderr.write(
        `SOURCE_READINESS_INNER_CUSTODY: ${JSON.stringify({ name, exitCode: exit.value, signal: null, stdoutEof: true, stderrEof: true })}\n`,
      );
      expect(exit.value).toBe(0);
      expect(child.signalCode).toBeNull();
      expect(stdout.value).toMatch(/^bun test v[^\n]+\n$/);
      expect(stderr.value).toMatch(/\b1 pass\b/);
      expect(stderr.value).toMatch(/\b0 fail\b/);
      expect(stderr.value).not.toMatch(/^\s*\d+ (?:skip|todo)\b|^\((?:skip|todo)\)/m);
      expect(
        [...stderr.value.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map((match) => match[1]),
      ).toEqual([name]);
    } finally {
      if (isSettled) await rm(peer.directory, { recursive: true });
    }
  }, 320000);
