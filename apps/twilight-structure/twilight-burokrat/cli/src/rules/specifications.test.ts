import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { registeredRules } from './registry';

const source = 'openspec/specs/example/spec.md';
const journalPath = 'openspec/scenario-allocations.json';
const requirementHeading =
  '### Requirement: First requirement\n#### Scenario: [EXAMPLE-001] First case\n';
const heading = `## Requirements\n${requirementHeading}`;
const initialJournal = JSON.stringify({
  schemaVersion: 1,
  events: [{ kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' }],
});
const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(invocation.exitCode, Buffer.from(invocation.stderr).toString('utf8')).toBe(0);
  return Buffer.from(invocation.stdout).toString('utf8').trim();
}

function write(repository: string, path: string, contents: string): void {
  const destination = join(repository, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--allow-empty', '-m', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

function fixture(): { repository: string; base: string; candidate: string } {
  const repository = mkdtempSync(join(tmpdir(), 'burokrat-specifications-'));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'scenario@example.test']);
  runGit(repository, ['config', 'user.name', 'Scenario Fixture']);
  write(repository, source, heading);
  write(repository, journalPath, initialJournal);
  const base = commit(repository, 'base journal');
  const candidate = commit(repository, 'candidate');
  return { repository, base, candidate };
}

function journal(events: readonly Record<string, string>[]): string {
  return JSON.stringify({ schemaVersion: 1, events });
}

const firstEvent = { kind: 'import', id: 'EXAMPLE-001', source, title: 'First case' };

function nextCommit(repository: string, files: Record<string, string>): string {
  for (const [path, contents] of Object.entries(files)) write(repository, path, contents);
  return commit(repository, 'next candidate');
}

interface CheckVerdict {
  allowed: boolean;
  findings: { ruleId: string; path: string; message: string; effect: string }[];
  unevaluated: { ruleId: string; reason: string }[];
  scenarios?: {
    baseJournalDigest: string | null;
    baseRevision: string;
    candidateJournalDigest: string;
    unidentified: unknown[];
    evidenceDigest?: string;
    selectorVersion?: number;
    selection?: {
      inputs: { path: string; digest: string }[];
      effective: {
        title: string;
        source: string;
        digest: string;
        aliases: string[];
        scenarios: { title: string; id?: string }[];
      }[];
      operations: {
        kind: string;
        capability: string;
        title: string;
        source: string;
        digest: string;
        from?: string;
      }[];
      removals: { capability: string; title: string; ids: string[] }[];
    };
  };
}

function check(
  repository: string,
  candidate: string,
  scenarios?: Record<string, unknown>,
  kind: 'committed' | 'staged' | 'working' = 'committed',
  mode: 'observe' | 'enforce' = 'observe',
): { exitCode: number; stderr: string; verdict?: CheckVerdict } {
  const policyRoot = mkdtempSync(join(tmpdir(), 'burokrat-specifications-policy-'));
  scratchRoots.push(policyRoot);
  const policyPath = join(policyRoot, 'rule-policy.json');
  writeFileSync(
    policyPath,
    JSON.stringify({
      schemaVersion: 1,
      policyId: 'specifications.fixture.v1',
      ruleModes: registeredRules().map((rule) => ({
        ruleId: rule.id,
        mode: rule.id === 'SPEC-SCENARIOS' ? mode : 'observe',
      })),
      ...(scenarios === undefined ? {} : { scenarios }),
    }),
  );
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      join(import.meta.dir, '..', 'cli.ts'),
      'check',
      kind,
      repository,
      candidate,
      policyPath,
      '--rule',
      'SPEC-SCENARIOS',
    ],
    { cwd: import.meta.dir, stdout: 'pipe', stderr: 'pipe' },
  );
  const stdout = Buffer.from(invocation.stdout).toString('utf8');
  return {
    exitCode: invocation.exitCode,
    stderr: Buffer.from(invocation.stderr).toString('utf8'),
    ...(stdout.length === 0 ? {} : { verdict: JSON.parse(stdout) as CheckVerdict }),
  };
}

test('production check requires external specifications authority', () => {
  const { repository, candidate } = fixture();
  const response = check(repository, candidate);
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('policy.scenarios');
});

test('production check accepts an unchanged journal with an ancestor base and binds its identity', () => {
  const { repository, base, candidate } = fixture();
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.allowed).toBe(true);
  expect(response.verdict?.scenarios).toMatchObject({
    selectorVersion: 3,
    baseRevision: base,
    baseJournalDigest: hashBytes(new TextEncoder().encode(initialJournal)),
    candidateJournalDigest: hashBytes(new TextEncoder().encode(initialJournal)),
    unidentified: [],
  });
});

test('production check refuses a candidate pinned as its own base', () => {
  const { repository, candidate } = fixture();
  const response = check(repository, candidate, { baseRevision: candidate });
  expect(response.exitCode).toBe(1);
  expect(response.verdict?.unevaluated).toEqual([
    { ruleId: 'SPEC-SCENARIOS', reason: 'specifications base must precede candidate' },
  ]);
});

test('production check refuses an absent pinned commit', () => {
  const { repository, candidate } = fixture();
  const response = check(repository, candidate, { baseRevision: '0'.repeat(40) });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'cannot verify specifications base',
  );
});

