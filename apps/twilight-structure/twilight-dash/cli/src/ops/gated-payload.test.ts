import { expect, it } from 'bun:test';

import { parseDashCommand, readDashInvocation, UsageRefusal } from '../cli-parser';

it('parses one hidden payload request with an explicit separator and exact empty/metacharacter argv', () => {
  const argv: readonly [string, ...string[]] = [
    '/path with spaces/bun',
    '',
    '$(not evaluated)',
    '--help',
    '--',
    '\n',
  ];
  expect(parseDashCommand(['ops', 'job', 'payload-internal-v1', '--', ...argv])).toEqual({
    command: 'ops',
    words: 'job payload-internal-v1',
    argv,
  });
});
for (const suffix of [[], ['--'], ['program'], ['--', ''], ['--unknown', '--', 'program']])
  it(
    'refuses malformed private helper grammar before any operation ' + JSON.stringify(suffix),
    () => {
      expect(() => parseDashCommand(['ops', 'job', 'payload-internal-v1', ...suffix])).toThrow(
        UsageRefusal,
      );
    },
  );
it('keeps the private helper out of ordinary job help', () => {
  let help = '';
  readDashInvocation(['ops', 'job', '--help'], (text) => {
    help += text;
  });
  expect(help).not.toContain('payload-internal-v1');
});

it('captures original run and calibration launch operands before async lock resolution', async () => {
  const fixture = new URL('./testing/gated-composition.test.fixture.ts', import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', fixture], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(status, stderr).toBe(0);
  expect(JSON.parse(stdout)).toEqual(
    Array.from({ length: 2 }, () => ({
      argv: ['original-payload'],
      helperPrefix: ['/selected/protected', 'dash'],
      cwd: '/original/cwd',
      environment: { PATH: '/original/path' },
    })),
  );
});
