import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';
import { parse } from 'yaml';

const workspace = resolve(import.meta.dir, '../../../..');
const cli = join(import.meta.dir, 'staged-lint.ts');

function write(directory: string, path: string, source: string): void {
  const destination = join(directory, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, source);
}

function fixture(signal = false): string {
  const directory = scratchSync('staged-lint-');
  symlinkSync(join(workspace, 'node_modules'), join(directory, 'node_modules'), 'dir');
  write(
    directory,
    'eslint.config.mjs',
    `import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';
const record = (event, path) => appendFileSync('processes.jsonl', JSON.stringify({ event, pid: process.pid, cwd: process.cwd(), path }) + '\\n');
record('start');
process.on('exit', () => record('exit'));
${signal ? "process.kill(process.pid, 'SIGTERM');" : ''}
export default [{
  files: ['**/*.{js,mjs,cjs}'],
  plugins: { observation: { rules: { file: { create(context) { record('file', relative(process.cwd(), context.filename)); return {}; } } } } },
  rules: { 'no-debugger': 'error', 'observation/file': 'error' },
}];
`,
  );
  return directory;
}

function run(directory: string, files: string[]) {
  return Bun.spawnSync([process.execPath, 'run', cli, ...files], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function events(directory: string): { event: string; pid: number; cwd: string; path?: string }[] {
  return readFileSync(join(directory, 'processes.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { event: string; pid: number; cwd: string; path?: string });
}

describe('staged lint production CLI', () => {
  test('lefthook runs distinct serial nearest-project batches covering all supplied paths', () => {
    const directory = fixture();
    for (const project of ['apps/outer', 'libs/second', 'apps/outer/nested']) {
      write(directory, `${project}/project.json`, '{}');
    }
    const files = [
      'apps/outer/src/one.js',
      'libs/second/src/two.mjs',
      'apps/outer/nested/src/deep.cjs',
      'root.js',
      'apps/outer/src/space name.js',
      '-leading.js',
    ];
    for (const path of files) write(directory, path, 'const value = 1;\n');
    const hook = parse(readFileSync(join(workspace, 'lefthook.yml'), 'utf8')) as {
      'pre-commit': { commands: { lint: { run: string; glob: string } } };
    };
    const lint = hook['pre-commit'].commands.lint;
    expect(lint.glob).toBe('*.{ts,tsx,js,mjs,cjs}');
    const command = lint.run.replace(' {staged_files}', '').split(' ');
    // Execute the configured production entrypoint from the fixture workspace.
    const invocation = Bun.spawnSync(
      command
        .map((argument) => (argument.startsWith('tools/') ? join(workspace, argument) : argument))
        .concat(files),
      { cwd: directory, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode, invocation.stderr.toString() + invocation.stdout.toString()).toBe(
      0,
    );
    const lifecycle = events(directory);
    expect(lifecycle.map(({ event }) => event)).toEqual([
      'start',
      'file',
      'file',
      'exit',
      'start',
      'file',
      'exit',
      'start',
      'file',
      'exit',
      'start',
      'file',
      'file',
      'exit',
    ]);
    expect(
      new Set(lifecycle.filter(({ event }) => event === 'start').map(({ pid }) => pid)).size,
    ).toBe(4);
    expect(lifecycle.every(({ cwd }) => cwd === directory)).toBe(true);
    const batches = lifecycle
      .filter(({ event }) => event === 'start')
      .map(({ pid }) =>
        lifecycle
          .filter((entry) => entry.pid === pid && entry.event === 'file')
          .map(({ path }) => path)
          .toSorted(),
      );
    expect(batches).toEqual([
      ['apps/outer/src/one.js', 'apps/outer/src/space name.js'],
      ['libs/second/src/two.mjs'],
      ['apps/outer/nested/src/deep.cjs'],
      ['-leading.js', 'root.js'],
    ]);
  });

  test.each(['later project', 'workspace'])(
    'blocks a real rule violation in a %s batch',
    (location) => {
      const directory = fixture();
      write(directory, 'first/project.json', '{}');
      write(directory, 'first/clean.js', 'const value = 1;\n');
      const violation = location === 'later project' ? 'second/broken.js' : 'broken.js';
      if (location === 'later project') write(directory, 'second/project.json', '{}');
      write(directory, violation, 'debugger;\n');
      const invocation = run(directory, ['first/clean.js', violation]);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stdout.toString()).toContain('no-debugger');
      expect(invocation.stdout.toString()).toContain('broken.js');
      expect(events(directory).filter(({ event }) => event === 'start')).toHaveLength(2);
    },
  );

  test('continues past absent manifests to the containing project and workspace', () => {
    const directory = fixture();
    write(directory, 'project/project.json', '{}');
    write(directory, 'project/deep/src/clean.js', 'const value = 1;\n');
    write(directory, 'unowned/deep/clean.js', 'const value = 1;\n');
    const invocation = run(directory, ['project/deep/src/clean.js', 'unowned/deep/clean.js']);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(events(directory).filter(({ event }) => event === 'start')).toHaveLength(2);
  });

  test.each(['{', 'null', '[]', '42', '"project"'])(
    'rejects a present invalid manifest %s',
    (manifest) => {
      const directory = fixture();
      write(directory, 'project/project.json', manifest);
      write(directory, 'project/source.js', 'const value = 1;\n');
      const invocation = run(directory, ['project/source.js']);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toMatch(/JSON|project\.json/);
    },
  );

  test('rejects a genuinely unreadable present manifest', () => {
    const directory = fixture();
    write(directory, 'project/project.json', '{}');
    write(directory, 'project/source.js', 'const value = 1;\n');
    const manifest = join(directory, 'project/project.json');
    chmodSync(manifest, 0o000);
    try {
      expect(() => readFileSync(manifest, 'utf8')).toThrow(/EACCES/);
      const invocation = run(directory, ['project/source.js']);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toContain('EACCES');
    } finally {
      chmodSync(manifest, 0o600);
    }
  });

  test('rejects a missing installed ESLint without downloading a replacement', () => {
    const directory = fixture();
    rmSync(join(directory, 'node_modules'));
    mkdirSync(join(directory, 'node_modules/.bin'), { recursive: true });
    write(directory, 'source.js', 'const value = 1;\n');
    const invocation = run(directory, ['source.js']);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain(join(directory, 'node_modules/.bin/eslint'));
  });

  test('rejects an ESLint process terminated by a signal', () => {
    const directory = fixture(true);
    write(directory, 'source.js', 'const value = 1;\n');
    const invocation = run(directory, ['source.js']);
    expect(invocation.exitCode).not.toBe(0);
    // Volta may convert its Node child's SIGTERM to exit 1 without exposing signalCode.
    expect(invocation.stderr.toString()).toContain('ESLint failed');
    expect(events(directory).map(({ event }) => event)).toEqual(['start']);
  });

  test('rejects an empty invocation with explicit usage', () => {
    const invocation = run(fixture(), []);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain('Usage:');
  });
});
