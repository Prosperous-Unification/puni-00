import { Buffer } from 'node:buffer';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import type { CandidateEntry } from '../inventory/read-candidate';
import { resolveKinds, type ServiceKind } from './kinds';

const cliPath = join(import.meta.dir, '..', 'cli.ts');

function runCli(argv: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

/** `runCli` with an overridden child environment. `runCli` itself is unchanged. */
function runCliWithEnv(
  argv: string[],
  env: Record<string, string | undefined>,
): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: { ...process.env, ...env },
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
      'unknown rule: NO-SUCH-RULE (registered: F1, F7, INV-CLASSIFY, K2, K3, K4, K5, K6, MOD-DIRECT-ENTRIES, MOD-INDEX, MOD-LAYOUT, REL-EXTRACT)',
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

/** An indexed candidate whose single index declares 41 direct entries, one over the limit. */
function createDirectEntryDebtCandidate(): { repository: string; revision: string } {
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
  return { repository, revision: commit(repository, 'over the limit') };
}

/** A candidate whose `src` tree holds files of chosen line counts, for the size ratchet. */
function createSizedCandidate(
  sizes: Record<string, number>,
  roots: string[] = ['src'],
): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-sizes-');
  for (const [path, lines] of Object.entries(sizes)) {
    write(repository, path, 'export const value = 1;\n'.repeat(lines));
  }
  write(
    repository,
    'README.md',
    indexSource(
      'Sizes fixture',
      'module.sizes',
      roots.map((prefix) => ({ kind: 'directory-prefix', prefix, exclusions: [] })),
    ),
  );
  return { repository, revision: commit(repository, 'sized fixture') };
}

/** A candidate holding one kinded module under `src/m`, with the module's own files chosen. */
function createModuleCandidate(options: {
  moduleReadme?: string;
  contractMode?: 'regular' | 'symlink' | 'absent';
}): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-module-');
  write(repository, 'src/m/m.feature.ts', 'export const value = 1;\n');
  if (options.contractMode === 'regular')
    write(repository, 'src/m/contract.ts', 'export const c = 1;\n');
  if (options.contractMode === 'symlink') {
    write(repository, 'src/elsewhere.ts', 'export const e = 1;\n');
    symlinkSync('../elsewhere.ts', join(repository, 'src/m/contract.ts'));
  }
  if (options.moduleReadme !== undefined)
    write(repository, 'src/m/README.md', options.moduleReadme);
  write(
    repository,
    'README.md',
    indexSource('Module fixture', 'module.root', [
      { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
    ]),
  );
  return { repository, revision: commit(repository, 'module fixture') };
}

/** A candidate whose kinded module IS the candidate root. */
function createRootModuleCandidate(): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-root-module-');
  write(repository, 'a.feature.ts', 'export const value = 1;\n');
  write(repository, 'contract.ts', 'export const c = 1;\n');
  write(
    repository,
    'README.md',
    indexSource('Root module fixture', 'module.rootmodule', [
      { kind: 'path', path: 'a.feature.ts' },
      { kind: 'path', path: 'contract.ts' },
    ]),
  );
  return { repository, revision: commit(repository, 'root module fixture') };
}

/**
 * A candidate whose `src` tree holds the sources the caller supplies. It carries `nx.json`,
 * `package.json` and a `tsconfig.json`, because relationship extraction refuses a candidate with no
 * Nx workspace file and throws on any type error.
 */
