import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { parseBackendFenceInvocation } from './swap';

const sha = 'a'.repeat(40);

test('dedicated fence commands are explicit and mutually exclusive', () => {
  expect(
    parseBackendFenceInvocation(['be', '--fence-dependency-backends', '--execute', `--sha=${sha}`]),
  ).toEqual({ mode: 'fence', sha });
  expect(parseBackendFenceInvocation(['be', '--inspect-dependency-backend-fence'])).toEqual({
    mode: 'inspect',
  });
  expect(parseBackendFenceInvocation(['be', '--execute', '--image-gw=ordinary'])).toBeNull();
});

for (const args of [
  ['gw', '--fence-dependency-backends', '--execute', `--sha=${sha}`],
  ['be,fe', '--fence-dependency-backends', '--execute', `--sha=${sha}`],
  ['be,be', '--inspect-dependency-backend-fence'],
  ['be', '--fence-dependency-backends', `--sha=${sha}`],
  ['be', '--fence-dependency-backends', '--execute'],
  ['be', '--fence-dependency-backends', '--execute', '--sha=short'],
  ['be', '--inspect-dependency-backend-fence', '--execute'],
  ['be', '--inspect-dependency-backend-fence', '--fence-dependency-backends'],
  ['be', '--fence-dependency-backends', '--execute', `--sha=${sha}`, '--image-be=unrelated'],
  ['be', '--fence-dependency-backends', '--execute', `--sha=${sha}`, '--preflight'],
  ['be', '--fence-dependency-backends', '--execute', `--sha=${sha}`, '--activate-step-blockage'],
  ['be', '--fence-dependency-backends', '--execute', `--sha=${sha}`, '--dry-run'],
  ['be', '--fence-dependency-backends', '--execute', '--execute', `--sha=${sha}`],
  ['be', '--fence-dependency-backends=true', '--execute', `--sha=${sha}`],
]) {
  test(`refuses mixed backend invocation ${args.join(' ')}`, async () => {
    expect(() => parseBackendFenceInvocation(args)).toThrow('backend fence');
    const child = Bun.spawn(
      [process.execPath, fileURLToPath(new URL('./swap.ts', import.meta.url)), ...args],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(code).toBe(1);
    expect(stderr).toContain('backend fence');
    expect(stderr).not.toContain('--image-be=');
  });
}
