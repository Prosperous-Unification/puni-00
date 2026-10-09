import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { registeredRules } from './registry';

const source = 'openspec/specs/example/spec.md';
const journalPath = 'openspec/scenario-allocations.json';
const heading = '#### Scenario: [EXAMPLE-001] First case\n';
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
    selectorVersion: 1,
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
  expect(first.verdict?.scenarios?.selectorVersion).toBe(1);
  expect(first.verdict?.scenarios?.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(second.verdict?.scenarios?.evidenceDigest).not.toBe(
    first.verdict?.scenarios?.evidenceDigest,
  );
});

test('production check refuses a removed identified heading that remains active in the journal', () => {
  const { repository, base } = fixture();
  const candidate = nextCommit(repository, { [source]: '#### Scenario: Legacy case\n' });
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
  const candidate = nextCommit(repository, { [source]: `${heading}${heading}` });
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
    'openspec/changes/active/specs/example/spec.md': '#### Scenario: [EXAMPLE-001] Changed case\n',
  });
  const response = check(repository, conflicting, { baseRevision: base });
  expect(response.exitCode).toBe(1);
  expect(JSON.stringify(response.verdict?.unevaluated)).toContain(
    'conflicting active specification copies',
  );
});
