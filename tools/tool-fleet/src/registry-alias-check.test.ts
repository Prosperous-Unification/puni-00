import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

const Observation = type({
  state: "'returned'|'launch-stopped'|'refused'|'unexpected'",
  readonly: 'boolean',
  requests: 'string[]',
  '+': 'reject',
});
for (const fault of [
  'valid',
  'missing-mode',
  'opposite-mode',
  'wrong-root',
  'missing-field',
  'no-alias',
  'duplicate-alias',
] as const) {
  test('actual guard starter validates alias before a modeled remount: ' + fault, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./registry-alias-check.fixture.ts', import.meta.url).pathname,
        fault,
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
    );
    const [code, output, errors] = await Promise.all([
      child.exited,
      readRegistryBytes(child.stdout, 65536, 'Alias observation stdout'),
      readRegistryBytes(child.stderr, 65536, 'Alias observation stderr'),
    ]);
    if (code !== 0)
      throw new Error('Alias observation setup failed: ' + new TextDecoder().decode(errors));
    const observed = Observation.assert(JSON.parse(new TextDecoder().decode(output)));
    expect(observed).toEqual(
      fault === 'valid'
        ? { state: 'launch-stopped', readonly: true, requests: ['writable', 'readonly'] }
        : { state: 'refused', readonly: true, requests: [] },
    );
  });
}
