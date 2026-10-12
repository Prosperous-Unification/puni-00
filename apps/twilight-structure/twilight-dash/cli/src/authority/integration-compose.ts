import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type AdmissionPacket,
  assertAdmissionPacket,
  type CandidateEntry,
  compareCanonicalText,
  decodeAdmissionPacketBody,
  decodeIntegrationPolicy,
  hashBytes,
  hashCanonical,
  type IntegrationCandidateBody,
  type IntegrationGenerationSnapshot,
  type IntegrationRequest,
  type SubmittedCandidate,
  type UncheckedIntegrationCandidate,
} from '@twilight-burokrat/judge';

import type { AuthorityGeneration, AuthorityStore } from './authority-store';

interface GitOutput {
  readonly stdout: Uint8Array;
}

/** An authenticated immutable patch cannot be replayed on a newer descendant target. */
export class IntegrationPatchConflictError extends Error {
  constructor(detail: string) {
    super(`integration submission is incompatible with the current target: ${detail}`);
    this.name = 'IntegrationPatchConflictError';
  }
}

function git(
  repository: string,
  argv: readonly string[],
  context: string,
  options: { readonly index?: string; readonly stdin?: Uint8Array } = {},
): GitOutput {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    env:
      options.index === undefined
        ? undefined
        : { ...process.env, GIT_INDEX_FILE: options.index, GIT_OPTIONAL_LOCKS: '0' },
    stdin: options.stdin,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    const detail = invocation.stderr.toString('utf8').trim();
    throw new Error(
      `integration refused: ${context}: ${detail || `git exited ${String(invocation.exitCode)}`}`,
    );
  }
  return { stdout: invocation.stdout };
}

function gitIdentity(
  repository: string,
  argv: readonly string[],
  context: string,
  index?: string,
): string {
  const identity = new TextDecoder('utf-8', { fatal: true })
    .decode(git(repository, argv, context, { index }).stdout)
    .replace(/\n$/, '');
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(identity)) {
    throw new Error(`integration refused: ${context}: malformed object identity`);
  }
  return identity;
}

function parseTree(bytes: Uint8Array): CandidateEntry[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const records = text.split('\0');
  if (records.pop() !== '')
    throw new Error('integration refused: tree inventory is not NUL terminated');
  return records.map((record) => {
    const tab = record.indexOf('\t');
    const header = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    if (tab < 0 || header.length !== 3)
      throw new Error('integration refused: malformed tree tuple');
    const [mode, type, blob] = header;
    if (
      (mode !== '100644' && mode !== '100755' && mode !== '120000' && mode !== '160000') ||
      (type !== 'blob' && type !== 'commit') ||
      !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(blob)
    ) {
      throw new Error('integration refused: malformed tree tuple');
    }
    return { blob, mode, path };
  });
}

function readTree(repository: string, tree: string): CandidateEntry[] {
  return parseTree(
    git(repository, ['ls-tree', '-r', '-z', '--full-tree', tree], 'cannot inventory candidate tree')
      .stdout,
  );
}

