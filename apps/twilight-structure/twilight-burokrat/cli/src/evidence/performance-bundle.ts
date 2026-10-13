import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertWorkspacePath,
  decodePerformanceCases,
  decodePerformanceEvidence,
  decodePlaywrightReport,
  digestEvidenceBytes,
  digestPerformanceDeclaration,
  type PerformanceCases,
} from '@shared/test-evidence';
import { SaxesParser } from 'saxes';

import { readSelectedBlob } from '../inventory/read-blob';
import {
  type CandidateSnapshot,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { evaluatePerformanceRun } from './performance';

const pointerPath = 'tmp/junit/wbs-fe-01.performance.current.json';
const invocationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function decodeRecord(input: unknown, label: string): Record<string, unknown> {
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses nonrecord pointer".
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`Performance ${label} is malformed`);
  return input as Record<string, unknown>; // JSON record boundary checked above.
}
function decodeText(bytes: Uint8Array, label: string): string {
  try {
    // Proof: nonfatal decoding failed the malformed discovery UTF-8 production assertion.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Performance ${label} is not UTF-8`, { cause });
  }
}
function decodeJson(bytes: Uint8Array, label: string): unknown {
  const source = decodeText(bytes, label);
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    // Proof: rethrowing raw SyntaxError failed the malformed pointer JSON production assertion.
    throw new Error(`Performance ${label} JSON is malformed`, { cause });
  }
}
function resolveUnlinkedPath(root: string, path: string): string {
  assertWorkspacePath(path);
  let cursor = root;
  for (const segment of path.split('/')) {
    cursor = join(cursor, segment);
    // Proof: disabling this guard failed "[TEST-AXES-058] refuses symlink manifest.json".
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error(`Performance evidence contains a symlink: ${path}`);
  }
  return cursor;
}
function readRegularFile(root: string, path: string): Uint8Array {
  const absolute = resolveUnlinkedPath(root, path);
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses nonregular manifest.json".
  if (!lstatSync(absolute).isFile())
    throw new Error(`Performance evidence is not a regular file: ${path}`);
  return readFileSync(absolute);
}
/** A retained failure diagnostic invalidates a claimed current-success generation. */
function assertSuccessfulBundle(root: string, bundle: string): void {
  const absolute = resolveUnlinkedPath(root, bundle);
  try {
    lstatSync(join(absolute, 'failure.json'));
  } catch (cause) {
    // Proof: accepting every filesystem error as absence failed the unreadable-bundle CLI assertion.
    // Only diagnostic absence is expected; unreadable state remains a refusal.
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw new Error('Performance cannot inspect failure diagnostic absence', { cause });
  }
  throw new Error('Performance current-success publication contains a failure diagnostic');
}

