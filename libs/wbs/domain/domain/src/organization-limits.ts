/**
 * The least and most any organization limit may be (`wbs-organization-limits`
 * L6). There is no unlimited value: a tenant always has a number, and an
 * operator who wants no practical bound sets the most.
 */
export const ORGANIZATION_LIMIT_BOUNDS = { least: 0, most: 1_000_000 } as const;

/** The three caps one organization holds (L1), its own or the deployment default. */
export interface OrganizationLimitValues {
  readonly maxAgentPersons: number;
  readonly maxConcurrentClaims: number;
  /** Applied to each resource separately: the sum of its stated units over the organization's projects (L2). */
  readonly maxCapacityUnitsPerResource: number;
}

/** Where an organization's effective caps came from: its own row, or the deployment default. */
export type OrganizationLimitsSource = 'default' | 'organization';

/** The units of one resource the organization's projects state, summed (L5). */
export interface ResourceCapacityUsage {
  readonly resourceId: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly units: number;
}

/**
 * What an organization holds against each cap (L5): its persons of kind
 * `agent`, its bound claims (distinct work item, person and run triples holding
 * at least one claim row) and, per resource with at least one stated
 * capacity, the stated units summed over its projects, in resource-id order.
 */
export interface OrganizationLimitUsage {
  readonly agentPersons: number;
  readonly concurrentClaims: number;
  readonly capacityUnits: readonly ResourceCapacityUsage[];
}

/** One read of an organization's caps beside its usage, taken in one transaction (L8). */
export interface OrganizationLimitsReading {
  readonly source: OrganizationLimitsSource;
  readonly limits: OrganizationLimitValues;
  readonly usage: OrganizationLimitUsage;
}

/** Whether `value` is a cap an organization may hold: an integer within {@link ORGANIZATION_LIMIT_BOUNDS}. */
export function isOrganizationLimit(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= ORGANIZATION_LIMIT_BOUNDS.least &&
    value <= ORGANIZATION_LIMIT_BOUNDS.most
  );
}

/** What a refused acquisition saw: the cap, what was held, and what it would have added. */
export interface LimitCrossed {
  readonly cap: number;
  readonly current: number;
  readonly added: number;
}

/**
 * **The** limit decision (`wbs-organization-limits` L10): an acquisition of
 * `added` more of a capped thing is refused exactly when `current + added`
 * exceeds `cap`, so reaching the cap is admitted and passing it is not. A
 * count already above a lowered cap refuses every further acquisition (L11).
 * Callers read `current` inside the transaction that writes and ask only when
 * they add something.
 *
 * @throws when `added` is not a positive integer or `cap` or `current` is not
 * a non-negative integer: a caller that adds nothing must not ask.
 *
 * Proof: with `>` replaced by `>=`, `admits the acquisition that reaches the
 * cap exactly` and the property `refuses exactly when current + added exceeds
 * the cap` (organization-limits.test.ts) failed; watched 2026-10-22.
 */
export function refuseLimit(request: LimitCrossed): LimitCrossed | null {
  const { cap, current, added } = request;
  if (!Number.isSafeInteger(added) || added < 1)
    throw new Error(`a limit check must add at least one, not ${String(added)}`);
  if (!Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(current) || current < 0)
    throw new Error(
      `a limit check needs a whole cap and count, not ${String(cap)} and ${String(current)}`,
    );
  return current + added > cap ? { cap, current, added } : null;
}

/**
 * A capacity statement past the organization's cap (L2, L9): the resource,
 * the cap, the units its **other** projects state (`declared`) and the units
 * this project would state (`asked`).
 */
export interface CapacityLimitCrossed {
  readonly resourceId: string;
  readonly cap: number;
  readonly declared: number;
  readonly asked: number;
}

/**
 * Whether a project raising its statement of `resourceId` from `held` units
 * (0 when unstated) to `asked` crosses the organization's cap: {@link refuseLimit}
 * over `declared + asked`, `declared` being every other project's units, so
 * the project's own statement is replaced rather than counted twice. A
 * statement that does not raise (`asked <= held`: restating, lowering, a 0
 * where nothing was stated) is never refused, even above a lowered cap (L11).
 *
 * @throws as {@link refuseLimit} does for a malformed cap or sum, and when
 * `held` or `asked` is not a non-negative integer.
 *
 * Proof, each watched 2026-10-22: with the raise test dropped,
 * `never refuses restating or lowering, even above a lowered cap` and the
 * property failed in organization-limits.test.ts (11 pass, 2 fail), and
 * `applies lowering and restating under a cap lowered below them` with one
 * more in capacity-limit.controller.db.test.ts (9 pass, 2 fail); with `held`
 * added to `declared`, `replaces the project’s own units rather than counting
 * them twice` and the property failed (11 pass, 2 fail).
 */
export function refuseCapacityStatement(request: {
  readonly resourceId: string;
  readonly cap: number;
  readonly declared: number;
  readonly held: number;
  readonly asked: number;
}): CapacityLimitCrossed | null {
  const { resourceId, cap, declared, held, asked } = request;
  if (!Number.isSafeInteger(held) || held < 0 || !Number.isSafeInteger(asked) || asked < 0)
    throw new Error(
      `a capacity statement needs whole units, not ${String(held)} and ${String(asked)}`,
    );
  if (asked <= held) return null;
  const crossed = refuseLimit({ cap, current: declared, added: asked });
  return crossed === null ? null : { resourceId, cap, declared, asked };
}
