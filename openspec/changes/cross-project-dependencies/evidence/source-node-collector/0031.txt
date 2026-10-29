import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSourceStartupManifest, type SourceConfigPin } from '../lib/source-startup-manifest';
export const roots: string[] = [];
const digest = (contents: string) => createHash('sha256').update(contents).digest('hex');
export const configuration: SourceConfigPin[] = ['backend', 'gateway', 'mcp', 'frontend'].map(
  (slot) => ({
    slot: slot as SourceConfigPin['slot'],
    size: 27,
    sha256: digest('MIGRATE_ON_STARTUP=false\n#\n'),
  }),
);
export async function git(root: string, ...args: string[]) {
  const child = Bun.spawn(['git', '--no-optional-locks', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(stderr);
  return stdout.trim();
}
export async function artifact() {
  const root = await mkdtemp(join(tmpdir(), 'source-pins-'));
  roots.push(root);
  await mkdir(join(root, 'apps/wbs'), { recursive: true });
  await writeFile(join(root, '.gitignore'), 'node_modules/\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'bin/dev.sh' } }));
  await writeFile(
    join(root, 'nx.json'),
    JSON.stringify({ plugins: [], useInferencePlugins: false }),
  );
  for (const tier of ['be-01', 'gw-01', 'mcp-01', 'fe-01']) {
    await mkdir(join(root, 'apps/wbs', tier, 'src'), { recursive: true });
    await writeFile(
      join(root, 'apps/wbs', tier, 'project.json'),
      JSON.stringify({
        targets: {
          serve: {
            executor: 'nx:run-commands',
            continuous: true,
            options: {
              command: tier === 'fe-01' ? 'bunx vite' : 'bun --watch src/main.ts',
              cwd: `apps/wbs/${tier}`,
            },
            cache: false,
            ...(tier === 'mcp-01' ? { dependsOn: ['prepare'] } : {}),
          },
          ...(tier === 'mcp-01'
            ? {
                prepare: {
                  executor: 'nx:run-commands',
                  options: {
                    command:
                      'bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts apps/wbs/mcp-01/src/openapi.json',
                  },
                  outputs: ['{projectRoot}/src/openapi.json'],
                  cache: false,
                },
              }
            : {}),
        },
      }),
    );
    await writeFile(join(root, 'apps/wbs', tier, 'src/main.ts'), 'export {};\n');
  }
  await git(root, 'init', '-q');
  await git(root, 'add', '.');
  await git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'independent artifact',
  );
  const sourceSha = await git(root, 'rev-parse', 'HEAD');
  await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
  await writeFile(join(root, 'node_modules/module.js'), 'export const module = 1;\n');
  await symlink('../module.js', join(root, 'node_modules/.bin/module'));
  await modes(root);
  const generated = await createSourceStartupManifest(root, sourceSha, configuration);
  const pins = {
    version: 1 as const,
    sourceSha,
    runtimeImageId: `sha256:${'a'.repeat(64)}`,
    manifestSha256: generated.sha256,
    environmentSha256: 'b'.repeat(64),
  };
  return { root, sourceSha, ...generated, pins };
}
export async function installed() {
  return installArtifact(await artifact());
}
export async function installArtifact(prepared: Awaited<ReturnType<typeof artifact>>) {
  const root = await mkdtemp(join(tmpdir(), 'source-installed-'));
  roots.push(root);
  await cp(prepared.root, root, {
    recursive: true,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
  for (const tier of ['be-01', 'gw-01', 'mcp-01', 'fe-01']) {
    const path = join(root, 'apps/wbs', tier, '.env');
    await writeFile(path, 'MIGRATE_ON_STARTUP=false\n#\n');
    await chmod(path, 0o600);
  }
  return { ...prepared, root };
}

export async function modes(path: string): Promise<void> {
  for (const child of await readdir(path, { withFileTypes: true })) {
    const nested = join(path, child.name);
    if (child.isDirectory()) {
      await chmod(nested, 0o755);
      await modes(nested);
    } else if (child.isFile())
      await chmod(
        nested,
        (await lstat(nested)).mode % 0o1000 === 0o444
          ? 0o444
          : child.name.endsWith('.sample')
            ? 0o755
            : 0o644,
      );
  }
}