function entryMap(entries: readonly CandidateEntry[]): Map<string, CandidateEntry> {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

function entriesEqual(
  left: CandidateEntry | undefined,
  right: CandidateEntry | undefined,
): boolean {
  return left?.path === right?.path && left?.mode === right?.mode && left?.blob === right?.blob;
}

function differences(base: readonly CandidateEntry[], candidate: readonly CandidateEntry[]) {
  const before = entryMap(base);
  const after = entryMap(candidate);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort(compareCanonicalText);
  const changedPaths: string[] = [];
  const tuples: unknown[] = [];
  for (const path of paths) {
    const oldEntry = before.get(path);
    const newEntry = after.get(path);
    if (entriesEqual(oldEntry, newEntry)) continue;
    changedPaths.push(path);
    tuples.push({ after: newEntry ?? null, before: oldEntry ?? null, path });
  }
  return { changedPaths, identity: hashCanonical(tuples) };
}

function withTemporaryIndex<T>(repository: string, operation: (index: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), 'wiki-integration-index-'));
  try {
    return operation(join(directory, 'index'));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

/** Recognizes only Git's C-locale diagnostics for semantic patch non-applicability. */
function isPatchNonApplicability(detail: string): boolean {
  const diagnostics = detail.split('\n').map((line) => line.trim());
  return (
    diagnostics.length > 0 &&
    diagnostics.every((line) =>
      /^error: (?:patch failed: .+|.+: patch does not apply|.+: does not match index|.+: does not exist in index|.+: already exists in index)$/.test(
        line,
      ),
    )
  );
}

function applyPatch(
  repository: string,
  index: string,
  patch: Uint8Array,
  conflictIsModeled = false,
): void {
  const invocation = Bun.spawnSync(
    [
      'git',
      '-C',
      repository,
      'apply',
      '--cached',
      '--index',
      '--binary',
      '--whitespace=nowarn',
      '-',
    ],
    {
      env: {
        ...process.env,
        GIT_INDEX_FILE: index,
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
      },
      stdin: patch,
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  if (invocation.exitCode === 0) return;
  const detail = invocation.stderr.toString('utf8').trim();
  // Proof: broadening this predicate to every descendant `git apply` exit 1 made `an object read
  // failure inside descendant patch replay stays recoverable` resolve terminal;
  // `fixture promise resolved unexpectedly`. Omitting the target-absence diagnostic made `a target
  // deletion terminalizes the exact immutable submission` throw `src/one.ts: does not exist in
  // index` instead of returning its permanent incompatible-submission report. Omitting the
  // target-addition diagnostic left `a target add/add conflict terminalizes the exact immutable
  // submission` queued at attempt zero after Git reported `already exists in index`.
  if (conflictIsModeled && invocation.exitCode === 1 && isPatchNonApplicability(detail)) {
    throw new IntegrationPatchConflictError(detail || 'git exited 1');
  }
  throw new Error(
    `integration refused: immutable submission patch cannot be applied: ${detail || `git exited ${String(invocation.exitCode)}`}`,
  );
}

function verifyFrozenSubmission(
  repository: string,
  baseTree: string,
  baseEntries: readonly CandidateEntry[],
  submission: SubmittedCandidate,
): void {
  const frozen = submission.report;
  if (hashBytes(submission.patch) !== frozen.patchIdentity) {
    // Proof: omitting this exact-byte comparison let a caller replace a frozen patch with `broken`;
    // `refuses duplicate, stale, identity-mismatched and non-submitted inputs` received
    // `immutable submission patch cannot be applied`, not the required identity refusal.
    throw new Error('immutable submission patch identity mismatch');
  }
  withTemporaryIndex(repository, (index) => {
    git(repository, ['read-tree', baseTree], 'cannot initialize submission index', { index });
    applyPatch(repository, index, submission.patch);
    const tree = gitIdentity(repository, ['write-tree'], 'cannot freeze submission tree', index);
    const entries = readTree(repository, tree);
    const diff = differences(baseEntries, entries);
    const contentIdentity = hashCanonical({ entries, schemaVersion: 1, tree });
    // Proof: bypassing this tuple comparison let a report for one patch authenticate different
    // applicable bytes; `refuses authenticated patch application failure and frozen report
    // mismatch` failed with `Received function did not throw` and printed the unchecked tree.
    if (
      tree !== frozen.candidateTree ||
      diff.identity !== frozen.candidateDiffIdentity ||
      contentIdentity !== frozen.contentIdentity ||
      !sameStrings(diff.changedPaths, frozen.changedPaths)
    ) {
      throw new Error('immutable submission candidate identity mismatch');
    }
  });
}

function authorityGeneration(
  generations: readonly AuthorityGeneration[],
  packet: AdmissionPacket,
): AuthorityGeneration {
  const generation = generations.find(
    (record) => record.sessionId === packet.sessionId && record.generation === packet.generation,
  );
  if (generation === undefined) throw new Error('integration generation does not exist');
  // Proof: accepting a terminal record let rejected work enter composition; `refuses duplicate,
  // stale, identity-mismatched and non-submitted inputs` failed with `Received function did not
  // throw` and printed the rejected generation as submitted in an unchecked candidate.
  if (
    generation.status !== 'submitted' ||
    generation.submission === undefined ||
    generation.packet === undefined
  ) {
    throw new Error(`integration generation is not submitted: ${packet.sessionId}`);
  }
  const bound = decodeAdmissionPacketBody(
    generation.packet.packetIdentity,
    generation.packet.packetBytes,
  );
  assertAdmissionPacket(packet);
  // Proof: comparing only session/generation let caller-mutated packet bytes replace authority
  // bytes; `refuses a caller packet that differs from the authority-bound packet` failed with
  // `Received function did not throw` and printed the forged packet identity.
  if (bound.packetIdentity !== packet.packetIdentity)
    throw new Error('integration packet differs from authority binding');
  return generation;
}

function assertAncestor(repository: string, ancestor: string, descendant: string): void {
  const invocation = Bun.spawnSync(
    ['git', '-C', repository, 'merge-base', '--is-ancestor', ancestor, descendant],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  if (invocation.exitCode === 0) return;
  if (invocation.exitCode === 1) {
    throw new Error('integration target no longer descends from the submitted base');
  }
  throw new Error(
    `integration refused: cannot compare integration bases: ${invocation.stderr.toString('utf8').trim()}`,
  );
}

function compose(
  store: AuthorityStore,
  coordinatorRepository: string,
  request: IntegrationRequest,
  integrationBaseCommit?: string,
): UncheckedIntegrationCandidate {
  const policy = decodeIntegrationPolicy(request.policy);
  if (request.submissions.length < 1)
    throw new Error('integration requires at least one submission');
  const coordinator = realpathSync(coordinatorRepository);
  // One authority read prevents a composition from silently mixing generations observed on
  // opposite sides of a concurrent lifecycle transition. Slice 5.2 must still recheck this set.
  const authoritySnapshot = store.transact((transaction) => transaction.readState());
  const sessions = new Set<string>();
  let submissionBaseCommit: string | undefined;
  let submissionBaseTree: string | undefined;
  const snapshots: IntegrationGenerationSnapshot[] = [];
  for (const submission of request.submissions) {
    const packet = submission.packet;
    // Proof: bypassing duplicate-session refusal made `refuses duplicate, stale, identity-
    // mismatched and non-submitted inputs` receive `src/producer.ts: patch does not apply`.
    if (sessions.has(packet.sessionId))
      throw new Error(`duplicate integration session: ${packet.sessionId}`);
    sessions.add(packet.sessionId);
    // Proof: bypassing coordinator isolation made `refuses duplicate, stale, identity-mismatched
    // and non-submitted inputs` fail with `Received function did not throw` and print unchecked.
    if (packet.worktreePath === coordinator)
      throw new Error('coordinator cannot be a source writer worktree');
    // Proof: accepting a valid but differently selected policy made `refuses duplicate, stale,
    // identity-mismatched and non-submitted inputs` fail with `Received function did not throw`.
    if (packet.policyIdentity !== policy.policyIdentity)
      throw new Error('submission policy identity mismatch');
    // Proof: accepting a remapped packet made `refuses duplicate, stale, identity-mismatched and
    // non-submitted inputs` receive `integration packet differs from authority binding` instead.
    if (packet.mappingIdentity !== policy.mappingIdentity)
      throw new Error('submission mapping identity mismatch');
    if (
      submissionBaseCommit !== undefined &&
      (packet.base.commit !== submissionBaseCommit || packet.base.tree !== submissionBaseTree)
    ) {
      throw new Error('integration submissions do not share an exact base');
    }
    submissionBaseCommit = packet.base.commit;
    submissionBaseTree = packet.base.tree;
    const generation = authorityGeneration(authoritySnapshot.generations, packet);
    if (
      generation.submission?.patchIdentity !== submission.report.patchIdentity ||
      generation.submission.candidateDiffIdentity !== submission.report.candidateDiffIdentity ||
      generation.submission.contentIdentity !== submission.report.contentIdentity
    ) {
      throw new Error('integration submission differs from authority identity');
    }
    snapshots.push({
      generation: packet.generation,
      packetIdentity: packet.packetIdentity,
      patchIdentity: generation.submission.patchIdentity,
      sessionId: packet.sessionId,
      status: 'submitted',
    });
  }
  if (submissionBaseCommit === undefined || submissionBaseTree === undefined)
    throw new Error('integration base is absent');
  const resolvedSubmissionTree = gitIdentity(
    coordinator,
    ['rev-parse', `${submissionBaseCommit}^{tree}`],
    'cannot resolve submitted integration base',
  );
  if (resolvedSubmissionTree !== submissionBaseTree)
    throw new Error('integration base commit differs from pinned tree');
  const submittedBaseEntries = readTree(coordinator, submissionBaseTree);
  for (const submission of request.submissions)
    verifyFrozenSubmission(coordinator, submissionBaseTree, submittedBaseEntries, submission);

  const baseCommit = integrationBaseCommit ?? submissionBaseCommit;
  if (integrationBaseCommit !== undefined) {
    assertAncestor(coordinator, submissionBaseCommit, integrationBaseCommit);
  }
  const baseTree = gitIdentity(
    coordinator,
    ['rev-parse', `${baseCommit}^{tree}`],
    'cannot resolve current integration base',
  );
  const baseEntries = readTree(coordinator, baseTree);

  const ordered = [...request.submissions].sort((left, right) =>
    compareCanonicalText(left.packet.sessionId, right.packet.sessionId),
  );
  const candidateTree = withTemporaryIndex(coordinator, (index) => {
    git(coordinator, ['read-tree', baseTree], 'cannot initialize coordinator index', { index });
    // Proof: replacing these frozen bytes with a fresh diff from each writer's mutable staged
    // tree made `publication uses frozen patch bytes` fail on `Expected ... one = 2; Received ...
    // one = 99;` at the published-commit oracle.
    for (const submission of ordered) {
      applyPatch(coordinator, index, submission.patch, integrationBaseCommit !== undefined);
    }
    return gitIdentity(coordinator, ['write-tree'], 'cannot freeze combined candidate tree', index);
  });
  const entries = readTree(coordinator, candidateTree);
  const combinedDiff = differences(baseEntries, entries);
  const targetDrift = differences(submittedBaseEntries, baseEntries);
  const affectedPaths = [
    ...new Set([...targetDrift.changedPaths, ...combinedDiff.changedPaths]),
  ].sort(compareCanonicalText);
  const byPath = entryMap(entries);
  for (const submission of ordered) {
    for (const dependency of submission.packet.readDependencies) {
      // Proof: validating reads only against standalone submissions let another batch patch stale
      // the declared tuple; `refuses a stale read in the actual combined candidate` failed with
      // `Received function did not throw` and printed both changed paths in an unchecked tree.
      if (!entriesEqual(dependency, byPath.get(dependency.path))) {
        throw new Error(`integration read dependency changed: ${dependency.path}`);
      }
    }
  }
  const contractRules = new Set(policy.contractRules.map(({ contractId }) => contractId));
  for (const { packet } of ordered) {
    for (const contractId of packet.producedContracts) {
      // Proof: removing this registry lookup made `every produced contract must resolve in the
      // trusted contract registry` fail on `Received function did not throw` and print an unchecked
      // candidate carrying `contract.unmapped` without any consumer obligation.
      if (!contractRules.has(contractId)) {
        throw new Error(`produced contract is absent from integration policy: ${contractId}`);
      }
    }
  }
  for (const rule of policy.contractRules) {
    const produced = ordered.some(({ packet }) =>
      packet.producedContracts.includes(rule.contractId),
    );
    // Proof: bypassing this join admitted a contract-only producer; `requires a contract consumer
    // in the same batch` failed with `Received function did not throw` and printed its unchecked tree.
    if (produced) {
      for (const consumer of rule.requiredConsumers) {
        const implementation = ordered.find(
          ({ packet, report }) =>
            !packet.producedContracts.includes(rule.contractId) &&
            packet.consumedContracts.includes(rule.contractId) &&
            packet.consumedInterfaces.includes(consumer.interfaceId) &&
            // Proof: bypassing this ownership-path match let an unrelated gate-only patch pose as
            // the consumer; `contract consumers must be distinct and change trusted implementation
            // paths` failed on `Received function did not throw` and printed the combined candidate.
            report.changedPaths.some((path) =>
              consumer.implementationSelectors.some((selector) =>
                selector.kind === 'path'
                  ? path === selector.path
                  : path === selector.path || path.startsWith(`${selector.path}/`),
              ),
            ),
        );
        // Proof: bypassing this implementation lookup let a producer satisfy its own required
        // consumer; `contract consumers must be distinct and change trusted implementation paths`
        // failed on `Received function did not throw` and printed an unchecked producer candidate.
        if (implementation === undefined) {
          throw new Error(`required consumer is absent from integration batch: ${rule.contractId}`);
        }
      }
    }
  }
  const checks = new Set(ordered.flatMap(({ packet }) => [...packet.checks]));
  const reviews = new Set(ordered.flatMap(({ packet }) => [...packet.evidenceRequirements]));
  for (const rule of policy.selectorRules) {
    // Proof: selecting from the publication diff alone omitted the trusted gate check and review
    // when only the descendant target changed `gate.ts` before recomposition.
    const affected = affectedPaths.some((path) =>
      rule.kind === 'path'
        ? path === rule.path
        : path === rule.path || path.startsWith(`${rule.path}/`),
    );
    // Proof: skipping matched selector rules made `reselects gate evidence and refuses standalone
    // or mismatched receipts` miss `check.trusted-gate` (`Expected - 1, Received + 0`).
    if (!affected) continue;
    for (const check of rule.checks) checks.add(check);
    for (const review of rule.reviews) reviews.add(review);
  }
  const checkSpecs = new Map(
    policy.checkSpecs.map((specification) => [specification.checkId, specification]),
  );
  const reviewSpecs = new Map(
    policy.reviewSpecs.map((specification) => [specification.reviewId, specification]),
  );
  const selectedChecks = [...checks].sort(compareCanonicalText);
  const selectedReviews = [...reviews].sort(compareCanonicalText);
  const selectedCheckSpecs = selectedChecks.map((checkId) => {
    const specification = checkSpecs.get(checkId);
    if (specification === undefined)
      throw new Error(`integration check specification is absent: ${checkId}`);
    return specification;
  });
  const selectedReviewSpecs = selectedReviews.map((reviewId) => {
    const specification = reviewSpecs.get(reviewId);
    if (specification === undefined)
      throw new Error(`integration review specification is absent: ${reviewId}`);
    return specification;
  });
  const body: IntegrationCandidateBody = {
    baseCommit,
    baseTree,
    candidateDiffIdentity: combinedDiff.identity,
    candidateTree,
    changedPaths: combinedDiff.changedPaths,
    contentManifestIdentity: hashCanonical({ entries, schemaVersion: 1, tree: candidateTree }),
    declarationIdentity: hashCanonical(
      ordered.map(({ packet }) => ({
        checks: packet.checks,
        consumedContracts: packet.consumedContracts,
        consumedInterfaces: packet.consumedInterfaces,
        evidenceRequirements: packet.evidenceRequirements,
        invariants: packet.invariants,
        producedContracts: packet.producedContracts,
        producedInterfaces: packet.producedInterfaces,
        sessionId: packet.sessionId,
      })),
    ),
    mappingIdentity: policy.mappingIdentity,
    policyIdentity: policy.policyIdentity,
    publicationBoundary: '5.2 must atomically recheck authority and target ref before publication',
    schemaVersion: 1,
    selectedCheckSpecs,
    selectedChecks,
    selectedReviewSpecs,
    selectedReviews,
    status: 'unchecked',
    submissions: snapshots.sort((left, right) =>
      compareCanonicalText(left.sessionId, right.sessionId),
    ),
  };
  return { ...body, compositionIdentity: hashCanonical(body) };
}

/** Composes exact submitted patches into an immutable, unchecked candidate tree. */
export function composeIntegrationCandidate(
  store: AuthorityStore,
  coordinatorRepository: string,
  request: IntegrationRequest,
): UncheckedIntegrationCandidate {
  return compose(store, coordinatorRepository, request);
}

/** Recomposes the same immutable submissions on a newer descendant target base. */
export function recomposeIntegrationCandidate(
  store: AuthorityStore,
  coordinatorRepository: string,
  request: IntegrationRequest,
  integrationBaseCommit: string,
): UncheckedIntegrationCandidate {
  return compose(store, coordinatorRepository, request, integrationBaseCommit);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
