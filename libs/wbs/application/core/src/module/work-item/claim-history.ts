import {
  type Claim,
  deriveNumbers,
  type LeaseReleaseReason,
  type WorkItemPlacement,
} from '@wbs/domain';

import type { PlanEvent } from '../../ports/plan-event-values';
import { readCommand } from '../../service/compensating';
import type { CompensatingCommand } from '../../service/compensating-command';

/** The claim history read's `limit` (`wbs-claim-display` C13): 50 when absent, at most 100. */
export const CLAIM_HISTORY_LIMIT = { default: 50, max: 100 } as const;

/** The plan event kinds a claim history lists; undo and redo write none (`plan-history` D4). */
export const CLAIM_HISTORY_KINDS = ['claim', 'release'] as const;

/** Why a claim history event happened: a claim, a release command, or the sweep's reason. */
export type ClaimHistoryReason = 'claimed' | 'released' | LeaseReleaseReason;

/** One claim a history event names, as it was then and as far as the plan still knows it. */
export interface ClaimHistoryClaim {
  readonly claimId: string;
  readonly workItemId: string;
  readonly stepId: string | null;
  readonly runId: string | null;
  /** The holder; `name` is null when the person was deleted since. */
  readonly holder: { readonly personId: string; readonly name: string | null };
  /** The work item as the plan numbers it now; null when it was deleted since. */
  readonly item: {
    readonly number: string;
    readonly numberIsFrozen: boolean;
    readonly name: string;
  } | null;
}

/**
 * One claim or release act, read as who, what and why (C14): a `claim` or
 * `release` plan event, or one act of a `batch` event that claimed or
 * released beside other commands. Acts of one batch share `eventId` and are
 * told apart by `act`.
 */
export interface ClaimHistoryEvent {
  readonly eventId: string;
  /** The act's place among its event's claim and release acts in run order; 0 for a lone act. */
  readonly act: number;
  /** When the act was written, epoch milliseconds. */
  readonly at: number;
  readonly kind: (typeof CLAIM_HISTORY_KINDS)[number];
  readonly reason: ClaimHistoryReason;
  readonly claims: ClaimHistoryClaim[];
}

/** A history act decoded from its stored command, before anything is named. */
export interface DecodedClaimEvent {
  readonly eventId: string;
  readonly act: number;
  readonly at: number;
  readonly kind: ClaimHistoryEvent['kind'];
  readonly reason: ClaimHistoryReason;
  readonly claims: readonly Claim[];
}

/**
 * The commands whose presence in a `batch` event's stored command makes it a
 * claim history event (`PlanEventFilter.batchesHolding`). A claim's forward
 * is `add_claims` (or a batch of it and its assignments), a release's is
 * `remove_claims`; no other act's forward holds either.
 */
export const CLAIM_HISTORY_COMMANDS = ['add_claims', 'remove_claims'] as const;

/**
 * Decodes stored claim history events, newest first as given, into acts,
 * newest first, with the journal's own decoder ({@link readCommand}). A
 * `claim` lists the claims its `add_claims` wrote, a `release` those its
 * `remove_claims` took. A `batch` yields one act per top-level step holding
 * either, listed last step first: the batch ran its steps in order. The
 * reason is the act's kind, or for a release the `reason` the lease sweep
 * stores beside its command; never the label, which quotes a work item's name.
 *
 * @throws naming the event when its stored command does not decode, names no
 * claim of its kind, carries a reason the sweep never writes, or is a batch
 * with no claim or release act or with a step that both claims and releases:
 * history is trusted state this process wrote, so it fails the read whole
 * rather than answering a list with a hole in it.
 */
export function decodeClaimEvents(events: readonly PlanEvent[]): DecodedClaimEvent[] {
  // Proof: with an undecodable event skipped instead, `fails the read on a
  // stored command it cannot decode, naming the event` (claim-history.test.ts)
  // answered the rest; watched 2026-10-24.
  return events.flatMap((event) => {
    try {
      return decodeClaimEvent(event);
    } catch (cause) {
      throw new Error(`claim history event ${event.id} cannot be read`, { cause });
    }
  });
}

function decodeClaimEvent(event: PlanEvent): DecodedClaimEvent[] {
  const command = readCommand(event.after);
  if (event.kind === 'batch') return decodeBatch(event, command);
  if (event.kind !== 'claim' && event.kind !== 'release')
    throw new Error(`kind ${event.kind} is not a claim, a release or a batch`);
  const claims = claimsOf(command, event.kind === 'claim' ? 'add_claims' : 'remove_claims');
  // Proof: with this check removed, the claim event whose command is a
  // `set_frozen` answered with no claims instead of failing the read
  // (claim-history.test.ts); watched 2026-10-24.
  if (claims.length === 0) throw new Error(`its ${command.do} command names no claim`);
  return [
    {
      eventId: event.id,
      act: 0,
      at: event.createdAt,
      kind: event.kind,
      // Proof: with the reason read off the label first, `reads a release named
      // like a reap by its stored reason, not its label` (claim-history.test.ts)
      // read `lease_expired`; watched 2026-10-24.
      reason: event.kind === 'claim' ? 'claimed' : releaseReasonOf(event.after),
      claims,
    },
  ];
}

