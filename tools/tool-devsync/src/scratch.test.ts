import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const HELPER = join(import.meta.dir, '../../test/scratch/index.ts');

function childSource(ending: 'failure' | 'signal'): string {
  const finish =
    ending === 'failure'
      ? `queueMicrotask(() => { throw new Error('deliberate failure'); });`
      : `await new Promise(() => {});`;
  return `
    import { scratchSync } from ${JSON.stringify(HELPER)};
    const directory = scratchSync('cleanup-proof-');
    process.stdout.write(directory + '\\n');
    ${finish}
  `;
}

describe('per-process test scratch', () => {
  it('removes its root when a test process fails', async () => {
    const child = Bun.spawn([process.execPath, '--eval', childSource('failure')], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const output = new Response(child.stdout).text();
    expect(await child.exited).not.toBe(0);
    const directory = (await output).trim();
    expect(directory).not.toBe('');
    expect(existsSync(directory)).toBe(false);
  });

  it('removes its root and preserves signal termination', async () => {
    const child = Bun.spawn([process.execPath, '--eval', childSource('signal')], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const reader = child.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    if (first.done) throw new Error('child exited without its path');
    const directory = new TextDecoder().decode(first.value).trim();
    child.kill('SIGTERM');
    expect(await child.exited).not.toBe(0);
    expect(existsSync(directory)).toBe(false);
  });
});
