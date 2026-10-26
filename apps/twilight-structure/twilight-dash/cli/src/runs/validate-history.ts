import { decodeRecordedExecution } from './execution-codecs';
import type { ExecutionHistory, RecordedExecution } from './execution-records';
import { claimAcceptTransition, claimStageTransition, turnStageTransition } from './plan-claims';
import {
  advanceAttempt,
  executionCheckpoint,
  isExecuting,
  planExecutionTransition,
} from './plan-execution';
import { planOutcomeTransition, type RecordedCompletion } from './plan-outcome';
import { planReceiptTransition, type RecordedReceipt } from './plan-receipt';
import { auditRuntimeCatalog, reconstructRuntimeScope, type RuntimeCatalog } from './plan-runtime';
import { planDecision, type RecordedConsumption } from './plan-signals';
import {
  addInteger,
  decodeAdmission,
  decodeAttempt,
  decodeCompletion,
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
  const intents = catalog.runtime.intents.filter(
    (intent) =>
      intent.stagedRevision <= revision &&
      equalRuntimeScopes(readRuntimeRequest(intent.canonicalRequest).scope, scope),
  );
  const commands = new Set(intents.map((intent) => intent.commandId));
  const acceptances = catalog.runtime.acceptances.filter(
    (acceptance) => acceptance.acceptedRevision <= revision && commands.has(acceptance.commandId),
  );
  return reconstructRuntimeScope(
    { ...retained, revision },
    intents,
    acceptances,
    catalog.ownership,
  );
}

/** Folds scopes first, then every original attempt acknowledgement at its true predecessor, and finally cross-links/projections/reservations. Every execution is decoded before dispatch; {@link decodeRecordedExecution} owns command/context/reply correlation, so null context precisely selects ordinary execution. Coherent replacement of every independent fact is outside this local integrity claim. */
export function validateHistory(catalog: HistoryCatalog): readonly ExecutionHistory[] {
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
  const staged = new Set<string>();
  const accepted = new Set<string>();
  const histories: ExecutionHistory[] = [];
  for (const retained of catalog.attempts) {
    const attempt = decodeAttempt(retained.attempt);
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
    const events = [
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
      if (event.kind === 'execution') {
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
    histories.push({
      version: 1,
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
    if (!('kind' in operation) && operation.action.kind === 'claim') {
      // Proof: F147 removed only this sampled check; 'retained history owner unlinked runtime claim stage' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
      if (!staged.has(intent.commandId)) throw new Error('runtime claim has no execution stage');
      // Proof: F148 removed only this sampled check; 'retained history owner unlinked runtime claim acceptance' retained its positive and lost the expected rejection. Exact restoration passed; direct owner proof.
      if (
        catalog.runtime.acceptances.some(
          (acceptance) => acceptance.commandId === intent.commandId,
        ) &&
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
