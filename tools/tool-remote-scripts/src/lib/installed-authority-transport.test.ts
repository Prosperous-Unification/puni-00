import { expect, test } from 'bun:test';

import { readAuthorityCollector } from './installed-authority-transport';

test('bounded collector transport drains both pipes and reaps timed out children', async () => {
  const child = Bun.spawn([process.execPath, '-e', 'setInterval(()=>{},1000)'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(readAuthorityCollector(child, performance.now() + 80)).rejects.toThrow('deadline');
  expect(await child.exited).not.toBe(0);
});
test.each(['stderr', 'oversize', 'failure'] as const)(
  'collector transport refuses %s without private payloads',
  async (fault) => {
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        fault === 'stderr'
          ? 'process.stderr.write("private secret")'
          : fault === 'oversize'
            ? 'process.stdout.write("x".repeat(33*1024*1024))'
            : 'process.exit(2)',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    let message = '';
    try {
      await readAuthorityCollector(child, performance.now() + 2000);
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('private secret');
  },
);
