import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';

import {
  type exhaustiveDocumentNames,
  readInvocation,
  UsageRefusal,
  type ValidatorCommand,
  validatorGrammar,
  type ValidatorRequest,
} from './cli-parser';
import { decodeRecord, RecordKind } from './contracts/decode-record';
import {
  ArtifactGraph,
  ClassificationPolicy,
  ContentManifestRequest,
  RelationshipRequest,
} from './contracts/records';
import { validatePlanTasks } from './contracts/validate-plan-tasks';
import { validateProgressReceipt } from './contracts/validate-progress-receipt';
import {
  buildContentManifest,
  compareContentIdentity,
  hashBytes,
  validateArtifacts,
} from './evidence/content-manifest';
import { checkIndexes, checkRootMigration } from './indexes';
import {
  type ClassifiedCandidate,
  classifyEntries,
  type ReadBlob,
} from './inventory/classify-entries';
import { readSelectedBlob } from './inventory/read-blob';
import { type CandidateRequest, readCandidate } from './inventory/read-candidate';
import { extractRelationships } from './relationships';
import {
  type ProvenanceRequirement,
  readInvocationJournal,
  validateReviewProvenance,
} from './review/invocation-journal';
import { anchorRequest } from './validator-paths';
import { decodeRequest } from './validator-request';
import { validateWorkflowBinding } from './workflow-binding';

interface JsonDocument {
  bytes: Uint8Array;
  input: unknown;
}

function readJsonDocument(path: string): JsonDocument {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // Proof: substituting `{}` for an absent required graph lost this boundary and failed later
    // with four missing schema fields instead of naming the unreadable input path.
    throw new Error(`cannot read JSON input ${path}: ${detail}`, { cause });
  }
  let source: string;
  try {
    // Proof: removing fatal UTF-8 decoding made the production graph boundary replace 0xff and
    // misreport it as generic malformed JSON instead of refusing the byte encoding itself.
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`JSON input ${path} is not UTF-8: ${detail}`, { cause });
  }
  try {
    return { bytes, input: JSON.parse(source) as unknown };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // Proof: substituting `{}` for malformed graph JSON lost the parse boundary and reported four
    // absent schema fields; the production oracle required the malformed input path instead.
    throw new Error(`malformed JSON input ${path}: ${detail}`, { cause });
  }
}

function readJson(path: string): unknown {
  return readJsonDocument(path).input;
}

type Selection = ValidatorRequest<'read-candidate'>['kind'];

function candidateRequest(kind: Selection, revision: string): CandidateRequest {
  return kind === 'committed' ? { kind, revision } : { kind, base: revision };
}

function validateRecord({ kind: kindInput, record }: { kind: string; record: string }): void {
  const kind = parseOrThrow(RecordKind, kindInput);
  decodeRecord(kind, readJson(record));
  process.stdout.write(`valid ${kind}\n`);
}

function readSelectedCandidate({
  kind,
  repository,
  revision,
}: ValidatorRequest<'read-candidate'>): void {
  process.stdout.write(
    `${JSON.stringify(readCandidate(repository, candidateRequest(kind, revision)))}\n`,
  );
}

function classifyCandidate({
  kind,
  repository,
  revision,
  policy: policyPath,
}: ValidatorRequest<'classify-candidate'>): void {
  const policy = parseOrThrow(ClassificationPolicy, readJson(policyPath));
  const candidate = readCandidate(repository, candidateRequest(kind, revision));
  process.stdout.write(
    `${JSON.stringify({
      selection: candidate.selection,
      entries: classifyEntries(candidate.entries, policy, (blob, path) =>
        readSelectedBlob(repository, candidate.entries, blob, path),
      ),
      untracked: candidate.untracked,
      policyId: policy.policyId,
    })}\n`,
  );
}