test('production check refuses a malformed full base SHA', () => {
  const { repository, candidate } = fixture();
  const response = check(repository, candidate, { baseRevision: `${candidate.slice(0, 39)}z` });
  expect(response.exitCode).toBe(1);
  expect(response.stderr).toContain('baseRevision');
  expect(response.verdict).toBeUndefined();
});

test('production check refuses an annotated tag object pinned to the candidate', () => {
  const { repository, candidate } = fixture();
  runGit(repository, ['tag', '-a', 'candidate-base', candidate, '-m', 'wrong base object']);
  const tagObject = runGit(repository, ['rev-parse', 'refs/tags/candidate-base']);
  const response = check(repository, candidate, { baseRevision: tagObject });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('must name a commit object');
});

test('production check refuses an unrelated base', () => {
  const { repository, base, candidate } = fixture();
  runGit(repository, ['checkout', '--orphan', 'elsewhere']);
  const unrelated = commit(repository, 'unrelated');
  const response = check(repository, candidate, { baseRevision: unrelated });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('not a candidate ancestor');
  expect(base).not.toBe(unrelated);
});

test('production check ignores local Git replacement objects for the trusted base', () => {
  const { repository, base, candidate } = fixture();
  runGit(repository, ['checkout', '--orphan', 'replacement']);
  rmSync(join(repository, journalPath));
  const replacement = commit(repository, 'replacement tree without journal');
  runGit(repository, ['replace', base, replacement]);
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.baseJournalDigest).toBe(
    hashBytes(new TextEncoder().encode(initialJournal)),
  );
});

test('production check ignores local Git replacement objects for a selected journal blob', () => {
  const { repository, base, candidate } = fixture();
  const original = runGit(repository, ['rev-parse', `${base}:${journalPath}`]);
  const replacementPath = join(repository, 'replacement-journal.json');
  writeFileSync(replacementPath, '{broken');
  const replacement = runGit(repository, ['hash-object', '-w', replacementPath]);
  runGit(repository, ['replace', original, replacement]);
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.candidateJournalDigest).toBe(
    hashBytes(new TextEncoder().encode(initialJournal)),
  );
});

test('production staged selection requires the pinned base to be an ancestor of HEAD', () => {
  const { repository, base } = fixture();
  runGit(repository, ['checkout', '--orphan', 'elsewhere']);
  commit(repository, 'unrelated checkout');
  const response = check(repository, base, { baseRevision: base }, 'staged');
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('not a checkout ancestor');
});

test('production staged selection refuses a policy pin different from its selected base', () => {
  const { repository, base, candidate } = fixture();
  const response = check(repository, candidate, { baseRevision: base }, 'staged');
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'base differs from candidate selection',
  );
});

test('production check refuses a removed or rewritten predecessor event', () => {
  const { repository, base } = fixture();
  const removed = nextCommit(repository, { [journalPath]: journal([]) });
  const removedResponse = check(repository, removed, { baseRevision: base });
  expect(removedResponse.exitCode).toBe(1);
  expect(JSON.stringify(removedResponse.verdict?.unevaluated)).toContain(
    'rewrote or removed base event',
  );
  const rewritten = nextCommit(repository, {
    [journalPath]: journal([{ ...firstEvent, title: 'Changed case' }]),
  });
  const rewrittenResponse = check(repository, rewritten, { baseRevision: base });
  expect(rewrittenResponse.exitCode).toBe(1);
  expect(JSON.stringify(rewrittenResponse.verdict?.unevaluated)).toContain(
    'rewrote or removed base event',
  );
});

test('production check compares journal event values independent of JSON key order', () => {
  const { repository, base } = fixture();
  const sameEvent = { title: 'First case', source, id: 'EXAMPLE-001', kind: 'import' };
  const candidate = nextCommit(repository, { [journalPath]: journal([sameEvent]) });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
});

test('production check refuses resurrection after deleting a retirement event', () => {
  const { repository } = fixture();
  write(repository, source, '#### Scenario: Legacy case\n');
  write(repository, journalPath, journal([firstEvent, { kind: 'retire', id: 'EXAMPLE-001' }]));
  const base = commit(repository, 'retire first scenario');
  const candidate = nextCommit(repository, {
    [source]: heading,
    [journalPath]: journal([firstEvent]),
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('rewrote or removed base event');
});

test('production check requires a reviewed bootstrap for an absent base journal', () => {
  const repository = mkdtempSync(join(tmpdir(), 'burokrat-bootstrap-'));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'scenario@example.test']);
  runGit(repository, ['config', 'user.name', 'Scenario Fixture']);
  write(repository, source, heading);
  const base = commit(repository, 'before adoption');
  const candidate = nextCommit(repository, { [journalPath]: initialJournal });
  const missing = check(repository, candidate, { baseRevision: base });
  expect(missing.exitCode).toBe(1);
  expect(JSON.stringify(missing.verdict?.unevaluated)).toContain('requires reviewed bootstrap');
  const accepted = check(repository, candidate, {
    baseRevision: base,
    bootstrap: {
      baseRevision: base,
      candidateJournalDigest: hashBytes(new TextEncoder().encode(initialJournal)),
      reviewer: 'reviewer@example.test',
      reference: 'review-123',
    },
  });
  expect(accepted.exitCode, accepted.stderr).toBe(0);
  expect(accepted.verdict?.scenarios?.baseJournalDigest).toBeNull();
  const wrongBase = check(repository, candidate, {
    baseRevision: base,
    bootstrap: {
      baseRevision: candidate,
      candidateJournalDigest: hashBytes(new TextEncoder().encode(initialJournal)),
      reviewer: 'reviewer@example.test',
      reference: 'review-123',
    },
  });
  expect(wrongBase.exitCode).toBe(1);
  expect(JSON.stringify(wrongBase.verdict?.unevaluated)).toContain('requires reviewed bootstrap');
  const wrongDigest = check(repository, candidate, {
    baseRevision: base,
    bootstrap: {
      baseRevision: base,
      candidateJournalDigest: '0'.repeat(64),
      reviewer: 'reviewer@example.test',
      reference: 'review-123',
    },
  });
  expect(wrongDigest.exitCode).toBe(1);
  expect(JSON.stringify(wrongDigest.verdict?.unevaluated)).toContain('requires reviewed bootstrap');
});

