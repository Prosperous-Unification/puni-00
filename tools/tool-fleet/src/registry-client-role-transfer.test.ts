import { expect, test } from 'bun:test';

test('role staging times out while the transport refuses to read the upload', async () => {
  const child = Bun.spawn(
    [
      'python3',
      new URL('./registry-client-role-transfer.fixture.py', import.meta.url).pathname,
      new URL('./registry-client-installation-role.native.py', import.meta.url).pathname,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  expect(JSON.parse(stdout)).toMatchObject({
    deadlineHeld: true,
    outerDeadlineExpired: false,
    ownedChildrenReaped: true,
    observation: { cause: 'TimeoutExpired' },
  });
}, 10000);