function createKindedCandidate(sources: Record<string, string>): {
  repository: string;
  revision: string;
} {
  const repository = initRepository('twilight-rules-kinds-');
  write(repository, 'nx.json', '{"$schema":"./node_modules/nx/schemas/nx-schema.json"}\n');
  write(repository, 'package.json', '{"name":"kinds-fixture","private":true}\n');
  write(
    repository,
    'tsconfig.json',
    '{"compilerOptions":{"strict":true,"module":"ESNext","moduleResolution":"bundler","target":"ES2022"}}\n',
  );
  // The entrypoint exports a constant and imports nothing. The import graph comes from every file
  // the tsconfig includes, not from what the entrypoint reaches, so no test needs it to name a module.
  write(repository, 'src/entry.ts', 'export const entry = 1;\n');
  for (const [path, source] of Object.entries(sources)) write(repository, path, source);
  write(
    repository,
    'README.md',
    indexSource('Kinds fixture', 'module.kinds', [
      { kind: 'path', path: 'nx.json' },
      { kind: 'path', path: 'package.json' },
      { kind: 'path', path: 'tsconfig.json' },
      { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
    ]),
  );
  return { repository, revision: commit(repository, 'kinded fixture') };
}

/**
 * A trusted modules directory holding the real TypeScript runtime plus a minimal scoped package, so
 * a fixture can import `@tanstack/react-query` and have it resolve as an external library.
 */
function createTrustedModules(): string {
  const modules = scratch('twilight-rules-modules-');
  symlinkSync(
    join(import.meta.dir, '..', '..', '..', '..', '..', 'node_modules', 'typescript'),
    join(modules, 'typescript'),
  );
  mkdirSync(join(modules, '@tanstack', 'react-query'), { recursive: true });
  writeFileSync(
    join(modules, '@tanstack', 'react-query', 'package.json'),
    '{"name":"@tanstack/react-query","version":"0.0.0","types":"index.d.ts"}\n',
    'utf8',
  );
  writeFileSync(
    join(modules, '@tanstack', 'react-query', 'index.d.ts'),
    'export declare const useQuery: () => number;\n',
    'utf8',
  );
  return modules;
}

interface RuleModeEntry {
  ruleId: string;
  mode: 'observe' | 'ratchet' | 'enforce';
}

const everyRuleObserving: RuleModeEntry[] = [
  { ruleId: 'F1', mode: 'observe' },
  { ruleId: 'F7', mode: 'observe' },
  { ruleId: 'INV-CLASSIFY', mode: 'observe' },
  { ruleId: 'K2', mode: 'observe' },
  { ruleId: 'K3', mode: 'observe' },
  { ruleId: 'K4', mode: 'observe' },
  { ruleId: 'K5', mode: 'observe' },
  { ruleId: 'K6', mode: 'observe' },
  { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'observe' },
  { ruleId: 'MOD-INDEX', mode: 'observe' },
  { ruleId: 'MOD-LAYOUT', mode: 'observe' },
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
    plainTypeScriptPaths: [],
    sizeCeilings: { ceiling: 40, roots: ['src'], pinned: [] },
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

  test('refuses ratchet when the policy states no adopted set', () => {
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
      'rule policy sets INV-CLASSIFY to ratchet but states no adopted set',
    );
    expect(invocation.exitCode).toBe(1);
  }, 15_000);

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
    // Proof: the h2puni gate on fd0a777c timed this test out at 5025.16ms under Bun's 5-second
    // default (2026-09-20): it runs the production CLI five times in sequence, which fits locally
    // and not on a loaded build host.
  }, 20_000);
});

describe('ratchet mode', () => {
  test('reports ratchet debt outside the adopted set and allows the candidate', () => {
    const { repository, revision } = createDirectEntryDebtCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-DIRECT-ENTRIES' ? { ...entry, mode: 'ratchet' as const } : entry,
      ),
      { adoptedSet: { adoptedPrefixes: ['src'] } },
    );
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(true);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'MOD-DIRECT-ENTRIES',
        path: 'README.md',
        message: 'index declares 41 direct entries, limit 40',
        effect: 'debt',
      },
    ]);
  }, 15_000);

  test('refuses ratchet debt inside the adopted set', () => {
    const { repository, revision } = createDirectEntryDebtCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-DIRECT-ENTRIES' ? { ...entry, mode: 'ratchet' as const } : entry,
      ),
      { adoptedSet: { adoptedPrefixes: ['README.md'] } },
    );
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'MOD-DIRECT-ENTRIES',
        path: 'README.md',
        message: 'index declares 41 direct entries, limit 40',
        effect: 'refusal',
      },
    ]);
  }, 15_000);

  test('refuses an adopted set that repeats a prefix', () => {
    const { repository, revision } = createDirectEntryDebtCandidate();
    const policyPath = writeRulePolicy(everyRuleObserving, {
      adoptedSet: { adoptedPrefixes: ['src', 'src'] },
    });
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(stderrOf(invocation)).toContain('unique adopted prefixes');
    expect(invocation.exitCode).toBe(1);
  }, 15_000);
});