test('production check refuses a bootstrap when the base already has a journal', () => {
  const { repository, base, candidate } = fixture();
  const response = check(repository, candidate, {
    baseRevision: base,
    bootstrap: {
      baseRevision: base,
      candidateJournalDigest: hashBytes(new TextEncoder().encode(initialJournal)),
      reviewer: 'reviewer@example.test',
      reference: 'review-123',
    },
  });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'bootstrap cannot replace an existing base journal',
  );
});

test('production check refuses a journal stored as a Git symlink', () => {
  const { repository, base } = fixture();
  rmSync(join(repository, journalPath));
  symlinkSync('elsewhere.json', join(repository, journalPath));
  const candidate = commit(repository, 'symlink journal');
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('regular blob');
});

test('production check refuses an active spec stored as a Git symlink', () => {
  const { repository, base } = fixture();
  rmSync(join(repository, source));
  symlinkSync('elsewhere.md', join(repository, source));
  const candidate = commit(repository, 'symlink active spec');
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'canonical specification must be a regular blob',
  );
});

test('production check ignores fenced scenario headings', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}\n\`\`\`md\n#### Scenario: [EXAMPLE-999] In sample\n\`\`\`\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
});

test.each(['`', '~'])(
  'production check keeps a shorter %s fence inside the containing fence',
  (marker) => {
    const { repository, base } = fixture();
    const candidate = nextCommit(repository, {
      [source]: `${heading}\n${marker.repeat(4)}md\n${marker.repeat(3)}\n#### Scenario: [EXAMPLE-999] In sample\n${marker.repeat(4)}\n`,
    });
    const response = check(repository, candidate, { baseRevision: base });
    expect(response.exitCode, response.stderr).toBe(0);
    expect(response.verdict?.allowed).toBe(true);
  },
);

test('production check closes a backtick fence with a trailing horizontal tab', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}\n\`\`\`md\n\`\`\`\t\n#### Scenario: [EXAMPLE-999] Missing allocation\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('EXAMPLE-999');
});

test('production check rejects a backtick fence opener with a backtick in its info string', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}\n\`\`\`md\`invalid\n#### Scenario: [EXAMPLE-999] Missing allocation\n\`\`\`\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('EXAMPLE-999');
});

test.each([
  [
    'list boundary',
    `${heading}\n- example\n\n  \`\`\`\n  code\n\n#### Scenario: [EXAMPLE-999] Missing allocation\n`,
  ],
  [
    'HTML pre backticks',
    `${heading}\n<pre>\n\`\`\`\n</pre>\n#### Scenario: [EXAMPLE-999] Missing allocation\n`,
  ],
  [
    'lone carriage return fence close',
    `${heading}\n\`\`\`md\r\`\`\`\r#### Scenario: [EXAMPLE-999] Missing allocation\r`,
  ],
  ['three-space heading', `${heading}\n   #### Scenario: [EXAMPLE-999] Missing allocation\n`],
])('production check sees a scenario after %s', (_case, markdown) => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, { [source]: markdown });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('EXAMPLE-999');
});

test('production check reports unidentified legacy headings as debt or refusal by mode', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, { [source]: `${heading}#### Scenario: Legacy case\n` });
  const observed = check(repository, candidate, { baseRevision: base });
  expect(observed.exitCode, observed.stderr).toBe(0);
  expect(observed.verdict?.findings).toEqual([
    {
      ruleId: 'SPEC-SCENARIOS',
      path: source,
      message: 'scenario heading lacks identifier: Legacy case',
      effect: 'debt',
    },
  ]);
  const enforced = check(repository, candidate, { baseRevision: base }, 'committed', 'enforce');
  expect(enforced.exitCode).toBe(1);
  expect(enforced.verdict?.findings[0]?.effect).toBe('refusal');
});