/** The acts of one `batch` event, last step first; see {@link decodeClaimEvents}. */
function decodeBatch(event: PlanEvent, command: CompensatingCommand): DecodedClaimEvent[] {
  if (command.do !== 'batch') throw new Error(`a batch event holds a ${command.do} command`);
  type Act = Pick<DecodedClaimEvent, 'kind' | 'reason' | 'claims'>;
  const acts = command.steps.flatMap((step): Act[] => {
    const added = claimsOf(step, 'add_claims');
    const removed = claimsOf(step, 'remove_claims');
    // Proof: with this check skipped, `fails the read on a batch it cannot
    // split into acts` (claim-history.test.ts) answered the step as a claim;
    // watched 2026-10-24.
    if (added.length > 0 && removed.length > 0)
      throw new Error('a batch step both claims and releases');
    if (added.length > 0) return [{ kind: 'claim', reason: 'claimed', claims: added }];
    if (removed.length > 0)
      return [{ kind: 'release', reason: releaseReasonOf(step), claims: removed }];
    return [];
  });
  // The store kept this batch because its command holds a claim command
  // somewhere; one no step claims or releases with is corrupt.
  // Proof: with this check skipped, `fails the read on a batch it cannot
  // split into acts` (claim-history.test.ts) answered nothing for it;
  // watched 2026-10-24.
  if (acts.length === 0) throw new Error('its batch claims and releases nothing');
  return acts
    .map((act, index) => ({ eventId: event.id, act: index, at: event.createdAt, ...act }))
    .reverse();
}

/** The claims every `wanted` command of `command` names, batches walked in order. */
function claimsOf(
  command: CompensatingCommand,
  wanted: 'add_claims' | 'remove_claims',
): readonly Claim[] {
  if (command.do === 'batch') return command.steps.flatMap((step) => claimsOf(step, wanted));
  return command.do === wanted ? command.claims : [];
}

/**
 * `released` for a release command, or the reason the lease sweep stores in
 * its event's `after` (`WorkItemService.releaseExpiredLeases`).
 */
function releaseReasonOf(after: unknown): ClaimHistoryReason {
  const reason: unknown =
    typeof after === 'object' && after !== null && 'reason' in after ? after.reason : undefined;
  if (reason === undefined) return 'released';
  if (reason === 'lease_expired' || reason === 'credential_revoked') return reason;
  // Proof: with an unknown reason read as `released`, the corrupt-history case
  // (claim-history.test.ts) answered instead of failing; watched 2026-10-24.
  throw new Error(`its release names an unknown reason: ${JSON.stringify(reason)}`);
}

/**
 * Names each decoded event's holders and work items as the plan holds them
 * now: a person or row deleted since reads `null`, because history outlives
 * people and rows (C14).
 *
 * @throws when a row of this read has no derived number: the rows are one
 * project's tree, so an unnumbered one is corrupt trusted state.
 */
export function nameClaimHistory(
  decoded: readonly DecodedClaimEvent[],
  rows: readonly (WorkItemPlacement & { readonly name: string })[],
  personNames: ReadonlyMap<string, string>,
): ClaimHistoryEvent[] {
  const numbers = deriveNumbers(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const itemOf = (workItemId: string): ClaimHistoryClaim['item'] => {
    const row = byId.get(workItemId);
    if (row === undefined) return null;
    const number = numbers.get(workItemId);
    // A row of this read with no number sits outside the tree: corrupt, never
    // "deleted since". No negative reaches this line: `deriveNumbers` already
    // throws for a row no root reaches, which `fails the read for a row the
    // tree cannot number, …` (claim-history.test.ts) pins; it narrows the
    // map's answer as project-claims.ts and person-work.ts do.
    if (number === undefined) throw new Error(`work item ${workItemId} has no number in this read`);
    return { number, numberIsFrozen: row.frozenNumber !== null, name: row.name };
  };
  return decoded.map(({ claims, ...event }) => ({
    ...event,
    claims: claims.map((claim) => ({
      claimId: claim.id,
      workItemId: claim.workItemId,
      stepId: claim.stepId,
      runId: claim.runId,
      // Absent is the modeled "deleted since". Proof: with the id read as the
      // name instead, `names a holder and an item deleted since as null`
      // (claim-history.test.ts) failed; watched 2026-10-24.
      holder: { personId: claim.personId, name: personNames.get(claim.personId) ?? null },
      item: itemOf(claim.workItemId),
    })),
  }));
}
