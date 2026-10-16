import { expect, test } from 'bun:test';

/** Explicit descriptor experiment; neither ordinary discovery nor CRI acceptance. */
test('observes authenticated descriptor ownership and framed completion', async () => {
  const probe = Bun.spawn(['/usr/bin/python3', '-I', `${import.meta.dir}/connected_fixture.py`], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  console.log(stdout);
  expect(stderr).toBe('');
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout).scenarios).toBe(13);
}, 30000);