describe('F7 the size ratchet', () => {
  const ceilings = { ceiling: 40, roots: ['src'], pinned: [] };
  const checkF7 = (
    repository: string,
    revision: string,
    sizeCeilings?: Record<string, unknown>,
  ): ReturnType<typeof Bun.spawnSync> =>
    runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(everyRuleObserving, sizeCeilings === undefined ? {} : { sizeCeilings }),
      '--rule',
      'F7',
    ]);

  test('allows a candidate whose files are under the ceiling', () => {
    const { repository, revision } = createSizedCandidate({ 'src/small.ts': 10 });
    const invocation = checkF7(repository, revision, ceilings);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
    expect(verdictOf(invocation).unevaluated).toEqual([]);
  }, 15_000);

  test('allows a file exactly at the ceiling', () => {
    const { repository, revision } = createSizedCandidate({ 'src/exact.ts': 40 });
    const invocation = checkF7(repository, revision, ceilings);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 15_000);

  test('reports an unpinned file over the ceiling with both numbers', () => {
    const { repository, revision } = createSizedCandidate({ 'src/big.ts': 50 });
    const invocation = checkF7(repository, revision, ceilings);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'F7',
        path: 'src/big.ts',
        message: '50 lines exceeds the ceiling 40',
        effect: 'debt',
      },
    ]);
  }, 15_000);

  test('allows a pinned file under its pinned maximum', () => {
    const { repository, revision } = createSizedCandidate({ 'src/big.ts': 50 });
    const invocation = checkF7(repository, revision, {
      ...ceilings,
      pinned: [{ path: 'src/big.ts', maximum: 60 }],
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 15_000);

  test('reports a pinned file that has grown past its pin', () => {
    const { repository, revision } = createSizedCandidate({ 'src/big.ts': 50 });
    const invocation = checkF7(repository, revision, {
      ...ceilings,
      pinned: [{ path: 'src/big.ts', maximum: 45 }],
    });
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'F7',
        path: 'src/big.ts',
        message: '50 lines exceeds its pinned maximum 45',
        effect: 'debt',
      },
    ]);
  }, 15_000);

  test('reports a pinned file that has fallen under the ceiling', () => {
    const { repository, revision } = createSizedCandidate({ 'src/big.ts': 30 });
    const invocation = checkF7(repository, revision, {
      ...ceilings,
      pinned: [{ path: 'src/big.ts', maximum: 60 }],
    });
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'F7',
        path: 'src/big.ts',
        message: '30 lines is at or under the ceiling 40: remove the pin',
        effect: 'debt',
      },
    ]);
  }, 15_000);

  test('refuses a size policy that pins a file the candidate does not hold', () => {
    const { repository, revision } = createSizedCandidate({ 'src/small.ts': 10 });
    const invocation = checkF7(repository, revision, {
      ...ceilings,
      pinned: [{ path: 'src/gone.ts', maximum: 60 }],
    });
    expect(invocation.exitCode).toBe(1);
    expect(verdictOf(invocation).findings).toEqual([]);
    expect(verdictOf(invocation).unevaluated).toEqual([
      {
        ruleId: 'F7',
        reason: 'the size policy pins src/gone.ts, which the candidate does not measure',
      },
    ]);
  }, 15_000);

  test('measures neither a test file nor a declaration file', () => {
    const { repository, revision } = createSizedCandidate({
      'src/big.test.ts': 50,
      'src/big.d.ts': 50,
    });
    const invocation = checkF7(repository, revision, ceilings);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 15_000);

  test('measures nothing outside the declared roots', () => {
    const { repository, revision } = createSizedCandidate(
      { 'src/keep.ts': 10, 'src2/big.ts': 50 },
      ['src', 'src2'],
    );
    const invocation = checkF7(repository, revision, ceilings);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 15_000);

  test('refuses a size policy with no root, a repeated root or a repeated pin', () => {
    const { repository, revision } = createSizedCandidate({ 'src/small.ts': 10 });
    const emptyRoots = checkF7(repository, revision, { ...ceilings, roots: [] });
    expect(stderrOf(emptyRoots)).toContain('at least one measured root');
    expect(emptyRoots.exitCode).toBe(1);

    const repeatedRoots = checkF7(repository, revision, {
      ...ceilings,
      roots: ['src', 'src'],
    });
    expect(stderrOf(repeatedRoots)).toContain('unique measured roots');
    expect(repeatedRoots.exitCode).toBe(1);

    const repeatedPins = checkF7(repository, revision, {
      ...ceilings,
      pinned: [
        { path: 'src/small.ts', maximum: 60 },
        { path: 'src/small.ts', maximum: 70 },
      ],
    });
    expect(stderrOf(repeatedPins)).toContain('unique pinned paths');
    expect(repeatedPins.exitCode).toBe(1);
  }, 20_000);

  test('refuses F7 when the policy states no size ceilings', () => {
    const { repository, revision } = createSizedCandidate({ 'src/small.ts': 10 });
    const invocation = checkF7(repository, revision);
    expect(stderrOf(invocation)).toContain(
      'rule F7 needs policy.sizeCeilings, which the rule policy omits',
    );
    expect(invocation.exitCode).toBe(1);
  }, 15_000);
});

