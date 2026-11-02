import { type } from 'arktype';

import { MOST_COMMANDS_IN_A_BATCH } from './plan-command-values';
import type {
  RuntimeAuthorityRequest,
  RuntimeClaimRequest,
  RuntimeOperation,
  RuntimePlanCommand,
  RuntimeScope,
  RuntimeWriteRequest,
} from './runtime-command-values';

const identity = type('string > 0');
// Proof: P3-14 removed safe-integer narrowing; two unsafe-generation boundary negatives accepted.
const generation = type('number.integer > 0').narrow(Number.isSafeInteger);
const scopeShape = type({
  organizationId: identity,
  projectId: identity,
  personId: identity,
}).onDeepUndeclaredKey('reject');
const authority = type({ ownerId: identity, generation });
const execution = type({
  storeId: identity,
  runId: identity,
  attemptId: identity,
  // Proof: P3-16 removed the session bound; the 257-character canonical-request negative accepted.
  sessionId: '0 < string <= 256',
});
const claim = type({
  claimId: identity,
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution,
});
const command = type({
  kind: '"setProgress"',
  workItemId: identity,
  stepId: identity,
  state: '"in_progress" | "done"',
})
  .or({
    kind: '"setMeasure"',
    workItemId: identity,
    stepId: identity,
    metric: '"token_actual"',
    // Proof: P3-20 removed finite narrowing; an Infinity measure canonicalized to JSON null.
    value: type('number').narrow(Number.isFinite),
  })
  .or({
    kind: '"patchWorkItem"',
    workItemId: identity,
    patch: { externalRefs: type({ systemId: 'string', url: 'string', 'name?': 'string' }).array() },
  })
  .or({
    kind: '"releaseWorkItem"',
    workItemId: identity,
    personId: identity,
    steps: identity.array(),
  });
const action = type({
  kind: '"claim"',
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution,
}).or({
  kind: '"write"',
  claim,
  // Proof: codec-T1-cap changed the shared limit to 201; the public 201-command negative accepted.
  // Proof: P3-15 removed this bound; empty and 201-command canonical requests accepted.
  commands: command
    .array()
    .narrow((commands) => commands.length > 0 && commands.length <= MOST_COMMANDS_IN_A_BATCH),
});
const common = { schemaVersion: '1', commandId: identity, expectedLedgerId: identity } as const;
const acquisition = type({
  ...common,
  ownerId: identity,
  expectedGeneration: generation.or('null'),
}).onDeepUndeclaredKey('reject');
// Proof: P3-13 removed strict field rejection; undeclared canonical/acquisition/lookup/discovery inputs accepted.
const operationShape = type({
  ...common,
  kind: '"authority"',
  ownerId: identity,
  expectedGeneration: generation.or('null'),
})
  .or({ ...common, authority, expectedBasis: /^rb1:[0-9a-f]{64}$/, action })
  .onDeepUndeclaredKey('reject');
const envelope = type({
  schemaVersion: '1',
  expectedLedgerId: identity,
  scope: scopeShape,
  commandId: identity,
  operation: type({
    kind: '"authority"',
    ownerId: identity,
    expectedGeneration: generation.or('null'),
  }).or({ kind: '"claim" | "write"', authority, expectedBasis: /^rb1:[0-9a-f]{64}$/, action }),
}).onDeepUndeclaredKey('reject');

/** Validates a public acquisition before asynchronous admission. */
export function parseRuntimeAuthorityRequest(candidate: unknown): RuntimeAuthorityRequest {
  return acquisition.assert(candidate);
}

/** Strict pinned lookup, with no caller-supplied organization or ignored extras. */
export function parseRuntimeLookup(
  candidate: unknown,
): Readonly<{ commandId: string; expectedLedgerId: string }> {
  return type({ commandId: identity, expectedLedgerId: identity })
    .onDeepUndeclaredKey('reject')
    .assert(candidate);
}

/** Discovery alone permits an omitted pin; an explicit malformed pin is never discovery. */
export function parseRuntimeStateRequest(
  candidate: unknown,
): Readonly<{ expectedLedgerId?: string }> {
  return type({ 'expectedLedgerId?': identity }).onDeepUndeclaredKey('reject').assert(candidate);
}

function canonicalCommand(command: RuntimePlanCommand) {
  switch (command.kind) {
    case 'setProgress':
      return {
        kind: command.kind,
        workItemId: command.workItemId,
        stepId: command.stepId,
        state: command.state,
      };
    case 'setMeasure':
      return {
        kind: command.kind,
        workItemId: command.workItemId,
        stepId: command.stepId,
        metric: command.metric,
        value: command.value,
      };
    case 'patchWorkItem':
      return {
        kind: command.kind,
        workItemId: command.workItemId,
        patch: {
          externalRefs: command.patch.externalRefs.map((ref) => ({
            systemId: ref.systemId,
            url: ref.url,
            ...(ref.name === undefined ? {} : { name: ref.name }),
          })),
        },
      };
    case 'releaseWorkItem':
      return {
        kind: command.kind,
        workItemId: command.workItemId,
        personId: command.personId,
        steps: [...command.steps],
      };
  }
}

/**
 * Fixed-key, versioned UTF-8 JSON for accepted-payload identity. Strict shapes reject
 * ignored extras; ordered commands/references stay ordered and explicit null stays null.
 * These bytes identify a payload; they establish no permission or receipt authenticity.
 */
