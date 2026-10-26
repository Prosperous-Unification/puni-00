import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';

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
import { runWorkflowBindingCommand } from './workflow-binding';

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

function validateRecord(argv: string[]): void {
  const kind = parseOrThrow(RecordKind, argv[1]);
  decodeRecord(kind, readJson(argv[2]));
  process.stdout.write(`valid ${kind}\n`);
}

function readSelectedCandidate(argv: string[]): void {
  const kind = argv[1];
  const repository = argv[2];
  const revision = argv[3];
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error(
      'usage: tool-wiki read-candidate <committed|staged|working> <repository> <revision-or-base>',
    );
  }
  const request: CandidateRequest =
    kind === 'committed' ? { kind, revision } : { kind, base: revision };
  process.stdout.write(`${JSON.stringify(readCandidate(repository, request))}\n`);
}

function classifyCandidate(argv: string[]): void {
  const kind = argv[1];
  const repository = argv[2];
  const revision = argv[3];
  const policyPath = argv[4];
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error(
      'usage: tool-wiki classify-candidate <committed|staged|working> <repository> <revision-or-base> <policy-json>',
    );
  }
  const policy = parseOrThrow(ClassificationPolicy, readJson(policyPath));
  const request: CandidateRequest =
    kind === 'committed' ? { kind, revision } : { kind, base: revision };
  const candidate = readCandidate(repository, request);
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
  kind: string,
  repository: string,
  revision: string,
  policyPath: string,
): { candidate: ClassifiedCandidate; policyBlob: string; readBlob: ReadBlob } {
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error('candidate kind must be committed, staged or working');
  }
  const policyDocument = readJsonDocument(policyPath);
  const policy = parseOrThrow(ClassificationPolicy, policyDocument.input);
  const request: CandidateRequest =
    kind === 'committed' ? { kind, revision } : { kind, base: revision };
  const snapshot = readCandidate(repository, request);
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

function writeContentManifest(argv: string[]): void {
  const [kind, repository, revision, policyPath, requestPath, reviewedIdentity] = argv.slice(1);
  const request = parseOrThrow(ContentManifestRequest, readJson(requestPath));
  const classified = classifySelectedCandidate(kind, repository, revision, policyPath);
  const built = buildContentManifest(classified.candidate, request, classified.policyBlob);
  process.stdout.write(
    `${JSON.stringify({
      identity: built.identity,
      currency: compareContentIdentity(reviewedIdentity, built.identity),
      manifest: built.manifest,
    })}\n`,
  );
}

function writeArtifactValidation(argv: string[]): void {
  const [kind, repository, revision, policyPath, graphPath] = argv.slice(1);
  const graph = parseOrThrow(ArtifactGraph, readJson(graphPath));
  const classified = classifySelectedCandidate(kind, repository, revision, policyPath);
  const report = validateArtifacts(classified.candidate, graph, classified.readBlob);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

function writeRelationships(argv: string[]): void {
  const [kind, repository, revision, requestPath] = argv.slice(1);
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error('relationship candidate kind must be committed, staged or working');
  }
  const request = parseOrThrow(RelationshipRequest, readJson(requestPath));
  const candidateRequest: CandidateRequest =
    kind === 'committed' ? { kind, revision } : { kind, base: revision };
  process.stdout.write(
    `${JSON.stringify(extractRelationships(repository, readCandidate(repository, candidateRequest), request))}\n`,
  );
}

function writeIndexChecks(argv: string[]): void {
  const [kind, repository, revision] = argv.slice(1);
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error('index candidate kind must be committed, staged or working');
  }
  const request: CandidateRequest =
    kind === 'committed' ? { kind, revision } : { kind, base: revision };
  process.stdout.write(
    `${JSON.stringify(checkIndexes(repository, readCandidate(repository, request)))}\n`,
  );
}

function writeRootMigrationCheck(argv: string[]): void {
  const [kind, repository, revision, mapPath] = argv.slice(1);
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error('root migration candidate kind must be committed, staged or working');
  }
  const request: CandidateRequest =
    kind === 'committed' ? { kind, revision } : { kind, base: revision };
  process.stdout.write(
    `${JSON.stringify(checkRootMigration(repository, readCandidate(repository, request), mapPath))}\n`,
  );
}