describe('kind resolution', () => {
  const kindEntry = (path: string): CandidateEntry => ({
    path,
    mode: '100644',
    blob: '0'.repeat(40),
  });
  const kindsOf = (paths: string[]): [string, ServiceKind, string][] =>
    resolveKinds(paths.map(kindEntry)).files.map((file) => [file.path, file.kind, file.module]);

  test('reads a kind from the filename suffix', () => {
    expect(kindsOf(['m/a.feature.ts', 'm/b.resource.ts', 'm/c.repository.ts'])).toEqual([
      ['m/a.feature.ts', 'feature', 'm'],
      ['m/b.resource.ts', 'resource', 'm'],
      ['m/c.repository.ts', 'repository', 'm'],
    ]);
  });

  test('does not read a kind from a test file', () => {
    const kinded = kindsOf(['m/a.feature.ts', 'm/a.feature.test.ts']);
    expect(kinded).toHaveLength(1);
    expect(kinded[0]?.[0]).toBe('m/a.feature.ts');
  });

  test("calls a file under a module's view directory delivery", () => {
    const nested = kindsOf(['m/a.feature.ts', 'm/view/panel.tsx', 'm/view/deep/row.tsx']);
    expect(nested).toContainEqual(['m/view/panel.tsx', 'delivery', 'm']);
    expect(nested).toContainEqual(['m/view/deep/row.tsx', 'delivery', 'm']);
    expect(nested).toHaveLength(3);

    const graph = resolveKinds(
      [
        'a.feature.ts',
        'composition.ts',
        'view/panel.tsx',
        'view/deep/row.tsx',
        'inner/b.feature.ts',
        'inner/view/x.tsx',
      ].map(kindEntry),
    );
    const moduleOfPath = (path: string): string | undefined =>
      graph.files.find((file) => file.path === path)?.module;
    expect(moduleOfPath('view/panel.tsx')).toBe('');
    expect(moduleOfPath('view/deep/row.tsx')).toBe('');
    expect(moduleOfPath('inner/view/x.tsx')).toBe('inner');
    expect(graph.compositionRoots).toEqual(['composition.ts']);
    expect(graph.files.map((file) => file.path)).not.toContain('composition.ts');
  });

  test('assigns a file to its nearest module', () => {
    const graph = resolveKinds(
      ['m/a.feature.ts', 'm/inner/b.feature.ts', 'm/inner/view/x.tsx'].map(kindEntry),
    );
    expect(graph.files.find((file) => file.path === 'm/inner/view/x.tsx')?.module).toBe('m/inner');
    expect(graph.moduleRoots).toEqual(['m', 'm/inner']);
  });
});

