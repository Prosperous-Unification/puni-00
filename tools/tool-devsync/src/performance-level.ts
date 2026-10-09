import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  compareThreshold,
  decodePerformanceCases,
  digestPerformanceDeclaration,
} from '@shared/test-evidence';

import { decodePlaywrightReport } from './performance-playwright';

const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';
const evidencePath = 'tmp/junit/wbs-fe-01.performance.evidence.json';
const toolRoot = resolve(import.meta.dir, '../../..');
const burokratCli = join(toolRoot, 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts');
const playwrightCli = join(toolRoot, 'node_modules/playwright/cli.js');
const expectedBurokratVersion = '0.1.0';

interface Invocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function tracePerformance(stage: string): void {
  if (process.env['PUNI_PERFORMANCE_DEBUG'] === '1') {
    process.stderr.write(`[performance] ${stage}\n`);
  }
}

function invoke(argv: string[], cwd: string): Invocation {
  tracePerformance(
    `start ${argv[0]} ${argv.includes('--list') ? 'list' : argv.includes('--reporter=json') ? 'run' : ''}`,
  );
  const call = Bun.spawnSync(argv, { cwd, stdout: 'pipe', stderr: 'pipe', env: process.env });
  tracePerformance(
    `end ${argv[0]} exit=${String(call.exitCode)} stdout=${String(call.stdout.length)} stderr=${String(call.stderr.length)}`,
  );
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}

function invokeBurokrat(argv: string[]): Invocation {
  const trustedCwd = mkdtempSync(join(tmpdir(), 'puni-burokrat-cwd-'));
  try {
    const call = Bun.spawnSync(argv, {
      // Proof: replacing this empty external directory with the candidate directory
      // made the scratch bunfig preload create its forbidden sentinel during Burokrat.
      cwd: trustedCwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        HOME: trustedCwd,
        TMPDIR: tmpdir(),
        LANG: 'C.UTF-8',
      },
    });
    return {
      exitCode: call.exitCode,
      stdout: call.stdout.toString(),
      stderr: call.stderr.toString(),
    };
  } finally {
    rmSync(trustedCwd, { recursive: true, force: true });
  }
}

async function invokePlaywright(
  argv: string[],
  cwd: string,
  reportFile: string,
): Promise<Invocation> {
  // Proof: inheriting process.env made the scratch config consume injected PLAYWRIGHT_GREP;
  // the production fixture test then failed exact collection instead of measuring its case.
  const runtimeEnvironment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? cwd,
    TMPDIR: tmpdir(),
    LANG: 'C.UTF-8',
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
  };
  tracePerformance(`start playwright ${argv.includes('--list') ? 'list' : 'run'}`);
  const stdoutFile = await open(`${reportFile}.stdout`, 'w');
  const stderrFile = await open(`${reportFile}.stderr`, 'w');
  const child = Bun.spawn(argv, {
    cwd,
    stdout: stdoutFile.fd,
    stderr: stderrFile.fd,
    env: runtimeEnvironment,
  });
  const timeoutState = { expired: false };
  const timeout = setTimeout(() => {
    timeoutState.expired = true;
    child.kill('SIGKILL');
  }, 20_000);
  try {
    const exitCode = await child.exited;
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
    const [stdout, stderr] = await Promise.all([
      readFile(`${reportFile}.stdout`, 'utf8'),
      readFile(`${reportFile}.stderr`, 'utf8'),
    ]);
    // Proof: disabling this branch made the hung-child production test receive a missing
    // reporter-file error instead of the bounded timeout refusal after the child was killed.
    if (timeoutState.expired)
      throw new Error(
        `Playwright Performance ${argv.includes('--list') ? 'discovery' : 'execution'} timed out: ${stderr.trim()}`,
      );
    const reportBytes = await readFile(reportFile).catch((cause: unknown) => {
      throw new Error(
        `Playwright Performance JSON reporter output is unavailable: ${stderr.trim()}`,
        { cause },
      );
    });
    let report: string;
    try {
      // Proof: disabling fatal decoding made the actual malformed-byte reporter test
      // receive a later JSON parse error instead of the named UTF-8 refusal.
      report = new TextDecoder('utf-8', { fatal: true }).decode(reportBytes);
    } catch (cause) {
      throw new Error('Playwright Performance JSON reporter output is not valid UTF-8', { cause });
    }
    tracePerformance(
      `end playwright exit=${String(exitCode)} json=${String(report.length)} stdout=${String(stdout.length)} stderr=${String(stderr.length)}`,
    );
    return { exitCode, stdout: report, stderr };
  } finally {
    clearTimeout(timeout);
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
  }
}

