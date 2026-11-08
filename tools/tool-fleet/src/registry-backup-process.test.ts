import { expect, test } from 'bun:test';

import { awaitRegistryBackupChild } from './registry-maintenance-process';
import { requireRejection } from './registry-rejection.fixture';

for (const mode of ['graceful', 'forced'] as const) {
  test(`backup cancellation ${mode} reaps the owned native group and remains failure`, async () => {
    const source = `
      process.on('SIGINT', () => {
        console.log('interrupted');
        ${mode === 'graceful' ? 'setTimeout(() => process.exit(130), 50);' : ''}
      });
      console.log('ready');
      setInterval(() => {}, 1000);
    `;
    const child = Bun.spawn([process.execPath, '-e', source], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const controller = new AbortController();
    const lifetime = awaitRegistryBackupChild(child, controller.signal);
    // Fixed fixture process has bounded constant output, no input or credentials.
    const reader = child.stdout.getReader();
    let output = '';
    try {
      const first = await reader.read();
      if (first.done) throw new Error('Native cancellation fixture never became ready');
      output += new TextDecoder().decode(first.value);
      expect(output.trim()).toBe('ready');
      const started = performance.now();
      const fallback = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 8000);
      try {
        controller.abort(new Error('owned backup cancellation'));
        expect((await requireRejection(lifetime)).throwCause).toThrow('owned backup cancellation');
      } finally {
        clearTimeout(fallback);
      }
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += new TextDecoder().decode(chunk.value);
      }
      expect(output).toContain('interrupted');
      expect(child.exitCode).not.toBe(0);
      const elapsed = performance.now() - started;
      if (mode === 'graceful') {
        expect(child.exitCode).toBe(130);
        expect(elapsed).toBeLessThan(1000);
      } else {
        expect(elapsed).toBeGreaterThanOrEqual(4500);
        expect(elapsed).toBeLessThan(7000);
      }
      expect(() => process.kill(-child.pid, 0)).toThrow();
      expect(await new Response(child.stderr).text()).toBe('');
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      await child.exited;
      reader.releaseLock();
    }
  }, 12000);
}
