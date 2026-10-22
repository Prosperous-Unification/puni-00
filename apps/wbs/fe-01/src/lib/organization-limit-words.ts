import type {
  CapacityLimitRefusalDetail,
  ClaimLimitRefusalDetail,
  LimitRefusalDetail,
} from '@wbs/contracts';

/**
 * `agent_person_limit` in words (`wbs-organization-limits` L14): the cap, the
 * agents held and how many the write would add, each the refusal body's own.
 */
export function agentPersonLimitSentence(refusal: LimitRefusalDetail): string {
  return `Organization limit: ${String(refusal.current)} of ${String(refusal.cap)} agent persons; adding ${String(refusal.added)} would exceed the cap. Nothing was changed.`;
}

/** `claim_limit` in words: the cap on bound claims and how many the organization holds. */
export function claimLimitSentence(refusal: ClaimLimitRefusalDetail): string {
  return `Organization limit: ${String(refusal.current)} of ${String(refusal.cap)} concurrent claims. Release a claim first. Nothing was changed.`;
}

/**
 * How a capacity refusal names its resource: by `name` when the surface holds
 * the directory's name for `resourceId`, otherwise by the id itself, because
 * no fe-01 surface reads the resource directory yet and a sentence naming no
 * resource would not say which statement to lower.
 */
export function resourceLabel(resourceId: string, name: string | undefined): string {
  return name ?? `resource ${resourceId}`;
}

/**
 * `capacity_limit` in words: the resource, the total the statement would make
 * across the organization's projects against the cap, and the two parts of
 * that total. The total is `declared + asked`, the one number not read off the
 * body as it stands; no number comes from anywhere but the body.
 */
export function capacityLimitSentence(refusal: CapacityLimitRefusalDetail, name?: string): string {
  const total = refusal.declared + refusal.asked;
  return `Organization limit: ${resourceLabel(refusal.resourceId, name)} would declare ${String(total)} of ${String(refusal.cap)} units across your projects (${String(refusal.declared)} stated by your other projects, ${String(refusal.asked)} asked here). Nothing was changed.`;
}
