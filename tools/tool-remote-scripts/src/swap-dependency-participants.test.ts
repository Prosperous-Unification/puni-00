import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { parseDependencyParticipantInvocation } from './lib/dependency-participants';

test('participant inspection accepts only its dedicated backend invocation', () => {
  expect(parseDependencyParticipantInvocation(['be', '--inspect-dependency-participants'])).toBe(
    true,
  );
  expect(parseDependencyParticipantInvocation(['be', '--execute'])).toBe(false);
});

for (const args of [
  ['gw', '--inspect-dependency-participants'],
  ['be,gw', '--inspect-dependency-participants'],
  ['be', '--inspect-dependency-participants', '--execute'],
  ['be', '--inspect-dependency-participants', '--image-be=secret-reference'],
  ['be', '--inspect-dependency-participants', '--preflight'],
  ['be', '--inspect-dependency-participants', '--inspect-dependency-backend-fence'],
  ['be', '--inspect-dependency-participants', '--inspect-dependency-participants'],
  ['be', '--inspect-dependency-participants=true'],
]) {
  test(`refuses mixed participant invocation ${args.join(' ')}`, async () => {
    expect(() => parseDependencyParticipantInvocation(args)).toThrow('participant inspection');
    const child = Bun.spawn(
      [process.execPath, fileURLToPath(new URL('./swap.ts', import.meta.url)), ...args],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(code).toBe(1);
    expect(stderr).toContain('participant inspection');
    expect(stderr).not.toContain('secret-reference');
  });
}

test('production retained inspector receives the single observation deadline', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(new URL('./lib/dependency-participant-deadline.fixture.ts', import.meta.url)),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(stderr).toBe('');
  expect(code).toBe(0);
  expect(stdout).toContain('production shared deadline verified');
});
