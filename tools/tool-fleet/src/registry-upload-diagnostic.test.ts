import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

for (const mode of ['direct', 'aggregate']) {
  test(
    'upload controller diagnostic retains original failure and observes primary frame ' + mode,
    async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          new URL('./registry-upload-diagnostic-worker.fixture.ts', import.meta.url).pathname,
          mode,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
      );
      const [code, output, errors] = await Promise.all([
        child.exited,
        readRegistryBytes(child.stdout, 4096, 'Upload diagnostic stdout'),
        readRegistryBytes(child.stderr, 4096, 'Upload diagnostic stderr'),
      ]);
      expect(code).toBe(0);
      expect(errors.byteLength).toBe(0);
      const observed: unknown = JSON.parse(new TextDecoder().decode(output));
      expect(observed).toEqual({
        isOriginal: true,
        reflectedPrivate: false,
        diagnostic: {
          uploadPressureFailure: {
            stage: 'setup',
            observation: {
              category: 'unknown',
              location: {
                kind: 'frame',
                frame: { file: 'fixture-bundle', line: 901, column: 7 },
              },
            },
          },
        },
      });
    },
  );
}
