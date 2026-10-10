import { expect, test } from 'bun:test';

test('the shipped capability process advertises isolated mode alone', async () => {
  const cli = new URL('./capacity-modes-cli.ts', import.meta.url).pathname;
  const child = Bun.spawn(['bun', cli], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit).toBe(0);
  expect(stderr).toBe('');
  // Proof: advertising shared in SUPPORTED_CAPACITY_MODES made this physical CLI answer include shared.
  expect(JSON.parse(stdout)).toEqual(['isolated']);
});
