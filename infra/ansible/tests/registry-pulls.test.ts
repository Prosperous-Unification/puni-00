import { readFile } from 'node:fs/promises';

import { expect, it } from 'bun:test';

it('provisions a root-private bounded pull pool only with verified canonical journal storage', async () => {
  const helper = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (helper === undefined || host === undefined)
    throw new Error('Root fixture transport and host are required');
  const storage = await readFile(
    new URL('../roles/registry_storage/files/storage.sh', import.meta.url),
  );
  const native = await readFile(new URL('./registry-pulls.native.py', import.meta.url));
  const child = Bun.spawn([helper, host, 'python3 -'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await child.stdin.write(
    'import base64\nSTORAGE=base64.b64decode(' +
      JSON.stringify(storage.toString('base64')) +
      ')\nNATIVE_SOURCE=base64.b64decode(' +
      JSON.stringify(native.toString('base64')) +
      ')\nexec(compile(NATIVE_SOURCE,"registry-pulls.native.py","exec"))\n',
  );
  await child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  console.log(stdout);
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  const receipt = JSON.parse(stdout) as {
    workerExit: number;
    workspaceRemoved: boolean;
    loopLeaks: boolean;
    mountLeaks: boolean;
    observation: string;
  };
  expect(receipt).toMatchObject({
    workerExit: 0,
    workspaceRemoved: true,
    loopLeaks: false,
    mountLeaks: false,
  });
  expect(JSON.parse(receipt.observation)).toMatchObject({
    byteCeiling: 67108864,
    inodeCeiling: 1024,
    cases: [
      'cross-mode-refusal',
      'input-owner-refused',
      'input-inode-zero-refused',
      'input-inode-boolean-refused',
      'input-inode-overflow-refused',
      'input-bytes-type-refused',
      'input-extra-refused',
      'root-pool',
      'physical-identity',
      'idempotent',
      'client-parent-write-refused',
      'pool-mode-refused',
      'pool-uid-refused',
      'pool-gid-refused',
      'pool-symlink-refused',
      'inode-profile-refused',
      'trim-exclusion-refused',
      'physical-byte-exhaustion',
      'physical-inode-exhaustion',
      'canonical-reserve-refused',
      'canonical-directory-refused',
      'missing-pull-mount-refused',
      'missing-canonical-journal-refused',
    ],
  });
}, 180000);