function writeReviewProvenance(argv: string[]): void {
  const [, journalPath, evidencePath, requirementInput] = argv;
  if (requirementInput !== 'allow-local' && requirementInput !== 'require-external') {
    throw new Error('review provenance requirement must be allow-local or require-external');
  }
  const requirement: ProvenanceRequirement = requirementInput;
  const validation = validateReviewProvenance(
    readInvocationJournal(journalPath),
    readJson(evidencePath),
    requirement,
  );
  process.stdout.write(`${JSON.stringify(validation)}\n`);
}

const exhaustiveDocumentNames = [
  'inventory',
  'inventoryProtocol',
  'classificationPolicy',
  'contentManifestRequest',
  'exhaustivePolicy',
  'reviewProtocol',
  'moduleMapping',
  'granularityPolicy',
  'modelContext',
  'relationshipRequest',
  'artifactGraph',
] as const;

function readExhaustiveDocuments(paths: string[]) {
  if (paths.length !== exhaustiveDocumentNames.length) {
    throw new Error('exhaustive freeze requires all eleven named input documents');
  }
  const path = (name: (typeof exhaustiveDocumentNames)[number]): string => {
    const index = exhaustiveDocumentNames.indexOf(name);
    const selected = paths[index];
    return selected;
  };
  return {
    inventory: readJsonDocument(path('inventory')),
    inventoryProtocol: readJsonDocument(path('inventoryProtocol')),
    classificationPolicy: readJsonDocument(path('classificationPolicy')),
    contentManifestRequest: readJsonDocument(path('contentManifestRequest')),
    exhaustivePolicy: readJsonDocument(path('exhaustivePolicy')),
    reviewProtocol: readJsonDocument(path('reviewProtocol')),
    moduleMapping: readJsonDocument(path('moduleMapping')),
    granularityPolicy: readJsonDocument(path('granularityPolicy')),
    modelContext: readJsonDocument(path('modelContext')),
    relationshipRequest: readJsonDocument(path('relationshipRequest')),
    artifactGraph: readJsonDocument(path('artifactGraph')),
  };
}

async function writeExhaustiveFreeze(argv: string[]): Promise<void> {
  const [repository, revision, auditSeed, ...paths] = argv.slice(1);
  const { freezeExhaustivePlan } = await import('./review/exhaustive-coverage');
  const frozen = freezeExhaustivePlan(
    repository,
    revision,
    readExhaustiveDocuments(paths),
    auditSeed,
  );
  process.stdout.write(`${JSON.stringify(frozen)}\n`);
}

async function writeExhaustiveVerification(argv: string[]): Promise<void> {
  const [repository, planPath, expectedIdentity, auditSeed, ...paths] = argv.slice(1);
  const { verifyExhaustivePlan } = await import('./review/exhaustive-coverage');
  const verified = verifyExhaustivePlan(
    repository,
    expectedIdentity,
    readJson(planPath),
    readExhaustiveDocuments(paths),
    auditSeed,
  );
  process.stdout.write(`${JSON.stringify(verified)}\n`);
}

async function writeExhaustiveCoverage(argv: string[]): Promise<void> {
  const [repository, planPath, expectedIdentity, auditSeed, auditPath, ...paths] = argv.slice(1);
  const { evaluateExhaustiveCoverage, verifyExhaustivePlan } =
    await import('./review/exhaustive-coverage');
  const plan = readJson(planPath);
  // Proof: removing this verification let an omitted repository-root subject reach `{}` audit
  // decoding; the production CLI test received only missing audit fields instead of the omission.
  verifyExhaustivePlan(
    repository,
    expectedIdentity,
    plan,
    readExhaustiveDocuments(paths),
    auditSeed,
  );
  process.stdout.write(
    `${JSON.stringify(evaluateExhaustiveCoverage(plan, readJson(auditPath)))}\n`,
  );
}

declare const __TOOL_WIKI_BUNDLED_ARTIFACTS__: string;

