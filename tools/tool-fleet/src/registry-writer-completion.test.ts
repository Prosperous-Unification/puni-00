import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

const Completion = type({
  kind: "'fulfilled' | 'rejected'",
  failures: 'string[]',
  rootCause: 'string | null',
  directoryRemained: 'boolean',
  parentsReaped: 'boolean',
  descendantsAbsent: 'boolean',
  parentCount: 'number',
  descendantCount: 'number',
  '+': 'reject',
});
async function runCompletion(mode: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-writer-completion.fixture.ts', import.meta.url).pathname,
      mode,
    ],
    {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(10000),
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 65536, 'Writer completion stdout'),
    readRegistryBytes(child.stderr, 65536, 'Writer completion stderr'),
  ]);
  if (exitCode !== 0)
    throw new Error('Owned writer completion harness failed: ' + new TextDecoder().decode(stderr));
  const prefix = 'task8-writer-completion:';
  const frames = new TextDecoder()
    .decode(stdout)
    .split('\n')
    .filter((line) => line.startsWith(prefix));
  if (frames.length !== 1) throw new Error('Missing unique writer completion receipt');
  const frame = frames.at(0);
  if (frame === undefined) throw new Error('Missing owned completion frame');
  return Completion.assert(JSON.parse(frame.slice(prefix.length)));
}

test('native writer proof runs both actual kernel cases and removes its workspace', async () => {
  expect(await runCompletion('normal')).toEqual({
    kind: 'fulfilled',
    failures: [],
    rootCause: null,
    directoryRemained: false,
    parentsReaped: true,
    descendantsAbsent: true,
    parentCount: 3,
    descendantCount: 2,
  });
});
for (const [mode, failures, rootCause, parentCount, descendantCount] of [
  ['compile', ['compile'], null, 0, 0],
  ['observation', ['primary'], null, 2, 1],
  ['close', ['close'], null, 2, 1],
  ['binary', ['binary'], null, 2, 1],
  ['remove', ['remove'], null, 3, 2],
  ['observation+binary', ['primary', 'binary'], 'primary', 2, 1],
  ['observation+close', ['primary', 'close'], 'primary', 2, 1],
  ['observation+close+binary+remove', ['primary', 'close', 'binary', 'remove'], 'primary', 2, 1],
  ['observation-undefined', ['wrapped-primary'], null, 2, 1],
  ['dead-undefined', ['wrapped-primary'], null, 3, 2],
  ['dead-null', ['wrapped-primary'], null, 3, 2],
  ['dead-string', ['wrapped-primary'], null, 3, 2],
  ['dead-writers', ['writer'], null, 3, 2],
  ['exit', ['exit'], null, 2, 1],
  ['survivor', ['survivor'], null, 2, 1],
  ['observation+exit+survivor+binary', ['primary', 'exit', 'survivor', 'binary'], 'primary', 2, 1],
] as const) {
  test(
    'native writer completion preserves required failure and still cleans owned effects: ' + mode,
    async () => {
      expect(await runCompletion(mode)).toEqual({
        kind: 'rejected',
        failures: [...failures],
        rootCause,
        directoryRemained: false,
        parentsReaped: true,
        descendantsAbsent: true,
        parentCount,
        descendantCount,
      });
    },
  );
}
