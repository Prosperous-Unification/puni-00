import { Buffer } from 'node:buffer';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const cliPath = join(import.meta.dir, '..', 'cli.ts');

function runCli(argv: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function stdoutOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stdout === undefined) throw new Error('stdout pipe was unavailable');
  return Buffer.from(invocation.stdout).toString('utf8');
}

function stderrOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stderr === undefined) throw new Error('stderr pipe was unavailable');
  return Buffer.from(invocation.stderr).toString('utf8');
}

describe('explain production CLI', () => {
  test('prints the registry record for a known rule', () => {
    const invocation = runCli(['explain', 'MOD-INDEX']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(JSON.parse(stdoutOf(invocation)) as unknown).toEqual({
      id: 'MOD-INDEX',
      family: 'modules',
      statement:
        'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
      source:
        'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md#requirement-module-index-declarations',
      inputs: ['candidate.entries'],
    });
  });

  test('refuses an unregistered rule identifier and names every registered rule', () => {
    const invocation = runCli(['explain', 'NO-SUCH-RULE']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'unknown rule: NO-SUCH-RULE (registered: INV-CLASSIFY, MOD-DIRECT-ENTRIES, MOD-INDEX, REL-EXTRACT)',
    );
  });
});

const scratchRoots: string[] = [];

interface CheckVerdict {
  schemaVersion: 1;
  candidate: string;
  policy: string;
  allowed: boolean;
  ruleIds: string[];
  findings: { ruleId: string; path: string; subject?: string; message: string; effect: string }[];
  unevaluated: { ruleId: string; reason: string }[];
  certifies: boolean;
}

function verdictOf(invocation: ReturnType<typeof Bun.spawnSync>): CheckVerdict {
  return JSON.parse(stdoutOf(invocation)) as CheckVerdict;
}

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function write(root: string, path: string, source: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

type Membership =
  | { kind: 'path'; path: string }
  | { kind: 'directory-prefix'; prefix: string; exclusions: string[] };

function indexSource(heading: string, moduleId: string, memberships: Membership[]): string {
  const metadata = {
    schemaVersion: 1,
    moduleId,
    memberships,
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'The fixture declares no non-derivable relationships.' },
      { section: 'invariants', reason: 'The fixture has no cross-file runtime invariant.' },
      { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
    ],
    externalConsumers: {
      kind: 'none-known',
      knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
    },
  };
  return `# ${heading}\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`;
}

function initRepository(prefix: string): string {
  const repository = scratch(prefix);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'rules@example.test']);
  runGit(repository, ['config', 'user.name', 'Rules Fixture']);
  return repository;
}

function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

/**
 * The canonical clean candidate. It carries `nx.json` and `package.json` because relationship
 * extraction refuses a candidate without an Nx workspace file, and one root index that declares
 * every root file and the `src` prefix. Verified to pass `check-indexes` with exit 0.
 */
function createIndexedCandidate(): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-candidate-');
  write(
    repository,
    'README.md',
    indexSource('Rules fixture', 'module.fixture', [
      { kind: 'path', path: 'nx.json' },
      { kind: 'path', path: 'package.json' },
      { kind: 'path', path: 'tsconfig.json' },
      { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
    ]),
  );
  write(repository, 'nx.json', '{"$schema":"./node_modules/nx/schemas/nx-schema.json"}\n');
  write(repository, 'package.json', '{"name":"rules-fixture","private":true}\n');
  write(
    repository,
    'tsconfig.json',
    '{"compilerOptions":{"strict":true,"module":"ESNext","moduleResolution":"bundler","target":"ES2022"}}\n',
  );
  write(repository, 'src/entry.ts', 'export const entry = 1;\n');
  return { repository, revision: commit(repository, 'rules fixture') };
}

/** A candidate with no module index at all: `checkIndexes` refuses it. */
function createUnindexedCandidate(): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-unindexed-');
  write(repository, 'orphan.ts', 'export const orphan = 1;\n');
  return { repository, revision: commit(repository, 'no index') };
}

interface RuleModeEntry {
  ruleId: string;
  mode: 'observe' | 'ratchet' | 'enforce';
}

const everyRuleObserving: RuleModeEntry[] = [
  { ruleId: 'INV-CLASSIFY', mode: 'observe' },
  { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'observe' },
  { ruleId: 'MOD-INDEX', mode: 'observe' },
  { ruleId: 'REL-EXTRACT', mode: 'observe' },
];