describe('MOD-LAYOUT', () => {
  const validModuleReadme = indexSource('M', 'module.m', [
    { kind: 'path', path: 'm.feature.ts' },
    { kind: 'path', path: 'contract.ts' },
  ]);
  const noContractModuleReadme = indexSource('M', 'module.m', [
    { kind: 'path', path: 'm.feature.ts' },
  ]);
  const checkLayout = (repository: string, revision: string): ReturnType<typeof Bun.spawnSync> =>
    runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(everyRuleObserving),
      '--rule',
      'MOD-LAYOUT',
    ]);

  test('allows a module that declares its index and its contract', () => {
    const { repository, revision } = createModuleCandidate({
      moduleReadme: validModuleReadme,
      contractMode: 'regular',
    });
    const invocation = checkLayout(repository, revision);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
    expect(verdictOf(invocation).unevaluated).toEqual([]);
  }, 15_000);

  test('allows a module at the candidate root', () => {
    const { repository, revision } = createRootModuleCandidate();
    const invocation = checkLayout(repository, revision);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
    expect(verdictOf(invocation).unevaluated).toEqual([]);
    expect(verdictOf(invocation).allowed).toBe(true);
  }, 15_000);

  test('names a module directory that declares no contract', () => {
    const { repository, revision } = createModuleCandidate({
      moduleReadme: noContractModuleReadme,
      contractMode: 'absent',
    });
    const invocation = checkLayout(repository, revision);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'MOD-LAYOUT',
        path: 'src/m',
        message: 'module directory declares no contract file',
        effect: 'debt',
      },
    ]);
  }, 15_000);

  test('names a module directory that declares no wiki index', () => {
    const { repository, revision } = createModuleCandidate({
      moduleReadme: '# Module\n\nOrdinary prose, no metadata.\n',
      contractMode: 'regular',
    });
    const invocation = checkLayout(repository, revision);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'MOD-LAYOUT',
        path: 'src/m',
        message: 'module directory declares no wiki index',
        effect: 'debt',
      },
    ]);
  }, 15_000);

  test('names a module whose contract is a symlink', () => {
    const { repository, revision } = createModuleCandidate({
      moduleReadme: validModuleReadme,
      contractMode: 'symlink',
    });
    const invocation = checkLayout(repository, revision);
    expect(verdictOf(invocation).findings.map((finding) => finding.message)).toContain(
      'module directory declares no contract file',
    );
  }, 15_000);

  test('refuses a candidate whose index metadata is malformed', () => {
    const { repository, revision } = createModuleCandidate({
      moduleReadme: '# M\n\n<!-- module-index {not json} -->\n',
      contractMode: 'regular',
    });
    const invocation = checkLayout(repository, revision);
    expect(invocation.exitCode).toBe(1);
    expect(verdictOf(invocation).findings).toEqual([]);
    expect(verdictOf(invocation).unevaluated).toHaveLength(1);
    expect(verdictOf(invocation).unevaluated[0]?.ruleId).toBe('MOD-LAYOUT');
    expect(verdictOf(invocation).unevaluated[0]?.reason).toStartWith(
      'the index report is unavailable: index metadata malformed',
    );
  }, 15_000);
});

