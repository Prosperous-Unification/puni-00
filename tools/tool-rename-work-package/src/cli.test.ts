import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { git } from './tree';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));

/** A scratch git repository holding `files` (repo-relative path to content), all staged. */
function scratchRepo(files: Readonly<Record<string, string>>): string {
  const root = scratchSync('rename-work-package-');
  git(root, ['init', '-q']);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, ['add', '-A']);
  return root;
}

function runCli(args: readonly string[]): { exitCode: number; stdout: string } {
  const run = Bun.spawnSync(['bun', CLI, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode === 2) throw new Error(run.stderr.toString());
  return { exitCode: run.exitCode, stdout: run.stdout.toString() };
}

/** Every tracked path with its content, for comparing two trees. */
function snapshotOf(root: string): Record<string, string> {
  return Object.fromEntries(
    git(root, ['ls-files', '-z'])
      .split('\0')
      .filter(Boolean)
      .map((path) => [path, readFileSync(join(root, path), 'utf8')]),
  );
}

describe('check', () => {
  const RESIDUAL = 'const projectId = x;\n';

  // Proof: prepending `{ glob: '**' }` to EXCLUDED_PATHS (the allow-list matching every path)
  // made this case receive "0 residuals outside the allow-list" instead of the
  // `src/store.ts:2` line, and the path case below fail the same way (2026-10-25).
  it('exits 1 listing an injected residual outside the allow-list', () => {
    const root = scratchRepo({ 'src/store.ts': `const a = 1;\n${RESIDUAL}` });
    const { exitCode, stdout } = runCli(['check', '--root', root]);
    expect(stdout).toContain('src/store.ts:2: const projectId = x;');
    expect(exitCode).toBe(1);
  });

  // Proof: removing the `client projects` line pattern failed this case on README.md (2026-10-25).
  it('exits 0 on the same residual inside an excluded path or on a protected line', () => {
    const root = scratchRepo({
      'docs/findings/proof.md': RESIDUAL,
      'apps/wbs/be-01/drizzle/0001_x/migration.sql': 'CREATE TABLE project (id text);\n',
      'README.md': 'Built for client projects.\n',
    });
    const { exitCode, stdout } = runCli(['check', '--root', root]);
    expect(stdout).toBe('0 residuals outside the allow-list\n');
    expect(exitCode).toBe(0);
  });

  it('reports a path that still names the word', () => {
    const root = scratchRepo({ 'src/project/index.ts': 'export {};\n' });
    expect(runCli(['check', '--root', root]).stdout).toContain('src/project/index.ts: path');
  });
});

describe('apply', () => {
  // Proof: respelling the plural path target `work-packages` as `work-projects` (a target that
  // still holds an old word) made the second apply print "rewrote 1 files" (2026-10-25).
  it('equals itself run twice on a scratch copy of both modules it moves, and leaves check at 0', () => {
    const modules = [
      'libs/wbs/application/core/src/module/project',
      'apps/wbs/fe-01/src/modules/project',
    ];
    const root = scratchRepo({ 'docs/findings/kept.md': 'The project stays.\n' });
    for (const module of modules) {
      cpSync(join(REPO, module), join(root, module), { recursive: true });
    }
    git(root, ['add', '-A']);
    const scopes = ['libs', 'apps', 'docs'];

    expect(runCli(['apply', '--root', root, ...scopes]).exitCode).toBe(0);
    const once = snapshotOf(root);
    expect(runCli(['apply', '--root', root, ...scopes]).stdout).toBe(
      'moved 0 paths, rewrote 0 files\n',
    );
    expect(snapshotOf(root)).toEqual(once);

    expect(Object.keys(once).some((path) => path.includes('/module/work-package/'))).toBe(true);
    expect(once['docs/findings/kept.md']).toBe('The project stays.\n');
    expect(runCli(['check', '--root', root])).toEqual({
      exitCode: 0,
      stdout: '0 residuals outside the allow-list\n',
    });
  }, 30_000);

  it('refuses to run without a path to rename under', () => {
    const run = Bun.spawnSync(['bun', CLI, 'apply', '--root', scratchRepo({})], { stderr: 'pipe' });
    expect(run.stderr.toString()).toContain('apply needs at least one path');
    expect(run.exitCode).toBe(2);
  });
});
