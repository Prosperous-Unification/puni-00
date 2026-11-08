import { expect, test } from 'bun:test';

import {
  type RegistryClientVerificationInput,
  verifyRegistryClientImages,
} from './registry-client-verification';
import { requireRejection } from './registry-rejection.fixture';
test('root client verification refuses unknown input before any server effects', async () => {
  const refused = await requireRejection(
    verifyRegistryClientImages({} as RegistryClientVerificationInput, new AbortController().signal),
  );
  expect(refused.throwCause).toThrow();
});

for (const fault of [
  'none',
  'missing-owner',
  'plan',
  'profile',
  'token',
  'cgroup',
  'boot',
  'machine',
  'future',
  'dirty-pool',
])
  test('actual worker binds durable custody before readonly server effects: ' + fault, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./registry-client-verification.fixture.ts', import.meta.url).pathname,
        fault,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(JSON.parse(stdout)).toEqual({
      fault,
      refusedBeforeServer: fault !== 'none',
      closed: true,
    });
  });