describe('K3 and K4', () => {
  const checkDirection = (
    ruleId: 'K3' | 'K4',
    sources: Record<string, string>,
    env?: Record<string, string | undefined>,
  ): ReturnType<typeof Bun.spawnSync> => {
    const { repository, revision } = createKindedCandidate(sources);
    const argv = [
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving),
      '--rule',
      ruleId,
    ];
    return env === undefined ? runCli(argv) : runCliWithEnv(argv, env);
  };

  const repositorySource = 'export const store = { read: (): number => 1 };\n';

  test('names a feature-service that imports a repository', () => {
    const invocation = checkDirection('K3', {
      'src/m/m.repository.ts': repositorySource,
      'src/m/m.feature.ts':
        "import { store } from './m.repository';\nexport const run = (): number => store.read();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'K3',
        path: 'src/m/m.feature.ts',
        subject: 'src/m/m.repository.ts',
        message: "feature imports repository src/m/m.repository.ts through './m.repository'",
        effect: 'debt',
      },
    ]);
  }, 30_000);

  test('sees a repository through a barrel a feature imports', () => {
    const invocation = checkDirection('K3', {
      'src/m/m.repository.ts': repositorySource,
      'src/m/barrel.ts': "export * from './m.repository';\n",
      'src/m/m.feature.ts':
        "import { store } from './barrel';\nexport const run = (): number => store.read();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'K3',
        path: 'src/m/m.feature.ts',
        subject: 'src/m/m.repository.ts',
        message: "feature imports repository src/m/m.repository.ts through './barrel'",
        effect: 'debt',
      },
    ]);
  }, 30_000);

  test('names a feature-service that imports a delivery component', () => {
    const invocation = checkDirection('K3', {
      'src/m/view/panel.ts': 'export const panel = 1;\n',
      'src/m/m.feature.ts':
        "import { panel } from './view/panel';\nexport const run = (): number => panel;\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'K3',
        path: 'src/m/m.feature.ts',
        subject: 'src/m/view/panel.ts',
        message: "feature imports delivery src/m/view/panel.ts through './view/panel'",
        effect: 'debt',
      },
    ]);
  }, 30_000);

  test('allows a feature-service that imports a resource-service', () => {
    const invocation = checkDirection('K3', {
      'src/m/m.resource.ts': 'export const load = (): number => 1;\n',
      'src/m/m.feature.ts':
        "import { load } from './m.resource';\nexport const run = (): number => load();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
    expect(verdictOf(invocation).unevaluated).toEqual([]);
  }, 30_000);

  test('names a resource-service that imports a feature-service', () => {
    const invocation = checkDirection('K4', {
      'src/m/m.feature.ts': 'export const run = (): number => 1;\n',
      'src/m/m.resource.ts':
        "import { run } from './m.feature';\nexport const load = (): number => run();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'K4',
        path: 'src/m/m.resource.ts',
        subject: 'src/m/m.feature.ts',
        message: "resource imports feature src/m/m.feature.ts through './m.feature'",
        effect: 'debt',
      },
    ]);
  }, 30_000);

  test('exempts a composition root that imports every kind', () => {
    const invocation = checkDirection('K3', {
      'src/m/m.feature.ts': 'export const run = (): number => 1;\n',
      'src/m/m.resource.ts': 'export const load = (): number => 2;\n',
      'src/m/m.repository.ts': repositorySource,
      'src/m/composition.ts':
        "import { run } from './m.feature';\nimport { load } from './m.resource';\nimport { store } from './m.repository';\nexport const wired = (): number => run() + load() + store.read();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 30_000);

  test('refuses K3 when the trusted modules are unconfigured', () => {
    const invocation = checkDirection(
      'K3',
      {
        'src/m/m.repository.ts': repositorySource,
        'src/m/m.feature.ts':
          "import { store } from './m.repository';\nexport const run = (): number => store.read();\n",
      },
      { TOOL_WIKI_TRUSTED_NODE_MODULES: '' },
    );
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([
      { ruleId: 'K3', reason: 'trusted TypeScript runtime modules are not configured' },
    ]);
  }, 30_000);
});

describe('K2, K5, K6 and F1', () => {
  const relationshipRequest = {
    schemaVersion: 1,
    typescript: {
      configPaths: ['tsconfig.json'],
      publicEntrypoints: ['src/entry.ts'],
    },
  };
  const checkKindRule = (
    ruleId: 'F1' | 'K2' | 'K5' | 'K6',
    sources: Record<string, string>,
    policyPath = writeCompleteRulePolicy(everyRuleObserving),
    env?: Record<string, string | undefined>,
  ): ReturnType<typeof Bun.spawnSync> => {
    const { repository, revision } = createKindedCandidate(sources);
    const argv = ['check', 'committed', repository, revision, policyPath, '--rule', ruleId];
    return env === undefined ? runCli(argv) : runCliWithEnv(argv, env);
  };

  test('names a delivery component that imports a resource-service', () => {
    const invocation = checkKindRule('K2', {
      'src/m/m.resource.ts': 'export const load = (): number => 1;\n',
      'src/m/view/panel.ts':
        "import { load } from '../m.resource';\nexport const panel = (): number => load();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'K2',
        path: 'src/m/view/panel.ts',
        subject: 'src/m/m.resource.ts',
        message: "delivery imports resource src/m/m.resource.ts through '../m.resource'",
        effect: 'debt',
      },
    ]);
  }, 30_000);

  test('allows a delivery component that imports its feature-service', () => {
    const invocation = checkKindRule('K2', {
      'src/m/m.feature.ts': 'export const run = (): number => 1;\n',
      'src/m/view/panel.ts':
        "import { run } from '../m.feature';\nexport const panel = (): number => run();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 30_000);

  test('names a repository adapter that imports a resource-service', () => {
    const invocation = checkKindRule('K5', {
      'src/m/m.resource.ts': 'export const load = (): number => 1;\n',
      'src/m/m.repository.ts':
        "import { load } from './m.resource';\nexport const store = (): number => load();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toHaveLength(1);
    expect(verdictOf(invocation).findings[0]?.path).toBe('src/m/m.repository.ts');
  }, 30_000);

  test("names a feature that imports another module's feature", () => {
    const invocation = checkKindRule('K6', {
      'src/a/a.feature.ts': 'export const run = (): number => 1;\n',
      'src/b/b.feature.ts':
        "import { run } from '../a/a.feature';\nexport const call = (): number => run();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toHaveLength(1);
    expect(verdictOf(invocation).findings[0]).toMatchObject({
      path: 'src/b/b.feature.ts',
      message: 'feature in src/b imports feature in src/a',
    });
  }, 30_000);

  test('allows two files of one kind inside one module', () => {
    const invocation = checkKindRule('K6', {
      'src/m/one.feature.ts': 'export const run = (): number => 1;\n',
      'src/m/two.feature.ts':
        "import { run } from './one.feature';\nexport const call = (): number => run();\n",
    });
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 30_000);

  test('names a store the policy declares plain TypeScript', () => {
    const sources = {
      'src/m/m.feature.ts': 'export const run = (): number => 1;\n',
      'src/m/store.ts':
        "import type { ReactNode } from 'react';\nexport const s = (n: ReactNode): ReactNode => n;\n",
      'src/more/store.ts':
        "import type { ReactNode } from 'react';\nexport const s = (n: ReactNode): ReactNode => n;\n",
    };
    for (const plainTypeScriptPaths of [
      [{ kind: 'path', value: 'src/m/store.ts' }],
      [{ kind: 'prefix', value: 'src/m' }],
    ]) {
      const invocation = checkKindRule(
        'F1',
        sources,
        writeRulePolicy(everyRuleObserving, { relationshipRequest, plainTypeScriptPaths }),
      );
      expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
      expect(verdictOf(invocation).findings).toHaveLength(1);
      expect(verdictOf(invocation).findings[0]).toEqual({
        ruleId: 'F1',
        path: 'src/m/store.ts',
        subject: 'external:react',
        message: "declared plain TypeScript imports external:react through 'react'",
        effect: 'debt',
      });
      expect(verdictOf(invocation).unevaluated).toEqual([]);
    }
  }, 30_000);

  test('names a service that imports a scoped React package', () => {
    const policyPath = writeRulePolicy(everyRuleObserving, {
      relationshipRequest,
      plainTypeScriptPaths: [],
    });
    const invocation = checkKindRule(
      'F1',
      {
        'src/m/m.resource.ts':
          "import { useQuery } from '@tanstack/react-query';\nexport const r = (): number => useQuery();\n",
      },
      policyPath,
      { TOOL_WIKI_TRUSTED_NODE_MODULES: createTrustedModules() },
    );
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toHaveLength(1);
    expect(verdictOf(invocation).findings[0]).toMatchObject({
      subject: 'external:@tanstack/react-query',
      message: "resource imports external:@tanstack/react-query through '@tanstack/react-query'",
    });
  }, 30_000);

  test('exempts delivery from the framework boundary', () => {
    const invocation = checkKindRule(
      'F1',
      {
        'src/m/m.feature.ts': 'export const run = (): number => 1;\n',
        'src/m/view/panel.ts':
          "import type { ReactNode } from 'react';\nexport const panel = (node: ReactNode): ReactNode => node;\n",
      },
      writeRulePolicy(everyRuleObserving, {
        relationshipRequest,
        plainTypeScriptPaths: [],
      }),
    );
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([]);
  }, 30_000);

  test('refuses a plain TypeScript selector the candidate does not hold', () => {
    for (const plainTypeScriptPaths of [
      [{ kind: 'path', value: 'src/m/store.ts' }],
      [{ kind: 'prefix', value: 'src/stores' }],
    ]) {
      const invocation = checkKindRule(
        'F1',
        { 'src/m/m.feature.ts': 'export const run = (): number => 1;\n' },
        writeRulePolicy(everyRuleObserving, { relationshipRequest, plainTypeScriptPaths }),
      );
      expect(invocation.exitCode).toBe(1);
      expect(verdictOf(invocation).findings).toEqual([]);
      expect(verdictOf(invocation).unevaluated).toEqual([
        {
          ruleId: 'F1',
          reason:
            plainTypeScriptPaths[0]?.kind === 'path'
              ? 'the rule policy declares plain TypeScript at src/m/store.ts, which the candidate does not contain'
              : 'the rule policy declares plain TypeScript under src/stores, which covers no candidate file',
        },
      ]);
    }
  }, 30_000);

  test('prints the registry record for a kind rule', () => {
    createIndexedCandidate();
    const directionInvocation = runCli(['explain', 'K3']);
    expect(directionInvocation.exitCode, stderrOf(directionInvocation)).toBe(0);
    expect(JSON.parse(stdoutOf(directionInvocation)) as unknown).toEqual({
      id: 'K3',
      family: 'relationships',
      statement:
        'A feature-service imports resource-services and never a repository or delivery, through a barrel or directly.',
      source:
        'openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md#requirement-kind-direction-over-the-import-graph',
      inputs: ['candidate.entries', 'policy.relationshipRequest'],
    });
    const plainInvocation = runCli(['explain', 'F1']);
    expect(plainInvocation.exitCode, stderrOf(plainInvocation)).toBe(0);
    expect(verdictOf(plainInvocation).findings).toBeUndefined();
    expect((JSON.parse(stdoutOf(plainInvocation)) as { family: string }).family).toBe('code-shape');
  }, 15_000);

  test('refuses F1 when the policy declares no plain TypeScript paths', () => {
    const invocation = checkKindRule(
      'F1',
      { 'src/m/m.feature.ts': 'export const run = (): number => 1;\n' },
      writeRulePolicy(everyRuleObserving, { relationshipRequest }),
    );
    expect(stderrOf(invocation)).toContain(
      'rule F1 needs policy.plainTypeScriptPaths, which the rule policy omits',
    );
    expect(invocation.exitCode).toBe(1);
  }, 30_000);
});

describe('check production CLI', () => {
  test('allows the indexed candidate under an enforced module rule and never certifies', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-DIRECT-ENTRIES' || entry.ruleId === 'MOD-INDEX'
          ? { ...entry, mode: 'enforce' as const }
          : entry,
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
    // Three sequential production CLI runs took 3394.94ms in the same h2puni gate run, too close
    // to Bun's 5-second default to leave to the host's load.
  }, 15_000);
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
    const { repository, revision } = createDirectEntryDebtCandidate();
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
    const { repository, revision } = createDirectEntryDebtCandidate();
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
      'F1',
      'F7',
      'INV-CLASSIFY',
      'K2',
      'K3',
      'K4',
      'K5',
      'K6',
      'MOD-DIRECT-ENTRIES',
      'MOD-INDEX',
      'MOD-LAYOUT',
      'REL-EXTRACT',
    ]);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.allowed).toBe(true);
    expect(verdict.certifies).toBe(false);
    expect(verdict.policy).toBe('rules.test.v1');
  });
});
