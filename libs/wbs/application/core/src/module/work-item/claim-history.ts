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

/** One `claim` or `release` plan event, read as who, what and why (C14). */
export interface ClaimHistoryEvent {
  readonly eventId: string;
  /** When the act was written, epoch milliseconds. */
  readonly at: number;
  readonly kind: (typeof CLAIM_HISTORY_KINDS)[number];
  readonly reason: ClaimHistoryReason;
  readonly claims: ClaimHistoryClaim[];
}

/** A history event decoded from its stored command, before anything is named. */
export interface DecodedClaimEvent {
  readonly eventId: string;
  readonly at: number;
  readonly kind: ClaimHistoryEvent['kind'];
  readonly reason: ClaimHistoryReason;
  readonly claims: readonly Claim[];
}

/**
 * The `limit` query of the claim history read: absent is
 * {@link CLAIM_HISTORY_LIMIT}'s default, a whole number from 1 to its maximum
 * is itself, anything else is null (a typed 400).
 */
export function claimHistoryLimitOf(raw: string | undefined): number | null {
  if (raw === undefined) return CLAIM_HISTORY_LIMIT.default;
  // Digits only, leading zeros allowed: `007` is the whole number 7.
  if (!/^[0-9]{1,7}$/.test(raw)) return null;
  const limit = Number(raw);
  // Proof: with the maximum check removed, `reads a limit from 1 to 100, …`
  // (claim-history.test.ts) read 101 as a limit; watched 2026-10-24.
  return limit < 1 || limit > CLAIM_HISTORY_LIMIT.max ? null : limit;
}

/**
 * Decodes stored `claim` and `release` plan events, newest first as given,
 * with the journal's own decoder ({@link readCommand}). A claim lists the
 * claims its `add_claims` wrote, a release those its `remove_claims` took.
 * The reason is the event's kind, or for a release the `reason` the lease
 * sweep stores beside its command; never the label, which quotes a work
 * item's name.
 *
 * @throws naming the event when its stored command does not decode, names no
 * claim of its kind, or carries a reason the sweep never writes: history is
 * trusted state this process wrote, so it fails the read whole rather than
 * answering a list with a hole in it.
 */
export function decodeClaimEvents(events: readonly PlanEvent[]): DecodedClaimEvent[] {
  // Proof: with an undecodable event skipped instead, `fails the read on a
  // stored command it cannot decode, naming the event` (claim-history.test.ts)
  // answered the rest; watched 2026-10-24.
  return events.map((event) => {
    try {
      return decodeClaimEvent(event);
    } catch (cause) {
      throw new Error(`claim history event ${event.id} cannot be read`, { cause });
    }
  });
}

function decodeClaimEvent(event: PlanEvent): DecodedClaimEvent {
  if (event.kind !== 'claim' && event.kind !== 'release')
    throw new Error(`kind ${event.kind} is not a claim or a release`);
  const command = readCommand(event.after);
  const claims = claimsOf(command, event.kind === 'claim' ? 'add_claims' : 'remove_claims');
  // Proof: with this check removed, the claim event whose command is a
  // `set_frozen` answered with no claims instead of failing the read
  // (claim-history.test.ts); watched 2026-10-24.
  if (claims.length === 0) throw new Error(`its ${command.do} command names no claim`);
  return {
    eventId: event.id,
    at: event.createdAt,
    kind: event.kind,
    // Proof: with the reason read off the label first, `reads a release named
    // like a reap by its stored reason, not its label` (claim-history.test.ts)
    // read `lease_expired`; watched 2026-10-24.
    reason: event.kind === 'claim' ? 'claimed' : releaseReasonOf(event.after),
    claims,
  };
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
    const number = numbers.get(workItemId);
    if (row === undefined || number === undefined) return null;
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
