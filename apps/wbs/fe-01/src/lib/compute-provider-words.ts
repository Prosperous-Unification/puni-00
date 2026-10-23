import {
  type CapacityReport,
  capacityReportStateOf,
  type ComputeProviderKind,
  STALE_AFTER_CADENCES,
} from '@wbs/domain/compute-provider';

import { unreachable } from '@/lib/http';

/**
 * A provider kind as a person reads it (`compute-providers` P2, P9).
 *
 * @throws When `kind` is not one the contract has, so an impossible kind
 * reaches the Error Boundary rather than an empty chip.
 */
export function providerKindName(kind: ComputeProviderKind): string {
  switch (kind) {
    case 'ssh_host':
      return 'SSH host';
    case 'docker':
      return 'Docker';
    case 'kubernetes':
      return 'Kubernetes';
    case 'puni_pool':
      return 'PUNI pool';
    default:
      // Proof: 2026-10-23, answering `''` here failed `routes an impossible
      // kind to the Error Boundary` in compute-providers-panel.test.tsx.
      return unreachable(kind);
  }
}

/**
 * What the locator of each kind is, for the register form's hint: display
 * text WBS never dials (P2).
 */
export const LOCATOR_HINTS: Readonly<Record<ComputeProviderKind, string>> = {
  ssh_host: 'The SSH user and host Dash reaches it as, such as agent@build-host-1.',
  docker: 'The Docker context Dash runs against, such as default or build-box.',
  kubernetes: 'The kube context and namespace, such as prod/agents. Dash cannot report for it yet.',
  puni_pool: 'A name for the PUNI pool slot. Nothing reports for it yet.',
};

/** `a`, `a and b`, `a, b and c`: names joined as a sentence lists them. */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/**
 * The removal confirmation for an instance that resources still name
 * (`in_use`, P2): every resource the refusal body lists, by name, and what a
 * cascade does to them. No name comes from anywhere but the body.
 */
export function inUseSentence(
  provider: string,
  resources: readonly { readonly name: string }[],
): string {
  const named = listOf(resources.map((resource) => resource.name));
  const one = resources.length === 1;
  return `${provider} fulfils ${named}. Removing it clears ${
    one ? 'that reference' : `all ${String(resources.length)} references`
  } and deletes ${one ? 'its capacity report' : 'their capacity reports'}; no plan changes.`;
}

/** A span of time as a person reads it beside a figure: `45 s`, `2 min`, `3 h`, `2 d`. */
export function spanWords(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${String(hours)} h`;
  return `${String(Math.floor(hours / 24))} d`;
}

/** A count in the resource's own unit, which WBS never converts (A12); a bare count without one. */
export function unitsWords(units: number, unitLabel: string): string {
  return unitLabel === '' ? String(units) : `${String(units)} ${unitLabel}`;
}

/**
 * How the latest capacity report reads now (`compute-providers` P7): a
 * headline and the line under it. `stale` names its boundary, the cadence the
 * reporter promised and the three of them it may miss.
 */
export type ReportReading =
  | { readonly state: 'no_report'; readonly headline: string; readonly detail: string }
  | {
      readonly state: 'measured';
      readonly headline: string;
      readonly detail: string;
      /** The measured capacity, which adopt would state. */
      readonly capacityUnits: number;
    }
  | { readonly state: 'unreachable'; readonly headline: string; readonly detail: string }
  | { readonly state: 'stale'; readonly headline: string; readonly detail: string };

/**
 * Reads `report` at `now`, in the resource's unit. A missing report is
 * `no_report` and never a number. The state is the domain's
 * {@link capacityReportStateOf}, the rule be-01 states the read with, so a
 * section left open goes stale on its own clock without a reread.
 *
 * @throws When the report's outcome is a kind the contract does not have.
 */
export function readReport(
  report: CapacityReport | undefined,
  unitLabel: string,
  now: number,
): ReportReading {
  // Proof: 2026-10-23, reading a missing report as `{ measured 0 }` failed
  // `never reads a missing report as a number` in compute-provider-words.test.ts
  // and `renders no report yet, and no number, for a resource with no report`.
  if (report === undefined)
    return {
      state: 'no_report',
      headline: 'No report yet',
      detail: 'Dash has not reported for this resource.',
    };
  const age = spanWords(now - report.observedAt);
  const cadence = report.cadenceSeconds * 1000;
  // Stale is judged first and whatever the outcome; the outcome's own kind
  // decides the rest, so an impossible kind meets the switch below.
  if (capacityReportStateOf(report, now) === 'stale')
    return {
      state: 'stale',
      headline: `Stale: last report ${age} ago`,
      detail: `Dash reports every ${spanWords(cadence)}; a report is stale after ${spanWords(
        STALE_AFTER_CADENCES * cadence,
      )} (${String(STALE_AFTER_CADENCES)} × cadence). ${lastOutcome(report, unitLabel)}`,
    };
  const outcome = report.outcome;
  switch (outcome.kind) {
    case 'measured':
      return {
        state: 'measured',
        headline: `Measured ${unitsWords(outcome.capacityUnits, unitLabel)}, ${String(
          outcome.usageUnits,
        )} in use`,
        detail: `Observed ${age} ago.`,
        capacityUnits: outcome.capacityUnits,
      };
    case 'unreachable':
      return {
        state: 'unreachable',
        headline: `Unreachable ${age} ago`,
        detail: outcome.reason,
      };
    default:
      // Proof: 2026-10-23, answering `no_report` here failed `routes an
      // impossible report outcome to the Error Boundary` and `throws on an
      // outcome the contract does not have`.
      return unreachable(outcome);
  }
}

/** What the stale report last said, so stale never hides a figure or a reason. */
function lastOutcome(report: CapacityReport, unitLabel: string): string {
  const outcome = report.outcome;
  switch (outcome.kind) {
    case 'measured':
      return `It measured ${unitsWords(outcome.capacityUnits, unitLabel)}, ${String(
        outcome.usageUnits,
      )} in use.`;
    case 'unreachable':
      return `It could not reach the host: ${outcome.reason}`;
    default:
      return unreachable(outcome);
  }
}