test('production evidence identity changes when only the trusted base changes', () => {
  const { repository, base, candidate: middle } = fixture();
  const candidate = commit(repository, 'same journal later candidate');
  const first = check(repository, candidate, { baseRevision: base });
  const second = check(repository, candidate, { baseRevision: middle });
  expect(first.exitCode, first.stderr).toBe(0);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(first.verdict?.scenarios?.candidateJournalDigest).toBe(
    second.verdict?.scenarios?.candidateJournalDigest,
  );
  expect(first.verdict?.scenarios?.selectorVersion).toBe(3);
  expect(first.verdict?.scenarios?.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(second.verdict?.scenarios?.evidenceDigest).not.toBe(
    first.verdict?.scenarios?.evidenceDigest,
  );
});

test('production check refuses a removed identified heading that remains active in the journal', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: '## Requirements\n### Requirement: First requirement\n#### Scenario: Legacy case\n',
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'active allocated scenario missing',
  );
});

test('production check refuses absent and malformed candidate journals', () => {
  const { repository, base } = fixture();
  rmSync(join(repository, journalPath));
  const absent = commit(repository, 'remove journal');
  const absentResponse = check(repository, absent, { baseRevision: base });
  expect(absentResponse.exitCode).toBe(1);
  expect(JSON.stringify(absentResponse.verdict?.unevaluated)).toContain(
    'candidate scenario journal is absent',
  );
  const malformed = nextCommit(repository, { [journalPath]: '{broken' });
  const malformedResponse = check(repository, malformed, { baseRevision: base });
  expect(malformedResponse.exitCode).toBe(1);
  expect(JSON.stringify(malformedResponse.verdict?.unevaluated)).toContain(
    'candidate scenario journal is unreadable or malformed',
  );
});

test('production check refuses a malformed base journal even when the candidate repairs it', () => {
  const repository = mkdtempSync(join(tmpdir(), 'burokrat-malformed-base-'));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'scenario@example.test']);
  runGit(repository, ['config', 'user.name', 'Scenario Fixture']);
  write(repository, source, heading);
  write(repository, journalPath, '{broken');
  const base = commit(repository, 'malformed base');
  const candidate = nextCommit(repository, { [journalPath]: initialJournal });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'base scenario journal is unreadable or malformed',
  );
});

test('production check refuses an identified heading without allocation', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}#### Scenario: [EXAMPLE-002] Unallocated\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'lacks canonical allocator provenance: EXAMPLE-002',
  );
});

test('production check refuses a duplicated canonical identifier', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}#### Scenario: [EXAMPLE-001] First case\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'duplicate canonical scenario identifier: EXAMPLE-001',
  );
});

test('production check refuses an empty active spec inventory', () => {
  const { repository, base } = fixture();
  rmSync(join(repository, source));
  const candidate = commit(repository, 'remove only spec');
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'active canonical specification inventory is absent',
  );
});

test('production check ignores archive copies but refuses conflicting active copies', () => {
  const { repository, base } = fixture();
  const archived = nextCommit(repository, {
    'openspec/changes/archive/old/specs/example/spec.md':
      '#### Scenario: [EXAMPLE-001] Changed case\n',
  });
  expect(check(repository, archived, { baseRevision: base }).exitCode).toBe(0);
  const conflicting = nextCommit(repository, {
    'openspec/changes/active/specs/example/spec.md':
      '## ADDED Requirements\n### Requirement: First requirement\n#### Scenario: [EXAMPLE-001] Changed case\n',
  });
  const response = check(repository, conflicting, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'conflicting active specification requirement',
  );
});

