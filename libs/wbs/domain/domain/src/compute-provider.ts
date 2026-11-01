import type { PersonKind } from './stored-vocabularies';

/**
 * What fulfils a resource's units (`compute-providers` P2, P9): a tenant's SSH
 * host, a Docker context, a Kubernetes context, or a PUNI pool slot WBS
 * records but nothing yet runs.
 */
export const COMPUTE_PROVIDER_KINDS = ['ssh_host', 'docker', 'kubernetes', 'puni_pool'] as const;

export type ComputeProviderKind = (typeof COMPUTE_PROVIDER_KINDS)[number];

/** What a capacity report says happened when the provider was asked (P5). */
export const CAPACITY_REPORT_OUTCOMES = ['measured', 'unreachable'] as const;

export type CapacityReportOutcomeKind = (typeof CAPACITY_REPORT_OUTCOMES)[number];

/**
 * How far ahead of WBS's clock a report's `observedAt` may be (P5): a
 * reporter's clock skew up to this is admitted, beyond it refused.
 */
export const REPORT_FUTURE_TOLERANCE_MS = 5 * 60_000;

/** A report older than this many cadences is `stale` (P7). */
export const STALE_AFTER_CADENCES = 3;

/**
 * What the provider answered: a measurement in the resource's own unit label,
 * never converted by WBS, or the adapter's typed reason it could not reach
 * the host. A measurement may carry `reservedUnits` (`dash-host-jobs` J10):
 * what a host pool's ledger reserves, beside and never inside `usageUnits`;
 * absent, the outcome is the pre-change one byte for byte.
 */
export type CapacityOutcome =
  | {
      readonly kind: 'measured';
      readonly capacityUnits: number;
      readonly usageUnits: number;
      readonly reservedUnits?: number;
    }
  | { readonly kind: 'unreachable'; readonly reason: string };

/** One report as a reporter sends it. */
export interface CapacityReportBody {
  /** Epoch milliseconds, from the reporter's clock. */
  readonly observedAt: number;
  readonly cadenceSeconds: number;
  readonly outcome: CapacityOutcome;
}

/**
 * The latest report of one resource as WBS keeps it: the body, the instance
 * it came through, the agent person whose credential sent it and when WBS
 * stored it.
 */
export interface CapacityReport extends CapacityReportBody {
  readonly providerId: string;
  readonly reportedBy: string;
  readonly reportedAt: number;
}

/**
 * What a report's admission reads, inside the write that stores it: the
 * pinned person's kind, the named instance's organization, and the named
 * resource's organization, provider reference and latest report. Absent
 * rows are null.
 */
export interface CapacityReportFacts {
  readonly personKind: PersonKind;
  readonly provider: { readonly organizationId: string } | null;
  readonly resource: {
    /** Null for a legacy resource no organization owns. */
    readonly organizationId: string | null;
    readonly providerId: string | null;
    readonly stored: CapacityReport | null;
  } | null;
}

/** Why a report is refused, each carrying what its answer names. */
export type CapacityReportRefusal =
  | { readonly kind: 'not_an_agent_principal'; readonly personKind: 'person' }
  | { readonly kind: 'observedAt_in_future'; readonly skewMs: number }
  | { readonly kind: 'unknown_provider' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'provider_mismatch'; readonly providerId: string | null }
  | { readonly kind: 'report_superseded'; readonly storedObservedAt: number };

/**
 * {@link decideCapacityReport}'s answer: refused, the stored report kept
 * because the same body arrived again, or the report to store.
 */
export type CapacityReportDecision =
  | { readonly kind: 'refused'; readonly refusal: CapacityReportRefusal }
  | { readonly kind: 'unchanged'; readonly report: CapacityReport }
  | { readonly kind: 'store'; readonly report: CapacityReport };

/** One report request: who sent it, through which instance, for which resource, when. */
export interface CapacityReportRequest {
  /** The machine credential's organization. */
  readonly organizationId: string;
  /** The machine credential's pinned person. */
  readonly personId: string;
  readonly providerId: string;
  readonly resourceId: string;
  readonly body: CapacityReportBody;
  /** WBS's clock, in epoch milliseconds. */
  readonly now: number;
}

/**
 * Whether a capacity report is admitted (`compute-providers` P5, P6), in the
 * spec's order:
 *
 * 1. The machine credential's pinned person must be an `agent`: a human's key
 *    reporting hardware would hide who ran the reporter.
 * 2. `observedAt` at most {@link REPORT_FUTURE_TOLERANCE_MS} ahead of WBS.
 * 3. The instance must be the credential organization's, else
 *    `unknown_provider`, naming nothing of another tenant (O4).
 * 4. The resource must be the organization's, else `not_found`.
 * 5. The resource must reference this instance, else `provider_mismatch` with
 *    the reference it holds.
 * 6. Latest wins: a newer `observedAt` replaces the stored report; the same
 *    body again keeps it (`unchanged`); anything else not newer is
 *    `report_superseded` with the stored instant. An equal instant carrying
 *    another body is superseded too: the first report of an instant stands.
 *
 * The caller (a route) has already refused every principal that is not a
 * machine credential.
 */
