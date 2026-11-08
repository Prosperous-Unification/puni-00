import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

const Observation = type({
  state: "'returned'|'rejected'",
  value: 'string|null',
  message: 'string|null',
  code: 'string|null',
  processAudits: 'number',
  pathObservations: 'number',
  scope: 'string',
  '+': 'reject',
});
for (const mode of [
  'alias',
  'unscheduled-alias',
  'ancestor-alias',
  'unrelated',
  'other-node',
  'missing',
  'unreadable',
  'relative',
  'malformed-node',
  'unresolved-claim',
  'ephemeral-claim',
  'other-node-ephemeral',
  'unscheduled-claim',
  'other-node-claim',
  'recovery-alias',
  'recovery-claim',
  'unreadable-store',
  'unreadable-ancestor',
] as const)
  test('actual stopped action verifies pending pod filesystem identity ' + mode, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./registry-pod-writers-worker.fixture.ts', import.meta.url).pathname,
        mode,
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
    );
    const [code, output, errors] = await Promise.all([
      child.exited,
      readRegistryBytes(child.stdout, 65536, 'Pod writer observation'),
      readRegistryBytes(child.stderr, 65536, 'Pod writer errors'),
    ]);
    if (code !== 0)
      throw new Error('Pod writer fixture setup failed: ' + new TextDecoder().decode(errors));
    expect(errors.byteLength).toBe(0);
    const observed = Observation.assert(JSON.parse(new TextDecoder().decode(output)));
    if (
      mode === 'unrelated' ||
      mode === 'other-node' ||
      mode === 'other-node-claim' ||
      mode === 'other-node-ephemeral'
    ) {
      expect(observed).toMatchObject({ state: 'returned', value: 'verified', processAudits: 1 });
      if (mode === 'other-node' || mode === 'other-node-claim' || mode === 'other-node-ephemeral')
        expect(observed.pathObservations).toBe(0);
    } else {
      expect(observed.state).toBe('rejected');
      expect(observed.processAudits).toBe(0);
      if (
        mode === 'alias' ||
        mode === 'unscheduled-alias' ||
        mode === 'ancestor-alias' ||
        mode === 'recovery-alias' ||
        mode === 'recovery-claim'
      )
        expect(observed.message).toBe('Registry writer exclusion is not freshly verified');
      if (mode === 'unresolved-claim' || mode === 'unscheduled-claim')
        expect(observed.message).toBe(
          'Registry writer exclusion lacks backing-path evidence for PVC other/alternate-backing-unknown',
        );
      if (mode === 'ephemeral-claim')
        expect(observed.message).toBe(
          'Registry writer exclusion lacks backing-path evidence for ephemeral volume other/writer',
        );
      if (mode === 'missing') expect(observed.code).toBe('ENOENT');
      if (mode === 'unreadable' || mode === 'unreadable-store' || mode === 'unreadable-ancestor')
        expect(observed.code).toBe('EACCES');
    }
  });
