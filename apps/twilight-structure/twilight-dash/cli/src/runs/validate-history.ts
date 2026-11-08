import { decodeRecordedExecution } from './execution-codecs';
import type { ExecutionHistory3, RecordedExecution } from './execution-records';
import { claimAcceptTransition, claimStageTransition, turnStageTransition } from './plan-claims';
import {
  advanceAttempt,
  executionCheckpoint,
  isExecuting,
  planExecutionTransition,
} from './plan-execution';
import { planOutcomeTransition, type RecordedCompletion } from './plan-outcome';
import { planReceiptTransition, type RecordedReceipt } from './plan-receipt';
import { findRecoveryCommand } from './plan-recovery-history';
import { reconstructRuntimePrefix } from './plan-recovery-history';
import { auditRuntimeCatalog, type RuntimeCatalog } from './plan-runtime';
import { planDecision, type RecordedConsumption } from './plan-signals';
import { writeAcceptanceTransition, writeStageTransition } from './plan-writes';
import {
  addInteger,
  decodeAdmission,
  decodeAttempt,
  decodeCompletion,
  decodeCurrentAttempt,
  decodeDecision,
  decodeManifest,
  decodeReceipt,
  equalRecords,
} from './record-codecs';
import type {
  Admission,
  Attempt,
  AttemptId,
  Decision,
  HumanWait,
  Manifest,
  OwnershipStatus,
  Run,
} from './records';
import { equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
import type { RuntimeScope } from './runtime-records';
import { decodeRecordedWrite, decodeWriteObligation, decodeWriteReceipt } from './write-codecs';
import type { RecordedWrite, WriteObligation, WriteReceipt } from './write-records';

export interface HistoryCatalog {
  readonly ownership: OwnershipStatus;
  readonly runtime: RuntimeCatalog;
  readonly manifests: readonly Manifest[];
  readonly runs: readonly { readonly run: Run; readonly initial: Run }[];
  readonly attempts: readonly { readonly attempt: Attempt; readonly admission: Admission }[];
  readonly executions: readonly RecordedExecution[];
  readonly consumptions: readonly RecordedConsumption[];
  readonly completions: readonly RecordedCompletion[];
  readonly receipts: readonly RecordedReceipt[];
  readonly decisions: readonly Decision[];
  readonly reservations: readonly AttemptId[];
  readonly capacity: number;
  readonly writes: readonly RecordedWrite[];
  readonly obligations: readonly WriteObligation[];
  readonly writeReceipts: readonly WriteReceipt[];
}
/** Reconstructs a complete consecutive historical prefix from independent scope events; today's projected grant is never historical input. */
function scopePrefix(catalog: HistoryCatalog, scope: RuntimeScope, revision: number) {
  const retained = catalog.runtime.scopes.find((candidate) =>
    equalRuntimeScopes(candidate.pin.scope, scope),
  );
  // Proof: F192 removed this sampled check; 'remaining unavailable scope diagnostic' received "undefined is not an object (evaluating 'retained.revision')" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
  // Proof: F193 removed this sampled check; 'remaining future scope diagnostic' received "corrupt runtime final revision" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
  if (retained === undefined || revision > retained.revision)
    throw new Error('execution scope context is unavailable');
  return reconstructRuntimePrefix(retained, catalog.runtime, catalog.ownership, revision);
}

/** Folds scopes first, then every original attempt acknowledgement at its true predecessor, and finally cross-links/projections/reservations. Every execution is decoded before dispatch; {@link decodeRecordedExecution} owns command/context/reply correlation, so null context precisely selects ordinary execution. {@link decodeRecordedWrite} likewise owns write command/target/reply correlation. Coherent replacement of every independent fact is outside this local integrity claim. */
export function validateHistory(catalog: HistoryCatalog): readonly ExecutionHistory3[] {
  // Proof: F158 removed this sampled check; 'retained history owner scope audit precedes attempts' accepted its positive then lost rejection. Exact restoration passed.
  auditRuntimeCatalog(catalog.runtime, catalog.ownership);
  const runs = new Map(catalog.runs.map((entry) => [entry.run.runId, entry]));
  const attempts = new Map(catalog.attempts.map((entry) => [entry.attempt.attemptId, entry]));
  const manifests = new Map(
    catalog.manifests.map((manifest) => [manifest.digest, decodeManifest(manifest)]),
  );
  // Proof: F140 removed only this sampled check; 'retained history owner duplicate manifest identity' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  // Proof: F159 removed this sampled check; 'retained history owner duplicate run identity' accepted its positive then lost rejection. Exact restoration passed.
  // Proof: F160 removed this sampled check; 'retained history owner duplicate attempt identity' accepted its positive then lost rejection. Exact restoration passed.
  if (
    runs.size !== catalog.runs.length ||
    attempts.size !== catalog.attempts.length ||
    manifests.size !== catalog.manifests.length
  )
    throw new Error('duplicate history identity');
  const executions = catalog.executions.map(decodeRecordedExecution);
  const writes = catalog.writes.map(decodeRecordedWrite);
  const obligations = catalog.obligations.map(decodeWriteObligation);
  const writeReceipts = catalog.writeReceipts.map(decodeWriteReceipt);
  const executionIds = new Set(executions.map((entry) => entry.command.commandId));
  const writeIds = writes.map((entry) => entry.command.commandId);
  if (
    // Proof: catalog-local-duplicates broke “history owner duplicate write local diagnostic uses an actual provider catalog”; later fold guards still refuse. Diagnostic only; exact hash restored.
    new Set(writeIds).size !== writeIds.length ||
    // Proof: catalog-execution-reservation omitted this guard; a coherent actual legacy execution collision lost its named refusal. Exact hash restored.
    writeIds.some((identity) => executionIds.has(identity))
  )
    throw new Error('duplicate local submission identity');
  if (
    // Proof: catalog-settlement-duplicates broke “history owner duplicate write settlement diagnostic uses an actual provider catalog”; later settlement guards still refuse. Diagnostic only; exact hash restored.
    new Set(obligations.map((entry) => entry.stageCommandId)).size !== obligations.length ||
    new Set(writeReceipts.map((entry) => entry.stageCommandId)).size !== writeReceipts.length
  )
    throw new Error('duplicate write settlement identity');
  for (const entry of writes) {
    const target = attempts.get(entry.attemptId);
    // Proof: catalog-foreign-write broke “complete catalog rejects a genuine foreign write journal instead of hiding it behind another valid run”; exact source hash restored.
    if (target?.attempt.identity.runId !== entry.runId) throw new Error('orphan write history');
    // Proof: catalog-recovery-reservation omitted this guard; the coherent actual recovery reservation collision lost refusal. Exact hash restored.
    const reserved = findRecoveryCommand(catalog.runtime.recovery, entry.command.commandId);
    const isOwnRecoveryAcceptance =
      entry.kind === 'accept_write' &&
      reserved?.intent.target.kind === 'write' &&
      reserved.intent.target.acceptanceCommandId === entry.command.commandId &&
      reserved.closure?.version === 2 &&
      reserved.closure.originalReply?.kind === 'write' &&
      equalRecords(reserved.closure.originalReply.command, entry.command) &&
      equalRecords(reserved.closure.originalReply.ack, entry.reply);
    // Proof: Z03 removing only this reservation check lost its required borrowed-ack diagnostic; the later original acknowledgement check still rejected the corruption. Diagnostic-only; both providers restored exactly.
    if (reserved !== undefined && !isOwnRecoveryAcceptance)
      throw new Error('corrupt write recovery command collision');
  }
  const writeStages = writes.filter((entry) => entry.kind === 'stage_write');
  for (const obligation of obligations)
    if (!writeStages.some((entry) => entry.command.commandId === obligation.stageCommandId))
      // Proof: fold-orphan-obligation broke “every public entry audits extra orphan obligation with agreeing count behind plausible current write state”; exact source hash restored.
      throw new Error('orphan write obligation');
  for (const receipt of writeReceipts)
    if (
      !writes.some(
        (entry) => entry.kind === 'accept_write' && equalRecords(entry.reply.receipt, receipt),
      )
    )
      // Proof: fold-orphan-receipt broke “every public entry audits extra orphan local receipt with agreeing count behind plausible current write state”; exact source hash restored.
      throw new Error('orphan local write receipt');
  const commandIds = new Set(executions.map((entry) => entry.command.commandId));
  // Proof: F165 removed this sampled check; 'retained history owner duplicate execution diagnostic' accepted its positive then received corrupt attempt event revision instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
  if (commandIds.size !== executions.length) throw new Error('duplicate execution identity');
  // Proof: F141 removed only this sampled check; 'retained history owner orphan execution' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  for (const entry of executions)
    if (!attempts.has(entry.reply.attempt.attemptId)) throw new Error('orphan execution history');
  // Proof: F142 removed only this sampled check; 'retained history owner orphan consumption' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  for (const consumption of catalog.consumptions)
    if (!attempts.has(consumption.reply.attemptId)) throw new Error('orphan consumption history');
  // Proof: F143 removed only this sampled check; 'retained history owner orphan completion' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  for (const completion of catalog.completions)
    if (!attempts.has(completion.attemptId)) throw new Error('orphan completion history');
  // Proof: F144 removed only this sampled check; 'retained history owner orphan receipt' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  for (const receipt of catalog.receipts)
    if (!attempts.has(receipt.reply.attemptId)) throw new Error('orphan receipt history');
  // Proof: F145 removed only this sampled check; 'retained history owner orphan decision' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  for (const decision of catalog.decisions)
    if (!attempts.has(decision.attemptId)) throw new Error('orphan decision history');
  const acceptanceCommands = new Set<string>();
  const recoveryCommands = new Set(
    catalog.runtime.recovery.histories.flatMap((history) => [
      history.intent.recoveryId,
      ...history.fences.map(
        (fence) => readRuntimeRequest(fence.canonicalRequest).operation.commandId,
      ),
    ]),
  );
  if (executions.some((entry) => recoveryCommands.has(entry.command.commandId)))
    // Proof: R2F46 removed only this check; 'recovery identities cannot borrow an existing execution command' lost its required rejection. Exact restoration passed.
    throw new Error('corrupt recovery execution command collision');
  for (const history of catalog.runtime.recovery.histories) {
    const target = history.intent.target;
    if (target.kind === 'write') {
      const originalReply = history.closure?.originalReply;
      const ownCommand = originalReply?.kind === 'write' ? originalReply.command : null;
      // Proof: Z04 removing only this identity check let the complete pure fold accept a write recovery acceptance ID borrowed from an existing local execution. This is raw-catalogue admission evidence, not a whole verified-API claim; both providers restored exactly.
      if (
        acceptanceCommands.has(target.acceptanceCommandId) ||
        recoveryCommands.has(target.acceptanceCommandId) ||
        executions.some((entry) => entry.command.commandId === target.acceptanceCommandId) ||
        writes.some(
          (entry) =>
            entry.command.commandId === target.acceptanceCommandId &&
            !equalRecords(entry.command, ownCommand),
        )
      )
        throw Error('corrupt recovery write acceptance identity');
      acceptanceCommands.add(target.acceptanceCommandId);
      const retained = catalog.attempts.find(
        (entry) => entry.attempt.attemptId === target.attemptId,
      );
      const stage = writes.find((entry) => entry.command.commandId === target.stageCommandId);
      // Proof: Z05 removing only this target/stage association changed its corruption diagnostic to a later stage.reply TypeError. Diagnostic-only; both providers restored exactly.
      if (
        retained?.attempt.identity.runId !== target.runId ||
        stage?.kind !== 'stage_write' ||
        stage.runId !== target.runId ||
        stage.attemptId !== target.attemptId ||
        !equalRecords(stage.reply.intent, target.original)
      )
        throw Error('corrupt recovery write stage association');
      if (history.closure === null) {
        // Proof: Z06 removing only this active checkpoint check lost its named diagnostic; the later generic current-attempt provenance fold still rejected the substituted summary. Both providers restored exactly; no admission claim.
        if (
          !equalRecords(retained.attempt, stage.reply.attempt) ||
          retained.attempt.holdsCapacity ||
          retained.attempt.version !== 4 ||
          retained.attempt.state.kind !== 'write_pending'
        )
          throw Error('corrupt active recovery write checkpoint');
      } else {
        const closure = history.closure;
        // Proof: Z07 removing only this current-attempt link lost its named diagnostic; generic current-attempt provenance still rejected the substituted summary. Both providers restored exactly; no admission claim.
        if (closure.version !== 2 || !equalRecords(retained.attempt, closure.attemptReply))
          throw Error('corrupt recovery write current attempt');
        if (closure.decision.kind === 'accepted') {
          const accepted = writes.find(
            (entry) => entry.command.commandId === target.acceptanceCommandId,
          );
          // Invariant boundary: decodeRecordedWrite already binds context to acceptance (the phase2 context corruption failed there first); reservation equality above binds the retained acknowledgement. Z03 observed this check reject when only reservation checking was removed. No independent removal credit is claimed for this masked compound check.
          if (
            originalReply?.kind !== 'write' ||
            accepted?.kind !== 'accept_write' ||
            accepted.context.scopeRevision !== closure.scopeBefore ||
            !equalRecords(accepted.command, originalReply.command) ||
            !equalRecords(accepted.reply, originalReply.ack)
          )
            throw Error('corrupt recovery write original acknowledgement');
        }
      }
      continue;
    }
    if (target.kind !== 'claim') continue;
    const acceptedCommand =
      history.closure?.originalReply?.kind === 'claim'
        ? history.closure.originalReply.command
        : null;
    if (
      acceptanceCommands.has(target.acceptanceCommandId) ||
      recoveryCommands.has(target.acceptanceCommandId) ||
      catalog.runtime.intents.some((intent) => intent.commandId === target.acceptanceCommandId) ||
      executions.some(
        (entry) =>
          entry.command.commandId === target.acceptanceCommandId &&
          !equalRecords(entry.command, acceptedCommand),
      )
    )
      // Proof: R2F45 removed only this check; 'recovery claim acceptance identity cannot borrow an existing stage command' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery claim acceptance identity');
    acceptanceCommands.add(target.acceptanceCommandId);

    const retained = catalog.attempts.find((entry) => entry.attempt.attemptId === target.attemptId);
    const stage = executions.find((entry) => entry.command.commandId === target.stageCommandId);
    if (
      retained?.attempt.identity.runId !== target.runId ||
      stage?.reply.kind !== 'claim_staged' ||
      stage.reply.attempt.attemptId !== target.attemptId ||
      !equalRecords(stage.reply.intent, target.original)
    )
      // Proof: R2F06 removed only this check; 'public runtime read reaches complete claim recovery stage audit' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery claim stage association');
    const closure = history.closure;
    if (closure === null) {
      const checkpoint = executionCheckpoint(retained.attempt);
      const stagedCheckpoint = stage.reply.attempt.state;
      if (
        retained.attempt.version !== 2 ||
        checkpoint.kind !== 'claiming' ||
        !retained.attempt.holdsCapacity ||
        !equalRecords(checkpoint.intent, target.original) ||
        stagedCheckpoint.kind !== 'claiming' ||
        !equalRecords(checkpoint.session, stagedCheckpoint.session)
      )
        // Proof: R2F53 removed only this check; 'recovery active journal requires the actual claiming checkpoint and exact index' admitted a valid reattachment that changed the staged checkpoint. Exact restoration passed.
        throw new Error('corrupt active recovery claim checkpoint');
    } else {
      if (closure.attemptReply === null || !equalRecords(closure.attemptReply, retained.attempt))
        // Proof: R2D03 removed this diagnostic; 'recovery current hold retains its precise provenance diagnostic' instead reached inherited current-attempt provenance (F152). Exact restoration passed; no admission-safety credit.
        throw new Error('corrupt recovery current hold');
      if (closure.originalReply !== null) {
        const accepted = executions.find(
          (entry) => entry.command.commandId === target.acceptanceCommandId,
        );
        if (
          closure.originalReply.kind !== 'claim' ||
          accepted?.command.kind !== 'accept_claim' ||
          accepted.context?.scopeRevision !== closure.scopeBefore ||
          !equalRecords(accepted.command, closure.originalReply.command) ||
          !equalRecords(accepted.reply, closure.originalReply.ack)
        )
          // Proof: R2F14 removed only this check; 'recovery audit rejects independent original_ack' lost its required rejection. Exact restoration passed.
          throw new Error('corrupt recovery claim original acknowledgement');
      }
    }
  }
  const staged = new Set<string>();
  const accepted = new Set<string>();
  const histories: ExecutionHistory3[] = [];
  for (const retained of catalog.attempts) {
    const attempt = decodeCurrentAttempt(retained.attempt);
    const admission = decodeAdmission(retained.admission);
    // Proof: F146 removed only this sampled check; 'retained history owner admission ordinal differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
    // Proof: F161 removed this sampled check; 'retained history owner admission attempt differs' accepted its positive then lost rejection. Exact restoration passed.
    // Proof: F162 removed this sampled check; 'retained history owner admission activity differs' accepted its positive then lost rejection. Exact restoration passed.
    if (
      admission.attemptId !== attempt.attemptId ||
      admission.ordinal !== attempt.ordinal ||
      !equalRecords(admission.identity, attempt.identity)
    )
      throw new Error('corrupt admission identity');
    const retainedRun = runs.get(attempt.identity.runId);
    // Proof: F163 removed this sampled check; 'retained history owner missing run diagnostic' accepted its positive then received TypeError instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
    if (retainedRun === undefined) throw new Error('attempt run does not exist');
    const run = retainedRun.run;
    const manifest = manifests.get(run.manifestDigest);
    // Proof: F164 removed this sampled check; 'retained history owner missing manifest diagnostic' accepted its positive then received TypeError instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
    if (manifest === undefined) throw new Error('manifest does not exist');
    const ownExecutions = executions.filter(
      (entry) => entry.reply.attempt.attemptId === attempt.attemptId,
    );
    const consumptions = catalog.consumptions.filter(
      (entry) => entry.reply.attemptId === attempt.attemptId,
    );
    const completions = catalog.completions.filter(
      (entry) => entry.attemptId === attempt.attemptId,
    );
    const receipts = catalog.receipts.filter(
      (entry) => entry.reply.attemptId === attempt.attemptId,
    );
    const decisions = catalog.decisions
      .filter((decision) => decision.attemptId === attempt.attemptId)
      .map(decodeDecision);
    // Proof: F166 removed this sampled check; 'retained history owner duplicate completion diagnostic' accepted its positive then received corrupt attempt event revision instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
    if (completions.length > 1 || receipts.length > 1)
      throw new Error('duplicate settlement history');
    const recoveries = catalog.runtime.recovery.histories.flatMap((history) =>
      history.intent.target.kind !== 'authority' &&
      history.intent.target.attemptId === attempt.attemptId &&
      history.closure !== null
        ? [history.closure]
        : [],
    );
    const ownWrites = writes.filter((entry) => entry.attemptId === attempt.attemptId);
    let pendingWrite: WriteObligation | undefined;
    let terminalWrite: WriteReceipt | undefined;
    const foldedWrites: RecordedWrite[] = [];
    const events = [
      ...ownWrites.map((write) => ({
        kind: 'write' as const,
        revision: write.reply.attempt.revision,
        write,
      })),
      // Proof: R07 counting an accepted write closure as another attempt event caused corrupt event revisions in both providers. Exact restoration passed.
      ...recoveries
        .filter((closure) => closure.version === 1 || closure.decision.kind !== 'accepted')
        .map((closure) => {
          // Proof: R2D06 removed this refinement; 'recovery missing hold retains its diagnostic after audited local value changes' received a null-revision TypeError. Earlier hold-closure association (R2F03) owns admission. Exact restoration passed; diagnostic-only.
          if (closure.attemptReply === null) throw new Error('claim closure has no hold');
          return { kind: 'recovery' as const, revision: closure.attemptReply.revision, closure };
        }),
      ...ownExecutions.map((execution) => ({
        kind: 'execution' as const,
        revision: execution.reply.attempt.revision,
        execution,
      })),
      ...consumptions.map((consumption) => ({
        kind: 'consumption' as const,
        revision: consumption.reply.revision,
        consumption,
      })),
      ...completions.map((completion) => ({
        kind: 'completion' as const,
        revision: completion.reply.revision,
        completion,
      })),
      ...receipts.map((receipt) => ({
        kind: 'receipt' as const,
        revision: receipt.reply.revision,
        receipt,
      })),
    ].sort((left, right) => left.revision - right.revision);
    let predecessor: Attempt = {
      ...attempt,
      version: 2,
      revision: 0,
      state: { kind: 'queued' },
      holdsCapacity: true,
    };
    let scopeLowerBound = 0;
    const folded: RecordedExecution[] = [];
    const waits = new Map<string, HumanWait>();
    const consumed = new Set<string>();
    let completion: RecordedCompletion | null = null;
    let receipt: RecordedReceipt | null = null;
    for (const event of events) {
      // Proof: F167 removed this sampled check; 'retained history owner event revision diagnostic' accepted its positive then received corrupt execution command reply instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
      if (event.revision !== addInteger(predecessor.revision, 1))
        throw new Error('corrupt attempt event revision');
      const facts = {
        run,
        attempt: predecessor,
        manifest,
        ownership: catalog.ownership,
        executions: [
          ...executions.filter((entry) => entry.reply.attempt.attemptId !== attempt.attemptId),
          ...folded,
        ],
      };
      if (event.kind === 'write') {
        const entry = event.write;
        const revision = entry.context.scopeRevision;
        if (revision < scopeLowerBound) throw new Error('write scope context moves backward');
        const checkpoint = executionCheckpoint(predecessor);
        if (!('execution' in checkpoint)) throw new Error('write predecessor has no claimed turn');
        const scope = scopePrefix(
          catalog,
          checkpoint.execution.session.preparation.target.observation.scope,
          revision,
        );
        const scoped = {
          ...facts,
          scope,
          runtime: catalog.runtime,
          submissions: executions,
          writes: foldedWrites,
          obligations: pendingWrite === undefined ? [] : [pendingWrite],
        };
        if (entry.kind === 'stage_write') {
          const intent = catalog.runtime.intents.find(
            (candidate) => candidate.commandId === entry.reply.intent.commandId,
          );
          if (
            intent === undefined ||
            staged.has(intent.commandId) ||
            intent.stagedRevision !== addInteger(revision, 1) ||
            intent.canonicalRequest !== entry.command.canonicalRequest
          )
            // Proof: fold-stage-link-diagnostic broke “every public entry audits independent stage scope link diagnostic behind plausible current write state”; exact source hash restored.
            throw new Error('corrupt write stage link');
          const transition = writeStageTransition(scoped, entry.command, intent.localOwner);
          if (
            transition.kind === 'refused' ||
            !equalRecords(transition.value, entry.reply) ||
            !equalRecords(transition.value.intent, intent)
          )
            // Proof: fold-stage-consequence broke “every public entry audits stage acknowledgement checkpoint substitution behind plausible current write state”; exact source hash restored.
            throw new Error('corrupt write stage consequence');
          pendingWrite = transition.value.obligation;
          staged.add(intent.commandId);
          scopeLowerBound = intent.stagedRevision;
        } else {
          const acceptance = catalog.runtime.acceptances.find(
            (candidate) => candidate.commandId === entry.command.intent.commandId,
          );
          if (
            acceptance === undefined ||
            accepted.has(acceptance.commandId) ||
            acceptance.acceptedRevision !== addInteger(revision, 1)
          )
            // Proof: fold-acceptance-link-diagnostic broke “every public entry audits independent acceptance scope link diagnostic behind plausible current write state”; exact source hash restored.
            throw new Error('corrupt write acceptance link');
          const transition = writeAcceptanceTransition(scoped, entry.command);
          if (
            transition.kind === 'refused' ||
            !equalRecords(transition.value, entry.reply) ||
            !equalRecords(transition.value.receipt.acceptance, acceptance)
          )
            // Proof: fold-acceptance-consequence broke “every public entry audits acceptance acknowledgement checkpoint substitution behind plausible current write state”; exact source hash restored.
            throw new Error('corrupt write acceptance consequence');
          terminalWrite = transition.value.receipt;
          pendingWrite = undefined;
          accepted.add(acceptance.commandId);
          scopeLowerBound = acceptance.acceptedRevision;
        }
        predecessor = decodeCurrentAttempt(entry.reply.attempt);
        foldedWrites.push(entry);
        continue;
      }
      if (predecessor.version !== 2 && !(event.kind === 'recovery' && event.closure.version === 2))
        // Proof: R2D04 removed this diagnostic; 'recovery subsequent event retains its precise hold diagnostic' instead reached ordinary hold refusal (R2F08). Exact restoration passed; no admission-safety credit.
        throw new Error('recovery hold has a subsequent attempt event');
      if (event.kind === 'recovery') {
        const closure = event.closure;
        if (closure.version === 2) {
          // Diagnostic invariant: strict stage acknowledgement decoding and the prior write fold establish write_pending plus its obligation; R07 event selection excludes accepted write closures, and the version2 decision decoder constrains the remaining nonacceptance. Retain this sequence check without defeating earlier guards.
          if (
            predecessor.version !== 4 ||
            predecessor.state.kind !== 'write_pending' ||
            pendingWrite === undefined ||
            closure.decision.kind !== 'fenced_nonaccepted'
          )
            throw Error('corrupt write nonacceptance predecessor');
          const expected = {
            ...predecessor,
            revision: addInteger(predecessor.revision, 1),
            state: {
              ...predecessor.state,
              kind: 'write_nonaccepted',
              recoveryId: closure.recoveryId,
            },
          };
          // Proof: Z09 removing only this consequence check let the complete pure fold accept a coherent closure/current summary substitution against the staged business outcome. Raw-catalogue scope only; both providers restored exactly.
          if (!equalRecords(expected, closure.attemptReply))
            throw Error('corrupt write nonacceptance consequence');
          // Proof: R08 omitting the nonacceptance fold lost settlement provenance in both providers. Exact restoration passed.
          pendingWrite = {
            ...pendingWrite,
            disposition: { kind: 'fenced_nonaccepted', recoveryId: closure.recoveryId },
          };
          predecessor = decodeCurrentAttempt(closure.attemptReply);
          scopeLowerBound = closure.scopeAfter;
          continue;
        }

        const checkpoint = executionCheckpoint(predecessor);
        if (
          closure.attemptReply === null ||
          (closure.decision.kind === 'accepted'
            ? checkpoint.kind !== 'ready'
            : checkpoint.kind !== 'claiming')
        )
          // Proof: R2D05 removed this refinement after a checkpoint-read dependency fault; 'recovery hold predecessor retains its precise checkpoint dependency diagnostic' instead reached hold-consequence equality (R2F07). Exact restoration passed; diagnostic-only.
          throw new Error('corrupt recovery hold predecessor');
        const expected = {
          ...predecessor,
          version: 3,
          revision: addInteger(predecessor.revision, 1),
          holdsCapacity: true,
          state: {
            kind: 'recovery_hold',
            cause:
              closure.decision.kind === 'accepted' ? 'claim_accepted_fenced' : 'claim_nonaccepted',
            closureId: closure.recoveryId,
            checkpoint,
          },
        };
        if (!equalRecords(expected, closure.attemptReply))
          // Proof: R2F07 removed only this check; 'recovery audit rejects independent hold_checkpoint' lost its required rejection. Exact restoration passed.
          throw new Error('corrupt recovery hold consequence');
        predecessor = decodeCurrentAttempt(closure.attemptReply);
      } else if (event.kind === 'execution') {
        const execution = event.execution;
        let expected: RecordedExecution['reply'];
        if (execution.context === null) {
          const command = execution.command;
          const transition = planExecutionTransition(facts, command.fact);
          // Proof: F194 removed this sampled check; 'remaining ordinary refusal diagnostic' received "undefined is not an object (evaluating 'state.kind')" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
          if (transition.kind === 'refused')
            throw new Error('corrupt execution command transition');
          if (command.fact.kind === 'waiting') {
            // Proof: F201 removed this sampled check; 'remaining reused wait identity' accepted its valid retained positive then lost the expected rejection. Exact restoration passed.
            if (waits.has(command.fact.wait.correlationKey))
              throw new Error('corrupt reused wait identity');
            waits.set(command.fact.wait.correlationKey, command.fact.wait);
          }
          if (command.fact.kind === 'preparation_intended') {
            const owner = command.fact.intent.owner;
            // Proof: F01 removed the admission lower bound; 'history rejects preparation owner earlier' accepted the coherent forgery. Exact restoration passed.
            if (
              owner.epoch < attempt.admittedEpoch ||
              owner.epoch > catalog.ownership.epoch ||
              (owner.epoch === catalog.ownership.epoch &&
                owner.ownerId !== catalog.ownership.owner?.ownerId)
            )
              throw new Error('corrupt preparation owner');
          }
          expected = {
            version: 1,
            kind: 'execution',
            attempt: advanceAttempt(predecessor, transition.value, isExecuting(transition.value)),
          };
        } else {
          const command = execution.command;
          const checkpoint = executionCheckpoint(predecessor.state);
          const session =
            'session' in checkpoint
              ? checkpoint.session
              : 'execution' in checkpoint
                ? checkpoint.execution.session
                : undefined;
          // Proof: F195 removed this sampled check; 'remaining missing scoped predecessor diagnostic' received "undefined is not an object (evaluating 'session.preparation')" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
          if (session === undefined) throw new Error('scoped execution predecessor has no session');
          const revision = execution.context.scopeRevision;
          // Proof: F05/F06 independently removed this bound; the before-acceptance and backward-continuation context negatives resolved against valid nonpending prefixes. Exact restoration passed.
          if (revision < scopeLowerBound) throw new Error('execution scope context moves backward');
          const scope = scopePrefix(
            catalog,
            session.preparation.target.observation.scope,
            revision,
          );
          const scoped = { ...facts, scope, runtime: catalog.runtime };
          if (command.kind === 'stage_claim') {
            const wire = readRuntimeRequest(command.canonicalRequest).operation.commandId;
            const intent = catalog.runtime.intents.find(
              (candidate) => candidate.commandId === wire,
            );
            // Proof: F172 removed this sampled check; 'retained history owner claim stage link revision diagnostic' accepted its positive then received corrupt claim stage consequence instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
            if (
              intent === undefined ||
              staged.has(wire) ||
              intent.stagedRevision !== addInteger(revision, 1) ||
              intent.canonicalRequest !== command.canonicalRequest
            )
              throw new Error('corrupt claim stage link');
            const transition = claimStageTransition(scoped, command, intent.localOwner);
            // Proof: F196 removed this sampled check; 'remaining stage refusal diagnostic' received "canonical JSON cannot carry undefined" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
            if (transition.kind === 'refused' || !equalRecords(transition.value.intent, intent))
              throw new Error('corrupt claim stage consequence');
            staged.add(wire);
            scopeLowerBound = intent.stagedRevision;
            expected = transition.value;
          } else if (command.kind === 'accept_claim') {
            const acceptance = catalog.runtime.acceptances.find(
              (candidate) => candidate.commandId === command.intent.commandId,
            );
            // Proof: F173 removed this sampled check; 'retained history owner claim acceptance link revision diagnostic' accepted its positive then received corrupt claim acceptance consequence instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
            if (
              acceptance === undefined ||
              accepted.has(acceptance.commandId) ||
              acceptance.acceptedRevision !== addInteger(revision, 1)
            )
              throw new Error('corrupt claim acceptance link');
            const transition = claimAcceptTransition(scoped, command);
            // Proof: F197 removed this sampled check; 'remaining acceptance consequence diagnostic' received "corrupt execution command reply" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
            if (
              transition.kind === 'refused' ||
              !equalRecords(transition.value.acceptance, acceptance)
            )
              throw new Error('corrupt claim acceptance consequence');
            accepted.add(acceptance.commandId);
            scopeLowerBound = acceptance.acceptedRevision;
            expected = transition.value;
          } else {
            const transition = turnStageTransition(scoped, command);
            // Proof: F198 removed this sampled check; 'remaining turn refusal diagnostic' received "canonical JSON cannot carry undefined" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
            if (transition.kind === 'refused') throw new Error('corrupt turn stage consequence');
            scopeLowerBound = revision;
            expected = transition.value;
          }
        }
        // Proof: F08 removed this original-ack comparison; 'independent context rejects older same epoch grant' accepted the coherent substitution. Exact restoration passed.
        if (!equalRecords(expected, execution.reply))
          throw new Error('corrupt execution command reply');
        predecessor = decodeAttempt(execution.reply.attempt);
        folded.push(execution);
      } else if (event.kind === 'consumption') {
        const consumption = event.consumption;
        const decision = decisions.find(
          (candidate) => candidate.decisionId === consumption.decisionId,
        );
        const state = predecessor.state;
        // Proof: F168 removed this sampled check; 'retained history owner consumed wait provenance differs' accepted its positive then lost rejection. Exact restoration passed.
        if (
          decision === undefined ||
          consumed.has(decision.decisionId) ||
          state.kind !== 'waiting_for_person' ||
          !equalRecords(state.wait, consumption.wait) ||
          planDecision(predecessor, decision).kind === 'refused'
        )
          throw new Error('corrupt consumed wait provenance');
        const expected = advanceAttempt(
          predecessor,
          {
            kind: 'ready',
            execution: state.checkpoint.execution,
            cause: { kind: 'decision', decisionId: decision.decisionId },
          },
          true,
        );
        // Proof: F149 removed only this sampled check; 'retained history owner original consumption reply differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
        if (!equalRecords(expected, consumption.reply))
          throw new Error('corrupt consumption reply');
        consumed.add(decision.decisionId);
        predecessor = decodeAttempt(consumption.reply);
      } else if (event.kind === 'completion') {
        const retainedCompletion = event.completion;
        const completionEnvelope: { readonly version: unknown } = retainedCompletion;
        const submission = decodeCompletion(retainedCompletion.completion);
        const transition = planOutcomeTransition(facts, submission);
        // Proof: F170 removed this sampled check; 'retained history owner completion record version differs' accepted its positive then lost rejection. Exact restoration passed.
        // Proof: F199 removed this sampled check; 'remaining completion refusal diagnostic' received "canonical JSON cannot carry undefined" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
        if (
          completionEnvelope.version !== 1 ||
          retainedCompletion.attemptId !== submission.intent.claim.attemptId ||
          transition.kind === 'refused'
        )
          throw new Error('corrupt completion transition');
        const expected = advanceAttempt(predecessor, transition.value, false);
        // Proof: F150 removed only this sampled check; 'retained history owner original completion reply differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
        if (!equalRecords(expected, retainedCompletion.reply))
          throw new Error('corrupt completion original reply');
        completion = retainedCompletion;
        predecessor = decodeAttempt(retainedCompletion.reply);
      } else {
        const retainedReceipt = event.receipt;
        const submission = decodeReceipt(retainedReceipt.receipt);
        // Proof: F171 removed this sampled check; 'retained history owner missing receipt completion diagnostic' accepted its positive then received TypeError instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
        if (completion === null) throw new Error('receipt completion does not exist');
        const transition = planReceiptTransition(facts, submission, completion.completion.intent);
        // Proof: F200 removed this sampled check; 'remaining receipt refusal diagnostic' received "canonical JSON cannot carry undefined" instead of its named error; diagnostic-only, not acceptance safety. Exact restoration passed.
        if (transition.kind === 'refused') throw new Error('corrupt receipt transition');
        const expected = advanceAttempt(predecessor, transition.value, false);
        // Proof: F151 removed only this sampled check; 'retained history owner original receipt reply differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
        if (!equalRecords(expected, retainedReceipt.reply))
          throw new Error('corrupt receipt original reply');
        receipt = retainedReceipt;
        predecessor = decodeAttempt(retainedReceipt.reply);
      }
    }
    // Proof: F169 removed this sampled check; 'retained history owner decision names absent wait choice' accepted its positive then lost rejection. Exact restoration passed.
    for (const decision of decisions)
      if (!waits.get(decision.correlationKey)?.choices.includes(decision.choice))
        throw new Error('corrupt decision wait provenance');
    // Proof: F152 removed only this sampled check; 'retained history owner current attempt differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
    if (!equalRecords(predecessor, attempt)) throw new Error('corrupt current attempt provenance');
    const ownObligations = obligations.filter((entry) =>
      ownWrites.some(
        (write) => write.kind === 'stage_write' && write.command.commandId === entry.stageCommandId,
      ),
    );
    const ownReceipts = writeReceipts.filter((entry) =>
      ownWrites.some(
        (write) => write.kind === 'stage_write' && write.command.commandId === entry.stageCommandId,
      ),
    );
    if (
      // Proof: fold-pending-obligation broke “every public entry audits missing obligation with agreeing count behind plausible current write state”; exact source hash restored.
      !equalRecords(ownObligations, pendingWrite === undefined ? [] : [pendingWrite]) ||
      !equalRecords(ownReceipts, terminalWrite === undefined ? [] : [terminalWrite])
    )
      throw new Error('corrupt write settlement provenance');
    histories.push({
      version: 3,
      writes: foldedWrites,
      recoveries,
      run,
      attempt,
      executions: folded,
      consumptions: [...consumptions].sort(
        (left, right) => left.reply.revision - right.reply.revision,
      ),
      decisions,
      completion,
      receipt,
    });
  }
  for (const intent of catalog.runtime.intents) {
    const operation = readRuntimeRequest(intent.canonicalRequest).operation;
    if (!('kind' in operation)) {
      // Proof: F147 removed only this sampled check; 'retained history owner unlinked runtime claim stage' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
      if (!staged.has(intent.commandId)) throw new Error('runtime claim has no execution stage');
      // Proof: F148 removed only this sampled check; 'retained history owner unlinked runtime claim acceptance' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
      if (
        catalog.runtime.acceptances.some(
          (acceptance) => acceptance.commandId === intent.commandId,
        ) &&
        // Proof: fold-unlinked-acceptance broke “every public entry audits unlinked conditional write acceptance behind pending predecessor behind plausible current write state”; exact source hash restored.
        !accepted.has(intent.commandId)
      )
        throw new Error('runtime claim has no execution acceptance');
    }
  }
  for (const { run, initial } of catalog.runs) {
    // Proof: F153 removed only this sampled check; 'retained history owner initial run differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
    // Proof: F202 removed this sampled check; 'remaining empty run manifest reference' accepted its valid retained positive then lost the expected rejection. Exact restoration passed.
    if (!manifests.has(run.manifestDigest) || !equalRecords({ ...run, revision: 0 }, initial))
      throw new Error('corrupt run identity');
    const revision = catalog.attempts
      .filter((entry) => entry.attempt.identity.runId === run.runId)
      .reduce((sum, entry) => addInteger(sum, addInteger(entry.attempt.revision, 1)), 0);
    const decisions = catalog.decisions.filter(
      (decision) => attempts.get(decision.attemptId)?.attempt.identity.runId === run.runId,
    ).length;
    // Proof: F154 removed only this sampled check; 'retained history owner run revision differs' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
    if (run.revision !== addInteger(revision, decisions))
      throw new Error('corrupt run revision provenance');
  }
  const reservations = new Set(catalog.reservations);
  // Proof: F155 removed only this sampled check; 'retained history owner duplicate reservation' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  // Proof: F156 removed only this sampled check; 'retained history owner capacity below reservations' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  if (reservations.size !== catalog.reservations.length || reservations.size > catalog.capacity)
    throw new Error('corrupt reservation capacity');
  // Proof: F157 removed only this sampled check; 'retained history owner orphan reservation' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
  for (const identity of reservations)
    if (!attempts.has(identity)) throw new Error('orphan reservation');
  // Proof: F139 removed this correspondence check; all three SQLite coupled 'audits absent reservation before publication' cases resolved instead of rejecting. Exact restoration passed.
  for (const { attempt } of catalog.attempts)
    if (reservations.has(attempt.attemptId) !== attempt.holdsCapacity)
      throw new Error('corrupt attempt reservation');
  return histories;
}
