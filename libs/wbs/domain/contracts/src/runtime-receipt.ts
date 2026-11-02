import type {
  RuntimeClaim,
  RuntimeOperation,
  RuntimeReceipt,
  RuntimeScope,
} from './runtime-command-values';

/** Compares complete already-validated organization/project/person addresses without mutation. */
export function matchesRuntimeScope(left: RuntimeScope, right: RuntimeScope): boolean {
  return (
    // Proof: bypassing organizationId equality made the public receipt scope organizationId negative return true.
    left.organizationId === right.organizationId &&
    // Proof: bypassing projectId equality made the public receipt scope projectId negative return true.
    left.projectId === right.projectId &&
    // Proof: bypassing personId equality made the public receipt scope personId negative return true.
    left.personId === right.personId
  );
}
/** Exact immutable target/execution equality for both binding admission and trusted receipt correspondence. */
export function matchesRuntimeClaim(left: RuntimeClaim, right: RuntimeClaim): boolean {
  return (
    // Proof: returning true here admitted eight real borrowed-binding mismatch writes; absent binding remained refused.
    // Proof: P5-08–15 omitted each comparison; the isolated corrupt borrowed-binding production request accepted.
    left.claimId === right.claimId &&
    left.workItemId === right.workItemId &&
    left.stepId === right.stepId &&
    left.parentClaimId === right.parentClaimId &&
    left.execution.storeId === right.execution.storeId &&
    left.execution.runId === right.execution.runId &&
    left.execution.attemptId === right.execution.attemptId &&
    left.execution.sessionId === right.execution.sessionId
  );
}

/**
 * Compares already boundary-validated receipt content with a retained request without mutation.
 * The expected digest must be independently computed from the exact retained canonical bytes.
 * A match does not validate external shapes, authenticate transport or establish current grants.
 * Claim IDs are receiver-generated; actor accounts and resulting basis add no request preconditions.
 */
export function matchesRuntimeReceipt(
  scope: RuntimeScope,
  operation: RuntimeOperation,
  requestDigest: string,
  receipt: RuntimeReceipt,
): boolean {
  return (
    matchesRuntimeScope(scope, receipt.scope) &&
    // Proof: bypassing ledgerId equality made the public receipt metadata ledgerId negative return true.
    operation.expectedLedgerId === receipt.ledgerId &&
    // Proof: bypassing commandId equality made the public receipt metadata commandId negative return true.
    operation.commandId === receipt.commandId &&
    // Proof: bypassing requestDigest equality made the public receipt metadata requestDigest negative return true.
    requestDigest === receipt.requestDigest &&
    matchesAcceptance(operation, receipt)
  );
}

function matchesAcceptance(request: RuntimeOperation, receipt: RuntimeReceipt): boolean {
  const accepted = receipt.acceptance;
  if ('kind' in request)
    return (
      accepted.kind === 'authority' &&
      accepted.authority.ownerId === request.ownerId &&
      accepted.authority.generation ===
        (request.expectedGeneration === null ? 1 : request.expectedGeneration + 1)
    );
  if (
    accepted.kind === 'authority' ||
    accepted.kind !== request.action.kind ||
    accepted.authority.ownerId !== request.authority.ownerId ||
    accepted.authority.generation !== request.authority.generation
  )
    return false;
  const action = request.action;
  if (action.kind === 'claim')
    return matchesRuntimeClaim(
      {
        claimId: accepted.claim.claimId,
        workItemId: action.workItemId,
        stepId: action.stepId,
        parentClaimId: action.parentClaimId,
        execution: action.execution,
      },
      accepted.claim,
    );
  return (
    accepted.kind === 'write' &&
    matchesRuntimeClaim(action.claim, accepted.claim) &&
    accepted.applied.length === action.commands.length &&
    accepted.applied.every(
      (command, index) => command.index === index && command.kind === action.commands[index]?.kind,
    )
  );
}