test('production selector applies modified and added requirements without losing canonical scenarios', () => {
  const { repository, base } = fixture();
  const overlay = 'openspec/changes/add-example/specs/example/spec.md';
  const candidate = nextCommit(repository, {
    [overlay]:
      '## MODIFIED Requirements\n### Requirement: First requirement\n' +
      '#### Scenario: [EXAMPLE-001] First case\n- **THEN** changed behavior\n' +
      '#### Scenario: [EXAMPLE-002] Added case\n' +
      '## ADDED Requirements\n### Requirement: Second requirement\n' +
      '#### Scenario: [EXAMPLE-003] New requirement case\n',
    [journalPath]: journal([
      firstEvent,
      { kind: 'allocate', id: 'EXAMPLE-002', source: overlay, title: 'Added case' },
      { kind: 'allocate', id: 'EXAMPLE-003', source: overlay, title: 'New requirement case' },
    ]),
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.selectorVersion).toBe(3);
  expect(response.verdict?.scenarios?.selection?.inputs.map(({ path }) => path)).toEqual([
    overlay,
    source,
  ]);
  expect(response.verdict?.scenarios?.selection?.effective.map(({ title }) => title)).toEqual([
    'First requirement',
    'Second requirement',
  ]);
  expect(response.verdict?.scenarios?.selection?.effective[0]?.aliases).toEqual([source]);
  expect(response.verdict?.scenarios?.selection?.operations.map(({ kind }) => kind)).toEqual([
    'MODIFIED',
    'ADDED',
  ]);
});

test('production selector retains the distinct DI label and binding-origin requirements', () => {
  const { repository, base } = fixture();
  const sourceRoot = resolve(import.meta.dir, '../../../../../..');
  const originalPath = 'openspec/changes/adopt-di-composition/specs/di-composition/spec.md';
  const surfacePath = 'openspec/changes/di-bag-label-surface/specs/di-composition/spec.md';
  const candidate = nextCommit(repository, {
    [originalPath]: readFileSync(join(sourceRoot, originalPath), 'utf8'),
    [surfacePath]: readFileSync(join(sourceRoot, surfacePath), 'utf8'),
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.verdict?.unevaluated).toEqual([]);
  expect(response.exitCode, response.stderr).toBe(0);
  const operations = response.verdict?.scenarios?.selection?.operations;
  expect(
    operations?.find(
      ({ source, title }) =>
        source === originalPath &&
        title === "A module's label names its private bindings in failures",
    ),
  ).toMatchObject({
    kind: 'ADDED',
    capability: 'di-composition',
  });
  expect(operations?.find(({ source }) => source === surfacePath)).toMatchObject({
    kind: 'ADDED',
    capability: 'di-composition',
    title: 'Module labels and binding origins are read from explicit metadata',
  });
  const effective = response.verdict?.scenarios?.selection?.effective;
  expect(
    effective
      ?.find(({ title }) => title === "A module's label names its private bindings in failures")
      ?.scenarios.map(({ title }) => title),
  ).toEqual([
    'A missing requirement names the module that asked',
    'A library module and an app module are identified',
    'Everything that names a module agrees with its label',
  ]);
  expect(
    effective
      ?.find(
        ({ title }) =>
          title === 'Module labels and binding origins are read from explicit metadata',
      )
      ?.scenarios.map(({ title }) => title),
  ).toEqual([
    'A forged prefix does not supply a module label',
    'A nested labelled module does not label its parent',
    'No private binding is required for label agreement',
    "A binding's installation is identified in a container",
  ]);
});

test('production selector still refuses a second active DI binding-origin operation', () => {
  const { repository, base } = fixture();
  const sourceRoot = resolve(import.meta.dir, '../../../../../..');
  const originalPath = 'openspec/changes/adopt-di-composition/specs/di-composition/spec.md';
  const surfacePath = 'openspec/changes/di-bag-label-surface/specs/di-composition/spec.md';
  const competingPath = 'openspec/changes/competing-di/specs/di-composition/spec.md';
  const surface = readFileSync(join(sourceRoot, surfacePath), 'utf8');
  const candidate = nextCommit(repository, {
    [originalPath]: readFileSync(join(sourceRoot, originalPath), 'utf8'),
    [surfacePath]: surface,
    // Proof: removing this second active operation made this production CLI refusal
    // test fail (expected exit 1, received 0); restoring it retains the conflict.
    [competingPath]: surface,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(response.verdict?.unevaluated).toEqual([
    {
      ruleId: 'SPEC-SCENARIOS',
      reason:
        'competing overlay operation: di-composition: Module labels and binding origins are read from explicit metadata',
    },
  ]);
});

const pointedCanonicalPath = 'openspec/specs/wbs-domain/spec.md';
const pointedInkPath = 'openspec/changes/pointed-row-one-ink/specs/wbs-domain/spec.md';
const pointedCostPath = 'openspec/changes/pointed-row-render-cost/specs/wbs-domain/spec.md';
const pointedTitles = [
  "One pointed row, and each face lights the other's answer",
  "A bar's focus points its row, and the pointer outranks it",
  'The row light outranks the alternating band',
  'A row with no bars is still pointable',
  'Pointing a row never remounts a cell',
];
const pointedScenarios = [
  [
    'hovering a bar lights its row label, its band and its table row',
    'hovering a table row lights its Gantt label and band, and itself',
    'an alternating row lights the same colour as an unbanded one',
    'the empty part of a Gantt row points that row',
    'a row nobody has estimated still points',
    'the light moves rather than accumulating',
    'leaving clears the light',
    "a bar's other roles are not lit",
    'pointing scrolls nothing',
  ],
  [
    'focusing a bar lights its row',
    'the pointer wins while both are live',
    'losing the pointer falls back to the focus',
  ],
  ['an even row keeps the row light under the pointer', 'both stripes are painted one colour'],
  ['an unestimated row lights across both faces', 'a row label points its own row'],
  [
    'an open editor survives the pointer crossing the chart',
    'pointing a row re-renders no unrelated row',
    'pointing a row re-renders no Gantt mark',
    'the light still lands after the isolation',
  ],
];

function pointedSources(): Record<string, string> {
  const sourceRoot = resolve(import.meta.dir, '../../../../../..');
  return {
    [pointedCanonicalPath]: readFileSync(join(sourceRoot, pointedCanonicalPath), 'utf8'),
    [pointedInkPath]: readFileSync(join(sourceRoot, pointedInkPath), 'utf8'),
    [pointedCostPath]: readFileSync(join(sourceRoot, pointedCostPath), 'utf8'),
  };
}

test('production selector composes exactly five pointed-row requirements and twenty scenarios from disjoint active owners', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, pointedSources());
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  const selection = response.verdict?.scenarios?.selection;
  expect(selection?.inputs.map(({ path }) => path)).toEqual([
    pointedInkPath,
    pointedCostPath,
    source,
    pointedCanonicalPath,
  ]);
  const pointed = selection?.effective.filter(({ title }) => pointedTitles.includes(title));
  expect(
    pointed?.map(({ title, source: owner, scenarios }) => ({
      title,
      owner,
      scenarios: scenarios.map(({ title: scenario }) => scenario),
    })),
  ).toEqual(
    pointedTitles.map((title, index) => ({
      title,
      owner: index === 0 ? pointedInkPath : index === 4 ? pointedCostPath : pointedCanonicalPath,
      scenarios: pointedScenarios[index],
    })),
  );
  expect(pointed?.reduce((count, requirement) => count + requirement.scenarios.length, 0)).toBe(20);
  expect(selection?.operations.filter(({ capability }) => capability === 'wbs-domain')).toEqual([
    expect.objectContaining({ kind: 'MODIFIED', title: pointedTitles[0], source: pointedInkPath }),
    expect.objectContaining({ kind: 'MODIFIED', title: pointedTitles[4], source: pointedCostPath }),
  ]);
});

test('production selector refuses pointed-row modification without its canonical predecessor', () => {
  const { repository, base } = fixture();
  const sources = pointedSources();
  const canonical = sources[pointedCanonicalPath];
  const first = canonical.indexOf(`### Requirement: ${pointedTitles[0]}`);
  const second = canonical.indexOf(`### Requirement: ${pointedTitles[1]}`, first);
  // Proof: disabling the production predecessor guard made this assertion fail:
  // it received a TypeError reason for predecessor.scenarios, not the modeled refusal.
  sources[pointedCanonicalPath] = canonical.slice(0, first) + canonical.slice(second);
  const candidate = nextCommit(repository, sources);
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(response.verdict?.unevaluated).toEqual([
    {
      ruleId: 'SPEC-SCENARIOS',
      reason: `overlay requirement has no predecessor: wbs-domain: ${pointedTitles[0]}`,
    },
  ]);
});

test('production selector refuses a competing first pointed-row modification', () => {
  const { repository, base } = fixture();
  const sources = pointedSources();
  // Proof: disabling the production competing-operation guard made this assertion
  // fail (exit 1; expected 1, received 0) with both malformed operations intact.
  sources['openspec/changes/competing-pointed-row/specs/wbs-domain/spec.md'] =
    sources[pointedInkPath];
  const candidate = nextCommit(repository, sources);
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(response.verdict?.unevaluated).toEqual([
    {
      ruleId: 'SPEC-SCENARIOS',
      reason: `competing overlay operation: wbs-domain: ${pointedTitles[0]}`,
    },
  ]);
});

test('production selector refuses a pointed-row render overlay that drops editor continuity', () => {
  const { repository, base } = fixture();
  const sources = pointedSources();
  const cost = sources[pointedCostPath];
  const editor = cost.indexOf(
    '#### Scenario: an open editor survives the pointer crossing the chart',
  );
  const isolation = cost.indexOf(
    '#### Scenario: pointing a row re-renders no unrelated row',
    editor,
  );
  // Proof: disabling the production retained-scenario guard made this assertion
  // fail (exit 1; expected 1, received 0) with the editor scenario still dropped.
  sources[pointedCostPath] = cost.slice(0, editor) + cost.slice(isolation);
  const candidate = nextCommit(repository, sources);
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(response.verdict?.unevaluated).toEqual([
    {
      ruleId: 'SPEC-SCENARIOS',
      reason: `MODIFIED requirement drops canonical scenario: wbs-domain: ${pointedTitles[4]}`,
    },
  ]);
});

const renamePair =
  '## RENAMED Requirements\n- FROM: `### Requirement: First requirement`\n' +
  '- TO: `### Requirement: Renamed requirement`\n';
const renamedBody =
  '## MODIFIED Requirements\n### Requirement: Renamed requirement\n' +
  '#### Scenario: [EXAMPLE-001] First case\n- **THEN** revised behavior\n';

test('production selector records a rename-only operation and binds its effective title', () => {
  const { repository, base, candidate: before } = fixture();
  const overlay = 'openspec/changes/rename/specs/example/spec.md';
  const candidate = nextCommit(repository, { [overlay]: renamePair });
  const prior = check(repository, before, { baseRevision: base });
  const response = check(repository, candidate, { baseRevision: base });
  expect(prior.exitCode, prior.stderr).toBe(0);
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.selection?.effective[0]).toMatchObject({
    title: 'Renamed requirement',
    source: overlay,
    aliases: [source],
  });
  expect(response.verdict?.scenarios?.selection?.effective[0]?.digest).not.toBe(
    prior.verdict?.scenarios?.selection?.effective[0]?.digest,
  );
  expect(response.verdict?.scenarios?.selection?.operations).toMatchObject([
    {
      kind: 'RENAMED',
      from: 'First requirement',
      title: 'Renamed requirement',
      source: overlay,
      digest: hashBytes(Buffer.from('First requirement\u0000Renamed requirement')),
    },
  ]);
});

test('production selector keeps a renamed requirement between its canonical neighbors', () => {
  const { repository } = fixture();
  const canonical = nextCommit(repository, {
    [source]:
      '## Requirements\n### Requirement: Earlier\n#### Scenario: Earlier case\n' +
      requirementHeading +
      '### Requirement: Later\n#### Scenario: Later case\n',
  });
  const candidate = nextCommit(repository, {
    'openspec/changes/rename/specs/example/spec.md': renamePair,
  });
  const response = check(repository, candidate, { baseRevision: canonical });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.selection?.effective.map(({ title }) => title)).toEqual([
    'Earlier',
    'Renamed requirement',
    'Later',
  ]);
});