/** Writes a rule policy in its own scratch root, outside every candidate. */
function writeRulePolicy(ruleModes: RuleModeEntry[], extra: Record<string, unknown> = {}): string {
  const path = join(scratch('twilight-rules-policy-'), 'rule-policy.json');
  writeFileSync(
    path,
    `${JSON.stringify({ schemaVersion: 1, policyId: 'rules.test.v1', ruleModes, ...extra })}\n`,
    'utf8',
  );
  return path;
}

/** The complete policy: the shipped classification policy and a request the fixture satisfies. */
function writeCompleteRulePolicy(ruleModes: RuleModeEntry[], declarationPaths?: string[]): string {
  const shippedClassificationPolicyPath = join(
    import.meta.dir,
    '..',
    'contracts',
    'fixtures',
    'classification-policy.v1.json',
  );
  return writeRulePolicy(ruleModes, {
    classificationPolicy: JSON.parse(
      readFileSync(shippedClassificationPolicyPath, 'utf8'),
    ) as unknown,
    relationshipRequest: {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/entry.ts'] },
      ...(declarationPaths === undefined ? {} : { declarationPaths }),
    },
  });
}

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('rule policy boundary', () => {
  test('refuses a rule policy inside the worktree even when the repository argument is interior', () => {
    const { repository, revision } = createIndexedCandidate();
    const inside = join(repository, 'rule-policy.json');
    writeFileSync(
      inside,
      `${JSON.stringify({ schemaVersion: 1, policyId: 'rules.test.v1', ruleModes: everyRuleObserving })}\n`,
      'utf8',
    );
    const invocation = runCli([
      'check',
      'committed',
      join(repository, 'src'),
      revision,
      inside,
      '--rule',
      'MOD-INDEX',
    ]);
    // The diagnostic is asserted before the status throughout this describe: the faults of
    // section 2.4 lose the sentence while keeping a status that still looks right.
    expect(stderrOf(invocation)).toContain(
      `rule policy resolves inside selected candidate: ${inside}`,
    );
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a policy that states no mode for a registered rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.filter((entry) => entry.ruleId !== 'INV-CLASSIFY'),
    );
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain('rule policy states no mode for INV-CLASSIFY');
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a policy that names an unregistered rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy([
      ...everyRuleObserving,
      { ruleId: 'NO-SUCH-RULE', mode: 'observe' },
    ]);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain('rule policy names an unregistered rule: NO-SUCH-RULE');
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a policy that states a mode for one rule twice', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy([
      ...everyRuleObserving,
      { ruleId: 'MOD-INDEX', mode: 'enforce' },
    ]);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain('rule policy states a mode for MOD-INDEX twice');
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses ratchet until the adopted set exists', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'INV-CLASSIFY' ? { ...entry, mode: 'ratchet' as const } : entry,
      ),
    );
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain(
      'rule policy sets INV-CLASSIFY to ratchet, which has no adopted set until slice B2',
    );
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a selected rule whose policy input is absent', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(everyRuleObserving);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'INV-CLASSIFY',
    ]);
    // Under P8 the run still exits 1, because the registry reports the missing input as
    // unevaluated. Only this sentence tells the boundary from the fallback.
    expect(stderrOf(invocation)).toContain(
      'rule INV-CLASSIFY needs policy.classificationPolicy, which the rule policy omits',
    );
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses malformed, non-UTF-8, unreadable, absent and undeclared-key policies distinctly', () => {
    const { repository, revision } = createIndexedCandidate();
    const root = scratch('twilight-rules-bad-policy-');
    const malformed = join(root, 'malformed.json');
    writeFileSync(malformed, '{\n', 'utf8');
    const notUtf8 = join(root, 'not-utf8.json');
    writeFileSync(notUtf8, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
    const unreadable = writeRulePolicy(everyRuleObserving);
    const absent = join(root, 'absent.json');
    const undeclared = writeRulePolicy(everyRuleObserving, { unexpected: 1 });
    const run = (policyPath: string) =>
      runCli(['check', 'committed', repository, revision, policyPath, '--rule', 'MOD-INDEX']);

    const malformedInvocation = run(malformed);
    expect(stderrOf(malformedInvocation)).toContain(`malformed rule policy JSON ${malformed}`);
    expect(malformedInvocation.exitCode).toBe(1);

    const notUtf8Invocation = run(notUtf8);
    expect(stderrOf(notUtf8Invocation)).toContain(`rule policy ${notUtf8} is not UTF-8`);
    expect(notUtf8Invocation.exitCode).toBe(1);

    chmodSync(unreadable, 0o000);
    // A test process that can still read the file would prove nothing, so the fixture is
    // checked before it is used. Running as root is the case this catches.
    expect(() => readFileSync(unreadable, 'utf8')).toThrow();
    const unreadableInvocation = run(unreadable);
    chmodSync(unreadable, 0o600);
    expect(stderrOf(unreadableInvocation)).toContain(
      `cannot open rule policy ${unreadable}: EACCES`,
    );
    expect(unreadableInvocation.exitCode).toBe(1);

    const absentInvocation = run(absent);
    expect(stderrOf(absentInvocation)).toContain(`cannot open rule policy ${absent}: ENOENT`);
    expect(absentInvocation.exitCode).toBe(1);

    const undeclaredInvocation = run(undeclared);
    expect(stderrOf(undeclaredInvocation)).toContain('unexpected must be removed');
    expect(undeclaredInvocation.exitCode).toBe(1);
  });
});