export function decideCapacityReport(
  facts: CapacityReportFacts,
  request: CapacityReportRequest,
): CapacityReportDecision {
  const refused = (refusal: CapacityReportRefusal): CapacityReportDecision => ({
    kind: 'refused',
    refusal,
  });
  // Proof: with this check removed, `refuses a key pinned to a person of kind
  // person` in `compute-provider.test.ts` stored the report; watched 2026-10-22.
  if (facts.personKind !== 'agent')
    return refused({ kind: 'not_an_agent_principal', personKind: 'person' });
  const skewMs = request.body.observedAt - request.now;
  // Proof: with this check removed, `refuses an observedAt beyond the skew
  // tolerance` in `compute-provider.test.ts` stored the report; watched
  // 2026-10-22.
  if (skewMs > REPORT_FUTURE_TOLERANCE_MS) return refused({ kind: 'observedAt_in_future', skewMs });
  // Proof: with the organization comparison removed, `answers another
  // organization's instance unknown_provider` in `compute-provider.test.ts`
  // stored B's report on A's instance; watched 2026-10-22.
  if (facts.provider?.organizationId !== request.organizationId)
    return refused({ kind: 'unknown_provider' });
  if (facts.resource?.organizationId !== request.organizationId)
    return refused({ kind: 'not_found' });
  // Proof: with this check removed, `refuses a resource that names another
  // instance` in `compute-provider.test.ts` stored the report; watched
  // 2026-10-22.
  if (facts.resource.providerId !== request.providerId)
    return refused({ kind: 'provider_mismatch', providerId: facts.resource.providerId });
  const stored = facts.resource.stored;
  const report: CapacityReport = {
    ...request.body,
    providerId: request.providerId,
    reportedBy: request.personId,
    reportedAt: request.now,
  };
  if (stored === null || request.body.observedAt > stored.observedAt)
    return { kind: 'store', report };
  if (isSameReport(stored, report)) return { kind: 'unchanged', report: stored };
  // Proof: with this refusal replaced by `store`, `keeps the newest observedAt
  // over any sequence of reports` in `compute-provider.test.ts` found a
  // decreasing sequence; watched 2026-10-22.
  return refused({ kind: 'report_superseded', storedObservedAt: stored.observedAt });
}

/** Whether `incoming` is `stored` sent again: the same instance, instant, cadence, outcome and sender. */
function isSameReport(stored: CapacityReport, incoming: CapacityReport): boolean {
  return (
    stored.providerId === incoming.providerId &&
    stored.observedAt === incoming.observedAt &&
    stored.cadenceSeconds === incoming.cadenceSeconds &&
    stored.reportedBy === incoming.reportedBy &&
    isSameOutcome(stored.outcome, incoming.outcome)
  );
}

function isSameOutcome(left: CapacityOutcome, right: CapacityOutcome): boolean {
  if (left.kind === 'measured')
    return (
      right.kind === 'measured' &&
      left.capacityUnits === right.capacityUnits &&
      left.usageUnits === right.usageUnits &&
      left.reservedUnits === right.reservedUnits
    );
  return right.kind === 'unreachable' && left.reason === right.reason;
}

/**
 * How a resource's latest report reads now (P7): `no_report` before the first,
 * `stale` once `now - observedAt` exceeds {@link STALE_AFTER_CADENCES} of its
 * cadence (exactly three cadences is not yet stale), else the outcome's kind.
 */
export type CapacityReportState = 'no_report' | 'measured' | 'unreachable' | 'stale';

export function capacityReportStateOf(
  report: CapacityReport | null,
  now: number,
): CapacityReportState {
  if (report === null) return 'no_report';
  // Proof: with `>` made `>=`, `marks stale only past three cadences` in
  // `compute-provider.test.ts` read stale at exactly three; watched 2026-10-22.
  if (now - report.observedAt > STALE_AFTER_CADENCES * report.cadenceSeconds * 1000) return 'stale';
  return report.outcome.kind;
}

/**
 * Declared capacity beside the measured one (P7): what this project states,
 * what the latest report measured and when, and how that report reads now.
 * Nothing here is a planning input; `declared` is the only number a schedule
 * or a claim ever sees, and it is read elsewhere.
 */
export interface CapacityComparison {
  /** This project's stated units, or null when unstated. */
  readonly declared: number | null;
  /** The latest measured capacity, or null when the latest report is not a measurement. */
  readonly measured: number | null;
  /** The latest report's `observedAt`, or null when there is none. */
  readonly measuredAt: number | null;
  readonly state: CapacityReportState;
}

export function compareCapacity(
  declared: number | null,
  report: CapacityReport | null,
  now: number,
): CapacityComparison {
  return {
    declared,
    measured: report?.outcome.kind === 'measured' ? report.outcome.capacityUnits : null,
    measuredAt: report?.observedAt ?? null,
    state: capacityReportStateOf(report, now),
  };
}