function readCommittedBlob(repository: string, selected: CandidateSnapshot, path: string) {
  assertWorkspacePath(path);
  const entry = selected.entries.find((entry) => entry.path === path);
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses absent committed config even with working replacement".
  if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
    throw new Error(`Performance candidate source is not a regular blob: ${path}`);
  return {
    bytes: readSelectedBlob(repository, selected.entries, entry.blob, path),
    mode: entry.mode,
  };
}
function hasSameValue(left: unknown, right: unknown): boolean {
  return hashCanonical(left) === hashCanonical(right);
}
function sortCaseIdentities(
  cases: readonly { caseId: string; fixture: string; titlePath: string[] }[],
) {
  return cases
    .map(({ caseId, fixture, titlePath }) => ({ caseId, fixture, titlePath }))
    .sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
}
/** Strict normalized JUnit structure, exact declared identity and passing outcome/count parity. */
function reconcileJunit(source: string, declaration: PerformanceCases): void {
  const parser = new SaxesParser({ xmlns: false });
  const stack: string[] = [];
  let counts: Record<string, number> = {};
  const cases: { fixture: string; title: string; status: string }[] = [];
  let current: (typeof cases)[number] | undefined;
  parser.on('xmldecl', (declaration) => {
    // Proof: before this guard, the updated-digest ISO-8859-1 production fixture was accepted.
    if (declaration.encoding !== undefined && declaration.encoding.toUpperCase() !== 'UTF-8')
      throw new Error('Performance JUnit encoding differs from UTF-8');
  });
  parser.on('doctype', () => {
    // Proof: returning here failed the production JUnit doctype refusal.
    throw new Error('Performance JUnit doctype is forbidden');
  });
  const assertPermittedText = (body: string): void => {
    // Proof: disabling this guard failed "[TEST-AXES-059] refuses JUnit unexpected text".
    if (body.trim() !== '' && !['failure', 'skipped'].includes(stack.at(-1) ?? ''))
      throw new Error('Performance JUnit structure contains unexpected text');
  };
  parser.on('text', assertPermittedText);
  // Proof: removing this listener made the updated-digest foreign-CDATA production CLI test exit 0.
  parser.on('cdata', assertPermittedText);
  parser.on('opentag', (tag) => {
    const parent = stack.at(-1);
    if (tag.name === 'testsuite' && parent === undefined) {
      // Proof: disabling this guard failed "[TEST-AXES-059] refuses JUnit foreign root".
      if (
        tag.attributes['name'] !== 'wbs-fe-01.performance' ||
        Object.keys(tag.attributes).sort().join(',') !== 'errors,failures,name,skipped,tests'
      )
        throw new Error('Performance JUnit structure has foreign suite');
      counts = {};
      for (const key of ['tests', 'failures', 'errors', 'skipped']) {
        const raw = tag.attributes[key];
        // Proof: disabling this guard failed "[TEST-AXES-059] refuses JUnit malformed counts".
        if (
          typeof raw !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(raw) ||
          !Number.isSafeInteger(Number(raw))
        )
          throw new Error('Performance JUnit counts are malformed');
        counts[key] = Number(raw);
      }
    } else if (tag.name === 'testcase' && parent === 'testsuite') {
      const fixture = tag.attributes['file'];
      const title = tag.attributes['name'];
      // Proof: disabling this guard failed "[TEST-AXES-059] refuses JUnit foreign classname".
      if (
        typeof fixture !== 'string' ||
        typeof title !== 'string' ||
        tag.attributes['classname'] !== fixture ||
        Object.keys(tag.attributes).sort().join(',') !== 'classname,file,name'
      )
        throw new Error('Performance JUnit cases are malformed');
      assertWorkspacePath(fixture);
      current = { fixture, title, status: 'passed' };
      cases.push(current);
    } else if (
      (tag.name === 'failure' || tag.name === 'skipped') &&
      parent === 'testcase' &&
      current?.status === 'passed'
    )
      current.status = tag.name;
    else throw new Error('Performance JUnit structure is malformed');
    stack.push(tag.name);
  });
  parser.on('closetag', (tag) => {
    stack.pop();
    if (tag.name === 'testcase') current = undefined;
  });
  parser.write(source).close();
  const sort = (entries: typeof cases) =>
    entries.sort((left, right) =>
      compareCanonicalText(JSON.stringify(left), JSON.stringify(right)),
    );
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses JUnit case identity despite updated digest".
  if (
    !hasSameValue(
      sort(cases),
      sort(
        declaration.cases.map((performanceCase) => ({
          fixture: performanceCase.fixture,
          title: performanceCase.titlePath.join(' › '),
          status: 'passed',
        })),
      ),
    )
  )
    throw new Error('Performance JUnit cases differ from execution');
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses JUnit counts despite updated digest".
  if (
    counts['tests'] !== cases.length ||
    counts['failures'] !== 0 ||
    counts['errors'] !== 0 ||
    counts['skipped'] !== 0
  )
    throw new Error('Performance JUnit counts differ from execution');
}

/**
 * Inspects one stable current-success publication against committed sources and external review.
 * Raw historical checkout paths identify report structure only; no historical path is opened.
 * @throws when publication integrity, exact selection, measurements or JUnit parity fails.
 */
