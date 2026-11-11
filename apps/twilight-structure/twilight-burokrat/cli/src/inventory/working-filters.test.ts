import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

function readSearchPath(): string {
  const selected = process.env['PATH'];
  if (selected === undefined) throw new Error('filter tests require a trusted PATH');
  return selected;
}
const executablePath = readSearchPath();
const directories: string[] = [];
function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni working filter '));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function git(repository: string, argv: readonly string[]): string {
  const child = Bun.spawnSync(['git', '-C', repository, ...argv], {
    env: {
      PATH: executablePath,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return child.stdout.toString().trim();
}

function createRepository() {
  const repository = scratch();
  const execution = scratch();
  const marker = join(execution, 'executed');
  const script = join(execution, 'filter.ts');
  git(repository, ['init', '--initial-branch=main']);
  git(repository, ['config', 'user.name', 'Working Filter Fixture']);
  git(repository, ['config', 'user.email', 'working-filter@example.test']);
  writeFileSync(join(repository, '.gitattributes'), 'tracked.txt filter=specimen\n');
  writeFileSync(join(repository, 'tracked.txt'), 'committed\n');
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--message', 'baseline']);
  writeFileSync(join(repository, 'tracked.txt'), 'working\n');
  writeFileSync(
    script,
    `await Bun.write(${JSON.stringify(marker)}, 'executed');\nawait Bun.write(Bun.stdout, await Bun.stdin.bytes());\n`,
  );
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return {
    repository,
    execution,
    marker,
    script,
    command: quote(process.execPath) + ' --no-env-file --config=/dev/null ' + quote(script),
  };
}

function invoke(repository: string, kind = 'working', path = executablePath) {
  return Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      join(import.meta.dir, '../cli.ts'),
      'read-candidate',
      kind,
      repository,
      'HEAD',
    ],
    {
      env: {
        PATH: path,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

describe('working Git selection refuses executable filters', () => {
  for (const kind of ['clean', 'process'] as const) {
    it('refuses an active ' + kind + ' filter before its program or index mutation', () => {
      const fixture = createRepository();
      if (kind === 'process')
        writeFileSync(
          fixture.script,
          `await Bun.write(${JSON.stringify(fixture.marker)}, 'executed');\nprocess.exit(1);\n`,
        );
      git(fixture.repository, ['config', 'filter.specimen.' + kind, fixture.command]);
      const index = readFileSync(join(fixture.repository, '.git/index'));
      const child = invoke(fixture.repository);
      expect(existsSync(fixture.marker)).toBe(false);
      expect(child.exitCode).toBe(1);
      expect(child.stdout.toString()).toBe('');
      expect(child.stderr.toString()).toContain(
        'working selection refuses configured Git clean/process filters',
      );
      expect(child.stderr.toString()).not.toContain(fixture.command);
      expect(readFileSync(join(fixture.repository, '.git/index'))).toEqual(index);
    });
  }

  for (const configuration of ['unused', 'included', 'worktree'] as const) {
    it('refuses a nonempty ' + configuration + ' filter conservatively', () => {
      const fixture = createRepository();
      const key = 'filter.unused.clean';
      if (configuration === 'included') {
        const included = join(fixture.execution, 'included.gitconfig');
        git(fixture.repository, ['config', '--file', included, key, fixture.command]);
        git(fixture.repository, ['config', 'include.path', included]);
      } else if (configuration === 'worktree') {
        git(fixture.repository, ['config', 'extensions.worktreeConfig', 'true']);
        git(fixture.repository, ['config', '--worktree', key, fixture.command]);
      } else git(fixture.repository, ['config', key, fixture.command]);
      const child = invoke(fixture.repository);
      expect(child.exitCode).toBe(1);
      expect(child.stdout.toString()).toBe('');
      expect(child.stderr.toString()).toContain(
        'working selection refuses configured Git clean/process filters',
      );
      expect(existsSync(fixture.marker)).toBe(false);
    });
  }

  for (const key of [
    'filterx.specimen.clean',
    'filter.specimenclean',
    'prefixfilter.specimen.clean',
    'filter.specimen.cleaner',
  ]) {
    it('ignores similarly named non-filter configuration ' + key, () => {
      const fixture = createRepository();
      git(fixture.repository, ['config', key, fixture.command]);
      const child = invoke(fixture.repository);
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(existsSync(fixture.marker)).toBe(false);
    });
  }

  for (const command of [' ', '\t', '\n', '\n\n']) {
    it('refuses nonempty whitespace-only filter value ' + JSON.stringify(command), () => {
      const fixture = createRepository();
      git(fixture.repository, ['config', 'filter.unused.clean', command]);
      const child = invoke(fixture.repository);
      expect(child.exitCode).toBe(1);
      expect(child.stderr.toString()).toContain(
        'working selection refuses configured Git clean/process filters',
      );
      expect(existsSync(fixture.marker)).toBe(false);
    });
  }

  it('allows empty filter definitions while preserving raw working bytes', () => {
    const fixture = createRepository();
    git(fixture.repository, ['config', 'filter.specimen.clean', '']);
    const child = invoke(fixture.repository);
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toContain(
      git(fixture.repository, ['hash-object', '--no-filters', 'tracked.txt']),
    );
    expect(existsSync(fixture.marker)).toBe(false);
  });

  for (const kind of ['committed', 'staged']) {
    it(kind + ' selection neither executes nor rejects an unused working filter', () => {
      const fixture = createRepository();
      git(fixture.repository, ['config', 'filter.specimen.clean', fixture.command]);
      const child = invoke(fixture.repository, kind);
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stdout.toString()).toContain(
        git(fixture.repository, ['rev-parse', 'HEAD:tracked.txt']),
      );
      expect(existsSync(fixture.marker)).toBe(false);
    });
  }
  it('fails a broken configuration query without treating it as no filters', () => {
    const fixture = createRepository();
    const realGit = Bun.which('git');
    if (realGit === null) throw new Error('required Git executable is absent');
    const wrapperDirectory = scratch();
    const wrapper = join(wrapperDirectory, 'git');
    writeFileSync(
      wrapper,
      '#!' +
        process.execPath +
        '\n' +
        'const args = process.argv.slice(2);\n' +
        'if (args[2] === "config") { process.stderr.write("injected filter query failure\\n"); process.exit(42); }\n' +
        'const child = Bun.spawnSync([' +
        JSON.stringify(realGit) +
        ', ...args], { stdout: "pipe", stderr: "pipe" });\n' +
        'process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exit(child.exitCode);\n',
    );
    chmodSync(wrapper, 0o755);
    const child = invoke(
      fixture.repository,
      'working',
      wrapperDirectory + delimiter + executablePath,
    );
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toContain(
      'cannot inspect working Git filter configuration: injected filter query failure',
    );
    expect(child.stderr.toString()).not.toContain(
      'working selection refuses configured Git clean/process filters',
    );
    expect(existsSync(fixture.marker)).toBe(false);
  });
  it('refuses an earlier loaded command even when a later empty value overrides it', () => {
    const fixture = createRepository();
    git(fixture.repository, ['config', '--add', 'filter.specimen.clean', fixture.command]);
    git(fixture.repository, ['config', '--add', 'filter.specimen.clean', '']);
    const child = invoke(fixture.repository);
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain(
      'working selection refuses configured Git clean/process filters',
    );
    expect(existsSync(fixture.marker)).toBe(false);
  });
});
