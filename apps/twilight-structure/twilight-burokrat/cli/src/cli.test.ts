import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

import type { Parser } from '@optique/core';
import { afterEach, describe, expect, test } from 'bun:test';

import { runCli, validatorHandlers } from './cli';
import {
  commandNamesOf,
  type Grammar,
  installedGrammar,
  readInvocation,
  registerShortName,
  UsageRefusal,
  type ValidatorCommand,
  validatorGrammar,
} from './cli-parser';
import { type CliInvocation, invokeCli } from './invoke-cli';

const repositories: string[] = [];
const cliPath = join(import.meta.dir, 'cli.ts');

interface GitEntry {
  path: string;
  mode: '100644' | '100755' | '120000' | '160000';
  blob: string;
}

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderr = invocation.stderr.toString('utf8');
  expect(invocation.exitCode, stderr).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-candidate-'));
  repositories.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'candidate@example.test']);
  runGit(repository, ['config', 'user.name', 'Candidate Fixture']);
  return repository;
}

function write(repository: string, path: string, source: string): void {
  const absolutePath = join(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

function commitAll(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

function hash(repository: string, path: string): string {
  return runGit(repository, ['hash-object', path]);
}

/**
 * Runs `read-candidate` in this process through the CLI entry, or as its own Bun process when an
 * `env` must reach the Git the reader spawns.
 */
async function runCandidateCli(
  repository: string,
  kind: 'committed' | 'staged' | 'working',
  base: string,
  env?: Record<string, string>,
): Promise<CliInvocation> {
  const argv = ['read-candidate', kind, repository, base];
  if (env === undefined) return invokeCli(argv);
  const invocation = Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: { ...process.env, ...env },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString('utf8'),
    stderr: invocation.stderr.toString('utf8'),
  };
}

function expectCandidate(
  invocation: CliInvocation,
  selection: object,
  entries: GitEntry[],
  untracked: string[] = [],
): void {
  const stdout = invocation.stdout;
  const output = `${stdout}${invocation.stderr}`;
  expect(invocation.exitCode, output).toBe(0);
  // Proof: this full-object oracle failed on the actual selected candidate when the reader
  // separately dropped `link`, omitted `added.txt`, substituted `deleted.txt` at equal count,
  // and read the base tree instead of the staged index tree.
  expect(
    JSON.parse(stdout) as unknown,
    `complete tuple/selection mismatch on actual selected candidate:\n${stdout}`,
  ).toEqual({ selection, entries, untracked });
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe('read-candidate production CLI', () => {
  test('reads the selected commit instead of a changed index or working tree', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const revision = commitAll(repository, 'initial');
    const tree = runGit(repository, ['rev-parse', `${revision}^{tree}`]);
    const committedBlob = hash(repository, 'tracked.txt');

    write(repository, 'tracked.txt', 'staged\n');
    runGit(repository, ['add', 'tracked.txt']);
    write(repository, 'tracked.txt', 'working\n');

    expectCandidate(
      await runCandidateCli(repository, 'committed', revision),
      { kind: 'committed', revision, tree },
      [{ path: 'tracked.txt', mode: '100644', blob: committedBlob }],
    );
  });

  test('selects the requested worktree whose root ends in whitespace', async () => {
    const neighborhood = mkdtempSync(join(tmpdir(), 'tool-wiki-neighboring-roots-'));
    repositories.push(neighborhood);
    const neighbor = join(neighborhood, 'space');
    const requested = join(neighborhood, 'space ');
    for (const repository of [neighbor, requested]) {
      mkdirSync(repository);
      runGit(repository, ['init', '--initial-branch=main']);
      runGit(repository, ['config', 'user.email', 'candidate@example.test']);
      runGit(repository, ['config', 'user.name', 'Candidate Fixture']);
    }
    write(neighbor, 'neighbor.txt', 'wrong repository\n');
    commitAll(neighbor, 'neighbor');
    write(requested, 'requested.txt', 'requested repository\n');
    const revision = commitAll(requested, 'requested');
    const tree = runGit(requested, ['rev-parse', `${revision}^{tree}`]);

    expectCandidate(
      await runCandidateCli(requested, 'committed', 'HEAD'),
      { kind: 'committed', revision, tree },
      [{ path: 'requested.txt', mode: '100644', blob: hash(requested, 'requested.txt') }],
    );
  });

  test('preserves a leading UTF-8 BOM as part of an exact Git path', async () => {
    const repository = createRepository();
    write(repository, 'name', 'plain\n');
    write(repository, '\uFEFFname', 'bom\n');
    const revision = commitAll(repository, 'BOM path');
    const tree = runGit(repository, ['rev-parse', `${revision}^{tree}`]);

    expectCandidate(
      await runCandidateCli(repository, 'committed', revision),
      { kind: 'committed', revision, tree },
      [
        { path: 'name', mode: '100644', blob: hash(repository, 'name') },
        { path: '\uFEFFname', mode: '100644', blob: hash(repository, '\uFEFFname') },
      ],
    );
  });

  test('reads the immutable staged index tree with additions, deletion, both rename sides, modes and symlink blobs', async () => {
    const repository = createRepository();
    write(repository, 'deleted.txt', 'delete me\n');
    write(repository, 'renamed-from.txt', 'rename me\n');
    write(repository, 'script.sh', '#!/bin/sh\nexit 0\n');
    const base = commitAll(repository, 'initial');

    rmSync(join(repository, 'deleted.txt'));
    runGit(repository, ['mv', 'renamed-from.txt', 'renamed-to.txt']);
    write(repository, 'added.txt', 'candidate addition\n');
    chmodSync(join(repository, 'script.sh'), 0o755);
    symlinkSync('renamed-to.txt', join(repository, 'link'));
    runGit(repository, ['add', '--all']);
    const indexTree = runGit(repository, ['write-tree']);
    const expectedEntries: GitEntry[] = [
      { path: 'added.txt', mode: '100644', blob: hash(repository, 'added.txt') },
      {
        path: 'link',
        mode: '120000',
        blob: runGit(repository, ['rev-parse', ':link']),
      },
      { path: 'renamed-to.txt', mode: '100644', blob: hash(repository, 'renamed-to.txt') },
      { path: 'script.sh', mode: '100755', blob: hash(repository, 'script.sh') },
    ];

    write(repository, 'added.txt', 'unstaged replacement\n');
    write(repository, 'untracked.txt', 'reported only by working mode\n');

    expectCandidate(
      await runCandidateCli(repository, 'staged', base),
      { kind: 'staged', base, indexTree },
      expectedEntries,
    );
  });

  test('freezes tracked working bytes and reports new untracked paths separately', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    write(repository, 'removed.txt', 'removed\n');
    const base = commitAll(repository, 'initial');

    write(repository, 'tracked.txt', 'working bytes\n');
    rmSync(join(repository, 'removed.txt'));
    write(repository, 'new/untracked.txt', 'untracked bytes\n');

    const invocation = await runCandidateCli(repository, 'working', base);
    const stdout = invocation.stdout;
    const output = `${stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(0);
    const candidate = JSON.parse(stdout) as unknown;
    expect(candidate).toMatchObject({
      selection: {
        kind: 'working',
        base,
        trackedSnapshot: 'da04baf983ae5deca6bc925a2e328548c08fd0b9267599a432b3e36e9e3ed09f',
        untrackedSnapshot: '84a8646c0954c75e3df6609bf584f692e8976a5c56c4c1b3012d3b47bf95361c',
      },
      entries: [{ path: 'tracked.txt', mode: '100644', blob: hash(repository, 'tracked.txt') }],
      untracked: ['new/untracked.txt'],
    });
  });

  test('normalizes an interior repository path before snapshotting the whole working tree', async () => {
    const repository = createRepository();
    write(repository, 'root.txt', 'root committed\n');
    write(repository, 'nested/tracked.txt', 'nested committed\n');
    const base = commitAll(repository, 'initial');
    write(repository, 'root.txt', 'root working\n');
    write(repository, 'nested/tracked.txt', 'nested working\n');
    write(repository, 'root-new.txt', 'root untracked\n');
    write(repository, 'nested/nested-new.txt', 'nested untracked\n');

    const invocation = await runCandidateCli(join(repository, 'nested'), 'working', base);
    const stdout = invocation.stdout;
    const output = `${stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(stdout) as unknown).toMatchObject({
      selection: { kind: 'working', base },
      entries: [
        {
          path: 'nested/tracked.txt',
          mode: '100644',
          blob: hash(repository, 'nested/tracked.txt'),
        },
        { path: 'root.txt', mode: '100644', blob: hash(repository, 'root.txt') },
      ],
      untracked: ['nested/nested-new.txt', 'root-new.txt'],
    });
  });

  test('refuses an index change while staged or working candidates are being read', async () => {
    for (const kind of ['staged', 'working'] as const) {
      const repository = createRepository();
      write(repository, 'tracked.txt', 'committed\n');
      const base = commitAll(repository, 'initial');
      write(repository, 'tracked.txt', 'staged\n');
      runGit(repository, ['add', 'tracked.txt']);

      const wrapperDirectory = join(repository, 'git-wrapper');
      const wrapperPath = join(wrapperDirectory, 'git');
      const markerPath = join(repository, 'first-write-tree');
      mkdirSync(wrapperDirectory);
      const realGit = Bun.which('git');
      expect(realGit).not.toBeNull();
      if (realGit === null) throw new Error('required git executable disappeared during test');
      writeFileSync(
        wrapperPath,
        `#!/bin/sh\nif [ "$3" = "write-tree" ] && [ -n "$GIT_INDEX_FILE" ] && [ ! -e "$WIKI_INDEX_RACE_MARKER" ]; then\n  "$WIKI_REAL_GIT" "$@"\n  code=$?\n  : > "$WIKI_INDEX_RACE_MARKER"\n  printf 'raced\\n' > "$2/raced.txt"\n  (unset GIT_INDEX_FILE; "$WIKI_REAL_GIT" -C "$2" add raced.txt)\n  exit "$code"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
        { mode: 0o755 },
      );

      const invocation = await runCandidateCli(repository, kind, base, {
        PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
        WIKI_INDEX_RACE_MARKER: markerPath,
        WIKI_REAL_GIT: realGit,
      });
      const output = `${invocation.stdout}${invocation.stderr}`;
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(`Git index changed while selecting ${kind} candidate`);
    }
  });

  test('refuses an index removed after capture instead of selecting Git empty tree', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    const markerPath = join(repository, '.git', 'index-removed');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "write-tree" ] && [ ! -e "$WIKI_INDEX_REMOVAL_MARKER" ]; then\n  rm "$2/.git/index"\n  : > "$WIKI_INDEX_REMOVAL_MARKER"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'staged', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_INDEX_REMOVAL_MARKER: markerPath,
      WIKI_REAL_GIT: realGit,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('absent required Git index during staged selection');
  });

  test('refuses tracked working bytes that change across snapshot passes', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    write(repository, 'tracked.txt', 'first working bytes\n');

    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    const markerPath = join(repository, 'working-write-tree');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "add" ] && [ "$4" = "--update" ] && [ ! -e "$WIKI_WORKING_RACE_MARKER" ]; then\n  "$WIKI_REAL_GIT" "$@"\n  code=$?\n  : > "$WIKI_WORKING_RACE_MARKER"\n  printf 'second working bytes\\n' > "$2/tracked.txt"\n  exit "$code"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'working', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_REAL_GIT: realGit,
      WIKI_WORKING_RACE_MARKER: markerPath,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('working tree changed while selecting diagnostic candidate');
  });

  test('refuses untracked membership that changes across snapshot passes', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    write(repository, 'first-untracked.txt', 'first\n');

    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    const markerPath = join(repository, '.git', 'untracked-read');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "ls-files" ] && [ "$4" = "--others" ] && [ ! -e "$WIKI_UNTRACKED_RACE_MARKER" ]; then\n  "$WIKI_REAL_GIT" "$@"\n  code=$?\n  : > "$WIKI_UNTRACKED_RACE_MARKER"\n  printf 'late\\n' > "$2/late-untracked.txt"\n  exit "$code"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'working', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_REAL_GIT: realGit,
      WIKI_UNTRACKED_RACE_MARKER: markerPath,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('working tree changed while selecting diagnostic candidate');
  });

  test('refuses an empty path record in malformed untracked output', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "ls-files" ] && [ "$4" = "--others" ]; then\n  printf '%b' '\\000'\n  exit 0\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'working', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_REAL_GIT: realGit,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('malformed untracked path output: empty path record');
  });

  test('distinguishes absent, unreadable and malformed required index state without returning an empty inventory', async () => {
    const cases = ['absent', 'unreadable', 'malformed'] as const;

    for (const state of cases) {
      const repository = createRepository();
      write(repository, 'tracked.txt', 'committed\n');
      const base = commitAll(repository, 'initial');
      const indexPath = join(repository, '.git', 'index');
      const backupPath = join(repository, '.git', 'index.backup');
      copyFileSync(indexPath, backupPath);
      if (state === 'absent') rmSync(indexPath);
      if (state === 'unreadable') chmodSync(indexPath, 0o000);
      if (state === 'malformed') writeFileSync(indexPath, 'not a Git index', 'utf8');

      const invocation = await runCandidateCli(repository, 'staged', base);
      const output = `${invocation.stdout}${invocation.stderr}`;
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(`${state} required Git index`);

      if (state === 'unreadable') chmodSync(indexPath, 0o600);
      copyFileSync(backupPath, indexPath);
    }
  });

  test('refuses an absent revision distinctly from a non-repository path', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    commitAll(repository, 'initial');

    const absentRevision = await runCandidateCli(repository, 'committed', '0'.repeat(40));
    const absentOutput = `${absentRevision.stdout}${absentRevision.stderr}`;
    expect(absentRevision.exitCode, absentOutput).toBe(1);
    expect(absentOutput).toContain('absent committed revision');

    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-not-repository-'));
    repositories.push(directory);
    const notRepository = await runCandidateCli(directory, 'committed', 'HEAD');
    const repositoryOutput = `${notRepository.stdout}${notRepository.stderr}`;
    expect(notRepository.exitCode, repositoryOutput).toBe(1);
    expect(repositoryOutput).toContain('not a readable Git repository');
  });

  test('refuses malformed or failed ls-tree output instead of substituting zero entries', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const revision = commitAll(repository, 'initial');
    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "ls-tree" ]; then\n  case "$WIKI_TREE_FAULT" in\n    failed) printf 'injected ls-tree failure\\n' >&2; exit 17 ;;\n    unterminated) printf '%b' '100644 blob 1111111111111111111111111111111111111111\\ttracked.txt'; exit 0 ;;\n    no-separator) printf '%b' '100644 blob 1111111111111111111111111111111111111111\\000'; exit 0 ;;\n    bad-header) printf '%b' '100600 blob 1111111111111111111111111111111111111111\\ttracked.txt\\000'; exit 0 ;;\n    bad-kind) printf '%b' '100644 commit 1111111111111111111111111111111111111111\\ttracked.txt\\000'; exit 0 ;;\n    unsorted) printf '%b' '100644 blob 1111111111111111111111111111111111111111\\tz.txt\\000100644 blob 2222222222222222222222222222222222222222\\ta.txt\\000'; exit 0 ;;\n  esac\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const cases = [
      ['failed', 'cannot read immutable Git tree'],
      ['unterminated', 'missing NUL terminator'],
      ['no-separator', 'entry has no path separator'],
      ['bad-header', 'malformed git ls-tree output'],
      ['bad-kind', 'malformed git ls-tree object kind'],
    ] as const;
    for (const [fault, expected] of cases) {
      const invocation = await runCandidateCli(repository, 'committed', revision, {
        PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
        WIKI_REAL_GIT: realGit,
        WIKI_TREE_FAULT: fault,
      });
      const output = `${invocation.stdout}${invocation.stderr}`;
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(expected);
    }
    // Proof: PR run 34694906449 timed this production path out at 5022.71ms under
    // Bun's 5-second default, after its child was still running (`Received: null`).
  }, 20_000);
});

test('submit-admission is an unknown command', () => {
  const repository = createRepository();
  write(repository, 'source.ts', 'export const source = 1;\n');
  const base = commitAll(repository, 'base');
  write(repository, 'packet.json', '{}\n');
  // Proof: restoring the route in cli.ts (importing Dash's moved store) made the cli.ts entry
  // print `admission packet base must be an object` instead of `unknown command`; restoring only
  // the bin.ts `validatorCommands` entry made the bin.ts entry dispatch to the validator and
  // exit `null` instead of 1 (2026-10-11). Both entries now parse with `cli-parser.ts`, whose
  // refusal reads `Unsupported Burokrat command:` (twilight-cli-optique C3).
  for (const entry of [cliPath, join(import.meta.dir, 'bin.ts')]) {
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        entry,
        'submit-admission',
        repository,
        join(repository, 'packet.json'),
        'staged',
        base,
      ],
      { stderr: 'pipe', stdout: 'pipe' },
    );
    expect(invocation.exitCode, entry).toBe(1);
    expect(invocation.stderr.toString('utf8'), entry).toContain(
      'error: Unsupported Burokrat command: submit-admission',
    );
    expect(invocation.stdout.toString('utf8'), entry).toBe('');
  }
  expect(existsSync(join(repository, '.git', 'module-wiki'))).toBe(false);
});

const binPath = join(import.meta.dir, 'bin.ts');

/** Spawns one Burokrat entry with `environment` added, as a shell would. */
function spawnEntry(
  entry: string,
  argv: readonly string[],
  environment: Record<string, string> = {},
): { exitCode: number | null; stdout: string; stderr: string } {
  const invocation = Bun.spawnSync([process.execPath, entry, ...argv], {
    env: { ...process.env, ...environment },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString('utf8'),
    stderr: invocation.stderr.toString('utf8'),
  };
}

/** What `grammar` prints for `argv`, in-process. */
function printedBy<T extends Parser>(grammar: Grammar<T>, argv: string[]) {
  let printed = '';
  const invocation = readInvocation(grammar, argv, {
    stdout: (text) => {
      printed += text;
    },
    version: '0.0.0-test',
  });
  expect(invocation.kind).toBe('printed');
  return printed;
}

/** The command names the generated help lists, one per line of its command section, above the footer. */
function helpCommands(help: string): string[] {
  const commandSection = help.split('Commands that parse their own arguments:')[0];
  return [...commandSection.matchAll(/^ {2}([a-z][a-z0-9-]*) /gmu)]
    .map((match) => match[1])
    .filter((name) => name !== 'help' && name !== 'completion');
}

/**
 * A repository path that does not exist: a refusal that read the repository or any input would
 * name it, so a usage refusal that does not proves nothing was read.
 */
const absentRepository = join(tmpdir(), 'burokrat-cli-parser-absent-repository');

/** The six dated commands, each with its operands but no `--now`. */
const datedCommands: readonly (readonly string[])[] = [
  ['inspect-browser-t2', absentRepository, 'a'.repeat(40), 'policy', 'capability', 'ledger'],
  ['inspect-browser-t2-policy', absentRepository, 'a'.repeat(40), 'policy', 'c', 'l', 'proposed'],
  ['inspect-browser-scenario-ledger', absentRepository, 'a'.repeat(40), 'p', 'c', 'l'],
  ['inspect-scenario-ledger', absentRepository, 'a'.repeat(40), 'p', 'level', 'c', 'l'],
  ['inspect-manual', absentRepository, 'a'.repeat(40), 'policy', 'report.json'],
  ['inspect-manual-observation', absentRepository, 'a'.repeat(40), 'policy', 'report.json'],
];

async function expectUsageRefusal(argv: readonly string[], line: RegExp): Promise<void> {
  const invocation = await invokeCli(argv);
  expect(invocation.stderr).toMatch(/^error: [^\n]*\n$/u);
  expect(invocation.stderr).toMatch(line);
  expect(invocation.stdout).toBe('');
  expect(invocation.exitCode).toBe(1);
}

describe('Burokrat command line (twilight-cli-optique)', () => {
  // Spawns Bun more than once; Bun's 5 s default fails it when this file runs alone.
  test('Burokrat without --now refuses in one usage line', async () => {
    const spawned = spawnEntry(cliPath, datedCommands[0]);
    expect(spawned.exitCode).toBe(1);
    expect(spawned.stdout).toBe('');
    expect(spawned.stderr).toMatch(
      /^error: usage: twilight-burokrat inspect-browser-t2 [^\n]*\(inspect-browser-t2 requires --now <UTC instant>; Twilight Dash supplies the evaluation instant\)\n$/u,
    );
    const colored = spawnEntry(cliPath, datedCommands[0], { FORCE_COLOR: '1' });
    expect(colored.stderr).toBe(spawned.stderr);
    for (const argv of datedCommands) {
      await expectUsageRefusal(
        argv,
        new RegExp(`^error: usage: twilight-burokrat ${argv[0]} .*${argv[0]} requires --now`, 'u'),
      );
    }
  }, 60_000);

  test('a dated command takes --now anywhere, in either spelling', () => {
    const instant = '2026-11-02T00:00:00.000Z';
    const [name, ...operands] = datedCommands[4];
    const spellings = [
      [name, ...operands, '--now', instant],
      [name, '--now', instant, ...operands],
      [name, ...operands, `--now=${instant}`],
    ];
    const parsed = spellings.map((argv) =>
      readInvocation(validatorGrammar, argv, { stdout: () => undefined }),
    );
    for (const invocation of parsed) {
      expect(invocation).toEqual({
        kind: 'command',
        command: {
          command: 'inspect-manual',
          repository: absentRepository,
          revision: 'a'.repeat(40),
          rulePolicy: 'policy',
          report: 'report.json',
          now: instant,
        },
      });
    }
  });

  test('an unknown command refuses in one line, exit 1, through both entries', async () => {
    await expectUsageRefusal(['apply'], /^error: Unsupported Burokrat command: apply\n$/u);
    await expectUsageRefusal([], /^error: Unsupported Burokrat command: <missing>\n$/u);
    // `lint` is the installed executable's own command; the validator never took it.
    await expectUsageRefusal(
      ['lint', 'working', '.', 'HEAD'],
      /^error: Unsupported Burokrat command: lint\n$/u,
    );
    const installed = spawnEntry(binPath, ['apply']);
    expect(installed.exitCode).toBe(1);
    expect(installed.stdout).toBe('');
    expect(installed.stderr).toBe('error: Unsupported Burokrat command: apply\n');
  });

  test('a wrong operand count or mode refuses with the command usage before any read', async () => {
    await expectUsageRefusal(
      ['inspect-level-facts', absentRepository, 'a'.repeat(40), 'authority', 'extra'],
      /^error: usage: twilight-burokrat inspect-level-facts REPOSITORY COMMITTED-SHA AUTHORITY \(Unexpected option or subcommand: `extra`\.\)\n$/u,
    );
    await expectUsageRefusal(
      ['inspect-browser-performance', absentRepository, 'a'.repeat(40), 'policy', 'bogus', 'a'],
      /^error: usage: twilight-burokrat inspect-browser-performance .*Expected one of "ordinary", "packaged", and "portable", but got "bogus"/u,
    );
    await expectUsageRefusal(
      ['check-indexes', 'bogus', absentRepository, 'HEAD'],
      /^error: usage: twilight-burokrat check-indexes SELECTION REPOSITORY REVISION-OR-BASE /u,
    );
  });

  test('check refuses an odd flag tail and explain a two-word tail before reading', async () => {
    await expectUsageRefusal(
      ['check', 'working', absentRepository, 'HEAD', 'policy.json', '--rule'],
      /^error: usage: twilight-burokrat check .*\(`--rule` requires `RULE`\.\)\n$/u,
    );
    await expectUsageRefusal(
      ['explain', 'MOD-INDEX', absentRepository],
      /^error: usage: twilight-burokrat explain .*RULE-POLICY/u,
    );
  });

  test('runCli refuses a command no handler takes', () => {
    // A JavaScript caller can pass what the parser never produces.
    const forged = { command: 'submit-admission' } as unknown as ValidatorCommand;
    expect(() => runCli(forged)).toThrow('Unsupported Burokrat command: submit-admission');
  });

  test('help names every dispatched command and no other', () => {
    const dispatched = [
      ...new Set(Object.keys(validatorHandlers).map((name) => name.split(' ')[0])),
    ].sort();
    expect(helpCommands(printedBy(validatorGrammar, ['--help'])).sort()).toEqual(dispatched);
    expect(commandNamesOf(validatorGrammar).sort()).toEqual(dispatched);
    // The installed executable forwards every validator command but the two source-only ones,
    // and dispatches three of its own.
    const installed = [
      ...dispatched.filter((name) => name !== 'candidate-identity' && name !== 'inspect-browser'),
      'lint',
      'prepare-activation',
      'prepare-relocation-activation',
    ].sort();
    expect(helpCommands(printedBy(installedGrammar, ['--help'])).sort()).toEqual(installed);
    expect(commandNamesOf(installedGrammar).sort()).toEqual(installed);
  });

  // Spawns Bun more than once; Bun's 5 s default fails it when this file runs alone.
  test('help parity holds under any terminal width and colour request', () => {
    const inProcess = printedBy(installedGrammar, ['--help']);
    // A terminal reports its width on the stream; `run` reads it before `COLUMNS`. At 30
    // columns Optique's automatic width gives up on the long usage lines and prints them
    // unwrapped, so only a width it can honour, such as 80, would change the bytes.
    const reported = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 80 });
    try {
      expect(printedBy(installedGrammar, ['--help'])).toBe(inProcess);
    } finally {
      if (reported === undefined) Reflect.deleteProperty(process.stdout, 'columns');
      else Object.defineProperty(process.stdout, 'columns', reported);
    }
    const environments: Record<string, string>[] = [
      { COLUMNS: '30' },
      { COLUMNS: '80' },
      { COLUMNS: '400' },
      { FORCE_COLOR: '1' },
    ];
    for (const environment of environments) {
      const label = JSON.stringify(environment);
      const spawned = spawnEntry(binPath, ['--help'], environment);
      expect(spawned.exitCode, label).toBe(0);
      expect(spawned.stderr, label).toBe('');
      expect(spawned.stdout, label).toBe(inProcess);
    }
  }, 60_000);

  test('the README shows the generated help', () => {
    // Proof: rewording the `inspect-manual` line in the README block failed this test (2026-11-02).
    const readme = readFileSync(join(import.meta.dir, '..', 'README.md'), 'utf8');
    const block = /`twib --help` prints[^`]*```text\n([\s\S]*?)```/u.exec(readme)?.[1];
    expect(block).toBe(printedBy(installedGrammar, ['--help']));
  });

  test('twib --version prints the manifest version; the validator has none', async () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
    ) as {
      version: string;
    };
    const spawned = spawnEntry(binPath, ['--version']);
    expect(spawned.exitCode).toBe(0);
    expect(spawned.stderr).toBe('');
    expect(spawned.stdout).toBe(`${manifest.version}\n`);
    await expectUsageRefusal(['--version'], /^error: Unsupported Burokrat command: --version\n$/u);
  });

  test('help, help <command> and bash, zsh and fish completion print on stdout', () => {
    const expected: Record<string, RegExp> = {
      '--help': /^Usage: twilight-burokrat /u,
      'help inspect-manual': /Usage: twilight-burokrat inspect-manual --now INSTANT REPOSITORY /u,
      'inspect-manual --help': /Usage: twilight-burokrat inspect-manual /u,
      'help lint': /Usage: twilight-burokrat lint SELECTION REPOSITORY REVISION-OR-BASE/u,
      'completion bash': /complete .*twilight-burokrat/u,
      'completion zsh': /^#compdef twilight-burokrat twib\n/u,
      'completion fish': /complete -c twilight-burokrat/u,
    };
    for (const [line, stdout] of Object.entries(expected)) {
      expect(printedBy(installedGrammar, line.split(' ')), line).toMatch(stdout);
    }
    expect(printedBy(installedGrammar, ['help', 'check']).replace(/\s+/gu, ' ')).toContain(
      'SELECTION REPOSITORY REVISION-OR-BASE RULE-POLICY',
    );
    const candidates = printedBy(installedGrammar, ['completion', 'zsh', '']);
    for (const name of commandNamesOf(installedGrammar)) expect(candidates).toContain(name);
  });

  test('formerly delegated help derives from typed options and nested commands', () => {
    for (const [words, expected] of [
      [['check'], '--performance-evidence PATH'],
      [['explain'], 'RULE'],
      [['scenario', 'allocate'], '--predecessor ID'],
      [['template', 'verify'], 'SUBJECT'],
      [['validate', 'workflow-binding'], '--steps STEPS'],
      [['prepare-activation'], '--candidate-mapping PATH'],
      [['prepare-relocation-activation'], '--base-activation PATH'],
    ] as const) {
      const help = printedBy(installedGrammar, [...words, '--help']);
      expect(help).toContain('Usage: twilight-burokrat ' + words.join(' '));
      expect(help).toContain(expected);
      expect(help).not.toContain('[...]');
    }
    for (const tail of [['--version'], ['--now=2026-11-02T00:00:00.000Z'], ['--', '--help']])
      expect(() =>
        readInvocation(validatorGrammar, ['check', ...tail], { stdout: () => undefined }),
      ).toThrow(UsageRefusal);
    expect(
      readInvocation(validatorGrammar, ['check', 'working', '.', 'HEAD', 'policy.json', '--help'], {
        stdout: () => undefined,
      }),
    ).toEqual({ kind: 'printed' });
  });

  test('completion scripts register twib beside twilight-burokrat', () => {
    const registrations: Record<string, readonly RegExp[]> = {
      bash: [/^ {2}complete -F _twilight-burokrat -- twilight-burokrat twib$/mu],
      zsh: [
        /^#compdef twilight-burokrat twib$/mu,
        /^ {2}compdef _optique:twilight-burokrat twilight-burokrat twib$/mu,
      ],
      fish: [/^complete -c twib -f -a '\(__twilight-burokrat_complete\)'$/mu],
    };
    for (const [shell, lines] of Object.entries(registrations)) {
      const script = printedBy(installedGrammar, ['completion', shell]);
      for (const line of lines) expect(script, shell).toMatch(line);
    }
    // Proof: returning the script unchanged when its registration is absent made this expect a
    // throw and receive a script that completes only `twilight-burokrat` (2026-11-03).
    expect(() => registerShortName('zsh', '#compdef other\n')).toThrow(
      'the zsh completion script has no registration line: #compdef twilight-burokrat',
    );
  });

  test('twib completion zsh prints a script on stdout that completes inspect-manual', () => {
    const script = spawnEntry(binPath, ['completion', 'zsh']);
    expect(script.exitCode).toBe(0);
    expect(script.stderr).toBe('');
    expect(script.stdout).toStartWith('#compdef twilight-burokrat twib\n');
    const candidates = spawnEntry(binPath, ['completion', 'zsh', 'inspect-man']);
    expect(candidates.exitCode).toBe(0);
    expect(candidates.stdout).toContain('inspect-manual');
  });

  test('help <unknown> and completion without a shell refuse in one line', async () => {
    await expectUsageRefusal(
      ['help', 'bogus'],
      /^error: usage: twilight-burokrat help \(Unexpected option or subcommand: `bogus`\.\)\n$/u,
    );
    await expectUsageRefusal(
      ['completion'],
      /^error: usage: twilight-burokrat completion \(Missing shell name for completion\.\)\n$/u,
    );
  });
});
