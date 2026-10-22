import { isDeepStrictEqual } from 'node:util';

import {
  type ConnectedQuestionIdentity,
  decodeBoundaryCertificate,
  decodeConnectedSuccess,
  type StoredBoundaryCertificate,
  type StoredConnectedSuccess,
} from '@wbs/contracts/solver/connected-durable';
import type { ConnectedSolverOutcome } from '@wbs/contracts/solver/connected-solver-outcome';
import {
  decodePlanInfeasible,
  encodePlanInfeasible,
  type PlanInfeasibleResult,
} from '@wbs/contracts/solver/plan-infeasible';
import type { ConnectedOptimizationQuestion } from '@wbs/core/ports/scheduler';
import { canonicalConnectedStageInput } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { hashConnectedBytes } from './connected-question-identity';
import { readGeneration } from './optimization-generation';
import {
  currentOutcomeWriter,
  enforceLiveBudgetBound,
  type OptimizedOutcomeTransaction,
  type OutcomeWriteResult,
  type SlotClaim,
} from './optimized-schedule-cache';
import { toOptimizedScheduleCacheRow } from './optimizer-rows';
import {
  optimizationBoundaryCertificate,
  optimizedScheduleCache,
  type SolverFailureReason,
  type SolverObjectiveName,
} from './schema';

type Reader = SQLiteBunDatabase | OptimizedOutcomeTransaction;
export type ConnectedQuestion = ConnectedOptimizationQuestion;
/** Scope-bearing durable outcomes cannot masquerade as the local Schedule envelope. */
export type ConnectedCachedOutcome =
  | { readonly kind: 'miss' }
  | { readonly kind: 'corrupt'; readonly message: string; readonly createdAt: number }
  | {
      [Kind in ConnectedSolverOutcome['kind']]: {
        readonly kind: Kind;
        readonly outcome: Extract<ConnectedSolverOutcome, { readonly kind: Kind }>;
        readonly createdAt: number;
      };
    }[ConnectedSolverOutcome['kind']];
export type ConnectedOutcomeToStore =
  | { readonly kind: 'ok'; readonly success: StoredConnectedSuccess }
  | { readonly kind: 'boundary-infeasible'; readonly certificate: StoredBoundaryCertificate }
  | { readonly kind: 'failed'; readonly reason: SolverFailureReason }
  | { readonly kind: 'plan-infeasible'; readonly certificate: PlanInfeasibleResult };