function git(root: string, args: string[]): Invocation {
  return invoke(['git', '-C', root, ...args], root);
}

function requireGit(root: string, args: string[], purpose: string): string {
  const invocation = git(root, args);
  if (invocation.exitCode !== 0) {
    throw new Error(
      `Performance ${purpose} requires a committed Git candidate: ${invocation.stderr.trim()}`,
    );
  }
  return invocation.stdout.trim();
}

function assertUnflaggedIndex(root: string, phase: string): void {
  const entries = requireGit(root, ['ls-files', '-v', '-z'], `${phase} index`).split('\0');
  // Proof: with this guard removed, the assume-unchanged fixture scratch target
  // missed its named index-flags refusal and reached a later runner-exit refusal;
  // the skip-worktree fixture also reaches this production refusal.
  if (entries.some((entry) => entry !== '' && !entry.startsWith('H '))) {
    throw new Error(`Performance tracked input index flags changed ${phase}`);
  }
}

function assertCleanCandidate(root: string): string {
  const repository = requireGit(root, ['rev-parse', '--show-toplevel'], 'repository');
  // Proof: disabling root equality made the nested-candidate test reach the later
  // dirty-status refusal instead of rejecting the repository root mismatch.
  if (resolve(repository) !== resolve(root)) {
    throw new Error('Performance candidate root differs from its Git repository root');
  }
  const revision = requireGit(root, ['rev-parse', '--verify', 'HEAD^{commit}'], 'revision');
  const status = requireGit(
    root,
    ['status', '--porcelain', '--untracked-files=all'],
    'clean snapshot',
  );
  // Proof: disabling clean-candidate status made the dirty-root scratch target
  // unexpectedly succeed and emit a passing JUnit report.
  if (status !== '') throw new Error('Performance committed Git candidate is dirty');
  assertUnflaggedIndex(root, 'candidate snapshot');
  return revision;
}

async function assertPinnedCheckout(
  checkoutRoot: string,
  revision: string,
  declarationBytes: Buffer,
  configBytes: Buffer,
  phase: string,
): Promise<void> {
  // Proof: disabling pinned HEAD made the committed-checkout scratch test miss its
  // named revision refusal and reach a later Burokrat runner-exit refusal.
  if (requireGit(checkoutRoot, ['rev-parse', 'HEAD'], phase) !== revision) {
    throw new Error(`Performance checkout HEAD changed ${phase}`);
  }
  const status = requireGit(
    checkoutRoot,
    ['status', '--porcelain', '--untracked-files=all'],
    phase,
  );
  // Proof: disabling the status check made the dirty-run scratch target succeed and
  // emit a passing report despite an untracked file written during execution.
  if (status !== '') throw new Error(`Performance checkout changed ${phase}: ${status}`);
  const checkoutDeclaration = await readFile(join(checkoutRoot, declarationPath));
  const checkoutConfig = await readFile(join(checkoutRoot, configPath));
  // Proof: disabling byte equality made the content-masked config scratch test miss
  // its named input refusal and reach a later runner-exit refusal.
  if (!checkoutDeclaration.equals(declarationBytes) || !checkoutConfig.equals(configBytes)) {
    throw new Error(`Performance checkout inputs differ ${phase}`);
  }
  assertUnflaggedIndex(checkoutRoot, phase);
}

function parseJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`malformed ${label} JSON`, { cause });
  }
}

function hashBytes(bytes: Uint8Array | string): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

export function readIdentity(root: string, revision: string): string {
  const invocation = invokeBurokrat([
    process.execPath,
    'run',
    burokratCli,
    'candidate-identity',
    'committed',
    root,
    revision,
  ]);
  return decodeCandidateIdentity(invocation, revision);
}

