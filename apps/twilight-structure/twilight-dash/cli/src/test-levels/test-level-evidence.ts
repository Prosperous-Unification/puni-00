import type { TestLevelJudgment } from './test-level-context';

const expectedBurokratVersion = '0.2.1';

function parseJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`malformed ${label} JSON`, { cause });
  }
}


/** Strict non-certifying Burokrat identity transport used before runner execution. */
export function decodeCandidateIdentity(invocation: TestLevelJudgment, revision: string): string {
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
  invocation: TestLevelJudgment,
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