// Proof: removing question validation failed `malformed request identity cannot become a cache miss`.
function requireQuestion(question: ConnectedQuestion): void {
  const { projectId, inputHash, objective, contractVersion, budgetMs, quantum, wireVersion } =
    question;
  if (
    hashConnectedBytes(question.stageBytes) !== inputHash ||
    quantum !== 48 ||
    wireVersion !== 5 ||
    hashConnectedBytes(
      JSON.stringify([
        projectId,
        inputHash,
        objective,
        contractVersion,
        budgetMs,
        quantum,
        wireVersion,
      ]),
    ) !== question.questionHash
  )
    throw new Error('connected question identity differs from canonical bytes');
}
// Proof: isolated per-field checks passed; removing each then failed `compares decoded <field>`.
// Stage bytes and full question hash independently protect the same dimensions (verify.md).
function requireCorrespondence(
  question: ConnectedQuestion,
  identity: ConnectedQuestionIdentity,
  bytes: string,
): void {
  for (const field of [
    'projectId',
    'inputHash',
    'objective',
    'contractVersion',
    'budgetMs',
    'quantum',
    'wireVersion',
    'questionHash',
  ] as const) {
    if (question[field] !== identity[field])
      throw new Error(`stored connected identity differs: ${field}`);
  }
  if (question.stageBytes !== bytes)
    throw new Error('stored connected stage differs from requested stage');
}
// Proof: removing each key predicate failed `isolates cache lookup by <field>`; objective failed the local-envelope isolation case.
function cachePredicate(question: ConnectedQuestion) {
  return and(
    eq(optimizedScheduleCache.projectId, question.projectId),
    eq(optimizedScheduleCache.inputHash, question.inputHash),
    eq(optimizedScheduleCache.objective, question.objective),
    eq(optimizedScheduleCache.contractVersion, question.contractVersion),
    eq(optimizedScheduleCache.budgetMs, question.budgetMs),
  );
}
// Proof: each removed key predicate failed its isolation case; objective failed the fractional retained roundtrip.
function certificatePredicate(question: ConnectedQuestion) {
  return and(
    eq(optimizationBoundaryCertificate.projectId, question.projectId),
    eq(optimizationBoundaryCertificate.inputHash, question.inputHash),
    eq(optimizationBoundaryCertificate.objective, question.objective),
    eq(optimizationBoundaryCertificate.contractVersion, question.contractVersion),
    eq(optimizationBoundaryCertificate.budgetMs, question.budgetMs),
  );
}
function readOutcome(db: Reader, question: ConnectedQuestion): ConnectedCachedOutcome {
  requireQuestion(question);
  const certificate = db
    .select()
    .from(optimizationBoundaryCertificate)
    .where(certificatePredicate(question))
    .get();
  const cached = db.select().from(optimizedScheduleCache).where(cachePredicate(question)).get();
  // Proof: bypassing this source lost the certificate after turnover in the retained fractional roundtrip.
  if (certificate !== undefined) {
    const decoded = decodeBoundaryCertificate(
      JSON.parse(certificate.certificateJson),
      hashConnectedBytes,
    );
    requireCorrespondence(
      question,
      decoded.identity,
      canonicalConnectedStageInput(decoded.certificate.stage),
    );
    // Proof: removing conflict refusal failed `cannot mask a retained certificate`.
    if (cached !== undefined)
      throw new Error('conflicting connected certificate and cache evidence');
    return {
      kind: 'boundary-infeasible',
      outcome: { kind: 'boundary-infeasible', certificate: decoded.certificate },
      createdAt: certificate.createdAt,
    };
  }
  if (cached === undefined) return { kind: 'miss' };
  const row = toOptimizedScheduleCacheRow(cached);
  // Proof: moving missing payload/reason checks outside this recovery boundary failed the
  // missing-cache repository/captured-read and exact admitted terminal replacement cases.
  try {
    if (row.status === 'failed') {
      if (row.failureReason === null) throw new Error('connected failure lacks reason');
      return {
        kind: 'failed',
        outcome: { kind: 'failed', reason: row.failureReason },
        createdAt: row.createdAt,
      };
    }
    if (row.resultJson === null) throw new Error('connected outcome lacks payload');
    if (row.status === 'plan-infeasible')
      return {
        kind: 'plan-infeasible',
        outcome: {
          kind: 'plan-infeasible',
          certificate: decodePlanInfeasible(JSON.parse(row.resultJson)),
        },
        createdAt: row.createdAt,
      };
    const decoded = decodeConnectedSuccess(JSON.parse(row.resultJson), hashConnectedBytes);
    requireCorrespondence(question, decoded.identity, canonicalConnectedStageInput(decoded.stage));
    return { kind: 'ok', outcome: decoded.outcome, createdAt: row.createdAt };
  } catch (cause) {
    return {
      kind: 'corrupt',
      message: cause instanceof Error ? cause.message : String(cause),
      createdAt: row.createdAt,
    };
  }
}
/** Read both sources even before generation allocation; the caller owns snapshot lifetime. */
export function readConnectedOptimizationPair(
  db: Reader,
  ask: { readonly questions: Readonly<Record<SolverObjectiveName, ConnectedQuestion>> },
) {
  const { pri, time } = ask.questions;
  if (
    pri.projectId !== time.projectId ||
    pri.contractVersion !== time.contractVersion ||
    pri.inputHash !== time.inputHash ||
    pri.stageBytes !== time.stageBytes ||
    pri.budgetMs !== time.budgetMs ||
    pri.objective !== 'pri' ||
    time.objective !== 'time'
  )
    throw new Error('connected pair questions differ');
  const current = readGeneration(db, pri.projectId, pri.contractVersion);
  return {
    generation: current?.generation ?? null,
    generationInputHash: current?.inputHash ?? null,
    variants: { pri: readOutcome(db, pri), time: readOutcome(db, time) },
  };
}
/** Caller transaction atomically stores admitted evidence; event and slot release remain the runtime owner's responsibility. */
export function storeConnectedOptimizationOutcomeIn(
  tx: OptimizedOutcomeTransaction,
  write: {
    readonly claim: SlotClaim;
    readonly admittedCancelEpoch: number;
    readonly question: ConnectedQuestion;
    readonly outcome: ConnectedOutcomeToStore;
    readonly now: number;
  },
): OutcomeWriteResult {
  const { claim, question, outcome } = write;
  requireQuestion(question);
  if (
    claim.projectId !== question.projectId ||
    claim.objective !== question.objective ||
    claim.contractVersion !== question.contractVersion ||
    claim.budgetMs !== question.budgetMs
  )
    throw new Error('connected claim differs from question');
  const held = currentOutcomeWriter(tx, claim, write.admittedCancelEpoch, write.now);
  if (held === null) return 'superseded';
  // Proof: removing this fence stored stale evidence in `fences changed input hash without generation change`.
  if (readGeneration(tx, claim.projectId, claim.contractVersion)?.inputHash !== question.inputHash)
    return 'superseded';
  let payload: string | null = null;
  if (outcome.kind === 'ok') {
    const decoded = decodeConnectedSuccess(outcome.success, hashConnectedBytes);
    requireCorrespondence(question, decoded.identity, canonicalConnectedStageInput(decoded.stage));
    payload = JSON.stringify(outcome.success);
  } else if (outcome.kind === 'boundary-infeasible') {
    const decoded = decodeBoundaryCertificate(outcome.certificate, hashConnectedBytes);
    requireCorrespondence(
      question,
      decoded.identity,
      canonicalConnectedStageInput(decoded.certificate.stage),
    );
    payload = JSON.stringify(outcome.certificate);
  } else if (outcome.kind === 'plan-infeasible')
    payload = JSON.stringify(encodePlanInfeasible(outcome.certificate));
  const retained = tx
    .select()
    .from(optimizationBoundaryCertificate)
    .where(certificatePredicate(question))
    .get();
  if (retained !== undefined) {
    readOutcome(tx, question);
    if (
      outcome.kind !== 'boundary-infeasible' ||
      !isDeepStrictEqual(JSON.parse(retained.certificateJson), outcome.certificate)
    )
      throw new Error('conflicting retained connected evidence');
    return 'already-recorded';
  }
  const previous = tx.select().from(optimizedScheduleCache).where(cachePredicate(question)).get();
  if (previous !== undefined) {
    const existing = readOutcome(tx, question);
    const diagnostic = existing.kind === 'failed' || existing.kind === 'corrupt';
    if (!diagnostic || previous.createdAt >= held.startedAt) {
      if (outcome.kind === 'boundary-infeasible')
        throw new Error('connected terminal conflicts with existing outcome');
      return 'already-recorded';
    }
    tx.delete(optimizedScheduleCache)
      .where(
        and(
          cachePredicate(question),
          eq(optimizedScheduleCache.generation, previous.generation),
          eq(optimizedScheduleCache.createdAt, previous.createdAt),
        ),
      )
      .run();
  }
  if (outcome.kind === 'boundary-infeasible') {
    if (payload === null) throw new Error('connected certificate lacks payload');
    tx.insert(optimizationBoundaryCertificate)
      .values({
        ...question,
        certificateJson: payload,
        generation: claim.generation,
        attemptToken: claim.attemptToken,
        createdAt: write.now,
      })
      .run();
  } else {
    tx.insert(optimizedScheduleCache)
      .values({
        ...question,
        generation: claim.generation,
        status: outcome.kind,
        resultJson: payload,
        failureReason: outcome.kind === 'failed' ? outcome.reason : null,
        createdAt: write.now,
      })
      .run();
    enforceLiveBudgetBound(tx, question);
  }
  return 'stored';
}
