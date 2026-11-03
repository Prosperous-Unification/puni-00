import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { envLayout } from './lib/env';
import { withCanonicalLock } from './lib/lock';

/** Test-only fixed-path adapter: every transformed module fragment must match the reviewed production contract. */
test('actual built restoring CLI proves executing identity and retains the runtime lock through readiness and exit', async () => {
  const root = scratchSync('restoring-cli-');
  const runtimePath = process.env['PATH'];
  if (runtimePath === undefined) throw new Error('fixture requires executable PATH');
  const executable = join(root, 'bun');
  const bundle = join(root, 'supervisor.js');
  const config = join(root, 'config.json');
  const unit = join(root, 'supervisor.service');
  const socket = join(root, 'supervisor.sock');
  const image = `registry/wbs-be-01@sha256:${'a'.repeat(64)}`;
  await mkdir(join(root, 'dev'));
  const layouts = [
    { ...envLayout('prod'), root, stateDir: root },
    { ...envLayout('dev'), root: join(root, 'dev'), stateDir: join(root, 'dev') },
  ];
  const mappings = new Map([
    ['/home/puni1/.local/lib/wbs-solver/bun', executable],
    ['/home/puni1/.local/lib/wbs-solver/solver-supervisor.js', bundle],
    ['/home/puni1/.config/wbs-solver/solver-supervisor.json', config],
    ['/home/puni1/.config/systemd/user/wbs-solver-supervisor.service', unit],
  ]);
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'solver-supervisor.ts')],
    target: 'bun',
    plugins: [
      {
        name: 'private-restoration-fixture',
        setup(build) {
          build.onLoad(
            { filter: /(?:solver-supervisor-install-contract|solver-supervisor-config|env)\.ts$/ },
            async (args) => {
              let contents = await readFile(args.path, 'utf8');
              if (args.path.endsWith('/solver-supervisor-install-contract.ts')) {
                for (const [logical, physical] of mappings) {
                  if (!contents.includes(`'${logical}'`))
                    throw new Error('fixture logical install contract changed');
                  contents = contents.replaceAll(`'${logical}'`, JSON.stringify(physical));
                }
              } else if (args.path.endsWith('/solver-supervisor-config.ts')) {
                if (!contents.includes('unix: socketPath,'))
                  throw new Error('fixture listener contract changed');
                contents = contents.replace(
                  'unix: socketPath,',
                  `unix: ${JSON.stringify(socket)},`,
                );
              } else {
                const signature = 'export function envLayout(env: string | undefined): EnvLayout {';
                if (!contents.includes(signature))
                  throw new Error('fixture environment contract changed');
                contents = contents.replace(
                  signature,
                  `${signature}\nif (env === 'prod') return ${JSON.stringify(layouts[0])};\nif (env === 'dev') return ${JSON.stringify(layouts[1])};`,
                );
              }
              return { contents, loader: 'ts' };
            },
          );
        },
      },
    ],
  });
  expect(built.success).toBe(true);
  const output = built.outputs.at(0);
  if (output === undefined || built.outputs.length !== 1)
    throw new Error('fixture expected exactly one bundle');
  await Bun.write(bundle, output);
  await copyFile(process.execPath, executable);
  await chmod(executable, 0o755);
  await chmod(bundle, 0o755);
  await writeFile(
    config,
    JSON.stringify({
      socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
      maxSearchWorkers: 2,
      maxMemoryLimitMb: 512,
      pidsLimit: 128,
      maxManagedContainers: 16,
      devSourceSha: 'd'.repeat(40),
      images: [{ callerName: 'be-01-blue', callerImage: image, solverImage: image }],
    }),
    { mode: 0o600 },
  );
  await writeFile(unit, 'private fixture unit\n', { mode: 0o644 });
  const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
  const pins = {
    version: 1,
    sourceSha: 'd'.repeat(40),
    bunSha256: hash(await readFile(executable)),
    bundleSha256: hash(await readFile(bundle)),
    configSha256: hash(await readFile(config)),
    unitSha256: hash(await readFile(unit)),
  };
  const owner = `${JSON.stringify({ format: 'dependency-edge-owner', version: 1, attempt: '12345678-1234-4123-8123-123456789abc', plan: { sha: 'd'.repeat(40), layouts } })}\n`;
  const intent = `${JSON.stringify({ owner, record: { format: 'dependency-solver-restoration', version: 1, operation: 'restore-solver-only', pins, images: [{ image, imageId: `sha256:${'b'.repeat(64)}`, semantics: ['cross-project-dependencies-v1'] }] } })}\n`;
  const name = 'edge-owner-000001-solver-restore-intent.json';
  await writeFile(join(root, 'edge-owner.pending'), owner, { mode: 0o600 });
  await writeFile(join(root, name), intent, { mode: 0o600 });
  await writeFile(
    join(root, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'restoring',
      edgeState: root,
      ownerPublicationSha256: hash(owner),
      restorationIntent: { name, sha256: hash(intent) },
    }),
    { mode: 0o600 },
  );
  await writeFile(
    join(root, 'docker'),
    `#!/bin/sh\nset -eu\nprintf '%s\\n' "$*" >> "$WBS_EDGE_STATE/docker.calls"\nif [ "$1" = image ]; then printf 'sha256:${'b'.repeat(64)}\\n'; elif [ "$1" != ps ]; then exit 91; fi\n`,
    { mode: 0o700 },
  );
  const spawn = (bun: string, program = bundle, startupConfig = config) =>
    Bun.spawn([bun, program, `--config=${startupConfig}`, '--admission=policy'], {
      env: { ...process.env, WBS_EDGE_STATE: root, PATH: `${root}:${runtimePath}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  const wrong = spawn(process.execPath);
  const wrongDeadline = setTimeout(() => {
    wrong.kill('SIGKILL');
  }, 1000);
  const wrongCode = await wrong.exited;
  clearTimeout(wrongDeadline);
  expect(wrongCode).toBe(78);
  expect(await new Response(wrong.stderr).text()).toContain('executing identity');
  const foreignBundle = join(root, 'foreign-supervisor.js');
  await copyFile(bundle, foreignBundle);
  for (const [program, startupConfig] of [
    [foreignBundle, config],
    [bundle, join(root, 'foreign-config.json')],
  ] as const) {
    const invalid = spawn(executable, program, startupConfig);
    const deadline = setTimeout(() => {
      invalid.kill('SIGKILL');
    }, 1000);
    const code = await invalid.exited;
    clearTimeout(deadline);
    expect(code).toBe(78);
    expect(await new Response(invalid.stderr).text()).toContain('executing identity');
  }
  const configBytes = await readFile(config);
  await writeFile(config, 'PRIVATE_CONFIG_SENTINEL=secret');
  const malformed = spawn(executable);
  expect(await malformed.exited).toBe(78);
  const malformedDiagnostic = await new Response(malformed.stderr).text();
  expect(malformedDiagnostic).toContain('admission closed');
  expect(malformedDiagnostic).not.toContain('PRIVATE_CONFIG_SENTINEL');
  expect(await Bun.file(join(root, 'docker.calls')).exists()).toBe(false);
  expect(await Bun.file(socket).exists()).toBe(false);
  await writeFile(config, configBytes);
  const dockerPath = join(root, 'docker');
  const dockerBytes = await readFile(dockerPath);
  await writeFile(
    dockerPath,
    `#!/bin/sh\nset -eu\nif [ "$1" = image ]; then printf 'sha256:${'b'.repeat(64)}\\n'; else exit 91; fi\n`,
  );
  const startupFailure = spawn(executable);
  expect(await startupFailure.exited).toBe(1);
  expect(await new Response(startupFailure.stderr).text()).not.toContain('admission closed');
  await writeFile(dockerPath, dockerBytes);
  const child = spawn(executable);
  try {
    const deadline = Date.now() + 5000;
    for (;;) {
      if (child.exitCode !== null)
        throw new Error(
          `restoring CLI exited before readiness: ${await new Response(child.stderr).text()}`,
        );
      try {
        if ((await stat(socket)).isSocket()) break;
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
      }
      if (Date.now() >= deadline)
        throw new Error('restoring CLI listener readiness deadline exceeded');
      await Bun.sleep(10);
    }
    const duplicate = spawn(executable);
    expect(await duplicate.exited).toBe(1);
    expect(await new Response(duplicate.stderr).text()).toContain('lock held');
    let contended = false;
    try {
      await withCanonicalLock(join(root, 'solver-runtime.lock'), () => Promise.resolve(undefined));
    } catch (cause) {
      expect(String(cause)).toContain('lock held');
      contended = true;
    }
    expect(contended).toBe(true);
  } finally {
    child.kill('SIGTERM');
    await child.exited;
  }
  expect(await new Response(child.stderr).text()).toBe('');
  expect(await readFile(join(root, 'docker.calls'), 'utf8')).toContain('ps');
  await withCanonicalLock(join(root, 'solver-runtime.lock'), () => Promise.resolve(undefined));
  expect(await readFile(join(root, 'edge-owner.pending'), 'utf8')).toBe(owner);
});
