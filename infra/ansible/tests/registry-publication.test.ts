import { createHash } from 'node:crypto';

import { expect, it } from 'bun:test';

it('admits complete publication before actual pinned Distribution POSTs and retains partial ownership', async () => {
  const transport = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (!transport || !host) throw new Error('Explicit fixture SSH transport and host required');
  const source = async (path: string) => Bun.file(new URL(path, import.meta.url)).text();
  const [helper, guard, rehearsal, wrapper] = await Promise.all([
    source('../roles/registry_storage/files/storage.sh'),
    source('../../platform/registry/production/startup.sh'),
    source('./registry-publication-rehearsal.test.sh'),
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
    entrypoints: [new URL('./registry-publication-fixture.ts', import.meta.url).pathname],
    target: 'bun',
  });
  if (!scratch.success || scratch.outputs.length !== 1)
    throw new Error('Scratch fixture bundle failed');
  const scratchBundle = await scratch.outputs.at(0)?.text();
  if (scratchBundle === undefined) throw new Error('Missing scratch fixture bundle');
  const enrollmentBuild = await Bun.build({
    entrypoints: [new URL('./registry-enrollment-fixture.ts', import.meta.url).pathname],
    target: 'bun',
  });
  if (!enrollmentBuild.success || enrollmentBuild.outputs.length !== 1)
    throw new Error('Enrollment fixture bundle failed');
  const enrollmentBundle = await enrollmentBuild.outputs.at(0)?.text();
  if (enrollmentBundle === undefined) throw new Error('Missing enrollment fixture bundle');
  const copyBuild = await Bun.build({
    entrypoints: [new URL('./registry-copy-fixture.ts', import.meta.url).pathname],
    target: 'bun',
  });
  if (!copyBuild.success || copyBuild.outputs.length !== 1)
    throw new Error('Copy fixture bundle failed');
  const copyBundle = await copyBuild.outputs.at(0)?.text();
  if (copyBundle === undefined) throw new Error('Missing copy fixture bundle');
  const copyEncoded = Buffer.from(copyBundle).toString('base64');
  const copyExports = Array.from(
    { length: Math.ceil(copyEncoded.length / 60000) },
    (_, index) =>
      `export COPY_BUNDLE_${String(index)}=${copyEncoded.slice(index * 60000, (index + 1) * 60000)}`,
  ).join('\n');
  const enrollmentEncoded = Buffer.from(enrollmentBundle).toString('base64');
  const enrollmentExports = Array.from(
    { length: Math.ceil(enrollmentEncoded.length / 60000) },
    (_, index) =>
      `export ENROLLMENT_BUNDLE_${String(index)}=${enrollmentEncoded.slice(index * 60000, (index + 1) * 60000)}`,
  ).join('\n');
  const encoded = Buffer.from(bundle).toString('base64');
  const scratchEncoded = Buffer.from(scratchBundle).toString('base64');
  const scratchExports = Array.from(
    { length: Math.ceil(scratchEncoded.length / 60000) },
    (_, index) =>
      `export PUBLISHER_BUNDLE_${String(index)}=${scratchEncoded.slice(index * 60000, (index + 1) * 60000)}`,
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
    `export OCI_EXPORT=${Buffer.from(await Bun.file(new URL('../../../tools/tool-fleet/src/fixtures/dagger-0.21.9.oci.tar', import.meta.url)).arrayBuffer()).toString('base64')}\nexport BUN_SHA256=${runtimeHash}\nexport STORAGE_AUTHORITY=${Buffer.from(wrapper).toString('base64')}\nexport BUN_RUNTIME=${runtime}\n${exports}\n${copyExports}\n${scratchExports}\n${enrollmentExports}\nexport STORAGE_HELPER=${Buffer.from(helper).toString('base64')}\nexport STORAGE_GUARD=${Buffer.from(guard).toString('base64')}\n${rehearsal}`,
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
    'native exact exported closure has complete durable receipt and releases slot',
    'native managed copyImages stages exact source closure and completes all required tiers',
    'native capacity refusal precedes first POST',
    'native third upload HTTP503 retains candidate ownership and reservation',
    'trusted enrollment refuses missing malformed unreadable and unenforced scratch',
    'removed enrollment metadata guard admits exact unsafe configuration',
    'removed enrollment registry guard admits exact unsafe configuration',
    'removed enrollment owner guard admits exact unsafe configuration',
    'removed enrollment machine guard admits exact unsafe configuration',
    'removed enrollment colocation guard admits exact unsafe configuration',
    'actual exported bytes exceed scratch envelope before upload',
    'cleanup',
  ])
    expect(stdout).toContain(`PASS ${receipt}`);
}, 240000);
