import { expect, test } from 'bun:test';

/** Explicit disposable CRI probe; never included by ordinary test discovery. */
test('records real CRI single-connection behavior and refusal cleanup', async () => {
  const probe = Bun.spawn(['/usr/bin/python3', '-I', `${import.meta.dir}/cri_fixture.py`], {
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
}, 30000);

/** Pinned executable mismatch must stop before disposable runtime startup. */
test('rejects a different crictl executable before starting the daemon', async () => {
  const probe = Bun.spawn(['/usr/bin/python3', '-I', `${import.meta.dir}/cri_fixture.py`], {
    env: { ...process.env, CRI_PROBE_CRICTL: '/usr/bin/true' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  expect(exitCode).not.toBe(0);
  expect(stdout).toBe('');
  expect(stderr).toContain('crictl executable digest mismatch');
});
