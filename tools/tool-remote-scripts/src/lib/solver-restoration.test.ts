import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { inspect as inspectFailure } from 'node:util';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { decodeSolverRestoration } from './solver-restoration';

const pins = {
  version: 1,
  sourceSha: 'd'.repeat(40),
  bunSha256: 'a'.repeat(64),
  bundleSha256: 'b'.repeat(64),
  configSha256: 'c'.repeat(64),
  unitSha256: 'e'.repeat(64),
} as const;
const image = {
  image: `registry/wbs-be-01@sha256:${'c'.repeat(64)}`,
  imageId: `sha256:${'b'.repeat(64)}`,
  semantics: ['cross-project-dependencies-v1'],
} as const;
const envelope = () =>
  ({
    owner: 'exact-owner\n',
    record: {
      format: 'dependency-solver-restoration',
      version: 1,
      operation: 'restore-solver-only',
      pins,
      images: [image],
    },
  }) as const;

test('restoration decoder preserves the closed independently pinned intent', () => {
  expect(decodeSolverRestoration(envelope())).toEqual(envelope());
});

test('restoration decoder refuses caller claims, incapable images and ambiguous coverage', () => {
  for (const value of [
    { ...envelope(), extra: true },
    { ...envelope(), record: { ...envelope().record, operation: 'activate' } },
    { ...envelope(), record: { ...envelope().record, complete: true } },
    { ...envelope(), record: { ...envelope().record, pins: { ...pins, expected: true } } },
    { ...envelope(), record: { ...envelope().record, images: [] } },
    { ...envelope(), record: { ...envelope().record, images: [image, image] } },
    { ...envelope(), record: { ...envelope().record, images: [{ ...image, semantics: [] }] } },
    {
      ...envelope(),
      record: { ...envelope().record, images: [{ ...image, image: 'registry/wbs-be-01:latest' }] },
    },
    { ...envelope(), record: { ...envelope().record, images: [{ ...image, imageId: 'latest' }] } },
    { ...envelope(), record: { ...envelope().record, images: [{ ...image, extra: true }] } },
    {
      ...envelope(),
      record: {
        ...envelope().record,
        images: [{ ...image, image: image.image.replace('cccc', 'ffff') }, image],
      },
    },
  ])
    expect(() => decodeSolverRestoration(value)).toThrow();
});

test('owner produces compatibility from actual probes and rechecks independent pins and images', async () => {
  const { createSourceSolverFixture } = await import('../fixtures/source-solver');
  const { withDependencyOwner } = await import('./edge-ownership');
  const module = await import('./solver-restoration');
  const fixture = await createSourceSolverFixture(scratchSync('restore-intent-'), image.image);
  await withDependencyOwner(
    fixture.plan,
    async (owner) => {
      const docker = fixture.ports.runDocker;
      const ports = {
        ...fixture.ports,
        runDocker: async (args: string[], signal?: AbortSignal) => {
          if (args[0] === 'run')
            return JSON.stringify({
              protocol: 'wbs-dependency-runtime',
              version: 1,
              role: 'backend',
              semantics: ['cross-project-dependencies-v1'],
            });
          return docker(args, signal);
        },
      };
      const retained = await module.retainCompatibleSolverIntent(
        owner,
        fixture.layouts,
        fixture.pins,
        ports,
        performance.now() + 10000,
      );
      expect(decodeSolverRestoration(JSON.parse(retained.contents)).record.images).toEqual([
        { ...image, imageId: `sha256:${'c'.repeat(64)}` },
      ]);
      await refuses(
        module.retainCompatibleSolverIntent(
          owner,
          fixture.layouts,
          fixture.pins,
          {
            ...ports,
            runDocker: async (args: string[], signal?: AbortSignal) =>
              args[0] === 'run'
                ? JSON.stringify({
                    protocol: 'wbs-dependency-runtime',
                    version: 1,
                    role: 'backend',
                    semantics: [],
                  })
                : docker(args, signal),
          },
          performance.now() + 10000,
        ),
      );
    },
    fixture.root,
  );
});