// Proof: disabling rename parsing made both production checks refuse the valid pair.
test.each([renamePair + renamedBody, renamedBody + renamePair])(
  'production selector preserves position, scenario and effective body across requirement rename',
  (markdown) => {
    const { repository, base } = fixture();
    const overlay = 'openspec/changes/rename/specs/example/spec.md';
    const candidate = nextCommit(repository, { [overlay]: markdown });
    const response = check(repository, candidate, { baseRevision: base });
    expect(response.exitCode, response.stderr).toBe(0);
    expect(response.verdict?.scenarios?.selection?.effective).toMatchObject([
      { title: 'Renamed requirement', source: overlay, aliases: [source] },
    ]);
    expect(response.verdict?.scenarios?.selection?.operations.map(({ kind }) => kind)).toEqual([
      'MODIFIED',
      'RENAMED',
    ]);
  },
);

test.each([
  [
    'missing TO',
    '## RENAMED Requirements\n- FROM: `### Requirement: First requirement`\n',
    'rename pair',
  ],
  [
    'missing FROM',
    '## RENAMED Requirements\n- TO: `### Requirement: Renamed requirement`\n',
    'rename pair',
  ],
  [
    'reversed endpoints',
    '## RENAMED Requirements\n- TO: `### Requirement: Renamed requirement`\n- FROM: `### Requirement: First requirement`\n',
    'rename pair',
  ],
  ['blank destination', renamePair.replace('Renamed requirement', '   '), 'rename pair'],
  ['padded source', renamePair.replace('First requirement', ' First requirement '), 'rename pair'],
  ['duplicate FROM', renamePair + '- FROM: `### Requirement: First requirement`\n', 'rename pair'],
  ['duplicate TO', renamePair + '- TO: `### Requirement: Renamed requirement`\n', 'rename pair'],
  [
    'heading in pair',
    renamePair + '### Requirement: Hidden\n#### Scenario: Hidden\n',
    'inside rename pair',
  ],
  ['unknown source', renamePair.replace('First requirement', 'Unknown'), 'no predecessor'],
  [
    'occupied destination',
    renamePair.replace('Renamed requirement', 'First requirement'),
    'occupied',
  ],
  [
    'chain',
    renamePair +
      '- FROM: `### Requirement: Renamed requirement`\n- TO: `### Requirement: Third requirement`\n',
    'competing',
  ],
  [
    'dropped scenario',
    renamePair +
      '## MODIFIED Requirements\n### Requirement: Renamed requirement\n#### Scenario: Changed case\n',
    'drops canonical scenario',
  ],
])('production selector refuses requirement rename %s', (_label, markdown, reason) => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/rename/specs/example/spec.md': markdown,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(reason);
});

