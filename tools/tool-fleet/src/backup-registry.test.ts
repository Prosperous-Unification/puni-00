import { expect, test } from 'bun:test';

for (const entrypoint of [
  'backup-registry',
  'retire-registry',
  'recover-registry',
  'activate-registry',
  'registry-maintenance-status',
]) {
  test(`fixed ${entrypoint} refuses caller command/path arguments before reading installation or credentials`, async () => {
    const child = Bun.spawn(
      [process.execPath, new URL(entrypoint + '.ts', import.meta.url).pathname, '/arbitrary'],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    );
    const [code, output, diagnostic] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(1);
    expect(output).toBe('');
    expect(diagnostic).toContain('entrypoint accepts no arguments');
  });
}
test('backup runner refuses the wrong UID before privileged helper or provider access', async () => {
  if (process.getuid?.() === 59001)
    throw new Error('Wrong-UID fixture requires another local identity');
  const child = Bun.spawn(
    [process.execPath, new URL('backup-registry.ts', import.meta.url).pathname],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, output, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(1);
  expect(output).toBe('');
  expect(diagnostic).toContain('installed UID/GID59001 authority runner');
});
