import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';

import { type CandidateEntry, readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { checkCandidate, digestCandidate, executeCheckCandidate } from '../rules/check';
import { registeredRules } from '../rules/registry';
import { hashBytes, hashCanonical } from './content-manifest';
import { identifyCoverageRuntime } from './coverage-runtime';

interface Review {
  schemaVersion: 1;
  candidate: { revision: string; tree: string; digest: string };
  inventory: CandidateEntry[];
  selectors: { kind: 'path' | 'prefix'; value: string }[];
  subjects: CandidateEntry[];
  policyDigest: string;
  adoptedSetDigest: string;
  registryDigest: string;
  runtimeDigest: string;
  exclusions: {
    subject: CandidateEntry;
    ruleId: string;
    code: string;
    reason: string;
    reviewer: string;
    reference: string;
  }[];
}
interface CoverageRow {
  subject: CandidateEntry;
  ruleId: string;
  ruleMode: string;
  applicability: string;
  evaluation: string;
  scope: string;
  indexPaths: string[];
  attribution: { kind: string; findings?: unknown[]; reason?: string };
}
interface CoverageReport {
  allowed: false;
  certifies: false;
  inventory: CandidateEntry[];
  rows: CoverageRow[];
  verdict: ReturnType<typeof checkCandidate>;
}
let root: string;
let previousModules: string | undefined;
let repository: string;
let revision: string;
let policyPath: string;
let reviewPath: string;
let policyBytes: string;
let original: Review;
function runGit(...argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv]);
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  return invocation.stdout.toString().trim();
}
function cloneReview(): Review {
  return structuredClone(original);
}
function selectSubject(path: string): CandidateEntry {
  const selected = original.inventory.find((entry) => entry.path === path);
  if (selected === undefined) throw new Error(`fixture subject absent: ${path}`);
  return selected;
}
function writeReview(authority: Review): void {
  writeFileSync(reviewPath, JSON.stringify(authority));
}
function runCoverage() {
  return invokeCli(['inspect-evaluation-coverage', repository, revision, policyPath, reviewPath]);
}
async function expectRefusal(fragment: string): Promise<void> {
  const invocation = await runCoverage();
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(fragment);
}
function selectRow(report: CoverageReport, path: string, ruleId: string): CoverageRow {
  const selected = report.rows.find((cell) => cell.subject.path === path && cell.ruleId === ruleId);
  if (selected === undefined) throw new Error(`fixture row absent: ${path}/${ruleId}`);
  return selected;
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'evaluation-coverage-'));
  previousModules = process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  const modules = join(root, 'trusted-modules');
  mkdirSync(modules);
  process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = modules;
  repository = join(root, 'candidate');
  mkdirSync(repository);
  runGit('init', '--initial-branch=main');
  runGit('config', 'user.email', 'coverage@example.test');
  runGit('config', 'user.name', 'Coverage Fixture');
  for (const directory of ['infra', 'bin', 'src']) mkdirSync(join(repository, directory));
  writeFileSync(join(repository, 'infra/config.yaml'), 'apiVersion: v1\nkind: ConfigMap\n');
  writeFileSync(join(repository, 'bin/peer'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(repository, 'bin/peer'), 0o755);
  writeFileSync(join(repository, 'src/entry.ts'), 'export const count = 1;\n'.repeat(3));
  const metadata = {
    schemaVersion: 1,
    moduleId: 'module.coverage',
    memberships: ['infra', 'bin', 'src'].map((prefix) => ({
      kind: 'directory-prefix',
      prefix,
      exclusions: [],
    })),
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: ['relationships', 'invariants', 'checks'].map((section) => ({
      section,
      reason: 'Fixture has no additional declarations.',
    })),
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Only fixture consumers are known.' },
  };
  writeFileSync(
    join(repository, 'README.md'),
    `# Fixture\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`,
  );
  writeFileSync(
    join(repository, 'src/README.md'),
    `# Source fixture\n\n<!-- module-index ${JSON.stringify({ ...metadata, moduleId: 'module.coverage.source', memberships: [{ kind: 'path', path: 'entry.ts' }] })} -->\n`,
  );
  runGit('add', '--all');
  runGit('commit', '-m', 'coverage fixture');
  revision = runGit('rev-parse', 'HEAD');
  policyPath = join(root, 'policy.json');
  reviewPath = join(root, 'review.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'coverage.fixture.v1',
    ruleModes: registeredRules().map(({ id }) => ({ ruleId: id, mode: 'observe' })),
    adoptedSet: { adoptedPrefixes: [] },
    classificationPolicy: JSON.parse(
      readFileSync(
        join(import.meta.dir, '../contracts/fixtures/classification-policy.v1.json'),
        'utf8',
      ),
    ) as unknown,
    relationshipRequest: {
      schemaVersion: 1,
      typescript: { configPaths: ['missing.json'], publicEntrypoints: ['src/entry.ts'] },
    },
    plainTypeScriptPaths: [],
    sizeCeilings: { ceiling: 2, roots: ['src'], pinned: [] },
    scenarios: { baseRevision: revision },
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath: 'missing.json',
      config: 'missing.ts',
      configDigest: '0'.repeat(64),
      project: 'fixture',
      runnerVersion: '1',
      reviewedCases: [],
    },
  };
  policyBytes = JSON.stringify(policy);
  writeFileSync(policyPath, policyBytes);
  const candidate = readCandidate(repository, { kind: 'committed', revision });
  if (candidate.selection.kind !== 'committed') throw new Error('fixture is not committed');
  const rules = registeredRules().map(({ id, family, statement, source, inputs }) => ({
    id,
    family,
    statement,
    source,
    inputs,
    ruleMode: 'observe',
    exclusionCodes:
      id === 'F7'
        ? ['outside-size-input']
        : id === 'MOD-DIRECT-ENTRIES'
          ? ['not-index-declaration']
          : [],
  }));
  original = {
    schemaVersion: 1,
    candidate: { revision, tree: candidate.selection.tree, digest: digestCandidate(candidate) },
    inventory: candidate.entries,
    selectors: [
      { kind: 'path', value: 'README.md' },
      ...['infra', 'bin', 'src'].map((value) => ({ kind: 'prefix' as const, value })),
    ],
    subjects: candidate.entries.map((entry) => ({ ...entry })),
    policyDigest: hashBytes(new TextEncoder().encode(policyBytes)),
    adoptedSetDigest: hashCanonical(policy.adoptedSet),
    registryDigest: hashCanonical(rules),
    runtimeDigest: identifyCoverageRuntime(join(import.meta.dir, '../cli.ts')).digest,
    exclusions: [],
  };
});
beforeEach(() => {
  writeFileSync(policyPath, policyBytes);
  writeReview(original);
});
afterAll(() => {
  if (previousModules === undefined) delete process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  else process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = previousModules;
  rmSync(root, { recursive: true });
});

