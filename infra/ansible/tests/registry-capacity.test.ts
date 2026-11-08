import { createHash } from 'node:crypto';

import { expect, it } from 'bun:test';

it('fences actual pinned Distribution writes across checker death and process restart', async () => {
  const transport = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (!transport || !host) throw new Error('Explicit fixture SSH transport and host required');
  const source = async (path: string) => Bun.file(new URL(path, import.meta.url)).text();
  const [helper, guard, rehearsal, wrapper] = await Promise.all([
    source('../roles/registry_storage/files/storage.sh'),
    source('../../platform/registry/production/startup.sh'),
    source('./registry-capacity-rehearsal.test.sh'),
    source('../roles/registry_storage/files/authority.sh'),
  ]);
  const runtime = process.env['REGISTRY_TEST_BUN'];
  if (!runtime || !/^\/var\/tmp\/puni-registry-runtime-[a-z0-9_]+\/bun$/.test(runtime))
    throw new Error('Explicit owned pinned Bun fixture required');
  const bundled = await Bun.build({
    entrypoints: [
      new URL('../../../tools/tool-fleet/src/registry-managed-journal-cli.ts', import.meta.url)
        .pathname,
    ],
    target: 'bun',
  });
  if (!bundled.success || bundled.outputs.length !== 1) throw new Error('Authority bundle failed');
  const bundle = await bundled.outputs.at(0)?.text();
  if (bundle === undefined) throw new Error('Authority bundle absent');
  const scratch = await Bun.build({
    entrypoints: [new URL('./registry-capacity-fixture.ts', import.meta.url).pathname],
    target: 'bun',
  });
  if (!scratch.success || scratch.outputs.length !== 1)
    throw new Error('Scratch fixture bundle failed');
  const scratchBundle = await scratch.outputs.at(0)?.text();
  if (scratchBundle === undefined) throw new Error('Missing scratch fixture bundle');
  const encoded = Buffer.from(bundle).toString('base64');
  const scratchEncoded = Buffer.from(scratchBundle).toString('base64');
  const scratchExports = Array.from(
    { length: Math.ceil(scratchEncoded.length / 60000) },
    (_, index) =>
      `export SCRATCH_BUNDLE_${String(index)}=${scratchEncoded.slice(index * 60000, (index + 1) * 60000)}`,
  ).join('\n');
  const exports = Array.from(
    { length: Math.ceil(encoded.length / 60000) },
    (_, index) =>
      `export AUTHORITY_BUNDLE_${String(index)}=${encoded.slice(index * 60000, (index + 1) * 60000)}`,
  ).join('\n');
  const runtimeHash = createHash('sha256')
    .update(new Uint8Array(await Bun.file(process.execPath).arrayBuffer()))
    .digest('hex');
  const child = Bun.spawn([transport, host, 'bash -s'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await child.stdin.write(
    `export BUN_SHA256=${runtimeHash}\nexport STORAGE_AUTHORITY=${Buffer.from(wrapper).toString('base64')}\nexport BUN_RUNTIME=${runtime}\n${exports}\n${scratchExports}\nexport STORAGE_HELPER=${Buffer.from(helper).toString('base64')}\nexport STORAGE_GUARD=${Buffer.from(guard).toString('base64')}\n${rehearsal}`,
  );
  await child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  console.log(stdout);
  if (code !== 0) console.error(stderr);
  expect(code).toBe(0);
  for (const receipt of [
    'missing permit refuses actual uploads',
    'fresh permit admits actual upload',
    'checker death fences actual writes',
    'restart preserves expired fence',
    'changed journal hash refuses actual writes',
    'removed startup fence admits forbidden upload',
    'native authority explicit recovery and heartbeat preserve canonical revision',
    'independent bounded scratch refuses aliases bytes inodes and actual saturation',
    'oversized publication refuses before upload without revoking healthy writer',
    'competing publisher refusal preserves existing writer permit',
    'actual registry ENOSPC preserves independent journal failure receipt and write refusal',
    'malformed journal fails closed and checker restart cannot reopen it',
    'fixed SSH wrapper rejects executable override; removed arity guard admits it',
    'removed expiry guard reopens actual writes after checker death',
    'full journal command fails closed and freeing space cannot reopen writes',
    'actual inode pressure fences writes despite free bytes',
    'removed Scratch aliases a protected filesystem guard admits exact unsafe filesystem',
    'removed Filesystem identity mismatch guard admits exact unsafe filesystem',
    'removed scratch metadata guard admits exact fault',
    'removed scratch maximum guard admits exact fault',
    'actual ext4 reserved blocks remain unavailable to the service UID',
    'cleanup',
  ])
    expect(stdout).toContain(`PASS ${receipt}`);
}, 240000);

it('requires one complete writable permit record in pinned Distribution', async () => {
  const transport = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (!transport || !host) throw new Error('Explicit fixture SSH transport and host required');
  const source = async (path: string) => Bun.file(new URL(path, import.meta.url)).text();
  const [helper, guard, rehearsal] = await Promise.all([
    source('../roles/registry_storage/files/storage.sh'),
    source('../../platform/registry/production/startup.sh'),
    source('./registry-permit-rehearsal.test.sh'),
  ]);
  const child = Bun.spawn([transport, host, 'bash -s'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await child.stdin.write(
    `export STORAGE_HELPER=${Buffer.from(helper).toString('base64')}\nexport STORAGE_GUARD=${Buffer.from(guard).toString('base64')}\n${rehearsal}`,
  );
  await child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  console.log(stdout);
  if (code !== 0) console.error(stderr);
  expect(code).toBe(0);
  for (const fault of [
    'trailing-content',
    'blank-second-line',
    'unterminated-suffix',
    'missing-newline',
    'double-space',
    'leading-space',
    'trailing-space',
    'embedded-nul',
    'trailing-nul',
  ])
    expect(stdout).toContain(`PASS complete permit refuses ${fault} with HTTP405`);
  for (const position of [4, 5])
    expect(stdout).toContain(
      `PASS valid transition hash position ${String(position)} admits HTTP202`,
    );
  for (const fault of ['trailing-content', 'blank-second-line', 'double-space'])
    expect(stdout).toContain(`PASS removed complete-record guard admits ${fault} with HTTP202`);
  expect(stdout).toContain('PASS failed permit open cannot reuse prior record with HTTP405');
  expect(stdout).toContain(
    'PASS removed open-failure propagation reuses prior record with HTTP202',
  );
  expect(stdout).toContain('PASS cleanup');
}, 120000);
