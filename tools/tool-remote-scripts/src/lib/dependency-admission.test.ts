import { rejects } from 'node:assert/strict';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { createEdgeEnvironment } from '../../test/edge-state';
import { checkBackendRecovery } from '../swap';
import { admitDormantDependencies } from './dependency-admission';
import { ROOT } from './docker';

const backend = new URL('../../../../apps/wbs/be-01/', import.meta.url).pathname;
const image = `registry/wbs-be-01@sha256:${'a'.repeat(64)}`;
const dormant = {
  protocol: 'wbs-dependency-preservation',
  version: 1,
  state: 'DISABLED',
  externalRelationships: 0,
} as const;
function migrated(root: string): string {
  const path = join(root, 'wbs.db');
  const migration = Bun.spawnSync(['bun', join(backend, 'src/migrate-cli.ts')], {
    cwd: backend,
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (migration.exitCode !== 0) throw new Error(migration.stderr.toString());
  return path;
}
function probe(path: string, args: string[]): string {
  expect(args).toContain(
    `type=bind,source=${ROOT}/data,target=/data,readonly,bind-propagation=rprivate,bind-recursive=readonly`,
  );
  expect(args).toContain('DB_PATH=/data/wbs.db');
  expect(args).not.toContain('src/dependency-activation-cli.ts');
  const entrypoint = args.indexOf('--entrypoint');
  const child = Bun.spawnSync(['bun', ...args.slice(entrypoint + 3)], {
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString();
}
for (const mode of ['clean', 'wal'] as const)
  test(`real migrated dormant ${mode} store agrees with backend inspection and preserves source`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'dependency-real-'));
    try {
      const path = migrated(root);
      const cli = Bun.spawnSync(
        ['bun', join(backend, 'src/dependency-activation-cli.ts'), 'inspect'],
        { env: { ...process.env, DB_PATH: path }, stdout: 'pipe', stderr: 'pipe' },
      );
      expect({ exit: cli.exitCode, stderr: cli.stderr.toString() }).toEqual({
        exit: 0,
        stderr: '',
      });
      expect(JSON.parse(cli.stdout.toString())).toEqual({ state: 'DISABLED', receipt: null });
      if (mode === 'wal') {
        const checkpoint = new Database(path);
        checkpoint.run("UPDATE cross_project_dependency_activation SET state='ENABLED'");
        checkpoint.close();
        const child = Bun.spawnSync(
          [
            'bun',
            '-e',
            `import { Database } from 'bun:sqlite'; const db = new Database(process.env.DB_PATH); db.run('PRAGMA journal_mode=WAL'); db.run("UPDATE cross_project_dependency_activation SET state='DISABLED'"); process.kill(process.pid,'SIGKILL');`,
          ],
          { env: { ...process.env, DB_PATH: path }, stdout: 'pipe', stderr: 'pipe' },
        );
        expect(child.signalCode).toBe('SIGKILL');
        rmSync(`${path}-shm`);
      }
      const before = readdirSync(root).map(
        (name) => [name, readFileSync(join(root, name))] as const,
      );
      expect(
        await admitDormantDependencies(image, '/data/wbs.db', (args) =>
          Promise.resolve(probe(path, args)),
        ),
      ).toEqual(dormant);
      expect(readdirSync(root).sort()).toEqual(before.map(([name]) => name).sort());
      for (const [name, bytes] of before) expect(readFileSync(join(root, name))).toEqual(bytes);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
for (const fault of ['enabled', 'historical'] as const)
  test(`recovery uses coordinator authority despite deceptive image CLI: ${fault}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'dependency-recovery-'));
    try {
      const path = migrated(root);
      const sqlite = new Database(path);
      sqlite.run(
        fault === 'enabled'
          ? "UPDATE cross_project_dependency_activation SET state='ENABLED'"
          : 'DROP TABLE cross_project_dependency_activation_receipt',
      );
      sqlite.close();
      const commands: string[][] = [];
      await rejects(
        checkBackendRecovery(
          image,
          image,
          '/data/wbs.db',
          async (args) => {
            commands.push(args);
            if (args.includes('src/dependency-capabilities-cli.ts'))
              return JSON.stringify({
                protocol: 'wbs-dependency-runtime',
                version: 1,
                role: 'backend',
                semantics: ['cross-project-dependencies-v1'],
              });
            if (args[0] === 'image') return 'image';
            if (args[0] === 'ps') return '';
            if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
              return await Promise.resolve(probe(path, args));
            if (args.includes('src/dependency-activation-cli.ts'))
              return '{"state":"DISABLED","receipt":null}';
            return '[]';
          },
          (path) => Promise.resolve(path),
        ),
        fault === 'enabled' ? /exact DISABLED/ : /real table/,
      );
      expect(
        commands.some((args) =>
          args.some((argument) => argument.includes('wbs-dependency-preservation')),
        ),
      ).toBe(true);
      expect(commands.some((args) => ['stop', 'start', 'exec'].includes(args[0] ?? ''))).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true });
    }
  });
test('dependency admission bounds a stalled probe', async () => {
  let aborted = false;
  await rejects(
    admitDormantDependencies(
      image,
      '/data/wbs.db',
      (_args, signal) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve(JSON.stringify(dormant));
          }, 100);
        });
      },
      performance.now() + 20,
    ),
    /deadline/,
  );
  expect(aborted).toBe(true);
});

for (const transport of ['source', 'built'] as const)
  test(`installed ${transport} recovery dispatch refuses ENABLED and retains markers`, () => {
    const root = mkdtempSync(join(tmpdir(), 'dependency-dispatch-'));
    try {
      const path = migrated(root);
      const sqlite = new Database(path);
      sqlite.run("UPDATE cross_project_dependency_activation SET state='ENABLED'");
      sqlite.close();
      const marker = join(root, 'be-writer-stop.json');
      writeFileSync(marker, 'retain exact interruption evidence');
      const preload = join(root, 'redirect.ts');
      writeFileSync(
        preload,
        `import { mock } from 'bun:test';
import * as fs from 'node:fs'; import * as fsp from 'node:fs/promises';
const open = fs.openSync; const canonical = fsp.realpath;
mock.module('node:fs', () => ({...fs,openSync:(path,...args) => open(path === '${ROOT}/state/deploy.lock' ? ${JSON.stringify(join(root, 'deploy.lock'))} : path,...args)}));
mock.module('node:fs/promises', () => ({...fsp,realpath:path => canonical(String(path).replace('${ROOT}/data',${JSON.stringify(root)}))}));`,
      );
      const docker = join(root, 'docker');
      writeFileSync(
        docker,
        `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'manifest' || args[0] === 'image') { console.log('image'); }
else if (args[0] === 'ps') { }
else if (args.includes('src/dependency-capabilities-cli.ts')) console.log(JSON.stringify({protocol:'wbs-dependency-runtime',version:1,role:'backend',semantics:[]}));
else if (args.some(arg => arg.includes('wbs-dependency-preservation'))) {
 const start = args.indexOf('--entrypoint');
 const child = Bun.spawnSync(['${process.execPath}',...args.slice(start+3)],{env:{...process.env,DB_PATH:${JSON.stringify(path)}},stdout:'pipe',stderr:'pipe'});
 process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exit(child.exitCode);
} else if(args[0] === 'run') console.log('[]');
else throw new Error('unexpected Docker command '+args.join(' '));
`,
      );
      chmodSync(docker, 0o755);
      let executable = new URL('../swap.ts', import.meta.url).pathname;
      if (transport === 'built') {
        const bundle = join(root, 'swap.js');
        const build = Bun.spawnSync(
          ['bun', 'build', executable, '--target=bun', `--outfile=${bundle}`],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        if (build.exitCode !== 0) throw new Error(build.stderr.toString());
        executable = bundle;
      }
      const child = Bun.spawnSync(
        [
          'bun',
          '--preload',
          preload,
          executable,
          'be',
          '--check-backend-recovery',
          `--image-be=${image}`,
          `--previous-image=${image}`,
          '--database-path=/data/wbs.db',
        ],
        {
          env: { ...createEdgeEnvironment(), PATH: `${root}:${process.env['PATH'] ?? ''}` },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      expect(child.exitCode).toBe(1);
      expect(child.stderr.toString()).toContain('exact DISABLED');
      expect(child.stdout.toString()).not.toContain('observations passed');
      expect(readFileSync(marker, 'utf8')).toBe('retain exact interruption evidence');
    } finally {
      rmSync(root, { recursive: true });
    }
  }, 20000);

for (const [candidate, path] of [
  [image, '/other/wbs.db'],
  [image, '/data/../wbs.db'],
  ['registry/wbs-be-01:latest', '/data/wbs.db'],
])
  test(`dependency admission refuses invalid boundary ${candidate} ${path}`, async () => {
    let invoked = false;
    await rejects(
      admitDormantDependencies(candidate, path, () => {
        invoked = true;
        return Promise.resolve(JSON.stringify(dormant));
      }),
    );
    expect(invoked).toBe(false);
  });