test('complete check retains exact snapshot and original public verdict', () => {
  const request = {
    repository,
    candidate: { kind: 'committed' as const, revision },
    rulePolicyPath: policyPath,
  };
  const execution = executeCheckCandidate(request);
  expect(execution.verdict).toEqual(checkCandidate(request));
  expect(digestCandidate(execution.candidate)).toBe(execution.verdict.candidate);
  expect(execution.indexes.ok).toBe(true);
});

test('complete inventory and matrix retain YAML and extensionless executable with bounded judgments', async () => {
  const invocation = await runCoverage();
  expect(invocation.exitCode, invocation.stderr).toBe(1);
  const report = JSON.parse(invocation.stdout) as CoverageReport;
  expect(report.allowed).toBe(false);
  expect(report.certifies).toBe(false);
  expect(report.inventory).toEqual(original.inventory);
  expect(report.inventory.find((entry) => entry.path === 'bin/peer')?.mode).toBe('100755');
  expect(report.rows).toHaveLength(original.subjects.length * registeredRules().length);
  expect(new Set(report.rows.map((cell) => `${cell.subject.path}:${cell.ruleId}`)).size).toBe(
    report.rows.length,
  );
  for (const path of ['infra/config.yaml', 'bin/peer']) {
    expect(selectRow(report, path, 'INV-CLASSIFY').evaluation).toBe('evaluated');
    expect(selectRow(report, path, 'MOD-INDEX').evaluation).toBe('evaluated');
    expect(selectRow(report, path, 'MOD-INDEX').indexPaths).toEqual(['README.md']);
    for (const ruleId of ['F1', 'K2', 'REL-EXTRACT', 'MOD-LAYOUT']) {
      expect(selectRow(report, path, ruleId).evaluation).toBe('unevaluated');
      expect(selectRow(report, path, ruleId).attribution.kind).toBe('unavailable');
    }
    expect(selectRow(report, path, 'F7').evaluation).toBe('unevaluated');
  }
  expect(selectRow(report, 'src/entry.ts', 'MOD-INDEX').indexPaths).toEqual(['src/README.md']);
  expect(selectRow(report, 'src/entry.ts', 'F7').evaluation).toBe('evaluated');
  expect(selectRow(report, 'src/entry.ts', 'F7').attribution).toMatchObject({
    kind: 'exact-path',
    findings: [expect.objectContaining({ ruleId: 'F7', path: 'src/entry.ts' })],
  });
  expect(selectRow(report, 'infra/config.yaml', 'INV-CLASSIFY').attribution.kind).toBe(
    'unavailable',
  );
  expect(selectRow(report, 'infra/config.yaml', 'MOD-INDEX').attribution.kind).toBe('unavailable');
  expect(selectRow(report, 'README.md', 'MOD-DIRECT-ENTRIES').evaluation).toBe('evaluated');
  expect(selectRow(report, 'src/README.md', 'MOD-DIRECT-ENTRIES').indexPaths).toEqual([
    'src/README.md',
  ]);
  expect(selectRow(report, 'bin/peer', 'MOD-DIRECT-ENTRIES').evaluation).toBe('unevaluated');
  expect(report.verdict).toEqual(
    checkCandidate({
      repository,
      candidate: { kind: 'committed', revision },
      rulePolicyPath: policyPath,
    }),
  );
});

