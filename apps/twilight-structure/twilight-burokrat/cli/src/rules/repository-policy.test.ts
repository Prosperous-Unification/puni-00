import { Buffer } from 'node:buffer';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const repositoryRoot = resolve(import.meta.dir, '../../../../../..');
const trackedPolicy = join(repositoryRoot, 'docs/code-organization/rule-policy.json');
const cliPath = join(import.meta.dir, '..', 'cli.ts');
const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

/** A committed candidate holding exactly `files`; its own content is irrelevant to the policy. */
function commitCandidate(files: Record<string, string>): { repository: string; revision: string } {
  const repository = scratch('twilight-repository-policy-candidate-');
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'rules@example.test']);
  runGit(repository, ['config', 'user.name', 'Rules Fixture']);
  for (const [path, source] of Object.entries(files)) {
    const absolutePath = join(repository, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source, 'utf8');
  }
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', 'candidate']);
  return { repository, revision: runGit(repository, ['rev-parse', 'HEAD']) };
}

/**
 * The selection `docs/code-organization/README.md` documents: the tracked policy is copied out of
 * the repository, because `check` refuses a rule policy inside the candidate it judges.
 */
function selectTrackedPolicy(): string {
  const selected = join(scratch('twilight-repository-policy-'), 'rule-policy.json');
  copyFileSync(trackedPolicy, selected);
  return selected;
}

interface ClassifyVerdict {
  policy: string;
  allowed: boolean;
  ruleIds: string[];
  findings: unknown[];
  unevaluated: { ruleId: string; reason: string }[];
}

function checkClassification(
  candidate: { repository: string; revision: string },
  policyPath: string,
): { exitCode: number; stderr: string; verdict?: ClassifyVerdict } {
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      cliPath,
      'check',
      'committed',
      candidate.repository,
      candidate.revision,
      policyPath,
      '--rule',
      'INV-CLASSIFY',
    ],
    { cwd: import.meta.dir, env: process.env, stderr: 'pipe', stdout: 'pipe' },
  );
  const stdout = Buffer.from(invocation.stdout).toString('utf8');
  return {
    exitCode: invocation.exitCode,
    stderr: Buffer.from(invocation.stderr).toString('utf8'),
    ...(stdout.length === 0 ? {} : { verdict: JSON.parse(stdout) as ClassifyVerdict }),
  };
}

/** One entry per content class the repository policy names, each classified exactly once. */
const classifiedCandidate = {
  'README.md': '# Candidate\n',
  'package.json': '{}\n',
  'bin/run.sh': '#!/bin/sh\n',
  'src/app.ts': 'export const app = 1;\n',
  'src/app.test.ts': 'export {};\n',
  'openspec/specs/x/spec.md': '# Spec\n',
  'db/migrations/0001/migration.sql': 'select 1;\n',
  'src/fixtures/sample.json': '{}\n',
  'src/generated/api.ts': 'export {};\n',
  'src/vendor/lib.js': 'export {};\n',
  'empty/.gitkeep': '',
};

describe('the repository rule policy', () => {
  test('classifies a candidate whose every entry matches exactly one rule', () => {
    // Proof: on 2026-09-27, deleting `classificationPolicy` from the tracked policy made this test
    // receive `rule INV-CLASSIFY needs policy.classificationPolicy` on stderr and no verdict.
    const outcome = checkClassification(
      commitCandidate(classifiedCandidate),
      selectTrackedPolicy(),
    );
    expect(outcome.stderr).toBe('');
    expect(outcome.verdict).toEqual({
      schemaVersion: 1,
      candidate: expect.any(String) as unknown as string,
      policy: 'rules.puni-00.v1',
      allowed: true,
      ruleIds: ['INV-CLASSIFY'],
      findings: [],
      unevaluated: [],
      certifies: false,
    } as ClassifyVerdict);
    expect(outcome.exitCode).toBe(0);
  }, 20_000);

  test('leaves the rule unevaluated and exits 1 for content no rule classifies', () => {
    // Proof: on 2026-09-27, adding `{ "kind": "suffix", "value": ".zzz" }` to the tracked policy's
    // document rule made this test receive exit 0 and `unevaluated: []`.
    const outcome = checkClassification(
      commitCandidate({ ...classifiedCandidate, 'data/unknown.zzz': 'opaque\n' }),
      selectTrackedPolicy(),
    );
    expect(outcome.verdict?.unevaluated).toEqual([
      {
        ruleId: 'INV-CLASSIFY',
        reason: 'ordinary content data/unknown.zzz matched 0 classification rules',
      },
    ]);
    expect(outcome.verdict?.allowed).toBe(false);
    expect(outcome.exitCode).toBe(1);
  }, 20_000);

  test('leaves the rule unevaluated and exits 1 for content two rules classify', () => {
    // A test under a `generated` directory matches both the test rule and the generated rule.
    // Proof: on 2026-09-27, adding a `generated` segment exclusion to the tracked test rule made
    // this test receive exit 0 and `unevaluated: []`.
    const outcome = checkClassification(
      commitCandidate({ ...classifiedCandidate, 'src/generated/api.test.ts': 'export {};\n' }),
      selectTrackedPolicy(),
    );
    expect(outcome.verdict?.unevaluated).toEqual([
      {
        ruleId: 'INV-CLASSIFY',
        reason: 'ordinary content src/generated/api.test.ts matched 2 classification rules',
      },
    ]);
    expect(outcome.exitCode).toBe(1);
  }, 20_000);

  test('states observe for every rule, so selecting it adds no enforcement', () => {
    const policy = JSON.parse(readFileSync(trackedPolicy, 'utf8')) as {
      ruleModes: { ruleId: string; mode: string }[];
    };
    expect(policy.ruleModes.filter((entry) => entry.mode !== 'observe')).toEqual([]);
  });

  test('is refused when read from inside the candidate it would judge', () => {
    const outcome = checkClassification(
      { repository: repositoryRoot, revision: 'HEAD' },
      trackedPolicy,
    );
    expect(outcome.stderr).toContain(
      `rule policy resolves inside selected candidate: ${trackedPolicy}`,
    );
    expect(outcome.exitCode).toBe(1);
  }, 20_000);
});
