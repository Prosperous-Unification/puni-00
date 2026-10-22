import {
  canonicalConnectedStageInput,
  type ConnectedOptimizationStage,
  contractVersionOf,
  type RealObjectiveValues,
  SOLVER_QUANTUM,
} from '@wbs/domain';
import { type } from 'arktype';

import { buildConnectedSolverRequest } from './build-connected-solver-request';
import {
  type ConnectedBoundaryEvidence,
  type ConnectedSolverOutcome,
  evaluateConnectedSolverOutcome,
} from './connected-solver-outcome';
import { parseConnectedSolverResponse } from './parse-solver-response';
import {
  decodeConnectedStage,
  encodeConnectedStage,
  type StoredConnectedStage,
} from './stored-connected-stage';
import {
  type ConnectedSolverRequest,
  type ConnectedSolverResponse,
  SOLVER_WIRE_VERSION,
  type SolverObjective,
} from './wire-types';
export { decodeConnectedStage, encodeConnectedStage } from './stored-connected-stage';

/** Synchronous SHA-256 UTF-8 adapter. Mandatory: a stored token never substitutes for recomputed identity. */
export type ConnectedDigest = (bytes: string) => string;
const identityShape = type({
  '+': 'reject',
  projectId: 'string',
  inputHash: 'string',
  questionHash: 'string',
  objective: "'pri' | 'time'",
  contractVersion: 'string',
  budgetMs: 'number',
  quantum: '48',
  wireVersion: '5',
});
/** Complete mathematical identity, independent of generation, epoch and attempt attribution. */
export type ConnectedQuestionIdentity = typeof identityShape.infer;

/** The full tuple deliberately keeps runtime dimensions separate from the canonical stage input hash. */
export function createConnectedQuestionIdentity(
  stage: ConnectedOptimizationStage,
  objective: SolverObjective,
  installed: { readonly solverVersion: string; readonly budgetMs: number },
  hash: ConnectedDigest,
): ConnectedQuestionIdentity {
  const inputHash = hash(canonicalConnectedStageInput(stage));
  const contractVersion = contractVersionOf(installed.solverVersion);
  return {
    projectId: stage.projectId,
    inputHash,
    objective,
    contractVersion,
    budgetMs: installed.budgetMs,
    quantum: SOLVER_QUANTUM,
    wireVersion: SOLVER_WIRE_VERSION,
    // Proof: omitting each of the seven array members independently broke `identity separates every runtime tuple dimension and shares stage input across objectives`.
    questionHash: hash(
      JSON.stringify([
        stage.projectId,
        inputHash,
        objective,
        contractVersion,
        installed.budgetMs,
        SOLVER_QUANTUM,
        SOLVER_WIRE_VERSION,
      ]),
    ),
  };
}