for (const path of ['infra/config.yaml', 'bin/peer']) {
  test(`production command refuses omitted inventory tuple ${path}`, async () => {
    const authority = cloneReview();
    authority.inventory = authority.inventory.filter((entry) => entry.path !== path);
    writeReview(authority);
    await expectRefusal('coverage inventory differs');
  });
}
for (const key of [
  'policyDigest',
  'adoptedSetDigest',
  'registryDigest',
  'runtimeDigest',
] as const) {
  test(`production command refuses mismatched ${key}`, async () => {
    const authority = cloneReview();
    authority[key] = '0'.repeat(64);
    writeReview(authority);
    await expectRefusal(`coverage ${key} mismatch`);
  });
}
for (const key of ['revision', 'tree', 'digest'] as const) {
  test(`production command refuses mismatched candidate ${key}`, async () => {
    const authority = cloneReview();
    authority.candidate[key] = '0'.repeat(key === 'digest' ? 64 : 40);
    writeReview(authority);
    await expectRefusal(`coverage candidate ${key} mismatch`);
  });
}
for (const fault of ['absent', 'repeated', 'changed'] as const) {
  test(`production command refuses ${fault} subject`, async () => {
    const authority = cloneReview();
    if (fault === 'absent')
      authority.subjects.push({ ...selectSubject('bin/peer'), path: 'absent' });
    if (fault === 'repeated') authority.subjects.push(selectSubject('bin/peer'));
    if (fault === 'changed')
      authority.subjects[0] = { ...authority.subjects[0], blob: '0'.repeat(40) };
    writeReview(authority);
    await expectRefusal('coverage subject');
  });
}
function createExclusion(ruleId = 'F7', code = 'outside-size-input', path = 'bin/peer') {
  return {
    subject: selectSubject(path),
    ruleId,
    code,
    reason: 'Outside the concrete measurement contract.',
    reviewer: 'reviewer.fixture',
    reference: 'review:fixture',
  };
}
test('reviewed inapplicability is attributed not-run and cannot invent evaluation', async () => {
  const authority = cloneReview();
  authority.exclusions = [
    createExclusion(),
    createExclusion('MOD-DIRECT-ENTRIES', 'not-index-declaration'),
  ];
  writeReview(authority);
  const invocation = await runCoverage();
  expect(invocation.exitCode, invocation.stderr).toBe(1);
  const report = JSON.parse(invocation.stdout) as CoverageReport;
  expect(selectRow(report, 'bin/peer', 'F7').applicability).toBe('inapplicable');
  expect(selectRow(report, 'bin/peer', 'F7').evaluation).toBe('not-run');
});
for (const fault of [
  'unsupported-rule',
  'unsupported-code',
  'false-predicate',
  'changed-tuple',
  'duplicate',
  'evaluation-claim',
] as const) {
  test(`production command refuses exclusion ${fault}`, async () => {
    const authority = cloneReview();
    authority.exclusions = [createExclusion()];
    if (fault === 'unsupported-rule') authority.exclusions = [createExclusion('REL-EXTRACT')];
    if (fault === 'unsupported-code')
      authority.exclusions = [createExclusion('F7', 'reviewer-choice')];
    if (fault === 'false-predicate')
      authority.exclusions = [createExclusion('F7', 'outside-size-input', 'src/entry.ts')];
    if (fault === 'changed-tuple')
      authority.exclusions[0].subject = { ...selectSubject('bin/peer'), mode: '100644' };
    if (fault === 'duplicate') authority.exclusions.push(createExclusion());
    if (fault === 'evaluation-claim')
      Reflect.set(authority.exclusions[0], 'evaluation', 'evaluated');
    writeReview(authority);
    await expectRefusal(
      fault === 'evaluation-claim'
        ? 'evaluation'
        : fault === 'unsupported-rule' || fault === 'unsupported-code'
          ? 'coverage exclusion code is unsupported'
          : fault === 'false-predicate'
            ? 'coverage exclusion predicate is false'
            : fault === 'changed-tuple'
              ? 'coverage exclusion subject is not selected exactly'
              : 'coverage exclusion repeated',
    );
  });
}
for (const authority of ['policy', 'review'] as const) {
  for (const fault of ['missing', 'unreadable', 'malformed'] as const) {
    test(`production command refuses ${fault} ${authority} authority`, async () => {
      const path = authority === 'policy' ? policyPath : reviewPath;
      if (fault === 'missing') rmSync(path);
      if (fault === 'unreadable') chmodSync(path, 0);
      if (fault === 'malformed') writeFileSync(path, '{');
      try {
        await expectRefusal(authority === 'policy' ? 'rule policy' : 'coverage review');
      } finally {
        if (fault === 'unreadable') chmodSync(path, 0o600);
      }
    });
  }
}
test('production command refuses missing registry mode', async () => {
  const policy = JSON.parse(policyBytes) as { ruleModes: { ruleId: string }[] };
  policy.ruleModes = policy.ruleModes.filter(({ ruleId }) => ruleId !== 'INV-CLASSIFY');
  writeFileSync(policyPath, JSON.stringify(policy));
  await expectRefusal('rule policy states no mode for INV-CLASSIFY');
});
test('production command requires explicit adopted set', async () => {
  const policy = JSON.parse(policyBytes) as Record<string, unknown>;
  Reflect.deleteProperty(policy, 'adoptedSet');
  writeFileSync(policyPath, JSON.stringify(policy));
  await expectRefusal('coverage requires an explicit adopted set');
});
test('production CLI refuses operand and selector drift', async () => {
  for (const argv of [
    ['inspect-evaluation-coverage'],
    ['inspect-evaluation-coverage', repository, revision, policyPath, reviewPath, '--rule', 'F7'],
    ['inspect-evaluation-coverage', repository, revision.slice(0, 8), policyPath, reviewPath],
  ]) {
    const invocation = await invokeCli(argv);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('usage: twilight-burokrat inspect-evaluation-coverage');
  }
});

