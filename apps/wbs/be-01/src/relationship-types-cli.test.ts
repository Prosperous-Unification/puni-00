import { expect, it } from 'bun:test';

it('prints the relationship types understood by this binary as JSON', async () => {
  const command = Bun.spawn(['bun', 'run', 'src/relationship-types-cli.ts'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(command.stdout).text();
  expect(await command.exited).toBe(0);
  expect(JSON.parse(output)).toEqual(['FS']);
});
