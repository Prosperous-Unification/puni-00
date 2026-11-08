import { expect, test } from 'bun:test';

for (const fault of [
  'none',
  'absent',
  'unenrolled',
  'artifact-worker',
  'artifact-scope',
  'artifact-control',
  'artifact-mount',
  'artifact-ip',
  'artifact-crane',
  'artifact-bun',
  'artifact-unshare',
  'scratch-read',
  'scratch-id',
  'scratch-bytes',
  'scratch-inodes',
  'journal-read',
  'registry-read',
  'journal-bytes',
  'registry-bytes',
  'registry-id',
  'none-recovery',
  'recovery-read',
  'recovery-id',
  'recovery-bytes',
  'recovery-journal-read',
  'recovery-journal-id',
  'recovery-journal-bytes',
  'pool-uid',
  'pool-gid',
  'pool-mode',
  'pool-kind',
])
  test(
    'installation verifies fixed client artifacts and physical profile without free-space admission: ' +
      fault,
    async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          new URL('./registry-client-installation.fixture.ts', import.meta.url).pathname,
          fault,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
      expect(JSON.parse(stdout)).toEqual({
        fault,
        verified: fault === 'none' || fault === 'none-recovery',
      });
    },
  );