export function inspectPerformanceBundle(
  repository: string,
  revision: string,
  policyPath: string,
  hooks?: { afterBundleRead?: () => void },
) {
  // Proof: disabling this guard failed "[TEST-AXES-058] requires a full committed SHA".
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Performance inspection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const authority = loadRulePolicyWithIdentity(root, policyPath);
  const pin = authority.policy.performance;
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses absent external Performance authority".
  if (pin === undefined) throw new Error('Performance inspection needs policy.performance');
  const declaration = decodePerformanceCases(
    decodeJson(
      readCommittedBlob(root, selected, pin.declarationPath).bytes,
      'committed declaration',
    ),
  );
  const configDigest = digestEvidenceBytes(
    readCommittedBlob(root, selected, declaration.config).bytes,
  );
  const declarationDigest = digestPerformanceDeclaration(declaration);
  const sources = [...new Set(declaration.cases.map((performanceCase) => performanceCase.fixture))]
    .sort()
    .map((path) => {
      const source = readCommittedBlob(root, selected, path);
      return { path, digest: digestEvidenceBytes(source.bytes), mode: source.mode };
    });
  const pointerBytes = readRegularFile(root, pointerPath);
  const pointer = decodeRecord(decodeJson(pointerBytes, 'pointer'), 'pointer');
  const invocationId = pointer['invocationId'];
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses pointer path escape and symlinked bundle".
  if (
    typeof invocationId !== 'string' ||
    !invocationPattern.test(invocationId) ||
    pointer['schemaVersion'] !== 1 ||
    pointer['certifies'] !== false ||
    pointer['bundle'] !== `tmp/junit/performance/${invocationId}` ||
    Object.keys(pointer).sort().join(',') !== 'bundle,certifies,invocationId,schemaVersion'
  )
    throw new Error('Performance pointer identity differs');
  const bundle = `tmp/junit/performance/${invocationId}`;
  // Proof: removing this call accepted retained failure diagnostics in the production negative.
  assertSuccessfulBundle(root, bundle);
  const manifestBytes = readRegularFile(root, `${bundle}/manifest.json`);
  const manifest = decodeRecord(decodeJson(manifestBytes, 'manifest'), 'manifest');
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses foreign manifest revision".
  if (
    manifest['schemaVersion'] !== 1 ||
    manifest['certifies'] !== false ||
    manifest['invocationId'] !== invocationId ||
    manifest['revision'] !== revision ||
    manifest['candidate'] !== candidate ||
    manifest['policyDigest'] !== authority.digest ||
    manifest['declarationDigest'] !== declarationDigest ||
    manifest['configDigest'] !== configDigest ||
    Object.keys(manifest).sort().join(',') !==
      'candidate,certifies,collected,configDigest,declarationDigest,discovery,evidence,invocationId,policyDigest,report,revision,run,schemaVersion,selection'
  )
    throw new Error('Performance manifest identity differs from committed selection and policy');
  const artifacts: Record<string, { path: string; digest: string }> = {};
  const readArtifact = (field: 'discovery' | 'run' | 'evidence' | 'report'): Uint8Array => {
    const path = field === 'report' ? 'report.xml' : `${field}.json`;
    const binding = decodeRecord(manifest[field], `${field} binding`);
    const contents = readRegularFile(root, `${bundle}/${path}`);
    const digest = digestEvidenceBytes(contents);
    // Proof: disabling this guard failed "[TEST-AXES-058] recomputes discovery artifact digest".
    if (
      binding['path'] !== path ||
      binding['digest'] !== digest ||
      Object.keys(binding).sort().join(',') !== 'digest,path'
    )
      throw new Error(`Performance ${field} digest or path differs`);
    artifacts[field] = { path: `${bundle}/${path}`, digest };
    return contents;
  };
  const discoveryBytes = readArtifact('discovery');
  const runBytes = readArtifact('run');
  const evidenceBytes = readArtifact('evidence');
  const reportBytes = readArtifact('report');
  const evidence = decodePerformanceEvidence(decodeJson(evidenceBytes, 'evidence'));
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses evidence candidate conflict".
  if (
    evidence.candidate !== candidate ||
    evidence.policyDigest !== authority.digest ||
    evidence.declarationDigest !== declarationDigest
  )
    throw new Error('Performance evidence identity differs');
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses conflicting selection".
  if (!hasSameValue(manifest['selection'], evidence.selection))
    throw new Error('Performance manifest selection differs from evidence');
  const discovery = decodeRecord(decodeJson(discoveryBytes, 'discovery'), 'discovery');
  const rawConfig = decodeRecord(discovery['config'], 'discovery config');
  const configFile = rawConfig['configFile'];
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses foreign discovery config".
  if (typeof configFile !== 'string' || !configFile.endsWith(`/${declaration.config}`))
    throw new Error('Performance raw config differs from declaration');
  const checkout = configFile.slice(0, -declaration.config.length - 1);
  // Proof: disabling this guard failed "[TEST-AXES-058] refuses malformed historical checkout relative".
  if (
    !checkout.startsWith('/') ||
    checkout.includes('\\') ||
    checkout
      .split('/')
      .slice(1)
      .some((segment) => segment === '' || segment === '.' || segment === '..')
  )
    throw new Error('Performance raw checkout is malformed');
  const listed = decodePlaywrightReport(discovery, checkout, declaration, 'list', 0);
  const rawExecution = decodeRecord(decodeJson(runBytes, 'run'), 'execution');
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses raw foreign config despite updated digest".
  if (decodeRecord(rawExecution['config'], 'execution config')['configFile'] !== configFile)
    throw new Error('Performance raw config changed');
  const executed = decodePlaywrightReport(
    rawExecution,
    checkout,
    declaration,
    'run',
    evidence.run.exitCode,
  );
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses raw foreign runner version despite updated digest".
  if (
    listed.version !== executed.version ||
    listed.version !== evidence.selection.runnerVersion ||
    !hasSameValue(sortCaseIdentities(listed.cases), sortCaseIdentities(executed.cases))
  )
    throw new Error('Performance discovery and execution selection differ');
  const collected = manifest['collected'];
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses nonarray collected cases".
  if (!Array.isArray(collected))
    throw new Error('Performance manifest collected cases are malformed');
  const sortedCollected = collected
    .map((entry: unknown) => decodeRecord(entry, 'collected case'))
    .sort((left, right) => compareCanonicalText(hashCanonical(left), hashCanonical(right)));
  const expectedCollected = sortCaseIdentities(listed.cases).sort((left, right) =>
    compareCanonicalText(hashCanonical(left), hashCanonical(right)),
  );
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses collected case mismatch".
  if (!hasSameValue(sortedCollected, expectedCollected))
    throw new Error('Performance manifest collected cases differ from raw discovery');
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses raw failed status despite updated digest".
  if (!hasSameValue(evidence.run, executed.execution))
    throw new Error('Performance raw execution evidence differs');
  const judgments = evaluatePerformanceRun(
    declaration,
    executed.execution,
    { policy: authority.policy, policyDigest: authority.digest },
    evidence.selection,
  );
  // Proof: disabling this guard failed "[TEST-AXES-059] refuses selection jointly forged in policy and evidence against committed config".
  if (evidence.selection.configDigest !== configDigest)
    throw new Error('Performance committed selection differs from evidence');
  // Proof: disabling this guard failed "[TEST-AXES-059] success pointer refuses coherent failed execution".
  if (
    judgments.cases.length === 0 ||
    judgments.cases.some((performanceCase) => !performanceCase.passed)
  )
    throw new Error('Performance current-success publication contains unsuccessful cases');
  reconcileJunit(decodeText(reportBytes, 'report'), declaration);
  hooks?.afterBundleRead?.();
  // Proof: disabling this guard failed "[TEST-AXES-060] refuses current pointer race".
  if (!Buffer.from(readRegularFile(root, pointerPath)).equals(Buffer.from(pointerBytes)))
    throw new Error('Performance current pointer changed during inspection');
  const observation = {
    schemaVersion: 1 as const,
    kind: 'performance-publication' as const,
    revision,
    candidate,
    policyDigest: authority.digest,
    invocationId,
    declarationDigest,
    configDigest,
    selection: evidence.selection,
    selectionDigest: judgments.selectionDigest,
    artifacts: {
      manifest: { path: `${bundle}/manifest.json`, digest: digestEvidenceBytes(manifestBytes) },
      ...artifacts,
    },
    sources,
    observedCases: judgments.cases.sort((left, right) =>
      compareCanonicalText(left.caseId, right.caseId),
    ),
    // Proof: changing absent to claimed failed the stable-publication observation assertion.
    authentication: { kind: 'absent' as const },
    // Proof: changing false to true failed the stable-publication observation assertion.
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed the independent complete-payload digest assertion.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