test('restoration trusted records require bounded private unchanged regular bytes', async () => {
  const { chmod, writeFile, symlink } = await import('node:fs/promises');
  const { captureEdgeRecord } = await import('./edge-policy');
  const directory = scratchSync('restore-record-');
  const name = 'edge-owner-000001-solver-restore-intent.json';
  const path = `${directory}/${name}`;
  await writeFile(path, 'exact\n', { mode: 0o600 });
  expect((await captureEdgeRecord(directory, name, 65536)).contents).toBe('exact\n');
  await chmod(path, 0o644);
  await refuses(captureEdgeRecord(directory, name, 65536));
  await chmod(path, 0o600);
  await writeFile(path, 'x'.repeat(65537));
  await refuses(captureEdgeRecord(directory, name, 65536));
  await writeFile(`${directory}/unsupported.json`, 'private', { mode: 0o600 });
  await refuses(
    captureEdgeRecord(directory, 'unsupported.json', 65536),
    'unsupported edge record path',
  );
  await symlink(path, `${directory}/alias`);
  await refuses(captureEdgeRecord(directory, 'alias', 65536));
  await refuses(captureEdgeRecord(directory, '../foreign', 65536));
});

test('only a newly retained compatible intent can atomically replace the captured ordinary policy', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createSourceSolverFixture } = await import('../fixtures/source-solver');
  const ownership = await import('./edge-ownership');
  const policy = await import('./edge-policy');
  const restoration = await import('./solver-restoration');
  const fixture = await createSourceSolverFixture(scratchSync('restore-publish-'), image.image);
  await policy.initializeOrdinaryEdgePolicy(fixture.root);
  await ownership.withDependencyOwner(
    fixture.plan,
    async (owner) => {
      const original = await policy.captureEdgePolicy(fixture.root);
      const docker = fixture.ports.runDocker;
      const retained = await restoration.retainCompatibleSolverIntent(
        owner,
        fixture.layouts,
        fixture.pins,
        {
          ...fixture.ports,
          runDocker: async (args, signal) =>
            args[0] === 'run'
              ? JSON.stringify({
                  protocol: 'wbs-dependency-runtime',
                  version: 1,
                  role: 'backend',
                  semantics: ['cross-project-dependencies-v1'],
                })
              : docker(args, signal),
        },
        performance.now() + 10000,
      );
      await refuses(
        ownership.publishRestoringEdgePolicy(owner, original, { ...retained }),
        'not retained',
      );
      await refuses(
        ownership.publishRestoringEdgePolicy(owner, { ...original, path: retained.path }, retained),
        'scope',
      );
      await ownership.publishRestoringEdgePolicy(owner, original, retained);
      const published = await policy.captureEdgePolicy(fixture.root);
      expect(published.policy.phase).toBe('restoring');
      expect(published.mode).toBe(0o600);
      expect(await readFile(`${fixture.root}/edge-owner.pending`, 'utf8')).toBe(
        decodeSolverRestoration(JSON.parse(retained.contents)).owner,
      );
      await refuses(ownership.publishRestoringEdgePolicy(owner, original, retained));
    },
    fixture.root,
  );
});

