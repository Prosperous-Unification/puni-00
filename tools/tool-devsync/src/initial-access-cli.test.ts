import { expect, it } from 'bun:test';

const entry = new URL('./initial-access-cli.ts', import.meta.url).pathname;
const valid = ['/unused-source', 'a'.repeat(40), 'b'.repeat(40), '/unused-state'];

it.each([
  ['missing arguments', []],
  ['extra argument', [...valid, 'extra']],
  ['relative source', ['relative', ...valid.slice(1)]],
  ['short current', [valid[0], 'a'.repeat(39), valid[2], valid[3]]],
  ['symbolic target', [valid[0], valid[1], 'main', valid[3]]],
  ['relative state', [...valid.slice(0, 3), 'relative']],
] as const)(
  'refuses %s at the actual Bun CLI before repository or marker reads',
  async (_name, args) => {
    const child = Bun.spawn([process.execPath, entry, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain(
      'usage: initial-access-cli <absolute-repository> <current-sha> <target-sha> <absolute-state>',
    );
    expect(stderr).not.toContain('cannot read initial-access Git inventory');
  },
);