function classifySelectedCandidate(
  kind: Selection,
  repository: string,
  revision: string,
  policyPath: string,
): { candidate: ClassifiedCandidate; policyBlob: string; readBlob: ReadBlob } {
  const policyDocument = readJsonDocument(policyPath);
  const policy = parseOrThrow(ClassificationPolicy, policyDocument.input);
  const snapshot = readCandidate(repository, candidateRequest(kind, revision));
  const readBlob: ReadBlob = (blob, path) =>
    readSelectedBlob(repository, snapshot.entries, blob, path);
  return {
    candidate: {
      selection: snapshot.selection,
      entries: classifyEntries(snapshot.entries, policy, readBlob),
      untracked: snapshot.untracked,
      policyId: policy.policyId,
    },
    policyBlob: hashBytes(policyDocument.bytes),
    readBlob,
  };
}

function writeContentManifest(command: ValidatorRequest<'content-manifest'>): void {
  const request = parseOrThrow(ContentManifestRequest, readJson(command.request));
  const classified = classifySelectedCandidate(
    command.kind,
    command.repository,
    command.revision,
    command.policy,
  );
  const built = buildContentManifest(classified.candidate, request, classified.policyBlob);
  process.stdout.write(
    `${JSON.stringify({
      identity: built.identity,
      currency: compareContentIdentity(command.reviewedIdentity, built.identity),
      manifest: built.manifest,
    })}\n`,
  );
}

