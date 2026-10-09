import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, parse, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { checkIndexes } from '../indexes/check-indexes';
import { readCandidateBlob } from '../inventory/read-blob';
import {
  CandidateReadError,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { selectActiveSpecifications, type SpecInput } from '../rules/active-spec-selector';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { decodeScenarioJournal } from '../rules/scenario-command';
import { deriveScenarioIndex } from '../rules/scenarios';
import { evaluateSpecifications } from '../rules/specifications';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';

// Proof: widening this version made the CLI's unknown-version assertion fail on version 99.
const Version = type('1');
const Digest = type(/^[0-9a-f]{64}$/);
const Commit = type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const Instant = type(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const DateOnly = type(/^\d{4}-\d{2}-\d{2}$/);
const Id = type('string>=1');
const ExternalPath = type('string>=1');
// Proof: ignoring extra scope or module keys made the production CLI reviewed-scope assertion fail.
const Scope = type({
  requirementDigest: Digest,
  modules: type({ moduleId: Id, digest: Digest }).onUndeclaredKey('reject').array(),
}).onUndeclaredKey('reject');

/** Candidate declaration, validated against the effective B3 scenario before inspection returns. */
// Proof: ignoring extra disposition keys made the committed-record CLI assertion fail.
export const ManualDisposition = type({
  schemaVersion: Version,
  scenarioId: Id,
  title: Id,
  reason: Id,
  procedurePath: RelativePath,
  touchedModules: Id.array(),
}).onUndeclaredKey('reject');
/** Candidate procedure with ordered step records. */
// Proof: ignoring extra procedure keys made the committed-record CLI assertion fail.
export const ManualProcedure = type({
  schemaVersion: Version,
  scenarioId: Id,
  title: Id,
  // Proof: ignoring extra procedure-step keys made the production CLI nested-step assertion fail.
  steps: type({ stepId: Id, instruction: Id, expectedObservation: Id })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');
/** External run report; decoding alone does not establish a passing observation. */
// Proof: ignoring extra report keys made the report CLI assertion fail.
export const ManualReport = type({
  schemaVersion: Version,
  runId: Id,
  scenarioId: Id,
  title: Id,
  dispositionPath: RelativePath,
  dispositionDigest: Digest,
  procedureDigest: Digest,
  sourceRevision: Commit,
  reviewedScope: Scope,
  operator: Id,
  startedAt: Instant,
  completedAt: Instant,
  environmentPath: ExternalPath,
  environmentDigest: Digest,
  reviewApprovalPath: ExternalPath,
  acceptanceApprovalPath: ExternalPath,
  // Proof: ignoring extra report-step keys made the production CLI nested-step assertion fail.
  steps: type({ stepId: Id, outcome: "'passed'|'failed'|'skipped'", observation: Id })
    .onUndeclaredKey('reject')
    .array(),
  outcome: "'passed'|'failed'|'skipped'",
}).onUndeclaredKey('reject');
/** External observation of the tested environment. */
// Proof: ignoring extra environment keys made the external-record CLI assertion fail.
export const ManualEnvironment = type({
  schemaVersion: Version,
  observationId: Id,
  environmentId: Id,
  observedAt: Instant,
  sourceRevision: Commit,
  attributes: type.Record('string', 'string'),
}).onUndeclaredKey('reject');
/** External review of the candidate Manual declaration and procedure. */
// Proof: ignoring extra review keys made the external-record CLI assertion fail.
export const ManualReviewApproval = type({
  schemaVersion: Version,
  kind: "'disposition-review'",
  scenarioId: Id,
  dispositionDigest: Digest,
  procedureDigest: Digest,
  reviewedScope: Scope,
  reviewer: Id,
  reference: Id,
  reviewedAt: Instant,
  reviewBy: DateOnly,
}).onUndeclaredKey('reject');
/** External acceptance of the exact report and environment observation. */
// Proof: ignoring extra acceptance keys made the external-record CLI assertion fail.
export const ManualAcceptanceApproval = type({
  schemaVersion: Version,
  kind: "'report-acceptance'",
  runId: Id,
  reportDigest: Digest,
  environmentDigest: Digest,
  operator: Id,
  startedAt: Instant,
  completedAt: Instant,
  reviewer: Id,
  reference: Id,
  acceptedAt: Instant,
}).onUndeclaredKey('reject');

function utcInstant(value: string, subject: string, capturedNow: Date): number {
  const millis = Date.parse(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  // Proof: malformed and future timestamp CLI cases lose their named refusal if this guard is removed.
  if (
    !Number.isFinite(millis) ||
    new Date(millis).toISOString() !== canonical ||
    millis > capturedNow.getTime()
  )
    throw new Error(`${subject} is invalid or in the future: ${value}`);
  return millis;
}

function utcDate(value: string, subject: string): number {
  const millis = Date.parse(`${value}T00:00:00.000Z`);
  // Proof: an invalid review deadline loses its named refusal without this calendar guard.
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== value)
    throw new Error(`${subject} is not a valid UTC date: ${value}`);
  return millis;
}

/** Evaluates exact approval, binding, time and step evidence against the tested procedure. */
function evaluateManualChain(
  chain: {
    disposition: typeof ManualDisposition.infer;
    procedure: typeof ManualProcedure.infer;
    report: typeof ManualReport.infer;
    environment: typeof ManualEnvironment.infer;
    review: typeof ManualReviewApproval.infer;
    acceptance: typeof ManualAcceptanceApproval.infer;
    dispositionDigest: string;
    procedureDigest: string;
    reportDigest: string;
    environmentDigest: string;
  },
  capturedNow: Date,
): void {
  const { disposition, procedure, report, environment, review, acceptance } = chain;
  // Proof: repinned report identity CLI negatives fail their named assertions when this guard is removed.
  if (report.scenarioId !== disposition.scenarioId || report.title !== disposition.title)
    throw new Error('Manual report scenario differs from disposition');
  // Proof: a repinned whitespace run ID made the named CLI assertion fail when this guard was removed.
  if (report.runId.trim().length === 0) throw new Error('Manual report run ID is blank');
  // Proof: repinned report digest CLI negatives fail their named assertions when this guard is removed.
  if (report.dispositionDigest !== chain.dispositionDigest)
    throw new Error('Manual report disposition digest differs');
  // Proof: removing this join made the repinned report-procedure CLI assertion fail.
  if (report.procedureDigest !== chain.procedureDigest)
    throw new Error('Manual report procedure digest differs');
  // Proof: removing this join made the repinned review-scenario CLI assertion fail.
  if (review.scenarioId !== disposition.scenarioId)
    throw new Error('Manual review scenario differs');
  // Proof: removing this join made the repinned review-disposition CLI assertion fail.
  if (review.dispositionDigest !== chain.dispositionDigest)
    throw new Error('Manual review disposition digest differs');
  // Proof: removing this join made the repinned review-procedure CLI assertion fail.
  if (review.procedureDigest !== chain.procedureDigest)
    throw new Error('Manual review procedure digest differs');
  // Proof: removing this join made the repinned review-scope CLI assertion fail.
  if (hashCanonical(review.reviewedScope) !== hashCanonical(report.reviewedScope))
    throw new Error('Manual review scope differs from report');
  // Proof: removing this guard made the self-asserted review-identity CLI assertion fail.
  if (
    review.reviewer.trim().length === 0 ||
    review.reference.trim().length === 0 ||
    review.reviewer === report.operator
  )
    throw new Error('Manual review identity is self-asserted or blank');
  // Proof: removing this guard made the repinned blank-operator CLI assertion fail.
  if (report.operator.trim().length === 0) throw new Error('Manual report operator is blank');
  // Proof: removing this join made the repinned environment-digest CLI assertion fail.
  if (report.environmentDigest !== chain.environmentDigest)
    throw new Error('Manual report environment digest differs');
  // Proof: removing this guard made the blank environment-attributes CLI assertion fail.
  if (
    environment.observationId.trim().length === 0 ||
    environment.environmentId.trim().length === 0 ||
    Object.keys(environment.attributes).length === 0 ||
    Object.entries(environment.attributes).some(
      ([name, value]) => name.trim().length === 0 || value.trim().length === 0,
    )
  )
    throw new Error('Manual environment attributes or identity are blank');
  // Proof: removing this join made the repinned acceptance-report CLI assertion fail.
  if (acceptance.reportDigest !== chain.reportDigest)
    throw new Error('Manual acceptance report digest differs');
  // Proof: removing this join made the repinned acceptance-environment CLI assertion fail.
  if (acceptance.environmentDigest !== chain.environmentDigest)
    throw new Error('Manual acceptance environment digest differs');
  // Proof: removing this join made the repinned acceptance-run CLI assertion fail.
  if (acceptance.runId !== report.runId) throw new Error('Manual acceptance run differs');
  // Proof: removing this join made the repinned acceptance-operator CLI assertion fail.
  if (acceptance.operator !== report.operator)
    throw new Error('Manual acceptance operator differs');
  // Proof: removing this join made the repinned acceptance-times CLI assertion fail.
  if (acceptance.startedAt !== report.startedAt || acceptance.completedAt !== report.completedAt)
    throw new Error('Manual acceptance times differ');
  // Proof: removing this guard made the self-asserted acceptance-identity CLI assertion fail.
  if (
    acceptance.reviewer.trim().length === 0 ||
    acceptance.reference.trim().length === 0 ||
    acceptance.reviewer === report.operator
  )
    throw new Error('Manual acceptance identity is self-asserted or blank');
  const started = utcInstant(report.startedAt, 'Manual report startedAt', capturedNow);
  const completed = utcInstant(report.completedAt, 'Manual report completedAt', capturedNow);
  const accepted = utcInstant(acceptance.acceptedAt, 'Manual acceptance acceptedAt', capturedNow);
  const reviewed = utcInstant(review.reviewedAt, 'Manual review reviewedAt', capturedNow);
  utcInstant(environment.observedAt, 'Manual environment observedAt', capturedNow);
  // Proof: removing this guard made the reversed-run CLI assertion fail.
  if (started > completed) throw new Error('Manual run chronology is invalid');
  // Proof: removing this guard made the early-acceptance CLI assertion fail.
  if (completed > accepted) throw new Error('Manual acceptance chronology is invalid');
  const deadline = utcDate(review.reviewBy, 'Manual review deadline');
  // Proof: removing this guard made the deadline-before-review CLI assertion fail.
  if (deadline < Date.parse(new Date(reviewed).toISOString().slice(0, 10) + 'T00:00:00.000Z'))
    throw new Error('Manual review deadline predates review');
  // Proof: overdue review CLI negative loses its scenario/date refusal without this guard.
  if (capturedNow.toISOString().slice(0, 10) > review.reviewBy)
    throw new Error(`${disposition.scenarioId} review overdue on ${review.reviewBy}`);
  // Proof: missing, duplicate and extra report-step CLI negatives lose their named refusal without this exact comparison.
  if (
    report.steps.length !== procedure.steps.length ||
    report.steps.some((step, index) => step.stepId !== procedure.steps[index]?.stepId)
  )
    throw new Error('Manual report steps differ from ordered procedure');
  // Proof: failed and skipped report-step CLI negatives lose their named refusal without this guard.
  if (
    report.steps.some((step) => step.outcome !== 'passed' || step.observation.trim().length === 0)
  )
    throw new Error('Manual report step outcome is not a passing observation');
  // Proof: failed or skipped aggregate CLI negatives lose their named refusal without this guard.
  if (report.outcome !== 'passed')
    throw new Error('Manual report outcome differs from passing steps');
}

function assertCanonicalExternalPath(path: string, subject: string): void {
  // Proof: removing this guard made the named traversal CLI test fail its canonical-path assertion;
  // it fell through to the distinct report-pin mismatch instead of refusing this spelling here.
  if (!isAbsolute(path) || path !== resolve(path))
    throw new Error(`${subject} path is not canonical absolute: ${path}`);
}

function assertNoSymlink(path: string, subject: string): void {
  assertCanonicalExternalPath(path, subject);
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let cursor = root;
  for (const segment of absolute.slice(root.length).split(sep)) {
    if (segment.length === 0) continue;
    cursor = resolve(cursor, segment);
    let isSymlink: boolean;
    try {
      isSymlink = lstatSync(cursor).isSymbolicLink();
    } catch (cause) {
      // Proof: suppressing this error made an absent path fall through to a different reader;
      // the production missing-report assertion lost its named component and error code.
      throw new Error(
        `cannot inspect ${subject} ${cursor}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
    // Proof: removing this guard made the production symlink-report assertion fail.
    if (isSymlink) throw new Error(`${subject} contains a symlink: ${path}`);
  }
}

function readJson(bytes: Uint8Array, subject: string): unknown {
  let source: string;
  try {
    // Proof: replacing fatal decoding made the malformed-byte CLI negative lose its UTF-8 refusal.
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${subject} is not UTF-8`, { cause });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`malformed ${subject} JSON`, { cause });
  }
}

function readExternal(
  root: string,
  path: string,
  subject: string,
): { input: unknown; digest: string } {
  assertNoSymlink(path, subject);
  // Proof: a directory selected as the report made the named unreadable CLI negative fail without this refusal.
  let isFile: boolean;
  try {
    isFile = lstatSync(path).isFile();
  } catch (cause) {
    throw new Error(
      `cannot open ${subject} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (!isFile) throw new Error(`${subject} is not a regular file: ${path}`);
  // Proof: removing the stable reader's named open-error wrapper made the chmod-000
  // production CLI assertion lose `cannot open manual report` while EACCES still refused.
  const artifact = readExternalArtifact(root, path, subject);
  const input = readJson(artifact.bytes, subject);
  return { input, digest: hashBytes(artifact.bytes) };
}

function readCandidateRecord(
  repository: string,
  entries: readonly { path: string; mode: string; blob: string }[],
  path: string,
  subject: string,
): { input: unknown; digest: string } {
  const matches = entries.filter((entry) => entry.path === path);
  // Proof: absent and symlink candidate negatives lose their named blob refusal if this guard is removed.
  if (matches.length !== 1 || (matches[0]?.mode !== '100644' && matches[0]?.mode !== '100755'))
    throw new Error(`${subject} is absent or not a regular committed blob: ${path}`);
  const selected = matches[0];
  const bytes = readCandidateBlob(repository, selected.blob, path);
  const input = readJson(bytes, subject);
  return { input, digest: hashBytes(bytes) };
}

const ActiveMainSpec = /^openspec\/specs\/([a-z][a-z0-9-]*)\/spec\.md$/;
const ActiveChangeSpec =
  /^openspec\/changes\/([a-z][a-z0-9-]*)\/specs\/([a-z][a-z0-9-]*)\/spec\.md$/;

function gitText(repository: string, args: readonly string[], subject: string): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0)
    throw new Error(
      `cannot verify Manual ${subject}: ${invocation.stderr.toString('utf8').trim()}`,
    );
  return new TextDecoder('utf-8', { fatal: true }).decode(invocation.stdout).trim();
}

function gitPaths(repository: string, args: readonly string[], subject: string): string[] {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0)
    throw new Error(
      `cannot verify Manual ${subject}: ${invocation.stderr.toString('utf8').trim()}`,
    );
  // Proof: default BOM stripping made the U+FEFF-prefixed module side edit/revert CLI
  // report current; preserving the path byte identity makes it stale.
  const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    invocation.stdout,
  );
  if (decoded.length === 0) return [];
  // Proof: removing this terminator guard made the truncated-Git-output production CLI
  // assertion accept a side-branch path after dropping its final byte.
  if (!decoded.endsWith('\0')) throw new Error(`malformed Manual ${subject} paths`);
  return decoded.slice(0, -1).split('\0');
}

function historyRevisions(repository: string, tested: string, candidate: string): string[] {
  // Proof: disabling this guard made the shallow-clone CLI assertion lose its incomplete-history refusal.
  if (gitText(repository, ['rev-parse', '--is-shallow-repository'], 'source history') !== 'false')
    throw new Error('Manual source history is incomplete: shallow repository');
  const grafts = gitText(repository, ['rev-parse', '--git-path', 'info/grafts'], 'source history');
  // Proof: disabling this guard made the grafted-history CLI assertion fail.
  if (existsSync(resolve(repository, grafts)))
    throw new Error('Manual source history is incomplete: grafts present');
  const ancestry = Bun.spawnSync(
    ['git', '-C', repository, 'merge-base', '--is-ancestor', tested, candidate],
    {
      env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  // Proof: disabling this guard made the nonancestor CLI assertion lose its named refusal.
  if (ancestry.exitCode === 1)
    throw new Error(`Manual tested revision is not a candidate ancestor: ${tested}`);
  if (ancestry.exitCode !== 0)
    throw new Error(
      `cannot verify Manual source history: ${ancestry.stderr.toString('utf8').trim()}`,
    );
  // Proof: replacing full DAG traversal with first-parent traversal made the pretested
  // side-branch edit/revert CLI assertion report current instead of stale.
  const later = gitText(
    repository,
    [
      'rev-list',
      '--reverse',
      '--topo-order',
      '--full-history',
      '--missing=error',
      `${tested}..${candidate}`,
    ],
    'source history',
  );
  // Proof: removing this preflight made the reverted side-branch missing-blob CLI assertion fail.
  gitText(
    repository,
    ['rev-list', '--objects', '--missing=error', `${tested}..${candidate}`],
    'source objects',
  );
  // Proof: replacing every intermediate snapshot with only the tested and selected commits made
  // the module edit/revert CLI assertion report current instead of stale.
  return [tested, ...later.split('\n').filter((revision) => revision.length > 0)];
}

function sideBranchChanges(
  repository: string,
  revision: string,
  verifiedParentObjects: Set<string>,
): string[] {
  const line = gitText(
    repository,
    ['rev-list', '--parents', '-n', '1', revision],
    'side-branch parents',
  );
  const [commit, ...parents] = line.split(' ');
  // Proof: disabling this guard made the malformed-parent-output production CLI
  // lose its named refusal when Git returned `invalid-parent`.
  if (
    commit !== revision ||
    parents.some((parent) => !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(parent))
  )
    throw new Error(`malformed Manual side-branch parent list: ${revision}`);
  if (parents.length === 0)
    return gitPaths(
      repository,
      ['diff-tree', '--root', '--no-renames', '--name-only', '-r', '-z', revision],
      'side-branch changes',
    );
  // Proof: limiting this to the first parent made the pretested side-merge CLI assertion
  // report current; the second-parent module edge requires stale.
  return parents.flatMap((parent) => {
    gitText(repository, ['cat-file', '-e', `${parent}^{tree}`], 'side-branch parent tree');
    // Proof: deleting the older base module blob on the second parent of a pretested side
    // merge made the production CLI accept stale; this closure check now refuses it.
    if (!verifiedParentObjects.has(parent)) {
      gitText(
        repository,
        ['rev-list', '--objects', '--missing=error', parent],
        'side-branch parent objects',
      );
      verifiedParentObjects.add(parent);
    }
    return gitPaths(
      repository,
      ['diff-tree', '--no-renames', '--name-only', '-r', '-z', parent, revision],
      'side-branch changes',
    );
  });
}

function isAncestor(repository: string, ancestor: string, successor: string): boolean {
  const invocation = Bun.spawnSync(
    ['git', '-C', repository, 'merge-base', '--is-ancestor', ancestor, successor],
    { env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdout: 'pipe', stderr: 'pipe' },
  );
  if (invocation.exitCode !== 0 && invocation.exitCode !== 1)
    throw new Error(
      `cannot verify Manual source history: ${invocation.stderr.toString('utf8').trim()}`,
    );
  return invocation.exitCode === 0;
}

function selectedRequirement(
  repository: string,
  snapshot: ReturnType<typeof readCandidate>,
  scenarioId: string,
): { digest: string; title: string; capability: string } {
  const journal = readCandidateRecord(
    repository,
    snapshot.entries,
    'openspec/scenario-allocations.json',
    'Manual historical scenario journal',
  );
  const identity = deriveScenarioIndex(decodeScenarioJournal(journal.input)).get(scenarioId);
  // Proof: disabling this guard made the temporary-retirement CLI assertion fail.
  if (!identity?.active) throw new Error(`Manual historical scenario is not active: ${scenarioId}`);
  const specs: SpecInput[] = [];
  for (const entry of snapshot.entries) {
    const main = ActiveMainSpec.exec(entry.path);
    const change = ActiveChangeSpec.exec(entry.path);
    const capability = main?.[1] ?? change?.[2];
    if (capability === undefined) continue;
    // Proof: disabling this guard made the intermediate symlink-spec CLI assertion
    // lose its historical regular-blob refusal.
    if (entry.mode !== '100644' && entry.mode !== '100755')
      throw new Error(`Manual historical specification is not a regular blob: ${entry.path}`);
    const markdown = new TextDecoder('utf-8', { fatal: true }).decode(
      readCandidateBlob(repository, entry.blob, entry.path),
    );
    specs.push({
      path: entry.path,
      capability,
      markdown,
      digest: hashBytes(Buffer.from(markdown)),
      kind: main === null ? 'change' : 'main',
    });
  }
  const effective = selectActiveSpecifications(specs).effective;
  const matches = effective.flatMap((requirement) =>
    requirement.scenarios
      .filter((scenario) => scenario.id === scenarioId)
      .map((scenario) => ({ requirement, scenario })),
  );
  // Proof: disabling this guard made the intermediate two-requirement duplicate-ID
  // CLI assertion accept one arbitrary containing requirement.
  if (matches.length !== 1)
    throw new Error(`Manual historical scenario is ambiguous or absent: ${scenarioId}`);
  const match = matches[0];
  // Proof: disabling the title join made the intermediate journal-rename/spec-title
  // CLI assertion accept mismatched historical scenario identity.
  if (
    identity.title !== match.scenario.title ||
    identity.source.split('/').at(-2) !== match.requirement.capability
  )
    throw new Error(
      `Manual historical scenario journal differs from selected specification: ${scenarioId}`,
    );
  return {
    digest: match.requirement.digest,
    title: match.scenario.title,
    capability: match.requirement.capability,
  };
}

function moduleScope(
  repository: string,
  snapshot: ReturnType<typeof readCandidate>,
  moduleIds: readonly string[],
): { moduleId: string; digest: string }[] {
  // Proof: malformed intermediate index metadata makes the production Manual CLI refuse
  // before any touched-module digest can be inferred.
  const indexes = checkIndexes(repository, snapshot).indexes;
  const entries = new Map(snapshot.entries.map((entry) => [entry.path, entry]));
  return moduleIds.map((moduleId) => {
    const matches = indexes.filter((index) => index.moduleId === moduleId);
    // Proof: the unknown-touched-ID CLI case loses its tested-scope finding if this
    // missing-index branch is removed; a valid later removal is a stale scope difference.
    if (matches.length === 0) return { moduleId, digest: '' };
    if (matches.length !== 1) throw new Error(`ambiguous Manual module index: ${moduleId}`);
    const index = matches[0];
    // Proof: omitting the index's own tuple made the edited-index CLI assertion fail.
    const scope = [index.indexPath, ...index.members].sort(compareCanonicalText);
    const moduleEntries = scope.map((path) => {
      const entry = entries.get(path);
      if (entry === undefined) throw new Error(`incomplete Manual module membership: ${path}`);
      // Proof: forcing mode 100644 made the executable-mode CLI assertion report current.
      return { path, mode: entry.mode, blob: entry.blob };
    });
    return {
      moduleId,
      digest: hashCanonical({
        schemaVersion: 1,
        moduleId,
        indexPath: index.indexPath,
        entries: moduleEntries,
      }),
    };
  });
}

function evaluateSourceCurrency(
  repository: string,
  candidate: ReturnType<typeof readCandidate>,
  testedRevision: string,
  scenarioId: string,
  reviewedTitle: string,
  procedurePath: string,
  touchedModules: readonly string[],
  reviewedScope: typeof Scope.infer,
): { procedure: ReturnType<typeof readCandidateRecord>; currency: 'current' | 'stale' } {
  if (candidate.selection.kind !== 'committed')
    throw new Error('Manual source requires committed selection');
  const revisions = historyRevisions(repository, testedRevision, candidate.selection.revision);
  const expectedModules = [...touchedModules].sort();
  const reviewedModules = reviewedScope.modules.map((module) => module.moduleId).sort();
  // Proof: disabling the set equality made the omitted-scope CLI assertion lose its named refusal.
  if (hashCanonical(reviewedModules) !== hashCanonical(expectedModules))
    throw new Error('Manual reviewed module scope differs from touched modules');
  let testedProcedure: ReturnType<typeof readCandidateRecord> | undefined;
  let stale = false;
  const moduleDirectories = new Set<string>();
  let capability: string | undefined;
  const reviewedModuleDigests = hashCanonical(
    [...reviewedScope.modules].sort((left, right) =>
      compareCanonicalText(left.moduleId, right.moduleId),
    ),
  );
  const descendants: string[] = [];
  const sideBranches: string[] = [];
  for (const revision of revisions) {
    if (isAncestor(repository, testedRevision, revision)) descendants.push(revision);
    else sideBranches.push(revision);
  }
  for (const revision of descendants) {
    const snapshot = readCandidate(repository, { kind: 'committed', revision });
    const requirement = selectedRequirement(repository, snapshot, scenarioId);
    const procedure = readCandidateRecord(
      repository,
      snapshot.entries,
      procedurePath,
      'Manual historical procedure',
    );
    if (revision !== testedRevision && revision !== candidate.selection.revision) {
      let intermediate: typeof ManualProcedure.infer;
      try {
        // Proof: removing this parse made the intervening version-99 procedure CLI case
        // return stale instead of refusing malformed trusted history.
        intermediate = parseOrThrow(ManualProcedure, procedure.input);
      } catch (cause) {
        throw new Error('Manual historical procedure is malformed', { cause });
      }
      // Proof: disabling nonempty, duplicate-ID and blank-instruction branches separately
      // made their named intervening-procedure CLI assertions return stale.
      if (
        intermediate.steps.length === 0 ||
        new Set(intermediate.steps.map((step) => step.stepId)).size !== intermediate.steps.length ||
        intermediate.steps.some(
          (step) =>
            step.stepId.trim().length === 0 ||
            step.instruction.trim().length === 0 ||
            step.expectedObservation.trim().length === 0,
        )
      )
        throw new Error('Manual historical procedure steps are invalid');
      // Proof: comparing against the reviewed title refused a valid historical rename/revert;
      // disabling the same-revision join made the wrong-title CLI assertion return stale.
      if (intermediate.scenarioId !== scenarioId || intermediate.title !== requirement.title)
        throw new Error('Manual historical procedure scenario differs from selected specification');
    }
    const modules = moduleScope(repository, snapshot, touchedModules);
    for (const index of checkIndexes(repository, snapshot).indexes) {
      if (touchedModules.includes(index.moduleId))
        moduleDirectories.add(index.indexPath.slice(0, -'/README.md'.length));
    }
    if (testedProcedure === undefined) {
      testedProcedure = procedure;
      capability = requirement.capability;
      // Proof: disabling this guard made the historical-title CLI assertion fail.
      if (requirement.title !== reviewedTitle)
        throw new Error(
          `Manual historical scenario title differs from reviewed report: ${scenarioId}`,
        );
      // Proof: disabling the requirement and module comparisons separately made their repinned
      // tested-scope CLI assertions accept false reviewed digests.
      if (
        requirement.digest !== reviewedScope.requirementDigest ||
        hashCanonical(
          [...modules].sort((left, right) => compareCanonicalText(left.moduleId, right.moduleId)),
        ) !== reviewedModuleDigests
      )
        throw new Error('Manual reviewed source scope differs from tested revision');
    } else if (
      // Proof: disabling these comparisons made the requirement, procedure, and module-content
      // descendant CLI assertions each report current instead of stale.
      requirement.digest !== reviewedScope.requirementDigest ||
      procedure.digest !== testedProcedure.digest ||
      hashCanonical(
        [...modules].sort((left, right) => compareCanonicalText(left.moduleId, right.moduleId)),
      ) !== reviewedModuleDigests
    ) {
      stale = true;
    }
  }
  if (testedProcedure === undefined) throw new Error('Manual tested source history is absent');
  if (capability === undefined) throw new Error('Manual tested requirement capability is absent');
  const verifiedParentObjects = new Set<string>();
  for (const revision of sideBranches) {
    const changed = sideBranchChanges(repository, revision, verifiedParentObjects);
    // Proof: removing the touched-directory predicate made the pretested side-branch module
    // edit/revert CLI assertion report current. The README clause is conservative ownership scope.
    if (
      changed.some(
        (path) =>
          path === procedurePath ||
          path.endsWith('/README.md') ||
          path === 'README.md' ||
          (path.startsWith('openspec/') && path.endsWith(`/specs/${capability}/spec.md`)) ||
          [...moduleDirectories].some(
            (directory) => directory.length === 0 || path.startsWith(`${directory}/`),
          ),
      )
    )
      stale = true;
  }
  return { procedure: testedProcedure, currency: stale ? 'stale' : 'current' };
}

/** Inspects committed Manual records, approved tested scope and immutable source history. */
export function inspectManual(
  repository: string,
  revision: string,
  policyPath: string,
  reportPath: string,
  capturedNow: Date,
) {
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  if (selected.selection.kind !== 'committed')
    throw new Error('Manual requires committed selection');
  assertNoSymlink(policyPath, 'manual rule policy');
  const authority = loadRulePolicyWithIdentity(root, policyPath);
  const manual = authority.policy.manual;
  // Proof: removing this guard made the production absent-authority CLI negative accept an unreviewed report.
  if (manual === undefined) throw new Error('Manual needs external policy.manual');
  for (const [subject, pins] of [
    ['disposition', manual.dispositions],
    ['report', manual.reports],
    ['environment', manual.environments],
    ['approval', manual.approvals],
  ] as const) {
    // Proof: removing canonical pin validation let the alias-policy CLI assertion accept a
    // second spelling of the same external report path.
    if (subject !== 'disposition')
      for (const pin of pins) assertCanonicalExternalPath(pin.path, `Manual ${subject} pin`);
    const paths = pins.map((pin) => pin.path);
    // Proof: duplicating the report policy pin made its named CLI negative fail when this guard was removed.
    if (new Set(paths).size !== paths.length) throw new Error(`duplicate Manual ${subject} pin`);
  }
  const report = readExternal(root, reportPath, 'manual report');
  const reportRecord = parseOrThrow(ManualReport, report.input);
  const reportPins = manual.reports.filter((pin) => pin.path === reportPath);
  // Proof: changing or omitting the exact report pin made the CLI digest negative lose its refusal.
  if (reportPins.length !== 1 || reportPins[0]?.digest !== report.digest)
    throw new Error('Manual report differs from external policy pin');
  const disposition = readCandidateRecord(
    root,
    selected.entries,
    reportRecord.dispositionPath,
    'manual disposition',
  );
  // Proof: deleting this boundary makes the missing-reason CLI negative lose its named finding.
  if (
    typeof disposition.input !== 'object' ||
    disposition.input === null ||
    !('reason' in disposition.input)
  )
    throw new Error('Manual disposition reason is missing');
  const dispositionRecord = parseOrThrow(ManualDisposition, disposition.input);
  // Proof: missing and whitespace-only reason CLI negatives lose their named refusal without this guard.
  if (dispositionRecord.reason.trim().length === 0)
    throw new Error('Manual disposition reason is blank');
  const dispositionPins = manual.dispositions.filter(
    (pin) => pin.path === reportRecord.dispositionPath,
  );
  // Proof: changing or omitting the exact candidate disposition pin made the CLI identity negative lose its refusal.
  if (dispositionPins.length !== 1 || dispositionPins[0]?.digest !== disposition.digest)
    throw new Error('Manual disposition differs from external policy pin');
  // Proof: empty, repeated and whitespace-only touched-module CLI negatives exit 0 without this guard.
  if (
    dispositionRecord.touchedModules.length === 0 ||
    new Set(dispositionRecord.touchedModules).size !== dispositionRecord.touchedModules.length ||
    dispositionRecord.touchedModules.some((moduleId) => moduleId.trim().length === 0)
  )
    throw new Error('Manual touched modules must be nonempty, unique identifiers');
  const procedure = readCandidateRecord(
    root,
    selected.entries,
    dispositionRecord.procedurePath,
    'manual procedure',
  );
  const procedureRecord = parseOrThrow(ManualProcedure, procedure.input);
  // Proof: the empty-steps CLI negative exits 0 without this guard.
  if (procedureRecord.steps.length === 0) throw new Error('Manual procedure needs ordered steps');
  // Proof: the mismatched-procedure CLI negative exits 0 without this guard.
  if (
    procedureRecord.scenarioId !== dispositionRecord.scenarioId ||
    procedureRecord.title !== dispositionRecord.title
  )
    throw new Error(
      `Manual procedure scenario differs from disposition: ${dispositionRecord.scenarioId}`,
    );
  // Proof: whitespace-only step fields CLI negatives exit 0 without this guard.
  if (
    procedureRecord.steps.some(
      (step) =>
        step.stepId.trim().length === 0 ||
        step.instruction.trim().length === 0 ||
        step.expectedObservation.trim().length === 0,
    )
  )
    throw new Error('Manual procedure step is blank');
  const steps = procedureRecord.steps.map((step) => step.stepId);
  // Proof: a duplicate committed step ID made the named production CLI assertion fail when this guard was removed.
  if (new Set(steps).size !== steps.length) throw new Error('duplicate Manual step ID');
  const scenarios = authority.policy.scenarios;
  // Proof: removing this guard made the missing-authority CLI test lose the named
  // policy.scenarios finding; B3 then failed on undefined authority.baseRevision.
  if (scenarios === undefined) throw new Error('Manual needs external policy.scenarios');
  // Proof: bypassing B3 made the competing-active-spec production CLI negative exit 0.
  const specifications = evaluateSpecifications(
    root,
    selected,
    scenarios,
    authority.digest,
    hashCanonical(selected),
  );
  const matches = specifications.selection.effective.flatMap((requirement) =>
    requirement.scenarios.filter((scenario) => scenario.id === dispositionRecord.scenarioId),
  );
  // Proof: removing this guard made the unknown-ID CLI test lose the named active-scenario
  // finding; it failed later when selectedScenario.title was read from an empty match.
  if (matches.length !== 1)
    throw new Error(`Manual scenario is not active: ${dispositionRecord.scenarioId}`);
  const selectedScenario = matches[0];
  // Proof: a stale title cannot identify the selected B3 scenario.
  if (selectedScenario.title !== dispositionRecord.title)
    throw new Error(
      `Manual scenario title differs from effective specification: ${dispositionRecord.scenarioId}`,
    );
  const environment = readExternal(root, reportRecord.environmentPath, 'manual environment');
  const environmentRecord = parseOrThrow(ManualEnvironment, environment.input);
  const review = readExternal(root, reportRecord.reviewApprovalPath, 'manual review approval');
  const reviewRecord = parseOrThrow(ManualReviewApproval, review.input);
  const acceptance = readExternal(
    root,
    reportRecord.acceptanceApprovalPath,
    'manual acceptance approval',
  );
  const acceptanceRecord = parseOrThrow(ManualAcceptanceApproval, acceptance.input);
  for (const [subject, path, digest] of [
    ['environment', reportRecord.environmentPath, environment.digest],
    ['approval', reportRecord.reviewApprovalPath, review.digest],
    ['approval', reportRecord.acceptanceApprovalPath, acceptance.digest],
  ] as const) {
    const pins = subject === 'environment' ? manual.environments : manual.approvals;
    // Proof: changing an external artifact without its exact policy pin made its production CLI negative fail when this guard was removed.
    if (pins.filter((pin) => pin.path === path && pin.digest === digest).length !== 1)
      throw new Error(`Manual ${subject} differs from external policy pin: ${path}`);
  }
  // Proof: removing this join made the wrong tested-revision CLI assertion fail by reaching
  // an absent tested revision instead of refusing the conflicting environment binding.
  if (environmentRecord.sourceRevision !== reportRecord.sourceRevision)
    throw new Error('Manual environment source revision differs from report');
  let tested: ReturnType<typeof readCandidate>;
  try {
    // Proof: bypassing this committed-object read made the pinned nonexistent-tested-SHA CLI
    // assertion fail by accepting a report bound to no Git commit.
    tested = readCandidate(root, {
      kind: 'committed',
      revision: reportRecord.sourceRevision,
    });
    // Proof: removing exact SHA equality let an annotated tag object's SHA pass after Git
    // dereferenced it to a commit; the named production CLI assertion failed.
    if (
      tested.selection.kind !== 'committed' ||
      tested.selection.revision !== reportRecord.sourceRevision
    )
      throw new Error(
        `Manual tested revision is not an exact commit: ${reportRecord.sourceRevision}`,
      );
  } catch (cause) {
    if (cause instanceof CandidateReadError && cause.failure === 'absent-revision')
      throw new Error(`absent tested revision: ${reportRecord.sourceRevision}`, { cause });
    throw cause;
  }
  const source = evaluateSourceCurrency(
    root,
    selected,
    reportRecord.sourceRevision,
    dispositionRecord.scenarioId,
    dispositionRecord.title,
    dispositionRecord.procedurePath,
    dispositionRecord.touchedModules,
    reportRecord.reviewedScope,
  );
  const testedProcedureRecord = parseOrThrow(ManualProcedure, source.procedure.input);
  // Proof: disabling the nonempty guard made the repaired-candidate/empty-tested-procedure
  // CLI assertion accept an approved report with no Manual steps.
  if (
    testedProcedureRecord.steps.length === 0 ||
    new Set(testedProcedureRecord.steps.map((step) => step.stepId)).size !==
      testedProcedureRecord.steps.length ||
    testedProcedureRecord.steps.some(
      (step) =>
        step.stepId.trim().length === 0 ||
        step.instruction.trim().length === 0 ||
        step.expectedObservation.trim().length === 0,
    )
  )
    throw new Error('Manual tested procedure steps are invalid');
  // Proof: disabling this join made the tested-procedure-title CLI assertion accept a
  // report whose reviewed procedure title differs from the current disposition.
  if (
    testedProcedureRecord.scenarioId !== dispositionRecord.scenarioId ||
    testedProcedureRecord.title !== dispositionRecord.title
  )
    throw new Error('Manual tested procedure scenario differs from disposition');
  evaluateManualChain(
    {
      disposition: dispositionRecord,
      // Proof: substituting the candidate procedure made the added-later-step CLI assertion
      // refuse an old approved report instead of returning stale.
      procedure: testedProcedureRecord,
      report: reportRecord,
      environment: environmentRecord,
      review: reviewRecord,
      acceptance: acceptanceRecord,
      dispositionDigest: disposition.digest,
      procedureDigest: source.procedure.digest,
      reportDigest: report.digest,
      environmentDigest: environment.digest,
    },
    capturedNow,
  );
  return {
    schemaVersion: 1 as const,
    state: 'passing' as const,
    validation: 'passed' as const,
    outcome: 'passed' as const,
    currency: source.currency,
    provenance: 'policy-pinned-external-approval' as const,
    certifies: false as const,
    revision: selected.selection.revision,
    testedRevision: reportRecord.sourceRevision,
    policyDigest: authority.digest,
    scenarioId: dispositionRecord.scenarioId,
    selectedScenario: { id: dispositionRecord.scenarioId, title: selectedScenario.title },
    runId: reportRecord.runId,
    dispositionDigest: disposition.digest,
    procedureDigest: procedure.digest,
    reportDigest: report.digest,
    environmentDigest: environment.digest,
    reviewApprovalDigest: review.digest,
    acceptanceApprovalDigest: acceptance.digest,
  };
}
