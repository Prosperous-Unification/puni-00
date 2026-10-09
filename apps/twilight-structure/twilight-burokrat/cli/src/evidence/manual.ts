import { lstatSync } from 'node:fs';
import { parse, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { readCandidateBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { hashBytes } from './content-manifest';

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

/** Candidate declaration; semantic review and selector checks occur in the next slice. */
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

function assertNoSymlink(path: string, subject: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let cursor = root;
  for (const segment of absolute.slice(root.length).split(sep)) {
    if (segment.length === 0) continue;
    cursor = resolve(cursor, segment);
    try {
      // Proof: the production CLI symlink report negative failed to name a symlink when this guard was removed.
      if (lstatSync(cursor).isSymbolicLink())
        throw new Error(`${subject} contains a symlink: ${path}`);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('contains a symlink')) throw cause;
      // The stable artifact reader names absent and unreadable files at its own boundary.
      return;
    }
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

/** Decodes a committed Manual evidence chain. Its state remains unevaluated until later validation slices. */
export function inspectManual(
  repository: string,
  revision: string,
  policyPath: string,
  reportPath: string,
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
    // Proof: using raw external paths let two aliases reach report matching; the alias CLI assertion lost its duplicate refusal.
    const paths = pins.map((pin) => (subject === 'disposition' ? pin.path : resolve(pin.path)));
    // Proof: duplicating the report policy pin made its named CLI negative fail when this guard was removed.
    if (new Set(paths).size !== paths.length) throw new Error(`duplicate Manual ${subject} pin`);
  }
  const report = readExternal(root, reportPath, 'manual report');
  const reportRecord = parseOrThrow(ManualReport, report.input);
  const reportPins = manual.reports.filter((pin) => resolve(pin.path) === resolve(reportPath));
  // Proof: changing or omitting the exact report pin made the CLI digest negative lose its refusal.
  if (reportPins.length !== 1 || reportPins[0]?.digest !== report.digest)
    throw new Error('Manual report differs from external policy pin');
  const disposition = readCandidateRecord(
    root,
    selected.entries,
    reportRecord.dispositionPath,
    'manual disposition',
  );
  const dispositionRecord = parseOrThrow(ManualDisposition, disposition.input);
  const dispositionPins = manual.dispositions.filter(
    (pin) => pin.path === reportRecord.dispositionPath,
  );
  // Proof: changing or omitting the exact candidate disposition pin made the CLI identity negative lose its refusal.
  if (dispositionPins.length !== 1 || dispositionPins[0]?.digest !== disposition.digest)
    throw new Error('Manual disposition differs from external policy pin');
  const procedure = readCandidateRecord(
    root,
    selected.entries,
    dispositionRecord.procedurePath,
    'manual procedure',
  );
  const procedureRecord = parseOrThrow(ManualProcedure, procedure.input);
  const steps = procedureRecord.steps.map((step) => step.stepId);
  // Proof: a duplicate committed step ID made the named production CLI assertion fail when this guard was removed.
  if (new Set(steps).size !== steps.length) throw new Error('duplicate Manual step ID');
  const environment = readExternal(root, reportRecord.environmentPath, 'manual environment');
  parseOrThrow(ManualEnvironment, environment.input);
  const review = readExternal(root, reportRecord.reviewApprovalPath, 'manual review approval');
  parseOrThrow(ManualReviewApproval, review.input);
  const acceptance = readExternal(
    root,
    reportRecord.acceptanceApprovalPath,
    'manual acceptance approval',
  );
  parseOrThrow(ManualAcceptanceApproval, acceptance.input);
  for (const [subject, path, digest] of [
    ['environment', reportRecord.environmentPath, environment.digest],
    ['approval', reportRecord.reviewApprovalPath, review.digest],
    ['approval', reportRecord.acceptanceApprovalPath, acceptance.digest],
  ] as const) {
    const pins = subject === 'environment' ? manual.environments : manual.approvals;
    // Proof: changing an external artifact without its exact policy pin made its production CLI negative fail when this guard was removed.
    if (
      pins.filter((pin) => resolve(pin.path) === resolve(path) && pin.digest === digest).length !==
      1
    )
      throw new Error(`Manual ${subject} differs from external policy pin: ${path}`);
  }
  return {
    schemaVersion: 1 as const,
    state: 'unevaluated' as const,
    reason: 'Manual validation incomplete',
    certifies: false as const,
    revision: selected.selection.revision,
    policyDigest: authority.digest,
    scenarioId: dispositionRecord.scenarioId,
    runId: reportRecord.runId,
    dispositionDigest: disposition.digest,
    procedureDigest: procedure.digest,
    reportDigest: report.digest,
    environmentDigest: environment.digest,
    reviewApprovalDigest: review.digest,
    acceptanceApprovalDigest: acceptance.digest,
  };
}