function validatorEntryPaths(): string[] | { artifactManifest: string } {
  if (typeof __TOOL_WIKI_BUNDLED_ARTIFACTS__ === 'string') {
    return { artifactManifest: __TOOL_WIKI_BUNDLED_ARTIFACTS__ };
  }
  return [join(import.meta.dir, 'cli.ts'), join(import.meta.dir, 'policy', 'trust.ts')];
}

export function runCli(argv: readonly string[]): Promise<void> | void {
  const args = [...argv];
  if (args[0] === 'inspect-evaluation-coverage' && args.length !== 5) {
    // Proof: the missing-operand production CLI test received unknown-command before this guard.
    throw new Error(
      'usage: twilight-burokrat inspect-evaluation-coverage <repository> <full-sha> <external-rule-policy> <external-coverage-review>',
    );
  }
  if (args[0] === 'inspect-evaluation-coverage') {
    return import('./evidence/evaluation-coverage').then(({ inspectEvaluationCoverage }) => {
      const report = inspectEvaluationCoverage(
        args[1],
        args[2],
        args[3],
        args[4],
        import.meta.path,
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
      // Proof: removing this assignment made the unresolved production matrix return exit 0; its CLI test failed.
      if (report.rows.some((row) => row.evaluation === 'unevaluated')) process.exitCode = 1;
    });
  }
  if (args[0] === 'validate-progress-receipt') {
    // Proof: removing this refusal failed seven operand/process CLI cases in
    // progress-receipt.test.ts, replacing usage diagnostics with reads (2026-10-15).
    if (
      args.length !== 4 ||
      args.slice(1).some((path) => path.length === 0 || path.startsWith('-'))
    ) {
      throw new Error(
        'usage: twib validate-progress-receipt <receipt.json> <plan-reference.json> <tasks.json>',
      );
    }
    const receipt = readJsonDocument(args[1]);
    const reference = readJsonDocument(args[2]);
    const tasks = readJsonDocument(args[3]);
    process.stdout.write(
      `${JSON.stringify(validateProgressReceipt(receipt.input, reference.input, tasks.input))}\n`,
    );
    return;
  }
  if (args[0] === 'validate-plan-tasks') {
    // Proof: removing operand validation lost the named usage refusal in all five invalid
    // operand CLI cases (plan-tasks.test.ts, 2026-10-13).
    if (
      args.length !== 3 ||
      args.slice(1).some((path) => path.length === 0 || path.startsWith('-'))
    ) {
      throw new Error('usage: twib validate-plan-tasks <plan-reference.json> <tasks.json>');
    }
    const reference = readJsonDocument(args[1]);
    const tasks = readJsonDocument(args[2]);
    process.stdout.write(`${JSON.stringify(validatePlanTasks(reference.input, tasks.input))}\n`);
    return;
  }
  // Proof: removing this early route sent the incomplete binding command to RecordKind
  // decoding; its production CLI test lost invalid_arguments.
  if (args[0] === 'validate' && args[1] === 'workflow-binding') {
    const digest = runWorkflowBindingCommand(args, process.cwd());
    process.stdout.write(`${digest}\n`);
    return;
  }
  if (args.length === 3 && (args[0] === 'validate' || args[0] === 'validate-record')) {
    validateRecord(args);
    return;
  }
  if (args.length === 4 && args[0] === 'read-candidate') {
    readSelectedCandidate(args);
    return;
  }
  if (args.length === 5 && args[0] === 'classify-candidate') {
    classifyCandidate(args);
    return;
  }
  if ((args.length === 6 || args.length === 7) && args[0] === 'content-manifest') {
    writeContentManifest(args);
    return;
  }
  if (args.length === 6 && args[0] === 'validate-artifacts') {
    writeArtifactValidation(args);
    return;
  }
  if (args.length === 5 && args[0] === 'extract-relationships') {
    writeRelationships(args);
    return;
  }
  if (args.length === 4 && args[0] === 'check-indexes') {
    writeIndexChecks(args);
    return;
  }
  if (args.length === 5 && args[0] === 'check-root-migration') {
    writeRootMigrationCheck(args);
    return;
  }
  if (args.length === 4 && args[0] === 'validate-review-provenance') {
    writeReviewProvenance(args);
    return;
  }
  if (args.length === 15 && args[0] === 'freeze-exhaustive') {
    return writeExhaustiveFreeze(args);
  }
  if (args.length === 16 && args[0] === 'verify-exhaustive') {
    return writeExhaustiveVerification(args);
  }
  if (args.length === 17 && args[0] === 'evaluate-exhaustive-coverage') {
    return writeExhaustiveCoverage(args);
  }
  if (args.length === 7 && args[0] === 'lint-local') {
    return import('./policy/trust').then(({ writeLocalLintCommand }) => {
      writeLocalLintCommand(args, validatorEntryPaths());
    });
  }
  if (args.length === 5 && args[0] === 'lint-ci') {
    return import('./policy/trust').then(({ writeCiLintCommand }) => {
      writeCiLintCommand(args, validatorEntryPaths());
    });
  }
  if ((args.length === 2 || args.length === 4) && args[0] === 'explain') {
    return import('./rules/check').then(({ writeExplainCommand }) => {
      writeExplainCommand(args);
    });
  }
  if (args[0] === 'scenario') {
    return import('./rules/scenario-command').then(({ writeScenarioCommand }) => {
      writeScenarioCommand(args);
    });
  }
  if ((args.length === 5 || args.length === 7 || args.length === 9) && args[0] === 'check') {
    return import('./rules/check').then(({ writeCheckCommand }) => {
      writeCheckCommand(args);
    });
  }
  if (args.length === 4 && args[0] === 'candidate-identity') {
    return import('./rules/check').then(({ writeCandidateIdentityCommand }) => {
      writeCandidateIdentityCommand(args);
    });
  }
  if (args[0] === 'inspect-spec-sources') {
    // Proof: removing arity refusal made TEST-AXES-056's extra-argument CLI call succeed.
    if (args.length !== 3)
      throw new Error('usage: twilight-burokrat inspect-spec-sources <repository> <committed-sha>');
    return import('./evidence/spec-sources').then(({ inspectSpecSources }) => {
      process.stdout.write(`${JSON.stringify(inspectSpecSources(args[1], args[2]))}\n`);
    });
  }
  if (args[0] === 'inspect-browser-performance') {
    // Proof: removing arity or mode validation independently failed TEST-AXES-115's named usage refusal.
    const mode = args[4];
    if (args.length !== 6 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-performance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>',
      );
    return import('./evidence/browser-performance').then(({ inspectBrowserPerformance }) => {
      process.stdout.write(
        `${JSON.stringify(inspectBrowserPerformance(args[1], args[2], args[3], mode, args[5]))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-browser-architecture') {
    // Proof: removing arity or mode validation independently failed TEST-AXES-111's named usage refusal.
    const mode = args[4];
    if (args.length !== 6 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-architecture <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>',
      );
    return import('./evidence/browser-architecture').then(({ inspectBrowserArchitecture }) => {
      process.stdout.write(
        `${JSON.stringify(inspectBrowserArchitecture(args[1], args[2], args[3], mode, args[5]))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-browser-scenarios') {
    const mode = args[4];
    // Proof: removing arity or mode independently failed TEST-AXES-131's named production usage refusals.
    if (args.length !== 10 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-scenarios <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority> <capability>',
      );
    return import('./evidence/browser-scenarios').then(({ inspectBrowserScenarios }) => {
      const observation = inspectBrowserScenarios(
        args[1],
        args[2],
        args[3],
        mode,
        args[5],
        args[6],
        args[7],
        args[8],
        args[9],
      );
      process.stdout.write(`${JSON.stringify(observation)}\n`);
      // Proof: removal made TEST-AXES-129's missing-terminal findings exit zero.
      if (observation.citationFindings.length !== 0) process.exitCode = 1;
    });
  }
  if (args[0] === 'inspect-browser-source-levels') {
    const mode = args[4];
    // Proof: independent removals failed TEST-AXES-147 WATCH_cli-arity/mode's named usage refusals.
    if (args.length !== 9 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-source-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>',
      );
    return import('./evidence/browser-source-levels').then(({ inspectBrowserSourceLevels }) => {
      const observation = inspectBrowserSourceLevels(
        args[1],
        args[2],
        args[3],
        mode,
        args[5],
        args[6],
        args[7],
        args[8],
      );
      process.stdout.write(`${JSON.stringify(observation)}\n`);
      // Proof: removal made TEST-AXES-147 WATCH_cli-exit's valid wrong-level observation exit zero.
      if (observation.isolation.kind === 'wrong-level') process.exitCode = 1;
    });
  }
  if (args[0] === 'inspect-browser-levels') {
    const mode = args[4];
    // Proof: independently removing arity or mode validation failed TEST-AXES-124's named usage assertions.
    if (args.length !== 9 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>',
      );
    return import('./evidence/browser-levels').then(({ inspectBrowserLevels }) => {
      const observation = inspectBrowserLevels(
        args[1],
        args[2],
        args[3],
        mode,
        args[5],
        args[6],
        args[7],
        args[8],
      );
      process.stdout.write(`${JSON.stringify(observation)}\n`);
      // Proof: removing status mapping made TEST-AXES-123's wrong-level production call exit zero.
      if (observation.isolation.kind === 'wrong-level') process.exitCode = 1;
    });
  }
  if (args[0] === 'inspect-browser-conformance') {
    // Proof: removing arity or mode validation independently failed TEST-AXES-103's production usage refusals.
    const mode = args[4];
    if (args.length !== 6 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-conformance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>',
      );
    return import('./evidence/browser-conformance').then(({ inspectBrowserConformance }) => {
      process.stdout.write(
        `${JSON.stringify(inspectBrowserConformance(args[1], args[2], args[3], mode, args[5]))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-browser-memberships') {
    // Proof: removing arity or mode validation independently failed TEST-AXES-095's usage refusals.
    const mode = args[4];
    if (args.length !== 6 || (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable'))
      throw new Error(
        'usage: twilight-burokrat inspect-browser-memberships <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>',
      );
    return import('./evidence/browser-memberships').then(({ inspectBrowserMemberships }) => {
      process.stdout.write(
        `${JSON.stringify(inspectBrowserMemberships(args[1], args[2], args[3], mode, args[5]))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-browser-t2-policy') {
    // Proof: individual arity/flag removals accepted BROWSER-T2-POLICY-PREVIEW-002's extra/flag negatives.
    if (args.length !== 9 || args[7] !== '--now')
      throw new Error(
        'usage: twilight-burokrat inspect-browser-t2-policy <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> <external-proposed-policy> --now <UTC-instant>',
      );
    return import('./evidence/manual').then(({ readEvaluationInstant }) => {
      const evaluatedAt = readEvaluationInstant(args[8]);
      return import('./evidence/browser-t2-policy').then(({ inspectBrowserT2Policy }) => {
        const observation = inspectBrowserT2Policy(
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          args[6],
          evaluatedAt,
        );
        process.stdout.write(`${JSON.stringify(observation)}\n`);
        // Proof: clearing this status failed BROWSER-T2-POLICY-PREVIEW-006's enforced refusal CLI assertion.
        if (observation.proposedDisposition.kind === 'citation-refusals') process.exitCode = 1;
      });
    });
  }
  if (args[0] === 'inspect-browser-t2') {
    // Proof: individual arity/flag removals accepted TEST-AXES-143's extra/flag operand negatives.
    if (args.length !== 8 || args[6] !== '--now')
      throw new Error(
        'usage: twilight-burokrat inspect-browser-t2 <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>',
      );
    return import('./evidence/manual').then(({ readEvaluationInstant }) => {
      const evaluatedAt = readEvaluationInstant(args[7]);
      return import('./evidence/browser-t2').then(({ inspectBrowserT2 }) => {
        // Proof: adding debt-based exit one failed TEST-AXES-141's valid diagnostic with unassigned debt.
        const observation = inspectBrowserT2(
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          evaluatedAt,
        );
        process.stdout.write(`${JSON.stringify(observation)}\n`);
      });
    });
  }
  if (args[0] === 'inspect-browser-scenario-ledger') {
    // Proof: disabling arity/flag refusal failed TEST-AXES-139 extra/flag operand assertions.
    if (args.length !== 8 || args[6] !== '--now')
      throw new Error(
        'usage: twilight-burokrat inspect-browser-scenario-ledger <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC instant>',
      );
    return import('./evidence/manual').then(({ readEvaluationInstant }) => {
      const evaluatedAt = readEvaluationInstant(args[7]);
      return import('./evidence/browser-scenario-ledger').then(
        ({ inspectBrowserScenarioLedger }) => {
          const observation = inspectBrowserScenarioLedger(
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            evaluatedAt,
          );
          process.stdout.write(`${JSON.stringify(observation)}\n`);
          // Proof: removing debt exit mapping failed TEST-AXES-138 unassigned JSON/exit assertion.
          if (observation.debt.length !== 0) process.exitCode = 1;
        },
      );
    });
  }
  if (args[0] === 'inspect-scenario-ledger') {
    // Proof: removing arity/flag refusal accepted TEST-AXES-105's extra CLI operand.
    if (args.length !== 9 || args[7] !== '--now')
      throw new Error(
        'usage: twilight-burokrat inspect-scenario-ledger <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability> <external-ledger-authority> --now <UTC instant>',
      );
    return import('./evidence/manual').then(({ readEvaluationInstant }) => {
      const evaluatedAt = readEvaluationInstant(args[8]);
      return import('./evidence/scenario-ledger').then(({ inspectScenarioLedger }) => {
        const observation = inspectScenarioLedger(
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          args[6],
          evaluatedAt,
        );
        process.stdout.write(`${JSON.stringify(observation)}\n`);
        // Proof: disabling this exit mapping made TEST-AXES-104's named unassigned debt exit zero.
        if (observation.debt.length !== 0) process.exitCode = 1;
      });
    });
  }
  if (args[0] === 'inspect-performance-scenarios') {
    // Proof: removing arity validation accepted TEST-AXES-099's extra operand.
    if (args.length !== 6)
      throw new Error(
        'usage: twilight-burokrat inspect-performance-scenarios <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability>',
      );
    return import('./evidence/performance-scenarios').then(({ inspectPerformanceScenarios }) => {
      const observation = inspectPerformanceScenarios(args[1], args[2], args[3], args[4], args[5]);
      process.stdout.write(`${JSON.stringify(observation)}\n`);
      // Proof: removing this mapping made TEST-AXES-097's invalid citations exit zero.
      if (observation.citationFindings.length !== 0) process.exitCode = 1;
    });
  }
  if (args[0] === 'inspect-performance-levels') {
    // Proof: removing arity refusal accepted [TEST-AXES-090]'s extra CLI operand.
    if (args.length !== 5)
      throw new Error(
        'usage: twilight-burokrat inspect-performance-levels <repository> <committed-sha> <external-facts-authority> <external-rule-policy>',
      );
    return import('./evidence/performance-levels').then(({ inspectPerformanceLevels }) => {
      const observation = inspectPerformanceLevels(args[1], args[2], args[3], args[4]);
      process.stdout.write(`${JSON.stringify(observation)}\n`);
      // Proof: removing this status mapping made [TEST-AXES-089] exit zero for wrong-level JSON.
      if (observation.isolation.kind === 'wrong-level') process.exitCode = 1;
    });
  }
  if (args[0] === 'inspect-level-facts') {
    // Proof: [TEST-AXES-078] supplies an extra operand and requires this named usage refusal.
    if (args.length !== 4)
      throw new Error(
        'usage: twilight-burokrat inspect-level-facts <repository> <committed-sha> <external-authority>',
      );
    return import('./evidence/level-facts').then(({ inspectLevelFacts }) => {
      process.stdout.write(`${JSON.stringify(inspectLevelFacts(args[1], args[2], args[3]))}\n`);
    });
  }
  if (args[0] === 'inspect-manual') {
    // Proof: disabling this arity refusal made the production CLI usage assertion fail.
    if (!(args.length === 5 || (args.length === 7 && args[5] === '--now')))
      throw new Error(
        'usage: twilight-burokrat inspect-manual <repository> <committed-sha> <external-rule-policy> <report-path> --now <UTC instant>',
      );
    return import('./evidence/manual').then(({ inspectManual, readEvaluationInstant }) => {
      // Proof (2026-10-11): sampling `new Date()` here instead made `inspect-manual evaluated at
      // the last instant of the deadline date` exit 1 (overdue), and the missing and malformed
      // evaluation instant cases exit 0.
      const evaluatedAt = readEvaluationInstant(args[6]);
      const observation = inspectManual(args[1], args[2], args[3], args[4], evaluatedAt);
      process.stdout.write(`${JSON.stringify(observation)}\n`);
      // Proof: disabling this exit mapping made stale, failed and overdue production CLI
      // cases return exit 0 despite their structured nonpassing verdicts.
      if (observation.state !== 'current') process.exitCode = 1;
    });
  }
  if (args[0] === 'inspect-manual-observation') {
    // Proof: removing this refusal made the production CLI extra-operand assertion fail.
    if (args.length !== 7 || args[5] !== '--now')
      throw new Error(
        'usage: twilight-burokrat inspect-manual-observation <repository> <committed-sha> <external-rule-policy> <report-path> --now <UTC instant>',
      );
    return import('./evidence/manual').then(({ readEvaluationInstant }) => {
      // Proof: the exact deadline instants and malformed UTC production calls fail if the
      // supplied instant is replaced with a sampled clock or accepted without decoding.
      const evaluatedAt = readEvaluationInstant(args[6]);
      return import('./evidence/manual-observation').then(({ inspectManualObservation }) => {
        const observation = inspectManualObservation(
          args[1],
          args[2],
          args[3],
          args[4],
          evaluatedAt,
        );
        process.stdout.write(`${JSON.stringify(observation)}\n`);
        // Proof: disabling this exit mapping made evaluated stale, failed and overdue CLI cases exit zero.
        if (observation.manual.state !== 'current') process.exitCode = 1;
      });
    });
  }
  if (args[0] === 'inspect-performance') {
    // Proof: removing arity refusal made the extra-operand production CLI assertion fail.
    if (args.length !== 4)
      throw new Error(
        'usage: twilight-burokrat inspect-performance <repository> <committed-sha> <external-rule-policy>',
      );
    return import('./evidence/performance-bundle').then(({ inspectPerformanceBundle }) => {
      process.stdout.write(
        `${JSON.stringify(inspectPerformanceBundle(args[1], args[2], args[3]))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-performance-sources') {
    const usage =
      'usage: twilight-burokrat inspect-performance-sources <repository> <committed-sha> <external-rule-policy>';
    // Proof: disabling this guard made the extra-operand production CLI assertion fail.
    if (args.length !== 4) throw new Error(usage);
    return import('./evidence/performance-sources').then(({ inspectPerformanceSources }) => {
      process.stdout.write(
        `${JSON.stringify(inspectPerformanceSources(args[1], args[2], args[3]))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-browser') {
    if (args.length !== 5 || !['ordinary', 'packaged', 'portable'].includes(args[4] ?? ''))
      throw new Error(
        'usage: twilight-burokrat inspect-browser <repository> <committed-revision> <external-rule-policy> <ordinary|packaged|portable>',
      );
    return import('./evidence/browser').then(({ inspectBrowserBundle }) => {
      const mode = args[4];
      if (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable')
        throw new Error('Browser mode is malformed');
      process.stdout.write(
        `${JSON.stringify(inspectBrowserBundle(args[1], args[2], args[3], mode))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-bun-test-reports') {
    // Proof: removing arity validation lost TEST-AXES-151's malformed-operands refusal.
    if (args.length !== 4)
      throw new Error(
        'usage: twilight-burokrat inspect-bun-test-reports <repository> <full-committed-sha> <external-report-authority>',
      );
    return import('./evidence/bun-test-reports').then(({ inspectBunTestReports }) => {
      process.stdout.write(`${JSON.stringify(inspectBunTestReports(args[1], args[2], args[3]))}\n`);
    });
  }
  if (args[0] === 'inspect-test-reports') {
    // Proof: removing this arity refusal made the production extra-argument CLI call exit 0
    // instead of refusing the named command usage.
    if (args.length !== 5)
      throw new Error(
        'usage: twilight-burokrat inspect-test-reports <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable>',
      );
    const mode = args[4];
    // Proof: removing this mode refusal made the production unsupported-mode CLI assertion fail
    // with a later Browser policy diagnostic instead of the named command usage.
    if (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable')
      throw new Error(
        'usage: twilight-burokrat inspect-test-reports <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable>',
      );
    return import('./evidence/test-reports').then(({ inspectTestReports }) => {
      process.stdout.write(
        `${JSON.stringify(inspectTestReports(args[1], args[2], args[3], mode))}\n`,
      );
    });
  }
  if (args[0] === 'inspect-test-sources') {
    const usage =
      'usage: twilight-burokrat inspect-test-sources <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable>';
    // Proof: removing this guard let the extra-operand production CLI call return success.
    if (args.length !== 5) throw new Error(usage);
    const mode = args[4];
    // Proof: removing this guard changed the unsupported Performance CLI refusal into a later
    // Browser policy error, failing the command's named usage assertion.
    if (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable') throw new Error(usage);
    return import('./evidence/test-sources').then(({ inspectTestSources }) => {
      process.stdout.write(
        `${JSON.stringify(inspectTestSources(args[1], args[2], args[3], mode))}\n`,
      );
    });
  }
  if ((args.length === 2 || args.length === 3 || args.length === 7) && args[0] === 'template') {
    return import('./templates/verify').then(({ writeTemplateCommand }) => {
      writeTemplateCommand(args);
    });
  }
  if (args.length === 4 && args[0] === 'validate-policy-activation') {
    return import('./policy/trust').then(({ writePolicyActivationCommand }) => {
      writePolicyActivationCommand(args, validatorEntryPaths());
    });
  }
  // Proof: replacing this refusal with a successful return made the external package test
  // accept `not-a-command` with exit 0 instead of rejecting the unknown command.
  // Burokrat ships no authority writer: `submit-admission` moved to Twilight Dash. Proof:
  // re-adding its route above failed `submit-admission is an unknown command` (cli.test.ts) and
  // `the validator bundle carries no authority store` (packaging/bundle.test.ts) (2026-10-11).
  throw new Error(
    `unknown command: ${args[0] ?? '<missing>'}\nusage: twilight-burokrat <validate-progress-receipt|validate-plan-tasks|validate-record|read-candidate|candidate-identity|inspect-evaluation-coverage|inspect-performance|inspect-performance-sources|inspect-performance-levels|inspect-performance-scenarios|inspect-scenario-ledger|inspect-browser-t2-policy|inspect-browser-t2|inspect-browser-scenario-ledger|inspect-browser-scenarios|inspect-browser-source-levels|inspect-browser-levels|inspect-browser-performance|inspect-browser-architecture|inspect-browser-conformance|inspect-browser-memberships|inspect-browser|inspect-bun-test-reports|inspect-test-reports|inspect-test-sources|inspect-spec-sources|inspect-manual|inspect-manual-observation|classify-candidate|content-manifest|validate-artifacts|extract-relationships|check-indexes|check-root-migration|validate-review-provenance|freeze-exhaustive|verify-exhaustive|evaluate-exhaustive-coverage|lint-local|lint-ci|check|explain|scenario|template|validate-policy-activation> ...`,
  );
}

function fail(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`${message}\n`);
  // Proof: changing this to exit zero made the inconsistent Manual report production CLI
  // assertion accept a refused inspection despite its named stderr and empty stdout.
  process.exitCode = 1;
}

/**
 * Runs one command as the process entry does: output goes to `process.stdout`, a refusal is
 * written to `process.stderr` and sets `process.exitCode` to 1. Never rejects.
 *
 * Tests call this in-process instead of spawning `bun run cli.ts`, which cost a Bun start per
 * case on the gate host; only cases about the process boundary itself still spawn.
 */
export async function executeCli(argv: readonly string[]): Promise<void> {
  try {
    await runCli(argv);
  } catch (cause) {
    fail(cause);
  }
}

if (import.meta.main) void executeCli(process.argv.slice(2));