test('production selector refuses another change targeting either rename endpoint', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/rename/specs/example/spec.md': renamePair,
    'openspec/changes/compete/specs/example/spec.md':
      '## MODIFIED Requirements\n### Requirement: First requirement\n' +
      '#### Scenario: [EXAMPLE-001] First case\n',
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('competing');
});

test('production selector refuses another change targeting the rename destination', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/rename/specs/example/spec.md': renamePair,
    'openspec/changes/compete/specs/example/spec.md':
      '## MODIFIED Requirements\n### Requirement: Renamed requirement\n' +
      '#### Scenario: [EXAMPLE-001] First case\n',
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('competing');
});

test('production selector refuses an empty rename section beside a valid operation', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/rename/specs/example/spec.md':
      '## RENAMED Requirements\n\n## ADDED Requirements\n' +
      '### Requirement: New requirement\n#### Scenario: New case\n',
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'malformed requirement rename pair',
  );
});

test.each([
  [
    'missing predecessor',
    '## MODIFIED Requirements\n### Requirement: Unknown\n#### Scenario: Other\n',
    'has no predecessor',
  ],
  [
    'unknown operation',
    '## REPLACED Requirements\n### Requirement: First requirement\n#### Scenario: [EXAMPLE-001] First case\n',
    'unsupported overlay operation',
  ],
  [
    'removed retained case',
    '## MODIFIED Requirements\n### Requirement: First requirement\n#### Scenario: New case\n',
    'drops canonical scenario',
  ],
  [
    'competing modifications',
    '## MODIFIED Requirements\n### Requirement: First requirement\n#### Scenario: [EXAMPLE-001] First case\n',
    'competing overlay operation',
  ],
])('production selector refuses %s', (label, overlayMarkdown, reason) => {
  const { repository, base } = fixture();
  const first = 'openspec/changes/a/specs/example/spec.md';
  const second = 'openspec/changes/b/specs/example/spec.md';
  const files: Record<string, string> = { [first]: overlayMarkdown };
  if (label === 'competing modifications') files[second] = overlayMarkdown;
  const candidate = nextCommit(repository, files);
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(reason);
});

test('production selector refuses a scenario outside its requirement section', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}## Notes\n#### Scenario: [EXAMPLE-999] Orphan\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('outside a requirement');
});

test('production selector refuses an orphan scenario after a depth-one heading', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}# Notes\n#### Scenario: [EXAMPLE-999] Orphan\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('outside a requirement');
});

test('production selector refuses an overlay requirement after a depth-one heading', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/invalid/specs/example/spec.md':
      '## ADDED Requirements\n# Notes\n### Requirement: Invented\n#### Scenario: Invented case\n',
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'overlay requirement has no operation',
  );
});