describe('check production CLI', () => {
  test('allows the indexed candidate under an enforced module rule and never certifies', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy([
      { ruleId: 'INV-CLASSIFY', mode: 'observe' },
      { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'enforce' },
      { ruleId: 'MOD-INDEX', mode: 'enforce' },
      { ruleId: 'REL-EXTRACT', mode: 'observe' },
    ]);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(true);
    expect(verdict.certifies).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.policy).toBe('rules.test.v1');
    expect(verdict.ruleIds).toEqual(['MOD-INDEX']);
    expect(verdict.candidate).toMatch(/^[0-9a-f]{64}$/);
  });

  test('refuses an unindexed candidate in every mode and exits 1', () => {
    const { repository, revision } = createUnindexedCandidate();
    const observing = writeRulePolicy(everyRuleObserving);
    const observed = runCli([
      'check',
      'committed',
      repository,
      revision,
      observing,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(observed.exitCode).toBe(1);
    const observedVerdict = verdictOf(observed);
    expect(observedVerdict.allowed).toBe(false);
    expect(observedVerdict.findings).toEqual([]);
    expect(observedVerdict.unevaluated).toEqual([
      { ruleId: 'MOD-INDEX', reason: 'selected candidate contains no module indexes' },
    ]);

    const enforcing = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-INDEX' ? { ...entry, mode: 'enforce' as const } : entry,
      ),
    );
    const enforced = runCli([
      'check',
      'committed',
      repository,
      revision,
      enforcing,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(enforced.exitCode).toBe(1);
    expect(verdictOf(enforced).unevaluated).toEqual(observedVerdict.unevaluated);
  });

  test('refuses an unknown selection kind, an unknown flag and an unknown narrowed rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(everyRuleObserving);
    const badKind = runCli(['check', 'bogus', repository, revision, policyPath]);
    expect(stderrOf(badKind)).toContain(
      'usage: twilight-bureaucrat check <committed|staged|working>',
    );
    expect(badKind.exitCode).toBe(1);

    const badFlag = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--only',
      'MOD-INDEX',
    ]);
    expect(stderrOf(badFlag)).toContain('the only check flag is --rule <rule-id>: received --only');
    expect(badFlag.exitCode).toBe(1);

    const badRule = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'NO-SUCH-RULE',
    ]);
    expect(stderrOf(badRule)).toContain('unknown rule: NO-SUCH-RULE');
    expect(badRule.exitCode).toBe(1);
  });
});

describe('explain with a rule policy', () => {
  test('prints the policy identifier and the stated mode', () => {
    const { repository } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-INDEX' ? { ...entry, mode: 'enforce' as const } : entry,
      ),
    );
    const invocation = runCli(['explain', 'MOD-INDEX', repository, policyPath]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(JSON.parse(stdoutOf(invocation)) as unknown).toEqual({
      id: 'MOD-INDEX',
      family: 'modules',
      statement:
        'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
      source:
        'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md#requirement-module-index-declarations',
      inputs: ['candidate.entries'],
      policyId: 'rules.test.v1',
      mode: 'enforce',
    });
  });
});