for (const fault of [
  'none',
  'policy-hash',
  'foreign-owner',
  'missing-pending',
  'malformed-pending',
  'committed',
  'public-policy',
  'coverage',
  'tuple',
  'intent-public',
  'executing',
  'missing-intent',
  'malformed-intent',
  'unreadable-intent',
  'unreadable-pending',
  'policy-drift',
  'intent-drift',
  'pending-drift',
  'tuple-inode',
  'owner-scope',
  'owner-extra',
  'owner-order',
  'omitted-mapping',
  'phase-drift',
] as const) {
  test(`phase-aware runtime verifies restoring bindings under the lifetime lock: ${fault}`, async () => {
    const directory = scratchSync('restore-runtime-');
    const program = `
    import { mock } from 'bun:test';
    import { readFile, writeFile, unlink, chmod, rename } from 'node:fs/promises';
    import { createHash } from 'node:crypto';
    const fault = ${JSON.stringify(fault)};
    const execution = await import(${JSON.stringify(`${import.meta.dir}/solver-execution.ts`)});
    mock.module(${JSON.stringify(`${import.meta.dir}/solver-execution.ts`)}, () => ({ ...execution, assertExecutingSolver: async () => { if (fault === 'executing') throw new Error('actual execution changed'); } }));
    const { createSourceSolverFixture } = await import(${JSON.stringify(`${import.meta.dir}/../fixtures/source-solver.ts`)});
    const f = await createSourceSolverFixture(${JSON.stringify(directory)}, ${JSON.stringify(image.image)});
    if (fault === 'omitted-mapping') {
      const configured = JSON.parse(await readFile(f.root + '/installed-2', 'utf8'));
      const second = 'registry/wbs-be-01@sha256:' + 'f'.repeat(64);
      configured.images.push({ callerName: 'be-01-green', callerImage: second, solverImage: second });
      const contents = JSON.stringify(configured);
      await writeFile(f.root + '/installed-2', contents);
      f.pins.configSha256 = createHash('sha256').update(contents).digest('hex');
    }
    const host = await import(${JSON.stringify(`${import.meta.dir}/solver-host.ts`)});
    const capture = host.captureSolverFile;
    let runtimeObserved = false;
    let drifted = false;
    let retainedPath;
    let tupleCaptures = 0;
    mock.module(${JSON.stringify(`${import.meta.dir}/solver-host.ts`)}, () => ({ ...host, captureSolverFile: async (path, maximum, config) => {
      if (runtimeObserved && !drifted && fault.endsWith('-drift') && !path.startsWith(f.root + '/')) {
        drifted = true;
        const target = fault === 'intent-drift' ? retainedPath : f.root + '/' + (fault === 'policy-drift' ? 'edge-policy.json' : 'edge-owner.pending');
        if (target === undefined) throw new Error('fixture retained intent unavailable');
        const bytes = await readFile(target);
        await rename(target, target + '.retained');
        await writeFile(target, bytes, { mode: 0o600 });
      }
      const observed = await (path.startsWith(f.root + '/') ? capture(path, maximum, config) : f.ports.captureFile(path, maximum, config));
      if (runtimeObserved && !path.startsWith(f.root + '/') && ++tupleCaptures === 4 && fault === 'tuple-inode') {
        const bytes = await readFile(f.root + '/installed-1');
        await rename(f.root + '/installed-1', f.root + '/previous-bundle');
        await writeFile(f.root + '/installed-1', bytes, { mode: 0o755 });
      }
      return observed;
    } }));
    const docker = await import(${JSON.stringify(`${import.meta.dir}/docker-deadline.ts`)});
    mock.module(${JSON.stringify(`${import.meta.dir}/docker-deadline.ts`)}, () => ({ ...docker, runDockerCli: f.ports.runDocker }));
    const env = await import(${JSON.stringify(`${import.meta.dir}/env.ts`)});
    mock.module(${JSON.stringify(`${import.meta.dir}/env.ts`)}, () => ({ ...env, envLayout: name => name === 'prod' ? f.layouts.prod : f.layouts.dev }));
    const owner = await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
    const policy = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
    const restore = await import(${JSON.stringify(`${import.meta.dir}/solver-restoration.ts`)});
    const { withSolverPolicyAdmission } = await import(${JSON.stringify(`${import.meta.dir}/solver-runtime-admission.ts`)});
    const { withCanonicalLock } = await import(${JSON.stringify(`${import.meta.dir}/lock.ts`)});
    await policy.initializeOrdinaryEdgePolicy(f.root);
    await owner.withDependencyOwner(f.plan, async authority => {
      const original = await policy.captureEdgePolicy(f.root);
      const native = f.ports.runDocker;
      const retained = await restore.retainCompatibleSolverIntent(authority, f.layouts, f.pins, { ...f.ports, runDocker: async (args, signal) => args[0] === 'run' ? '${JSON.stringify({ protocol: 'wbs-dependency-runtime', version: 1, role: 'backend', semantics: ['cross-project-dependencies-v1'] })}' : native(args, signal) }, performance.now() + 10000);
      await owner.publishRestoringEdgePolicy(authority, original, retained);
      retainedPath = retained.path;
      const policyPath = f.root + '/edge-policy.json';
      const pendingPath = f.root + '/edge-owner.pending';
      let document = JSON.parse(await readFile(policyPath, 'utf8'));
      let envelope = JSON.parse(retained.contents);
      const hash = bytes => createHash('sha256').update(bytes).digest('hex');
      if (fault === 'policy-hash') document.restorationIntent.sha256 = '0'.repeat(64);
      if (fault === 'foreign-owner') envelope.owner = 'foreign';
      if (fault === 'owner-scope' || fault === 'owner-extra' || fault === 'owner-order') {
        const publication = JSON.parse(envelope.owner);
        if (fault === 'owner-scope') publication.plan.layouts[0].root = '/foreign';
        else if (fault === 'owner-order') publication.plan.layouts.reverse();
        else publication.extra = true;
        envelope.owner = JSON.stringify(publication);
        await writeFile(pendingPath, envelope.owner);
        document.ownerPublicationSha256 = hash(envelope.owner);
      }
      if (fault === 'malformed-pending') { envelope.owner = '{'; await writeFile(pendingPath, '{'); document.ownerPublicationSha256 = hash('{'); }
      if (fault === 'omitted-mapping') envelope.record.images.pop();
      if (fault === 'coverage') envelope.record.images[0].image = 'registry/wbs-be-01@sha256:' + 'f'.repeat(64);
      if (['foreign-owner', 'malformed-pending', 'coverage', 'owner-scope', 'owner-extra', 'owner-order', 'omitted-mapping'].includes(fault)) { const bytes = JSON.stringify(envelope); await writeFile(retained.path, bytes); document.restorationIntent.sha256 = hash(bytes); }
      await writeFile(policyPath, JSON.stringify(document));
      if (fault === 'missing-pending') await unlink(pendingPath);
      if (fault === 'committed') await writeFile(f.root + '/edge-owner.json', 'committed');
      if (fault === 'public-policy') await chmod(policyPath, 0o644);
      if (fault === 'intent-public') await chmod(retained.path, 0o644);
      if (fault === 'missing-intent') await unlink(retained.path);
      if (fault === 'malformed-intent') await writeFile(retained.path, '{');
      if (fault === 'unreadable-intent') await chmod(retained.path, 0);
      if (fault === 'unreadable-pending') await chmod(pendingPath, 0);
      if (fault === 'tuple') await writeFile(f.root + '/installed-1', 'foreign bundle');
      if (fault === 'phase-drift') {
        const capturePolicy = policy.captureEdgePolicy;
        let swapped = false;
        mock.module(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)}, () => ({ ...policy, captureEdgePolicy: async directory => {
          const snapshot = await capturePolicy(directory);
          if (!swapped) {
            swapped = true;
            await writeFile(policyPath, JSON.stringify({ format: 'dependency-edge-policy', version: 1, phase: 'ordinary', edgeState: f.root }));
            await unlink(pendingPath);
          }
          return snapshot;
        } }));
      }
      let entered = false;
      let refused = false;
      runtimeObserved = true;
      try { await withSolverPolicyAdmission(async () => {
        entered = true;
        let contended = false;
        try { await withCanonicalLock(f.root + '/solver-runtime.lock', async () => {}); }
        catch (cause) { if (!String(cause).includes('lock held')) throw cause; contended = true; }
        if (!contended) throw new Error('runtime lock escaped');
      }, f.root); }
      catch (cause) { if (fault === 'none') throw cause; if (fault === 'omitted-mapping' && !String(cause).includes('configured image coverage')) throw cause; refused = true; }
      if (fault === 'none' ? !entered || refused : entered || !refused) throw new Error('runtime binding admitted forbidden path');
      console.log(fault === 'none' ? 'verified' : 'refused');
    }, f.root);
  `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout).toBe(fault === 'none' ? 'verified\n' : 'refused\n');
  });
}