/** Strict non-certifying Burokrat identity transport used before runner execution. */
export function decodeCandidateIdentity(invocation: Invocation, revision: string): string {
  // Proof: disabling the identity process-status check made the decoder accept an
  // exit-1 Burokrat identity body in the named unbound-identity test.
  if (invocation.exitCode !== 0)
    throw new Error(`Burokrat candidate identity unavailable: ${invocation.stderr.trim()}`);
  const record = parseJson(invocation.stdout, 'Burokrat candidate identity');
  if (
    typeof record !== 'object' ||
    record === null ||
    !('candidate' in record) ||
    !('certifies' in record) ||
    !('selection' in record)
  ) {
    throw new Error('Burokrat candidate identity is malformed');
  }
  const candidate = Reflect.get(record, 'candidate');
  const selection = Reflect.get(record, 'selection');
  // Proof: changing Burokrat's response version to 0.0.0 made the scratch production target
  // refuse before Playwright with this named tool-identity error.
  if (
    Reflect.get(record, 'tool') !== 'twilight-burokrat' ||
    Reflect.get(record, 'toolVersion') !== expectedBurokratVersion ||
    Reflect.get(record, 'schemaVersion') !== 1
  ) {
    throw new Error('Burokrat candidate identity tool version mismatch');
  }
  if (
    typeof candidate !== 'string' ||
    !/^[0-9a-f]{64}$/.test(candidate) ||
    Reflect.get(record, 'certifies') !== false ||
    typeof selection !== 'object' ||
    selection === null ||
    Reflect.get(selection, 'kind') !== 'committed' ||
    // Proof: disabling revision equality made the candidate-identity decoder accept
    // a different committed SHA in its named unbound-selection test.
    Reflect.get(selection, 'revision') !== revision
  ) {
    throw new Error('Burokrat candidate identity selection mismatch');
  }
  return candidate;
}

interface PerformanceFinding {
  ruleId: 'PERF-THRESHOLD';
  path: string;
  message: string;
  effect: 'debt' | 'refusal';
}

interface PerformanceVerdict {
  candidate: string;
  findings: PerformanceFinding[];
  unevaluated: { ruleId: 'PERF-THRESHOLD'; reason: string }[];
  allowed: boolean;
}

/** Requires the selected candidate and exactly one missing-run PERF obligation. */
export function assertPreflight(verdict: PerformanceVerdict, candidate: string): void {
  // Proof: disabling candidate equality made the selected-preflight test accept an
  // otherwise valid PERF obligation for a different candidate SHA.
  // Proof: disabling the missing-run reason made the preflight test accept a
  // different PERF refusal as authorization to start Playwright.
  if (
    verdict.candidate !== candidate ||
    verdict.findings.length !== 0 ||
    verdict.unevaluated.length !== 1 ||
    !verdict.unevaluated[0].reason.includes('run evidence is not supplied')
  ) {
    throw new Error(
      'Burokrat Performance preflight did not select the expected candidate and rule',
    );
  }
}