function writeArtifactValidation(command: ValidatorRequest<'validate-artifacts'>): void {
  const graph = parseOrThrow(ArtifactGraph, readJson(command.graph));
  const classified = classifySelectedCandidate(
    command.kind,
    command.repository,
    command.revision,
    command.policy,
  );
  const report = validateArtifacts(classified.candidate, graph, classified.readBlob);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

function writeRelationships(command: ValidatorRequest<'extract-relationships'>): void {
  const request = parseOrThrow(RelationshipRequest, readJson(command.request));
  const candidate = readCandidate(
    command.repository,
    candidateRequest(command.kind, command.revision),
  );
  process.stdout.write(
    `${JSON.stringify(extractRelationships(command.repository, candidate, request))}\n`,
  );
}

function writeIndexChecks(command: ValidatorRequest<'check-indexes'>): void {
  const candidate = readCandidate(
    command.repository,
    candidateRequest(command.kind, command.revision),
  );
  process.stdout.write(`${JSON.stringify(checkIndexes(command.repository, candidate))}\n`);
}

function writeRootMigrationCheck(command: ValidatorRequest<'check-root-migration'>): void {
  const candidate = readCandidate(
    command.repository,
    candidateRequest(command.kind, command.revision),
  );
  process.stdout.write(
    `${JSON.stringify(checkRootMigration(command.repository, candidate, command.map))}\n`,
  );
}

function writeReviewProvenance(command: ValidatorRequest<'validate-review-provenance'>): void {
  const requirement: ProvenanceRequirement = command.requirement;
  const validation = validateReviewProvenance(
    readInvocationJournal(command.journal),
    readJson(command.evidence),
    requirement,
  );
  process.stdout.write(`${JSON.stringify(validation)}\n`);
}

type ExhaustiveDocumentPaths = Readonly<Record<(typeof exhaustiveDocumentNames)[number], string>>;

function readExhaustiveDocuments(paths: ExhaustiveDocumentPaths) {
  return {
    inventory: readJsonDocument(paths.inventory),
    inventoryProtocol: readJsonDocument(paths.inventoryProtocol),
    classificationPolicy: readJsonDocument(paths.classificationPolicy),
    contentManifestRequest: readJsonDocument(paths.contentManifestRequest),
    exhaustivePolicy: readJsonDocument(paths.exhaustivePolicy),
    reviewProtocol: readJsonDocument(paths.reviewProtocol),
    moduleMapping: readJsonDocument(paths.moduleMapping),
    granularityPolicy: readJsonDocument(paths.granularityPolicy),
    modelContext: readJsonDocument(paths.modelContext),
    relationshipRequest: readJsonDocument(paths.relationshipRequest),
    artifactGraph: readJsonDocument(paths.artifactGraph),
  };
}

async function writeExhaustiveFreeze(
  command: ValidatorRequest<'freeze-exhaustive'>,
): Promise<void> {
  const { freezeExhaustivePlan } = await import('./review/exhaustive-coverage');
  const frozen = freezeExhaustivePlan(
    command.repository,
    command.revision,
    readExhaustiveDocuments(command),
    command.auditSeed,
  );
  process.stdout.write(`${JSON.stringify(frozen)}\n`);
}

async function writeExhaustiveVerification(
  command: ValidatorRequest<'verify-exhaustive'>,
): Promise<void> {
  const { verifyExhaustivePlan } = await import('./review/exhaustive-coverage');
  const verified = verifyExhaustivePlan(
    command.repository,
    command.expectedIdentity,
    readJson(command.plan),
    readExhaustiveDocuments(command),
    command.auditSeed,
  );
  process.stdout.write(`${JSON.stringify(verified)}\n`);
}

async function writeExhaustiveCoverage(
  command: ValidatorRequest<'evaluate-exhaustive-coverage'>,
): Promise<void> {
  const { evaluateExhaustiveCoverage, verifyExhaustivePlan } =
    await import('./review/exhaustive-coverage');
  const plan = readJson(command.plan);
  // Proof: removing this verification let an omitted repository-root subject reach `{}` audit
  // decoding; the production CLI test received only missing audit fields instead of the omission.
  verifyExhaustivePlan(
    command.repository,
    command.expectedIdentity,
    plan,
    readExhaustiveDocuments(command),
    command.auditSeed,
  );
  process.stdout.write(
    `${JSON.stringify(evaluateExhaustiveCoverage(plan, readJson(command.audit)))}\n`,
  );
}

declare const __TOOL_WIKI_BUNDLED_ARTIFACTS__: string;

function validatorEntryPaths(): string[] | { artifactManifest: string } {
  if (typeof __TOOL_WIKI_BUNDLED_ARTIFACTS__ === 'string') {
    return { artifactManifest: __TOOL_WIKI_BUNDLED_ARTIFACTS__ };
  }
  return [join(import.meta.dir, 'cli.ts'), join(import.meta.dir, 'policy', 'trust.ts')];
}

async function readInstant(value: string): Promise<Date> {
  const { readEvaluationInstant } = await import('./evidence/manual');
  return readEvaluationInstant(value);
}

/** Invocation-owned paths remain explicit when the validator runs outside the caller's tree. */
export interface ExecutionContext {
  readonly callerDirectory: string;
}

type Handlers = {
  readonly [Name in ValidatorCommand['command']]: (
    command: ValidatorRequest<Name>,
    context: ExecutionContext,
  ) => Promise<void> | void;
};

/**
 * One handler per validator command. A handler receives operands `cli-parser.ts` already
 * counted and typed, including every nested leaf. Dated commands carry explicit evaluation time;
 * check retains its optional now until the selected rules decide whether it is required.
 */
export const validatorHandlers: Handlers = {
  'validate-progress-receipt': ({ receipt, planReference, tasks }) => {
    const receiptDocument = readJsonDocument(receipt);
    const reference = readJsonDocument(planReference);
    const tasksDocument = readJsonDocument(tasks);
    process.stdout.write(
      `${JSON.stringify(validateProgressReceipt(receiptDocument.input, reference.input, tasksDocument.input))}\n`,
    );
  },
  'validate-plan-tasks': ({ planReference, tasks }) => {
    const reference = readJsonDocument(planReference);
    const tasksDocument = readJsonDocument(tasks);
    process.stdout.write(
      `${JSON.stringify(validatePlanTasks(reference.input, tasksDocument.input))}\n`,
    );
  },
  'validate-record': validateRecord,
  validate: validateRecord,
  'validate workflow-binding': (request, context) => {
    process.stdout.write(validateWorkflowBinding(request, context.callerDirectory) + '\n');
  },
  'read-candidate': readSelectedCandidate,
  'candidate-identity': async (request) => {
    const { writeCandidateIdentityCommand } = await import('./rules/check');
    writeCandidateIdentityCommand(request);
  },
  'classify-candidate': classifyCandidate,
  'content-manifest': writeContentManifest,
  'validate-artifacts': writeArtifactValidation,
  'extract-relationships': writeRelationships,
  'check-indexes': writeIndexChecks,
  'check-root-migration': writeRootMigrationCheck,
  'validate-review-provenance': writeReviewProvenance,
  'freeze-exhaustive': writeExhaustiveFreeze,
  'verify-exhaustive': writeExhaustiveVerification,
  'evaluate-exhaustive-coverage': writeExhaustiveCoverage,
  'lint-local': async (command) => {
    const { writeLocalLintCommand } = await import('./policy/trust');
    writeLocalLintCommand(
      [
        'lint-local',
        command.mode,
        command.kind,
        command.repository,
        command.revision,
        command.binding,
        command.evidence,
      ],
      validatorEntryPaths(),
    );
  },
  'lint-ci': async (command) => {
    const { writeCiLintCommand } = await import('./policy/trust');
    writeCiLintCommand(
      ['lint-ci', command.kind, command.repository, command.revision, command.evidence],
      validatorEntryPaths(),
    );
  },
  'validate-policy-activation': async (command) => {
    const { writePolicyActivationCommand } = await import('./policy/trust');
    writePolicyActivationCommand(
      [
        'validate-policy-activation',
        command.repository,
        command.previousBinding,
        command.nextBinding,
      ],
      validatorEntryPaths(),
    );
  },
  check: async (request) => {
    const { writeCheck } = await import('./rules/check');
    writeCheck(request);
  },
  explain: async (request) => {
    const { writeExplanation } = await import('./rules/check');
    writeExplanation(request);
  },
  scenario: async (request) => {
    const { writeScenario } = await import('./rules/scenario-command');
    writeScenario(request);
  },
  // Proof: invoking writeTemplateCommand here fails the child test whose argv adapter is broken.
  template: async (request) => {
    const { writeTemplate } = await import('./templates/verify');
    writeTemplate(request);
  },
  'inspect-evaluation-coverage': async (command) => {
    const { inspectEvaluationCoverage } = await import('./evidence/evaluation-coverage');
    const report = inspectEvaluationCoverage(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.coverageReview,
      import.meta.path,
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
    // Proof: removing this assignment made the unresolved production matrix return exit 0; its CLI test failed.
    if (report.rows.some((row) => row.evaluation === 'unevaluated')) process.exitCode = 1;
  },
  'inspect-performance': async ({ repository, revision, rulePolicy }) => {
    const { inspectPerformanceBundle } = await import('./evidence/performance-bundle');
    process.stdout.write(
      `${JSON.stringify(inspectPerformanceBundle(repository, revision, rulePolicy))}\n`,
    );
  },
  'inspect-performance-sources': async ({ repository, revision, rulePolicy }) => {
    const { inspectPerformanceSources } = await import('./evidence/performance-sources');
    process.stdout.write(
      `${JSON.stringify(inspectPerformanceSources(repository, revision, rulePolicy))}\n`,
    );
  },
  'inspect-performance-levels': async (command) => {
    const { inspectPerformanceLevels } = await import('./evidence/performance-levels');
    const observation = inspectPerformanceLevels(
      command.repository,
      command.revision,
      command.factsAuthority,
      command.rulePolicy,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: removing this status mapping made [TEST-AXES-089] exit zero for wrong-level JSON.
    if (observation.isolation.kind === 'wrong-level') process.exitCode = 1;
  },
  'inspect-performance-scenarios': async (command) => {
    const { inspectPerformanceScenarios } = await import('./evidence/performance-scenarios');
    const observation = inspectPerformanceScenarios(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.levelAuthority,
      command.capability,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: removing this mapping made TEST-AXES-097's invalid citations exit zero.
    if (observation.citationFindings.length !== 0) process.exitCode = 1;
  },
  'inspect-scenario-ledger': async (command) => {
    const evaluatedAt = await readInstant(command.now);
    const { inspectScenarioLedger } = await import('./evidence/scenario-ledger');
    const observation = inspectScenarioLedger(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.levelAuthority,
      command.capability,
      command.ledgerAuthority,
      evaluatedAt,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: disabling this exit mapping made TEST-AXES-104's named unassigned debt exit zero.
    if (observation.debt.length !== 0) process.exitCode = 1;
  },
  'inspect-level-facts': async ({ repository, revision, authority }) => {
    const { inspectLevelFacts } = await import('./evidence/level-facts');
    process.stdout.write(`${JSON.stringify(inspectLevelFacts(repository, revision, authority))}\n`);
  },
  'inspect-bun-test-reports': async ({ repository, revision, reportAuthority }) => {
    const { inspectBunTestReports } = await import('./evidence/bun-test-reports');
    process.stdout.write(
      `${JSON.stringify(inspectBunTestReports(repository, revision, reportAuthority))}\n`,
    );
  },
  'inspect-test-reports': async ({ repository, revision, rulePolicy, mode }) => {
    const { inspectTestReports } = await import('./evidence/test-reports');
    process.stdout.write(
      `${JSON.stringify(inspectTestReports(repository, revision, rulePolicy, mode))}\n`,
    );
  },
  'inspect-test-sources': async ({ repository, revision, rulePolicy, mode }) => {
    const { inspectTestSources } = await import('./evidence/test-sources');
    process.stdout.write(
      `${JSON.stringify(inspectTestSources(repository, revision, rulePolicy, mode))}\n`,
    );
  },
  'inspect-spec-sources': async ({ repository, revision }) => {
    const { inspectSpecSources } = await import('./evidence/spec-sources');
    process.stdout.write(`${JSON.stringify(inspectSpecSources(repository, revision))}\n`);
  },
  'inspect-manual': async (command) => {
    const { inspectManual, readEvaluationInstant } = await import('./evidence/manual');
    // Proof (2026-10-11): sampling `new Date()` here instead made `inspect-manual evaluated at
    // the last instant of the deadline date` exit 1 (overdue), and the missing and malformed
    // evaluation instant cases exit 0.
    const evaluatedAt = readEvaluationInstant(command.now);
    const observation = inspectManual(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.report,
      evaluatedAt,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: disabling this exit mapping made stale, failed and overdue production CLI
    // cases return exit 0 despite their structured nonpassing verdicts.
    if (observation.state !== 'current') process.exitCode = 1;
  },
  'inspect-manual-observation': async (command) => {
    // Proof: the exact deadline instants and malformed UTC production calls fail if the
    // supplied instant is replaced with a sampled clock or accepted without decoding.
    const evaluatedAt = await readInstant(command.now);
    const { inspectManualObservation } = await import('./evidence/manual-observation');
    const observation = inspectManualObservation(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.report,
      evaluatedAt,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: disabling this exit mapping made evaluated stale, failed and overdue CLI cases exit zero.
    if (observation.manual.state !== 'current') process.exitCode = 1;
  },
  'inspect-browser-performance': async ({ repository, revision, rulePolicy, mode, authority }) => {
    const { inspectBrowserPerformance } = await import('./evidence/browser-performance');
    process.stdout.write(
      `${JSON.stringify(inspectBrowserPerformance(repository, revision, rulePolicy, mode, authority))}\n`,
    );
  },
  'inspect-browser-architecture': async ({ repository, revision, rulePolicy, mode, authority }) => {
    const { inspectBrowserArchitecture } = await import('./evidence/browser-architecture');
    process.stdout.write(
      `${JSON.stringify(inspectBrowserArchitecture(repository, revision, rulePolicy, mode, authority))}\n`,
    );
  },
  'inspect-browser-conformance': async ({ repository, revision, rulePolicy, mode, authority }) => {
    const { inspectBrowserConformance } = await import('./evidence/browser-conformance');
    process.stdout.write(
      `${JSON.stringify(inspectBrowserConformance(repository, revision, rulePolicy, mode, authority))}\n`,
    );
  },
  'inspect-browser-memberships': async ({ repository, revision, rulePolicy, mode, authority }) => {
    const { inspectBrowserMemberships } = await import('./evidence/browser-memberships');
    process.stdout.write(
      `${JSON.stringify(inspectBrowserMemberships(repository, revision, rulePolicy, mode, authority))}\n`,
    );
  },
  'inspect-browser-scenarios': async (command) => {
    const { inspectBrowserScenarios } = await import('./evidence/browser-scenarios');
    const observation = inspectBrowserScenarios(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.mode,
      command.reviewAuthority,
      command.conformanceAuthority,
      command.architectureAuthority,
      command.performanceAuthority,
      command.capability,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: removal made TEST-AXES-129's missing-terminal findings exit zero.
    if (observation.citationFindings.length !== 0) process.exitCode = 1;
  },
  'inspect-browser-source-levels': async (command) => {
    const { inspectBrowserSourceLevels } = await import('./evidence/browser-source-levels');
    const observation = inspectBrowserSourceLevels(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.mode,
      command.reviewAuthority,
      command.conformanceAuthority,
      command.architectureAuthority,
      command.performanceAuthority,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: removal made TEST-AXES-147 WATCH_cli-exit's valid wrong-level observation exit zero.
    if (observation.isolation.kind === 'wrong-level') process.exitCode = 1;
  },
  'inspect-browser-levels': async (command) => {
    const { inspectBrowserLevels } = await import('./evidence/browser-levels');
    const observation = inspectBrowserLevels(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.mode,
      command.reviewAuthority,
      command.conformanceAuthority,
      command.architectureAuthority,
      command.performanceAuthority,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: removing status mapping made TEST-AXES-123's wrong-level production call exit zero.
    if (observation.isolation.kind === 'wrong-level') process.exitCode = 1;
  },
  'inspect-browser-t2': async (command) => {
    const evaluatedAt = await readInstant(command.now);
    const { inspectBrowserT2 } = await import('./evidence/browser-t2');
    // Proof: adding debt-based exit one failed TEST-AXES-141's valid diagnostic with unassigned debt.
    const observation = inspectBrowserT2(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.capability,
      command.ledgerAuthority,
      evaluatedAt,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
  },
  'inspect-browser-t2-policy': async (command) => {
    const evaluatedAt = await readInstant(command.now);
    const { inspectBrowserT2Policy } = await import('./evidence/browser-t2-policy');
    const observation = inspectBrowserT2Policy(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.capability,
      command.ledgerAuthority,
      command.proposedPolicy,
      evaluatedAt,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: clearing this status failed BROWSER-T2-POLICY-PREVIEW-006's enforced refusal CLI assertion.
    if (observation.proposedDisposition.kind === 'citation-refusals') process.exitCode = 1;
  },
  'inspect-browser-scenario-ledger': async (command) => {
    const evaluatedAt = await readInstant(command.now);
    const { inspectBrowserScenarioLedger } = await import('./evidence/browser-scenario-ledger');
    const observation = inspectBrowserScenarioLedger(
      command.repository,
      command.revision,
      command.rulePolicy,
      command.capability,
      command.ledgerAuthority,
      evaluatedAt,
    );
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    // Proof: removing debt exit mapping failed TEST-AXES-138 unassigned JSON/exit assertion.
    if (observation.debt.length !== 0) process.exitCode = 1;
  },
  'inspect-browser': async ({ repository, revision, rulePolicy, mode }) => {
    const { inspectBrowserBundle } = await import('./evidence/browser');
    process.stdout.write(
      `${JSON.stringify(inspectBrowserBundle(repository, revision, rulePolicy, mode))}\n`,
    );
  },
};

/**
 * Dispatches one parsed validator command (see {@link readInvocation} with
 * {@link validatorGrammar}) to its handler in {@link validatorHandlers}. A command whose verdict
 * does not pass still writes its record to stdout and sets `process.exitCode` to 1.
 *
 * Burokrat ships no authority writer: `submit-admission` moved to Twilight Dash.
 *
 * @throws Error `Unsupported Burokrat command: <name>` for a command no handler takes, which only
 * a JavaScript caller bypassing the parser can pass.
 */
export function runCli(
  command: ValidatorCommand,
  context: ExecutionContext = { callerDirectory: process.cwd() },
): Promise<void> | void {
  const name: string = command.command;
  // Proof: deleting this guard made `runCli refuses a command no handler takes` call `undefined`
  // and throw a TypeError instead of the Burokrat refusal (2026-11-02).
  if (!Object.hasOwn(validatorHandlers, name))
    throw new Error(`Unsupported Burokrat command: ${name}`);
  // The handler table is keyed by the same union member that selected the handler, a pairing
  // TypeScript cannot follow through an indexed access; the mapped type above checks each entry.
  const handler = validatorHandlers[command.command] as (
    command: ValidatorCommand,
    context: ExecutionContext,
  ) => Promise<void> | void;
  return handler(command, context);
}

function fail(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  // A refused command line is one `error: ` line; any other failure keeps its own first words,
  // which callers and tests match.
  // Proof: writing the bare message here failed `an unknown command refuses in one line, exit 1,
  // through both entries` with `Unsupported Burokrat command: apply` and no prefix (2026-11-02).
  process.stderr.write(cause instanceof UsageRefusal ? `error: ${message}\n` : `${message}\n`);
  // Proof: changing this to exit zero made the inconsistent Manual report production CLI
  // assertion accept a refused inspection despite its named stderr and empty stdout.
  process.exitCode = 1;
}

/**
 * Runs one command line as the process entry does: it is parsed with {@link validatorGrammar};
 * help and completion scripts go to `process.stdout`; output goes to `process.stdout`; a refusal
 * is written to `process.stderr` and sets `process.exitCode` to 1. Never rejects.
 *
 * Tests call this in-process instead of spawning `bun run cli.ts`, which cost a Bun start per
 * case on the gate host; only cases about the process boundary itself still spawn.
 */
export async function executeCli(argv: readonly string[]): Promise<void> {
  try {
    const invocation = readInvocation(validatorGrammar, argv, {
      stdout: (text) => {
        process.stdout.write(text);
      },
    });
    if (invocation.kind === 'command') await runCli(invocation.command);
  } catch (cause) {
    fail(cause);
  }
}

/** Execute one installed-only JSON request without entering either argv parser. */
export async function executeRequest(source: string | Uint8Array): Promise<void> {
  try {
    const invocation = decodeRequest(source);
    // Proof: broken argv adapters still dispatch here; re-entering executeCli fails that child test.
    // Bypassing anchoring or changing the caller root fails the actual host/binding IO cases.
    await runCli(anchorRequest(invocation.request, invocation.callerDirectory), {
      callerDirectory: invocation.callerDirectory,
    });
  } catch (cause) {
    fail(cause);
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === '--puni-request-v1')
    // Proof: reading stdin.text instead dispatches replaced invalid UTF-8 in the actual byte test.
    await executeRequest(await Bun.stdin.bytes());
  else await executeCli(argv);
}
