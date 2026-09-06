import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

const repository = resolve(import.meta.dir, '../../..');
const cli = join(import.meta.dir, 'generate.ts');
let fixture: string;
const skill = '.agents/skills/openspec-archive-change/SKILL.md';
const bulkSkill = '.agents/skills/openspec-bulk-archive-change/SKILL.md';
const variant = '.claude/commands/opsx/archive.md';
const prettierrc = '.prettierrc.json';

/**
 * chmod 000 denies nothing to uid 0, so under root every "unreadable" case below
 * would pass while proving nothing. Fail loudly instead of reporting a green.
 *
 * Proof: `bun test --preload <file setting process.getuid = () => 0> ... -t
 * unreadable` failed all three cases on `error: Running as root: chmod 000
 * still reads, so this fault test cannot fail`, where without this call they
 * report green. Real uid 0 was not exercised; the condition was simulated.
 */
function assertFaultCanBite(): void {
  const uid = process.getuid?.();
  if (uid === undefined)
    throw new Error('No uid on this platform: a chmod-000 fault cannot be proven here');
  if (uid === 0)
    throw new Error('Running as root: chmod 000 still reads, so this fault test cannot fail');
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'workflow-test-'));
  cpSync(join(repository, '.agents/skills'), join(fixture, '.agents/skills'), { recursive: true });
  cpSync(join(repository, '.claude'), join(fixture, '.claude'), { recursive: true });
  cpSync(join(repository, prettierrc), join(fixture, prettierrc));
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
      else {
        assertFaultCanBite();
        chmodSync(join(fixture, source), 0);
      }
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
  assertFaultCanBite();
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
    bulkSkill,
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
  [bulkSkill, '**Load current archive inputs', '**Missing archive inputs'],
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

// Proof: with the `parts.length !== 2` branch deleted this failed on
// `Expected: 1 / Received: 0`; split()[1] silently took the first of two bodies.
test('a duplicated command template heading stops generation before writes', () => {
  const source = '.agents/skills/source-command-opsx-ff/SKILL.md';
  const original = readFileSync(join(fixture, source), 'utf8');
  writeFileSync(join(fixture, source), `${original}\n## Command Template\nA second body.\n`);
  writeFileSync(join(fixture, variant), 'unchanged probe\n');
  const rejected = run('--write');
  expect(rejected.exitCode).toBe(1);
  expect(rejected.stderr.toString()).toContain(source);
  expect(readFileSync(join(fixture, variant), 'utf8')).toBe('unchanged probe\n');
});

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

for (const stray of [
  '.claude/commands/opsx/stray.md',
  '.claude/skills/openspec-explore/REFERENCE.md',
  '.agents/skills/source-command-opsx-new/NOTES.md',
]) {
  // Proof: with the scan replaced by `void ownedRoots;` all three cases failed
  // on `Expected: 1 / Received: 0`; --check only ever compared its own set.
  test(`an added file under a generated output root is refused: ${stray}`, () => {
    writeFileSync(join(fixture, stray), 'added by hand\n');
    for (const mode of ['--check', '--write']) {
      const rejected = run(mode);
      expect(rejected.exitCode).toBe(1);
      expect(rejected.stderr.toString()).toContain(stray);
    }
  });
}

// Proof: with markGenerated returning its input, this failed on `Expected to
// contain: "<!-- Generated by tool-workflows from
// .agents/skills/openspec-ff-change/SKILL.md; edit that file, not this copy. -->"`.
// With the marker strip removed from readSource it failed on the re-check line
// instead, `Expected: 0 / Received: 1`, markers stacked one per run.
test('a generated copy names the file a human should edit instead', () => {
  expect(run('--write').exitCode).toBe(0);
  const marks: [string, string][] = [
    ['.claude/skills/openspec-ff-change/SKILL.md', '.agents/skills/openspec-ff-change/SKILL.md'],
    ['.claude/commands/opsx/new.md', '.agents/skills/source-command-opsx-new/SKILL.md'],
    [bulkSkill, skill],
    [
      '.agents/skills/source-command-opsx-ff/SKILL.md',
      '.agents/skills/openspec-ff-change/SKILL.md',
    ],
  ];
  for (const [copy, owner] of marks) {
    expect(readFileSync(join(fixture, copy), 'utf8')).toContain(
      `<!-- Generated by tool-workflows from ${owner}; edit that file, not this copy. -->`,
    );
  }
  // The archive skill owns the archive block, so it is told to edit nothing else.
  expect(readFileSync(join(fixture, skill), 'utf8')).not.toContain('Generated by tool-workflows');
  // Re-running must not stack a second marker on a source that is also an output.
  expect(run('--write').exitCode).toBe(0);
  expect(run().exitCode).toBe(0);
  expect(
    readFileSync(join(fixture, bulkSkill), 'utf8').split('Generated by tool-workflows'),
  ).toHaveLength(2);
});

// Proof: hardcoding the options in readFormatOptions left this on
// `Expected: 1 / Received: 0` — the changed configuration moved nothing.
test('the repository prettier configuration decides the generated formatting', () => {
  expect(run('--write').exitCode).toBe(0);
  expect(run().exitCode).toBe(0);
  const configured = JSON.parse(readFileSync(join(fixture, prettierrc), 'utf8')) as Record<
    string,
    unknown
  >;
  writeFileSync(
    join(fixture, prettierrc),
    JSON.stringify({ ...configured, proseWrap: 'always', printWidth: 40 }),
  );
  expect(run().exitCode).toBe(1);
});

for (const fault of ['absent', 'unreadable', 'malformed'] as const) {
  test(`a ${fault} .prettierrc.json stops generation`, () => {
    if (fault === 'absent') rmSync(join(fixture, prettierrc));
    else if (fault === 'malformed') writeFileSync(join(fixture, prettierrc), '[]\n');
    else {
      assertFaultCanBite();
      chmodSync(join(fixture, prettierrc), 0);
    }
    writeFileSync(join(fixture, variant), 'unchanged probe\n');
    for (const mode of ['--check', '--write']) {
      const rejected = run(mode);
      expect(rejected.exitCode).toBe(1);
      expect(rejected.stderr.toString()).toContain(prettierrc);
    }
    expect(readFileSync(join(fixture, variant), 'utf8')).toBe('unchanged probe\n');
    if (fault === 'unreadable') chmodSync(join(fixture, prettierrc), 0o600);
  });
}