for (const fault of [
  'file-sync',
  'directory-sync',
  'noop-rename',
  'public-mode',
  'changed-original',
  'changed-intent',
  'changed-parent',
] as const) {
  test(`restoring publication refuses production ${fault} fault`, async () => {
    const directory = scratchSync('restore-publication-fault-');
    const program = `
      import { mock } from 'bun:test';
      import * as native from 'node:fs';
      import * as relative from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
      const { createSourceSolverFixture } = await import(${JSON.stringify(`${import.meta.dir}/../fixtures/source-solver.ts`)});
      const f = await createSourceSolverFixture(${JSON.stringify(directory)}, ${JSON.stringify(image.image)});
      const owner = await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
      const policy = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
      const restore = await import(${JSON.stringify(`${import.meta.dir}/solver-restoration.ts`)});
      await policy.initializeOrdinaryEdgePolicy(f.root);
      await owner.withDependencyOwner(f.plan, async authority => {
        const original = await policy.captureEdgePolicy(f.root);
        const retained = await restore.retainCompatibleSolverIntent(authority, f.layouts, f.pins, { ...f.ports, runDocker: async (args, signal) => args[0] === 'run' ? '${JSON.stringify({ protocol: 'wbs-dependency-runtime', version: 1, role: 'backend', semantics: ['cross-project-dependencies-v1'] })}' : f.ports.runDocker(args, signal) }, performance.now() + 10000);
        const fault = ${JSON.stringify(fault)};
        const sync = native.fsyncSync;
        const write = native.writeFileSync;
        const open = relative.openDirectoryFile;
        const rename = relative.renameDirectoryFile;
        let injected = false;
        mock.module('node:fs', () => ({ ...native,
          fsyncSync: fd => {
            const path = native.readlinkSync('/proc/self/fd/' + fd);
            if ((fault === 'file-sync' && path.includes('.edge-policy.json.dependency-')) || (fault === 'directory-sync' && path === f.root)) { injected = true; throw new Error('injected sync failure'); }
            sync(fd);
          },
          writeFileSync: (fd, bytes, ...options) => {
            write(fd, bytes, ...options);
            if (typeof fd === 'number' && native.readlinkSync('/proc/self/fd/' + fd).includes('.edge-policy.json.dependency-')) {
              if (fault === 'changed-original') { injected = true; write(f.root + '/edge-policy.json', '{}'); }
              if (fault === 'changed-intent') { injected = true; write(retained.path, '{}'); }
            }
          }
        }));
        mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)}, () => ({ ...relative,
          openDirectoryFile: (fd, name, flags) => {
            const opened = open(fd, name, flags);
            if (name.startsWith('.edge-policy.json.dependency-') && fault === 'public-mode') { injected = true; native.fchmodSync(opened, 0o644); }
            return opened;
          },
          renameDirectoryFile: (fd, source, target) => {
            if (target === 'edge-policy.json' && fault === 'noop-rename') { injected = true; return; }
            if (target === 'edge-policy.json' && fault === 'changed-parent') { injected = true; native.renameSync(f.root, f.root + '.retained'); native.mkdirSync(f.root); }
            return rename(fd, source, target);
          }
        }));
        let refused = false;
        try { await owner.publishRestoringEdgePolicy(authority, original, retained); }
        catch { refused = true; }
        if (!injected || !refused) throw new Error('publication fault was accepted or not exercised');
        if (fault === 'public-mode' && native.readFileSync(f.root + '/edge-policy.json', 'utf8') !== original.contents) throw new Error('public-mode staging crossed publication boundary');
      }, f.root);
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });
}

test('fixed readiness waits within its bound for an actual delayed socket and refuses cancellation', async () => {
  const directory = scratchSync('solver-connect-');
  const program = `
    import { mock } from 'bun:test';
    import { createServer } from 'node:net';
    const contract = await import(${JSON.stringify(`${import.meta.dir}/solver-supervisor-install-contract.ts`)});
    const socket = ${JSON.stringify(`${directory}/ready.sock`)};
    mock.module(${JSON.stringify(`${import.meta.dir}/solver-supervisor-install-contract.ts`)}, () => ({ ...contract, SOLVER_SUPERVISOR_SOCKET: socket }));
    const { solverRestoreHostPorts } = await import(${JSON.stringify(`${import.meta.dir}/solver-host.ts`)});
    const server = createServer(connection => connection.destroy());
    const timer = setTimeout(() => server.listen(socket), 30);
    try {
      await solverRestoreHostPorts().connectSocket(AbortSignal.timeout(1000));
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      let refused = false;
      try { await solverRestoreHostPorts().connectSocket(AbortSignal.timeout(30)); }
      catch { refused = true; }
      if (!refused) throw new Error('absent/cancelled listener reported ready');
    } finally { clearTimeout(timer); if (server.listening) server.close(); }
  `;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  expect(stderr).toBe('');
  expect(code).toBe(0);
});

async function refuses(operation: Promise<unknown>, message = ''): Promise<void> {
  let refusal: unknown;
  try {
    await operation;
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain(message);
}

test('owner capability failure diagnostics never expose transport payloads', async () => {
  const { createSourceSolverFixture } = await import('../fixtures/source-solver');
  const { withDependencyOwner } = await import('./edge-ownership');
  const { retainCompatibleSolverIntent } = await import('./solver-restoration');
  const fixture = await createSourceSolverFixture(
    scratchSync('restore-private-capability-'),
    image.image,
  );
  await withDependencyOwner(
    fixture.plan,
    async (owner) => {
      let refusal: unknown;
      try {
        await retainCompatibleSolverIntent(
          owner,
          fixture.layouts,
          fixture.pins,
          {
            ...fixture.ports,
            runDocker: async (args, signal) =>
              args[0] === 'run'
                ? 'PRIVATE_CAPABILITY_SENTINEL'
                : fixture.ports.runDocker(args, signal),
          },
          performance.now() + 10000,
        );
      } catch (cause) {
        refusal = cause;
      }
      expect(refusal).toBeInstanceOf(Error);
      expect(String(refusal)).not.toContain('PRIVATE_CAPABILITY_SENTINEL');
    },
    fixture.root,
  );
});

for (const fault of ['json', 'schema', 'utf8'] as const) {
  test(`direct compatibility producer keeps trusted config ${fault} errors private`, async () => {
    const { createSourceSolverFixture } = await import('../fixtures/source-solver');
    const { withDependencyOwner } = await import('./edge-ownership');
    const { retainCompatibleSolverIntent } = await import('./solver-restoration');
    const fixture = await createSourceSolverFixture(
      scratchSync('restore-private-config-'),
      image.image,
    );
    const sentinel = 'PRIVATE_PRODUCER_CONFIG_SENTINEL';
    const original: unknown = JSON.parse(await readFile(`${fixture.root}/installed-2`, 'utf8'));
    if (typeof original !== 'object' || original === null || Array.isArray(original))
      throw new Error('fixture config unavailable');
    const corrupted =
      fault === 'schema'
        ? Buffer.from(JSON.stringify({ ...original, [sentinel]: 'secret' }))
        : fault === 'utf8'
          ? Buffer.concat([Buffer.from([255]), Buffer.from(sentinel)])
          : Buffer.from(`${sentinel}=secret`);
    await withDependencyOwner(
      fixture.plan,
      async (owner) => {
        let refusal: unknown;
        try {
          await retainCompatibleSolverIntent(
            owner,
            fixture.layouts,
            fixture.pins,
            {
              ...fixture.ports,
              runDocker: async (args, signal) => {
                if (args[0] !== 'run') return fixture.ports.runDocker(args, signal);
                await writeFile(`${fixture.root}/installed-2`, corrupted);
                return JSON.stringify({
                  protocol: 'wbs-dependency-runtime',
                  version: 1,
                  role: 'backend',
                  semantics: ['cross-project-dependencies-v1'],
                });
              },
            },
            performance.now() + 10000,
          );
        } catch (cause) {
          refusal = cause;
        }
        expect(refusal).toBeInstanceOf(Error);
        expect(inspectFailure(refusal, { depth: null })).not.toContain(sentinel);
        expect(String(refusal)).toContain('solver installed configuration');
        expect(String(refusal)).toContain(createHash('sha256').update(corrupted).digest('hex'));
        for (const name of await readdir(fixture.root))
          if (name.endsWith('.json'))
            expect(await readFile(`${fixture.root}/${name}`, 'utf8')).not.toContain(sentinel);
      },
      fixture.root,
    );
  });
}