/** Strict transport boundary for the one selected Burokrat Performance rule. */
export function readVerdict(
  invocation: Invocation,
  phase: 'preflight' | 'run',
): PerformanceVerdict {
  // Proof: disabling this empty-output guard made the decoder return a generic JSON
  // parse refusal instead of the named unavailable Burokrat preflight result.
  if (invocation.stdout.trim() === '')
    throw new Error(`Burokrat Performance ${phase} unavailable: ${invocation.stderr.trim()}`);
  const verdict = parseJson(invocation.stdout, `Burokrat Performance ${phase}`);
  // Proof: disabling the record-shape guard made the empty-object decoder negative
  // fail at the later selected-rule shape check instead of its named malformed refusal.
  if (
    typeof verdict !== 'object' ||
    verdict === null ||
    !('candidate' in verdict) ||
    !('findings' in verdict) ||
    !('unevaluated' in verdict) ||
    !('allowed' in verdict) ||
    !('certifies' in verdict) ||
    !('ruleIds' in verdict) ||
    !('policy' in verdict) ||
    !('schemaVersion' in verdict)
  ) {
    throw new Error(`Burokrat Performance ${phase} verdict is malformed`);
  }
  const candidate = Reflect.get(verdict, 'candidate');
  const findings = Reflect.get(verdict, 'findings');
  const unevaluated = Reflect.get(verdict, 'unevaluated');
  const allowed = Reflect.get(verdict, 'allowed');
  const certifies = Reflect.get(verdict, 'certifies');
  const ruleIds = Reflect.get(verdict, 'ruleIds');
  if (
    typeof candidate !== 'string' ||
    !/^[0-9a-f]{64}$/.test(candidate) ||
    !Array.isArray(findings) ||
    !Array.isArray(unevaluated) ||
    typeof allowed !== 'boolean' ||
    certifies !== false ||
    // Proof: disabling schema-version equality made the malformed-verdict decoder test
    // accept schemaVersion 2 as a selected Performance verdict.
    verdict.schemaVersion !== 1 ||
    typeof verdict.policy !== 'string' ||
    verdict.policy === '' ||
    !Array.isArray(ruleIds) ||
    ruleIds.length !== 1 ||
    // Proof: disabling selected-rule identity made the malformed-verdict test accept
    // a MOD-INDEX result as the Performance verdict.
    ruleIds[0] !== 'PERF-THRESHOLD'
  ) {
    throw new Error(`Burokrat Performance ${phase} verdict shape is malformed`);
  }
  const selectedFindings: PerformanceFinding[] = findings.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Burokrat Performance ${phase} finding is malformed`);
    }
    const ruleId: unknown = Reflect.get(entry, 'ruleId');
    const path: unknown = Reflect.get(entry, 'path');
    const message: unknown = Reflect.get(entry, 'message');
    const effect: unknown = Reflect.get(entry, 'effect');
    // Proof: disabling finding shape/identity made the foreign MOD-INDEX finding
    // reach only a later exit-consistency refusal in the malformed-verdict test.
    if (
      ruleId !== 'PERF-THRESHOLD' ||
      typeof path !== 'string' ||
      path === '' ||
      typeof message !== 'string' ||
      message === '' ||
      (effect !== 'debt' && effect !== 'refusal')
    ) {
      throw new Error(`Burokrat Performance ${phase} finding is malformed`);
    }
    return { ruleId, path, message, effect };
  });
  const selectedUnevaluated: PerformanceVerdict['unevaluated'] = unevaluated.map(
    (entry: unknown) => {
      // Proof: disabling unevaluated-rule identity made a MOD-INDEX record reach only
      // the later exit-consistency refusal in the malformed-verdict test.
      const reason: unknown =
        typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'reason') : undefined;
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry) ||
        Reflect.get(entry, 'ruleId') !== 'PERF-THRESHOLD' ||
        typeof reason !== 'string' ||
        reason === ''
      ) {
        throw new Error(`Burokrat Performance ${phase} unevaluated rule is malformed`);
      }
      return { ruleId: 'PERF-THRESHOLD', reason };
    },
  );
  const expectedAllowed =
    selectedUnevaluated.length === 0 &&
    !selectedFindings.some((finding) => finding.effect === 'refusal');
  // Proof: disabling allowed/exit coherence made the malformed-verdict test accept
  // allowed:false with no refusal or unevaluated rule and process exit 0.
  if (
    allowed !== expectedAllowed ||
    (invocation.exitCode === 0) !== allowed ||
    (invocation.exitCode !== 0 && invocation.exitCode !== 1)
  ) {
    throw new Error(`Burokrat Performance ${phase} verdict and exit status disagree`);
  }
  return { candidate, findings: selectedFindings, unevaluated: selectedUnevaluated, allowed };
}

function checkPerformance(
  root: string,
  revision: string,
  policyPath: string,
  evidence?: string,
): Invocation {
  return invokeBurokrat([
    process.execPath,
    'run',
    burokratCli,
    'check',
    'committed',
    root,
    revision,
    policyPath,
    '--rule',
    'PERF-THRESHOLD',
    ...(evidence === undefined ? [] : ['--performance-evidence', evidence]),
  ]);
}

/** Exact case-level reconciliation between measured failures and Burokrat findings. */
export function assertPerformanceFindings(
  findings: readonly PerformanceFinding[],
  expectedFindings: readonly { path: string; message: string }[],
): void {
  const unmatched = [...expectedFindings];
  for (const finding of findings) {
    const position = unmatched.findIndex(
      (expected) => finding.path === expected.path && finding.message === expected.message,
    );
    // Proof: the old membership-only check accepted returned [A,A] for expected [A,B];
    // the two-case finding test failed until this one-to-one consumption was added.
    if (position < 0) {
      throw new Error('Burokrat Performance findings differ from measured failures');
    }
    unmatched.splice(position, 1);
  }
  // Proof: disabling this remaining-set check made the missing-finding decoder
  // negative accept a measured threshold failure with no Burokrat finding.
  if (unmatched.length !== 0) {
    throw new Error('Burokrat Performance findings differ from measured failures');
  }
}

export function xmlText(value: string): string {
  for (const character of value) {
    // String iteration yields one nonempty Unicode scalar or one lone surrogate.
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined)
      throw new Error('Performance JUnit identity contains an empty character');
    // Proof: disabling the XML 1.0 character guard made the measured bad-title target
    // unexpectedly succeed and emit a report containing U+0001.
    if (
      (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0xfffe ||
      codePoint === 0xffff
    ) {
      throw new Error('Performance JUnit identity contains an XML-forbidden character');
    }
  }
  return (
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
      // Proof: removing tab entity encoding made the measured whitespace-title XML
      // parser return a space instead of the title's tab; the round-trip test failed.
      .replaceAll('\t', '&#9;')
      .replaceAll('\n', '&#10;')
      .replaceAll('\r', '&#13;')
  );
}

/** Clears stale outputs and executes only the reviewed, committed Performance selection. */
export async function runPerformanceLevel(
  candidateRoot: string,
  rulePolicyPath?: string,
): Promise<void> {
  const report = join(candidateRoot, reportPath);
  const binding = join(candidateRoot, bindingPath);
  const evidenceFile = join(candidateRoot, evidencePath);
  await mkdir(join(candidateRoot, 'tmp/junit'), { recursive: true });
  // Proof: omitting this removal left the stale passing XML readable after no-cases refusal.
  await rm(report, { force: true });
  // Proof: omitting this removal left stale passing provenance readable after no-cases refusal.
  await rm(binding, { force: true });
  await rm(evidenceFile, { force: true });

  const declarationBytes = await readFile(join(candidateRoot, declarationPath));
  let source: string;
  try {
    // Proof: turning off fatal decoding made the invalid-byte production test receive a JSON
    // error containing U+FFFD instead of the named UTF-8 refusal.
    source = new TextDecoder('utf-8', { fatal: true }).decode(declarationBytes);
  } catch (error) {
    throw new Error('Performance declaration is not valid UTF-8', { cause: error });
  }
  const declaration = decodePerformanceCases(parseJson(source, 'Performance declaration'));
  // Proof: disabling this match made the changed-config production test fail with a later error.
  if (declaration.config !== configPath) {
    throw new Error(`Performance config identity mismatch: ${declaration.config}`);
  }
  const configBytes = await readFile(join(candidateRoot, configPath));
  // Proof: disabling this match made the changed-project production test fail with a later error.
  if (declaration.project !== 'chromium') {
    throw new Error(`Performance project identity mismatch: ${declaration.project}`);
  }
  // Proof: replacing this predicate with false made the empty-selection test miss no-cases.
  if (declaration.cases.length === 0) {
    throw new Error('no-cases: no performance fixtures declare thresholds');
  }

  const revision = assertCleanCandidate(candidateRoot);
  const selectedPolicyPath = rulePolicyPath ?? process.env['PUNI_PERFORMANCE_RULE_POLICY'];
  // Proof: disabling external-policy selection made the absent-policy scratch test
  // receive a generic resolve(undefined) TypeError instead of the named refusal.
  if (selectedPolicyPath === undefined || selectedPolicyPath === '') {
    throw new Error('Performance needs externally selected PUNI_PERFORMANCE_RULE_POLICY');
  }
  const policyPath = resolve(selectedPolicyPath);
  const policyBytes = await readFile(policyPath);
  const policyDigest = hashBytes(policyBytes);
  const candidate = readIdentity(candidateRoot, revision);
  const preflight = checkPerformance(candidateRoot, revision, policyPath);
  const preflightVerdict = readVerdict(preflight, 'preflight');
  assertPreflight(preflightVerdict, candidate);

  const archiveParent = await mkdtemp(join(tmpdir(), 'puni-performance-'));
  const checkoutRoot = join(archiveParent, 'candidate');
  let checkoutAdded = false;
  try {
    requireGit(
      candidateRoot,
      ['worktree', 'add', '--detach', checkoutRoot, revision],
      'immutable checkout',
    );
    checkoutAdded = true;
    await symlink(join(toolRoot, 'node_modules'), join(checkoutRoot, 'node_modules'), 'dir');
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'before discovery',
    );
    const listArguments = [
      'test',
      '--config',
      declaration.config,
      '--project',
      declaration.project,
      '--list',
      '--reporter=json',
    ];
    const runArguments = [
      'test',
      '--config',
      declaration.config,
      '--project',
      declaration.project,
      '--reporter=json',
    ];
    const listedInvocation = await invokePlaywright(
      ['node', playwrightCli, ...listArguments],
      checkoutRoot,
      join(archiveParent, 'list.json'),
    );
    // Proof: disabling this exit-status guard made the nonzero-discovery scratch target
    // continue into execution and miss its named discovery-failed refusal.
    if (listedInvocation.exitCode !== 0)
      throw new Error(`Playwright Performance discovery failed: ${listedInvocation.stderr.trim()}`);
    // Proof: disabling this empty-output guard made the zero-byte-reporter scratch
    // target fail at JSON parsing instead of its named no-JSON refusal.
    if (listedInvocation.stdout.trim() === '') {
      throw new Error(
        `Playwright Performance discovery emitted no JSON: ${listedInvocation.stderr.trim()}`,
      );
    }
    const listed = decodePlaywrightReport(
      parseJson(listedInvocation.stdout, 'Playwright discovery'),
      checkoutRoot,
      declaration,
      'list',
      0,
    );
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'after discovery',
    );
    // Proof: disabling this revision check made the discovery-commit scratch target
    // miss its named after-discovery candidate revision refusal.
    if (requireGit(candidateRoot, ['rev-parse', 'HEAD'], 'after discovery') !== revision) {
      throw new Error('Performance candidate revision changed after discovery');
    }
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'before execution',
    );
    const runInvocation = await invokePlaywright(
      ['node', playwrightCli, ...runArguments],
      checkoutRoot,
      join(archiveParent, 'run.json'),
    );
    const executed = decodePlaywrightReport(
      parseJson(runInvocation.stdout, 'Playwright execution'),
      checkoutRoot,
      declaration,
      'run',
      runInvocation.exitCode,
    );
    await assertPinnedCheckout(
      checkoutRoot,
      revision,
      declarationBytes,
      configBytes,
      'after execution',
    );
    // Proof: disabling this comparison made a run-version mutation produce a passing
    // target even though discovery used a different runner version.
    if (
      executed.version !== listed.version ||
      JSON.stringify(
        executed.cases.map((entry) => [entry.caseId, entry.fixture, entry.titlePath]),
      ) !==
        JSON.stringify(listed.cases.map((entry) => [entry.caseId, entry.fixture, entry.titlePath]))
    ) {
      throw new Error('Playwright discovery and execution selection changed');
    }
    // Proof: disabling the post-run candidate revision check made the committed-source
    // scratch test reach a later runner-exit refusal instead of its named revision error.
    if (requireGit(candidateRoot, ['rev-parse', 'HEAD'], 'post-run revision') !== revision) {
      throw new Error('Performance candidate revision changed during Playwright execution');
    }
    const evidence = {
      schemaVersion: 1,
      candidate,
      policyDigest,
      declarationDigest: digestPerformanceDeclaration(declaration),
      selection: {
        declarationPath,
        config: declaration.config,
        project: declaration.project,
        configDigest: hashBytes(configBytes),
        runnerVersion: listed.version,
        listArguments,
        runArguments,
        selectionEnvironment: {},
      },
      run: executed.execution,
    };
    const evidenceSource = `${JSON.stringify(evidence)}\n`;
    await writeFile(evidenceFile, evidenceSource);
    const checked = checkPerformance(candidateRoot, revision, policyPath, evidenceFile);
    const verdict = readVerdict(checked, 'run');
    // readVerdict already enforces the only permitted exit statuses and their
    // coherence with allowed/refusal, so the selected identity is checked here.
    // Proof: disabling candidate equality made the scratch altered-verdict target
    // unexpectedly succeed for a foreign candidate SHA.
    // Proof: disabling unevaluated refusal made the scratch altered-verdict target
    // unexpectedly succeed for an unmeasured PERF obligation.
    if (verdict.candidate !== candidate || verdict.unevaluated.length !== 0) {
      throw new Error(
        `Burokrat Performance judge refused the measured run: ${checked.stdout.trim()} ${checked.stderr.trim()}`,
      );
    }
    const failedCases = new Set<string>();
    const casesXml = declaration.cases
      .map((performanceCase) => {
        const execution = executed.execution.cases.find(
          (entry) => entry.caseId === performanceCase.caseId,
        );
        const observation = execution?.observations.find(
          (entry) => entry.measurement === performanceCase.measurement,
        );
        // The strict run parser binds one execution and observation per declared case.
        // Proof: removing its attachment cardinality guard made the actual
        // missing-measurement target reach `invalid Playwright JSON observation
        // attachment` instead of its named one-observation refusal.
        if (execution === undefined || observation === undefined)
          throw new Error(
            `Performance report case ${performanceCase.caseId} lacks execution evidence`,
          );
        const passed =
          execution.status === 'passed' &&
          compareThreshold({
            operator: performanceCase.operator,
            threshold: performanceCase.threshold,
            observation: observation.value,
          });
        if (!passed) failedCases.add(performanceCase.caseId);
        const failure = passed
          ? ''
          : `\n    <failure message="Performance case ${xmlText(performanceCase.caseId)} did not meet its reviewed threshold"/>\n  `;
        return `  <testcase classname="${xmlText(performanceCase.fixture)}" name="${xmlText(performanceCase.titlePath.join(' › '))}" file="${xmlText(performanceCase.fixture)}">${failure}</testcase>`;
      })
      .join('\n');
    const expectedFindings = declaration.cases
      .filter((performanceCase) => failedCases.has(performanceCase.caseId))
      .map((performanceCase) => ({
        path: performanceCase.fixture,
        message: `Performance case ${performanceCase.caseId} did not meet its reviewed threshold`,
      }));
    assertPerformanceFindings(verdict.findings, expectedFindings);
    const reportSource = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="wbs-fe-01.performance" tests="${String(declaration.cases.length)}" failures="${String(failedCases.size)}" errors="0" skipped="0">\n${casesXml}\n</testsuite>\n`;
    await writeFile(report, reportSource);
    await writeFile(
      binding,
      `${JSON.stringify({
        schemaVersion: 1,
        certifies: false,
        reason: 'report bytes are not yet verified by a trusted Burokrat consumer',
        invocationId: randomUUID(),
        candidate,
        revision,
        policyDigest,
        declarationDigest: evidence.declarationDigest,
        configDigest: evidence.selection.configDigest,
        selection: evidence.selection,
        collected: listed.cases.map(({ caseId, fixture, titlePath }) => ({
          caseId,
          fixture,
          titlePath,
        })),
        evidence: { path: evidencePath, digest: hashBytes(evidenceSource) },
        report: { path: reportPath, digest: hashBytes(reportSource) },
      })}\n`,
    );
    // Proof: before this branch emitted a failing report, the scratch threshold-breach test
    // found no JUnit at all; removing the nonzero exit would make the target accept that breach.
    if (failedCases.size > 0)
      throw new Error(`Performance threshold failure: ${[...failedCases].join(', ')}`);
  } finally {
    if (checkoutAdded)
      requireGit(
        candidateRoot,
        ['worktree', 'remove', '--force', checkoutRoot],
        'checkout cleanup',
      );
    await rm(archiveParent, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await runPerformanceLevel(process.cwd());
}
