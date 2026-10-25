import { expect, it } from 'bun:test';
import { parse, parseAllDocuments } from 'yaml';

/** Root-capable, isolated physical proof; never falls back to a mock or a live registry path. */
it('proves bounded storage, startup refusal, trim reservation and convergence on owned filesystems', async () => {
  const transport = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (!transport || !host)
    throw new Error('REGISTRY_STORAGE_SSH and REGISTRY_STORAGE_HOST are required');
  const helper = await Bun.file(
    new URL('../roles/registry_storage/files/storage.sh', import.meta.url),
  ).text();
  const guard = await Bun.file(
    new URL('../../platform/registry/production/startup.sh', import.meta.url),
  ).text();
  const rehearsal = await Bun.file(
    new URL('./registry-storage-rehearsal.sh', import.meta.url),
  ).text();
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
  expect(stdout).toContain('PASS saturation leaves root reserve intact');
  expect(stdout).toContain('PASS missing mount cannot write root');
  expect(stdout).toContain('PASS wrong filesystem refuses startup');
  expect(stdout).toContain('PASS second convergence changes nothing');
  for (const name of ['registry', 'journal'])
    for (const fault of ['owner', 'group', 'mode', 'symlink', 'hardlink'])
      expect(stdout).toContain(
        `PASS identical-byte ${name} receipt ${fault} drift refuses host and startup; removed guards admit it`,
      );
  expect(stdout).toContain('PASS cleanup');
}, 120000);

it('keeps one private storage owner and preserves the pinned root and unrelated holds', async () => {
  const repository = new URL('../../../', import.meta.url);
  const companion = new URL('private/puni-fleet/', repository);
  const read = (path: string, base: URL) => Bun.file(new URL(path, base)).text();
  expect(await read('infrastructure/registry-storage/startup.sh', companion)).toBe(
    await read('infra/platform/registry/production/startup.sh', repository),
  );
  const operations = JSON.parse(
    await read('clusters/helsinki-bootstrap/registry-storage-root-patch.json', companion),
  ) as { op: string; path: string; value: { patch: string } }[];
  expect(operations.map(({ op, path }) => ({ op, path }))).toEqual([
    { op: 'add', path: '/spec/patches/-' },
  ]);
  const child = parse(operations[0]?.value.patch ?? '') as {
    spec: { patches: { patch: string }[]; dependsOn: { name: string }[] };
  };
  expect(child.spec.patches[0]?.patch).toBe(
    await read('infra/platform/registry/production/storage-patch.yaml', repository),
  );
  expect(child.spec.dependsOn.map(({ name }) => name)).toEqual([
    'storage',
    'secrets',
    'registry-storage',
  ]);
  const holds = ['observability', 'alerts', 'backup'].map((name) => ({
    target: { name },
    patch: '- op: add\n  path: /spec/suspend\n  value: true\n',
  }));
  const root = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: { name: 'puni-cluster' },
    spec: { sourceRef: { kind: 'GitRepository', name: 'puni-platform' }, patches: holds },
  };
  const executable = process.env['REGISTRY_TEST_KUBECTL'];
  if (!executable) throw new Error('REGISTRY_TEST_KUBECTL is required for actual JSON Patch proof');
  const patched = Bun.spawn(
    [
      executable,
      'patch',
      '--local',
      '-f',
      '-',
      '--type=json',
      '--patch-file',
      new URL('clusters/helsinki-bootstrap/registry-storage-root-patch.json', companion).pathname,
      '-o',
      'json',
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  await patched.stdin.write(JSON.stringify(root));
  await patched.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    patched.exited,
    new Response(patched.stdout).text(),
    new Response(patched.stderr).text(),
  ]);
  expect(stderr).toBe('');
  expect(code).toBe(0);
  const applied = JSON.parse(stdout) as typeof root;
  expect(applied.spec.patches.slice(0, 3)).toEqual(holds);
  expect(applied.spec.sourceRef).toEqual(root.spec.sourceRef);
  const publicRendering = await read(
    'infra/platform/registry/production/kustomization.yaml',
    repository,
  );
  expect(publicRendering).not.toContain('storage');
  const privateOwner = parse(await read('clusters/helsinki/registry-storage.yaml', companion)) as {
    spec: { dependsOn?: unknown; path: string; kubeConfig: unknown };
  };
  expect(privateOwner.spec.dependsOn).toBeUndefined();
  expect(privateOwner.spec.path).toBe('./infrastructure/registry-storage');
  expect(privateOwner.spec.kubeConfig).toEqual({
    secretRef: { name: 'platform-production-kubeconfig' },
  });
});

it('admits the staged startup pod under the existing live namespace policy without creating it', async () => {
  const executable = process.env['REGISTRY_TEST_KUBECTL'];
  const transport = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (!executable || !transport || !host)
    throw new Error('Pinned kubectl and fixture SSH are required');
  const documents = parseAllDocuments(
    await Bun.file(new URL('../../platform/registry/base/registry.yaml', import.meta.url)).text(),
  );
  const deployment: unknown = documents
    .map((document) => document.toJS() as { kind: string })
    .find((resource: { kind: string }) => resource.kind === 'Deployment');
  const patched = Bun.spawn(
    [
      executable,
      'patch',
      '--local',
      '-f',
      '-',
      '--type=strategic',
      '--patch-file',
      new URL('../../platform/registry/production/storage-patch.yaml', import.meta.url).pathname,
      '-o',
      'json',
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  await patched.stdin.write(JSON.stringify(deployment));
  await patched.stdin.end();
  const [patchCode, patchText, patchErrors] = await Promise.all([
    patched.exited,
    new Response(patched.stdout).text(),
    new Response(patched.stderr).text(),
  ]);
  expect(patchErrors).toBe('');
  expect(patchCode).toBe(0);
  const rendered = JSON.parse(patchText) as { spec: { template: { spec: unknown } } };
  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: `registry-storage-dry-run-${String(Date.now())}`,
      namespace: 'puni-registry',
    },
    spec: rendered.spec.template.spec,
  };
  const admitted = Bun.spawn(
    [transport, host, 'k3s kubectl create --dry-run=server -f - -o name'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  await admitted.stdin.write(JSON.stringify(pod));
  await admitted.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    admitted.exited,
    new Response(admitted.stdout).text(),
    new Response(admitted.stderr).text(),
  ]);
  if (code !== 0) console.error(stderr);
  expect(code).toBe(0);
  expect(stdout.trim()).toBe(`pod/${pod.metadata.name}`);
  console.log(`PASS existing namespace admission (server dry-run only) ${pod.metadata.name}`);
});