for (const field of ['mode', 'blob'] as const) {
  test(`production command refuses changed inventory ${field}`, async () => {
    const authority = cloneReview();
    const selected = authority.inventory.find((entry) => entry.path === 'bin/peer');
    if (selected === undefined) throw new Error('fixture executable absent');
    if (field === 'mode') selected.mode = '100644';
    else selected.blob = '0'.repeat(40);
    writeReview(authority);
    await expectRefusal('coverage inventory differs');
  });
}
for (const authority of ['policy', 'review'] as const) {
  test(`production command refuses candidate-contained ${authority}`, async () => {
    const internal = join(repository, 'authority.json');
    writeFileSync(internal, readFileSync(authority === 'policy' ? policyPath : reviewPath));
    try {
      const invocation = await invokeCli([
        'inspect-evaluation-coverage',
        repository,
        revision,
        authority === 'policy' ? internal : policyPath,
        authority === 'review' ? internal : reviewPath,
      ]);
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stdout).toBe('');
      expect(invocation.stderr).toContain(
        `${authority === 'policy' ? 'rule policy' : 'coverage review'} resolves inside selected candidate`,
      );
    } finally {
      rmSync(internal);
    }
  });
}

test('production command refuses empty subjects', async () => {
  const authority = cloneReview();
  authority.subjects = [];
  writeReview(authority);
  await expectRefusal('coverage subjects must not be empty');
});

