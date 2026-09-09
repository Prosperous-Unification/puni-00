import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { scratchSync } from '../../test/scratch';

const HELPER = join(import.meta.dir, '../../test/scratch/index.ts');
const PRELOAD = join(import.meta.dir, '../../test/scratch/preload.ts');

function childSource(ending: 'failure' | 'signal'): string {
  const finish =
    ending === 'failure'
      ? `throw new Error('deliberate failure');`
      : `await new Promise(() => {});`;
  return `
    import { test } from 'bun:test';
    import { scratchSync } from ${JSON.stringify(HELPER)};
    test('cleanup control', async () => {
      const directory = scratchSync('cleanup-proof-');
      process.stdout.write('SCRATCH_DIRECTORY=' + directory + '\\n');
      ${finish}
    });
  `;
}

function childTest(ending: 'failure' | 'signal'): string {
  const directory = scratchSync('scratch-control-');
  const file = join(directory, `${ending}.test.ts`);
  writeFileSync(file, childSource(ending));
  return file;
}

function scratchDirectory(output: string): string {
  const match = /^SCRATCH_DIRECTORY=(.+)$/m.exec(output);
  if (match === null) throw new Error('child exited without its scratch path');
  return match[1].trim();
}

async function readScratchDirectory(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) throw new Error('child exited without its scratch path');
      output += decoder.decode(next.value, { stream: true });
      const match = /^SCRATCH_DIRECTORY=(.+)$/m.exec(output);
      if (match !== null) return match[1].trim();
    }
  } finally {
    reader.releaseLock();
  }
}

describe('per-process test scratch', () => {
  it('removes its root when a test process fails', async () => {
    const child = Bun.spawn(
      [process.execPath, 'test', '--preload', PRELOAD, childTest('failure')],
      {
        stdout: 'pipe',
        stderr: 'ignore',
      },
    );
    const output = new Response(child.stdout).text();
    expect(await child.exited).not.toBe(0);
    const directory = scratchDirectory(await output);
    expect(existsSync(directory)).toBe(false);
  });

  it('removes its root and preserves signal termination', async () => {
    const child = Bun.spawn([process.execPath, 'test', '--preload', PRELOAD, childTest('signal')], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const directory = await readScratchDirectory(child.stdout);
    child.kill('SIGTERM');
    expect(await child.exited).not.toBe(0);
    expect(existsSync(directory)).toBe(false);
  });
});
