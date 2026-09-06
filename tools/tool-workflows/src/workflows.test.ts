import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

const repository = resolve(import.meta.dir, '../../..');
const cli = join(import.meta.dir, 'generate.ts');
let fixture: string;
const skill = '.agents/skills/openspec-archive-change/SKILL.md';
const variant = '.claude/commands/opsx/archive.md';

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'workflow-test-'));
  cpSync(join(repository, '.agents/skills'), join(fixture, '.agents/skills'), { recursive: true });
  cpSync(join(repository, '.claude'), join(fixture, '.claude'), { recursive: true });
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function run(mode = '--check') {
  return Bun.spawnSync([process.execPath, cli, mode, fixture], { stdout: 'pipe', stderr: 'pipe' });
}

test('generation repairs a divergent provider command and preserves provider invocations', () => {
  writeFileSync(join(fixture, variant), 'corrupted workflow\n');
  const rejected = run();
  expect(rejected.exitCode).toBe(1);
  expect(rejected.stderr.toString()).toContain(variant);
  const generated = run('--write');
  expect(generated.exitCode).toBe(0);
  expect(readFileSync(join(fixture, variant), 'utf8')).toContain('`/opsx:archive');
  expect(
    readFileSync(join(fixture, '.claude/skills/openspec-archive-change/SKILL.md'), 'utf8'),
  ).toContain('`/opsx:archive');
  expect(readFileSync(join(fixture, skill), 'utf8')).toContain('`/openspec-archive-change');
  expect(run().exitCode).toBe(0);
});

test('generation restores a missing installed variant', () => {
  rmSync(join(fixture, variant));
  expect(run().exitCode).toBe(1);
  expect(run().stderr.toString()).toContain(variant);
  expect(run('--write').exitCode).toBe(0);
  expect(run().exitCode).toBe(0);
});

for (const source of [skill, '.agents/skills/source-command-opsx-ff/SKILL.md']) {
  for (const fault of ['absent', 'unreadable'] as const) {
    test(`${fault} canonical ${source} blocks check and generation`, () => {
      if (fault === 'absent') rmSync(join(fixture, source));
      else chmodSync(join(fixture, source), 0);
      for (const mode of ['--check', '--write']) {
        const rejected = run(mode);
        expect(rejected.exitCode).toBe(1);
        expect(rejected.stderr.toString()).toContain(source);
      }
      if (fault === 'unreadable') chmodSync(join(fixture, source), 0o600);
    });
  }
}

test('an unreadable installed variant fails check', () => {
  chmodSync(join(fixture, variant), 0);
  const rejected = run();
  expect(rejected.exitCode).toBe(1);
  expect(rejected.stderr.toString()).toContain(variant);
  chmodSync(join(fixture, variant), 0o600);
});

test('a damaged source wrapper cannot silently erase a command', () => {
  const source = '.agents/skills/source-command-opsx-ff/SKILL.md';
  writeFileSync(join(fixture, source), '# not a command wrapper\n');
  const rejected = run('--write');
  expect(rejected.exitCode).toBe(1);
  expect(rejected.stderr.toString()).toContain(source);
});

test('archive policy changes propagate to bulk and command forms', () => {
  const original = readFileSync(join(fixture, skill), 'utf8');
  writeFileSync(
    join(fixture, skill),
    original.replace(
      'Keep the same selected-root flags',
      'Report this probe. Keep the same selected-root flags',
    ),
  );
  expect(run().exitCode).toBe(1);
  expect(run('--write').exitCode).toBe(0);
  for (const pathname of [
    variant,
    '.agents/skills/openspec-bulk-archive-change/SKILL.md',
    '.agents/skills/source-command-opsx-archive/SKILL.md',
    '.claude/commands/opsx/bulk-archive.md',
  ]) {
    expect(readFileSync(join(fixture, pathname), 'utf8')).toContain('Report this probe.');
  }
  expect(run().exitCode).toBe(0);
});

for (const [source, previous, replacement] of [
  [skill, 'description:', 'missing-description:'],
  [skill, '**Load current archive inputs', '**Missing archive inputs'],
  ['.agents/skills/source-command-opsx-ff/SKILL.md', '## Command Template', '## Missing template'],
  [
    '.agents/skills/openspec-bulk-archive-change/SKILL.md',
    '**Load current archive inputs',
    '**Missing archive inputs',
  ],
] as const) {
  test(`damaged source boundary ${previous} in ${source} stops generation before writes`, () => {
    const original = readFileSync(join(fixture, source), 'utf8');
    writeFileSync(join(fixture, source), original.replace(previous, replacement));
    writeFileSync(join(fixture, variant), 'unchanged probe\n');
    const rejected = run('--write');
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr.toString()).toContain(source);
    expect(readFileSync(join(fixture, variant), 'utf8')).toBe('unchanged probe\n');
  });
}

test('unsupported CLI arguments fail without writing', () => {
  expect(run('--unknown').exitCode).toBe(1);
});

test('an unrecognized workflow source cannot be silently omitted', () => {
  const source = '.agents/skills/openspec-unrecognized';
  cpSync(join(fixture, '.agents/skills/openspec-ff-change'), join(fixture, source), {
    recursive: true,
  });
  const rejected = run('--write');
  expect(rejected.exitCode).toBe(1);
  expect(rejected.stderr.toString()).toContain(source);
});