describe('rule adapters over real candidates', () => {
  test('reports an index over the direct-entry limit with its exact counts', () => {
    const repository = initRepository('twilight-rules-debt-');
    const members = Array.from({ length: 41 }, (unused, index) => `src/module${String(index)}.ts`);
    for (const member of members) write(repository, member, 'export const value = 1;\n');
    write(
      repository,
      'README.md',
      indexSource(
        'Debt fixture',
        'module.debt',
        members.map((path) => ({ kind: 'path', path }) as const),
      ),
    );
    const revision = commit(repository, 'over the limit');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(everyRuleObserving),
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'MOD-DIRECT-ENTRIES',
        path: 'README.md',
        message: 'index declares 41 direct entries, limit 40',
        effect: 'debt',
      },
    ]);
  });

  test('turns direct-entry debt into a refusal under enforce', () => {
    const repository = initRepository('twilight-rules-debt-enforce-');
    const members = Array.from({ length: 41 }, (unused, index) => `src/module${String(index)}.ts`);
    for (const member of members) write(repository, member, 'export const value = 1;\n');
    write(
      repository,
      'README.md',
      indexSource(
        'Debt fixture',
        'module.debt',
        members.map((path) => ({ kind: 'path', path }) as const),
      ),
    );
    const revision = commit(repository, 'over the limit');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(
        everyRuleObserving.map((entry) =>
          entry.ruleId === 'MOD-DIRECT-ENTRIES' ? { ...entry, mode: 'enforce' as const } : entry,
        ),
      ),
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.map(({ effect }) => effect)).toEqual(['refusal']);
  });

  test('refuses a rule whose prerequisite failed, in observe mode', () => {
    const { repository, revision } = createUnindexedCandidate();
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(everyRuleObserving),
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([
      {
        ruleId: 'MOD-DIRECT-ENTRIES',
        reason: 'the index report is unavailable: selected candidate contains no module indexes',
      },
    ]);
  });

  test('refuses an unclassifiable entry in observe mode', () => {
    const { repository } = createIndexedCandidate();
    write(repository, 'src/unknown.zzz', 'unclassifiable\n');
    const revision = commit(repository, 'add an unclassifiable entry');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving),
      '--rule',
      'INV-CLASSIFY',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([
      {
        ruleId: 'INV-CLASSIFY',
        reason: 'ordinary content src/unknown.zzz matched 0 classification rules',
      },
    ]);
  });

  test('reports a declared relationship that the candidate leaves unresolved', () => {
    const { repository } = createIndexedCandidate();
    write(
      repository,
      'relationships.v1.json',
      `${JSON.stringify({
        schemaVersion: 1,
        declarationId: 'fixture.relationships',
        selectorVersion: 1,
        coverage: 'selected-facts-only',
        facts: [],
        edges: [
          {
            relationshipId: 'dynamic-shell-read',
            kind: 'reads',
            status: 'unresolved',
            // Both endpoints must be selected candidate paths: an endpoint the candidate does not
            // contain is refused before the unresolved list is built.
            source: { kind: 'path', path: 'package.json' },
            target: { kind: 'path', path: 'src/entry.ts' },
            reason: 'the shell computes the variable name at runtime',
          },
        ],
      })}\n`,
    );
    write(
      repository,
      'README.md',
      indexSource('Rules fixture', 'module.fixture', [
        { kind: 'path', path: 'nx.json' },
        { kind: 'path', path: 'package.json' },
        { kind: 'path', path: 'relationships.v1.json' },
        { kind: 'path', path: 'tsconfig.json' },
        { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
      ]),
    );
    const revision = commit(repository, 'declare an unresolved relationship');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving, ['relationships.v1.json']),
      '--rule',
      'REL-EXTRACT',
    ]);
    expect(invocation.exitCode, `${stdoutOf(invocation)}${stderrOf(invocation)}`).toBe(0);
    const verdict = verdictOf(invocation);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'REL-EXTRACT',
        path: '.',
        subject: 'dynamic-shell-read',
        message:
          'declared relationship is unresolved: the shell computes the variable name at runtime',
        effect: 'debt',
      },
    ]);
  });

  test('allows the canonical candidate under every registered rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving),
    ]);
    expect(invocation.exitCode, `${stdoutOf(invocation)}${stderrOf(invocation)}`).toBe(0);
    const verdict = verdictOf(invocation);
    // Without `--rule` every registered rule runs. An empty `ruleIds` with `allowed: true` is the
    // shape of a check that cannot fail, so the identifiers are asserted exactly.
    expect(verdict.ruleIds).toEqual([
      'INV-CLASSIFY',
      'MOD-DIRECT-ENTRIES',
      'MOD-INDEX',
      'REL-EXTRACT',
    ]);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.allowed).toBe(true);
    expect(verdict.certifies).toBe(false);
    expect(verdict.policy).toBe('rules.test.v1');
  });
});
