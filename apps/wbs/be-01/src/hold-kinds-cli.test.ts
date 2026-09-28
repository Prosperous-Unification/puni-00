import { expect, it } from 'bun:test';

it('prints the hold kinds this binary reads as JSON', async () => {
  const command = Bun.spawn(['bun', 'run', 'src/hold-kinds-cli.ts'], {
    cwd: `${import.meta.dir}/..`,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(command.stdout).text();
  expect(await command.exited).toBe(0);
  expect(JSON.parse(output)).toEqual([]);
});
