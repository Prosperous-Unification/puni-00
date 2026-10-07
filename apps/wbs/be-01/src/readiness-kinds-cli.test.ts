import { expect, it } from 'bun:test';

it('prints the readinesses this binary reads as JSON', async () => {
  const command = Bun.spawn(['bun', 'run', 'src/readiness-kinds-cli.ts'], {
    cwd: `${import.meta.dir}/..`,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(command.stdout).text();
  expect(await command.exited).toBe(0);
  expect(JSON.parse(output)).toEqual(['draft', 'ready']);
});