export function canonicalRuntimeRequest(scope: RuntimeScope, candidate: unknown): string {
  const scoped = scopeShape.assert(scope);
  // Proof: P3-21 bypassed semantic parsing; 15 malformed/unsupported request negatives canonicalized.
  const operation = operationShape.assert(candidate);
  let canonicalOperation: typeof envelope.infer.operation;
  if ('kind' in operation)
    canonicalOperation = {
      kind: operation.kind,
      ownerId: operation.ownerId,
      expectedGeneration: operation.expectedGeneration,
    };
  else {
    const canonicalExecution = (execution: typeof claim.infer.execution) => ({
      storeId: execution.storeId,
      runId: execution.runId,
      attemptId: execution.attemptId,
      sessionId: execution.sessionId,
    });
    const acceptedAction = operation.action;
    const canonicalAction =
      acceptedAction.kind === 'claim'
        ? {
            kind: acceptedAction.kind,
            workItemId: acceptedAction.workItemId,
            stepId: acceptedAction.stepId,
            parentClaimId: acceptedAction.parentClaimId,
            execution: canonicalExecution(acceptedAction.execution),
          }
        : {
            kind: acceptedAction.kind,
            claim: {
              claimId: acceptedAction.claim.claimId,
              workItemId: acceptedAction.claim.workItemId,
              stepId: acceptedAction.claim.stepId,
              parentClaimId: acceptedAction.claim.parentClaimId,
              execution: canonicalExecution(acceptedAction.claim.execution),
            },
            commands: acceptedAction.commands.map(canonicalCommand),
          };
    canonicalOperation = {
      kind: acceptedAction.kind,
      authority: {
        ownerId: operation.authority.ownerId,
        generation: operation.authority.generation,
      },
      expectedBasis: operation.expectedBasis,
      action: canonicalAction,
    };
  }
  return JSON.stringify({
    schemaVersion: 1,
    expectedLedgerId: operation.expectedLedgerId,
    scope: {
      organizationId: scoped.organizationId,
      projectId: scoped.projectId,
      personId: scoped.personId,
    },
    commandId: operation.commandId,
    operation: canonicalOperation,
  });
}

/** Decodes trusted bytes into the same strict semantic input used to emit canonical requests. */
export function parseCanonicalRuntimeRequest(
  bytes: string,
): Readonly<{ scope: RuntimeScope; operation: RuntimeOperation }> {
  const parsed = envelope.assert(JSON.parse(bytes));
  const common = {
    schemaVersion: parsed.schemaVersion,
    commandId: parsed.commandId,
    expectedLedgerId: parsed.expectedLedgerId,
  };
  const accepted = parsed.operation;
  const operation: RuntimeOperation =
    accepted.kind === 'authority'
      ? {
          ...common,
          kind: accepted.kind,
          ownerId: accepted.ownerId,
          expectedGeneration: accepted.expectedGeneration,
        }
      : {
          ...common,
          authority: accepted.authority,
          expectedBasis: accepted.expectedBasis,
          action: accepted.action,
        };
  // Proof: P3-08 removed recanonicalization; whitespace-corrupt replay resolved instead of throwing.
  if (canonicalRuntimeRequest(parsed.scope, operation) !== bytes)
    throw new Error('runtime request bytes are not canonical');
  return { scope: parsed.scope, operation };
}

/** Validates and detaches the exact claim request before queued command admission. */
export function parseRuntimeClaimRequest(candidate: unknown): RuntimeClaimRequest {
  // Proof: P4-15 bypassed this boundary; invalid sessions entered two real UoW turns before later canonical rejection.
  const request = operationShape.assert(candidate);
  if ('kind' in request || request.action.kind !== 'claim')
    throw new Error('runtime claim action is required');
  return {
    ...request,
    // Proof: P4-13 omitted this copy; queued caller mutation made the original claim refuse as stale.
    authority: { ...request.authority },
    // Proof: P4-14 omitted the execution copy; the queued-identity production test threw on the changed session.
    action: { ...request.action, execution: { ...request.action.execution } },
  };
}

/** Validates and deeply detaches a claimed batch synchronously before queued admission. */
export function parseRuntimeWriteRequest(candidate: unknown): RuntimeWriteRequest {
  // Proof (ordering): P5-43 bypassed this parser; malformed inputs entered UoW turns before the canonical backstop.
  const request = operationShape.assert(candidate);
  // Proof (diagnostic): P5-46 omitted this guard; wrong-action rejection became an incidental missing-claim TypeError.
  if ('kind' in request || request.action.kind !== 'write')
    throw new Error('runtime write action is required');
  // Proof: P5-29–34 omitted authority/claim/execution/ref/step/command copies separately; queued caller mutation broke original acceptance/replay.
  return {
    ...request,
    authority: { ...request.authority },
    action: {
      ...request.action,
      claim: { ...request.action.claim, execution: { ...request.action.claim.execution } },
      commands: request.action.commands.map((command) => {
        if (command.kind === 'patchWorkItem')
          return {
            ...command,
            patch: { externalRefs: command.patch.externalRefs.map((ref) => ({ ...ref })) },
          };
        if (command.kind === 'releaseWorkItem') return { ...command, steps: [...command.steps] };
        return { ...command };
      }),
    },
  };
}