/** Object-key order is immaterial; array ordering is evidence and must match canonical preparation. */
function stableBytes(value: unknown): string {
  return JSON.stringify(value, (_key, held: unknown) => {
    if (held === undefined) throw new Error('stored connected evidence contains undefined');
    // Proof: removing this check admitted NaN as a null deadline in `nonfinite forged null request fields are rejected before JSON equality`.
    if (typeof held === 'number' && !Number.isFinite(held))
      throw new Error('stored connected evidence contains nonfinite number');
    if (held !== null && typeof held === 'object' && !Array.isArray(held)) {
      return Object.fromEntries(
        Object.entries(held).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return held;
  });
}
function requireEqual(actual: unknown, expected: unknown, field: string): void {
  if (stableBytes(actual) !== stableBytes(expected))
    throw new Error(`stored connected evidence differs: ${field}`);
}
const envelopeShape = type({
  '+': 'reject',
  dtoVersion: '2',
  scope: { '+': 'reject', kind: "'connected-stage'", projectId: 'string' },
  identity: identityShape,
  stage: 'unknown',
  request: 'unknown',
  response: 'unknown',
  publication: "'optimized' | 'baseline'",
  comparison: 'unknown',
});
const certificateShape = type({
  '+': 'reject',
  dtoVersion: '1',
  kind: "'boundary-infeasible'",
  scope: { '+': 'reject', kind: "'connected-stage'", projectId: 'string' },
  identity: identityShape,
  stage: 'unknown',
  request: 'unknown',
  evidence: 'unknown',
});

function validateQuestion(
  rawStage: unknown,
  identity: ConnectedQuestionIdentity,
  rawRequest: unknown,
  scopeProject: string,
  hash: ConnectedDigest,
) {
  const stage = decodeConnectedStage(rawStage);
  // Request fields remain untrusted until exact equality with builder output; only installed version is read here.
  const versionShape = type({ solverVersion: 'string' });
  const installed = versionShape.assert(rawRequest);
  const expected = createConnectedQuestionIdentity(
    stage,
    identity.objective,
    { solverVersion: installed.solverVersion, budgetMs: identity.budgetMs },
    hash,
  );
  // Proof: removing equality admitted coherent forged scope echoes in `coherent forged hash echoes cannot substitute for recomputed full identity`.
  requireEqual(identity, expected, 'identity');
  // Proof: removing equality admitted project A on stage B in `scope project and stored comparison cannot be forged independently`.
  requireEqual(scopeProject, stage.projectId, 'scope');
  const prepared = buildConnectedSolverRequest(
    stage,
    identity,
    { solverVersion: installed.solverVersion, budgetMs: identity.budgetMs },
    identity.objective,
  );
  if (prepared.kind === 'failed')
    throw new Error(`stored connected preparation failed: ${prepared.failure}`);
  // Proof: removing correspondence admitted the forged request budget in `forged request candidate publication contributors and truncated bytes refuse`.
  requireEqual(rawRequest, prepared.request, 'request');
  return { stage, prepared };
}

/** Candidate response and scoped comparison survive baseline publication; no cached foreign schedule is authoritative. */
export interface StoredConnectedSuccess {
  readonly dtoVersion: 2;
  readonly scope: { readonly kind: 'connected-stage'; readonly projectId: string };
  readonly identity: ConnectedQuestionIdentity;
  readonly stage: StoredConnectedStage;
  readonly request: ConnectedSolverRequest;
  readonly response: ConnectedSolverResponse;
  readonly publication: 'optimized' | 'baseline';
  readonly comparison: {
    readonly values: RealObjectiveValues;
    readonly optimizedValues: RealObjectiveValues;
    readonly baselineValues: RealObjectiveValues;
  };
}

/** Revalidate raw candidate evidence and replay using the request's canonical quantized movement origin. */
export function decodeConnectedSuccess(raw: unknown, hash: ConnectedDigest) {
  // Proof: bypassing this schema admitted envelope omissions/unknown fields; bypassing cloning
  // leaked the caller's identity mutation in `decoded stage and identity detach caller-owned objects after validation`.
  const stored = envelopeShape.assert(structuredClone(raw));
  const { stage, prepared } = validateQuestion(
    stored.stage,
    stored.identity,
    stored.request,
    stored.scope.projectId,
    hash,
  );
  if (prepared.kind !== 'request')
    throw new Error('stored connected success has contradictory boundaries');
  const outcome = evaluateConnectedSolverOutcome(stage, prepared.request, {
    kind: 'response',
    stdout: stableBytes(stored.response),
  });
  if (outcome.kind !== 'ok') throw new Error('stored connected success candidate is not feasible');
  // Proof: removing equality admitted the forged baseline choice in `forged request candidate publication contributors and truncated bytes refuse`.
  requireEqual(stored.publication, outcome.decision.chosen, 'publication');
  // Proof: removing equality admitted movement=999 in `scope project and stored comparison cannot be forged independently`.
  requireEqual(
    stored.comparison,
    {
      values: outcome.decision.values,
      optimizedValues: outcome.decision.optimizedValues,
      baselineValues: outcome.decision.baselineValues,
    },
    'comparison',
  );
  return { identity: stored.identity, stage, request: prepared.request, outcome };
}

/** Build only from raw solver output, retaining its rejected candidate even when real publication chooses baseline. */
export function encodeConnectedSuccess(
  stage: ConnectedOptimizationStage,
  identity: ConnectedQuestionIdentity,
  request: ConnectedSolverRequest,
  stdout: string,
  hash: ConnectedDigest,
): StoredConnectedSuccess {
  const parsed = parseConnectedSolverResponse(stdout, request);
  if (!parsed.ok) throw new Error(`stored connected success response: ${parsed.failure}`);
  const outcome = evaluateConnectedSolverOutcome(stage, request, { kind: 'response', stdout });
  if (outcome.kind !== 'ok') throw new Error('stored connected success requires feasible response');
  const stored: StoredConnectedSuccess = structuredClone({
    dtoVersion: 2,
    scope: { kind: 'connected-stage', projectId: stage.projectId },
    identity,
    stage: encodeConnectedStage(stage),
    request,
    response: parsed.response,
    publication: outcome.decision.chosen,
    comparison: {
      values: outcome.decision.values,
      optimizedValues: outcome.decision.optimizedValues,
      baselineValues: outcome.decision.baselineValues,
    },
  });
  decodeConnectedSuccess(stored, hash);
  return stored;
}

/** Durable scoped terminal; generation and attempt attribution belong to its repository row, never its mathematical identity. */
export interface StoredBoundaryCertificate {
  readonly dtoVersion: 1;
  readonly kind: 'boundary-infeasible';
  readonly scope: { readonly kind: 'connected-stage'; readonly projectId: string };
  readonly identity: ConnectedQuestionIdentity;
  readonly stage: StoredConnectedStage;
  readonly request: ConnectedSolverRequest;
  readonly evidence: ConnectedBoundaryEvidence['evidence'];
}

/** Direct contradictions must exactly match all canonical contributors; solver terminals must pass the full response validator. */
export function decodeBoundaryCertificate(raw: unknown, hash: ConnectedDigest) {
  // Proof: bypassing schema admitted terminal envelope omissions/unknown fields; bypassing cloning
  // leaked the caller's identity mutation in `decoded stage and identity detach caller-owned objects after validation`.
  const stored = certificateShape.assert(structuredClone(raw));
  const { stage, prepared } = validateQuestion(
    stored.stage,
    stored.identity,
    stored.request,
    stored.scope.projectId,
    hash,
  );
  let certificate: ConnectedBoundaryEvidence;
  if (prepared.kind === 'boundary-infeasible') {
    // Proof: removing equality admitted forged lower/upper/key/contributors in `forged request candidate publication contributors and truncated bytes refuse`.
    requireEqual(stored.evidence, prepared.evidence, 'contradiction');
    certificate = {
      kind: 'boundary-infeasible',
      stage,
      request: prepared.request,
      evidence: prepared.evidence,
    };
  } else {
    const evidence = type({
      '+': 'reject',
      kind: "'solver-proven-infeasible'",
      response: 'unknown',
    }).assert(stored.evidence);
    const outcome: ConnectedSolverOutcome = evaluateConnectedSolverOutcome(
      stage,
      prepared.request,
      { kind: 'response', stdout: stableBytes(evidence.response) },
    );
    // Proof: removing this status guard accepted ordinary infeasible/unknown/feasible evidence in `ordinary infeasible unknown and feasible responses cannot certify a boundary`.
    if (outcome.kind !== 'boundary-infeasible')
      throw new Error('stored boundary certificate requires initial-model infeasibility');
    certificate = outcome.certificate;
  }
  return { identity: stored.identity, certificate };
}

/** Validate before emitting detached JSON; neither ordinary infeasibility nor unknown/timeout can be stored here. */
export function encodeBoundaryCertificate(
  stage: ConnectedOptimizationStage,
  identity: ConnectedQuestionIdentity,
  request: ConnectedSolverRequest,
  evidence: ConnectedBoundaryEvidence['evidence'],
  hash: ConnectedDigest,
): StoredBoundaryCertificate {
  const stored: StoredBoundaryCertificate = structuredClone({
    dtoVersion: 1,
    kind: 'boundary-infeasible',
    scope: { kind: 'connected-stage', projectId: stage.projectId },
    identity,
    stage: encodeConnectedStage(stage),
    request,
    evidence,
  });
  decodeBoundaryCertificate(stored, hash);
  return stored;
}
