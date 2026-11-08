import { rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';

test('source Node command runs its genuine isolated context consumer', async () => {
  const peer = await createReadinessByteTransportFixture();
  let settled = false;
  try {
    const child = Bun.spawn(
      [process.execPath, 'test', 'test/source-inner-command-child.test.ts', '--timeout=300000'],
      {
        cwd: new URL('../..', import.meta.url).pathname,
        env: { ...peer.environment, FORCE_COLOR: '0' },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(310000),
        killSignal: 'SIGKILL',
      },
    );
    const receipts = await Promise.allSettled([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const [exit, stdout, stderr] = receipts;
    if (
      exit.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new AggregateError(receipts, 'source command original child custody unproved');
    settled = true;
    process.stderr.write(stderr.value);
    expect(child.signalCode).toBeNull();
    expect(exit.value).toBe(0);
    expect(stderr.value).toContain('source Node complete command observed');
    for (const fault of [
      'source-session-nonce',
      'source-session-group',
      'source-completion-count',
      'source-duplicate-done',
      'source-missing-reap',
      'missing',
      'source-no-session',
      'source-unknown-tag',
      'source-token-bound',
      'source-frame-bound',
      'source-reap-foreign',
      'source-member-observe',
    ])
      expect(stderr.value).toContain(`source Node private receipt consumer observed ${fault}`);
    expect(stderr.value).toContain(
      'source Node original cleanup member and terminal refusal observed',
    );
    expect(stderr.value).toMatch(/1 pass/);
    expect(stderr.value).toMatch(/0 fail/);
  } finally {
    if (settled) await rm(peer.directory, { recursive: true });
  }
}, 320000);