test('whole-rule failure never becomes evaluated subject classification', async () => {
  const policy = JSON.parse(policyBytes) as {
    classificationPolicy: { contentRules: { include: { kind: string; value: string }[] }[] };
  };
  for (const rule of policy.classificationPolicy.contentRules) {
    rule.include = rule.include.filter((selector) => selector.value !== '.yaml');
  }
  const bytes = JSON.stringify(policy);
  writeFileSync(policyPath, bytes);
  const authority = cloneReview();
  authority.policyDigest = hashBytes(new TextEncoder().encode(bytes));
  writeReview(authority);
  const invocation = await runCoverage();
  expect(invocation.exitCode).toBe(1);
  const report = JSON.parse(invocation.stdout) as CoverageReport;
  expect(selectRow(report, 'infra/config.yaml', 'INV-CLASSIFY').applicability).toBe('applicable');
  expect(selectRow(report, 'infra/config.yaml', 'INV-CLASSIFY').evaluation).toBe('unevaluated');
});

for (const path of ['infra/config.yaml', 'bin/peer']) {
  test(`production command refuses selected subject omission ${path} with complete inventory`, async () => {
    const authority = cloneReview();
    authority.subjects = authority.subjects.filter((entry) => entry.path !== path);
    writeReview(authority);
    await expectRefusal('coverage selected subjects differ');
  });
}
test('production command refuses unresolved scope selector', async () => {
  const authority = cloneReview();
  authority.selectors.push({ kind: 'prefix', value: 'absent' });
  writeReview(authority);
  await expectRefusal('coverage selector resolves no committed tuple');
});

test('actual bundled validator reports its executed bytes and unresolved exit status', async () => {
  const bundlePath = join(root, 'validator.mjs');
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, '../cli.ts')],
    target: 'bun',
    format: 'esm',
  });
  expect(built.success).toBe(true);
  const artifact = built.outputs[0];
  expect(built.outputs).toHaveLength(1);
  writeFileSync(bundlePath, new Uint8Array(await artifact.arrayBuffer()));
  const runtime = identifyCoverageRuntime(bundlePath);
  const authority = cloneReview();
  authority.runtimeDigest = runtime.digest;
  writeReview(authority);
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      bundlePath,
      'inspect-evaluation-coverage',
      repository,
      revision,
      policyPath,
      reviewPath,
    ],
    { stdout: 'pipe', stderr: 'pipe', env: { ...process.env } },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
  expect(invocation.stderr.toString()).toBe('');
  const report = JSON.parse(invocation.stdout.toString()) as CoverageReport & {
    runtime: typeof runtime;
  };
  expect(report.runtime).toEqual(runtime);
  expect(report.runtime.digest).not.toBe(original.runtimeDigest);
  expect(report.runtime.artifacts.map((entry) => entry.path)).toContain(bundlePath);
  expect(selectRow(report, 'infra/config.yaml', 'REL-EXTRACT').evaluation).toBe('unevaluated');
  expect(report.allowed).toBe(false);
  expect(report.certifies).toBe(false);
}, 60_000);

test('production command refuses missing F7 ceilings at the existing policy boundary', async () => {
  const policy = JSON.parse(policyBytes) as Record<string, unknown>;
  Reflect.deleteProperty(policy, 'sizeCeilings');
  writeFileSync(policyPath, JSON.stringify(policy));
  await expectRefusal('rule F7 needs policy.sizeCeilings, which the rule policy omits');
});

test('production command refuses an annotated-tag object SHA even with the correct reviewed target', async () => {
  runGit(
    'tag',
    '--annotate',
    'coverage-tag-fixture',
    '--message',
    'coverage annotated tag',
    revision,
  );
  const tagRevision = runGit('rev-parse', 'refs/tags/coverage-tag-fixture');
  expect(tagRevision).not.toBe(revision);
  expect(runGit('cat-file', '-t', tagRevision)).toBe('tag');
  const invocation = await invokeCli([
    'inspect-evaluation-coverage',
    repository,
    tagRevision,
    policyPath,
    reviewPath,
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('coverage input revision mismatch');
});