test('production selector refuses a canonical requirement after a depth-one heading', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `${heading}# Notes\n### Requirement: Invented\n#### Scenario: Invented case\n`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'canonical requirement outside Requirements',
  );
});

test('production selector refuses a canonical requirement under Notes', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    [source]: `## Notes\n${requirementHeading}`,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'canonical requirement outside Requirements',
  );
});

test.each([
  [
    'missing operation',
    '## Notes\n### Requirement: First requirement\n#### Scenario: [EXAMPLE-001] First case\n',
    'overlay requirement has no operation',
  ],
  [
    'empty requirement inventory',
    '## ADDED Requirements\n',
    'active specification has no requirements',
  ],
  [
    'scenario-free requirement',
    '## ADDED Requirements\n### Requirement: New requirement\nNo scenario yet.\n',
    'active requirement has no scenarios',
  ],
])('production selector refuses %s', (_label, markdown, reason) => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/invalid/specs/example/spec.md': markdown,
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(reason);
});

test('production selector refuses duplicate canonical requirement titles', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, { [source]: `${heading}${heading}` });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'duplicate canonical requirement',
  );
});

test('production selector requires retirement when a removed requirement contained adopted IDs', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/remove-example/specs/example/spec.md':
      '## REMOVED Requirements\n### Requirement: First requirement\n',
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('requires retirement');
});

test('production selector accepts a removed requirement after its identifier is retired', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, {
    'openspec/changes/remove-example/specs/example/spec.md':
      '## REMOVED Requirements\n### Requirement: First requirement\n',
    [journalPath]: journal([firstEvent, { kind: 'retire', id: 'EXAMPLE-001' }]),
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.selection?.removals).toEqual([
    { capability: 'example', title: 'First requirement', ids: ['EXAMPLE-001'] },
  ]);
});

test('production selector retains unidentified canonical titles through modification', () => {
  const { repository } = fixture();
  const canonical = nextCommit(repository, { [source]: `${heading}#### Scenario: Legacy case\n` });
  const candidate = nextCommit(repository, {
    'openspec/changes/change-example/specs/example/spec.md':
      '## MODIFIED Requirements\n### Requirement: First requirement\n' +
      '#### Scenario: [EXAMPLE-001] First case\n#### Scenario: Renamed legacy case\n',
  });
  const response = check(repository, candidate, { baseRevision: canonical });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain('drops canonical scenario');
});

test('production selector appends independent new requirements in stable title order', () => {
  const { repository, base } = fixture();
  const zed = 'openspec/changes/a-zed/specs/example/spec.md';
  const alpha = 'openspec/changes/z-alpha/specs/example/spec.md';
  const candidate = nextCommit(repository, {
    [zed]: '## ADDED Requirements\n### Requirement: Zed\n#### Scenario: [EXAMPLE-002] Zed case\n',
    [alpha]:
      '## ADDED Requirements\n### Requirement: Alpha\n#### Scenario: [EXAMPLE-003] Alpha case\n',
    [journalPath]: journal([
      firstEvent,
      { kind: 'allocate', id: 'EXAMPLE-002', source: zed, title: 'Zed case' },
      { kind: 'allocate', id: 'EXAMPLE-003', source: alpha, title: 'Alpha case' },
    ]),
  });
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.selection?.effective.map(({ title }) => title)).toEqual([
    'First requirement',
    'Alpha',
    'Zed',
  ]);
});

test('production evidence binds every active overlay even when effective requirements are unchanged', () => {
  const { repository, base, candidate: initial } = fixture();
  const alias = 'openspec/changes/duplicate/specs/example/spec.md';
  const candidate = nextCommit(repository, {
    [alias]: `## ADDED Requirements\n${requirementHeading}`,
  });
  const before = check(repository, initial, { baseRevision: base });
  const after = check(repository, candidate, { baseRevision: base });
  expect(before.exitCode, before.stderr).toBe(0);
  expect(after.exitCode, after.stderr).toBe(0);
  expect(after.verdict?.scenarios?.selection?.inputs).toEqual([
    {
      path: alias,
      digest: hashBytes(new TextEncoder().encode(`## ADDED Requirements\n${requirementHeading}`)),
    },
    { path: source, digest: hashBytes(new TextEncoder().encode(heading)) },
  ]);
  expect(after.verdict?.scenarios?.selection?.effective[0]?.aliases).toEqual([alias]);
  expect(after.verdict?.scenarios?.evidenceDigest).not.toBe(
    before.verdict?.scenarios?.evidenceDigest,
  );
});

test('production selection preserves an adopted journal source after its change is synced', () => {
  const repository = mkdtempSync(join(tmpdir(), 'burokrat-synced-source-'));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'scenario@example.test']);
  runGit(repository, ['config', 'user.name', 'Scenario Fixture']);
  const importedFrom = 'openspec/changes/old/specs/example/spec.md';
  write(repository, source, heading);
  write(repository, journalPath, journal([{ ...firstEvent, source: importedFrom }]));
  const base = commit(repository, 'synced base');
  const candidate = commit(repository, 'synced candidate');
  const response = check(repository, candidate, { baseRevision: base });
  expect(response.exitCode, response.stderr).toBe(0);
  expect(response.verdict?.scenarios?.selection?.effective[0]?.aliases).toEqual([importedFrom]);
});
